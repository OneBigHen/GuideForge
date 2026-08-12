import {
  createPhotoTo3DJob,
  preparePhotoSet,
  transitionPhotoTo3DJob,
  type GpuProfile,
  type PhotoTo3DJob,
  type PhotoTo3DJobEvent,
  type PhotoTo3DProviderId,
  type PhotoViewInput,
  type PreparedPhotoSet,
} from '@guideforge/assets';
import type { ContentHash } from '@guideforge/domain';
import { loadSourceBytes, storeSourceBytes, type GuideForgeDb } from '@guideforge/storage-web';
import { sha256Hex } from './sourceStudio';

export interface QueuePhotoJobInput {
  views: PhotoViewInput[];
  providerId: PhotoTo3DProviderId;
  gpuProfileId: GpuProfile['id'];
  licenseAccepted: boolean;
  jobId: string;
  nowIso?: string;
}

export interface QueuedPhotoJob {
  prepared: PreparedPhotoSet;
  job: PhotoTo3DJob;
}

export async function prepareAndQueuePhotoJob(
  db: GuideForgeDb,
  input: QueuePhotoJobInput,
): Promise<QueuedPhotoJob> {
  const prepared = preparePhotoSet(input.views);
  if (!prepared.report.accepted) throw new Error(prepared.report.reasons.join('; '));
  const sourceHashes: ContentHash[] = [];
  for (const view of prepared.views) {
    const hash = await sha256Hex(view.bytes);
    await storeSourceBytes(db, hash, view.bytes);
    sourceHashes.push(hash);
  }
  const existingReuseKeys = (await db.photoJobs.toArray()).map((job) => job.reuseKey);
  const job = createPhotoTo3DJob({
    jobId: input.jobId,
    sourceHashes,
    providerId: input.providerId,
    gpuProfileId: input.gpuProfileId,
    licenseAccepted: input.licenseAccepted,
    existingReuseKeys,
    nowIso: input.nowIso ?? new Date().toISOString(),
  });
  await db.photoJobs.put(job);
  return { prepared, job };
}

export async function listPhotoTo3DJobs(db: GuideForgeDb): Promise<PhotoTo3DJob[]> {
  return (await db.photoJobs.toArray()).sort((a, b) =>
    b.updatedAtIso.localeCompare(a.updatedAtIso),
  );
}

export async function transitionStoredPhotoJob(
  db: GuideForgeDb,
  jobId: string,
  event: PhotoTo3DJobEvent,
): Promise<PhotoTo3DJob> {
  const job = await db.photoJobs.get(jobId);
  if (!job) throw new Error('photo-to-3D job not found');
  const next = transitionPhotoTo3DJob(job, event);
  await db.photoJobs.put(next);
  return next;
}

export async function loadPhotoInput(
  db: GuideForgeDb,
  hash: ContentHash,
): Promise<Uint8Array | null> {
  return loadSourceBytes(db, hash);
}
