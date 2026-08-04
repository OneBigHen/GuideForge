/**
 * Yjs working-document mapping for GuideForge.
 *
 * The active collaborative document is a Y.Doc. Structure:
 *
 *   guide (Y.Map)
 *     ├─ guideId: string
 *     ├─ title: string
 *     ├─ description: string
 *     ├─ lifecycleState: string
 *     ├─ createdAtIso: string
 *     ├─ taskOrder: Y.Array<string>          // ordered task ids
 *     └─ tasks: Y.Map                        // taskId -> Y.Map
 *            ├─ title: string
 *            └─ stepIds: Y.Array<string>
 *
 * Binary assets never enter the Y.Doc (they are content-addressed in OPFS/S3).
 * All changes are made by applying commands inside transactions tagged with
 * the command origin, so Y.UndoManager can track only local user origins.
 */
import type { GuideCommand } from '@guideforge/commands';
import { applyGuideCommand } from '@guideforge/commands';
import type { EntityId, GuideLifecycleState } from '@guideforge/domain';
import type { GuideSnapshot, GuideStep, GuideTask } from '@guideforge/guide-schema';
import * as Y from 'yjs';

/** Origin tag used for all local user commands. */
export const LOCAL_USER_ORIGIN = 'guideforge:local-user';

export interface WorkingGuide {
  doc: Y.Doc;
  guide: Y.Map<unknown>;
  tasks: Y.Map<Y.Map<unknown>>;
  taskOrder: Y.Array<string>;
  steps: Y.Map<Y.Map<unknown>>;
}

export function createWorkingGuide(guideId: EntityId, title: string): WorkingGuide {
  const doc = new Y.Doc();
  seedWorkingGuide(doc, guideId, title);
  return workingGuideFromDoc(doc);
}

/** Seed a bare doc with initial values (for brand-new guides only). */
function seedWorkingGuide(doc: Y.Doc, guideId: EntityId, title: string): void {
  const guide = doc.getMap<unknown>('guide');
  guide.set('guideId', guideId);
  guide.set('title', title);
  guide.set('description', '');
  guide.set('lifecycleState', 'draft');
  guide.set('createdAtIso', new Date(0).toISOString());
  guide.set('updatedAtIso', new Date(0).toISOString());
  doc.getArray<string>('taskOrder');
  doc.getMap<Y.Map<unknown>>('tasks');
  doc.getMap<Y.Map<unknown>>('steps');
}

function workingGuideFromDoc(doc: Y.Doc): WorkingGuide {
  return {
    doc,
    guide: doc.getMap<unknown>('guide'),
    tasks: doc.getMap<Y.Map<unknown>>('tasks'),
    taskOrder: doc.getArray<string>('taskOrder'),
    steps: doc.getMap<Y.Map<unknown>>('steps'),
  };
}

/** Create an empty doc for opening persisted state; seed only if empty. */
export function createEmptyWorkingGuide(): WorkingGuide {
  const doc = new Y.Doc();
  return workingGuideFromDoc(doc);
}

/** Seed defaults into an empty doc (used after confirming no persisted state). */
export function seedEmptyWorkingGuide(
  working: WorkingGuide,
  guideId: EntityId,
  title: string,
): void {
  if (working.guide.size === 0) {
    seedWorkingGuide(working.doc, guideId, title);
  }
}

/** Derive a deterministic canonical snapshot from the working document. */
export function materializeSnapshot(working: WorkingGuide): GuideSnapshot {
  const guideId = working.guide.get('guideId') as string;
  const title = (working.guide.get('title') as string) ?? '';
  const description = (working.guide.get('description') as string) ?? '';
  const lifecycleState = (working.guide.get('lifecycleState') as GuideLifecycleState) ?? 'draft';
  const createdAtIso = (working.guide.get('createdAtIso') as string) ?? new Date(0).toISOString();
  const updatedAtIso = (working.guide.get('updatedAtIso') as string) ?? createdAtIso;

  const tasks: GuideTask[] = [];
  for (const taskId of working.taskOrder.toArray()) {
    const task = working.tasks.get(taskId);
    if (!task) continue;
    tasks.push({
      taskId: taskId as EntityId,
      title: (task.get('title') as string) ?? '',
      stepIds: ((task.get('stepIds') as Y.Array<string>)?.toArray() ?? []) as EntityId[],
    });
  }

  const steps: GuideStep[] = [];
  for (const [stepId, yStep] of working.steps) {
    steps.push({
      stepId: stepId as EntityId,
      taskId: (yStep.get('taskId') as EntityId) ?? ('' as EntityId),
      instructionText: (yStep.get('instructionText') as string) ?? '',
      warnings: ((yStep.get('warnings') as Y.Array<unknown>)?.toArray() ??
        []) as GuideStep['warnings'],
      tools: ((yStep.get('tools') as Y.Array<unknown>)?.toArray() ?? []) as GuideStep['tools'],
      parts: ((yStep.get('parts') as Y.Array<unknown>)?.toArray() ?? []) as GuideStep['parts'],
      media: ((yStep.get('media') as Y.Array<unknown>)?.toArray() ?? []) as GuideStep['media'],
    });
  }

  return {
    schemaVersion: 1,
    guideId: guideId as EntityId,
    title,
    description,
    lifecycleState,
    createdAtIso,
    updatedAtIso,
    tasks,
    steps,
  };
}

