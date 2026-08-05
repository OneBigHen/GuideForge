import type { GuideCommand } from '@guideforge/commands';
import type { EntityId } from '@guideforge/domain';
import {
  createSceneState,
  evaluateSceneHealth,
  IDENTITY_TRANSFORM,
  SCENE_COMMAND_TYPES,
  type SceneNode,
  type SceneState,
  type Transform,
  type Vec3,
} from '@guideforge/scene-core';
import { SceneViewport } from '@guideforge/scene-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { closeGuide, openGuide, type OpenGuideSession } from '../services/guideStore';
import { dispatchSceneCommand, loadScene, makeAssetUrlResolver } from '../services/sceneStore';

export const Route = createFileRoute('/scene/$guideId')({
  component: SceneEditorPage,
});

function makeCommand(commandType: string, guideId: string, payload: unknown): GuideCommand {
  return {
    commandId: crypto.randomUUID(),
    commandType,
    actorId: 'local-user',
    guideId: guideId as GuideCommand['guideId'],
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload,
  };
}

const T = (
  p: Vec3,
  r?: Partial<Transform['rotation']>,
  s?: Partial<Transform['scale']>,
): Transform => ({
  position: p,
  rotation: { x: 0, y: 0, z: 0, w: 1, ...r },
  scale: { x: 1, y: 1, z: 1, ...s },
});

