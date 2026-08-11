/**
 * @guideforge/guide-schema — checked-in JSON Schema for persisted structures.
 *
 * Schema files live under `schemas/` and are the canonical source of truth.
 * Types are derived by hand from those schemas and verified against fixtures.
 * Framework-independent: no React/Node/db imports.
 */

import type { EntityId, GuideLifecycleState } from '@guideforge/domain';

export const GUIDE_SCHEMA_VERSION = 3;

export interface GuideWarning {
  warningId: EntityId;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export interface GuideTool {
  toolId: EntityId;
  name: string;
}

export interface GuidePart {
  partId: EntityId;
  name: string;
  quantity: number;
}

export interface GuideValue {
  valueId: EntityId;
  label: string;
  value: string;
  unit?: string;
}

export interface GuideCondition {
  conditionId: EntityId;
  text: string;
}

export interface GuideVerification {
  verificationId: EntityId;
  text: string;
}

export interface MediaReference {
  referenceId: EntityId;
  /** SHA-256 of the referenced asset. */
  assetHash: string;
  mimeType: string;
  kind: 'image' | 'video' | 'model' | 'audio';
  caption?: string;
}

export interface GuideStep {
  stepId: EntityId;
  taskId: EntityId;
  /** Structured instruction text (rich text serialized). */
  instructionText: string;
  warnings: GuideWarning[];
  tools: GuideTool[];
  parts: GuidePart[];
  /** Named values with units, grounded in cited source regions (Phase 06). */
  values: GuideValue[];
  /** Branching conditions for the step (Phase 06). */
  conditions: GuideCondition[];
  /** Verification checks that confirm the step was done correctly (Phase 06). */
  verification: GuideVerification[];
  media: MediaReference[];
}

export interface GuideTask {
  taskId: EntityId;
  title: string;
  stepIds: EntityId[];
}

// ---------------------------------------------------------------------------
// Spatial scene (canonical, JSON-safe; no Map in the snapshot)
// ---------------------------------------------------------------------------

export interface SceneTransform {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  scale: { x: number; y: number; z: number };
}

export interface SceneNode {
  nodeId: EntityId;
  name: string;
  parentId: EntityId | null;
  /** SHA-256 of the source asset (GLB/GLTF). */
  assetHash: string | null;
  transform: SceneTransform;
  layerId: string;
  visible: boolean;
  locked: boolean;
  metadata: Record<string, string>;
}

export interface SceneLayer {
  layerId: string;
  name: string;
  visible: boolean;
  locked: boolean;
  color: string;
}

export interface SceneCamera {
  cameraId: EntityId;
  name: string;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  orthographic: boolean;
  zoom: number;
}

export interface SceneMeasurement {
  measurementId: EntityId;
  name: string;
  fromNodeId: EntityId;
  toNodeId: EntityId;
  value: number | null;
}

export interface SceneAnnotation {
  annotationId: EntityId;
  kind: 'arrow' | 'label' | 'callout' | 'highlight';
  text: string;
  /** Semantic anchor reference (nodeId + local point). */
  targetNodeId: EntityId;
  targetPoint: { x: number; y: number; z: number } | null;
  /** Screen-space offset for labels/callouts. */
  offset: { x: number; y: number } | null;
  color: string;
}

/** Canonical scene graph — the authoritative scene inside the guide. */
export interface GuideScene {
  nodes: SceneNode[];
  rootOrder: EntityId[];
  layers: SceneLayer[];
  cameras: SceneCamera[];
  measurements: SceneMeasurement[];
  annotations: SceneAnnotation[];
  /** Scene-state per step (visibility/camera/animation intent). */
  stepStates: Record<string, { visibleNodeIds: EntityId[]; cameraId: EntityId | null }>;
}

export function createEmptyScene(): GuideScene {
  return {
    nodes: [],
    rootOrder: [],
    layers: [
      { layerId: 'default', name: 'Default', visible: true, locked: false, color: '#2dd4bf' },
    ],
    cameras: [],
    measurements: [],
    annotations: [],
    stepStates: {},
  };
}

// ---------------------------------------------------------------------------
// Training (objectives, modules, assessments, mastery)
// ---------------------------------------------------------------------------

export interface LearningObjective {
  objectiveId: EntityId;
  verb: string;
  target: string;
  conditions: string;
  criterion: string;
  /** Linked procedure step ids. */
  stepIds: EntityId[];
  /** Source region citations (sourceHash + regionId). */
  citations: { sourceHash: string; regionId: string }[];
  criticality: 'core' | 'important' | 'supporting';
}

export interface AssessmentItem {
  itemId: EntityId;
  objectiveId: EntityId;
  prompt: string;
  interaction: 'single-choice' | 'multiple-response' | 'ordering' | 'numeric' | 'short-answer';
  options: { optionId: string; text: string }[];
  /** Correct option ids / numeric answer / scoring rule. */
  scoringRule: Record<string, unknown>;
  rationale: string;
  citations: { sourceHash: string; regionId: string }[];
  criticality: 'core' | 'important' | 'supporting';
  reviewState: 'draft' | 'reviewed';
}

export interface TrainingModule {
  moduleId: EntityId;
  title: string;
  objectiveIds: EntityId[];
  lessonIds: EntityId[];
}

export interface TrainingState {
  objectives: LearningObjective[];
  assessmentItems: AssessmentItem[];
  modules: TrainingModule[];
  mastery: { requiredCriticalItems: number; passThreshold: number; maxAttempts: number };
}

export function createEmptyTraining(): TrainingState {
  return {
    objectives: [],
    assessmentItems: [],
    modules: [],
    mastery: { requiredCriticalItems: 0, passThreshold: 0.8, maxAttempts: 3 },
  };
}

// ---------------------------------------------------------------------------
// Sources and provenance
// ---------------------------------------------------------------------------

export interface SourceRegion {
  regionId: string;
  sourceHash: string;
  locator:
    | { kind: 'page'; pageIndex: number; bbox?: [number, number, number, number] }
    | { kind: 'time'; startMs: number; endMs: number }
    | { kind: 'sheet'; sheet: string; range: string }
    | { kind: 'slide'; slideIndex: number; bbox?: [number, number, number, number] };
  structuralPath: string;
  type: string;
  text?: string;
  contentHash: string;
  confidence: number;
}

export interface GuideSource {
  sourceId: EntityId;
  /** SHA-256 of the original source bytes. */
  sha256: string;
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  pageCount: number | null;
  durationMs: number | null;
  pipeline: string;
  pipelineVersion: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  regions: SourceRegion[];
  provenanceReceipt: Record<string, unknown>;
}

export interface GuideSnapshot {
  schemaVersion: 3;
  guideId: EntityId;
  title: string;
  description: string;
  lifecycleState: GuideLifecycleState;
  createdAtIso: string;
  updatedAtIso: string;
  tasks: GuideTask[];
  steps: GuideStep[];
  scene: GuideScene;
  training: TrainingState;
  sources: GuideSource[];
}

export function isGuideSnapshot(value: unknown): value is GuideSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.schemaVersion === GUIDE_SCHEMA_VERSION &&
    typeof v.guideId === 'string' &&
    typeof v.title === 'string' &&
    typeof v.description === 'string' &&
    typeof v.createdAtIso === 'string' &&
    typeof v.updatedAtIso === 'string' &&
    typeof v.lifecycleState === 'string' &&
    Array.isArray(v.tasks) &&
    Array.isArray(v.steps) &&
    typeof v.scene === 'object' &&
    v.scene !== null &&
    typeof v.training === 'object' &&
    v.training !== null &&
    Array.isArray(v.sources)
  );
}

