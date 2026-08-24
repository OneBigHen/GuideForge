import type { ContentHash } from '@guideforge/domain';

export type PhotoMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type PhotoTo3DProviderId = 'hunyuan3d-2gp' | 'tripo-sr';
export type PhotoTo3DJobStatus =
  | 'blocked'
  | 'queued'
  | 'preprocessing'
  | 'shape-draft'
  | 'paused'
  | 'awaiting-approval'
  | 'texturing'
  | 'cleaning'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface PhotoViewInput {
  viewId: string;
  filename: string;
  mimeType: PhotoMimeType;
  bytes: Uint8Array;
  viewLabel?: string;
}

export interface SanitizedPhoto {
  bytes: Uint8Array;
  mimeType: PhotoMimeType;
  width: number;
  height: number;
  metadataRemoved: boolean;
}

export interface PhotoQualityReport {
  accepted: boolean;
  reasons: string[];
  viewCount: number;
  uniqueViewCount: number;
  minWidth: number;
  minHeight: number;
  metadataStrippedCount: number;
}

export interface PreparedPhotoSet {
  views: (Omit<SanitizedPhoto, 'bytes'> & {
    viewId: string;
    filename: string;
    bytes: Uint8Array;
  })[];
  report: PhotoQualityReport;
}

export interface PhotoProviderDescriptor {
  id: PhotoTo3DProviderId;
  name: string;
  minVramGb: number;
  licenseUrl: string;
  requiresLicenseAcceptance: boolean;
  mode: 'local-gpu';
}

export const PHOTO_TO_3D_PROVIDERS: Record<PhotoTo3DProviderId, PhotoProviderDescriptor> = {
  'hunyuan3d-2gp': {
    id: 'hunyuan3d-2gp',
    name: 'Hunyuan3D-2GP',
    minVramGb: 8,
    licenseUrl: 'https://github.com/Tencent-Hunyuan/Hunyuan3D-2',
    requiresLicenseAcceptance: true,
    mode: 'local-gpu',
  },
  'tripo-sr': {
    id: 'tripo-sr',
    name: 'TripoSR',
    minVramGb: 6,
    licenseUrl: 'https://github.com/VAST-AI-Research/TripoSR',
    requiresLicenseAcceptance: true,
    mode: 'local-gpu',
  },
};

export interface GpuProfile {
  id: 'cpu' | 'cuda-8gb' | 'cuda-12gb' | 'metal-8gb';
  label: string;
  vramGb: number;
  backend: 'none' | 'cuda' | 'metal';
}

export const GPU_PROFILES: GpuProfile[] = [
  { id: 'cpu', label: 'CPU only', vramGb: 0, backend: 'none' },
  { id: 'cuda-8gb', label: 'CUDA 8 GB', vramGb: 8, backend: 'cuda' },
  { id: 'cuda-12gb', label: 'CUDA 12 GB', vramGb: 12, backend: 'cuda' },
  { id: 'metal-8gb', label: 'Apple Metal 8 GB', vramGb: 8, backend: 'metal' },
];

export interface PhotoTo3DPlan {
  status: 'ready' | 'reuse' | 'blocked';
  reuseKey: string;
  reasons: string[];
  provider: PhotoProviderDescriptor;
  gpu: GpuProfile;
}

