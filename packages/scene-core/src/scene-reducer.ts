/**
 * Pure scene command reducers. Scene mutations go through typed commands with
 * the same envelope as guide commands; the reducer is framework-independent
 * and deterministic.
 */
import type { GuideCommand } from '@guideforge/commands';
import type { EntityId } from '@guideforge/domain';
import {
  type SceneNode,
  type SceneState,
  type Transform,
  addNode,
  alignPositions,
  createSceneState,
  distributePositions,
  removeNode,
  setNodeTransform,
  updateNode,
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
  addCamera: 'scene/add-camera',
  alignSelected: 'scene/align-selected',
  distributeSelected: 'scene/distribute-selected',
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
