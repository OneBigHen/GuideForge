/**
 * @guideforge/package-gforge — deterministic draft `.gforge` package writer.
 *
 * A `.gforge` file is a deterministic ZIP-compatible package:
 *
 *   manifest.json
 *   guide.json
 *   assets/<sha256>.<ext>
 *
 * Determinism rules (draft, unsigned):
 *   - forward-slash relative paths only
 *   - lexicographically sorted entries
 *   - fixed archive timestamps
 *   - UTF-8 JSON
 *   - SHA-256 recorded per entry
 *   - same inputs produce byte-identical output
 *
 * Safety rules:
 *   - rejects absolute paths, `..`, duplicate normalized paths
 *   - expansion-bomb limits (entry count, size, ratio)
 */
import type { AssetReference, ContentHash } from '@guideforge/domain';
import type { GuideSnapshot } from '@guideforge/guide-schema';
import { strToU8, zipSync, type Zippable } from 'fflate';

/** SHA-256 hashing strategy; injected so Node and browser code share one path. */
export type HashFunction = (bytes: Uint8Array) => string;

/** Node implementation (tests/workers). */
export function nodeSha256(bytes: Uint8Array): string {
  // Node is available here; this file is also imported by browsers, so keep
  // the require lazy and only used when no browser hash has been injected.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require('node:crypto') as NodeCryptoShim;
  const hash = createHash('sha256');
  hash.update(bytes);
  return hash.digest('hex');
}

interface NodeCryptoShim {
  createHash: (algorithm: string) => {
    update: (data: Uint8Array) => unknown;
    digest: (encoding: string) => string;
  };
}

let activeHash: HashFunction = nodeSha256;

/** Set the active hash function (browser code sets webSha256 on boot). */
export function setHashFunction(fn: HashFunction): void {
  activeHash = fn;
}

function sha256(bytes: Uint8Array): string {
  return activeHash(bytes);
}

/** Alias used by the entry builder (kept for clarity). */
const hashBytes = sha256;

/** Fixed timestamp so repeated exports are byte-identical (RFC 3339 UTC). */
export const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

export const MAX_ENTRIES = 10_000;
export const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB expanded
export const MAX_SINGLE_FILE_BYTES = 512 * 1024 * 1024;
export const MAX_COMPRESSION_RATIO = 200;

export class PackageSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackageSafetyError';
  }
}

/** Normalize and validate a package-relative path. */
export function validatePackagePath(rawPath: string): string {
  if (rawPath.length === 0) throw new PackageSafetyError('empty path');
  if (rawPath.startsWith('/') || /^[A-Za-z]:/.test(rawPath)) {
    throw new PackageSafetyError(`absolute path rejected: ${rawPath}`);
  }
  const parts = rawPath.split('/');
  for (const part of parts) {
    if (part === '..') throw new PackageSafetyError(`parent traversal rejected: ${rawPath}`);
    if (part === '.' || part === '')
      throw new PackageSafetyError(`non-normalized path: ${rawPath}`);
    if (part.includes('\\')) throw new PackageSafetyError(`backslash rejected: ${rawPath}`);
    for (const ch of part) {
      const code = ch.codePointAt(0) ?? 0;
      if (code < 0x20) throw new PackageSafetyError(`control chars rejected: ${rawPath}`);
    }
  }
  return parts.join('/');
}

export interface PackageEntry {
  path: string;
  data: Uint8Array;
}

export interface DraftPackageInput {
  snapshot: GuideSnapshot;
  assets: Map<ContentHash, AssetReference & { bytes: Uint8Array }>;
  /** Optional extra manifest fields (e.g. tool version). */
  extraManifest?: Record<string, unknown>;
}

export interface PackageManifest {
  format: 'gforge';
  version: 1;
  packageType: 'draft';
  createdAt: string;
  guideId: string;
  schemaVersion: number;
  entries: { path: string; sha256: string; sizeBytes: number }[];
  assetCount: number;
}

/** Browser implementation using WebCrypto. */
export async function webSha256(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Deterministically serialize a JSON value as UTF-8 with sorted keys. */
export function canonicalJson(value: unknown): Uint8Array {
  const json = JSON.stringify(sortKeys(value));
  return strToU8(json);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      out[key] = sortKeys(source[key]);
    }
    return out;
  }
  return value;
}

