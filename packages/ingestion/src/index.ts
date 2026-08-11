/**
 * @guideforge/ingestion — multimodal source intake domain.
 *
 * Framework-independent pipeline decisions for source processing:
 *   - format detection (from filename + magic bytes, not trusting the MIME
 *     header alone);
 *   - OCR routing (text-layer vs OCR vs VLM page fallback);
 *   - conversion receipts (versioned, per-run, cancellable with partial
 *     results);
 *   - tables/figures and media (audio/video) regions with stable IDs;
 *   - prompt-injection isolation for untrusted source text;
 *   - source conflict detection (duplicate/near-duplicate content).
 *
 * Deterministic by design: same bytes + same parameters => same regions,
 * receipts, routes, and conflicts.
 */
import {
  estimateTokens,
  stableRegionId,
  type ChunkedRegion,
  type SourceRegion,
} from '@guideforge/ai-contracts';
import {
  sha256Hex,
  type CanonicalSourceRegion,
  type ContentHash,
  type SourceKind,
} from '@guideforge/domain';
export type {
  CanonicalSource,
  CanonicalSourceRegion,
  SourceKind,
  SourceLocator,
} from '@guideforge/domain';

/** Promote an extracted page region into the canonical project citation shape. */
export function toCanonicalSourceRegion(region: SourceRegion): CanonicalSourceRegion {
  return {
    regionId: region.regionId,
    sourceHash: region.sourceHash,
    locator: { kind: 'page', pageIndex: region.pageIndex },
    structuralPath: region.structuralPath,
    type: region.kind,
    text: region.excerpt,
    contentHash: sha256Hex(new TextEncoder().encode(region.excerpt)) as ContentHash,
    confidence: 1,
  };
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

export interface SourceFormat {
  kind: SourceKind;
  /** Canonical MIME used by the intake policy. */
  mimeType: string;
  extension: string;
  /** Whether content is primarily text-extractable without OCR. */
  textExtractable: boolean;
  /** Whether the format can carry rich media (images/audio/video). */
  mediaCapable: boolean;
}

const EXTENSION_MAP: Record<string, SourceFormat> = {
  pdf: {
    kind: 'pdf',
    mimeType: 'application/pdf',
    extension: '.pdf',
    textExtractable: true,
    mediaCapable: true,
  },
  docx: {
    kind: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: '.docx',
    textExtractable: true,
    mediaCapable: true,
  },
  pptx: {
    kind: 'pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extension: '.pptx',
    textExtractable: true,
    mediaCapable: true,
  },
  xlsx: {
    kind: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: '.xlsx',
    textExtractable: true,
    mediaCapable: false,
  },
  csv: {
    kind: 'csv',
    mimeType: 'text/csv',
    extension: '.csv',
    textExtractable: true,
    mediaCapable: false,
  },
  html: {
    kind: 'html',
    mimeType: 'text/html',
    extension: '.html',
    textExtractable: true,
    mediaCapable: true,
  },
  txt: {
    kind: 'text',
    mimeType: 'text/plain',
    extension: '.txt',
    textExtractable: true,
    mediaCapable: false,
  },
  md: {
    kind: 'text',
    mimeType: 'text/markdown',
    extension: '.md',
    textExtractable: true,
    mediaCapable: false,
  },
  png: {
    kind: 'image',
    mimeType: 'image/png',
    extension: '.png',
    textExtractable: false,
    mediaCapable: false,
  },
  jpg: {
    kind: 'image',
    mimeType: 'image/jpeg',
    extension: '.jpg',
    textExtractable: false,
    mediaCapable: false,
  },
  jpeg: {
    kind: 'image',
    mimeType: 'image/jpeg',
    extension: '.jpeg',
    textExtractable: false,
    mediaCapable: false,
  },
  webp: {
    kind: 'image',
    mimeType: 'image/webp',
    extension: '.webp',
    textExtractable: false,
    mediaCapable: false,
  },
  gif: {
    kind: 'image',
    mimeType: 'image/gif',
    extension: '.gif',
    textExtractable: false,
    mediaCapable: false,
  },
  svg: {
    kind: 'image',
    mimeType: 'image/svg+xml',
    extension: '.svg',
    textExtractable: false,
    mediaCapable: false,
  },
  mp3: {
    kind: 'audio',
    mimeType: 'audio/mpeg',
    extension: '.mp3',
    textExtractable: false,
    mediaCapable: true,
  },
  wav: {
    kind: 'audio',
    mimeType: 'audio/wav',
    extension: '.wav',
    textExtractable: false,
    mediaCapable: true,
  },
  m4a: {
    kind: 'audio',
    mimeType: 'audio/mp4',
    extension: '.m4a',
    textExtractable: false,
    mediaCapable: true,
  },
  ogg: {
    kind: 'audio',
    mimeType: 'audio/ogg',
    extension: '.ogg',
    textExtractable: false,
    mediaCapable: true,
  },
  mp4: {
    kind: 'video',
    mimeType: 'video/mp4',
    extension: '.mp4',
    textExtractable: false,
    mediaCapable: true,
  },
  webm: {
    kind: 'video',
    mimeType: 'video/webm',
    extension: '.webm',
    textExtractable: false,
    mediaCapable: true,
  },
  mov: {
    kind: 'video',
    mimeType: 'video/quicktime',
    extension: '.mov',
    textExtractable: false,
    mediaCapable: true,
  },
  glb: {
    kind: 'unknown',
    mimeType: 'model/gltf-binary',
    extension: '.glb',
    textExtractable: false,
    mediaCapable: false,
  },
};

/** PDF magic bytes: `%PDF-`. */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];
/** ZIP magic (PK..) — used by docx/pptx/xlsx. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const ZIP_MAGIC_EMPTY = [0x50, 0x4b, 0x05, 0x06];

/** Extract a lowercase extension without leading dot, or null. */
export function extensionOf(filename: string): string | null {
  const idx = filename.lastIndexOf('.');
  if (idx < 0 || idx === filename.length - 1) return null;
  return filename.slice(idx + 1).toLowerCase();
}