export interface PhotoTo3DJob {
  jobId: string;
  sourceHashes: ContentHash[];
  providerId: PhotoTo3DProviderId;
  gpuProfileId: GpuProfile['id'];
  reuseKey: string;
  status: PhotoTo3DJobStatus;
  stage: 'shape' | 'texture' | 'cleanup' | 'complete';
  resumeStatus: Exclude<PhotoTo3DJobStatus, 'paused'> | null;
  licenseAccepted: boolean;
  provenance: {
    sourceHashes: ContentHash[];
    provider: string;
    providerLicenseUrl: string;
    pipelineVersion: string;
    cleanupVersion: string | null;
  };
  outputAssetHash: ContentHash | null;
  error: string | null;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface PhotoTo3DJobInput {
  jobId: string;
  sourceHashes: ContentHash[];
  providerId: PhotoTo3DProviderId;
  gpuProfileId: GpuProfile['id'];
  licenseAccepted: boolean;
  existingReuseKeys?: string[];
  nowIso: string;
}

export interface PhotoTo3DJobEvent {
  type:
    | 'start'
    | 'draft-ready'
    | 'pause'
    | 'resume'
    | 'approve-texture'
    | 'cleanup'
    | 'complete'
    | 'cancel'
    | 'fail';
  nowIso: string;
  outputAssetHash?: ContentHash;
  error?: string;
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function mimeType(value: string): PhotoMimeType {
  const normalized = value.split(';', 1)[0]?.toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/png' || normalized === 'image/webp') {
    return normalized;
  }
  throw new Error(`unsupported photo type: ${value}`);
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function u32le(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

function text(bytes: Uint8Array, offset: number, length: number): string {
  return new TextDecoder().decode(bytes.subarray(offset, offset + length));
}

function byteArray(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function jpegInfo(bytes: Uint8Array): { width: number; height: number; hasExif: boolean } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('invalid JPEG header');
  }
  let offset = 2;
  let hasExif = false;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error('invalid JPEG marker');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++] ?? 0;
    if (marker === 0xd9 || marker === 0xda) break;
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (offset + 2 > bytes.length) throw new Error('truncated JPEG segment');
    const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (length < 2 || offset + length > bytes.length) throw new Error('invalid JPEG segment');
    if (marker === 0xe1 && length >= 8 && text(bytes, offset + 2, 6) === 'Exif\0\0') {
      hasExif = true;
    }
    if (JPEG_SOF_MARKERS.has(marker) && length >= 7) {
      return {
        width: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0),
        height: ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0),
        hasExif,
      };
    }
    offset += length;
  }
  throw new Error('JPEG dimensions are missing');
}

function stripJpegExif(bytes: Uint8Array): SanitizedPhoto {
  const info = jpegInfo(bytes);
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset + 1 < bytes.length) {
    const start = offset;
    if (bytes[offset] !== 0xff) throw new Error('invalid JPEG marker');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++] ?? 0;
    if (marker === 0xd9) {
      kept.push(bytes.subarray(start, offset));
      break;
    }
    if (marker === 0xda) {
      kept.push(bytes.subarray(start));
      break;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      kept.push(bytes.subarray(start, offset));
      continue;
    }
    const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    const end = offset + length;
    if (length < 2 || end > bytes.length) throw new Error('invalid JPEG segment');
    const isExif = marker === 0xe1 && length >= 8 && text(bytes, offset + 2, 6) === 'Exif\0\0';
    if (!isExif) kept.push(bytes.subarray(start, end));
    offset = end;
  }
  return {
    bytes: byteArray(...kept),
    mimeType: 'image/jpeg',
    ...info,
    metadataRemoved: info.hasExif,
  };
}

function pngInfo(bytes: Uint8Array): { width: number; height: number; metadata: Set<string> } {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value))
    throw new Error('invalid PNG header');
  let offset = 8;
  const metadata = new Set<string>();
  let width = 0;
  let height = 0;
  while (offset + 12 <= bytes.length) {
    const length = u32be(bytes, offset);
    const type = text(bytes, offset + 4, 4);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error('truncated PNG chunk');
    if (type === 'IHDR' && length >= 8) {
      width = u32be(bytes, offset + 8);
      height = u32be(bytes, offset + 12);
    }
    if (new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt']).has(type)) metadata.add(type);
    offset = end;
    if (type === 'IEND') break;
  }
  if (width <= 0 || height <= 0) throw new Error('PNG dimensions are missing');
  return { width, height, metadata };
}

