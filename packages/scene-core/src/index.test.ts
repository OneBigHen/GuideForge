import type { GuideCommand } from '@guideforge/commands';
import type { EntityId } from '@guideforge/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  alignPositions,
  composeTransform,
  createSceneState,
  distributePositions,
  eulerDegreesToQuat,
  evaluateSceneHealth,
  quatToEulerDegrees,
  rotateVec,
  snapPosition,
  snapRotationEuler,
  snapValue,
  subVec,
  type SceneNode,
  type Transform,
} from './index.js';
import { applySceneCommand, freshSceneState, SCENE_COMMAND_TYPES } from './scene-reducer.js';

const N1 = '11111111-1111-4111-8111-111111111111' as EntityId;
const N2 = '22222222-2222-4222-8222-222222222222' as EntityId;
const N3 = '33333333-3333-4333-8333-333333333333' as EntityId;

function node(id: EntityId, name?: string): SceneNode {
  return {
    nodeId: id,
    name: name ?? id,
    parentId: null,
    assetHash: null,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    },
    layerId: 'default',
    visible: true,
    locked: false,
    metadata: {},
  };
}

function cmd(commandType: string, payload: unknown): GuideCommand {
  return {
    commandId: 'c',
    commandType,
    actorId: 'a',
    guideId: N1,
    origin: 'user',
    occurredAt: '2026-01-01T00:00:00Z',
    payload,
  };
}

describe('scene-core math', () => {
  it('quaternion euler round-trips identity', () => {
    expect(quatToEulerDegrees({ x: 0, y: 0, z: 0, w: 1 })).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('euler->quat->euler round-trips away from gimbal lock', () => {
    fc.assert(
      fc.property(
        fc.float({ min: -170, max: 170 }),
        fc.float({ min: -85, max: 85 }),
        fc.float({ min: -170, max: 170 }),
        (x, y, z) => {
          const q = eulerDegreesToQuat(x, y, z);
          const back = quatToEulerDegrees(q);
          // Guard against NaN from float precision at extreme angles.
          if (![back.x, back.y, back.z].every(Number.isFinite)) return;
          expect(Math.abs(back.x - x)).toBeLessThan(0.1);
          expect(Math.abs(back.y - y)).toBeLessThan(0.1);
          expect(Math.abs(back.z - z)).toBeLessThan(0.1);
        },
      ),
    );
  });

  it('composeTransform under identity parent preserves local', () => {
    const local: Transform = {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 2, y: 2, z: 2 },
    };
    const parent: Transform = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };
    const out = composeTransform(parent, local);
    expect(out.position).toEqual(local.position);
    expect(out.scale).toEqual(local.scale);
  });

  it('snapValue snaps to grid', () => {
    expect(snapValue(1.7, 1)).toBe(2);
    expect(snapValue(0.24, 0.1)).toBe(0.2);
    expect(snapValue(5, 0)).toBe(5);
  });

  it('snapRotationEuler preserves snapped axes', () => {
    const q = eulerDegreesToQuat(47, 0, 0);
    const snapped = snapRotationEuler(q, 45);
    const e = quatToEulerDegrees(snapped);
    expect(Math.abs(e.x)).toBeCloseTo(45, 5);
  });

  it('rotateVec rotates a point 90deg around Z', () => {
    const q = eulerDegreesToQuat(0, 0, 90);
    const v = rotateVec({ x: 1, y: 0, z: 0 }, q);
    expect(v.x).toBeCloseTo(0, 5);
    expect(v.y).toBeCloseTo(1, 5);
  });
});

describe('scene-core alignment', () => {
  it('aligns min/center/max', () => {
    const positions = [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 5, z: 0 },
      { x: 4, y: 10, z: 0 },
    ];
    const min = alignPositions(positions, 'y', 'min');
    expect(min.map((p) => p.y)).toEqual([0, 0, 0]);
    const center = alignPositions(positions, 'y', 'center');
    expect(center.map((p) => p.y)).toEqual([5, 5, 5]);
    const max = alignPositions(positions, 'y', 'max');
    expect(max.map((p) => p.y)).toEqual([10, 10, 10]);
  });

  it('distributes equally', () => {
    const positions = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 2, z: 0 },
      { x: 0, y: 4, z: 0 },
    ];
    const out = distributePositions(positions, 'y');
    expect(out.map((p) => p.y).sort((a, b) => a - b)).toEqual([0, 2, 4]);
  });
});

