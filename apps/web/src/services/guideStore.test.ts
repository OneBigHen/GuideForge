import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  addEvidence,
  addTask,
  closeGuide,
  createGuide,
  exportDraft,
  exportFullBackup,
  importDraft,
  listEvidence,
  listGuides,
  openGuide,
  renameGuide,
} from './guideStore';

// Ensure crypto is available for storage-web (fake-indexeddb + node webcrypto).
Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

describe('guide store local-first workflow', () => {
  it('creates, renames, and lists a guide', async () => {
    const session = await createGuide('Offline draft');
    await renameGuide(session, 'Renamed offline draft');
    await closeGuide(session);

    const guides = await listGuides();
    const entry = guides.find((g) => g.guideId === session.guideId);
    expect(entry?.title).toBe('Renamed offline draft');
  });

  it('reopens a draft after restart (reload offline)', async () => {
    const session = await createGuide('Survives restart');
    await addTask(session, 'Task one');
    await closeGuide(session);

    // Simulate browser restart: reopen from y-indexeddb.
    const reopened = await openGuide(session.guideId);
    expect(reopened.working.guide.get('title')).toBe('Survives restart');
    await closeGuide(reopened);
  });

  it('exports and imports a deterministic draft package', async () => {
    const session = await createGuide('Round trip');
    await addTask(session, 'Task A');
    await closeGuide(session);

    // Reopen so we export from a materialized session, then close it again.
    const exportSession = await openGuide(session.guideId);
    const { bytes } = await exportDraft(exportSession);
    await closeGuide(exportSession);
    expect(bytes.length).toBeGreaterThan(0);

    const imported = await importDraft(bytes);
    expect(imported.guideId).toBe(session.guideId);
    const reopened = await openGuide(imported.guideId);
    expect(reopened.working.guide.get('title')).toBe('Round trip');
    await closeGuide(reopened);
  });

  it('restores a full backup including evidence and reports', async () => {
    const session = await createGuide('Restorable project');
    const asset = await session.assets.put(new Uint8Array([9, 8, 7]), 'image/png', 'png');
    await addEvidence({
      guideId: session.guideId,
      stepId: 'step-1',
      kind: 'photo',
      assetHash: asset.hash,
      mimeType: 'image/png',
    });
    await session.db.runtimeBlobs.put({
      id: `${session.guideId}:capture-1`,
      guideId: session.guideId,
      path: 'capture-1',
      bytes: new Uint8Array([6, 5, 4]),
      mimeType: 'image/png',
      extension: 'png',
    });
    const { bytes, filename } = await exportFullBackup(session);
    expect(filename).toContain('-backup.gforge');

    await closeGuide(session);
    await session.db.evidence.clear();
    await session.db.assets.clear();
    await session.db.assetBlobs.clear();
    await session.db.runtimeBlobs.clear();

    const restored = await importDraft(bytes);
    expect(restored.warnings).toEqual([]);
    const evidence = await listEvidence(restored.guideId);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.assetHash).toBe(asset.hash);
    const runtime = await session.db.runtimeBlobs.get(`${restored.guideId}:capture-1`);
    expect(Array.from(runtime?.bytes as Uint8Array)).toEqual([6, 5, 4]);
    const reports = await session.db.reports.where('guideId').equals(restored.guideId).toArray();
    expect(reports.map((report) => report.path)).toEqual(
      expect.arrayContaining([
        'reports/cost.json',
        'reports/generation.json',
        'reports/restore.json',
        'reports/validation.json',
      ]),
    );
  });
});
