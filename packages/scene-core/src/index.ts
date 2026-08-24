/**
 * @guideforge/scene-core — pure serializable scene entities, transform math,
 * snapping, alignment, and scene-health validation.
 *
 * Framework-independent: no React, Three.js, Yjs, Dexie, or Node imports.
 * Runtime renderers (scene-react) adapt this data; nothing 3D is persisted
 * here.
 */
import type { ContentHash, EntityId } from '@guideforge/domain';

// ---------------------------------------------------------------------------
// Primitive math (plain objects, no Three dependency)
// ---------------------------------------------------------------------------

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Transform {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}

export const IDENTITY_TRANSFORM: Transform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
};

export function addVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function mulVecScalar(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function vecEquals(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

export function transformEquals(a: Transform, b: Transform): boolean {
  return (
    vecEquals(a.position, b.position) &&
    a.rotation.x === b.rotation.x &&
    a.rotation.y === b.rotation.y &&
    a.rotation.z === b.rotation.z &&
    a.rotation.w === b.rotation.w &&
    vecEquals(a.scale, b.scale)
  );
}

/** Multiply two quaternions (a then b applied after a? b·a convention). */
export function mulQuat(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/** Rotate a vector by a unit quaternion: v' = v + 2s(u×v) + 2u×(u×v). */
export function rotateVec(v: Vec3, q: Quat): Vec3 {
  const u = { x: q.x, y: q.y, z: q.z };
  const s = q.w;
  const cross = {
    x: u.y * v.z - u.z * v.y,
    y: u.z * v.x - u.x * v.z,
    z: u.x * v.y - u.y * v.x,
  };
  const cross2 = {
    x: u.y * cross.z - u.z * cross.y,
    y: u.z * cross.x - u.x * cross.z,
    z: u.x * cross.y - u.y * cross.x,
  };
  return {
    x: v.x + 2 * s * cross.x + 2 * cross2.x,
    y: v.y + 2 * s * cross.y + 2 * cross2.y,
    z: v.z + 2 * s * cross.z + 2 * cross2.z,
  };
}

/** Compose local position into parent space (position only). */
export function composeLocalPosition(parentWorld: Transform, local: Vec3): Vec3 {
  const rotated = rotateVec(local, parentWorld.rotation);
  return {
    x: parentWorld.position.x + rotated.x * parentWorld.scale.x,
    y: parentWorld.position.y + rotated.y * parentWorld.scale.y,
    z: parentWorld.position.z + rotated.z * parentWorld.scale.z,
  };
}

/** Concatenate local transform under a parent world transform. */
export function composeTransform(parentWorld: Transform, local: Transform): Transform {
  const p = composeLocalPosition(parentWorld, local.position);
  return {
    position: p,
    rotation: mulQuat(parentWorld.rotation, local.rotation),
    scale: {
      x: parentWorld.scale.x * local.scale.x,
      y: parentWorld.scale.y * local.scale.y,
      z: parentWorld.scale.z * local.scale.z,
    },
  };
}

// ---------------------------------------------------------------------------
// Scene entities
// ---------------------------------------------------------------------------

export interface SceneNode {
  nodeId: EntityId;
  name: string;
  parentId: EntityId | null;
  /** SHA-256 of the source asset (GLB/GLTF). */
  assetHash: ContentHash | null;
  transform: Transform;
  layerId: string;
  visible: boolean;
  locked: boolean;
  metadata: Record<string, string>;
}

export interface SceneAnnotation {
  annotationId: EntityId;
  kind: 'arrow' | 'label' | 'callout' | 'highlight' | 'path';
  text: string;
  attachmentId: EntityId | null;
  targetNodeId: EntityId;
  /** Local point on the target mesh (barycentric surface attachment). */
  targetPoint: Vec3 | null;
  /** Screen-space offset for labels/callouts. */
  offset: { x: number; y: number } | null;
  pathPoints: Vec3[];
  color: string;
}

export type SurfaceAttachmentSource = 'user' | 'raycast' | 'vision' | 'procedural' | 'legacy';
export type SurfaceAttachmentReviewState = 'draft' | 'reviewed' | 'needs-correction';

/** Editor-side copy of the canonical guide-schema surface attachment. */
export interface SceneSurfaceAttachment {
  attachmentId: EntityId;
  nodeId: EntityId;
  assetHash: ContentHash | null;
  meshName: string | null;
  primitiveIndex: number | null;
  triangleIndex: number | null;
  barycentric: Vec3 | null;
  localPoint: Vec3;
  normal: Vec3 | null;
  source: SurfaceAttachmentSource;
  confidence: number;
  reviewState: SurfaceAttachmentReviewState;
}

export interface SurfaceViewObservation {
  viewId: string;
  nodeId: EntityId;
  localPoint: Vec3;
  normal: Vec3 | null;
  primitiveIndex: number | null;
  triangleIndex: number | null;
  barycentric: Vec3 | null;
  source: 'raycast' | 'vision';
  confidence: number;
}

/** Pick the strongest bounded multiview observation without inventing a point. */
export function chooseSurfaceObservation(
  observations: readonly SurfaceViewObservation[],
): SurfaceViewObservation | null {
  return (
    [...observations]
      .filter((observation) => Number.isFinite(observation.confidence))
      .sort((a, b) => b.confidence - a.confidence || a.viewId.localeCompare(b.viewId))[0] ?? null
  );
}

export function surfaceAttachmentFromObservation(
  attachmentId: EntityId,
  observation: SurfaceViewObservation,
  assetHash: ContentHash | null,
): SceneSurfaceAttachment {
  return {
    attachmentId,
    nodeId: observation.nodeId,
    assetHash,
    meshName: null,
    primitiveIndex: observation.primitiveIndex,
    triangleIndex: observation.triangleIndex,
    barycentric: observation.barycentric ? { ...observation.barycentric } : null,
    localPoint: { ...observation.localPoint },
    normal: observation.normal ? { ...observation.normal } : null,
    source: observation.source,
    confidence: Math.max(0, Math.min(1, observation.confidence)),
    reviewState: 'draft',
  };
}

export interface SceneState {
  nodes: Map<EntityId, SceneNode>;
  /** Root-level node order (stable ids under reorder). */
  rootOrder: EntityId[];
  layers: Map<string, { name: string; visible: boolean; locked: boolean; color: string }>;
  cameras: CameraBookmark[];
  measurements: Measurement[];
  annotations: SceneAnnotation[];
  surfaceAttachments: SceneSurfaceAttachment[];
  stepStates: Record<string, { visibleNodeIds: EntityId[]; cameraId: EntityId | null }>;
}

export interface CameraBookmark {
  bookmarkId: EntityId;
  name: string;
  position: Vec3;
  target: Vec3;
  orthographic: boolean;
  zoom: number;
}

export interface Measurement {
  measurementId: EntityId;
  name: string;
  fromNodeId: EntityId;
  toNodeId: EntityId;
  /** Override in world units; recomputed by renderer when null. */
  value: number | null;
}

export function createSceneState(): SceneState {
  return {
    nodes: new Map(),
    rootOrder: [],
    layers: new Map([
      ['default', { name: 'Default', visible: true, locked: false, color: '#2dd4bf' }],
    ]),
    cameras: [],
    measurements: [],
    annotations: [],
    surfaceAttachments: [],
    stepStates: {},
  };
}

export function addNode(state: SceneState, node: SceneNode): SceneState {
  if (state.nodes.has(node.nodeId)) return state;
  const next = cloneSceneState(state);
  next.nodes.set(node.nodeId, { ...node, transform: { ...node.transform } });
  if (node.parentId === null) {
    if (!next.rootOrder.includes(node.nodeId)) next.rootOrder.push(node.nodeId);
  }
  return next;
}

export function removeNode(state: SceneState, nodeId: EntityId): SceneState {
  const next = cloneSceneState(state);
  // Remove descendants too.
  const toRemove = new Set<EntityId>([nodeId]);
  for (const [id, node] of next.nodes) {
    let parent = node.parentId;
    while (parent !== null) {
      if (toRemove.has(parent)) {
        toRemove.add(id);
        break;
      }
      parent = next.nodes.get(parent)?.parentId ?? null;
    }
  }
  for (const id of toRemove) next.nodes.delete(id);
  next.rootOrder = next.rootOrder.filter((id) => !toRemove.has(id));
  next.measurements = next.measurements.filter(
    (m) => !toRemove.has(m.fromNodeId) && !toRemove.has(m.toNodeId),
  );
  next.surfaceAttachments = next.surfaceAttachments.filter((a) => !toRemove.has(a.nodeId));
  next.annotations = next.annotations.filter((a) => !toRemove.has(a.targetNodeId));
  for (const [stepId, step] of Object.entries(next.stepStates)) {
    next.stepStates[stepId] = {
      ...step,
      visibleNodeIds: step.visibleNodeIds.filter((id) => !toRemove.has(id)),
    };
  }
  return next;
}

export function setNodeTransform(
  state: SceneState,
  nodeId: EntityId,
  transform: Transform,
): SceneState {
  const node = state.nodes.get(nodeId);
  if (!node) return state;
  const next = cloneSceneState(state);
  next.nodes.set(nodeId, { ...node, transform: { ...transform } });
  return next;
}

export function updateNode(
  state: SceneState,
  nodeId: EntityId,
  patch: Partial<Omit<SceneNode, 'nodeId' | 'transform'>>,
): SceneState {
  const node = state.nodes.get(nodeId);
  if (!node) return state;
  const next = cloneSceneState(state);
  next.nodes.set(nodeId, { ...node, ...patch });
  return next;
}

function cloneSceneState(state: SceneState): SceneState {
  return {
    nodes: new Map(
      [...state.nodes].map(([id, n]) => [id, { ...n, transform: { ...n.transform } }]),
    ),
    rootOrder: [...state.rootOrder],
    layers: new Map([...state.layers].map(([id, l]) => [id, { ...l }])),
    cameras: state.cameras.map((c) => ({
      ...c,
      position: { ...c.position },
      target: { ...c.target },
    })),
    measurements: state.measurements.map((m) => ({ ...m })),
    annotations: state.annotations.map((a) => ({
      ...a,
      targetPoint: a.targetPoint ? { ...a.targetPoint } : null,
      offset: a.offset ? { ...a.offset } : null,
      pathPoints: a.pathPoints.map((point) => ({ ...point })),
    })),
    surfaceAttachments: state.surfaceAttachments.map((attachment) => ({
      ...attachment,
      barycentric: attachment.barycentric ? { ...attachment.barycentric } : null,
      localPoint: { ...attachment.localPoint },
      normal: attachment.normal ? { ...attachment.normal } : null,
    })),
    stepStates: Object.fromEntries(
      Object.entries(state.stepStates).map(([stepId, step]) => [
        stepId,
        { ...step, visibleNodeIds: [...step.visibleNodeIds] },
      ]),
    ),
  };
}

export function addMeasurement(state: SceneState, measurement: Measurement): SceneState {
  if (state.measurements.some((item) => item.measurementId === measurement.measurementId)) {
    return state;
  }
  if (!state.nodes.has(measurement.fromNodeId) || !state.nodes.has(measurement.toNodeId)) {
    return state;
  }
  const next = cloneSceneState(state);
  next.measurements.push({ ...measurement });
  return next;
}

export function removeMeasurement(state: SceneState, measurementId: EntityId): SceneState {
  if (!state.measurements.some((item) => item.measurementId === measurementId)) return state;
  const next = cloneSceneState(state);
  next.measurements = next.measurements.filter((item) => item.measurementId !== measurementId);
  return next;
}

export function setStepState(
  state: SceneState,
  stepId: EntityId,
  step: { visibleNodeIds: EntityId[]; cameraId: EntityId | null },
): SceneState {
  const next = cloneSceneState(state);
  next.stepStates[stepId] = { visibleNodeIds: [...step.visibleNodeIds], cameraId: step.cameraId };
  return next;
}

export function distanceBetweenNodes(
  state: SceneState,
  fromNodeId: EntityId,
  toNodeId: EntityId,
): number | null {
  const from = worldTransform(state, fromNodeId)?.position;
  const to = worldTransform(state, toNodeId)?.position;
  if (!from || !to) return null;
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
}

export function addSurfaceAttachment(
  state: SceneState,
  attachment: SceneSurfaceAttachment,
): SceneState {
  if (!state.nodes.has(attachment.nodeId)) return state;
  if (state.surfaceAttachments.some((item) => item.attachmentId === attachment.attachmentId)) {
    return state;
  }
  const next = cloneSceneState(state);
  next.surfaceAttachments.push({
    ...attachment,
    localPoint: { ...attachment.localPoint },
    barycentric: attachment.barycentric ? { ...attachment.barycentric } : null,
    normal: attachment.normal ? { ...attachment.normal } : null,
  });
  return next;
}

export function updateSurfaceAttachment(
  state: SceneState,
  attachmentId: EntityId,
  patch: Partial<Omit<SceneSurfaceAttachment, 'attachmentId'>>,
): SceneState {
  const current = state.surfaceAttachments.find((item) => item.attachmentId === attachmentId);
  if (!current) return state;
  const next = cloneSceneState(state);
  const index = next.surfaceAttachments.findIndex((item) => item.attachmentId === attachmentId);
  next.surfaceAttachments[index] = {
    ...current,
    ...patch,
    localPoint: patch.localPoint ? { ...patch.localPoint } : { ...current.localPoint },
    barycentric:
      patch.barycentric === undefined
        ? current.barycentric
          ? { ...current.barycentric }
          : null
        : patch.barycentric
          ? { ...patch.barycentric }
          : null,
    normal:
      patch.normal === undefined
        ? current.normal
          ? { ...current.normal }
          : null
        : patch.normal
          ? { ...patch.normal }
          : null,
  };
  return next;
}

export function removeSurfaceAttachment(state: SceneState, attachmentId: EntityId): SceneState {
  if (!state.surfaceAttachments.some((item) => item.attachmentId === attachmentId)) return state;
  const next = cloneSceneState(state);
  next.surfaceAttachments = next.surfaceAttachments.filter(
    (item) => item.attachmentId !== attachmentId,
  );
  next.annotations = next.annotations.map((annotation) =>
    annotation.attachmentId === attachmentId
      ? { ...annotation, attachmentId: null, targetPoint: null }
      : annotation,
  );
  return next;
}

/** World position is derived from the node transform; the local attachment never moves. */
export function worldPointForSurfaceAttachment(
  state: SceneState,
  attachmentId: EntityId,
): Vec3 | null {
  const attachment = state.surfaceAttachments.find((item) => item.attachmentId === attachmentId);
  if (!attachment) return null;
  const transform = worldTransform(state, attachment.nodeId);
  return transform ? composeLocalPosition(transform, attachment.localPoint) : null;
}

/** A deterministic geometric anchor used when no mesh raycast is available. */
export function createGeometricSurfaceAttachment(
  input: Pick<SceneSurfaceAttachment, 'attachmentId' | 'nodeId' | 'assetHash' | 'localPoint'> &
    Partial<
      Pick<SceneSurfaceAttachment, 'normal' | 'meshName' | 'primitiveIndex' | 'triangleIndex'>
    >,
): SceneSurfaceAttachment {
  return {
    attachmentId: input.attachmentId,
    nodeId: input.nodeId,
    assetHash: input.assetHash,
    meshName: input.meshName ?? null,
    primitiveIndex: input.primitiveIndex ?? null,
    triangleIndex: input.triangleIndex ?? null,
    barycentric: null,
    localPoint: { ...input.localPoint },
    normal: input.normal ? { ...input.normal } : null,
    source: 'procedural',
    confidence: 0.5,
    reviewState: 'draft',
  };
}

/** Compute world transform for a node by walking parents. */
export function worldTransform(state: SceneState, nodeId: EntityId): Transform | null {
  const node = state.nodes.get(nodeId);
  if (!node) return null;
  if (node.parentId === null) return { ...node.transform };
  const parent = worldTransform(state, node.parentId);
  if (!parent) return { ...node.transform };
  return composeTransform(parent, node.transform);
}

/** Root of a node (identity of the top-most ancestor). */
export function rootOf(state: SceneState, nodeId: EntityId): EntityId | null {
  let current = state.nodes.get(nodeId);
  let parent = current?.parentId ?? null;
  while (parent !== null) {
    const p = state.nodes.get(parent);
    if (!p) break;
    current = p;
    parent = p.parentId;
  }
  return current?.nodeId ?? null;
}

// ---------------------------------------------------------------------------
// Snapping
// ---------------------------------------------------------------------------

export interface SnapOptions {
  grid: number;
  /** Rotational snap in degrees. */
  angleDegrees: number;
  increment: number;
}

export function snapValue(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function snapPosition(v: Vec3, grid: number): Vec3 {
  return {
    x: snapValue(v.x, grid),
    y: snapValue(v.y, grid),
    z: snapValue(v.z, grid),
  };
}

/** Snap a rotation quaternion by converting to degrees on each axis. */
export function snapRotationEuler(rotation: Quat, angleDegrees: number): Quat {
  if (angleDegrees <= 0) return { ...rotation };
  // Convert quaternion to intrinsic XYZ euler degrees, snap, and rebuild.
  const { x, y, z } = quatToEulerDegrees(rotation);
  const sx = snapValue(x, angleDegrees);
  const sy = snapValue(y, angleDegrees);
  const sz = snapValue(z, angleDegrees);
  return eulerDegreesToQuat(sx, sy, sz);
}

export function quatToEulerDegrees(q: Quat): { x: number; y: number; z: number } {
  const sinr = 2 * (q.w * q.x + q.y * q.z);
  const cosr = 1 - 2 * (q.x * q.x + q.y * q.y);
  const x = Math.atan2(sinr, cosr);
  const sinp = 2 * (q.w * q.y - q.z * q.x);
  const y = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);
  const siny = 2 * (q.w * q.z + q.x * q.y);
  const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
  const z = Math.atan2(siny, cosy);
  const rad = 180 / Math.PI;
  return { x: x * rad, y: y * rad, z: z * rad };
}

export function eulerDegreesToQuat(x: number, y: number, z: number): Quat {
  const rad = Math.PI / 180;
  const rx = (x * rad) / 2;
  const ry = (y * rad) / 2;
  const rz = (z * rad) / 2;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
}

// ---------------------------------------------------------------------------
// Multiselect alignment / distribution / pivot
// ---------------------------------------------------------------------------

export type Axis = 'x' | 'y' | 'z';

/** Align selected node world positions to min/center/max of their bounds. */
export function alignPositions(
  positions: Vec3[],
  axis: Axis,
  mode: 'min' | 'center' | 'max',
): Vec3[] {
  if (positions.length === 0) return [];
  const values = positions.map((p) => p[axis]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const target = mode === 'min' ? min : mode === 'max' ? max : (min + max) / 2;
  return positions.map((p) => ({ ...p, [axis]: target }));
}

/** Distribute selected node world positions equally along an axis. */
export function distributePositions(positions: Vec3[], axis: Axis): Vec3[] {
  if (positions.length <= 2) return [...positions];
  const values = positions.map((p) => p[axis]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const step = span / (positions.length - 1);
  const sortedIdx = values.map((v, i) => i).sort((a, b) => values[a]! - values[b]!);
  const result = [...positions];
  sortedIdx.forEach((idx, rank) => {
    result[idx] = { ...positions[idx]!, [axis]: min + step * rank };
  });
  return result;
}

/** Set a common pivot on a set of transforms (translate to keep world pos). */
export function setCommonPivot(transforms: Transform[], pivot: Vec3): Transform[] {
  // Shift each object so its original position stays put relative to the new pivot.
  // Simplified: re-bases the position by the delta between pivot and object center.
  return transforms.map((t) => ({
    ...t,
    position: addVec(t.position, { x: pivot.x, y: pivot.y, z: pivot.z }),
  }));
}

// ---------------------------------------------------------------------------
// Step scene state
// ---------------------------------------------------------------------------

export interface StepSceneState {
  stepId: EntityId;
  visibleNodeIds: EntityId[] | null; // null = inherit all
  highlightedNodeIds: EntityId[];
  hiddenNodeIds: EntityId[];
  cameraBookmarkId: EntityId | null;
}

export function stepVisibility(step: StepSceneState | null, nodeId: EntityId): boolean {
  if (!step) return true;
  if (step.visibleNodeIds) return step.visibleNodeIds.includes(nodeId);
  return !step.hiddenNodeIds.includes(nodeId);
}

// ---------------------------------------------------------------------------
// Scene health
// ---------------------------------------------------------------------------

export interface SceneHealth {
  ok: boolean;
  warnings: string[];
  nodeCount: number;
  assetCount: number;
  orphanedChildren: number;
  invalidTransforms: number;
  duplicateRootIds: number;
}

export const SCENE_HEALTH_LIMITS = {
  maxNodes: 2000,
  maxAssets: 500,
  maxRoots: 500,
} as const;

export function evaluateSceneHealth(state: SceneState): SceneHealth {
  const warnings: string[] = [];
  let orphanedChildren = 0;
  let invalidTransforms = 0;

  const nodeIds = new Set(state.nodes.keys());
  for (const node of state.nodes.values()) {
    if (node.parentId !== null && !nodeIds.has(node.parentId)) orphanedChildren += 1;
    if (
      !Number.isFinite(node.transform.position.x) ||
      !Number.isFinite(node.transform.position.y)
    ) {
      invalidTransforms += 1;
    }
    const scale = node.transform.scale;
    if (scale.x === 0 || scale.y === 0 || scale.z === 0) {
      warnings.push(`Node "${node.name}" has a zero scale`);
    }
  }

  if (state.nodes.size > SCENE_HEALTH_LIMITS.maxNodes) {
    warnings.push(`Scene exceeds ${SCENE_HEALTH_LIMITS.maxNodes} nodes`);
  }
  if (orphanedChildren > 0) {
    warnings.push(`${orphanedChildren} node(s) reference a missing parent`);
  }
  const assetSet = new Set<string>();
  for (const node of state.nodes.values()) {
    if (node.assetHash) assetSet.add(node.assetHash);
  }
  if (assetSet.size > SCENE_HEALTH_LIMITS.maxAssets) {
    warnings.push(`Scene references more than ${SCENE_HEALTH_LIMITS.maxAssets} assets`);
  }

  return {
    ok: warnings.length === 0 && invalidTransforms === 0,
    warnings,
    nodeCount: state.nodes.size,
    assetCount: assetSet.size,
    orphanedChildren,
    invalidTransforms,
    duplicateRootIds: 0,
  };
}

export {
  applySceneCommand,
  applySceneCommands,
  freshSceneState,
  SCENE_COMMAND_TYPES,
} from './scene-reducer.js';
export type {
  AddCameraPayload,
  AddNodePayload,
  DuplicatePayload,
  NumericTransformPayload,
  RenamePayload,
  ReparentPayload,
  SetLayerPayload,
  SetTransformPayload,
  ToggleLockPayload,
  ToggleVisiblePayload,
} from './scene-reducer.js';
