import { describe, expect, it } from 'vitest';
import { GUIDE_SCHEMA_VERSION, isGuideSnapshot } from './index.js';
import { migrateToCurrent, migrationChainComplete } from './migrations.js';

describe('guide-schema', () => {
  it('exposes the schema version', () => {
    expect(GUIDE_SCHEMA_VERSION).toBe(1);
  });

  it('validates a minimal snapshot', () => {
    const snapshot = {
      schemaVersion: 1,
      guideId: '123e4567-e89b-42d3-a456-426614174000',
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

  it('migrates v1 input unchanged', () => {
    const v1 = {
      schemaVersion: 1,
      guideId: '123e4567-e89b-42d3-a456-426614174000',
      title: 'T',
      description: '',
      lifecycleState: 'draft',
      createdAtIso: '2026-01-01T00:00:00Z',
      updatedAtIso: '2026-01-01T00:00:00Z',
      tasks: [],
    };
    const out = migrateToCurrent(v1);
    expect(out.schemaVersion).toBe(1);
    expect(out.title).toBe('T');
  });

  it('rejects unknown schema versions', () => {
    expect(() => migrateToCurrent({ schemaVersion: 99, title: 'x' })).toThrow(
      /no migration from schema version 99/,
    );
  });

  it('migration chain is contiguous', () => {
    expect(migrationChainComplete()).toBe(true);
  });
});
