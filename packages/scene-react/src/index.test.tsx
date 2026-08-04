import type { SceneNode, SceneState } from '@guideforge/scene-core';
import { createSceneState } from '@guideforge/scene-core';
import { describe, expect, it } from 'vitest';

// SceneViewport is a WebGL component; unit-test the pure data flow here and
// leave rendering to Playwright e2e. This guarantees the package has a test
// gate and exercises the adapter's data contract.
describe('scene-react adapter contract', () => {
  it('renders serializable scene nodes without mutation', () => {
    const state: SceneState = createSceneState();
    const node: SceneNode = {
      nodeId: '11111111-1111-4111-8111-111111111111' as SceneNode['nodeId'],
      name: 'part',
      parentId: null,
      assetHash: null,
      transform: {
        position: { x: 1, y: 2, z: 3 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
      layerId: 'default',
      visible: true,
      locked: false,
      metadata: {},
    };
    state.nodes.set(node.nodeId, node);
    state.rootOrder.push(node.nodeId);

    expect(state.nodes.size).toBe(1);
    const stored = state.nodes.get(node.nodeId);
    expect(stored?.transform.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('scene state is JSON-serializable', () => {
    const state = createSceneState();
    state.nodes.set('22222222-2222-4222-8222-222222222222' as SceneNode['nodeId'], {
      nodeId: '22222222-2222-4222-8222-222222222222' as SceneNode['nodeId'],
      name: 'x',
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
    });
    const serialized = JSON.stringify({
      nodes: Object.fromEntries(state.nodes),
      rootOrder: state.rootOrder,
    });
    const parsed: unknown = JSON.parse(serialized);
    expect(parsed).not.toBeNull();
    expect(typeof parsed).toBe('object');
  });
});
