/**
 * @guideforge/guide-schema — checked-in JSON Schema for persisted structures.
 *
 * Schema files live under `schemas/` and are the canonical source of truth.
 * Types are derived by hand from those schemas and verified against fixtures.
 * Framework-independent: no React/Node/db imports.
 */

import type {
  CanonicalSource,
  CanonicalSourceRegion,
  ContentHash,
  EntityId,
  GuideLifecycleState,
  SourceKind,
  SourceLocator,
} from '@guideforge/domain';

export const GUIDE_SCHEMA_VERSION = 5;

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
  /** First-class claims grounded in the canonical source/citation graph. */
  claimIds: EntityId[];
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
  kind: 'arrow' | 'label' | 'callout' | 'highlight' | 'path';
  text: string;
  /** Durable mesh-local attachment; targetPoint is retained for v4 readers. */
  attachmentId: EntityId | null;
  /** Semantic anchor reference (nodeId + local point). */
  targetNodeId: EntityId;
  targetPoint: { x: number; y: number; z: number } | null;
  /** Screen-space offset for labels/callouts. */
  offset: { x: number; y: number } | null;
  /** Optional mesh-local path points for path annotations. */
  pathPoints: { x: number; y: number; z: number }[];
  color: string;
}

/** Durable mesh-local anchor referenced by annotations and future planners. */
export interface SceneAnchor {
  anchorId: EntityId;
  nodeId: EntityId;
  label: string;
  localPoint: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number } | null;
  confidence: number;
}

export type SurfaceAttachmentSource = 'user' | 'raycast' | 'vision' | 'procedural' | 'legacy';
export type SurfaceAttachmentReviewState = 'draft' | 'reviewed' | 'needs-correction';

/** Durable barycentric/mesh-local target that survives node transforms. */
export interface SurfaceAttachment {
  attachmentId: EntityId;
  nodeId: EntityId;
  assetHash: string | null;
  meshName: string | null;
  primitiveIndex: number | null;
  triangleIndex: number | null;
  barycentric: { x: number; y: number; z: number } | null;
  localPoint: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number } | null;
  source: SurfaceAttachmentSource;
  confidence: number;
  reviewState: SurfaceAttachmentReviewState;
}

/** Canonical scene graph — the authoritative scene inside the guide. */
export interface GuideScene {
  nodes: SceneNode[];
  rootOrder: EntityId[];
  layers: SceneLayer[];
  cameras: SceneCamera[];
  measurements: SceneMeasurement[];
  annotations: SceneAnnotation[];
  anchors: SceneAnchor[];
  surfaceAttachments: SurfaceAttachment[];
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
    anchors: [],
    surfaceAttachments: [],
    stepStates: {},
  };
}

/** Normalize a scene from v4 or older working documents into the v5 shape. */
export function migrateSceneToCurrent(value: unknown): GuideScene {
  if (typeof value !== 'object' || value === null) return createEmptyScene();
  const raw = value as Partial<GuideScene>;
  const anchors = Array.isArray(raw.anchors) ? raw.anchors : [];
  const surfaceAttachments = Array.isArray(raw.surfaceAttachments)
    ? raw.surfaceAttachments
    : anchors.map((anchor) => ({
        attachmentId: anchor.anchorId,
        nodeId: anchor.nodeId,
        assetHash: null,
        meshName: null,
        primitiveIndex: null,
        triangleIndex: null,
        barycentric: null,
        localPoint: { ...anchor.localPoint },
        normal: anchor.normal ? { ...anchor.normal } : null,
        source: 'legacy' as const,
        confidence: anchor.confidence,
        reviewState: 'needs-correction' as const,
      }));
  return {
    ...createEmptyScene(),
    ...raw,
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    rootOrder: Array.isArray(raw.rootOrder) ? raw.rootOrder : [],
    layers: Array.isArray(raw.layers) ? raw.layers : createEmptyScene().layers,
    cameras: Array.isArray(raw.cameras) ? raw.cameras : [],
    measurements: Array.isArray(raw.measurements) ? raw.measurements : [],
    annotations: Array.isArray(raw.annotations)
      ? raw.annotations.map((annotation) => ({
          ...annotation,
          attachmentId: annotation.attachmentId ?? null,
          pathPoints: annotation.pathPoints ?? [],
        }))
      : [],
    anchors,
    surfaceAttachments,
    stepStates: raw.stepStates ?? {},
  };
}