/**
 * Detect source format. Trusts the file extension first (the browser/OS
 * decides that from content at pick time), then reinforces with magic bytes
 * when available. Never trusts a caller-supplied MIME header alone.
 */
export function detectFormat(filename: string, head: Uint8Array | null): SourceFormat {
  const ext = extensionOf(filename);
  if (!ext)
    return {
      kind: 'unknown',
      mimeType: 'application/octet-stream',
      extension: '',
      textExtractable: false,
      mediaCapable: false,
    };
  const byExt = EXTENSION_MAP[ext];
  if (!byExt)
    return {
      kind: 'unknown',
      mimeType: 'application/octet-stream',
      extension: `.${ext}`,
      textExtractable: false,
      mediaCapable: false,
    };

  // Reinforce with magic bytes when present. A mismatch means the extension
  // lies (e.g. renaming malware to .pdf); downgrade to unknown.
  if (head && head.length >= 4) {
    if (startsWith(head, PDF_MAGIC)) return EXTENSION_MAP.pdf!;
    if (startsWith(head, ZIP_MAGIC) || startsWith(head, ZIP_MAGIC_EMPTY)) {
      // ZIP-based office containers: extension must agree to disambiguate.
      if (ext === 'docx' || ext === 'pptx' || ext === 'xlsx') return byExt;
      return {
        kind: 'unknown',
        mimeType: 'application/zip',
        extension: `.${ext}`,
        textExtractable: false,
        mediaCapable: false,
      };
    }
    // Image/video/audio magic reinforcement: only downgrade on hard mismatch
    // for a handful of well-known signatures.
    if (ext === 'png' && !startsWith(head, [0x89, 0x50, 0x4e, 0x47])) return UNKNOWN;
    if (ext === 'gif' && !startsWith(head, [0x47, 0x49, 0x46, 0x38])) return UNKNOWN;
    if (ext === 'mp3' && !(startsWith(head, [0x49, 0x44, 0x33]) || startsWith(head, [0xff, 0xfb])))
      return UNKNOWN;
    if (ext === 'pdf' && !startsWith(head, PDF_MAGIC)) return UNKNOWN;
  }
  return byExt;
}

