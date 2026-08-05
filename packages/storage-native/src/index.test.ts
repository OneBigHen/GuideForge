import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MemoryCredentialStore, NativeFsAssetStore } from './index.js';

const sha = (b: Uint8Array) => Promise.resolve(createHash('sha256').update(b).digest('hex'));

describe('native asset store', () => {
  it('stores and retrieves bytes by content hash', async () => {
    const files = new Map<string, Uint8Array>();
    const store = new NativeFsAssetStore('/projects/p1', {
      writeFile: (p, b) => {
        files.set(p, b);
        return Promise.resolve();
      },
      readFile: (p) => {
        const b = files.get(p);
        if (!b) return Promise.reject(new Error('not found'));
        return Promise.resolve(b);
      },
      sha256Hex: sha,
    });
    const bytes = new Uint8Array([1, 2, 3]);
    const { hash } = await store.put(bytes, 'model/gltf-binary', 'glb');
    expect(hash).toHaveLength(64);
    expect(await store.get(hash)).toEqual(bytes);
    expect(await store.get('0'.repeat(64) as never)).toBeNull();
  });
});

describe('memory credential store', () => {
  it('sets, gets, and deletes secrets', async () => {
    const store = new MemoryCredentialStore();
    await store.set({ service: 'openrouter', account: 'default', value: 'sk-test' });
    expect(await store.get('openrouter', 'default')).toBe('sk-test');
    await store.delete('openrouter', 'default');
    expect(await store.get('openrouter', 'default')).toBeNull();
  });
});