// ---------------------------------------------------------------------------
// Training (competencies, objectives, lessons, practice, assessments, mastery)
// ---------------------------------------------------------------------------

export type TrainingCriticality = 'core' | 'important' | 'supporting';

export interface TrainingCitation {
  sourceHash: ContentHash;
  regionId: string;
}

export interface TrainingCompetency {
  competencyId: EntityId;
  title: string;
  description: string;
  objectiveIds: EntityId[];
  citations: TrainingCitation[];
  criticality: TrainingCriticality;
}

export interface LearningObjective {
  objectiveId: EntityId;
  competencyId?: EntityId;
  verb: string;
  target: string;
  conditions: string;
  criterion: string;
  /** Linked procedure step ids. */
  stepIds: EntityId[];
  /** Source region citations (sourceHash + regionId). */
  citations: TrainingCitation[];
  criticality: TrainingCriticality;
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
  /** Explicit feedback shown after the item is scored. */
  feedback?: { correct: string; incorrect: string };
  citations: TrainingCitation[];
  criticality: TrainingCriticality;
  reviewState: 'draft' | 'reviewed';
}

export interface TrainingModule {
  moduleId: EntityId;
  title: string;
  competencyIds?: EntityId[];
  objectiveIds: EntityId[];
  lessonIds: EntityId[];
}

export interface TrainingLesson {
  lessonId: EntityId;
  title: string;
  stepIds: EntityId[];
  objectiveIds: EntityId[];
  activityIds?: EntityId[];
  citations: TrainingCitation[];
}

export interface TrainingActivity {
  activityId: EntityId;
  lessonId: EntityId;
  title: string;
  type: 'instruction' | 'procedure' | 'practice' | 'reflection';
  stepIds: EntityId[];
  objectiveIds: EntityId[];
  itemIds: EntityId[];
  citations: TrainingCitation[];
}

export interface TrainingAssessmentBlueprint {
  blueprintId: EntityId;
  title: string;
  objectiveIds: EntityId[];
  itemIds: EntityId[];
  criticalItemIds: EntityId[];
  passThreshold: number;
  maxAttempts: number;
  citations: TrainingCitation[];
}

export interface TrainingRemediationEdge {
  edgeId: EntityId;
  fromItemId: EntityId;
  toActivityId: EntityId;
  trigger: 'incorrect' | 'low-confidence' | 'incomplete';
  reason: string;
  citations: TrainingCitation[];
}

export interface TrainingMasteryPolicy {
  requiredCriticalItems: number;
  passThreshold: number;
  maxAttempts: number;
  policyVersion?: string;
  requiredObjectiveIds?: EntityId[];
  criticalItemIds?: EntityId[];
  remediationThreshold?: number;
}

export interface TrainingState {
  /** Optional for v4 backward compatibility; generated programs always fill it. */
  competencies?: TrainingCompetency[];
  objectives: LearningObjective[];
  assessmentItems: AssessmentItem[];
  modules: TrainingModule[];
  lessons: TrainingLesson[];
  activities?: TrainingActivity[];
  assessmentBlueprint?: TrainingAssessmentBlueprint;
  remediationEdges?: TrainingRemediationEdge[];
  mastery: TrainingMasteryPolicy;
}

export function createEmptyTraining(): TrainingState {
  return {
    competencies: [],
    objectives: [],
    assessmentItems: [],
    modules: [],
    lessons: [],
    activities: [],
    assessmentBlueprint: {
      blueprintId: 'training-blueprint-empty' as EntityId,
      title: 'Assessment blueprint',
      objectiveIds: [],
      itemIds: [],
      criticalItemIds: [],
      passThreshold: 0.8,
      maxAttempts: 3,
      citations: [],
    },
    remediationEdges: [],
    mastery: {
      requiredCriticalItems: 0,
      passThreshold: 0.8,
      maxAttempts: 3,
      policyVersion: 'mastery-v1',
      requiredObjectiveIds: [],
      criticalItemIds: [],
      remediationThreshold: 0.8,
    },
  };
}

