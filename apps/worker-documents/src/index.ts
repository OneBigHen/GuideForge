/**
 * @guideforge/worker-documents — deterministic document intake pipeline.
 *
 *  1. Intake validation (type/size/pages/encryption/malware).
 *  2. Immutable SHA-256 source hashing.
 *  3. (Docling, pinned) → normalized blocks with reading order.
 *  4. Stable source-region IDs + structural chunking.
 *  5. ModelGateway extraction with citation gate.
 *
 * Docling itself runs as a pinned container (ds4sd/docling); the conversion
 * boundary is isolated behind `DocumentConverter` so tests use deterministic
 * fake blocks and the runtime can use the real worker.
 */
import type {
  ChunkedRegion,
  IntakePolicy,
  SourceDocument,
  SourceRegion,
} from '@guideforge/ai-contracts';
import { evaluateIntake, structuralChunking } from '@guideforge/ai-contracts';
import type { ContentHash, EntityId } from '@guideforge/domain';
import type { ModelGateway, ModelRequest, ModelResponse } from '@guideforge/model-gateway';
import { createHash } from 'node:crypto';

/**
 * Pinned Docling configuration.
 *
 * The recommended deployment is a pinned Python environment (`docling` PyPI
 * package) or the IBM-maintained serving image (`ai/granite-docling`). The
 * verified working setup in this repo is a local venv Python with `docling`
 * installed (see `DoclingConverter`); `DOCLING_PYTHON` selects it.
 */
export const DOCLING_CONFIG = {
  package: 'docling',
  version: '2.118.0',
  image: 'ai/granite-docling',
  ocrBackend: 'disabled (deterministic text-layer extraction)',
  pipeline: 'standard (no OCR, no table structure)',
  language: ['en'],
  executionEnvironment: 'python-venv',
} as const;

export function doclingImageRef(): string {
  return `${DOCLING_CONFIG.image}:latest`;
}

export interface NormalizedBlock {
  kind: SourceRegion['kind'];
  text: string;
  structuralPath: string;
  pageIndex: number;
}

/** Boundary for document → normalized blocks. */
export interface DocumentConverter {
  convert(
    bytes: Uint8Array,
    detectedType: string,
  ): Promise<{ blocks: NormalizedBlock[]; pageCount: number }>;
}

/**
 * Real Docling converter backed by a local Python environment.
 *
 * Runs `python -m docling` (via the configured interpreter) on a temp file
 * and reads back the normalized JSON (text blocks with bounding boxes,
 * reading order, page index, and structural labels). The OCR step is disabled
 * so conversion is deterministic and needs no model downloads; scanned pages
 * are reported as warnings by the caller.
 *
 * Configuration:
 *   DOCLING_PYTHON  — path to the interpreter with `docling` installed
 *                     (defaults to `python3`).
 */
export class DoclingConverter implements DocumentConverter {
  constructor(
    private readonly python: string = process.env.DOCLING_PYTHON ?? 'python3',
    private readonly script = DOCLING_BRIDGE_SCRIPT,
  ) {}