const UNKNOWN: SourceFormat = {
  kind: 'unknown',
  mimeType: 'application/octet-stream',
  extension: '',
  textExtractable: false,
  mediaCapable: false,
};

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  for (let i = 0; i < magic.length; i++) if (bytes[i] !== magic[i]) return false;
  return true;
}

/** MIME types the intake policy should allow for a given detected format. */
export function mimeTypeFor(kind: SourceKind): string {
  for (const fmt of Object.values(EXTENSION_MAP)) {
    if (fmt.kind === kind) return fmt.mimeType;
  }
  return 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// OCR routing
// ---------------------------------------------------------------------------

export type OcrRoute = 'text-layer' | 'ocr' | 'vlm-fallback';

export interface OcrRouteInput {
  kind: SourceKind;
  /** Whether the converter reports a real text layer (not blank pages). */
  hasTextLayer: boolean;
  /** Extracted text density: characters per page extracted so far. */
  charsPerPage: number;
  pageCount: number;
}

/**
 * Decide the OCR/vision route deterministically:
 *   - empty or image/video-only sources with no text layer => OCR;
 *   - scanned-style pages (near-zero density) => OCR, escalating to VLM page
 *     fallback when pageCount exceeds a threshold (vision is last resort);
 *   - healthy text layer => text-layer extraction.
 */
export function decideOcrRoute(input: OcrRouteInput): OcrRoute {
  if (!input.hasTextLayer) {
    if (input.pageCount > 8) return 'vlm-fallback';
    return 'ocr';
  }
  const density = input.charsPerPage;
  if (density < 40) {
    if (input.pageCount > 8) return 'vlm-fallback';
    return 'ocr';
  }
  return 'text-layer';
}

// ---------------------------------------------------------------------------
// Conversion receipts (versioned)
// ---------------------------------------------------------------------------

export type ConversionStatus =
  'queued' | 'running' | 'complete' | 'partial' | 'cancelled' | 'failed';

export interface ConversionReceipt {
  receiptId: string;
  sourceHash: ContentHash;
  converter: string;
  converterVersion: string;
  pipelineVersion: string;
  status: ConversionStatus;
  startedAtIso: string;
  finishedAtIso: string;
  durationMs: number;
  pages: number;
  regionCount: number;
  tableCount: number;
  figureCount: number;
  mediaSegmentCount: number;
  notes: string[];
}

export function makeReceipt(args: {
  sourceHash: ContentHash;
  converter: string;
  converterVersion: string;
  pipelineVersion: string;
  status: ConversionStatus;
  startedAtIso: string;
  finishedAtIso: string;
  pages: number;
  regionCount: number;
  tableCount?: number;
  figureCount?: number;
  mediaSegmentCount?: number;
  notes?: string[];
}): ConversionReceipt {
  const started = Date.parse(args.startedAtIso);
  const finished = Date.parse(args.finishedAtIso);
  return {
    receiptId: stableRegionId(
      args.sourceHash,
      0,
      `receipt:${args.converter}:${args.pipelineVersion}`,
    ),
    sourceHash: args.sourceHash,
    converter: args.converter,
    converterVersion: args.converterVersion,
    pipelineVersion: args.pipelineVersion,
    status: args.status,
    startedAtIso: args.startedAtIso,
    finishedAtIso: args.finishedAtIso,
    durationMs:
      Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, finished - started) : 0,
    pages: args.pages,
    regionCount: args.regionCount,
    tableCount: args.tableCount ?? 0,
    figureCount: args.figureCount ?? 0,
    mediaSegmentCount: args.mediaSegmentCount ?? 0,
    notes: args.notes ?? [],
  };
}

// ---------------------------------------------------------------------------
// Tables, figures, and media regions
// ---------------------------------------------------------------------------

/** Bounding box in source pixel/page coordinates. */
export interface BoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TableRegion {
  regionId: string;
  sourceHash: ContentHash;
  pageIndex: number;
  structuralPath: string;
  /** Normalized table content: header row + data rows. */
  header: string[];
  rows: string[][];
  bbox?: BoundingBox;
  /** SHA-256 of the canonical table serialization (deterministic citation). */
  excerptHash: string;
}

export interface FigureRegion {
  regionId: string;
  sourceHash: ContentHash;
  pageIndex: number;
  structuralPath: string;
  caption: string;
  /** Hash of the extracted/rendered page image or embedded figure asset. */
  imageHash?: ContentHash;
  bbox?: BoundingBox;
}

