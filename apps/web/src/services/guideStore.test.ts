import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  addTask,
  closeGuide,
  createGuide,
  exportDraft,
  importDraft,
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
});