/** Build the draft package entry list (sorted, validated). */
export function buildDraftEntries(input: DraftPackageInput): PackageEntry[] {
  if (input.snapshot.schemaVersion !== 1) {
    const version = String(input.snapshot.schemaVersion);
    throw new PackageSafetyError(`unsupported schema version ${version}`);
  }
  if (input.assets.size > MAX_ENTRIES) {
    throw new PackageSafetyError(`too many assets: ${input.assets.size}`);
  }

  const entries: PackageEntry[] = [];

  // guide.json
  const guideJson = canonicalJson(input.snapshot);
  entries.push({ path: 'guide.json', data: guideJson });

  // assets/<sha256>.<ext> sorted by hash
  const assetEntries: { path: string; data: Uint8Array; sha256: string; sizeBytes: number }[] = [];
  for (const [hash, asset] of input.assets) {
    const actual = hashBytes(asset.bytes);
    if (actual !== hash) {
      throw new PackageSafetyError(`asset hash mismatch for ${hash}`);
    }
    if (asset.bytes.length > MAX_SINGLE_FILE_BYTES) {
      throw new PackageSafetyError(`asset too large: ${asset.bytes.length}`);
    }
    const path = validatePackagePath(`assets/${hash}.${asset.extension}`);
    assetEntries.push({ path, data: asset.bytes, sha256: actual, sizeBytes: asset.bytes.length });
  }
  assetEntries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const entry of assetEntries) {
    entries.push({ path: entry.path, data: entry.data });
  }

  // manifest.json (contains per-entry hashes; must be computed after entries)
  const manifest: PackageManifest = {
    format: 'gforge',
    version: 1,
    packageType: 'draft',
    createdAt: FIXED_TIMESTAMP,
    guideId: input.snapshot.guideId,
    schemaVersion: input.snapshot.schemaVersion,
    entries: entries.map((e) => ({
      path: e.path,
      sha256: hashBytes(e.data),
      sizeBytes: e.data.length,
    })),
    assetCount: assetEntries.length,
    ...(input.extraManifest ?? {}),
  };
  entries.push({ path: 'manifest.json', data: canonicalJson(manifest) });

  // Lexicographic order across the whole archive.
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // Duplicate normalized path check + total byte budget.
  const seen = new Set<string>();
  let total = 0;
  for (const entry of entries) {
    if (seen.has(entry.path)) throw new PackageSafetyError(`duplicate path: ${entry.path}`);
    seen.add(entry.path);
    total += entry.data.length;
    if (total > MAX_TOTAL_BYTES) throw new PackageSafetyError('package exceeds total size budget');
  }

  return entries;
}

/**
 * Serialize entries into a deterministic ZIP using fflate.
 * All entries use a fixed mtime; store (uncompressed) mode is used for
 * determinism and simplicity in drafts.
 */
export function serializeDraftPackage(entries: PackageEntry[]): Uint8Array {
  const zipData: Zippable = {};
  for (const entry of entries) {
    zipData[entry.path] = [entry.data, { mtime: new Date(FIXED_TIMESTAMP), level: 0 }];
  }
  return zipSync(zipData, { level: 0 });
}

/** One-shot: snapshot + assets -> deterministic draft package bytes. */
export function createDraftPackage(input: DraftPackageInput): Uint8Array {
  const entries = buildDraftEntries(input);
  return serializeDraftPackage(entries);
}

/** Verify an existing package's internal hashes; returns manifest. */
export function verifyPackageStructure(entries: PackageEntry[]): PackageManifest {
  const manifestEntry = entries.find((e) => e.path === 'manifest.json');
  if (!manifestEntry) throw new PackageSafetyError('missing manifest.json');
  const manifest = JSON.parse(new TextDecoder().decode(manifestEntry.data)) as PackageManifest;

  const entryMap = new Map(entries.map((e) => [e.path, e]));
  for (const declared of manifest.entries) {
    const entry = entryMap.get(declared.path);
    if (!entry) throw new PackageSafetyError(`missing declared entry ${declared.path}`);
    const actual = sha256(entry.data);
    if (actual !== declared.sha256) {
      throw new PackageSafetyError(`hash mismatch for ${declared.path}`);
    }
    if (entry.data.length !== declared.sizeBytes) {
      throw new PackageSafetyError(`size mismatch for ${declared.path}`);
    }
  }
  return manifest;
}