export interface MediaSegment {
  segmentId: string;
  sourceHash: ContentHash;
  /** Start offset in seconds within the media source. */
  startSec: number;
  endSec: number;
  kind: 'speech' | 'scene' | 'keyframe';
  transcript?: string;
  /** Hash of a keyframe image (deterministic selection). */
  keyframeHash?: ContentHash;
}

/** Stable region ID for a table (deterministic across runs). */
export function tableRegionId(
  sourceHash: ContentHash,
  pageIndex: number,
  structuralPath: string,
): string {
  return stableRegionId(sourceHash, pageIndex, `table:${structuralPath}`);
}

/** Stable region ID for a media segment (deterministic across runs). */
export function segmentId(
  sourceHash: ContentHash,
  kind: MediaSegment['kind'],
  startSec: number,
): string {
  return stableRegionId(sourceHash, Math.round(startSec), `media:${kind}:${startSec}`);
}

/** Canonical deterministic table serialization (stable excerpt + hash). */
export function serializeTable(header: string[], rows: string[][]): string {
  const all = [header, ...rows];
  return all.map((r) => r.map((c) => cellSerial(c)).join('\u241E')).join('\u241F');
}

function cellSerial(cell: string): string {
  return cell.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Prompt-injection isolation
// ---------------------------------------------------------------------------

/**
 * Wraps untrusted source text as DATA inside a generated prompt so instruction
 * text inside the source cannot override the system/task instructions.
 * Deterministic. Returns the isolated block plus any flagged instruction-like
 * lines (for surfacing, not blocking — isolation is the control).
 */
export function isolateSourceText(
  sourceHash: ContentHash,
  text: string,
): { block: string; flaggedLines: string[] } {
  const flaggedLines = text
    .split(/\r?\n/)
    .filter((line) => looksLikeInstruction(line))
    .slice(0, 20);
  return {
    block: [`<untrusted-source hash="${sourceHash}">`, text, `</untrusted-source>`].join('\n'),
    flaggedLines,
  };
}

/** Conservative heuristic for instruction-like lines in untrusted content. */
export function looksLikeInstruction(line: string): boolean {
  const norm = line.trim().toLowerCase();
  if (!norm) return false;
  return (
    /^(ignore|disregard|forget|override|forget previous|you are|act as|system:|system prompt|developer:|assistant:|new instructions|do not follow)/.test(
      norm,
    ) || /^#{1,3}\s*(ignore|override|system|instructions)/.test(norm)
  );
}

/**
 * Content-addressed prompt payload. Building the prompt from these blocks
 * guarantees cited excerpts always match the hash-verified region text.
 */
export function promptBlock(sourceHash: ContentHash, region: SourceRegion): string {
  return isolateSourceText(sourceHash, region.excerpt).block;
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

export interface SourceConflict {
  kind: 'duplicate' | 'near-duplicate';
  /** Canonical (first-seen) source hash. */
  canonicalHash: ContentHash;
  /** The other source hash participating in the conflict. */
  otherHash: ContentHash;
  /** Deterministic similarity in [0,1]. */
  similarity: number;
}

/**
 * Detects duplicate and near-duplicate sources by content hash plus a
 * deterministic excerpt-fingerprint overlap. Exact SHA-256 match => duplicate;
 * otherwise Jaccard over 5-gram shingles of the first N normalized lines.
 */
export function detectConflicts(
  sources: { sourceHash: ContentHash; textPreview: string }[],
  maxPreviewChars = 8000,
): SourceConflict[] {
  const conflicts: SourceConflict[] = [];
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const a = sources[i]!;
      const b = sources[j]!;
      if (a.sourceHash === b.sourceHash) {
        conflicts.push({
          kind: 'duplicate',
          canonicalHash: a.sourceHash,
          otherHash: b.sourceHash,
          similarity: 1,
        });
        continue;
      }
      const sim = shingleSimilarity(a.textPreview, b.textPreview, maxPreviewChars);
      if (sim >= 0.8) {
        conflicts.push({
          kind: 'near-duplicate',
          canonicalHash: a.sourceHash,
          otherHash: b.sourceHash,
          similarity: sim,
        });
      }
    }
  }
  return conflicts.sort((x, y) => y.similarity - x.similarity);
}

