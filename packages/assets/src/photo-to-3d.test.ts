import type { ContentHash } from '@guideforge/domain';
import { describe, expect, it } from 'vitest';
import {
  buildBlenderCleanupPlan,
  buildPhotoReuseKey,
  createPhotoTo3DJob,
  planPhotoTo3D,
  preparePhotoSet,
  sanitizePhoto,
  transitionPhotoTo3DJob,
} from './photo-to-3d.js';

const HASH = 'a'.repeat(64) as ContentHash;
const HASHES = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)] as ContentHash[];

function pngWithExif(): Uint8Array {
  const chunk = (type: string, data: number[]) => {
    const result = new Uint8Array(12 + data.length);
    new DataView(result.buffer).setUint32(0, data.length, false);
    result.set(new TextEncoder().encode(type), 4);
    result.set(data, 8);
    return result;
  };
  const ihdr = chunk('IHDR', [0, 0, 3, 32, 0, 0, 3, 32, 8, 6, 0, 0, 0]);
  const exif = chunk('eXIf', [1, 2, 3]);
  const iend = chunk('IEND', []);
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...ihdr, ...exif, ...iend]);
}

describe('photo-to-3d preparation', () => {
  it('strips PNG EXIF metadata before queueing', () => {
    const sanitized = sanitizePhoto(pngWithExif(), 'image/png');
    expect(sanitized.metadataRemoved).toBe(true);
    expect(sanitized.bytes).not.toContain(101);
    expect(sanitized.width).toBe(800);
    expect(sanitized.height).toBe(800);
  });

  it('requires enough distinct, sufficiently sized views', () => {
    const view = (id: string) => ({
      viewId: id,
      filename: `${id}.png`,
      mimeType: 'image/png' as const,
      bytes: pngWithExif(),
      viewLabel: id,
    });
    expect(preparePhotoSet([view('front')]).report.accepted).toBe(false);
    const prepared = preparePhotoSet([view('front'), view('side'), view('back')]);
    expect(prepared.report.accepted).toBe(true);
    expect(prepared.report.metadataStrippedCount).toBe(3);
  });
});

describe('photo-to-3d job policy', () => {
  it('blocks missing license/GPU capability and supports reuse planning', () => {
    const blocked = planPhotoTo3D({
      sourceHashes: HASHES,
      providerId: 'hunyuan3d-2gp',
      gpuProfileId: 'cpu',
      licenseAccepted: false,
    });
    expect(blocked.status).toBe('blocked');
    expect(blocked.reasons.join(' ')).toMatch(/license|GPU/);

    const reuseKey = buildPhotoReuseKey(HASHES, 'tripo-sr', 'cuda-8gb');
    expect(
      planPhotoTo3D({
        sourceHashes: HASHES,
        providerId: 'tripo-sr',
        gpuProfileId: 'cuda-8gb',
        licenseAccepted: true,
        existingReuseKeys: [reuseKey],
      }).status,
    ).toBe('reuse');
  });

  it('supports cancel, pause/resume, approval, cleanup, and completion', () => {
    let job = createPhotoTo3DJob({
      jobId: 'job-1',
      sourceHashes: HASHES,
      providerId: 'tripo-sr',
      gpuProfileId: 'cuda-8gb',
      licenseAccepted: true,
      nowIso: '2026-08-11T00:00:00.000Z',
    });
    job = transitionPhotoTo3DJob(job, { type: 'start', nowIso: '2026-08-11T00:01:00.000Z' });
    job = transitionPhotoTo3DJob(job, { type: 'pause', nowIso: '2026-08-11T00:02:00.000Z' });
    job = transitionPhotoTo3DJob(job, { type: 'resume', nowIso: '2026-08-11T00:03:00.000Z' });
    job = transitionPhotoTo3DJob(job, { type: 'draft-ready', nowIso: '2026-08-11T00:04:00.000Z' });
    job = transitionPhotoTo3DJob(job, {
      type: 'approve-texture',
      nowIso: '2026-08-11T00:05:00.000Z',
    });
    job = transitionPhotoTo3DJob(job, { type: 'cleanup', nowIso: '2026-08-11T00:06:00.000Z' });
    job = transitionPhotoTo3DJob(job, {
      type: 'complete',
      nowIso: '2026-08-11T00:07:00.000Z',
      outputAssetHash: HASH,
    });
    expect(job.status).toBe('completed');
    expect(job.provenance.cleanupVersion).toBe('blender-safe-cleanup-v1');
  });

  it('persists provider failure such as GPU OOM and permits explicit cancellation', () => {
    let job = createPhotoTo3DJob({
      jobId: 'job-oom',
      sourceHashes: HASHES,
      providerId: 'tripo-sr',
      gpuProfileId: 'cuda-8gb',
      licenseAccepted: true,
      nowIso: '2026-08-11T00:00:00.000Z',
    });
    job = transitionPhotoTo3DJob(job, { type: 'start', nowIso: '2026-08-11T00:01:00.000Z' });
    job = transitionPhotoTo3DJob(job, {
      type: 'fail',
      nowIso: '2026-08-11T00:02:00.000Z',
      error: 'GPU out of memory',
    });
    expect(job.status).toBe('failed');
    expect(job.error).toBe('GPU out of memory');
    expect(() =>
      transitionPhotoTo3DJob(job, { type: 'pause', nowIso: '2026-08-11T00:03:00.000Z' }),
    ).toThrow(/not resumable/);
    expect(
      transitionPhotoTo3DJob(job, { type: 'cancel', nowIso: '2026-08-11T00:04:00.000Z' }).status,
    ).toBe('cancelled');
  });

  it('returns an argv-only Blender cleanup plan and rejects traversal', () => {
    expect(buildBlenderCleanupPlan({ jobId: 'job-1', draftFilename: 'draft.glb' }).args[0]).toBe(
      '--background',
    );
    expect(() => buildBlenderCleanupPlan({ jobId: '../bad', draftFilename: 'draft.glb' })).toThrow(
      'unsafe job id',
    );
  });
});
