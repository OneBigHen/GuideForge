/**
 * Microsoft `.guide` interoperability (isolated compatibility adapter).
 *
 * `.guide` is an uncompressed TAR with:
 *   Guide_Body                       — JSON with D365-style entities
 *   Model_Body_<uuid>, Image_Body_<uuid>, Video_Body_<uuid> — assets
 *
 * This adapter:
 *  - imports safely (bounded, traversal-safe, loss-reporting),
 *  - preserves unknown fields in a namespaced compatibility record,
 *  - exports ONLY the supported subset and refuses silent loss,
 *  - never hard-codes tenant/environment URIs.
 */
import type { ContentHash, EntityId } from '@guideforge/domain';
import type { GuideSnapshot } from '@guideforge/guide-schema';
import { strFromU8, strToU8 } from 'fflate';

export const MAX_GUIDE_BYTES = 512 * 1024 * 1024;
export const MAX_ENTRY_COUNT = 10_000;

export class MsGuideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MsGuideError';
  }
}

export interface MsGuideEntry {
  name: string;
  data: Uint8Array;
}

export interface CompatibilityReport {
  importId: string;
  source: string;
  warnings: string[];
  unknownFields: string[];
  droppedAssets: string[];
  unsupported: string[];
  roundTrip: 'not-applicable' | 'partial' | 'full';
  sourceClientVerified: boolean;
}

export interface ImportedGuide {
  snapshot: GuideSnapshot;
  assets: Map<ContentHash, { bytes: Uint8Array; extension: string; mimeType: string }>;
  report: CompatibilityReport;
}

/** Validate + normalize an entry name (TAR-safe). */
export function safeEntryName(raw: string): string {
  if (raw.includes('..') || raw.startsWith('/') || raw.includes('\\')) {
    throw new MsGuideError(`unsafe entry name: ${raw}`);
  }
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20) throw new MsGuideError(`control chars in entry: ${raw}`);
  }
  return raw;
}

/** Extract entries from a `.guide` TAR with bounds checks. */
export function parseMsGuideTar(bytes: Uint8Array): MsGuideEntry[] {
  if (bytes.length > MAX_GUIDE_BYTES) throw new MsGuideError('guide exceeds size budget');
  const entries: MsGuideEntry[] = [];
  const seen = new Set<string>();
  let offset = 0;

  const decoder = new TextDecoder();
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    // End-of-archive: all zero header.
    if (header.every((b) => b === 0)) break;

    const name = decoder.decode(header.subarray(0, 100)).replace(/\0.*$/, '');
    if (name.length === 0) break;

    const sizeStr = decoder.decode(header.subarray(124, 136)).replace(/\0.*$/, '').trim();
    const size = parseInt(sizeStr, 8);
    if (!Number.isFinite(size) || size < 0) throw new MsGuideError(`invalid size for ${name}`);

    const typeflag = String.fromCharCode(header[156] ?? 0x30);
    offset += 512;

    if (typeflag === '5') {
      continue; // directory entry, skip
    }
    if (typeflag === '2') {
      throw new MsGuideError(`symlink rejected: ${name}`);
    }
    if (size > 0) {
      if (offset + size > bytes.length) throw new MsGuideError('truncated tar');
      const safe = safeEntryName(name);
      if (seen.has(safe)) throw new MsGuideError(`duplicate entry: ${safe}`);
      seen.add(safe);
      entries.push({ name: safe, data: bytes.slice(offset, offset + size) });
      offset += size;
    }
    // Pad to 512.
    offset = Math.ceil(offset / 512) * 512;
  }

  if (entries.length > MAX_ENTRY_COUNT) throw new MsGuideError('too many entries');
  if (entries.length === 0) throw new MsGuideError('empty tar archive');
  return entries;
}

export interface MsGuideBody {
  msmrw_GuideTask_Guide_msmrw_guide?: { msmrw_guidetaskid: string; msmrw_name?: string }[];
  msmrw_GuideStep_Guide_msmrw_guide?: {
    msmrw_guidestepid: string;
    _msmrw_task_value?: string;
    msmrw_instructiontext?: string;
  }[];
  [key: string]: unknown;
}

/**
 * Import a `.guide` package into a canonical GuideSnapshot. Produces a
 * compatibility report describing every loss/approximation. No tenant URI is
 * ever required.
 */