function shingleSimilarity(a: string, b: string, maxPreviewChars: number): number {
  const normA = normalizePreview(a, maxPreviewChars);
  const normB = normalizePreview(b, maxPreviewChars);
  if (!normA || !normB) return 0;
  const shinglesA = new Set(shingles(normA));
  const shinglesB = new Set(shingles(normB));
  let inter = 0;
  for (const s of shinglesA) if (shinglesB.has(s)) inter++;
  const union = shinglesA.size + shinglesB.size - inter;
  if (union === 0) return 0;
  return inter / union;
}

function normalizePreview(text: string, maxPreviewChars: number): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, maxPreviewChars);
}

function shingles(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i + 5 <= text.length; i++) out.push(text.slice(i, i + 5));
  return out;
}

// ---------------------------------------------------------------------------
// Cancellation + partial results
// ---------------------------------------------------------------------------

export interface CancellationToken {
  readonly cancelled: boolean;
  readonly reason: string | null;
}

export function createCancellationToken(): {
  token: CancellationToken;
  cancel: (reason: string) => void;
} {
  let cancelled = false;
  let reason: string | null = null;
  return {
    token: {
      get cancelled() {
        return cancelled;
      },
      get reason() {
        return reason;
      },
    },
    cancel: (r: string) => {
      cancelled = true;
      reason = r;
    },
  };
}

// ---------------------------------------------------------------------------
// Pipeline orchestration
// ---------------------------------------------------------------------------

export interface ConvertedPage {
  pageIndex: number;
  blocks: {
    kind: SourceRegion['kind'];
    text: string;
    structuralPath: string;
  }[];
  bbox?: BoundingBox;
}

export interface ConvertedSource {
  sourceHash: ContentHash;
  pages: ConvertedPage[];
  tables: TableRegion[];
  figures: FigureRegion[];
  mediaSegments: MediaSegment[];
  /** Real text-layer characters per page (used by OCR routing). */
  charsPerPage: number;
  /** True when the converter found a usable text layer. */
  hasTextLayer: boolean;
  converter: string;
  converterVersion: string;
}

/**
 * Convert a raw source into stable, chunkable regions. Deterministic.
 * If cancelled partway, returns the regions produced so far with
 * `partial: true` and the cancellation reason.
 */
export function buildRegions(
  converted: ConvertedSource,
  pipelineVersion: string,
  token?: CancellationToken,
): {
  regions: ChunkedRegion[];
  tables: TableRegion[];
  figures: FigureRegion[];
  mediaSegments: MediaSegment[];
  partial: boolean;
  cancelledReason: string | null;
} {
  const regions: ChunkedRegion[] = [];
  const tables: TableRegion[] = [];
  const figures: FigureRegion[] = [];
  const mediaSegments: MediaSegment[] = [];

  for (const page of converted.pages) {
    if (token?.cancelled) {
      return {
        regions,
        tables,
        figures,
        mediaSegments,
        partial: true,
        cancelledReason: token.reason,
      };
    }
    for (const block of page.blocks) {
      if (token?.cancelled) {
        return {
          regions,
          tables,
          figures,
          mediaSegments,
          partial: true,
          cancelledReason: token.reason,
        };
      }
      const regionId = stableRegionId(converted.sourceHash, page.pageIndex, block.structuralPath);
      const region: SourceRegion = {
        regionId,
        sourceHash: converted.sourceHash,
        pageIndex: page.pageIndex,
        structuralPath: block.structuralPath,
        excerpt: block.text,
        kind: block.kind,
      };
      regions.push({ region, tokenEstimate: estimateTokens(block.text) });
    }
  }

  if (token?.cancelled) {
    return {
      regions,
      tables,
      figures,
      mediaSegments,
      partial: true,
      cancelledReason: token.reason,
    };
  }
  tables.push(...converted.tables);
  figures.push(...converted.figures);
  mediaSegments.push(...converted.mediaSegments);

  return { regions, tables, figures, mediaSegments, partial: false, cancelledReason: null };
}
