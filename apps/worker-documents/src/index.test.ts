import { FakeModelAdapter, ModelGateway } from '@guideforge/model-gateway';
import { describe, expect, it } from 'vitest';
import type { DocumentConversionOutput } from './index.js';
import {
  DEFAULT_INTAKE_POLICY,
  hashBytes,
  ingest,
  ingestMultimodal,
  ProviderUnavailableError,
  runExtractionPipeline,
  TextSourceConverter,
  WhisperMediaConverter,
} from './index.js';

describe('worker-documents intake', () => {
  it('hashes bytes immutably', () => {
    expect(hashBytes(new Uint8Array([1, 2, 3]))).toHaveLength(64);
  });

  it('accepts a valid PDF and builds a source document', () => {
    const res = ingest(DEFAULT_INTAKE_POLICY, {
      originalFilename: 'sop.pdf',
      detectedType: 'application/pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pageCount: 2,
      encrypted: false,
      malwareStatus: 'clean',
      actor: 'tester',
      retentionClass: 'standard',
    });
    expect(res.verdict.accepted).toBe(true);
    expect(res.source?.pageCount).toBe(2);
    expect(res.source?.sha256).toHaveLength(64);
  });

  it('rejects an encrypted or oversized source', () => {
    const base = {
      originalFilename: 'x.pdf',
      detectedType: 'application/pdf',
      bytes: new Uint8Array([1]),
      pageCount: 1,
      encrypted: false,
      malwareStatus: 'clean' as const,
      actor: 't',
      retentionClass: 'standard',
    };
    expect(ingest(DEFAULT_INTAKE_POLICY, { ...base, encrypted: true }).verdict.reason).toBe(
      'encrypted',
    );
    expect(
      ingest(DEFAULT_INTAKE_POLICY, { ...base, bytes: new Uint8Array(101 * 1024 * 1024) }).verdict
        .reason,
    ).toBe('too large');
  });
});

describe('worker-documents extraction pipeline', () => {
  it('chunks structurally and returns a cited, validated response', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const source = {
      sourceId: crypto.randomUUID() as never,
      originalFilename: 'sop.pdf',
      detectedType: 'application/pdf',
      sha256: hashBytes(bytes),
      sizeBytes: bytes.length,
      pageCount: 1,
      encrypted: false,
      malwareStatus: 'clean' as const,
      intakeActor: 't',
      retentionClass: 'standard',
      receivedAtIso: new Date().toISOString(),
    };
    const gateway = new ModelGateway([new FakeModelAdapter()]);
    const { chunks, response } = await runExtractionPipeline(
      {
        source,
        blocks: [
          { kind: 'heading', text: 'Calibration', structuralPath: 'h:1', pageIndex: 0 },
          {
            kind: 'paragraph',
            text: 'Disconnect power before opening the housing.',
            structuralPath: 'h:1/p:1',
            pageIndex: 0,
          },
        ],
      },
      gateway,
      'v1',
    );
    expect(chunks).toHaveLength(2);
    expect(response.ok).toBe(true);
    expect(response.citations?.length).toBeGreaterThan(0);
  });

  it('stable region ids are reproducible across identical runs', async () => {
    const bytes = new Uint8Array([9]);
    const source = {
      sourceId: crypto.randomUUID() as never,
      originalFilename: 'a.pdf',
      detectedType: 'application/pdf',
      sha256: hashBytes(bytes),
      sizeBytes: 1,
      pageCount: 1,
      encrypted: false,
      malwareStatus: 'clean' as const,
      intakeActor: 't',
      retentionClass: 'standard',
      receivedAtIso: new Date().toISOString(),
    };
    const blocks = [
      { kind: 'paragraph' as const, text: 'Step one', structuralPath: 'p:1', pageIndex: 0 },
    ];
    const g1 = new ModelGateway([new FakeModelAdapter()]);
    const g2 = new ModelGateway([new FakeModelAdapter()]);
    const r1 = await runExtractionPipeline({ source, blocks }, g1, 'v1');
    const r2 = await runExtractionPipeline({ source, blocks }, g2, 'v1');
    expect(r1.chunks[0]!.region.regionId).toBe(r2.chunks[0]!.region.regionId);
  });
});