  async convert(
    bytes: Uint8Array,
    detectedType: string,
  ): Promise<{ blocks: NormalizedBlock[]; pageCount: number }> {
    const { execFile } = await import('node:child_process');
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const dir = await mkdtemp(join(tmpdir(), 'gforge-docling-'));
    const inputPath = join(dir, `input${extensionFor(detectedType)}`);
    await writeFile(inputPath, bytes);

    try {
      const output = await new Promise<Uint8Array>((resolve, reject) => {
        execFile(
          this.python,
          ['-c', this.script, inputPath],
          {
            maxBuffer: 64 * 1024 * 1024,
            timeout: 300_000,
            // Disable torch dynamo graph compilation: dramatically faster and
            // deterministic for CPU inference.
            env: { ...process.env, TORCHDYNAMO_DISABLE: '1', DOCLING_DISABLE_TABLE: '1' },
          },
          (err, stdout, stderr) => {
            if (err) {
              // Docling emits deprecation/progress to stderr even on success;
              // only treat a non-zero exit as failure.
              reject(
                new Error(
                  `docling failed (exit ${err.code ?? '?'}): ${stderr.toString().slice(0, 500) || err.message}`,
                ),
              );
              return;
            }
            resolve(stdout as unknown as Uint8Array);
          },
        );
      });
      const parsed = JSON.parse(Buffer.from(output as Buffer).toString('utf8')) as {
        pageCount: number;
        blocks: { kind: string; text: string; path: string; page: number }[];
      };
      return {
        pageCount: parsed.pageCount,
        blocks: parsed.blocks.map((b) => ({
          kind: mapKind(b.kind),
          text: b.text,
          structuralPath: b.path,
          pageIndex: b.page,
        })),
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

/** Deterministic fake converter for offline/dev without a Docling install. */
export class FakeDoclingConverter implements DocumentConverter {
  convert(
    bytes: Uint8Array,
    _detectedType: string,
  ): Promise<{ blocks: NormalizedBlock[]; pageCount: number }> {
    const text = new TextDecoder().decode(bytes);
    // Extract visible ASCII words from the raw bytes as deterministic blocks.
    const words = text.match(/[A-Za-z][A-Za-z0-9 .-]{5,}/g) ?? [];
    const pageCount = 1;
    return Promise.resolve({
      pageCount,
      blocks: words.map((w, i) => ({
        kind: 'paragraph',
        text: w,
        structuralPath: `doc/${i}`,
        pageIndex: 0,
      })),
    });
  }
}

const DOCLING_BRIDGE_SCRIPT = String.raw`
import json, sys
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions

pipeline_options = PdfPipelineOptions()
pipeline_options.do_ocr = False
pipeline_options.do_table_structure = False
conv = DocumentConverter(format_options={
    InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
})
result = conv.convert(sys.argv[1])
blocks = []
for item, level in result.document.iterate_items():
    label = item.label.value if hasattr(item.label, 'value') else str(item.label)
    text = (item.text or '').strip()
    prov = item.prov[0] if item.prov else None
    page = (prov.page_no - 1) if prov and prov.page_no else 0
    if text:
        blocks.append({"kind": label, "text": text, "path": item.parent.origin if hasattr(item.parent, 'origin') else str(len(blocks)), "page": page})
print(json.dumps({"pageCount": len(result.document.pages), "blocks": blocks}), flush=True)
import os
os._exit(0)
`;

function extensionFor(detectedType: string): string {
  if (detectedType.includes('pdf')) return '.pdf';
  if (detectedType.includes('word')) return '.docx';
  return '.pdf';
}

function mapKind(kind: string): SourceRegion['kind'] {
  switch (kind.toLowerCase()) {
    case 'heading':
    case 'section-header':
    case 'page-header':
      return 'heading';
    case 'list-item':
      return 'list-item';
    case 'table':
    case 'table-cell':
      return 'table-row';
    case 'figure':
    case 'figure-caption':
      return 'figure-caption';
    case 'warning':
      return 'warning';
    default:
      return 'paragraph';
  }
}

export const DEFAULT_INTAKE_POLICY: IntakePolicy = {
  maxSizeBytes: 50 * 1024 * 1024,
  maxPages: 200,
  allowedTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
};

export function hashBytes(bytes: Uint8Array): ContentHash {
  return createHash('sha256').update(bytes).digest('hex') as ContentHash;
}

export function ingest(
  policy: IntakePolicy,
  candidate: {
    originalFilename: string;
    detectedType: string;
    bytes: Uint8Array;
    pageCount: number;
    encrypted: boolean;
    malwareStatus: SourceDocument['malwareStatus'];
    actor: string;
    retentionClass: string;
  },
): { source?: SourceDocument; verdict: { accepted: boolean; reason?: string } } {
  const verdict = evaluateIntake(policy, {
    detectedType: candidate.detectedType,
    sizeBytes: candidate.bytes.length,
    pageCount: candidate.pageCount,
    encrypted: candidate.encrypted,
    malwareStatus: candidate.malwareStatus,
  });
  if (!verdict.accepted) return { verdict };
  const source: SourceDocument = {
    sourceId: crypto.randomUUID() as EntityId,
    originalFilename: candidate.originalFilename,
    detectedType: candidate.detectedType,
    sha256: hashBytes(candidate.bytes),
    sizeBytes: candidate.bytes.length,
    pageCount: candidate.pageCount,
    encrypted: candidate.encrypted,
    malwareStatus: candidate.malwareStatus,
    intakeActor: candidate.actor,
    retentionClass: candidate.retentionClass,
    receivedAtIso: new Date().toISOString(),
  };
  return { source, verdict };
}

export interface PipelineInput {
  source: SourceDocument;
  blocks: NormalizedBlock[];
}

export async function runExtractionPipeline(
  input: PipelineInput,
  gateway: ModelGateway,
  promptVersion: string,
): Promise<{ chunks: ChunkedRegion[]; response: ModelResponse }> {
  const byPage = new Map<number, NormalizedBlock[]>();
  for (const block of input.blocks) {
    const list = byPage.get(block.pageIndex) ?? [];
    list.push(block);
    byPage.set(block.pageIndex, list);
  }

  const chunks: ChunkedRegion[] = [];
  const regions = new Map<string, SourceRegion>();
  for (const [pageIndex, blocks] of byPage) {
    const pageChunks = structuralChunking(input.source.sha256, pageIndex, blocks);
    chunks.push(...pageChunks);
    for (const c of pageChunks) regions.set(c.region.regionId, c.region);
  }

  const request: ModelRequest = {
    sourceHash: input.source.sha256,
    chunks: chunks.map((c) => ({
      regionId: c.region.regionId,
      text: c.region.excerpt,
      pageIndex: c.region.pageIndex,
    })),
    regions,
    promptVersion,
    policy: 'default',
  };
  const response = await gateway.run(request);
  return { chunks, response };
}