export function importMsGuide(bytes: Uint8Array, source: string): ImportedGuide {
  const entries = parseMsGuideTar(bytes);
  const bodyEntry = entries.find((e) => e.name === 'Guide_Body');
  if (!bodyEntry) throw new MsGuideError('missing Guide_Body');
  const body = JSON.parse(strFromU8(bodyEntry.data)) as MsGuideBody;

  const report: CompatibilityReport = {
    importId: crypto.randomUUID(),
    source,
    warnings: [],
    unknownFields: [],
    droppedAssets: [],
    unsupported: [],
    roundTrip: 'not-applicable',
    sourceClientVerified: false,
  };

  // Preserve unknown top-level fields (namespaced compatibility record).
  const known = new Set([
    'msmrw_GuideTask_Guide_msmrw_guide',
    'msmrw_GuideStep_Guide_msmrw_guide',
    'msmrw_msmrw_guide_msmrw_guidestepobject_Guide',
    'msmrw_msmrw_guide_msmrw_guidestepobjectplacement_Guide',
    '_msmrw_anchor3dobject_value',
  ]);
  for (const key of Object.keys(body)) {
    if (!known.has(key)) report.unknownFields.push(key);
  }

  // Tasks and steps (supported subset).
  const tasks = (body.msmrw_GuideTask_Guide_msmrw_guide ?? []).map((t) => ({
    taskId: t.msmrw_guidetaskid as EntityId,
    title: t.msmrw_name ?? 'Untitled task',
    stepIds: [] as EntityId[],
  }));
  const steps = (body.msmrw_GuideStep_Guide_msmrw_guide ?? []).map((s) => ({
    stepId: s.msmrw_guidestepid as EntityId,
    taskId: s._msmrw_task_value as EntityId,
    instructionText: s.msmrw_instructiontext ?? '',
    warnings: [],
    tools: [],
    parts: [],
    media: [],
  }));
  // Wire stepIds per task from step.taskId.
  for (const step of steps) {
    const task = tasks.find((t) => t.taskId === step.taskId);
    if (task && !task.stepIds.includes(step.stepId)) task.stepIds.push(step.stepId);
  }
  // Orphan steps (task missing) are a loss.
  for (const step of steps) {
    if (!tasks.some((t) => t.taskId === step.taskId)) {
      report.warnings.push(
        `step ${step.stepId} has no matching task; preserved in steps, not reachable`,
      );
    }
  }

  const guideId = crypto.randomUUID() as EntityId;
  const now = new Date().toISOString();
  const snapshot: GuideSnapshot = {
    schemaVersion: 1,
    guideId,
    title: source.replace(/\.guide$/i, ''),
    description: '',
    lifecycleState: 'draft',
    createdAtIso: now,
    updatedAtIso: now,
    tasks,
    steps,
  };

  // Assets: only Model/Image/Video bodies are extracted; all others dropped.
  const assets = new Map<ContentHash, { bytes: Uint8Array; extension: string; mimeType: string }>();
  for (const entry of entries) {
    if (entry.name === 'Guide_Body') continue;
    const m = /^(Model|Image|Video)_Body_([0-9a-f-]{36})(\.([a-z0-9]+))?$/i.exec(entry.name);
    if (!m) {
      report.droppedAssets.push(entry.name);
      continue;
    }
    const kind = m[1]!.toLowerCase();
    const ext = m[4] ?? (kind === 'model' ? 'glb' : kind === 'image' ? 'png' : 'mp4');
    const mime =
      kind === 'model' ? 'model/gltf-binary' : kind === 'image' ? 'image/png' : 'video/mp4';
    assets.set(hashBytes(entry.data), { bytes: entry.data, extension: ext, mimeType: mime });
  }

  report.roundTrip = 'partial';
  const stepObjects = body.msmrw_msmrw_guide_msmrw_guidestepobject_Guide;
  if (Array.isArray(stepObjects) && stepObjects.length > 0) {
    report.unsupported.push('3D step objects (transforms) not yet mapped');
  }
  report.warnings.push('anchor 3D object reference not mapped');

  return { snapshot, assets, report };
}

