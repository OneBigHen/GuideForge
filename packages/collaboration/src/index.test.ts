import type { GuideCommand } from '@guideforge/commands';
import { GUIDE_COMMAND_TYPES } from '@guideforge/commands';
import type { ContentHash, EntityId } from '@guideforge/domain';
import type { GuideSnapshot } from '@guideforge/guide-schema';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  applyCommandToWorkingGuide,
  createLocalUndoManager,
  createWorkingGuide,
  hydrateWorkingGuide,
  materializeSnapshot,
} from './index.js';

const GUIDE_ID = '123e4567-e89b-42d3-a456-426614174000' as EntityId;
let seq = 0;
function makeCommand(
  commandType: string,
  payload: unknown,
  origin: GuideCommand['origin'],
): GuideCommand {
  seq += 1;
  return {
    commandId: `c-${seq}`,
    commandType,
    actorId: 'actor',
    guideId: GUIDE_ID,
    origin,
    occurredAt: new Date(0).toISOString(),
    payload,
  };
}

function sync(a: Y.Doc, b: Y.Doc) {
  const state = Y.encodeStateAsUpdate(a);
  Y.applyUpdate(b, state);
}

describe('working guide collaboration', () => {
  it('materializes a deterministic snapshot', () => {
    const w = createWorkingGuide(GUIDE_ID, 'Initial');
    const snap = materializeSnapshot(w);
    expect(snap.title).toBe('Initial');
    expect(snap.tasks).toEqual([]);
    expect(snap.lifecycleState).toBe('draft');
  });

  it('two independently updated documents converge', () => {
    const a = createWorkingGuide(GUIDE_ID, 'g');
    const b = createWorkingGuide(GUIDE_ID, 'g');
    const taskId = '11111111-1111-4111-8111-111111111111' as EntityId;

    // A adds a task; B adds a different task concurrently.
    applyCommandToWorkingGuide(
      a,
      makeCommand(GUIDE_COMMAND_TYPES.addTask, { taskId, title: 'from-a' }, 'user'),
    );
    const otherTaskId = '22222222-2222-4222-8222-222222222222' as EntityId;
    applyCommandToWorkingGuide(
      b,
      makeCommand(GUIDE_COMMAND_TYPES.addTask, { taskId: otherTaskId, title: 'from-b' }, 'user'),
    );

    sync(a.doc, b.doc);
    sync(b.doc, a.doc);

    const snapA = materializeSnapshot(a);
    const snapB = materializeSnapshot(b);
    expect(snapA).toEqual(snapB);
    expect(snapA.tasks).toHaveLength(2);
  });

  it('local user undo does not undo remote-origin changes', () => {
    const a = createWorkingGuide(GUIDE_ID, 'g');
    const b = createWorkingGuide(GUIDE_ID, 'g');
    const undoA = createLocalUndoManager(a);

    const localTaskId = '11111111-1111-4111-8111-111111111111' as EntityId;
    const remoteTaskId = '22222222-2222-4222-8222-222222222222' as EntityId;
    // A adds a task locally; B adds a different task with a remote origin.
    applyCommandToWorkingGuide(
      a,
      makeCommand(GUIDE_COMMAND_TYPES.addTask, { taskId: localTaskId, title: 'local' }, 'user'),
    );
    applyCommandToWorkingGuide(
      b,
      makeCommand(
        GUIDE_COMMAND_TYPES.addTask,
        { taskId: remoteTaskId, title: 'remote' },
        'system-normalization',
      ),
    );

    sync(a.doc, b.doc);
    sync(b.doc, a.doc);

    const before = materializeSnapshot(a);
    expect(before.tasks).toHaveLength(2);

    undoA.undo();
    const after = materializeSnapshot(a);

    // The local task is undone; the remote task must remain untouched.
    expect(after.tasks).toHaveLength(1);
    expect(after.tasks[0]?.taskId).toBe(remoteTaskId);
    expect(after.tasks[0]?.title).toBe('remote');
  });

  it('hydrate then materialize round-trips', () => {
    const w = createWorkingGuide(GUIDE_ID, 'x');
    const taskId = '33333333-3333-4333-8333-333333333333' as EntityId;
    applyCommandToWorkingGuide(
      w,
      makeCommand(GUIDE_COMMAND_TYPES.addTask, { taskId, title: 't' }, 'user'),
    );
    const snap = materializeSnapshot(w);

    const w2 = createWorkingGuide(GUIDE_ID, 'x');
    hydrateWorkingGuide(w2, snap);
    expect(materializeSnapshot(w2)).toEqual(snap);
  });

  it('maps canonical sources and project provenance through Yjs', () => {
    const w = createWorkingGuide(GUIDE_ID, 'source-backed');
    const sourceHash = 'a'.repeat(64) as ContentHash;
    const regionHash = 'b'.repeat(64) as ContentHash;
    const source = {
      sourceId: '123e4567-e89b-42d3-a456-426614174003' as EntityId,
      sha256: sourceHash,
      originalName: 'sop.txt',
      mediaType: 'text/plain',
      kind: 'text' as const,
      sizeBytes: 12,
      pageCount: 1,
      durationMs: null,
      receivedAtIso: '2026-01-01T00:00:00.000Z',
      pipeline: 'text-source',
      pipelineVersion: '1',
      status: 'ready' as const,
      regions: [
        {
          regionId: 'region-1',
          sourceHash,
          locator: { kind: 'page' as const, pageIndex: 0 },
          structuralPath: 'block:1',
          type: 'paragraph',
          text: 'Calibrate.',
          contentHash: regionHash,
          confidence: 1,
        },
      ],
      provenanceReceipt: { pipeline: 'text-source' },
    };
    const snapshot = {
      ...materializeSnapshot(w),
      sources: [source],
      claims: [
        {
          claimId: '123e4567-e89b-42d3-a456-426614174004' as EntityId,
          text: 'Calibrate.',
          kind: 'procedure' as const,
          citationIds: [],
          confidence: 1,
          reviewState: 'draft' as const,
        },
      ],
      citations: [],
      generationRuns: [],
    } satisfies GuideSnapshot;

    hydrateWorkingGuide(w, snapshot);
    expect(w.sources.size).toBe(1);
    expect(materializeSnapshot(w)).toEqual(snapshot);
  });
});
