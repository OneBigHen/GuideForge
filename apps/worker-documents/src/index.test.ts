import { FakeModelAdapter, ModelGateway } from '@guideforge/model-gateway';
import { describe, expect, it } from 'vitest';
import { DEFAULT_INTAKE_POLICY, hashBytes, ingest, runExtractionPipeline } from './index.js';

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
      ingest(DEFAULT_INTAKE_POLICY, { ...base, bytes: new Uint8Array(60 * 1024 * 1024) }).verdict
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
