/**
 * Scene converters: scene-core `SceneState` (Map-based, editor runtime) <-> the
 * canonical JSON-safe `GuideScene` stored in the snapshot / Yjs working doc.
 *
 * The editor works with Map-based state for O(1) lookups; the canonical
 * snapshot and the `.gforge` package carry plain-JSON arrays. These pure
 * functions are the only place the two representations meet.
 */
import type { ContentHash, EntityId } from '@guideforge/domain';
import type {
  GuideScene,
  SceneCamera,
  SceneMeasurement,
  SceneNode,
  SceneTransform,
} from '@guideforge/guide-schema';
import {
  type CameraBookmark,
  type Measurement,
  type Quat,
  type SceneState,
  type Transform,
  type Vec3,
} from '@guideforge/scene-core';

function toVec3(v: { x: number; y: number; z: number }): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

function toQuat(v: { x: number; y: number; z: number; w: number }): Quat {
  return { x: v.x, y: v.y, z: v.z, w: v.w };
}

function toTransform(t: SceneTransform): Transform {
  return { position: toVec3(t.position), rotation: toQuat(t.rotation), scale: toVec3(t.scale) };
}

type EditorNode = SceneState['nodes'] extends Map<EntityId, infer N> ? N : never;

function toNode(n: SceneNode): EditorNode {
  return {
    nodeId: n.nodeId,
    name: n.name,
    parentId: n.parentId,
    assetHash: n.assetHash as ContentHash | null,
    transform: toTransform(n.transform),
    layerId: n.layerId,
    visible: n.visible,
    locked: n.locked,
    metadata: { ...n.metadata },
  };
}

function toCamera(c: SceneCamera): CameraBookmark {
  return {
    bookmarkId: c.cameraId,
    name: c.name,
    position: toVec3(c.position),
    target: toVec3(c.target),
    orthographic: c.orthographic,
    zoom: c.zoom,
  };
}

function toMeasurement(m: SceneMeasurement): Measurement {
  return {
    measurementId: m.measurementId,
    name: m.name,
    fromNodeId: m.fromNodeId,
    toNodeId: m.toNodeId,
    value: m.value,
  };
}

/** Canonical GuideScene -> editor SceneState. */
export function guideSceneToSceneState(scene: GuideScene): SceneState {
  const nodes = new Map<EntityId, EditorNode>();
  for (const n of scene.nodes) nodes.set(n.nodeId, toNode(n));
  const layers = new Map<
    string,
    { name: string; visible: boolean; locked: boolean; color: string }
  >();
  for (const l of scene.layers) {
    layers.set(l.layerId, { name: l.name, visible: l.visible, locked: l.locked, color: l.color });
  }
  return {
    nodes,
    rootOrder: [...scene.rootOrder],
    layers,
    cameras: scene.cameras.map(toCamera),
    measurements: scene.measurements.map(toMeasurement),
    annotations: scene.annotations.map((a) => ({
      annotationId: a.annotationId,
      kind: a.kind,
      text: a.text,
      targetNodeId: a.targetNodeId,
      targetPoint: a.targetPoint
        ? { x: a.targetPoint.x, y: a.targetPoint.y, z: a.targetPoint.z }
        : null,
      offset: a.offset ? { x: a.offset.x, y: a.offset.y } : null,
      color: a.color,
    })),
  };
}

/** Editor SceneState -> canonical GuideScene. */
export function sceneStateToGuideScene(state: SceneState): GuideScene {
  return {
    nodes: Array.from(state.nodes.values()).map((n) => ({
      nodeId: n.nodeId,
      name: n.name,
      parentId: n.parentId,
      assetHash: n.assetHash,
      transform: {
        position: { ...n.transform.position },
        rotation: { ...n.transform.rotation },
        scale: { ...n.transform.scale },
      },
      layerId: n.layerId,
      visible: n.visible,
      locked: n.locked,
      metadata: { ...n.metadata },
    })),
    rootOrder: [...state.rootOrder],
    layers: Array.from(state.layers.entries()).map(([layerId, l]) => ({
      layerId,
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      color: l.color,
    })),
    cameras: state.cameras.map((c) => ({
      cameraId: c.bookmarkId,
      name: c.name,
      position: { ...c.position },
      target: { ...c.target },
      orthographic: c.orthographic,
      zoom: c.zoom,
    })),
    measurements: state.measurements.map((m) => ({
      measurementId: m.measurementId,
      name: m.name,
      fromNodeId: m.fromNodeId,
      toNodeId: m.toNodeId,
      value: m.value,
    })),
    annotations: state.annotations.map((a) => ({
      annotationId: a.annotationId,
      kind: a.kind,
      text: a.text,
      targetNodeId: a.targetNodeId,
      targetPoint: a.targetPoint ? { ...a.targetPoint } : null,
      offset: a.offset ? { ...a.offset } : null,
      color: a.color,
    })),
    stepStates: {},
  };
}