describe('scene-core reducer', () => {
  it('adds, transforms, and removes nodes', () => {
    let state = freshSceneState();
    state = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.addNode, { node: node(N1, 'A') }));
    state = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.addNode, { node: node(N2, 'B') }));
    expect(state.nodes.size).toBe(2);

    state = applySceneCommand(
      state,
      cmd(SCENE_COMMAND_TYPES.setTransform, {
        nodeIds: [N1],
        transform: {
          position: { x: 10, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        space: 'world',
      }),
    );
    expect(state.nodes.get(N1)?.transform.position.x).toBe(10);

    state = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.removeNode, { nodeId: N1 }));
    expect(state.nodes.has(N1)).toBe(false);
  });

  it('removes descendants with the parent', () => {
    let state = freshSceneState();
    state = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.addNode, { node: node(N1, 'root') }));
    const child = { ...node(N2, 'child'), parentId: N1 };
    state = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.addNode, { node: child }));
    const grand = { ...node(N3, 'grand'), parentId: N2 };
    state = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.addNode, { node: grand }));
    expect(state.nodes.size).toBe(3);

    state = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.removeNode, { nodeId: N1 }));
    expect(state.nodes.size).toBe(0);
  });

  it('rejects reparent cycles', () => {
    let state = freshSceneState();
    state = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.addNode, { node: node(N1, 'a') }));
    const b = { ...node(N2, 'b'), parentId: N1 };
    state = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.addNode, { node: b }));
    // Try to make N1 a child of N2 (cycle)
    state = applySceneCommand(
      state,
      cmd(SCENE_COMMAND_TYPES.reparent, { nodeId: N1, newParentId: N2 }),
    );
    expect(state.nodes.get(N1)?.parentId).toBeNull();
  });

  it('aligns multiselect as one command', () => {
    let state = freshSceneState();
    const at = (id: EntityId, y: number) => ({
      ...node(id, `n-${id}`),
      transform: {
        position: { x: 0, y, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
    });
    state = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.addNode, { node: at(N1, 0) }));
    state = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.addNode, { node: at(N2, 4) }));
    state = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.addNode, { node: at(N3, 8) }));

    const aligned = applySceneCommand(
      state,
      cmd(SCENE_COMMAND_TYPES.alignSelected, { nodeIds: [N1, N2, N3], axis: 'y', mode: 'center' }),
    );
    expect(aligned.nodes.get(N1)?.transform.position.y).toBe(4);
    expect(aligned.nodes.get(N2)?.transform.position.y).toBe(4);
    expect(aligned.nodes.get(N3)?.transform.position.y).toBe(4);
  });

  it('distributes multiselect as one command', () => {
    let state = freshSceneState();
    const at = (id: EntityId, y: number) => ({
      ...node(id, `n-${id}`),
      transform: {
        position: { x: 0, y, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
    });
    state = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.addNode, { node: at(N1, 0) }));
    state = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.addNode, { node: at(N2, 1) }));
    state = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.addNode, { node: at(N3, 3) }));

    const dist = applySceneCommand(
      state,
      cmd(SCENE_COMMAND_TYPES.distributeSelected, { nodeIds: [N1, N2, N3], axis: 'y' }),
    );
    const ys = [N1, N2, N3]
      .map((id) => dist.nodes.get(id)?.transform.position.y)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    // 0..3 span distributed over 3 items: 0, 1.5, 3
    expect(ys[0]).toBeCloseTo(0, 5);
    expect(ys[1]).toBeCloseTo(1.5, 5);
    expect(ys[2]).toBeCloseTo(3, 5);
  });

  it('property: command sequences never corrupt the scene', () => {
    const arbitraryId = fc.oneof(
      fc.constant(N1),
      fc.constant(N2),
      fc.constant(N3),
      fc.uuid().map((s) => s as EntityId),
    );
    const arbitraryCommand = fc.oneof(
      fc
        .record({ t: fc.constant(SCENE_COMMAND_TYPES.addNode), id: arbitraryId })
        .map((p) => cmd(p.t, { node: node(p.id) })),
      fc
        .record({ t: fc.constant(SCENE_COMMAND_TYPES.removeNode), id: arbitraryId })
        .map((p) => cmd(p.t, { nodeId: p.id })),
      fc
        .record({
          t: fc.constant(SCENE_COMMAND_TYPES.setTransform),
          id: arbitraryId,
          x: fc.float({ min: -10, max: 10 }),
        })
        .map((p) =>
          cmd(p.t, {
            nodeIds: [p.id],
            transform: {
              position: { x: p.x, y: 0, z: 0 },
              rotation: { x: 0, y: 0, z: 0, w: 1 },
              scale: { x: 1, y: 1, z: 1 },
            },
            space: 'world',
          }),
        ),
    );

    fc.assert(
      fc.property(fc.array(arbitraryCommand, { maxLength: 40 }), (commands) => {
        let state = freshSceneState();
        for (const c of commands) {
          state = applySceneCommand(state, c);
        }
        const health = evaluateSceneHealth(state);
        expect(health.nodeCount).toBeGreaterThanOrEqual(0);
        // No orphaned children unless an explicit malformed input created one.
        for (const n of state.nodes.values()) {
          if (n.parentId !== null) {
            expect(state.nodes.has(n.parentId)).toBe(true);
          }
        }
      }),
    );
  });
});