function SceneEditorPage() {
  const { guideId } = Route.useParams();
  const [session, setSession] = useState<OpenGuideSession | null>(null);
  const [scene, setScene] = useState<SceneState>(() => createSceneState());
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [space, setSpace] = useState<'world' | 'local'>('world');
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [gridSize, setGridSize] = useState(1);
  const [contextLost, setContextLost] = useState(false);
  const [newNodeName, setNewNodeName] = useState('Cube');

  useEffect(() => {
    let cancelled = false;
    void openGuide(guideId).then((s) => {
      if (cancelled) return;
      setSession(s);
      // Canonical scene comes from the working Yjs document.
      setScene(loadScene(s));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
      if (session) void closeGuide(session);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideId]);

  function run(command: GuideCommand) {
    if (!session) return;
    const next = dispatchSceneCommand(session, command);
    setScene(next);
  }

  function handleAddNode() {
    const nodeId = crypto.randomUUID() as EntityId;
    void run(
      makeCommand(SCENE_COMMAND_TYPES.addNode, guideId, {
        node: {
          nodeId,
          name: newNodeName || 'Cube',
          parentId: null,
          assetHash: null,
          transform: T({ x: 0, y: 1, z: 0 }),
          layerId: 'default',
          visible: true,
          locked: false,
          metadata: {},
        } satisfies SceneNode,
      }),
    );
    setSelected([nodeId]);
  }

  function handleRemoveSelected() {
    if (selected.length !== 1) return;
    void run(makeCommand(SCENE_COMMAND_TYPES.removeNode, guideId, { nodeId: selected[0] }));
    setSelected([]);
  }

  function handleAlign() {
    if (selected.length < 2) return;
    void run(
      makeCommand(SCENE_COMMAND_TYPES.alignSelected, guideId, {
        nodeIds: selected,
        axis: 'y',
        mode: 'center',
      }),
    );
  }

  function handleDistribute() {
    if (selected.length < 3) return;
    void run(
      makeCommand(SCENE_COMMAND_TYPES.distributeSelected, guideId, {
        nodeIds: selected,
        axis: 'y',
      }),
    );
  }

  function handleSelect(nodeId: string, additive: boolean) {
    setSelected((prev) =>
      additive
        ? prev.includes(nodeId)
          ? prev.filter((x) => x !== nodeId)
          : [...prev, nodeId]
        : [nodeId],
    );
  }

  function handleToggleVisible(nodeIds?: string[]) {
    // Explicit nodeIds avoid acting on a stale `selected` closure (the row
    // buttons previously setState then read the old selection).
    void run(
      makeCommand(SCENE_COMMAND_TYPES.toggleVisible, guideId, { nodeIds: nodeIds ?? selected }),
    );
  }

  function handleToggleLock(nodeIds?: string[]) {
    void run(
      makeCommand(SCENE_COMMAND_TYPES.toggleLock, guideId, { nodeIds: nodeIds ?? selected }),
    );
  }

  function handleTransform(nodeId: string, transform: Transform, drag: boolean) {
    void run(
      makeCommand(SCENE_COMMAND_TYPES.setTransform, guideId, {
        nodeIds: [nodeId],
        transform,
        space,
        drag,
      }),
    );
  }

  function handleNumeric(patch: Partial<Transform>) {
    void run(
      makeCommand(SCENE_COMMAND_TYPES.setNumericTransform, guideId, {
        nodeIds: selected,
        patch,
        space,
      }),
    );
  }

  const selectedNode = selected.length === 1 ? scene.nodes.get(selected[0] as EntityId) : null;
  const health = useMemo(() => evaluateSceneHealth(scene), [scene]);
  const assetUrl = useMemo(() => makeAssetUrlResolver(new Map()), []);

  const hierarchy = useMemo(() => buildHierarchy(scene), [scene]);

  return (
    <section className="scene-layout" aria-labelledby="scene-title">
      <div className="edit-header">
        <Link to="/edit/$guideId" params={{ guideId }} className="button button--ghost">
          ← Editor
        </Link>
        <h1 id="scene-title">Spatial editor</h1>
        <div className="edit-header__actions">
          <Link to="/edit/$guideId" params={{ guideId }} className="button button--small">
            Back to guide
          </Link>
        </div>
      </div>

      {contextLost && (
        <p role="alert" className="error-text">
          WebGL context was lost. Reload the page to restore the viewport.
        </p>
      )}
      {!health.ok && (
        <div role="status" className="health-banner">
          Scene health: {health.warnings.join('; ') || 'invalid transforms'}
        </div>
      )}

      {loaded && (
        <div className="scene-grid">
          {/* Hierarchy rail */}
          <aside className="scene-panel" aria-label="Scene hierarchy">
            <h2>Hierarchy</h2>
            <ul className="scene-tree" aria-label="Scene objects">
              {hierarchy.map((row) => (
                <li
                  key={row.nodeId}
                  className={`scene-tree__item scene-tree__item--depth-${row.depth} ${
                    selected.includes(row.nodeId) ? 'scene-tree__item--selected' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="scene-tree__select"
                    onClick={() => handleSelect(row.nodeId, false)}
                    aria-pressed={selected.includes(row.nodeId)}
                  >
                    {row.node.visible ? '👁' : '🚫'} {row.node.name}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Toggle visibility of ${row.node.name}`}
                    onClick={() => handleToggleVisible([row.nodeId])}
                  >
                    {row.node.visible ? 'Hide' : 'Show'}
                  </button>
                </li>
              ))}
            </ul>
            <div className="field-row">
              <input
                type="text"
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                aria-label="New object name"
              />
              <button type="button" className="button button--small" onClick={handleAddNode}>
                Add
              </button>
            </div>
            <div className="scene-actions">
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={() => handleToggleVisible()}
                disabled={selected.length === 0}
              >
                {selectedNode?.visible ? 'Hide' : 'Show'} selected
              </button>
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={() => handleToggleLock()}
                disabled={selected.length === 0}
              >
                {selectedNode?.locked ? 'Unlock' : 'Lock'}
              </button>
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={handleAlign}
                disabled={selected.length < 2}
                title="Align selected objects to their center on the Y axis"
              >
                Align (Y)
              </button>
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={handleDistribute}
                disabled={selected.length < 3}
                title="Distribute selected objects evenly on the Y axis"
              >
                Distribute (Y)
              </button>
              <button
                type="button"
                className="button button--small button--danger"
                onClick={handleRemoveSelected}
                disabled={selected.length !== 1}
              >
                Delete
              </button>
            </div>
          </aside>

          {/* Viewport */}
          <div className="scene-viewport">
            <SceneViewport
              state={scene}
              selectedNodeIds={selected}
              transformMode={transformMode}
              space={space}
              snapEnabled={snapEnabled}
              gridSize={gridSize}
              assetUrl={assetUrl}
              onSelect={handleSelect}
              onTransform={handleTransform}
              onContextLost={() => setContextLost(true)}
            />
            <div className="viewport-toolbar" role="toolbar" aria-label="Transform tools">
              {(['translate', 'rotate', 'scale'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`button button--small ${transformMode === mode ? 'button--active' : ''}`}
                  onClick={() => setTransformMode(mode)}
                  aria-pressed={transformMode === mode}
                >
                  {mode}
                </button>
              ))}
              <span className="viewport-sep" aria-hidden="true" />
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={() => setSpace((s) => (s === 'world' ? 'local' : 'world'))}
                aria-pressed={space === 'local'}
              >
                {space}
              </button>
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={() => setSnapEnabled((v) => !v)}
                aria-pressed={snapEnabled}
              >
                Snap {snapEnabled ? 'on' : 'off'}
              </button>
              <label className="viewport-grid">
                Grid
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={gridSize}
                  onChange={(e) => setGridSize(Number(e.target.value) || 1)}
                  aria-label="Grid size"
                />
              </label>
            </div>
          </div>

          {/* Inspector */}
          <aside className="scene-panel" aria-label="Inspector">
            <h2>Inspector</h2>
            {selectedNode ? (
              <>
                <p className="scene-node-name">
                  <strong>{selectedNode.name}</strong>
                  <span className="scene-node-id">{selectedNode.nodeId}</span>
                </p>
                <fieldset className="scene-fieldset">
                  <legend>Position</legend>
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <label key={axis} className="scene-axis">
                      {axis}
                      <input
                        type="number"
                        step={0.1}
                        value={round3(selectedNode.transform.position[axis])}
                        onChange={(e) =>
                          handleNumeric({
                            position: {
                              ...selectedNode.transform.position,
                              [axis]: Number(e.target.value) || 0,
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </fieldset>
                <fieldset className="scene-fieldset">
                  <legend>Scale</legend>
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <label key={axis} className="scene-axis">
                      {axis}
                      <input
                        type="number"
                        step={0.1}
                        value={round3(selectedNode.transform.scale[axis])}
                        onChange={(e) =>
                          handleNumeric({
                            scale: {
                              ...selectedNode.transform.scale,
                              [axis]: Number(e.target.value) || 1,
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </fieldset>
                <button
                  type="button"
                  className="button button--small button--ghost"
                  onClick={() => handleNumeric({ ...IDENTITY_TRANSFORM })}
                >
                  Reset transform
                </button>
              </>
            ) : (
              <p className="empty-hint">
                Select an object to edit it. Numeric fields provide a non-drag alternative.
              </p>
            )}
          </aside>
        </div>
      )}

      {!loaded && <p>Loading scene…</p>}
    </section>
  );
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

interface HierarchyRow {
  nodeId: string;
  node: SceneNode;
  depth: number;
}

function buildHierarchy(scene: SceneState): HierarchyRow[] {
  const rows: HierarchyRow[] = [];
  const visit = (nodeId: string, depth: number) => {
    const node = scene.nodes.get(nodeId as EntityId);
    if (!node) return;
    rows.push({ nodeId, node, depth });
    for (const [id, n] of scene.nodes) {
      if (n.parentId === nodeId) visit(id, depth + 1);
    }
  };
  for (const id of scene.rootOrder) visit(id, 0);
  return rows;
}
