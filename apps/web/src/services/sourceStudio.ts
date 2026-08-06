/**
 * Source Studio service (apps/web, Phase 05).
 *
 * Browser-local multimodal source ingestion: pick files, hash them
 * immutably (SHA-256), detect format, build stable regions via the
 * `@guideforge/ingestion` domain, detect conflicts against sources already
 * in the guide, and persist everything in Dexie (bytes in the content-
 * addressed OPFS store). Text sources convert fully locally; image/audio/
 * video record OCR/ASR route decisions for the companion.
 */
import { evaluateIntake, type IntakePolicy } from '@guideforge/ai-contracts';
import type { ContentHash } from '@guideforge/domain';
import {
  buildRegions,
  createCancellationToken,
  decideOcrRoute,
  detectConflicts,
  detectFormat,
  makeReceipt,
  type CancellationToken,
  type ConvertedSource,
  type MediaSegment,
  type SourceConflict,
  type TableRegion,
} from '@guideforge/ingestion';
import type { GuideForgeDb, OpfsAssetStore, SourceRecord } from '@guideforge/storage-web';

export interface SourceStudio {
  db: GuideForgeDb;
  assets: OpfsAssetStore;
}

export const SOURCE_INTAKE_POLICY: IntakePolicy = {
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

export function sha256Hex(bytes: Uint8Array): Promise<ContentHash> {
  return crypto.subtle.digest('SHA-256', bytes as BufferSource).then(
    (buf) =>
      Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('') as ContentHash,
  );
}

interface ParsedText {
  pages: ConvertedSource['pages'];
  blocks: { text: string; kind: string }[];
}

/**
 * Deterministic browser-side text extraction (markdown + plain text). The
 * companion provides Docling for PDF/DOCX/etc.; text sources work fully
 * offline here.
 */
export function parseTextSource(bytes: Uint8Array): ParsedText {
  const text = new TextDecoder('utf-8').decode(bytes);
  const lines = text.split(/\r?\n/);
  const pages: ConvertedSource['pages'] = [
    {
      pageIndex: 0,
      blocks: [],
    },
  ];
  const blocks: { text: string; kind: string }[] = [];
  let section = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;
    if (/^#{1,3}\s+/.test(trimmed)) {
      section++;
      const text2 = trimmed.replace(/^#{1,3}\s+/, '');
      pages[0]!.blocks.push({
        kind: 'heading',
        text: text2,
        structuralPath: `heading:${section}`,
      });
      blocks.push({ text: text2, kind: 'heading' });
      continue;
    }
    const kind: 'list-item' | 'paragraph' = /^[-*]\s+/.test(trimmed) ? 'list-item' : 'paragraph';
    pages[0]!.blocks.push({
      kind,
      text: trimmed,
      structuralPath: `heading:${section}/block:${i}`,
    });
    blocks.push({ text: trimmed, kind });
  }
  return { pages, blocks };
}

export interface AddSourceInput {
  guideId: string;
  originalFilename: string;
  bytes: Uint8Array;
  token?: CancellationToken;
}

export interface AddSourceResult {
  sourceId: string;
  source: SourceRecord;
  verdict: { accepted: boolean; reason?: string };
  conflicts: SourceConflict[];
  receipt: SourceRecord['receipt'];
  ocrRoute: string;
}

function uuidv4(): string {
  return crypto.randomUUID();
}

/**
 * Ingest one source file into a guide. Immutable hash, format detection,
 * stable regions, OCR route, conflicts, versioned receipt — all persisted.
 */
export async function addSource(
  studio: SourceStudio,
  input: AddSourceInput,
): Promise<AddSourceResult> {
  const format = detectFormat(input.originalFilename, input.bytes.slice(0, 4));
  const sha256 = await sha256Hex(input.bytes);
  const sizeBytes = input.bytes.length;

  const verdict = evaluateIntake(SOURCE_INTAKE_POLICY, {
    detectedType: format.mimeType,
    sizeBytes,
    pageCount: 1,
    encrypted: false,
    malwareStatus: 'clean',
  });
  if (!verdict.accepted) {
    return {
      sourceId: '',
      source: null as unknown as SourceRecord,
      verdict,
      conflicts: [],
      receipt: null,
      ocrRoute: 'text-layer',
    };
  }

  // Store bytes content-addressed (dedupes identical content).
  await studio.assets.put(input.bytes, format.mimeType, format.extension);

  const startedAtIso = new Date().toISOString();
  const isText = format.kind === 'text' || format.kind === 'csv' || format.kind === 'html';
  const textParse = isText ? parseTextSource(input.bytes) : null;

  const converted: ConvertedSource = {
    sourceHash: sha256,
    pages:
      textParse?.pages ??
      (format.kind === 'pdf' ||
      format.kind === 'docx' ||
      format.kind === 'pptx' ||
      format.kind === 'xlsx'
        ? [{ pageIndex: 0, blocks: [] }]
        : []),
    tables: [],
    figures: [],
    mediaSegments:
      format.kind === 'audio' || format.kind === 'video'
        ? ([
            {
              segmentId: `media-${sha256.slice(0, 10)}`,
              sourceHash: sha256,
              startSec: 0,
              endSec: 0,
              kind: 'scene',
            },
          ] as MediaSegment[])
        : [],
    charsPerPage: textParse ? estimateCharsPerPage(textParse.blocks) : 0,
    hasTextLayer: (textParse?.blocks.length ?? 0) > 0,
    converter: isText
      ? 'text-source'
      : format.kind === 'pdf' || format.kind === 'docx'
        ? 'docling'
        : 'asr-pending',
    converterVersion: isText ? '1' : '0',
  };

  const built = buildRegions(converted, '1', input.token);

  const ocrRoute = decideOcrRoute({
    kind: format.kind,
    hasTextLayer: converted.hasTextLayer,
    charsPerPage: converted.charsPerPage,
    pageCount: Math.max(1, converted.pages.length),
  });

  // Conflict detection against existing sources in this guide.
  const existing = await studio.db.sources.where('guideId').equals(input.guideId).toArray();
  const conflicts =
    existing.length > 0
      ? detectConflicts([
          { sourceHash: sha256, textPreview: textPreviewOf(textParse?.blocks) },
          ...existing.map((s) => ({
            sourceHash: s.sha256 as ContentHash,
            textPreview: s.regions
              .map((r) => r.excerpt)
              .join(' ')
              .slice(0, 8000),
          })),
        ])
      : [];

  const finishedAtIso = new Date().toISOString();
  const status = built.partial ? 'partial' : 'complete';
  const receipt = makeReceipt({
    sourceHash: sha256,
    converter: converted.converter,
    converterVersion: converted.converterVersion,
    pipelineVersion: '1',
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

  const record: SourceRecord = {
    sourceId: uuidv4(),
    guideId: input.guideId,
    originalFilename: input.originalFilename,
    detectedType: format.mimeType,
    kind: format.kind,
    sha256,
    sizeBytes,
    pageCount: Math.max(1, converted.pages.length),
    receivedAtIso: startedAtIso,
    ocrRoute,
    status: format.kind === 'audio' || format.kind === 'video' ? 'asr-pending' : status,
    receipt: {
      receiptId: receipt.receiptId,
      converter: receipt.converter,
      converterVersion: receipt.converterVersion,
      pipelineVersion: receipt.pipelineVersion,
      durationMs: receipt.durationMs,
      regionCount: receipt.regionCount,
      tableCount: receipt.tableCount,
      figureCount: receipt.figureCount,
      mediaSegmentCount: receipt.mediaSegmentCount,
      notes: receipt.notes,
      status: receipt.status,
    },
    regions: built.regions.map((c) => ({
      regionId: c.region.regionId,
      pageIndex: c.region.pageIndex,
      kind: c.region.kind,
      excerpt: c.region.excerpt,
      structuralPath: c.region.structuralPath,
    })),
    conflicts,
    tables: built.tables.map((t: TableRegion) => ({
      regionId: t.regionId,
      pageIndex: t.pageIndex,
      header: t.header,
      rows: t.rows,
    })),
    mediaSegments: built.mediaSegments.map((m) => ({
      segmentId: m.segmentId,
      startSec: m.startSec,
      endSec: m.endSec,
      kind: m.kind,
      ...(m.transcript !== undefined ? { transcript: m.transcript } : {}),
    })),
  };

  await studio.db.sources.put(record);
  return { sourceId: record.sourceId, source: record, verdict, conflicts, receipt, ocrRoute };
}

function estimateCharsPerPage(blocks: { text: string }[]): number {
  return blocks.reduce((n, b) => n + b.text.length, 0);
}

function textPreviewOf(blocks: { text: string }[] | undefined): string {
  if (!blocks || blocks.length === 0) return '';
  return blocks
    .map((b) => b.text)
    .join(' ')
    .slice(0, 8000);
}

export async function listSources(studio: SourceStudio, guideId: string): Promise<SourceRecord[]> {
  return studio.db.sources.where('guideId').equals(guideId).reverse().sortBy('receivedAtIso');
}

export async function removeSource(studio: SourceStudio, sourceId: string): Promise<void> {
  await studio.db.sources.delete(sourceId);
}

/** Reusable offline token for cancellation (surfaced in the UI). */
export function makeCancellationToken() {
  return createCancellationToken();
}