function stripPngMetadata(bytes: Uint8Array): SanitizedPhoto {
  const info = pngInfo(bytes);
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = u32be(bytes, offset);
    const type = text(bytes, offset + 4, 4);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error('truncated PNG chunk');
    if (!info.metadata.has(type)) kept.push(bytes.subarray(offset, end));
    offset = end;
    if (type === 'IEND') break;
  }
  return {
    bytes: byteArray(...kept),
    mimeType: 'image/png',
    width: info.width,
    height: info.height,
    metadataRemoved: info.metadata.size > 0,
  };
}

function webpInfo(bytes: Uint8Array): { width: number; height: number; metadata: Set<string> } {
  if (bytes.length < 16 || text(bytes, 0, 4) !== 'RIFF' || text(bytes, 8, 4) !== 'WEBP') {
    throw new Error('invalid WebP header');
  }
  const metadata = new Set<string>();
  let offset = 12;
  let width = 0;
  let height = 0;
  while (offset + 8 <= bytes.length) {
    const type = text(bytes, offset, 4);
    const length = u32le(bytes, offset + 4);
    const data = offset + 8;
    const end = data + length;
    if (end > bytes.length) throw new Error('truncated WebP chunk');
    if (type === 'EXIF' || type === 'XMP ') metadata.add(type);
    if (type === 'VP8X' && length >= 10) {
      width =
        1 + (bytes[data + 4] ?? 0) + ((bytes[data + 5] ?? 0) << 8) + ((bytes[data + 6] ?? 0) << 16);
      height =
        1 + (bytes[data + 7] ?? 0) + ((bytes[data + 8] ?? 0) << 8) + ((bytes[data + 9] ?? 0) << 16);
    }
    offset = end + (length % 2);
  }
  if (width <= 0 || height <= 0) throw new Error('WebP dimensions require a VP8X chunk');
  return { width, height, metadata };
}

function stripWebpMetadata(bytes: Uint8Array): SanitizedPhoto {
  const info = webpInfo(bytes);
  const chunks: Uint8Array[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = text(bytes, offset, 4);
    const length = u32le(bytes, offset + 4);
    const data = offset + 8;
    const end = data + length;
    if (end > bytes.length) throw new Error('truncated WebP chunk');
    if (!info.metadata.has(type)) {
      const chunk = new Uint8Array(8 + length + (length % 2));
      chunk.set(bytes.subarray(offset, end), 0);
      chunks.push(chunk);
    }
    offset = end + (length % 2);
  }
  const body = byteArray(...chunks);
  const header = new Uint8Array(12);
  header.set(new TextEncoder().encode('RIFFWEBP'), 0);
  new DataView(header.buffer).setUint32(4, 4 + body.length, true);
  return {
    bytes: byteArray(header, body),
    mimeType: 'image/webp',
    width: info.width,
    height: info.height,
    metadataRemoved: info.metadata.size > 0,
  };
}

export function sanitizePhoto(bytes: Uint8Array, inputMimeType: string): SanitizedPhoto {
  const type = mimeType(inputMimeType);
  if (type === 'image/jpeg') return stripJpegExif(bytes);
  if (type === 'image/png') return stripPngMetadata(bytes);
  return stripWebpMetadata(bytes);
}

