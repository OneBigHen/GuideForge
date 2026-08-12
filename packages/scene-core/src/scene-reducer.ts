/**
 * Pure scene command reducers. Scene mutations go through typed commands with
 * the same envelope as guide commands; the reducer is framework-independent
 * and deterministic.
 */
import type { GuideCommand } from '@guideforge/commands';
import type { ContentHash, EntityId } from '@guideforge/domain';
import {
  type SceneAnnotation,
  type SceneNode,
  type SceneState,
  type SceneSurfaceAttachment,
  type Transform,
  addMeasurement,
  addNode,
  addSurfaceAttachment,
  alignPositions,
  createSceneState,
  distributePositions,
  removeMeasurement,
  removeNode,
  removeSurfaceAttachment,
  setNodeTransform,
  setStepState,
  updateNode,
  updateSurfaceAttachment,
} from './index.js';

export const SCENE_COMMAND_TYPES = {
  addNode: 'scene/add-node',
  removeNode: 'scene/remove-node',
  setTransform: 'scene/set-transform',
  setNumericTransform: 'scene/set-numeric-transform',
  toggleVisible: 'scene/toggle-visible',
  toggleLock: 'scene/toggle-lock',
  setIsolated: 'scene/set-isolated',
  reparent: 'scene/reparent',
  duplicate: 'scene/duplicate',
  rename: 'scene/rename',
  setLayer: 'scene/set-layer',
  addLayer: 'scene/add-layer',
  setAsset: 'scene/set-asset',
  addCamera: 'scene/add-camera',
  alignSelected: 'scene/align-selected',
  distributeSelected: 'scene/distribute-selected',
  addAnnotation: 'scene/add-annotation',
  removeAnnotation: 'scene/remove-annotation',
  addSurfaceAttachment: 'scene/add-surface-attachment',
  updateSurfaceAttachment: 'scene/update-surface-attachment',
  removeSurfaceAttachment: 'scene/remove-surface-attachment',
  addMeasurement: 'scene/add-measurement',
  removeMeasurement: 'scene/remove-measurement',
  setStepState: 'scene/set-step-state',
} as const;

export interface AddNodePayload {
  node: SceneNode;
}

export interface SetTransformPayload {
  nodeIds: EntityId[];
  transform: Transform;
  /** 'world' | 'local' */
  space: 'world' | 'local';
  /** Whether this is part of an active drag (grouped undo). */
  drag?: boolean;
}

export interface NumericTransformPayload {
  nodeIds: EntityId[];
  patch: Partial<Transform>;
  space: 'world' | 'local';
}

export interface ToggleVisiblePayload {
  nodeIds: EntityId[];
  visible?: boolean;
}

export interface ToggleLockPayload {
  nodeIds: EntityId[];
  locked?: boolean;
}

export interface ReparentPayload {
  nodeId: EntityId;
  newParentId: EntityId | null;
}

export interface DuplicatePayload {
  nodeId: EntityId;
  newId: EntityId;
}

export interface RenamePayload {
  nodeId: EntityId;
  name: string;
}

export interface SetLayerPayload {
  nodeIds: EntityId[];
  layerId: string;
}

export interface AddCameraPayload {
  bookmarkId: EntityId;
  name: string;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  orthographic: boolean;
  zoom: number;
}

