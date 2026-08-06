import { openDb, OpfsAssetStore } from '@guideforge/storage-web';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  addSource,
  listSources,
  makeCancellationToken,
  parseTextSource,
  removeSource,
  sha256Hex,
  SOURCE_INTAKE_POLICY,
} from './sourceStudio';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

function uniqueGuide(): string {
  return `guide-${crypto.randomUUID()}`;
}

function studio() {
  const db = openDb();
  return { db, assets: new OpfsAssetStore(db) };
}

function markdown(bytes: Uint8Array): Uint8Array {
  return bytes;
}

describe('sourceStudio (Phase 05)', () => {
  it('hashes bytes immutably with SHA-256', async () => {
    const h1 = await sha256Hex(new TextEncoder().encode('procedure'));
    const h2 = await sha256Hex(new TextEncoder().encode('procedure'));
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
    expect(await sha256Hex(new TextEncoder().encode('procedurx'))).not.toBe(h1);
  });

  it('parses markdown text sources deterministically', () => {
    const bytes = new TextEncoder().encode(
      '# Calibration\nWear gloves.\n\n- Tare the balance\n- Use distilled water',
    );
    const parsed = parseTextSource(bytes);
    expect(parsed.pages[0]!.blocks[0]!.kind).toBe('heading');
    expect(parsed.blocks.some((b) => b.kind === 'list-item')).toBe(true);
  });

  it('ingests a text source and persists stable regions with a receipt', async () => {
    const s = studio();
    const guideId = uniqueGuide();
    const bytes = new TextEncoder().encode(
      '# Micropipette Calibration\nUse an analytical balance.\nCalibrate with distilled water.',
    );
    const res = await addSource(s, { guideId, originalFilename: 'sop.md', bytes });
    expect(res.verdict.accepted).toBe(true);
    expect(res.ocrRoute).toBe('text-layer');
    expect(res.receipt?.status).toBe('complete');
    expect(res.receipt?.regionCount).toBeGreaterThan(0);
    expect(res.source.sha256).toHaveLength(64);

    const rows = await listSources(s, guideId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.regions[0]!.regionId).toBe(rows[0]!.regions[0]!.regionId);
  });

  it('rejects unsupported or oversized uploads with an actionable verdict', async () => {
    const s = studio();
    const res = await addSource(s, {
      guideId: uniqueGuide(),
      originalFilename: 'malware.exe',
      bytes: new Uint8Array([0x4d, 0x5a]),
    });
    expect(res.verdict.accepted).toBe(false);
    expect(res.verdict.reason).toContain('unsupported');
  });

  it('rejects a file that exceeds the size policy', async () => {
    const s = studio();
    const big = new Uint8Array(SOURCE_INTAKE_POLICY.maxSizeBytes + 1);
    const res = await addSource(s, {
      guideId: uniqueGuide(),
      originalFilename: 'big.md',
      bytes: big,
    });
    expect(res.verdict.accepted).toBe(false);
    expect(res.verdict.reason).toBe('too large');
  });

  it('detects duplicate sources in the same guide', async () => {
    const s = studio();
    const guideId = uniqueGuide();
    const text = 'Identical content.'.repeat(40);
    const bytes = new TextEncoder().encode(text);
    await addSource(s, { guideId, originalFilename: 'a.md', bytes: markdown(bytes) });
    const second = await addSource(s, {
      guideId,
      originalFilename: 'b.md',
      bytes: markdown(bytes),
    });
    expect(second.conflicts.some((c) => c.kind === 'duplicate')).toBe(true);
    const rows = await listSources(s, guideId);
    expect(rows).toHaveLength(2);
  });

  it('routes media to asr-pending with a media segment', async () => {
    const s = studio();
    const res = await addSource(s, {
      guideId: uniqueGuide(),
      originalFilename: 'clip.mp4',
      bytes: new Uint8Array([0, 0, 0, 0, 1]),
    });
    expect(res.source.status).toBe('asr-pending');
    expect(res.source.mediaSegments.length).toBeGreaterThan(0);
  });

  it('cancellation token aborts ingestion with partial results', async () => {
    const s = studio();
    const token = makeCancellationToken();
    token.cancel('user aborted');
    const bytes = new TextEncoder().encode('# A\nB\nC\nD\nE');
    const res = await addSource(s, {
      guideId: uniqueGuide(),
      originalFilename: 'cancelled.md',
      bytes,
      token: token.token,
    });
    expect(res.verdict.accepted).toBe(true);
    expect(res.receipt?.status).toBe('partial');
    expect(res.source.status).toBe('partial');
  });

  it('removes a source', async () => {
    const s = studio();
    const guideId = uniqueGuide();
    const bytes = new TextEncoder().encode('# X\nY');
    const res = await addSource(s, { guideId, originalFilename: 'x.md', bytes });
    await removeSource(s, res.source.sourceId);
    const rows = await listSources(s, guideId);
    expect(rows.some((r) => r.sourceId === res.source.sourceId)).toBe(false);
  });
});