describe('worker-documents multimodal ingestion (Phase 05)', () => {
  function textSource(filename: string, text: string) {
    const bytes = new TextEncoder().encode(text);
    return {
      source: {
        sourceId: crypto.randomUUID() as never,
        originalFilename: filename,
        detectedType: 'text/plain',
        sha256: hashBytes(bytes),
        sizeBytes: bytes.length,
        pageCount: 1,
        encrypted: false,
        malwareStatus: 'clean' as const,
        intakeActor: 't',
        retentionClass: 'standard',
        receivedAtIso: new Date().toISOString(),
      },
      bytes,
    };
  }

  it('accepts multimodal types in the intake policy', () => {
    for (const t of [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/html',
      'image/png',
      'audio/mpeg',
      'video/mp4',
    ]) {
      expect(DEFAULT_INTAKE_POLICY.allowedTypes).toContain(t);
    }
  });

  it('converts text sources deterministically with stable regions', async () => {
    const { bytes } = textSource(
      'sop.md',
      '# Calibration\nWear gloves.\n\n- Verify balance is level\n- Tare the weighing boat',
    );
    const converter = new TextSourceConverter();
    const converted = await converter.convert(bytes, 'text/markdown');
    expect(converted.blocks.length).toBeGreaterThanOrEqual(4);
    expect(converted.blocks[0]!.kind).toBe('heading');
    expect(converted.blocks.some((b) => b.kind === 'list-item')).toBe(true);
  });

  it('ingestMultimodal produces a complete receipt and OCR route for text', async () => {
    const { source, bytes } = textSource(
      'sop.md',
      '# Title\nA healthy paragraph of text here.'.repeat(20),
    );
    const res = await ingestMultimodal({
      source,
      bytes,
      converters: { document: new TextSourceConverter() },
      existingSources: [],
      pipelineVersion: '1',
    });
    expect(res.ocrRoute).toBe('text-layer');
    expect(res.receipt.status).toBe('complete');
    expect(res.receipt.regionCount).toBe(res.regions.length);
    expect(res.partial).toBe(false);
    expect(res.conflicts).toHaveLength(0);
  });

  it('detects duplicate sources via conflict detection', async () => {
    const text = 'Identical procedure content.'.repeat(30);
    const { source: s1, bytes: b1 } = textSource('a.md', text);
    const { source: s2, bytes: b2 } = textSource('b.md', text);
    const first = await ingestMultimodal({ source: s1, bytes: b1 });
    const second = await ingestMultimodal({
      source: s2,
      bytes: b2,
      existingSources: [{ sourceHash: s1.sha256, textPreview: new TextDecoder().decode(b1) }],
    });
    expect(second.conflicts.some((c) => c.kind === 'duplicate')).toBe(true);
    expect(first.receipt.sourceHash).toBe(s1.sha256);
  });

  it('cancellation returns partial results with reason', async () => {
    const { source, bytes } = textSource('big.md', 'Paragraph content.'.repeat(5000));
    const token = { cancelled: true, reason: 'user aborted' } as const;
    const res = await ingestMultimodal({ source, bytes, token });
    expect(res.partial).toBe(true);
    expect(res.cancelledReason).toBe('user aborted');
    expect(res.receipt.status).toBe('partial');
  });

  it('media sources fail closed when no ASR provider is configured', async () => {
    const { source, bytes } = textSource('clip.mp4', 'not real media');
    await expect(ingestMultimodal({ source, bytes })).rejects.toThrow(/No ASR provider configured/);
  });

  it('does not complete an OCR route without citable provider output', async () => {
    const { source, bytes } = textSource('scan.pdf', '');
    await expect(ingestMultimodal({ source, bytes })).rejects.toThrow(/docling failed/);
  });

  it('requires a real VLM provider for hard scanned pages', async () => {
    const source = {
      sourceId: crypto.randomUUID() as never,
      originalFilename: 'scan.pdf',
      detectedType: 'application/pdf',
      sha256: hashBytes(new TextEncoder().encode('x')),
      sizeBytes: 1,
      pageCount: 20,
      encrypted: false,
      malwareStatus: 'clean' as const,
      intakeActor: 't',
      retentionClass: 'standard',
      receivedAtIso: new Date().toISOString(),
    };
    await expect(ingestMultimodal({ source, bytes: new Uint8Array([1]) })).rejects.toThrow(
      /docling failed/,
    );
  });

  it('uses a supplied VLM only for a hard-page route and keeps page citations', async () => {
    const source = {
      sourceId: crypto.randomUUID() as never,
      originalFilename: 'scan.pdf',
      detectedType: 'application/pdf',
      sha256: hashBytes(new Uint8Array([7])),
      sizeBytes: 1,
      pageCount: 20,
      encrypted: false,
      malwareStatus: 'clean' as const,
      intakeActor: 't',
      retentionClass: 'standard',
      receivedAtIso: new Date().toISOString(),
    };
    const document: DocumentConversionOutput = {
      pageCount: 20,
      blocks: [],
      pageImages: [{ pageIndex: 0, dataBase64: 'aGVsbG8=', mimeType: 'image/jpeg' }],
    };
    const res = await ingestMultimodal({
      source,
      bytes: new Uint8Array([7]),
      converters: {
        document: { convert: () => Promise.resolve(document) },
        vlm: {
          extractPage: ({ pageIndex }) =>
            Promise.resolve({
              text: `Page ${pageIndex + 1}: disconnect power.`,
              provider: {
                provider: 'test-vlm',
                version: '1',
                status: 'used',
                checkedAtIso: new Date().toISOString(),
              },
            }),
        },
      },
    });
    expect(res.receipt.status).toBe('complete');
    expect(res.regions[0]?.region.locator).toEqual({ kind: 'page', pageIndex: 0 });
    expect(res.receipt.providers?.some((provider) => provider.provider === 'test-vlm')).toBe(true);
  });

  it('does not pretend Whisper is available when its model is absent', async () => {
    const source = textSource('clip.mp4', 'not media').source;
    await expect(
      new WhisperMediaConverter({ model: '' }).convert(source, new Uint8Array([1])),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('multimodal regions are reproducible across runs', async () => {
    const { source, bytes } = textSource(
      'sop.md',
      '# A\nSome body paragraph content that repeats.',
    );
    const a = await ingestMultimodal({
      source,
      bytes,
      converters: { document: new TextSourceConverter() },
    });
    const b = await ingestMultimodal({
      source,
      bytes,
      converters: { document: new TextSourceConverter() },
    });
    expect(a.regions.map((r) => r.region.regionId)).toEqual(
      b.regions.map((r) => r.region.regionId),
    );
    expect(a.receipt.receiptId).toBe(b.receipt.receiptId);
  });
});