export function isGuideScene(value: unknown): value is GuideScene {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.nodes) &&
    Array.isArray(v.rootOrder) &&
    Array.isArray(v.layers) &&
    Array.isArray(v.cameras) &&
    Array.isArray(v.measurements) &&
    Array.isArray(v.annotations) &&
    typeof v.stepStates === 'object' &&
    v.stepStates !== null
  );
}

export function isTrainingState(value: unknown): value is TrainingState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.objectives) &&
    Array.isArray(v.assessmentItems) &&
    Array.isArray(v.modules) &&
    typeof v.mastery === 'object' &&
    v.mastery !== null
  );
}

export function isGuideTask(value: unknown): value is GuideTask {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.taskId === 'string' && typeof v.title === 'string' && Array.isArray(v.stepIds);
}

export function isGuideStep(value: unknown): value is GuideStep {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.stepId === 'string' &&
    typeof v.taskId === 'string' &&
    typeof v.instructionText === 'string' &&
    Array.isArray(v.warnings) &&
    Array.isArray(v.tools) &&
    Array.isArray(v.parts) &&
    Array.isArray(v.values) &&
    Array.isArray(v.conditions) &&
    Array.isArray(v.verification) &&
    Array.isArray(v.media)
  );
}

export { migrateToCurrent, migrationChainComplete, registerMigration } from './migrations.js';
export type { SchemaMigration } from './migrations.js';

export { compareSnapshots, snapshotsSemanticallyEqual } from './comparison.js';
export type { ComparisonDiff } from './comparison.js';
