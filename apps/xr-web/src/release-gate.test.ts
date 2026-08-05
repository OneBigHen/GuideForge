import type { GuideSnapshot } from '@guideforge/guide-schema';
import {
  createReleasePackage,
  generateSigningKeyPair,
  verifyReleasePackage,
} from '@guideforge/package-gforge';
import { describe, expect, it } from 'vitest';

const GUIDE_ID = '123e4567-e89b-42d3-a456-426614174000';

function snapshot(): GuideSnapshot {
  return {
    schemaVersion: 2,
    guideId: GUIDE_ID as GuideSnapshot['guideId'],
    title: 'XR release',
    description: '',
    lifecycleState: 'released',
    createdAtIso: '2026-01-01T00:00:00Z',
    updatedAtIso: '2026-01-01T00:00:00Z',
    tasks: [],
    steps: [],
    scene: {
      nodes: [],
      rootOrder: [],
      layers: [
        { layerId: 'default', name: 'Default', visible: true, locked: false, color: '#2dd4bf' },
      ],
      cameras: [],
      measurements: [],
      annotations: [],
      stepStates: {},
    },
    training: {
      objectives: [],
      assessmentItems: [],
      modules: [],
      mastery: { requiredCriticalItems: 0, passThreshold: 0.8, maxAttempts: 3 },
    },
    sources: [],
  };
}

describe('xr-web release gating', () => {
  it('only renders releases that verify offline', () => {
    const pair = generateSigningKeyPair();
    const good = createReleasePackage({
      snapshot: snapshot(),
      assets: new Map(),
      privateKeyHex: pair.privateKeyHex,
      keyId: 'k1',
      release: {
        releaseId: 'r1',
        releaseVersion: '1.0.0',
        createdAt: '2026-01-01T00:00:00Z',
        guideId: GUIDE_ID,
      },
    });
    expect(verifyReleasePackage(good).ok).toBe(true);

    // Tamper: viewer must refuse to render.
    const tampered = good.slice();
    tampered[100] = tampered[100]! ^ 0xff;
    expect(verifyReleasePackage(tampered).ok).toBe(false);
  });

  it('rejects arbitrary non-release payloads', () => {
    expect(verifyReleasePackage(new Uint8Array([1, 2, 3])).ok).toBe(false);
    expect(verifyReleasePackage(new Uint8Array(0)).ok).toBe(false);
  });
});
