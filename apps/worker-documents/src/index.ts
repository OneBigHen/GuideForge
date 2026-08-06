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
import {
  buildRegions,
  decideOcrRoute,
  detectConflicts,
  detectFormat,
  makeReceipt,
  type CancellationToken,
  type ConversionReceipt,
  type ConvertedSource,
  type MediaSegment,
  type OcrRoute,
  type SourceConflict,
  type TableRegion,
} from '@guideforge/ingestion';
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
  maxSizeBytes: 100 * 1024 * 1024,
  maxPages: 200,
  allowedTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/html',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'audio/mpeg',
    'audio/wav',
    'audio/mp4',
    'audio/ogg',
    'video/mp4',
    'video/webm',
    'video/quicktime',
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

// ---------------------------------------------------------------------------
// Offline deterministic text converter (no Docling install required)
// ---------------------------------------------------------------------------

/**
 * Deterministic, dependency-free converter for plain text and markdown. Also
 * used by the browser path so text sources are fully local-first. Splits into
 * heading/paragraph blocks by line and emits stable structural paths.
 */
export class TextSourceConverter implements DocumentConverter {
  convert(
    bytes: Uint8Array,
    _detectedType: string,
  ): Promise<{ blocks: NormalizedBlock[]; pageCount: number }> {
    const text = new TextDecoder('utf-8').decode(bytes);
    const lines = text.split(/\r?\n/);
    const blocks: NormalizedBlock[] = [];
    let section = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^#{1,3}\s+/.test(trimmed)) {
        section++;
        blocks.push({
          kind: 'heading',
          text: trimmed.replace(/^#{1,3}\s+/, ''),
          structuralPath: `heading:${section}`,
          pageIndex: 0,
        });
        continue;
      }
      const kind: SourceRegion['kind'] = /^[-*]\s+/.test(trimmed) ? 'list-item' : 'paragraph';
      blocks.push({
        kind,
        text: trimmed,
        structuralPath: `heading:${section}/block:${i}`,
        pageIndex: 0,
      });
    }
    return Promise.resolve({ blocks, pageCount: 1 });
  }
}

// ---------------------------------------------------------------------------
// Multimodal pipeline (Phase 05)
// ---------------------------------------------------------------------------

export interface MultimodalConvertResult {
  converted: ConvertedSource;
  blocks: NormalizedBlock[];
}

/**
 * Convert any supported source type to normalized blocks + rich regions
 * (tables/figures/media), routing OCR/vision decisions deterministically.
 * `converterFor` lets callers plug in the real Docling/ASR converters on the
 * companion; the browser/offline path uses `TextSourceConverter` for text and
 * reports image/audio/video for OCR/ASR routing.
 */
export async function convertMultimodal(
  source: SourceDocument,
  bytes: Uint8Array,
  converters: {
    document?: DocumentConverter;
    media?: (
      source: SourceDocument,
      bytes: Uint8Array,
    ) => Promise<{
      mediaSegments: MediaSegment[];
      converted: ConvertedSource;
      blocks?: NormalizedBlock[];
    }>;
  } = {},
): Promise<MultimodalConvertResult> {
  const format = detectFormat(source.originalFilename, bytes.slice(0, 4));
  if (format.kind === 'audio' || format.kind === 'video') {
    if (converters.media) {
      const res = await converters.media(source, bytes);
      return { converted: res.converted, blocks: res.blocks ?? [] };
    }
    // No ASR worker available: deterministic placeholder that records the
    // media segment for later ASR routing (media itself is not text).
    return {
      converted: {
        sourceHash: source.sha256,
        pages: [],
        tables: [],
        figures: [],
        mediaSegments: [
          {
            segmentId: `media-${source.sha256.slice(0, 10)}`,
            sourceHash: source.sha256,
            startSec: 0,
            endSec: 0,
            kind: 'scene',
          },
        ],
        charsPerPage: 0,
        hasTextLayer: false,
        converter: 'asr-pending',
        converterVersion: '0',
      },
      blocks: [],
    };
  }

  const converter = converters.document ?? new TextSourceConverter();
  const { blocks, pageCount } = await converter.convert(bytes, format.mimeType);
  const converted: ConvertedSource = {
    sourceHash: source.sha256,
    pages: groupByPage(blocks, pageCount),
    tables: [],
    figures: [],
    mediaSegments: [],
    charsPerPage: blocks.length > 0 ? estimateCharsPerPage(blocks, pageCount) : 0,
    hasTextLayer: blocks.length > 0,
    converter: converters.document ? 'docling' : 'text-source',
    converterVersion: converters.document ? DOCLING_CONFIG.version : '1',
  };
  return { converted, blocks };
}