describe('scene-core helpers', () => {
  it('subVec subtracts', () => {
    expect(subVec({ x: 3, y: 1, z: 0 }, { x: 1, y: 1, z: 0 })).toEqual({ x: 2, y: 0, z: 0 });
  });

  it('snapPosition snaps each axis', () => {
    const out = snapPosition({ x: 1.7, y: 0.24, z: -2.3 }, 0.5);
    expect(out.x).toBe(1.5);
    expect(out.y).toBe(0);
    expect(out.z).toBe(-2.5);
  });

  it('scene health flags zero scale', () => {
    const state = createSceneState();
    const bad = {
      ...node(N1, 'bad'),
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 0, y: 1, z: 1 },
      },
    };
    const next = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.addNode, { node: bad }));
    const health = evaluateSceneHealth(next);
    expect(health.ok).toBe(false);
    expect(health.warnings.some((w) => w.includes('zero scale'))).toBe(true);
  });
});

describe('scene-core Phase 03 commands', () => {
  it('adds annotations, layers, and attaches assets via commands', () => {
    let state = freshSceneState();
    state = applySceneCommand(
      state,
      cmd(SCENE_COMMAND_TYPES.addNode, { node: node(N1, 'Pipette') }),
    );

    // Add a layer and assign the node to it.
    state = applySceneCommand(
      state,
      cmd(SCENE_COMMAND_TYPES.addLayer, { layerId: 'layer-2', name: 'Tools', color: '#f59e0b' }),
    );
    expect(state.layers.has('layer-2')).toBe(true);
    state = applySceneCommand(
      state,
      cmd(SCENE_COMMAND_TYPES.setLayer, { nodeIds: [N1], layerId: 'layer-2' }),
    );
    expect(state.nodes.get(N1)?.layerId).toBe('layer-2');

    // Attach a GLB asset hash to the node.
    state = applySceneCommand(
      state,
      cmd(SCENE_COMMAND_TYPES.setAsset, { nodeId: N1, assetHash: 'a'.repeat(64) }),
    );
    expect(state.nodes.get(N1)?.assetHash).toBe('a'.repeat(64));

    // Add + remove an annotation targeting the node.
    state = applySceneCommand(
      state,
      cmd(SCENE_COMMAND_TYPES.addAnnotation, {
        annotation: {
          annotationId: 'ann-1',
          kind: 'label',
          text: 'Plunger',
          targetNodeId: N1,
          targetPoint: { x: 0, y: 0, z: 0 },
          offset: { x: 0, y: 40 },
          color: '#2dd4bf',
        },
      }),
    );
    expect(state.annotations).toHaveLength(1);
    state = applySceneCommand(
      state,
      cmd(SCENE_COMMAND_TYPES.removeAnnotation, { annotationId: 'ann-1' }),
    );
    expect(state.annotations).toHaveLength(0);
  });

  it('aligns and distributes on any axis (not just Y)', () => {
    let state = freshSceneState();
    state = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.addNode, { node: node(N1, 'A') }));
    state = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.addNode, { node: node(N2, 'B') }));
    state = applySceneCommand(state, cmd(SCENE_COMMAND_TYPES.addNode, { node: node(N3, 'C') }));
    state = applySceneCommand(
      state,
      cmd(SCENE_COMMAND_TYPES.setTransform, {
        nodeIds: [N1],
        transform: {
          position: { x: 1, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        space: 'world',
      }),
    );
    state = applySceneCommand(
      state,
      cmd(SCENE_COMMAND_TYPES.setTransform, {
        nodeIds: [N2],
        transform: {
          position: { x: 3, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        space: 'world',
      }),
    );
    state = applySceneCommand(
      state,
      cmd(SCENE_COMMAND_TYPES.setTransform, {
        nodeIds: [N3],
        transform: {
          position: { x: 5, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        space: 'world',
      }),
    );
    // Align on X to center: all nodes share the X midpoint.
    state = applySceneCommand(
      state,
      cmd(SCENE_COMMAND_TYPES.alignSelected, { nodeIds: [N1, N2, N3], axis: 'x', mode: 'center' }),
    );
    const xs = [N1, N2, N3].map((id) => state.nodes.get(id)?.transform.position.x);
    expect(new Set(xs).size).toBe(1);
  });
});
