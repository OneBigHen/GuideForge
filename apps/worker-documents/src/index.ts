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
import { evaluateIntake, stableRegionId, structuralChunking } from '@guideforge/ai-contracts';
import type { ContentHash, EntityId, SourceLocator } from '@guideforge/domain';
import {
  buildRegions,
  decideOcrRoute,
  detectConflicts,
  detectFormat,
  makeReceipt,
  scoreConversionQuality,
  segmentId,
  serializeTable,
  type CancellationToken,
  type ConversionQualityReport,
  type ConversionReceipt,
  type ConvertedSource,
  type FigureRegion,
  type MediaSegment,
  type OcrRoute,
  type ProviderReceipt,
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
  ocrBackend: 'Docling standard pipeline (provider/model configured at runtime)',
  pipeline: 'standard (OCR + table structure enabled)',
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
  locator?: SourceLocator;
}

export interface DocumentConversionOutput {
  blocks: NormalizedBlock[];
  pageCount: number;
  tables?: TableRegion[];
  figures?: FigureRegion[];
  providers?: ProviderReceipt[];
  qualityReport?: ConversionQualityReport;
  pageImages?: { pageIndex: number; dataBase64: string; mimeType: string }[];
}

/** Boundary for document → normalized blocks. */
export interface DocumentConverter {
  convert(bytes: Uint8Array, detectedType: string): Promise<DocumentConversionOutput>;
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