function groupByPage(blocks: NormalizedBlock[], pageCount: number): ConvertedSource['pages'] {
  const byPage = new Map<number, NormalizedBlock[]>();
  for (const b of blocks) {
    const list = byPage.get(b.pageIndex) ?? [];
    list.push(b);
    byPage.set(b.pageIndex, list);
  }
  return Array.from({ length: Math.max(1, pageCount) }, (_, p) => ({
    pageIndex: p,
    blocks: (byPage.get(p) ?? []).map((b) => ({
      kind: b.kind,
      text: b.text,
      structuralPath: b.structuralPath,
    })),
  }));
}

function estimateCharsPerPage(blocks: NormalizedBlock[], pageCount: number): number {
  const chars = blocks.reduce((n, b) => n + b.text.length, 0);
  return pageCount > 0 ? Math.ceil(chars / pageCount) : chars;
}

export interface MultimodalResult {
  regions: ChunkedRegion[];
  tables: TableRegion[];
  mediaSegments: MediaSegment[];
  ocrRoute: OcrRoute;
  receipt: ConversionReceipt;
  conflicts: SourceConflict[];
  partial: boolean;
  cancelledReason: string | null;
}

/**
 * Full multimodal intake for one source: detect format, convert, build stable
 * regions, compute OCR route, detect conflicts against existing sources, and
 * emit a versioned receipt. Cancellable with partial results.
 */
export async function ingestMultimodal(args: {
  source: SourceDocument;
  bytes: Uint8Array;
  converters?: {
    document?: DocumentConverter;
    media?: (
      source: SourceDocument,
      bytes: Uint8Array,
    ) => Promise<{
      mediaSegments: MediaSegment[];
      converted: ConvertedSource;
      blocks?: NormalizedBlock[];
    }>;
  };
  existingSources?: { sourceHash: ContentHash; textPreview: string }[];
  pipelineVersion?: string;
  token?: CancellationToken;
  startedAtIso?: string;
}): Promise<MultimodalResult> {
  const {
    source,
    bytes,
    converters,
    existingSources = [],
    pipelineVersion = '1',
    token,
    startedAtIso = new Date().toISOString(),
  } = args;

  const { converted, blocks } = await convertMultimodal(source, bytes, converters);
  const built = buildRegions(converted, pipelineVersion, token);

  const ocrRoute = decideOcrRoute({
    kind: detectFormat(source.originalFilename, bytes.slice(0, 4)).kind,
    hasTextLayer: converted.hasTextLayer,
    charsPerPage: converted.charsPerPage,
    pageCount: Math.max(1, converted.pages.length, source.pageCount),
  });

  const conflicts =
    existingSources.length > 0
      ? detectConflicts([
          {
            sourceHash: source.sha256,
            textPreview: blocks
              .map((b) => b.text)
              .join(' ')
              .slice(0, 8000),
          },
          ...existingSources,
        ])
      : [];

  const status = built.partial
    ? ('partial' as const)
    : token?.cancelled
      ? ('cancelled' as const)
      : ('complete' as const);

  const finishedAtIso = new Date().toISOString();
  const receipt = makeReceipt({
    sourceHash: source.sha256,
    converter: converted.converter,
    converterVersion: converted.converterVersion,
    pipelineVersion,
    status,
    startedAtIso,
    finishedAtIso,
    pages: converted.pages.length,
    regionCount: built.regions.length,
    tableCount: built.tables.length,
    figureCount: built.figures.length,
    mediaSegmentCount: built.mediaSegments.length,
    notes: [
      `ocr-route:${ocrRoute}`,
      ...(conflicts.length > 0 ? [`conflicts:${conflicts.length}`] : []),
    ],
  });

  return {
    regions: built.regions,
    tables: built.tables,
    mediaSegments: built.mediaSegments,
    ocrRoute,
    receipt,
    conflicts,
    partial: built.partial,
    cancelledReason: built.cancelledReason,
  };
}