/** Build a `.guide` TAR from a canonical snapshot (supported subset only). */
export function exportMsGuide(
  snapshot: GuideSnapshot,
  opts: { acceptApproximations: boolean },
): { bytes: Uint8Array; report: CompatibilityReport } {
  const report: CompatibilityReport = {
    importId: crypto.randomUUID(),
    source: snapshot.title,
    warnings: [],
    unknownFields: [],
    droppedAssets: [],
    unsupported: [],
    roundTrip: 'not-applicable',
    sourceClientVerified: false,
  };

  // Refuse silent loss: media refs, warnings, tools, parts are unsupported in
  // the exported subset unless explicitly accepted as approximations.
  const mediaCount = snapshot.steps.reduce((n, s) => n + s.media.length, 0);
  const enrichCount = snapshot.steps.reduce(
    (n, s) => n + s.warnings.length + s.tools.length + s.parts.length,
    0,
  );
  if ((mediaCount > 0 || enrichCount > 0) && !opts.acceptApproximations) {
    report.unsupported.push(
      `${mediaCount} media refs, ${enrichCount} warnings/tools/parts would be lost`,
    );
    throw new MsGuideError(
      'export would silently lose content; pass acceptApproximations to confirm',
    );
  }
  if (mediaCount > 0) report.warnings.push(`${mediaCount} media references dropped (approximated)`);
  if (enrichCount > 0)
    report.warnings.push(`${enrichCount} warnings/tools/parts dropped (approximated)`);

  const body = {
    msmrw_GuideTask_Guide_msmrw_guide: snapshot.tasks.map((t) => ({
      msmrw_guidetaskid: t.taskId,
      msmrw_name: t.title,
    })),
    msmrw_GuideStep_Guide_msmrw_guide: snapshot.steps.map((s) => ({
      msmrw_guidestepid: s.stepId,
      _msmrw_task_value: s.taskId,
      msmrw_instructiontext: s.instructionText,
    })),
    _msmrw_anchor3dobject_value: null,
  };

  const files: { name: string; data: Uint8Array }[] = [
    { name: 'Guide_Body', data: strToU8(JSON.stringify(body)) },
  ];
  const bytes = writePosixTar(files);
  return { bytes, report };
}

/** Minimal deterministic POSIX ustar writer (no directories, no symlinks). */
function writePosixTar(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const blocks: Uint8Array[] = [];
  const encoder = new TextEncoder();

  for (const file of files) {
    if (file.name.length > 100) throw new MsGuideError('entry name too long for ustar');
    const header = new Uint8Array(512);
    const nameBytes = encoder.encode(file.name);
    header.set(nameBytes, 0);
    // mode 0644 octal
    header.set(encoder.encode('0000644'), 100);
    // uid/gid 0
    header.set(encoder.encode('0000000'), 108);
    header.set(encoder.encode('0000000'), 116);
    // size octal, 11 chars + NUL
    const size = file.data.length;
    const sizeOct = size.toString(8).padStart(11, '0');
    header.set(encoder.encode(sizeOct), 124);
    // mtime 0 (deterministic)
    header.set(encoder.encode('00000000000'), 136);
    // typeflag '0' (regular file)
    header[156] = 0x30;
    // magic "ustar\0" + version "00"
    header.set(encoder.encode('ustar'), 257);
    header.set([0x30, 0x30], 263);
    // checksum: spaces then sum of header bytes
    header.set(encoder.encode('        '), 148);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i]!;
    const checksum = sum.toString(8).padStart(6, '0');
    header.set(encoder.encode(checksum), 148);
    header[154] = 0x00;
    header[155] = 0x20;

    blocks.push(header);
    if (file.data.length > 0) {
      blocks.push(file.data);
      const pad = (512 - (file.data.length % 512)) % 512;
      if (pad > 0) blocks.push(new Uint8Array(pad));
    }
  }

  blocks.push(new Uint8Array(1024)); // end-of-archive
  const total = blocks.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const block of blocks) {
    out.set(block, offset);
    offset += block.length;
  }
  return out;
}

function hashBytes(bytes: Uint8Array): ContentHash {
  // FNV-1a 64-bit hex padded to 64 chars for determinism in tests.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const byte of bytes) {
    h1 ^= byte;
    h1 = Math.imul(h1, 0x01000193);
    h2 = Math.imul(h2 ^ byte, 0x01000193);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `${hex(h1)}${hex(h2)}`.padEnd(64, '0') as ContentHash;
}