export function applySceneCommand(state: SceneState, command: GuideCommand): SceneState {
  switch (command.commandType) {
    case SCENE_COMMAND_TYPES.addNode: {
      const p = command.payload as AddNodePayload;
      return addNode(state, p.node);
    }
    case SCENE_COMMAND_TYPES.removeNode: {
      const p = command.payload as { nodeId: EntityId };
      return removeNode(state, p.nodeId);
    }
    case SCENE_COMMAND_TYPES.setTransform: {
      const p = command.payload as SetTransformPayload;
      let next = state;
      for (const nodeId of p.nodeIds) {
        next = setNodeTransform(next, nodeId, p.transform);
      }
      return next;
    }
    case SCENE_COMMAND_TYPES.setNumericTransform: {
      const p = command.payload as NumericTransformPayload;
      let next = state;
      for (const nodeId of p.nodeIds) {
        const node = next.nodes.get(nodeId);
        if (!node) continue;
        next = setNodeTransform(next, nodeId, {
          ...node.transform,
          ...p.patch,
        });
      }
      return next;
    }
    case SCENE_COMMAND_TYPES.toggleVisible: {
      const p = command.payload as ToggleVisiblePayload;
      let next = state;
      for (const nodeId of p.nodeIds) {
        const node = next.nodes.get(nodeId);
        if (!node) continue;
        const visible = p.visible ?? !node.visible;
        next = updateNode(next, nodeId, { visible });
      }
      return next;
    }
    case SCENE_COMMAND_TYPES.toggleLock: {
      const p = command.payload as ToggleLockPayload;
      let next = state;
      for (const nodeId of p.nodeIds) {
        const node = next.nodes.get(nodeId);
        if (!node) continue;
        const locked = p.locked ?? !node.locked;
        next = updateNode(next, nodeId, { locked });
      }
      return next;
    }
    case SCENE_COMMAND_TYPES.reparent: {
      const p = command.payload as ReparentPayload;
      if (p.nodeId === p.newParentId) return state;
      // Prevent cycles: newParent must not be a descendant of nodeId.
      if (p.newParentId !== null) {
        let cursor: EntityId | null = p.newParentId;
        while (cursor !== null) {
          if (cursor === p.nodeId) return state;
          cursor = state.nodes.get(cursor)?.parentId ?? null;
        }
      }
      const node = state.nodes.get(p.nodeId);
      if (!node) return state;
      return updateNode(state, p.nodeId, { parentId: p.newParentId });
    }
    case SCENE_COMMAND_TYPES.duplicate: {
      const p = command.payload as DuplicatePayload;
      const node = state.nodes.get(p.nodeId);
      if (!node || state.nodes.has(p.newId)) return state;
      return addNode(state, { ...node, nodeId: p.newId, name: `${node.name} copy` });
    }
    case SCENE_COMMAND_TYPES.rename: {
      const p = command.payload as RenamePayload;
      return updateNode(state, p.nodeId, { name: p.name });
    }
    case SCENE_COMMAND_TYPES.setLayer: {
      const p = command.payload as SetLayerPayload;
      let next = state;
      for (const nodeId of p.nodeIds) {
        next = updateNode(next, nodeId, { layerId: p.layerId });
      }
      return next;
    }
    case SCENE_COMMAND_TYPES.addLayer: {
      const p = command.payload as { layerId: string; name: string; color: string };
      if (state.layers.has(p.layerId)) return state;
      return {
        ...state,
        layers: new Map(state.layers).set(p.layerId, {
          name: p.name,
          visible: true,
          locked: false,
          color: p.color,
        }),
      };
    }
    case SCENE_COMMAND_TYPES.setAsset: {
      const p = command.payload as { nodeId: EntityId; assetHash: string };
      if (!state.nodes.has(p.nodeId)) return state;
      let next = updateNode(state, p.nodeId, { assetHash: p.assetHash as ContentHash | null });
      for (const attachment of next.surfaceAttachments) {
        if (attachment.nodeId !== p.nodeId) continue;
        next = updateSurfaceAttachment(next, attachment.attachmentId, {
          assetHash: p.assetHash as ContentHash,
          reviewState:
            attachment.assetHash === p.assetHash ? attachment.reviewState : 'needs-correction',
        });
      }
      return next;
    }
    case SCENE_COMMAND_TYPES.addCamera: {
      const p = command.payload as AddCameraPayload;
      const next = {
        ...state,
        cameras: [
          ...state.cameras,
          {
            bookmarkId: p.bookmarkId,
            name: p.name,
            position: p.position,
            target: p.target,
            orthographic: p.orthographic,
            zoom: p.zoom,
          },
        ],
      };
      return next;
    }
    case SCENE_COMMAND_TYPES.alignSelected: {
      const p = command.payload as {
        nodeIds: EntityId[];
        axis: 'x' | 'y' | 'z';
        mode: 'min' | 'center' | 'max';
      };
      const targets = p.nodeIds
        .map((id) => state.nodes.get(id))
        .filter((n): n is SceneNode => n !== undefined);
      if (targets.length < 2) return state;
      const positions = targets.map((n) => n.transform.position);
      const aligned = alignPositions(positions, p.axis, p.mode);
      let next = state;
      targets.forEach((n, i) => {
        next = setNodeTransform(next, n.nodeId, {
          ...n.transform,
          position: aligned[i]!,
        });
      });
      return next;
    }
    case SCENE_COMMAND_TYPES.distributeSelected: {
      const p = command.payload as { nodeIds: EntityId[]; axis: 'x' | 'y' | 'z' };
      const targets = p.nodeIds
        .map((id) => state.nodes.get(id))
        .filter((n): n is SceneNode => n !== undefined);
      if (targets.length < 3) return state;
      const positions = targets.map((n) => n.transform.position);
      const distributed = distributePositions(positions, p.axis);
      let next = state;
      targets.forEach((n, i) => {
        next = setNodeTransform(next, n.nodeId, {
          ...n.transform,
          position: distributed[i]!,
        });
      });
      return next;
    }
    case SCENE_COMMAND_TYPES.addAnnotation: {
      const p = command.payload as { annotation: SceneAnnotation };
      const next = { ...state, annotations: [...state.annotations] };
      if (next.annotations.some((a) => a.annotationId === p.annotation.annotationId)) return state;
      next.annotations.push(p.annotation);
      return next;
    }
    case SCENE_COMMAND_TYPES.removeAnnotation: {
      const p = command.payload as { annotationId: EntityId };
      if (!state.annotations.some((a) => a.annotationId === p.annotationId)) return state;
      return {
        ...state,
        annotations: state.annotations.filter((a) => a.annotationId !== p.annotationId),
      };
    }
    case SCENE_COMMAND_TYPES.addSurfaceAttachment: {
      const p = command.payload as { attachment: SceneSurfaceAttachment };
      return addSurfaceAttachment(state, p.attachment);
    }
    case SCENE_COMMAND_TYPES.updateSurfaceAttachment: {
      const p = command.payload as {
        attachmentId: EntityId;
        patch: Partial<Omit<SceneSurfaceAttachment, 'attachmentId'>>;
      };
      return updateSurfaceAttachment(state, p.attachmentId, p.patch);
    }
    case SCENE_COMMAND_TYPES.removeSurfaceAttachment: {
      const p = command.payload as { attachmentId: EntityId };
      return removeSurfaceAttachment(state, p.attachmentId);
    }
    case SCENE_COMMAND_TYPES.addMeasurement: {
      const p = command.payload as { measurement: SceneState['measurements'][number] };
      return addMeasurement(state, p.measurement);
    }
    case SCENE_COMMAND_TYPES.removeMeasurement: {
      const p = command.payload as { measurementId: EntityId };
      return removeMeasurement(state, p.measurementId);
    }
    case SCENE_COMMAND_TYPES.setStepState: {
      const p = command.payload as {
        stepId: EntityId;
        step: { visibleNodeIds: EntityId[]; cameraId: EntityId | null };
      };
      return setStepState(state, p.stepId, p.step);
    }
    default:
      return state;
  }
}

export function freshSceneState(): SceneState {
  return createSceneState();
}

export function applySceneCommands(
  state: SceneState,
  commands: readonly GuideCommand[],
): SceneState {
  let current = state;
  for (const command of commands) {
    current = applySceneCommand(current, command);
  }
  return current;
}
