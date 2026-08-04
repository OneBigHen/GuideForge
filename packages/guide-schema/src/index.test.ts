import { describe, expect, it } from 'vitest';
import { GUIDE_SCHEMA_VERSION, isGuideSnapshot } from './index.js';

describe('guide-schema', () => {
  it('exposes the schema version', () => {
    expect(GUIDE_SCHEMA_VERSION).toBe(1);
  });

  it('validates a minimal snapshot', () => {
    const snapshot = {
      schemaVersion: 1,
      guideId: 'g1',
      title: 'Test',
      description: '',
      lifecycleState: 'draft',
      createdAtIso: '2026-01-01T00:00:00Z',
      updatedAtIso: '2026-01-01T00:00:00Z',
      tasks: [],
    };
    expect(isGuideSnapshot(snapshot)).toBe(true);
  });

  it('rejects non-snapshots', () => {
    expect(isGuideSnapshot(null)).toBe(false);
    expect(isGuideSnapshot({ schemaVersion: 99 })).toBe(false);
  });
});