/** Hydrate a working document from a canonical snapshot (used on open/import). */
export function hydrateWorkingGuide(working: WorkingGuide, snapshot: GuideSnapshot): void {
  working.doc.transact(() => {
    working.guide.set('guideId', snapshot.guideId);
    working.guide.set('title', snapshot.title);
    working.guide.set('description', snapshot.description);
    working.guide.set('lifecycleState', snapshot.lifecycleState);
    working.guide.set('createdAtIso', snapshot.createdAtIso);
    working.guide.set('updatedAtIso', snapshot.updatedAtIso);
    working.taskOrder.delete(0, working.taskOrder.length);
    working.tasks.clear();
    working.steps.clear();
    for (const task of snapshot.tasks) {
      working.taskOrder.push([task.taskId]);
      const yTask = new Y.Map<unknown>();
      yTask.set('title', task.title);
      const ySteps = new Y.Array<string>();
      ySteps.insert(0, task.stepIds);
      yTask.set('stepIds', ySteps);
      working.tasks.set(task.taskId, yTask);
    }
    for (const step of snapshot.steps) {
      const yStep = new Y.Map<unknown>();
      yStep.set('taskId', step.taskId);
      yStep.set('instructionText', step.instructionText);
      const yWarnings = new Y.Array<unknown>();
      yWarnings.insert(0, step.warnings);
      yStep.set('warnings', yWarnings);
      const yTools = new Y.Array<unknown>();
      yTools.insert(0, step.tools);
      yStep.set('tools', yTools);
      const yParts = new Y.Array<unknown>();
      yParts.insert(0, step.parts);
      yStep.set('parts', yParts);
      const yMedia = new Y.Array<unknown>();
      yMedia.insert(0, step.media);
      yStep.set('media', yMedia);
      working.steps.set(step.stepId, yStep);
    }
  }, 'guideforge:hydrate');
}

/**
 * Apply a command to the working document inside a transaction tagged with
 * `command.origin`. Deterministic materialization then reflects the change.
 */
export function applyCommandToWorkingGuide(working: WorkingGuide, command: GuideCommand): void {
  const before = materializeSnapshot(working);
  const after = applyGuideCommand(before, command);
  // Only mutate the doc when the pure reducer actually changed something.
  if (after === before) return;

  // Tag the transaction with LOCAL_USER_ORIGIN for user-origin commands so the
  // local-only UndoManager tracks them; all other origins are not undoable.
  const txOrigin = command.origin === 'user' ? LOCAL_USER_ORIGIN : command.origin;
  working.doc.transact(() => {
    working.guide.set('title', after.title);
    working.guide.set('description', after.description);
    working.guide.set('lifecycleState', after.lifecycleState);
    working.guide.set('updatedAtIso', after.updatedAtIso);

    // Sync task order and tasks to the derived snapshot.
    working.taskOrder.delete(0, working.taskOrder.length);
    working.taskOrder.insert(
      0,
      after.tasks.map((t) => t.taskId),
    );

    const existing = new Map<string, Y.Map<unknown>>();
    for (const [key, value] of working.tasks) existing.set(key, value);

    for (const task of after.tasks) {
      let yTask = existing.get(task.taskId);
      if (!yTask) {
        yTask = new Y.Map<unknown>();
        yTask.set('stepIds', new Y.Array<string>());
        working.tasks.set(task.taskId, yTask);
      }
      yTask.set('title', task.title);
      const ySteps = yTask.get('stepIds') as Y.Array<string>;
      ySteps.delete(0, ySteps.length);
      ySteps.insert(0, task.stepIds);
      existing.delete(task.taskId);
    }
    // Remove tasks that no longer exist in the snapshot.
    for (const [taskId] of existing) {
      working.tasks.delete(taskId);
    }

    // Sync the steps map to the derived snapshot.
    const existingSteps = new Map<string, Y.Map<unknown>>();
    for (const [key, value] of working.steps) existingSteps.set(key, value);
    for (const step of after.steps) {
      let yStep = existingSteps.get(step.stepId);
      if (!yStep) {
        yStep = new Y.Map<unknown>();
        working.steps.set(step.stepId, yStep);
      }
      yStep.set('taskId', step.taskId);
      yStep.set('instructionText', step.instructionText);
      setYArray(yStep, 'warnings', step.warnings);
      setYArray(yStep, 'tools', step.tools);
      setYArray(yStep, 'parts', step.parts);
      setYArray(yStep, 'media', step.media);
      existingSteps.delete(step.stepId);
    }
    for (const [stepId] of existingSteps) {
      working.steps.delete(stepId);
    }
  }, txOrigin);
}

function setYArray(map: Y.Map<unknown>, key: string, values: unknown[]): void {
  const yArray = map.get(key) as Y.Array<unknown> | undefined;
  if (yArray) {
    yArray.delete(0, yArray.length);
    yArray.insert(0, values);
  } else {
    const fresh = new Y.Array<unknown>();
    fresh.insert(0, values);
    map.set(key, fresh);
  }
}

/** Create a local-user-only undo manager scoped to the working guide. */
export function createLocalUndoManager(working: WorkingGuide): Y.UndoManager {
  const scopes = [
    working.guide,
    working.tasks,
    working.taskOrder,
    working.steps,
    ...Array.from(working.tasks.values()),
    ...Array.from(working.steps.values()),
  ];
  return new Y.UndoManager(scopes, {
    trackedOrigins: new Set([LOCAL_USER_ORIGIN]),
    captureTimeout: 0,
  });
}
