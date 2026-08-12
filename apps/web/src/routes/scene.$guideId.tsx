import {
  generateProceduralGlb,
  PROCEDURAL_TEMPLATES,
  type AssetMetadata,
  type ProceduralTemplate,
} from '@guideforge/assets';
import { guideSceneToSceneState, materializeSnapshot } from '@guideforge/collaboration';
import type { GuideCommand } from '@guideforge/commands';
import type { EntityId } from '@guideforge/domain';
import {
  createGeometricSurfaceAttachment,
  createSceneState,
  distanceBetweenNodes,
  evaluateSceneHealth,
  IDENTITY_TRANSFORM,
  SCENE_COMMAND_TYPES,
  type SceneAnnotation,
  type SceneNode,
  type SceneState,
  type Transform,
  type Vec3,
} from '@guideforge/scene-core';
import { SceneViewport } from '@guideforge/scene-react';
import { compileSpatialGuide, type SpatialCompilation } from '@guideforge/spatial-compiler';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { closeGuide, openGuide, type OpenGuideSession } from '../services/guideStore';
import {
  dispatchSceneCommand,
  loadScene,
  makeAssetUrlResolver,
  saveSceneToWorkingDoc,
} from '../services/sceneStore';

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
  const [alignAxis, setAlignAxis] = useState<'x' | 'y' | 'z'>('y');
  const [isolated, setIsolated] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [showCameras, setShowCameras] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  const [newLayerName, setNewLayerName] = useState('New layer');
  const [newAnnotationText, setNewAnnotationText] = useState('Label');
  const [newAnnotationKind, setNewAnnotationKind] = useState<SceneAnnotation['kind']>('label');
  const [newStepId, setNewStepId] = useState('step-1');
  const [undoStack, setUndoStack] = useState<SceneState[]>([]);
  const [redoStack, setRedoStack] = useState<SceneState[]>([]);
  const [assetHashes, setAssetHashes] = useState<string[]>([]);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [assetQuery, setAssetQuery] = useState('');
  const [spatialCompilation, setSpatialCompilation] = useState<SpatialCompilation | null>(null);
  const [spatialCompiling, setSpatialCompiling] = useState(false);
  const [spatialError, setSpatialError] = useState<string | null>(null);

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

  // Load the asset library (content-addressed metadata from Dexie) so the
  // asset browser can attach real GLB assets to scene nodes.
  useEffect(() => {
    if (!session) return;
    void session.db.assets
      .orderBy('hash')
      .toArray()
      .then((rows) => {
        setAssetHashes(rows.map((r) => r.hash));
      });
  }, [session]);
  /** Run a command, pushing the prior scene onto the undo stack. */
  function run(command: GuideCommand) {
    if (!session) return;
    const next = dispatchSceneCommand(session, command);
    if (next !== scene) {
      setUndoStack((s) => [...s, scene]);
      setRedoStack([]);
      setScene(next);
    }
  }

  function undo() {
    if (undoStack.length === 0 || !session) return;
    const prev = undoStack[undoStack.length - 1]!;
    setRedoStack((r) => [...r, scene]);
    setUndoStack((s) => s.slice(0, -1));
    session.working.doc.transact(() => {
      saveSceneToWorkingDoc(session, prev);
    }, 'guideforge:scene-undo');
    setScene(prev);
  }

  function redo() {
    if (redoStack.length === 0 || !session) return;
    const next = redoStack[redoStack.length - 1]!;
    setUndoStack((s) => [...s, scene]);
    setRedoStack((r) => r.slice(0, -1));
    session.working.doc.transact(() => {
      saveSceneToWorkingDoc(session, next);
    }, 'guideforge:scene-redo');
    setScene(next);
  }

  // Keyboard shortcuts (non-drag alternative for every transform action).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'w':
          setTransformMode('translate');
          break;
        case 'e':
          setTransformMode('rotate');
          break;
        case 'r':
          setTransformMode('scale');
          break;
        case 'delete':
        case 'backspace':
          if (selected.length === 1) handleRemoveSelected();
          break;
        case 'i':
          setIsolated((v) => !v);
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoStack, redoStack, scene, selected, session]);

  // Context-loss recovery: recreate the canvas by toggling a remount key.
  const [canvasKey, setCanvasKey] = useState(0);
  useEffect(() => {
    if (!contextLost) return;
    // Three.js can recover on demand after context loss by remounting.
    const t = window.setTimeout(() => {
      setCanvasKey((k) => k + 1);
      setContextLost(false);
    }, 500);
    return () => window.clearTimeout(t);
  }, [contextLost]);

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

  // Phase 03: all-axis align/distribute (X/Y/Z), isolate, layers, cameras,
  // annotations, and asset assignment.

  function handleAlignAxis() {
    if (selected.length < 2) return;
    void run(
      makeCommand(SCENE_COMMAND_TYPES.alignSelected, guideId, {
        nodeIds: selected,
        axis: alignAxis,
        mode: 'center',
      }),
    );
  }

  function handleDistributeAxis() {
    if (selected.length < 3) return;
    void run(
      makeCommand(SCENE_COMMAND_TYPES.distributeSelected, guideId, {
        nodeIds: selected,
        axis: alignAxis,
      }),
    );
  }

  function handleIsolate() {
    if (selected.length === 0) return;
    const nextIsolated = !isolated;
    setIsolated(nextIsolated);
    const visibleIds = new Set(nextIsolated ? selected : []);
    // Apply visibility to every node; isolate hides everything except the
    // selection, un-isolate restores all.
    for (const node of scene.nodes.values()) {
      if (node.visible !== (nextIsolated ? visibleIds.has(node.nodeId) : true)) {
        void run(
          makeCommand(SCENE_COMMAND_TYPES.toggleVisible, guideId, { nodeIds: [node.nodeId] }),
        );
      }
    }
  }

  function handleAddLayer() {
    const layerId = crypto.randomUUID() as EntityId;
    void run(
      makeCommand(SCENE_COMMAND_TYPES.addLayer, guideId, {
        layerId,
        name: newLayerName || 'New layer',
        color: '#f59e0b',
      }),
    );
  }

  function handleAssignLayer(layerId: string) {
    if (selected.length === 0) return;
    void run(makeCommand(SCENE_COMMAND_TYPES.setLayer, guideId, { nodeIds: selected, layerId }));
  }

  function handleAddCamera() {
    void run(
      makeCommand(SCENE_COMMAND_TYPES.addCamera, guideId, {
        bookmarkId: crypto.randomUUID(),
        name: `Camera ${scene.cameras.length + 1}`,
        position: { x: 5, y: 5, z: 5 },
        target: { x: 0, y: 0, z: 0 },
        orthographic: false,
        zoom: 1,
      }),
    );
  }

  function handleAddAnnotation() {
    if (selected.length === 0) return;
    const target = selected[0] as EntityId;
    const attachment = scene.surfaceAttachments.find((item) => item.nodeId === target);
    const annotation: SceneAnnotation = {
      annotationId: crypto.randomUUID() as EntityId,
      kind: newAnnotationKind,
      text: newAnnotationText || 'Label',
      attachmentId: attachment?.attachmentId ?? null,
      targetNodeId: target,
      targetPoint: attachment?.localPoint ?? null,
      offset: { x: 0, y: 40 },
      pathPoints: [],
      color: '#2dd4bf',
    };
    void run(makeCommand(SCENE_COMMAND_TYPES.addAnnotation, guideId, { annotation }));
  }

  function handleAddSurfaceAttachment() {
    if (selected.length !== 1) return;
    const node = scene.nodes.get(selected[0] as EntityId);
    if (!node) return;
    const attachment = createGeometricSurfaceAttachment({
      attachmentId: crypto.randomUUID() as EntityId,
      nodeId: node.nodeId,
      assetHash: node.assetHash,
      localPoint: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
    });
    void run(makeCommand(SCENE_COMMAND_TYPES.addSurfaceAttachment, guideId, { attachment }));
  }

  function handleReviewSurfaceAttachment(
    attachmentId: EntityId,
    reviewState: 'reviewed' | 'needs-correction',
  ) {
    void run(
      makeCommand(SCENE_COMMAND_TYPES.updateSurfaceAttachment, guideId, {
        attachmentId,
        patch: { reviewState },
      }),
    );
  }

  function handleUpdateSurfacePoint(attachmentId: EntityId, axis: 'x' | 'y' | 'z', value: number) {
    const attachment = scene.surfaceAttachments.find((item) => item.attachmentId === attachmentId);
    if (!attachment) return;
    void run(
      makeCommand(SCENE_COMMAND_TYPES.updateSurfaceAttachment, guideId, {
        attachmentId,
        patch: { localPoint: { ...attachment.localPoint, [axis]: value } },
      }),
    );
  }

  function handleRemoveSurfaceAttachment(attachmentId: EntityId) {
    void run(makeCommand(SCENE_COMMAND_TYPES.removeSurfaceAttachment, guideId, { attachmentId }));
  }

  function handleRemoveAnnotation(annotationId: string) {
    void run(makeCommand(SCENE_COMMAND_TYPES.removeAnnotation, guideId, { annotationId }));
  }

  function handleAddMeasurement() {
    if (selected.length !== 2) return;
    const fromNodeId = selected[0] as EntityId;
    const toNodeId = selected[1] as EntityId;
    void run(
      makeCommand(SCENE_COMMAND_TYPES.addMeasurement, guideId, {
        measurement: {
          measurementId: crypto.randomUUID() as EntityId,
          name: `${scene.nodes.get(fromNodeId)?.name ?? 'A'} to ${scene.nodes.get(toNodeId)?.name ?? 'B'}`,
          fromNodeId,
          toNodeId,
          value: distanceBetweenNodes(scene, fromNodeId, toNodeId),
        },
      }),
    );
  }

  function handleSetStepState() {
    if (!newStepId.trim()) return;
    void run(
      makeCommand(SCENE_COMMAND_TYPES.setStepState, guideId, {
        stepId: newStepId.trim(),
        step: { visibleNodeIds: [...selected], cameraId: scene.cameras[0]?.bookmarkId ?? null },
      }),
    );
  }

  function handleRemoveMeasurement(measurementId: EntityId) {
    void run(makeCommand(SCENE_COMMAND_TYPES.removeMeasurement, guideId, { measurementId }));
  }

  function handleAttachAsset(hash: string) {
    if (selected.length === 0) return;
    const node = scene.nodes.get(selected[0] as EntityId);
    if (!node) return;
    void run(
      makeCommand(SCENE_COMMAND_TYPES.setAsset, guideId, {
        nodeId: node.nodeId,
        assetHash: hash,
      }),
    );
  }

  async function handleImportAsset(file: File) {
    if (!session) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const meta = await session.assets.put(
        bytes,
        file.type || 'model/gltf-binary',
        file.name.split('.').pop() ?? 'glb',
      );
      setAssetHashes((h) => (h.includes(meta.hash) ? h : [...h, meta.hash]));
      setAssetError(null);
    } catch (err) {
      setAssetError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleAddProcedural(template: ProceduralTemplate) {
    if (!session) return;
    try {
      const bytes = generateProceduralGlb(template);
      const meta = await session.assets.put(bytes, 'model/gltf-binary', 'glb');
      setAssetHashes((h) => (h.includes(meta.hash) ? h : [...h, meta.hash]));
      setAssetError(null);
    } catch (err) {
      setAssetError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCompileSpatialGuide() {
    if (!session || spatialCompiling) return;
    setSpatialCompiling(true);
    setSpatialError(null);
    try {
      const rows = await session.db.assets.orderBy('hash').toArray();
      const assets = rows.filter(
        (row) => typeof (row as unknown as { name?: unknown }).name === 'string',
      ) as unknown as AssetMetadata[];
      const result = compileSpatialGuide({
        snapshot: materializeSnapshot(session.working),
        assets,
        seed: guideId,
      });
      for (const generated of result.proceduralAssets) {
        if (await session.db.assets.get(generated.contentHash)) continue;
        await session.assets.put(
          generateProceduralGlb(generated.template),
          'model/gltf-binary',
          'glb',
        );
        setAssetHashes((hashes) =>
          hashes.includes(generated.contentHash) ? hashes : [...hashes, generated.contentHash],
        );
      }
      const next = guideSceneToSceneState(result.scene);
      setUndoStack((stack) => [...stack, scene]);
      setRedoStack([]);
      session.working.doc.transact(
        () => saveSceneToWorkingDoc(session, next),
        'guideforge:spatial-compile',
      );
      setScene(next);
      setSelected([]);
      setSpatialCompilation(result);
    } catch (err) {
      setSpatialError(err instanceof Error ? err.message : String(err));
    } finally {
      setSpatialCompiling(false);
    }
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
          <button
            type="button"
            className="button button--small"
            onClick={() => void handleCompileSpatialGuide()}
            disabled={!loaded || spatialCompiling}
          >
            {spatialCompiling ? 'Compiling…' : 'Compile spatial guide'}
          </button>
        </div>
      </div>

      {spatialError && (
        <p role="alert" className="error-text">
          Spatial compiler: {spatialError}
        </p>
      )}
      {spatialCompilation && (
        <p role="status" aria-label="Spatial compiler result" className="health-banner">
          Spatial compiler: {spatialCompilation.scene.nodes.length} nodes,{' '}
          {spatialCompilation.scene.cameras.length} cameras,{' '}
          {spatialCompilation.scene.annotations.length} annotations ·{' '}
          {spatialCompilation.validation.warnings.length} proxy/warning(s)
        </p>
      )}

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
                onClick={handleIsolate}
                disabled={selected.length === 0}
                aria-pressed={isolated}
              >
                {isolated ? 'Un-isolate' : 'Isolate'}
              </button>
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={undo}
                disabled={undoStack.length === 0}
              >
                Undo
              </button>
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={redo}
                disabled={redoStack.length === 0}
              >
                Redo
              </button>
            </div>
            <div className="field-row" aria-label="Align and distribute">
              <select
                value={alignAxis}
                onChange={(e) => setAlignAxis(e.target.value as 'x' | 'y' | 'z')}
                aria-label="Align/distribute axis"
              >
                <option value="x">X</option>
                <option value="y">Y</option>
                <option value="z">Z</option>
              </select>
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={handleAlignAxis}
                disabled={selected.length < 2}
                title={`Align selected to center on ${alignAxis.toUpperCase()}`}
              >
                Align ({alignAxis.toUpperCase()})
              </button>
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={handleDistributeAxis}
                disabled={selected.length < 3}
                title={`Distribute selected evenly on ${alignAxis.toUpperCase()}`}
              >
                Distribute ({alignAxis.toUpperCase()})
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
            <div className="scene-panel-toggles" role="group" aria-label="Scene panels">
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={() => setShowAssets((v) => !v)}
                aria-pressed={showAssets}
              >
                Assets
              </button>
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={() => setShowLayers((v) => !v)}
                aria-pressed={showLayers}
              >
                Layers
              </button>
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={() => setShowCameras((v) => !v)}
                aria-pressed={showCameras}
              >
                Cameras
              </button>
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={() => setShowAnnotations((v) => !v)}
                aria-pressed={showAnnotations}
              >
                Annotations
              </button>
            </div>
          </aside>

          {/* Phase 03/04 panels: assets, layers, cameras, annotations */}
          {showAssets && (
            <aside className="scene-panel scene-panel--extra" aria-label="Asset library">
              <h2>Assets</h2>
              <label className="scene-file">
                Import GLB
                <input
                  type="file"
                  accept=".glb,.gltf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleImportAsset(f);
                  }}
                />
              </label>
              {assetError && <p className="error-text">{assetError}</p>}
              <div className="field-row">
                <select
                  value={newAnnotationKind}
                  onChange={(e) => setNewAnnotationKind(e.target.value as SceneAnnotation['kind'])}
                  aria-label="Annotation kind"
                >
                  <option value="label">Label</option>
                  <option value="arrow">Arrow</option>
                  <option value="callout">Callout</option>
                  <option value="highlight">Highlight</option>
                  <option value="path">Path</option>
                </select>
                <input
                  type="search"
                  value={assetQuery}
                  onChange={(e) => setAssetQuery(e.target.value)}
                  aria-label="Search assets"
                  placeholder="Search local assets…"
                />
              </div>
              <details className="scene-seeds">
                <summary>Procedural scientific templates (CC0, local)</summary>
                <div className="seed-grid">
                  {(
                    [
                      'simple-pipette',
                      'beaker',
                      'graduated-cylinder',
                      'peristaltic-pump',
                      'balance-proxy',
                      'workbench',
                    ] as const
                  ).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="button button--small button--ghost"
                      onClick={() => void handleAddProcedural(t)}
                    >
                      {PROCEDURAL_TEMPLATES[t].displayName}
                    </button>
                  ))}
                </div>
              </details>
              {assetHashes.length === 0 ? (
                <p className="empty-hint">
                  No assets yet. Import a GLB or add a procedural template to attach to a selected
                  node.
                </p>
              ) : (
                <ul className="asset-list">
                  {assetHashes.map((hash) => (
                    <li key={hash}>
                      <span className="asset-hash">{hash.slice(0, 10)}…</span>
                      <button
                        type="button"
                        className="button button--small"
                        onClick={() => handleAttachAsset(hash)}
                        disabled={selected.length !== 1}
                        title="Attach this asset to the selected node"
                      >
                        Attach
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          )}
          {showLayers && (
            <aside className="scene-panel scene-panel--extra" aria-label="Layers">
              <h2>Layers</h2>
              <ul className="layer-list">
                {Array.from(scene.layers.entries()).map(([id, layer]) => (
                  <li key={id}>
                    <span
                      className="layer-swatch"
                      style={{ background: layer.color }}
                      aria-hidden="true"
                    />
                    <span>{layer.name}</span>
                    <button
                      type="button"
                      className="button button--small"
                      onClick={() => handleAssignLayer(id)}
                      disabled={selected.length === 0}
                      title="Assign selected nodes to this layer"
                    >
                      Assign
                    </button>
                  </li>
                ))}
              </ul>
              <div className="field-row">
                <input
                  type="text"
                  value={newLayerName}
                  onChange={(e) => setNewLayerName(e.target.value)}
                  aria-label="New layer name"
                />
                <button type="button" className="button button--small" onClick={handleAddLayer}>
                  Add layer
                </button>
              </div>
            </aside>
          )}
          {showCameras && (
            <aside className="scene-panel scene-panel--extra" aria-label="Cameras">
              <h2>Cameras</h2>
              <button type="button" className="button button--small" onClick={handleAddCamera}>
                Add camera bookmark
              </button>
              {scene.cameras.length === 0 ? (
                <p className="empty-hint">No camera bookmarks yet.</p>
              ) : (
                <ul className="camera-list">
                  {scene.cameras.map((c) => (
                    <li key={c.bookmarkId}>
                      <span>{c.name}</span>
                      <span className="camera-pos">
                        ({round3(c.position.x)}, {round3(c.position.y)}, {round3(c.position.z)})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          )}
          {showAnnotations && (
            <aside className="scene-panel scene-panel--extra" aria-label="Annotations">
              <h2>Annotations</h2>
              <div className="field-row">
                <input
                  type="text"
                  value={newAnnotationText}
                  onChange={(e) => setNewAnnotationText(e.target.value)}
                  aria-label="Annotation text"
                />
                <button
                  type="button"
                  className="button button--small"
                  onClick={handleAddAnnotation}
                  disabled={selected.length === 0}
                >
                  Add label
                </button>
              </div>
              <div className="field-row">
                <button
                  type="button"
                  className="button button--small button--ghost"
                  onClick={handleAddMeasurement}
                  disabled={selected.length !== 2}
                >
                  Measure selected
                </button>
                <span className="empty-hint">Select two objects.</span>
              </div>
              {scene.measurements.length > 0 && (
                <ul className="annotation-list" aria-label="Measurements">
                  {scene.measurements.map((measurement) => (
                    <li key={measurement.measurementId}>
                      <span>
                        {measurement.name}:{' '}
                        {measurement.value === null ? '—' : round3(measurement.value)}
                      </span>
                      <button
                        type="button"
                        className="button button--small button--danger"
                        onClick={() => handleRemoveMeasurement(measurement.measurementId)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="field-row">
                <input
                  type="text"
                  value={newStepId}
                  onChange={(e) => setNewStepId(e.target.value)}
                  aria-label="Step state id"
                  placeholder="Step id"
                />
                <button
                  type="button"
                  className="button button--small button--ghost"
                  onClick={handleSetStepState}
                  disabled={selected.length === 0}
                >
                  Save step state
                </button>
              </div>
              <p className="empty-hint">
                Step state stores visible objects and the first camera; the same state is available
                to screen-reader users in this list.
              </p>
              {Object.entries(scene.stepStates).length > 0 && (
                <ul className="annotation-list" aria-label="Saved step states">
                  {Object.entries(scene.stepStates).map(([stepId, step]) => (
                    <li key={stepId}>
                      <span>
                        {stepId}: {step.visibleNodeIds.length} visible object(s)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="field-row">
                <button
                  type="button"
                  className="button button--small button--ghost"
                  onClick={handleAddSurfaceAttachment}
                  disabled={selected.length !== 1}
                >
                  Add local anchor
                </button>
                <span className="empty-hint">Review the point before release.</span>
              </div>
              <h3>Surface attachments</h3>
              {scene.surfaceAttachments.length === 0 ? (
                <p className="empty-hint">No anchors yet. Select an object and mark its control.</p>
              ) : (
                <ul className="annotation-list" aria-label="Surface attachments">
                  {scene.surfaceAttachments.map((attachment) => (
                    <li key={attachment.attachmentId}>
                      <span>
                        {attachment.nodeId.slice(0, 8)} · {attachment.reviewState}
                        <span className="scene-actions" aria-label="Correct local attachment point">
                          {(['x', 'y', 'z'] as const).map((axis) => (
                            <label key={axis} className="scene-axis">
                              {axis}
                              <input
                                type="number"
                                step={0.01}
                                value={round3(attachment.localPoint[axis])}
                                onChange={(event) =>
                                  handleUpdateSurfacePoint(
                                    attachment.attachmentId,
                                    axis,
                                    Number(event.target.value) || 0,
                                  )
                                }
                                aria-label={`${axis} local attachment coordinate`}
                              />
                            </label>
                          ))}
                        </span>
                      </span>
                      <span className="scene-actions">
                        <button
                          type="button"
                          className="button button--small"
                          onClick={() =>
                            handleReviewSurfaceAttachment(attachment.attachmentId, 'reviewed')
                          }
                        >
                          Review
                        </button>
                        <button
                          type="button"
                          className="button button--small button--ghost"
                          onClick={() =>
                            handleReviewSurfaceAttachment(
                              attachment.attachmentId,
                              'needs-correction',
                            )
                          }
                        >
                          Correct
                        </button>
                        <button
                          type="button"
                          className="button button--small button--danger"
                          onClick={() => handleRemoveSurfaceAttachment(attachment.attachmentId)}
                        >
                          Remove
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {scene.annotations.length === 0 ? (
                <p className="empty-hint">No annotations yet. Select a node and add a label.</p>
              ) : (
                <ul className="annotation-list">
                  {scene.annotations.map((a) => (
                    <li key={a.annotationId}>
                      <span>{a.text}</span>
                      <button
                        type="button"
                        className="button button--small button--danger"
                        onClick={() => handleRemoveAnnotation(a.annotationId)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          )}

          {/* Viewport */}
          <div className="scene-viewport">
            <SceneViewport
              key={canvasKey}
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
