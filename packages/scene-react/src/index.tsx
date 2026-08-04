/**
 * @guideforge/scene-react — React Three Fiber adapter for scene-core.
 *
 * Renders serializable SceneState; persists nothing. Supports:
 *  - transform gizmos (drei TransformControls)
 *  - GLB loading by content hash (via URL resolver)
 *  - demand rendering with explicit invalidation
 *  - grid + snap feedback
 *  - context-loss recovery hook
 */
import type { EntityId } from '@guideforge/domain';
import type { SceneNode, SceneState, Transform } from '@guideforge/scene-core';
import { Grid, OrbitControls, TransformControls, useGLTF } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type * as THREE from 'three';

export type AssetUrlResolver = (assetHash: string) => string | null;

export interface SceneViewportProps {
  state: SceneState;
  selectedNodeIds: string[];
  transformMode: 'translate' | 'rotate' | 'scale';
  space: 'world' | 'local';
  snapEnabled: boolean;
  gridSize: number;
  assetUrl: AssetUrlResolver;
  onSelect: (nodeId: string, additive: boolean) => void;
  onTransform: (nodeId: string, transform: Transform, drag: boolean) => void;
  onTransformEnd?: () => void;
  onContextLost?: () => void;
}

export function SceneViewport(props: SceneViewportProps) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          props.onContextLost?.();
        });
      }}
      aria-label="3D scene viewport"
      role="application"
    >
      <SceneContents {...props} />
    </Canvas>
  );
}

function SceneContents(props: SceneViewportProps) {
  const { invalidate } = useThree();

  useEffect(() => {
    invalidate();
  }, [props.state, props.selectedNodeIds, props.transformMode, props.space, invalidate]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 7]} intensity={1} />
      <Grid
        args={[20, 20]}
        cellSize={props.gridSize}
        cellThickness={0.6}
        cellColor="#64748b"
        sectionSize={props.gridSize * 5}
        sectionThickness={1}
        sectionColor="#94a3b8"
        fadeDistance={40}
        fadeStrength={1}
        infiniteGrid
      />
      <OrbitControls makeDefault enableDamping={false} />

      {[...props.state.nodes.values()].map((node) => (
        <SceneNodeObject
          key={node.nodeId}
          node={node}
          selected={props.selectedNodeIds.includes(node.nodeId)}
          assetUrl={props.assetUrl}
          onSelect={(additive) => props.onSelect(node.nodeId, additive)}
        />
      ))}

      {(() => {
        const single = props.selectedNodeIds[0];
        if (!single) return null;
        const node = props.state.nodes.get(single as EntityId);
        if (!node) return null;
        return (
          <SelectedGizmo
            node={node}
            mode={props.transformMode}
            space={props.space}
            snapEnabled={props.snapEnabled}
            snapSize={props.gridSize}
            onTransform={(t) => props.onTransform(single, t, true)}
            {...(props.onTransformEnd ? { onTransformEnd: props.onTransformEnd } : {})}
            invalidate={invalidate}
          />
        );
      })()}
    </>
  );
}

function SceneNodeObject({
  node,
  selected,
  assetUrl,
  onSelect,
}: {
  node: SceneNode;
  selected: boolean;
  assetUrl: AssetUrlResolver;
  onSelect: (additive: boolean) => void;
}) {
  const url = node.assetHash ? assetUrl(node.assetHash) : null;

  return (
    <group
      position={[node.transform.position.x, node.transform.position.y, node.transform.position.z]}
      quaternion={[
        node.transform.rotation.x,
        node.transform.rotation.y,
        node.transform.rotation.z,
        node.transform.rotation.w,
      ]}
      scale={[node.transform.scale.x, node.transform.scale.y, node.transform.scale.z]}
      visible={node.visible}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e.shiftKey);
      }}
    >
      {url ? (
        <LoadedGlb url={url} />
      ) : (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color={selected ? '#2dd4bf' : '#94a3b8'}
            wireframe={!node.assetHash}
          />
        </mesh>
      )}
    </group>
  );
}

function LoadedGlb({ url }: { url: string }) {
  const gltf = useGLTF(url);
  return <primitive object={gltf.scene} />;
}

const SelectedGizmo = (props: {
  node: SceneNode;
  mode: 'translate' | 'rotate' | 'scale';
  space: 'world' | 'local';
  snapEnabled: boolean;
  snapSize: number;
  onTransform: (t: Transform) => void;
  onTransformEnd?: () => void;
  invalidate: () => void;
}) => {
  const { node } = props;
  const groupRef = useRef<THREE.Group>(null);

  return (
    <group
      ref={groupRef}
      position={[node.transform.position.x, node.transform.position.y, node.transform.position.z]}
    >
      <TransformControls
        mode={props.mode}
        space={props.space}
        translationSnap={props.snapEnabled ? props.snapSize : null}
        rotationSnap={props.snapEnabled ? (Math.PI / 180) * 15 : null}
        scaleSnap={props.snapEnabled ? 0.1 : null}
        {...(props.onTransformEnd ? { onMouseUp: props.onTransformEnd } : {})}
        onChange={() => {
          props.invalidate();
          const g = groupRef.current;
          if (!g) return;
          props.onTransform({
            position: {
              x: g.position.x,
              y: g.position.y,
              z: g.position.z,
            },
            rotation: {
              x: g.quaternion.x,
              y: g.quaternion.y,
              z: g.quaternion.z,
              w: g.quaternion.w,
            },
            scale: { x: g.scale.x, y: g.scale.y, z: g.scale.z },
          });
        }}
      />
    </group>
  );
};

export function useSceneContextLoss(onLost: () => void): void {
  // Handled at the Canvas level via onCreated (webglcontextlost). Kept as a
  // documented no-op hook so future renderers can hook the same event.
  void onLost;
}