export function preparePhotoSet(views: PhotoViewInput[]): PreparedPhotoSet {
  const sanitized = views.map((view) => ({
    ...sanitizePhoto(view.bytes, view.mimeType),
    viewId: view.viewId,
    filename: view.filename,
    viewLabel: view.viewLabel,
  }));
  const labels = sanitized.map((view) => view.viewLabel ?? view.viewId);
  const minWidth = sanitized.reduce((min, view) => Math.min(min, view.width), Infinity);
  const minHeight = sanitized.reduce((min, view) => Math.min(min, view.height), Infinity);
  const reasons: string[] = [];
  if (sanitized.length < 3) reasons.push('at least three distinct views are required');
  if (sanitized.length > 24) reasons.push('at most 24 views are accepted per job');
  if (new Set(labels).size !== labels.length) reasons.push('each view needs a unique view label');
  if (minWidth < 640 || minHeight < 480) reasons.push('each view must be at least 640x480 pixels');
  return {
    views: sanitized,
    report: {
      accepted: reasons.length === 0,
      reasons,
      viewCount: sanitized.length,
      uniqueViewCount: new Set(labels).size,
      minWidth: Number.isFinite(minWidth) ? minWidth : 0,
      minHeight: Number.isFinite(minHeight) ? minHeight : 0,
      metadataStrippedCount: sanitized.filter((view) => view.metadataRemoved).length,
    },
  };
}

function provider(id: PhotoTo3DProviderId): PhotoProviderDescriptor {
  return PHOTO_TO_3D_PROVIDERS[id];
}

function gpu(id: GpuProfile['id']): GpuProfile {
  const profile = GPU_PROFILES.find((candidate) => candidate.id === id);
  if (!profile) throw new Error(`unknown GPU profile: ${id}`);
  return profile;
}

export function buildPhotoReuseKey(
  sourceHashes: readonly ContentHash[],
  providerId: PhotoTo3DProviderId,
  gpuProfileId: GpuProfile['id'],
): string {
  return `${providerId}:${gpuProfileId}:${[...sourceHashes].sort().join(',')}`;
}

export function planPhotoTo3D(input: {
  sourceHashes: ContentHash[];
  providerId: PhotoTo3DProviderId;
  gpuProfileId: GpuProfile['id'];
  licenseAccepted: boolean;
  existingReuseKeys?: string[];
}): PhotoTo3DPlan {
  const selectedProvider = provider(input.providerId);
  const selectedGpu = gpu(input.gpuProfileId);
  const reuseKey = buildPhotoReuseKey(input.sourceHashes, input.providerId, input.gpuProfileId);
  const reasons: string[] = [];
  if (selectedProvider.requiresLicenseAcceptance && !input.licenseAccepted) {
    reasons.push(`accept the ${selectedProvider.name} license before local generation`);
  }
  if (selectedGpu.vramGb < selectedProvider.minVramGb || selectedGpu.backend === 'none') {
    reasons.push(
      `${selectedProvider.name} requires a supported local GPU with at least ${selectedProvider.minVramGb} GB VRAM`,
    );
  }
  if (input.sourceHashes.length < 3) reasons.push('three sanitized source hashes are required');
  if (reasons.length > 0)
    return { status: 'blocked', reuseKey, reasons, provider: selectedProvider, gpu: selectedGpu };
  return {
    status: input.existingReuseKeys?.includes(reuseKey) ? 'reuse' : 'ready',
    reuseKey,
    reasons: [],
    provider: selectedProvider,
    gpu: selectedGpu,
  };
}

function validHash(hash: string): hash is ContentHash {
  return /^[0-9a-f]{64}$/.test(hash);
}

export function createPhotoTo3DJob(input: PhotoTo3DJobInput): PhotoTo3DJob {
  if (!input.jobId || /[^a-zA-Z0-9_-]/.test(input.jobId)) throw new Error('invalid photo job id');
  if (input.sourceHashes.length < 3 || input.sourceHashes.some((hash) => !validHash(hash))) {
    throw new Error('photo jobs require at least three valid source hashes');
  }
  const plan = planPhotoTo3D(input);
  const status: PhotoTo3DJobStatus = plan.status === 'blocked' ? 'blocked' : 'queued';
  return {
    jobId: input.jobId,
    sourceHashes: [...input.sourceHashes],
    providerId: input.providerId,
    gpuProfileId: input.gpuProfileId,
    reuseKey: plan.reuseKey,
    status,
    stage: 'shape',
    resumeStatus: null,
    licenseAccepted: input.licenseAccepted,
    provenance: {
      sourceHashes: [...input.sourceHashes],
      provider: plan.provider.name,
      providerLicenseUrl: plan.provider.licenseUrl,
      pipelineVersion: 'photo-to-3d-v1',
      cleanupVersion: null,
    },
    outputAssetHash: null,
    error: plan.reasons.length > 0 ? plan.reasons.join('; ') : null,
    createdAtIso: input.nowIso,
    updatedAtIso: input.nowIso,
  };
}

