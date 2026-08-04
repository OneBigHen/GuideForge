import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { addTask, closeGuide, createGuide, exportDraft, openGuide } from './guideStore';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

describe('draft package determinism (acceptance gate)', () => {
  it('repeated export of identical state yields an identical package hash', async () => {
    const session = await createGuide('Determinism check');
    await addTask(session, 'Task A');
    await closeGuide(session);

    const s1 = await openGuide(session.guideId);
    const a = await exportDraft(s1);
    await closeGuide(s1);

    const s2 = await openGuide(session.guideId);
    const b = await exportDraft(s2);
    await closeGuide(s2);

    const hashA = await crypto.subtle
      .digest('SHA-256', a.bytes as unknown as BufferSource)
      .then((buf) =>
        Array.from(new Uint8Array(buf))
          .map((x) => x.toString(16).padStart(2, '0'))
          .join(''),
      );
    const hashB = await crypto.subtle
      .digest('SHA-256', b.bytes as unknown as BufferSource)
      .then((buf) =>
        Array.from(new Uint8Array(buf))
          .map((x) => x.toString(16).padStart(2, '0'))
          .join(''),
      );
    expect(hashA).toBe(hashB);
  });
});