export interface GuideClaim {
  claimId: EntityId;
  text: string;
  kind: 'fact' | 'procedure' | 'warning' | 'value' | 'observation';
  citationIds: EntityId[];
  confidence: number;
  reviewState: 'draft' | 'reviewed' | 'rejected';
}

export interface GuideCitation {
  citationId: EntityId;
  claimId: EntityId;
  sourceHash: ContentHash;
  regionId: string;
  contentHash: ContentHash;
}

export interface GenerationRun {
  runId: EntityId;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  sourceHashes: ContentHash[];
  outputClaimIds: EntityId[];
  status: 'running' | 'complete' | 'partial' | 'failed';
  startedAtIso: string;
  finishedAtIso: string | null;
  receipt: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Sources and provenance
// ---------------------------------------------------------------------------

export type SourceRegion = CanonicalSourceRegion;
export type GuideSource = CanonicalSource;
export type { SourceKind };

/** v3 Dexie source row retained only as an input to the v3 -> v4 migration. */
export interface LegacySourceRecord {
  sourceId: string;
  guideId: string;
  originalFilename: string;
  detectedType: string;
  kind: SourceKind;
  sha256: string;
  sizeBytes: number;
  pageCount: number;
  receivedAtIso: string;
  ocrRoute: string;
  status: 'complete' | 'partial' | 'cancelled' | 'failed' | 'asr-pending';
  receipt: {
    receiptId: string;
    converter: string;
    converterVersion: string;
    pipelineVersion: string;
    durationMs: number;
    regionCount: number;
    tableCount: number;
    figureCount: number;
    mediaSegmentCount: number;
    notes: string[];
    status: string;
    qualityReport?: {
      score: number;
      checks: { name: string; status: string; score: number; details: string }[];
      warnings: string[];
      errors: string[];
    };
    providers?: {
      provider: string;
      version: string;
      status: string;
      checkedAtIso: string;
      details?: Record<string, string | number | boolean>;
      error?: string;
    }[];
    error?: string;
  } | null;
  regions: {
    regionId: string;
    pageIndex: number;
    kind: string;
    excerpt: string;
    structuralPath: string;
    locator?: SourceLocator;
  }[];
  conflicts: { kind: string; canonicalHash: string; otherHash: string; similarity: number }[];
  tables: { regionId: string; pageIndex: number; header: string[]; rows: string[][] }[];
  mediaSegments: {
    segmentId: string;
    startSec: number;
    endSec: number;
    kind: string;
    transcript?: string;
  }[];
}

export interface GuideSnapshot {
  schemaVersion: 5;
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
  claims: GuideClaim[];
  citations: GuideCitation[];
  generationRuns: GenerationRun[];
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
    Array.isArray(v.sources) &&
    Array.isArray(v.claims) &&
    Array.isArray(v.citations) &&
    Array.isArray(v.generationRuns)
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
    Array.isArray(v.anchors) &&
    Array.isArray(v.surfaceAttachments) &&
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
    Array.isArray(v.lessons) &&
    typeof v.mastery === 'object' &&
    v.mastery !== null &&
    (!('competencies' in v) || Array.isArray(v.competencies)) &&
    (!('activities' in v) || Array.isArray(v.activities)) &&
    (!('remediationEdges' in v) || Array.isArray(v.remediationEdges)) &&
    (!('assessmentBlueprint' in v) ||
      (typeof v.assessmentBlueprint === 'object' && v.assessmentBlueprint !== null))
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
    Array.isArray(v.media) &&
    Array.isArray(v.claimIds)
  );
}

export * from './training-interop.js';
export * from './training-runtime.js';
export * from './training.js';

export {
  migrateLegacySourceRecord,
  migrateToCurrent,
  migrationChainComplete,
  registerMigration,
} from './migrations.js';
export type { SchemaMigration } from './migrations.js';

export { compareSnapshots, snapshotsSemanticallyEqual } from './comparison.js';
export type { ComparisonDiff } from './comparison.js';