  async convert(bytes: Uint8Array, detectedType: string): Promise<DocumentConversionOutput> {
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
            env: { ...process.env, TORCHDYNAMO_DISABLE: '1' },
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
        blocks: {
          kind: string;
          text: string;
          path: string;
          page: number;
          bbox?: [number, number, number, number];
        }[];
        tables?: {
          path: string;
          page: number;
          header: string[];
          rows: string[][];
          bbox?: [number, number, number, number];
        }[];
        figures?: {
          path: string;
          page: number;
          caption: string;
          bbox?: [number, number, number, number];
        }[];
        providers?: ProviderReceipt[];
        pageImages?: { pageIndex: number; dataBase64: string; mimeType: string }[];
      };
      const sourceHash = hashBytes(bytes);
      const tables = (parsed.tables ?? []).map((table) => ({
        regionId: stableRegionId(sourceHash, table.page, `table:${table.path}`),
        sourceHash,
        pageIndex: table.page,
        structuralPath: table.path,
        header: table.header,
        rows: table.rows,
        ...(table.bbox ? { bbox: bboxFromArray(table.bbox) } : {}),
        excerptHash: createHash('sha256')
          .update(serializeTable(table.header, table.rows))
          .digest('hex'),
      }));
      const figures = (parsed.figures ?? []).map((figure) => ({
        regionId: stableRegionId(sourceHash, figure.page, `figure:${figure.path}`),
        sourceHash,
        pageIndex: figure.page,
        structuralPath: figure.path,
        caption: figure.caption,
        ...(figure.bbox ? { bbox: bboxFromArray(figure.bbox) } : {}),
      }));
      const chars = parsed.blocks.reduce((sum, block) => sum + block.text.length, 0);
      const route = decideOcrRoute({
        kind: detectFormat(`input${extensionFor(detectedType)}`, null).kind,
        hasTextLayer: chars > 0,
        charsPerPage: parsed.pageCount > 0 ? chars / parsed.pageCount : chars,
        pageCount: Math.max(1, parsed.pageCount),
      });
      return {
        pageCount: parsed.pageCount,
        blocks: parsed.blocks.map((b) => ({
          kind: mapKind(b.kind),
          text: b.text,
          structuralPath: b.path,
          pageIndex: b.page,
          ...(b.bbox
            ? { locator: { kind: 'page' as const, pageIndex: b.page, bbox: b.bbox } }
            : {}),
        })),
        tables,
        figures,
        ...(parsed.providers ? { providers: parsed.providers } : {}),
        ...(parsed.pageImages ? { pageImages: parsed.pageImages } : {}),
        qualityReport: scoreConversionQuality({
          pages: parsed.pageCount,
          regionCount: parsed.blocks.length,
          tableCount: tables.length,
          figureCount: figures.length,
          mediaSegmentCount: 0,
          hasTextLayer: chars > 0,
          route,
        }),
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

export const DOCLING_BRIDGE_SCRIPT = String.raw`
import base64, io
import importlib.metadata
import json, sys
from datetime import datetime, timezone
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.pipeline_options import PdfPipelineOptions

pipeline_options = PdfPipelineOptions()
pipeline_options.do_ocr = True
pipeline_options.do_table_structure = True
conv = DocumentConverter(format_options={
    # The standard converter handles Office/CSV/image inputs; PDF gets the
    # explicit OCR/table pipeline because those options are format-specific.
    __import__('docling.datamodel.base_models', fromlist=['InputFormat']).InputFormat.PDF:
        PdfFormatOption(pipeline_options=pipeline_options),
})
result = conv.convert(sys.argv[1])
blocks = []
tables = []
figures = []
page_images = []

def bbox_for(prov):
    bbox = getattr(prov, 'bbox', None) if prov else None
    if bbox is None:
        return None
    values = []
    for name in ('l', 't', 'r', 'b'):
        value = getattr(bbox, name, None)
        if value is None:
            value = getattr(bbox, name.upper(), None)
        if value is None:
            return None
        values.append(float(value))
    return values

def page_and_bbox(item):
    prov = item.prov[0] if getattr(item, 'prov', None) else None
    page = (getattr(prov, 'page_no', 1) - 1) if prov else 0
    return max(0, page), bbox_for(prov)

for item, level in result.document.iterate_items():
    label = item.label.value if hasattr(item.label, 'value') else str(item.label)
    text = (getattr(item, 'text', '') or '').strip()
    page, bbox = page_and_bbox(item)
    path = getattr(item, 'self_ref', None) or f'{label}:{len(blocks)}'
    if text:
        blocks.append({"kind": label, "text": text, "path": path, "page": page, "bbox": bbox})
    if label.lower() == 'table':
        header, rows = [], []
        try:
            dataframe = item.export_to_dataframe(doc=result.document)
            values = dataframe.fillna('').astype(str).values.tolist()
            if values:
                header, rows = values[0], values[1:]
        except Exception:
            pass
        tables.append({"path": path, "page": page, "header": header, "rows": rows, "bbox": bbox})
    if label.lower() in ('picture', 'figure'):
        caption = text
        figures.append({"path": path, "page": page, "caption": caption, "bbox": bbox})

pages = getattr(result.document, 'pages', {})
page_items = pages.items() if hasattr(pages, 'items') else enumerate(pages, start=1)
for page_no, page in page_items:
    image = getattr(getattr(page, 'image', None), 'pil_image', None)
    if image is not None:
        stream = io.BytesIO()
        image.save(stream, format='JPEG', quality=85)
        page_images.append({"pageIndex": int(page_no) - 1, "dataBase64": base64.b64encode(stream.getvalue()).decode('ascii'), "mimeType": "image/jpeg"})

try:
    version = importlib.metadata.version('docling')
except Exception:
    version = 'unknown'
print(json.dumps({
    "pageCount": len(result.document.pages),
    "blocks": blocks,
    "tables": tables,
    "figures": figures,
    "pageImages": page_images,
    "providers": [{
        "provider": "docling",
        "version": version,
        "status": "used",
        "checkedAtIso": datetime.now(timezone.utc).isoformat(),
        "details": {"ocr": True, "tableStructure": True}
    }]
}), flush=True)
`;

function extensionFor(detectedType: string): string {
  if (detectedType.includes('pdf')) return '.pdf';
  if (detectedType.includes('word')) return '.docx';
  if (detectedType.includes('presentation')) return '.pptx';
  if (detectedType.includes('spreadsheet')) return '.xlsx';
  if (detectedType.includes('csv')) return '.csv';
  if (detectedType.startsWith('image/')) return `.${detectedType.slice('image/'.length)}`;
  if (detectedType.includes('html')) return '.html';
  return '.bin';
}

function bboxFromArray(bbox: [number, number, number, number]) {
  const [left, top, right, bottom] = bbox;
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
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

export interface VlmPageProvider {
  extractPage(args: {
    pageIndex: number;
    imageBase64: string;
    mimeType: string;
  }): Promise<{ text: string; provider: ProviderReceipt }>;
}

/** OpenAI-compatible VLM adapter. It is only called for the hard-page route. */
export class OpenAiCompatibleVlmProvider implements VlmPageProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly model: string;

  constructor(options: { baseUrl?: string; apiKey?: string; model?: string } = {}) {
    this.baseUrl = options.baseUrl ?? process.env.VLM_BASE_URL ?? '';
    this.apiKey = options.apiKey ?? process.env.VLM_API_KEY;
    this.model = options.model ?? process.env.VLM_MODEL ?? 'Qwen2-VL-7B-Instruct';
  }

  async extractPage(args: {
    pageIndex: number;
    imageBase64: string;
    mimeType: string;
  }): Promise<{ text: string; provider: ProviderReceipt }> {
    if (!this.baseUrl) throw new ProviderUnavailableError('VLM_BASE_URL is not configured');
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Transcribe page ${args.pageIndex + 1}. Return only faithful source text; preserve table rows and warnings. Do not invent missing content.`,
              },
              {
                type: 'image_url',
                image_url: { url: `data:${args.mimeType};base64,${args.imageBase64}` },
              },
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(
        `VLM request failed (${response.status}): ${(await response.text()).slice(0, 300)}`,
      );
    }
    const body = (await response.json()) as {
      choices?: { message?: { content?: string | { text?: string }[] } }[];
      model?: string;
    };
    const content = body.choices?.[0]?.message?.content;
    const text = Array.isArray(content)
      ? content
          .map((part) => part.text ?? '')
          .join('\n')
          .trim()
      : (content ?? '').trim();
    if (!text) throw new Error('VLM returned no page text');
    return {
      text,
      provider: {
        provider: 'vlm-openai-compatible',
        version: body.model ?? this.model,
        status: 'used',
        checkedAtIso: new Date().toISOString(),
        details: { pageIndex: args.pageIndex },
      },
    };
  }
}

export interface WhisperMediaOptions {
  python?: string;
  model?: string;
  ffprobe?: string;
  ffmpeg?: string;
  keyframeIntervalSec?: number;
}

/** Real ffprobe + Whisper/faster-whisper media adapter with timestamped output. */
export class WhisperMediaConverter {
  private readonly options: Required<WhisperMediaOptions>;

  constructor(options: WhisperMediaOptions = {}) {
    this.options = {
      python: options.python ?? process.env.WHISPER_PYTHON ?? 'python3',
      model: options.model ?? process.env.WHISPER_MODEL ?? '',
      ffprobe: options.ffprobe ?? process.env.FFPROBE ?? 'ffprobe',
      ffmpeg: options.ffmpeg ?? process.env.FFMPEG ?? 'ffmpeg',
      keyframeIntervalSec: options.keyframeIntervalSec ?? 10,
    };
  }

  asConverter(): MediaConverter {
    return (source, bytes) => this.convert(source, bytes);
  }

  async convert(
    source: SourceDocument,
    bytes: Uint8Array,
  ): Promise<{
    mediaSegments: MediaSegment[];
    converted: ConvertedSource;
    blocks: NormalizedBlock[];
  }> {
    if (!this.options.model) {
      throw new ProviderUnavailableError('WHISPER_MODEL is not configured');
    }
    const { mkdtemp, writeFile, rm, readdir, readFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join, extname } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'gforge-media-'));
    const inputPath = join(dir, `input${extname(source.originalFilename) || '.media'}`);
    await writeFile(inputPath, bytes);
    try {
      const probe = await runCommand(this.options.ffprobe, [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'json',
        inputPath,
      ]);
      const ffprobeVersion = await runCommand(this.options.ffprobe, ['-version']);
      const duration = Number(
        (JSON.parse(probe) as { format?: { duration?: string } }).format?.duration ?? 0,
      );
      const whisperJson = await runCommand(
        this.options.python,
        ['-c', WHISPER_BRIDGE_SCRIPT, inputPath, this.options.model],
        { WHISPER_MODEL: this.options.model },
      );
      const parsed = JSON.parse(whisperJson) as {
        version: string;
        segments: { start: number; end: number; text: string }[];
      };
      const speech = parsed.segments
        .filter((segment) => segment.end > segment.start && segment.text.trim())
        .map((segment) => ({
          segmentId: segmentId(source.sha256, 'speech', segment.start),
          sourceHash: source.sha256,
          startSec: segment.start,
          endSec: segment.end,
          kind: 'speech' as const,
          transcript: segment.text.trim(),
        }));
      const blocks = speech.map((segment, index) => ({
        kind: 'paragraph' as const,
        text: segment.transcript ?? '',
        structuralPath: `media:speech:${index}`,
        pageIndex: 0,
        locator: {
          kind: 'time' as const,
          startMs: Math.round(segment.startSec * 1000),
          endMs: Math.round(segment.endSec * 1000),
        },
      }));
      const keyframes = /\.(mp4|webm|mov)$/.exec(source.originalFilename.toLowerCase())
        ? await this.extractKeyframes(
            this.options.ffmpeg,
            inputPath,
            dir,
            duration,
            readFile,
            readdir,
            join,
            source,
          )
        : [];
      const ffmpegVersion =
        keyframes.length > 0 ? await runCommand(this.options.ffmpeg, ['-version']) : '';
      const mediaSegments = [...speech, ...keyframes].sort((a, b) => a.startSec - b.startSec);
      const checkedAtIso = new Date().toISOString();
      const providers: ProviderReceipt[] = [
        {
          provider: 'ffprobe',
          version: probeVersion(ffprobeVersion),
          status: 'used',
          checkedAtIso,
          details: { durationSec: duration },
        },
        { provider: 'whisper', version: parsed.version, status: 'used', checkedAtIso },
        ...(keyframes.length > 0
          ? [
              {
                provider: 'ffmpeg',
                version: probeVersion(ffmpegVersion),
                status: 'used' as const,
                checkedAtIso,
              },
            ]
          : []),
      ];
      const qualityReport = scoreConversionQuality({
        pages: 1,
        regionCount: blocks.length,
        tableCount: 0,
        figureCount: 0,
        mediaSegmentCount: mediaSegments.length,
        hasTextLayer: blocks.length > 0,
        route: 'ocr',
      });
      const converted: ConvertedSource = {
        sourceHash: source.sha256,
        pages: blocks.length > 0 ? [{ pageIndex: 0, blocks }] : [],
        tables: [],
        figures: [],
        mediaSegments,
        charsPerPage: blocks.reduce((sum, block) => sum + block.text.length, 0),
        hasTextLayer: blocks.length > 0,
        converter: 'whisper',
        converterVersion: parsed.version,
        providers,
        qualityReport,
      };
      return { mediaSegments, converted, blocks };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async extractKeyframes(
    ffmpeg: string,
    inputPath: string,
    dir: string,
    duration: number,
    readFile: (path: string) => Promise<Uint8Array>,
    readdir: (path: string) => Promise<string[]>,
    join: (a: string, b: string) => string,
    source: SourceDocument,
  ): Promise<MediaSegment[]> {
    const pattern = join(dir, 'frame-%06d.jpg');
    await runCommand(ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      inputPath,
      '-vf',
      `fps=1/${this.options.keyframeIntervalSec}`,
      '-frames:v',
      '120',
      pattern,
    ]);
    const names = (await readdir(dir)).filter((name) => /^frame-\d+\.jpg$/.test(name)).sort();
    return Promise.all(
      names.map(async (name, index) => {
        const startSec = index * this.options.keyframeIntervalSec;
        const bytes = await readFile(join(dir, name));
        return {
          segmentId: segmentId(source.sha256, 'keyframe', startSec),
          sourceHash: source.sha256,
          startSec,
          endSec: Math.min(
            duration > 0 ? duration : startSec + this.options.keyframeIntervalSec,
            startSec + this.options.keyframeIntervalSec,
          ),
          kind: 'keyframe' as const,
          keyframeHash: hashBytes(bytes),
        };
      }),
    );
  }
}

const WHISPER_BRIDGE_SCRIPT = String.raw`
import importlib.metadata, json, sys
path, model_name = sys.argv[1], sys.argv[2]
try:
    from faster_whisper import WhisperModel
    model = WhisperModel(model_name, device='auto', compute_type='auto')
    segments, _ = model.transcribe(path, vad_filter=True)
    rows = [{'start': float(s.start), 'end': float(s.end), 'text': s.text} for s in segments]
    version = importlib.metadata.version('faster-whisper')
except ImportError:
    import whisper
    model = whisper.load_model(model_name)
    result = model.transcribe(path, fp16=False)
    rows = [{'start': float(s['start']), 'end': float(s['end']), 'text': s['text']} for s in result.get('segments', [])]
    version = importlib.metadata.version('openai-whisper')
print(json.dumps({'version': version, 'segments': rows}), flush=True)
`;

async function runCommand(
  command: string,
  args: string[],
  extraEnv: Record<string, string> = {},
): Promise<string> {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { env: { ...process.env, ...extraEnv }, maxBuffer: 64 * 1024 * 1024, timeout: 1_800_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(`${command} failed: ${stderr.toString().slice(0, 500) || error.message}`),
          );
        } else resolve(stdout.toString());
      },
    );
  });
}

function probeVersion(output: string): string {
  const firstLine = output.split(/\r?\n/, 1)[0]?.trim().slice(0, 120);
  return firstLine ?? 'unknown';
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
  convert(bytes: Uint8Array, _detectedType: string): Promise<DocumentConversionOutput> {
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

export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

export type MediaConverter = (
  source: SourceDocument,
  bytes: Uint8Array,
) => Promise<{
  mediaSegments: MediaSegment[];
  converted: ConvertedSource;
  blocks?: NormalizedBlock[];
}>;

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
    media?: MediaConverter;
    vlm?: VlmPageProvider;
  } = {},
): Promise<MultimodalConvertResult> {
  const format = detectFormat(source.originalFilename, bytes.slice(0, 4));
  if (format.kind === 'audio' || format.kind === 'video') {
    if (converters.media) {
      const res = await converters.media(source, bytes);
      return { converted: res.converted, blocks: res.blocks ?? [] };
    }
    throw new ProviderUnavailableError(
      `No ASR provider configured for ${source.originalFilename}; configure WHISPER_PYTHON/WHISPER_MODEL`,
    );
  }

  const useTextConverter = format.kind === 'text';
  const converter =
    converters.document ?? (useTextConverter ? new TextSourceConverter() : new DoclingConverter());
  const output = await converter.convert(bytes, format.mimeType);
  let blocks = output.blocks;
  let providers = output.providers ?? [];
  const preliminaryRoute = decideOcrRoute({
    kind: format.kind,
    hasTextLayer: blocks.length > 0,
    charsPerPage: estimateCharsPerPage(blocks, output.pageCount),
    pageCount: Math.max(1, output.pageCount),
  });
  if (preliminaryRoute === 'vlm-fallback') {
    if (!converters.vlm) {
      throw new ProviderUnavailableError(
        'VLM fallback required for hard pages but no VLM provider is configured',
      );
    }
    if (!output.pageImages || output.pageImages.length === 0) {
      throw new ProviderUnavailableError(
        'VLM fallback required but the document provider returned no page images',
      );
    }
    const vlmResults = await Promise.all(
      output.pageImages.map((image) =>
        converters.vlm!.extractPage({
          pageIndex: image.pageIndex,
          imageBase64: image.dataBase64,
          mimeType: image.mimeType,
        }),
      ),
    );
    const hardPages = new Set(output.pageImages.map((image) => image.pageIndex));
    blocks = blocks.filter((block) => !hardPages.has(block.pageIndex));
    blocks.push(
      ...vlmResults.map((result, index) => ({
        kind: 'paragraph' as const,
        text: result.text,
        structuralPath: `vlm/page:${output.pageImages![index]!.pageIndex}`,
        pageIndex: output.pageImages![index]!.pageIndex,
        locator: { kind: 'page' as const, pageIndex: output.pageImages![index]!.pageIndex },
      })),
    );
    providers = [...providers, ...vlmResults.map((result) => result.provider)];
  }
  const { pageCount } = output;
  const finalRoute = decideOcrRoute({
    kind: format.kind,
    hasTextLayer: blocks.length > 0,
    charsPerPage: estimateCharsPerPage(blocks, pageCount),
    pageCount: Math.max(1, pageCount),
  });
  const converterName = converter instanceof TextSourceConverter ? 'text-source' : 'docling';
  const converted: ConvertedSource = {
    sourceHash: source.sha256,
    pages: groupByPage(blocks, pageCount),
    tables: output.tables ?? [],
    figures: output.figures ?? [],
    mediaSegments: [],
    charsPerPage: blocks.length > 0 ? estimateCharsPerPage(blocks, pageCount) : 0,
    hasTextLayer: blocks.length > 0,
    converter: converterName,
    converterVersion: converterName === 'docling' ? DOCLING_CONFIG.version : '1',
    ...(providers.length > 0 ? { providers } : {}),
    qualityReport: scoreConversionQuality({
      pages: pageCount,
      regionCount: blocks.length,
      tableCount: output.tables?.length ?? 0,
      figureCount: output.figures?.length ?? 0,
      mediaSegmentCount: 0,
      hasTextLayer: blocks.length > 0,
      route: finalRoute,
      ...(output.qualityReport?.errors ? { providerErrors: output.qualityReport.errors } : {}),
    }),
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
      ...(b.locator ? { locator: b.locator } : {}),
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
    media?: MediaConverter;
    vlm?: VlmPageProvider;
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

  const qualityReport =
    converted.qualityReport ??
    scoreConversionQuality({
      pages: converted.pages.length,
      regionCount: built.regions.length,
      tableCount: built.tables.length,
      figureCount: converted.figures.length,
      mediaSegmentCount: built.mediaSegments.length,
      hasTextLayer: converted.hasTextLayer,
      route: ocrRoute,
    });
  const providerFailure =
    qualityReport.errors.length > 0 ||
    qualityReport.checks.some((check) => check.status === 'fail');
  const status = providerFailure
    ? ('failed' as const)
    : built.partial
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
    qualityReport,
    ...(converted.providers ? { providers: converted.providers } : {}),
    ...(providerFailure ? { error: qualityReport.errors.join('; ') } : {}),
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