export function transitionPhotoTo3DJob(job: PhotoTo3DJob, event: PhotoTo3DJobEvent): PhotoTo3DJob {
  if (job.status === 'completed' || job.status === 'cancelled') {
    throw new Error(`cannot transition terminal job: ${job.status}`);
  }
  const next = { ...job, updatedAtIso: event.nowIso };
  if (event.type === 'cancel') return { ...next, status: 'cancelled', error: null };
  if (event.type === 'pause') {
    if (job.status === 'blocked' || job.status === 'failed' || job.status === 'paused')
      throw new Error('job is not resumable');
    return { ...next, status: 'paused', resumeStatus: job.status };
  }
  if (event.type === 'resume') {
    if (job.status !== 'paused') throw new Error('only paused jobs can resume');
    return { ...next, status: job.resumeStatus ?? 'queued', resumeStatus: null, error: null };
  }
  if (event.type === 'start') {
    if (job.status !== 'queued') throw new Error('only queued jobs can start');
    return { ...next, status: 'preprocessing', error: null };
  }
  if (event.type === 'draft-ready') {
    if (job.status !== 'preprocessing' && job.status !== 'shape-draft')
      throw new Error('shape draft is not ready');
    return { ...next, status: 'awaiting-approval', stage: 'shape' };
  }
  if (event.type === 'approve-texture') {
    if (job.status !== 'awaiting-approval')
      throw new Error('owner approval is required before texturing');
    return { ...next, status: 'texturing', stage: 'texture' };
  }
  if (event.type === 'cleanup') {
    if (job.status !== 'texturing') throw new Error('texturing must finish before cleanup');
    return { ...next, status: 'cleaning', stage: 'cleanup' };
  }
  if (event.type === 'complete') {
    if (job.status !== 'cleaning' || !event.outputAssetHash || !validHash(event.outputAssetHash)) {
      throw new Error('a cleaned GLB hash is required to complete a photo job');
    }
    return {
      ...next,
      status: 'completed',
      stage: 'complete',
      outputAssetHash: event.outputAssetHash,
      provenance: { ...job.provenance, cleanupVersion: 'blender-safe-cleanup-v1' },
      error: null,
    };
  }
  if (event.type === 'fail') {
    return { ...next, status: 'failed', error: event.error ?? 'photo-to-3d provider failed' };
  }
  throw new Error('unsupported photo job event');
}

export interface BlenderCleanupPlan {
  executable: 'blender';
  args: string[];
  outputExtension: 'glb';
  lods: { name: 'lod0' | 'lod1' | 'lod2'; ratio: number }[];
}

function safeToken(value: string, label: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(value) || value.includes('..')) {
    throw new Error(`unsafe ${label}`);
  }
  return value;
}

export function buildBlenderCleanupPlan(input: {
  jobId: string;
  draftFilename: string;
}): BlenderCleanupPlan {
  const jobId = safeToken(input.jobId, 'job id');
  const draftFilename = safeToken(input.draftFilename, 'draft filename');
  return {
    executable: 'blender',
    args: [
      '--background',
      '--python-expr',
      `guideforge_cleanup(${JSON.stringify(jobId)},${JSON.stringify(draftFilename)})`,
    ],
    outputExtension: 'glb',
    lods: [
      { name: 'lod0', ratio: 1 },
      { name: 'lod1', ratio: 0.5 },
      { name: 'lod2', ratio: 0.2 },
    ],
  };
}