/** Browser variant of verifyPackageStructure using WebCrypto. */
export async function verifyPackageStructureAsync(
  entries: PackageEntry[],
): Promise<PackageManifest> {
  const manifestEntry = entries.find((e) => e.path === 'manifest.json');
  if (!manifestEntry) throw new PackageSafetyError('missing manifest.json');
  const manifest = JSON.parse(new TextDecoder().decode(manifestEntry.data)) as PackageManifest;

  const entryMap = new Map(entries.map((e) => [e.path, e]));
  for (const declared of manifest.entries) {
    const entry = entryMap.get(declared.path);
    if (!entry) throw new PackageSafetyError(`missing declared entry ${declared.path}`);
    const actual = await webSha256(entry.data);
    if (actual !== declared.sha256) {
      throw new PackageSafetyError(`hash mismatch for ${declared.path}`);
    }
    if (entry.data.length !== declared.sizeBytes) {
      throw new PackageSafetyError(`size mismatch for ${declared.path}`);
    }
  }
  return manifest;
}

/**
 * Browser-friendly one-shot: uses WebCrypto SHA-256 so no Node built-in is
 * required. Callers in browsers should use this instead of createDraftPackage.
 */
export async function createDraftPackageAsync(
  input: DraftPackageInput,
): Promise<{ bytes: Uint8Array; sha256Hex: string }> {
  const hash = webSha256;
  const entries = await buildDraftEntriesWithHash(input, hash);
  const bytes = serializeDraftPackage(entries);
  return { bytes, sha256Hex: await webSha256(bytes) };
}

/** Entry builder with an explicit async hash provider (browser path). */
export async function buildDraftEntriesWithHash(
  input: DraftPackageInput,
  hash: (bytes: Uint8Array) => Promise<string>,
): Promise<PackageEntry[]> {
  if (input.snapshot.schemaVersion !== 1) {
    const version = String(input.snapshot.schemaVersion);
    throw new PackageSafetyError(`unsupported schema version ${version}`);
  }
  if (input.assets.size > MAX_ENTRIES) {
    throw new PackageSafetyError(`too many assets: ${input.assets.size}`);
  }

  const entries: PackageEntry[] = [];
  const guideJson = canonicalJson(input.snapshot);
  entries.push({ path: 'guide.json', data: guideJson });

  const assetEntries: { path: string; data: Uint8Array; sha256: string; sizeBytes: number }[] = [];
  for (const [hashVal, asset] of input.assets) {
    const actual = await hash(asset.bytes);
    if (actual !== hashVal) {
      throw new PackageSafetyError(`asset hash mismatch for ${hashVal}`);
    }
    if (asset.bytes.length > MAX_SINGLE_FILE_BYTES) {
      throw new PackageSafetyError(`asset too large: ${asset.bytes.length}`);
    }
    const path = validatePackagePath(`assets/${hashVal}.${asset.extension}`);
    assetEntries.push({ path, data: asset.bytes, sha256: actual, sizeBytes: asset.bytes.length });
  }
  assetEntries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const entry of assetEntries) {
    entries.push({ path: entry.path, data: entry.data });
  }

  const manifest: PackageManifest = {
    format: 'gforge',
    version: 1,
    packageType: 'draft',
    createdAt: FIXED_TIMESTAMP,
    guideId: input.snapshot.guideId,
    schemaVersion: input.snapshot.schemaVersion,
    entries: await Promise.all(
      entries.map(async (e) => ({
        path: e.path,
        sha256: await hash(e.data),
        sizeBytes: e.data.length,
      })),
    ),
    assetCount: assetEntries.length,
    ...(input.extraManifest ?? {}),
  };
  entries.push({ path: 'manifest.json', data: canonicalJson(manifest) });
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const seen = new Set<string>();
  let total = 0;
  for (const entry of entries) {
    if (seen.has(entry.path)) throw new PackageSafetyError(`duplicate path: ${entry.path}`);
    seen.add(entry.path);
    total += entry.data.length;
    if (total > MAX_TOTAL_BYTES) throw new PackageSafetyError('package exceeds total size budget');
  }
  return entries;
}
