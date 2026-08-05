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

/** Pinned Docling worker configuration (registry image + version). */
export const DOCLING_CONFIG = {
  image: 'ds4sd/docling',
  tag: '2.37.0',
  ocrBackend: 'tesseract',
  pipeline: 'standard',
  language: ['en'],
  executionEnvironment: 'container',
} as const;

export function doclingImageRef(): string {
  return `${DOCLING_CONFIG.image}:${DOCLING_CONFIG.tag}`;
}

export interface NormalizedBlock {
  kind: SourceRegion['kind'];
  text: string;
  structuralPath: string;
  pageIndex: number;
}

/** Boundary for document → normalized blocks (Docling or deterministic fake). */
export interface DocumentConverter {
  convert(
    bytes: Uint8Array,
    detectedType: string,
  ): Promise<{ blocks: NormalizedBlock[]; pageCount: number }>;
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
