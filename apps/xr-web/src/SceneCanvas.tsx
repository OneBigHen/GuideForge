/**
 * Scene renderer for the XR viewer: inline 3D + immersive WebXR.
 */
import { Grid, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { ARButton, createXRStore, VRButton, XR } from '@react-three/xr';
import { Suspense, useMemo } from 'react';
import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const xrStore = createXRStore();

export function SceneCanvas({ entries }: { entries: Map<string, Uint8Array> }) {
  // Deterministic placeholder objects derived from the release's asset hashes
  // so the viewer always has something to render inline.
  const objects = useMemo(() => {
    const list: { id: string; position: [number, number, number]; color: string }[] = [];
    let i = 0;
    for (const path of entries.keys()) {
      if (path.startsWith('assets/') && i < 8) {
        list.push({
          id: path,
          position: [(i % 3) * 1.5, 0.75, Math.floor(i / 3) * 1.5],
          color: ['#2dd4bf', '#38bdf8', '#a78bfa', '#f472b6'][i % 4]!,
        });
        i += 1;
      }
    }
    return list;
  }, [entries]);

  return (
    <>
      <VRButton store={xrStore} />
      <ARButton store={xrStore} />
      <Canvas frameloop="demand" dpr={[1, 2]} style={{ height: '70vh' }}>
        <XR store={xrStore}>
          <Suspense fallback={null}>
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 10, 7]} intensity={1} />
            <Grid
              args={[20, 20]}
              cellSize={1}
              cellThickness={0.6}
              cellColor="#64748b"
              sectionSize={5}
              sectionThickness={1}
              sectionColor="#94a3b8"
              infiniteGrid
            />
            <OrbitControls makeDefault enableDamping={false} />
            {objects.map((o) => (
              <mesh key={o.id} position={o.position}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color={o.color} />
              </mesh>
            ))}
          </Suspense>
        </XR>
      </Canvas>
    </>
  );
}

export function loadGlb(bytes: Uint8Array): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.parse(bytes.buffer as ArrayBuffer, '', (gltf) => resolve(gltf.scene), reject);
  });
}
