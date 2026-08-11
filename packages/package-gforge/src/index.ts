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
 *   - bounded preflight of archive metadata before any inflation
 */
import type { AssetReference, ContentHash } from '@guideforge/domain';
import type { GuideSnapshot } from '@guideforge/guide-schema';
import { GUIDE_SCHEMA_VERSION } from '@guideforge/guide-schema';
import { AsyncUnzipInflate, strToU8, Unzip, zipSync, type Zippable } from 'fflate';

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

/**
 * Bounded preflight of a ZIP archive BEFORE any inflation.
 *
 * Parses the End of Central Directory + central directory entries (metadata
 * only — no decompression) and enforces the expansion-bomb limits:
 *   - entry count ≤ MAX_ENTRIES
 *   - total uncompressed bytes ≤ MAX_TOTAL_BYTES
 *   - any single entry ≤ MAX_SINGLE_FILE_BYTES
 *   - compression ratio (compressed→uncompressed) ≤ MAX_COMPRESSION_RATIO
 *
 * Throws PackageSafetyError on any violation, so callers can reject hostile
 * archives without ever allocating the expanded bytes. Returns the entry
 * count + total uncompressed size for further checks.
 */
export function preflightZipArchive(bytes: Uint8Array): {
  entryCount: number;
  totalUncompressed: number;
} {
  if (bytes.length > MAX_TOTAL_BYTES) {
    throw new PackageSafetyError('archive exceeds total size budget');
  }
  // Locate End of Central Directory record (EOCD): signature 0x06054b50,
  // scanning from the end (allowing for an optional trailing comment ≤64KiB).
  let eocd = -1;
  const scanStart = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= scanStart; i--) {
    const sig =
      (bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 24)) >>> 0;
    if (sig === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new PackageSafetyError('not a zip archive (no EOCD)');
  const readU16 = (off: number): number => bytes[off]! | (bytes[off + 1]! << 8);
  const readU32 = (off: number): number =>
    (bytes[off]! | (bytes[off + 1]! << 8) | (bytes[off + 2]! << 16) | (bytes[off + 3]! << 24)) >>>
    0;

  const entryCount = readU16(eocd + 10);
  if (entryCount > MAX_ENTRIES) {
    throw new PackageSafetyError(`archive has too many entries: ${entryCount}`);
  }
  const cdSize = readU32(eocd + 12);
  const cdOffset = readU32(eocd + 16);
  if (cdOffset > bytes.length || cdSize > bytes.length || cdOffset + cdSize > bytes.length) {
    throw new PackageSafetyError('invalid central directory bounds');
  }

  // Walk central directory entries (signature 0x02014b50).
  let totalUncompressed = 0;
  let offset = cdOffset;
  const end = cdOffset + cdSize;
  const seen = new Set<string>();
  for (let i = 0; i < entryCount; i++) {
    if (offset + 46 > end) throw new PackageSafetyError('truncated central directory');
    if (
      bytes[offset] !== 0x50 ||
      bytes[offset + 1] !== 0x4b ||
      bytes[offset + 2] !== 0x01 ||
      bytes[offset + 3] !== 0x02
    ) {
      throw new PackageSafetyError('invalid central directory entry signature');
    }
    const method = readU16(offset + 10);
    const compressedSize = readU32(offset + 20);
    const uncompressedSize = readU32(offset + 24);
    const nameLen = readU16(offset + 28);
    const extraLen = readU16(offset + 30);
    const commentLen = readU16(offset + 32);
    const nameOffset = offset + 46;
    if (nameOffset + nameLen > end) throw new PackageSafetyError('truncated entry name');

    // Reject unsafe paths before any extraction.
    let name = '';
    for (let j = 0; j < nameLen; j++) name += String.fromCharCode(bytes[nameOffset + j]!);
    try {
      validatePackagePath(name);
    } catch {
      throw new PackageSafetyError(`unsafe entry path rejected: ${name}`);
    }
    if (seen.has(name)) throw new PackageSafetyError(`duplicate entry path: ${name}`);
    seen.add(name);

    if (uncompressedSize > MAX_SINGLE_FILE_BYTES) {
      throw new PackageSafetyError(
        `entry too large after inflation: ${name} (${uncompressedSize})`,
      );
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_BYTES) {
      throw new PackageSafetyError('archive expands beyond total size budget');
    }
    // Compression ratio guard (skip ratio check for stored/zero-compressed).
    if (
      method !== 0 &&
      compressedSize > 0 &&
      uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO
    ) {
      throw new PackageSafetyError(`compression ratio exceeded for ${name}`);
    }

    offset = nameOffset + nameLen + extraLen + commentLen;
  }

  return { entryCount, totalUncompressed };
}

/** Normalize and validate a package-relative path. */
export function validatePackagePath(rawPath: string): string {
  if (rawPath.length === 0) throw new PackageSafetyError('empty path');
  if (rawPath.startsWith('/') || /^[A-Za-z]:/.test(rawPath)) {
    throw new PackageSafetyError(`absolute path rejected: ${rawPath}`);
  }
  const parts = rawPath.split('/');
  for (const part of parts) {
    // Any segment that resolves to the parent directory (including trailing
    // whitespace/suffix variants like ".. " that some filesystems normalize)
    // is rejected — path traversal must never survive normalization.
    const trimmed = part.trimEnd();
    if (trimmed === '..' || trimmed === '.' || trimmed === '') {
      throw new PackageSafetyError(`non-normalized path: ${rawPath}`);
    }
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
  packageType?: 'draft' | 'backup';
  /** Optional original source bytes keyed by the canonical source SHA-256. */
  sourceBytes?: Map<ContentHash, PackageBinary>;
  /** JSON reports included under reports/<name>.json. */
  reports?: Record<string, unknown>;
  /** Runtime records/files are included only for a backup package. */
  runtime?: {
    includeEvidence?: boolean;
    evidenceRecords?: unknown[];
    files?: Map<string, PackageBinary>;
  };
  /** Optional extra manifest fields (e.g. tool version). */
  extraManifest?: Record<string, unknown>;
  /**
   * Asset attributions for the package license report
   * (`reports/asset-licenses.json`): hash -> {name, licenseId, attribution,
   * source}. Empty/omitted when no assets are attributed.
   */
  attributions?: Map<
    ContentHash,
    { name: string; licenseId?: string; attribution?: string; source?: string }
  >;
}

export interface PackageBinary {
  bytes: Uint8Array;
  extension: string;
  mimeType?: string;
}

export interface PackageManifest {
  format: 'gforge';
  version: 1 | 2;
  packageType: 'draft' | 'backup';
  createdAt: string;
  guideId: string;
  schemaVersion: number;
  entries: { path: string; sha256: string; sizeBytes: number }[];
  assetCount: number;
  sourceCount?: number;
  sourceByteCount?: number;
  sources?: { sourceId: string; metadataPath: string; bytesPath?: string }[];
  reportPaths?: string[];
  runtime?: { evidenceIncluded: boolean; evidenceIndexPath?: string };
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

/** Build the asset license/attribution report object (Phase 04). */
function attributionReport(attributions: NonNullable<DraftPackageInput['attributions']>): {
  format: string;
  version: number;
  generatedAt: string;
  assets: {
    hash: string;
    name: string;
    licenseId: string | null;
    attribution: string | null;
    source: string | null;
  }[];
} {
  return {
    format: 'gforge-asset-licenses',
    version: 1,
    generatedAt: FIXED_TIMESTAMP,
    assets: Array.from(attributions.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([hashVal, a]) => ({
        hash: hashVal,
        name: a.name,
        licenseId: a.licenseId ?? null,
        attribution: a.attribution ?? null,
        source: a.source ?? null,
      })),
  };
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

function assertSha256(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new PackageSafetyError(`${label} must be a lowercase SHA-256 hash`);
  }
}

function validateExtension(extension: string): string {
  if (!/^[a-z0-9]{1,16}$/i.test(extension)) {
    throw new PackageSafetyError(`invalid package extension: ${extension}`);
  }
  return extension.toLowerCase();
}

/** Return an external URL only when it is inert and network-scoped. */
export function sanitizeExternalResource(value: string): string | null {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

/**
 * Validate metadata before it is persisted or rendered. Resource-bearing
 * fields are allowlisted to HTTP(S); active HTML/script payloads are rejected.
 */
export function sanitizePackageMetadata<T>(value: T): T {
  const visit = (input: unknown, key = ''): unknown => {
    if (typeof input === 'string') {
      if (/(?:<script\b|<iframe\b|<object\b|<embed\b)/i.test(input)) {
        throw new PackageSafetyError('active content rejected in package metadata');
      }
      if (/^(?:url|uri|href|src|action|externalurl)$/i.test(key)) {
        const safe = sanitizeExternalResource(input);
        if (!safe) throw new PackageSafetyError(`unsafe external resource: ${input}`);
        return safe;
      }
      return input;
    }
    if (Array.isArray(input)) return input.map((item) => visit(item, key));
    if (input !== null && typeof input === 'object') {
      const out: Record<string, unknown> = {};
      for (const [childKey, child] of Object.entries(input)) {
        out[childKey] = visit(child, childKey);
      }
      return out;
    }
    return input;
  };
  return visit(value) as T;
}

function buildSourceEntries(
  input: DraftPackageInput,
  hash: (bytes: Uint8Array) => string,
): {
  entries: PackageEntry[];
  sources: NonNullable<PackageManifest['sources']>;
  sourceByteCount: number;
} {
  const entries: PackageEntry[] = [];
  const sources: NonNullable<PackageManifest['sources']> = [];
  const sourceBytes = input.sourceBytes ?? new Map<ContentHash, PackageBinary>();
  const seenSourceIds = new Set<string>();
  const seenBytes = new Map<string, string>();
  let sourceByteCount = 0;

  for (const source of input.snapshot.sources) {
    if (seenSourceIds.has(source.sourceId)) {
      throw new PackageSafetyError(`duplicate source id: ${source.sourceId}`);
    }
    seenSourceIds.add(source.sourceId);
    assertSha256(source.sha256, `source ${source.sourceId}`);
    const metadataPath = validatePackagePath(`sources/${source.sourceId}.json`);
    entries.push({ path: metadataPath, data: canonicalJson(sanitizePackageMetadata(source)) });
    const bytes = sourceBytes.get(source.sha256);
    let bytesPath: string | undefined;
    if (bytes) {
      const extension = validateExtension(bytes.extension);
      const actual = hash(bytes.bytes);
      if (actual !== source.sha256) {
        throw new PackageSafetyError(`source hash mismatch for ${source.sourceId}`);
      }
      bytesPath = validatePackagePath(`sources/${source.sha256}.${extension}`);
      const existingPath = seenBytes.get(source.sha256);
      if (!existingPath) {
        seenBytes.set(source.sha256, bytesPath);
        entries.push({ path: bytesPath, data: bytes.bytes });
        sourceByteCount += 1;
      } else {
        bytesPath = existingPath;
      }
    }
    sources.push({ sourceId: source.sourceId, metadataPath, ...(bytesPath ? { bytesPath } : {}) });
  }

  for (const hashValue of sourceBytes.keys()) {
    if (!input.snapshot.sources.some((source) => source.sha256 === hashValue)) {
      throw new PackageSafetyError(`source bytes supplied for unknown source: ${hashValue}`);
    }
  }
  return { entries, sources, sourceByteCount };
}

async function buildSourceEntriesAsync(
  input: DraftPackageInput,
  hash: (bytes: Uint8Array) => Promise<string>,
): Promise<{
  entries: PackageEntry[];
  sources: NonNullable<PackageManifest['sources']>;
  sourceByteCount: number;
}> {
  const entries: PackageEntry[] = [];
  const sources: NonNullable<PackageManifest['sources']> = [];
  const sourceBytes = input.sourceBytes ?? new Map<ContentHash, PackageBinary>();
  const seenSourceIds = new Set<string>();
  const seenBytes = new Map<string, string>();
  let sourceByteCount = 0;

  for (const source of input.snapshot.sources) {
    if (seenSourceIds.has(source.sourceId)) {
      throw new PackageSafetyError(`duplicate source id: ${source.sourceId}`);
    }
    seenSourceIds.add(source.sourceId);
    assertSha256(source.sha256, `source ${source.sourceId}`);
    const metadataPath = validatePackagePath(`sources/${source.sourceId}.json`);
    entries.push({ path: metadataPath, data: canonicalJson(sanitizePackageMetadata(source)) });
    const bytes = sourceBytes.get(source.sha256);
    let bytesPath: string | undefined;
    if (bytes) {
      const extension = validateExtension(bytes.extension);
      const actual = await hash(bytes.bytes);
      if (actual !== source.sha256) {
        throw new PackageSafetyError(`source hash mismatch for ${source.sourceId}`);
      }
      bytesPath = validatePackagePath(`sources/${source.sha256}.${extension}`);
      const existingPath = seenBytes.get(source.sha256);
      if (!existingPath) {
        seenBytes.set(source.sha256, bytesPath);
        entries.push({ path: bytesPath, data: bytes.bytes });
        sourceByteCount += 1;
      } else {
        bytesPath = existingPath;
      }
    }
    sources.push({ sourceId: source.sourceId, metadataPath, ...(bytesPath ? { bytesPath } : {}) });
  }

  for (const hashValue of sourceBytes.keys()) {
    if (!input.snapshot.sources.some((source) => source.sha256 === hashValue)) {
      throw new PackageSafetyError(`source bytes supplied for unknown source: ${hashValue}`);
    }
  }
  return { entries, sources, sourceByteCount };
}

function buildReportEntries(input: DraftPackageInput): {
  entries: PackageEntry[];
  paths: string[];
} {
  const entries: PackageEntry[] = [];
  const paths: string[] = [];
  for (const [name, report] of Object.entries(input.reports ?? {})) {
    const path = validatePackagePath(`reports/${name}.json`);
    entries.push({ path, data: canonicalJson(sanitizePackageMetadata(report)) });
    paths.push(path);
  }
  if (input.attributions && input.attributions.size > 0) {
    const path = 'reports/asset-licenses.json';
    entries.push({ path, data: canonicalJson(attributionReport(input.attributions)) });
    paths.push(path);
  }
  return { entries, paths: paths.sort() };
}

function buildRuntimeEntries(input: DraftPackageInput): {
  entries: PackageEntry[];
  evidenceIncluded: boolean;
} {
  const runtime = input.runtime;
  const evidenceIncluded = runtime?.includeEvidence ?? input.packageType === 'backup';
  if (!runtime || !evidenceIncluded) {
    if (runtime?.evidenceRecords?.length || runtime?.files?.size) {
      throw new PackageSafetyError('runtime evidence requires backup inclusion policy');
    }
    return { entries: [], evidenceIncluded: false };
  }
  const entries: PackageEntry[] = [];
  if (runtime.evidenceRecords) {
    entries.push({
      path: 'runtime/evidence/index.json',
      data: canonicalJson(sanitizePackageMetadata(runtime.evidenceRecords)),
    });
  }
  for (const [name, file] of runtime.files ?? []) {
    const path = validatePackagePath(
      `runtime/evidence/${name}.${validateExtension(file.extension)}`,
    );
    entries.push({ path, data: file.bytes });
  }
  return { entries, evidenceIncluded: true };
}

/** Build the draft package entry list (sorted, validated). */
export function buildDraftEntries(input: DraftPackageInput): PackageEntry[] {
  if (input.snapshot.schemaVersion !== GUIDE_SCHEMA_VERSION) {
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

  const sourceResult = buildSourceEntries(input, hashBytes);
  entries.push(...sourceResult.entries);
  const reportResult = buildReportEntries(input);
  entries.push(...reportResult.entries);
  const runtimeResult = buildRuntimeEntries(input);
  entries.push(...runtimeResult.entries);

  // manifest.json (contains per-entry hashes; must be computed after all
  // content/report/runtime entries have been added)
  const manifest: PackageManifest = {
    ...(input.extraManifest ?? {}),
    format: 'gforge',
    version: 2,
    packageType: input.packageType ?? 'draft',
    createdAt: FIXED_TIMESTAMP,
    guideId: input.snapshot.guideId,
    schemaVersion: input.snapshot.schemaVersion,
    entries: entries.map((e) => ({
      path: e.path,
      sha256: hashBytes(e.data),
      sizeBytes: e.data.length,
    })),
    assetCount: assetEntries.length,
    sourceCount: input.snapshot.sources.length,
    sourceByteCount: sourceResult.sourceByteCount,
    sources: sourceResult.sources,
    reportPaths: reportResult.paths,
    runtime: {
      evidenceIncluded: runtimeResult.evidenceIncluded,
      ...(runtimeResult.evidenceIncluded && input.runtime?.evidenceRecords
        ? { evidenceIndexPath: 'runtime/evidence/index.json' }
        : {}),
    },
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
  const manifest = parsePackageManifest(manifestEntry.data);

  const entryMap = new Map(entries.map((e) => [e.path, e]));
  const declaredPaths = new Set<string>();
  for (const declared of manifest.entries) {
    validatePackagePath(declared.path);
    if (declared.path === 'manifest.json' || declaredPaths.has(declared.path)) {
      throw new PackageSafetyError(`invalid duplicate manifest entry: ${declared.path}`);
    }
    declaredPaths.add(declared.path);
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
  for (const entry of entries) {
    if (entry.path !== 'manifest.json' && !declaredPaths.has(entry.path)) {
      throw new PackageSafetyError(`unlisted package entry: ${entry.path}`);
    }
  }
  return manifest;
}

function parsePackageManifest(data: Uint8Array): PackageManifest {
  let manifest: PackageManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(data)) as PackageManifest;
  } catch {
    throw new PackageSafetyError('invalid manifest.json');
  }
  if (
    manifest.format !== 'gforge' ||
    (manifest.version !== 1 && manifest.version !== 2) ||
    (manifest.packageType !== 'draft' && manifest.packageType !== 'backup') ||
    !Array.isArray(manifest.entries)
  ) {
    throw new PackageSafetyError('unsupported package manifest');
  }
  return manifest;
}

/** Browser variant of verifyPackageStructure using WebCrypto. */
export async function verifyPackageStructureAsync(
  entries: PackageEntry[],
): Promise<PackageManifest> {
  const manifestEntry = entries.find((e) => e.path === 'manifest.json');
  if (!manifestEntry) throw new PackageSafetyError('missing manifest.json');
  const manifest = parsePackageManifest(manifestEntry.data);

  const entryMap = new Map(entries.map((e) => [e.path, e]));
  const declaredPaths = new Set<string>();
  for (const declared of manifest.entries) {
    validatePackagePath(declared.path);
    if (declared.path === 'manifest.json' || declaredPaths.has(declared.path)) {
      throw new PackageSafetyError(`invalid duplicate manifest entry: ${declared.path}`);
    }
    declaredPaths.add(declared.path);
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
  for (const entry of entries) {
    if (entry.path !== 'manifest.json' && !declaredPaths.has(entry.path)) {
      throw new PackageSafetyError(`unlisted package entry: ${entry.path}`);
    }
  }
  return manifest;
}

/**
 * Preflight then stream ZIP files through fflate's async decoder. The caller
 * receives complete entries, but inflation is bounded per file and per archive
 * while the decoder is running; unsafe paths are rejected before `start()`.
 */
export function extractZipArchive(bytes: Uint8Array): Promise<PackageEntry[]> {
  const preflight = preflightZipArchive(bytes);
  return new Promise((resolve, reject) => {
    const entries: PackageEntry[] = [];
    const seen = new Set<string>();
    let discovered = 0;
    let finished = 0;
    let totalInflated = 0;
    let pushedFinal = false;
    let settled = false;

    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new PackageSafetyError(String(error)));
    };
    const maybeResolve = (): void => {
      if (!settled && pushedFinal && finished === discovered) {
        settled = true;
        entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
        resolve(entries);
      }
    };

    const unzipper = new Unzip((file) => {
      discovered += 1;
      try {
        const path = validatePackagePath(file.name);
        if (seen.has(path)) throw new PackageSafetyError(`duplicate entry path: ${path}`);
        seen.add(path);
        if (file.originalSize !== undefined && file.originalSize > MAX_SINGLE_FILE_BYTES) {
          throw new PackageSafetyError(`entry too large after inflation: ${path}`);
        }
        const chunks: Uint8Array[] = [];
        let size = 0;
        file.ondata = (error, chunk, final) => {
          if (error) return fail(error);
          size += chunk.length;
          totalInflated += chunk.length;
          if (size > MAX_SINGLE_FILE_BYTES || totalInflated > MAX_TOTAL_BYTES) {
            file.terminate();
            return fail(
              new PackageSafetyError(
                size > MAX_SINGLE_FILE_BYTES
                  ? `entry too large after inflation: ${path}`
                  : 'archive expands beyond total size budget',
              ),
            );
          }
          chunks.push(chunk);
          if (final) {
            finished += 1;
            entries.push({ path, data: concatChunks(chunks, size) });
            maybeResolve();
          }
        };
        file.start();
      } catch (error) {
        file.terminate();
        fail(error);
      }
    });
    unzipper.register(AsyncUnzipInflate);
    try {
      unzipper.push(bytes, true);
      pushedFinal = true;
      if (discovered !== 0 && preflight.entryCount !== discovered) {
        fail(new PackageSafetyError('archive entry count changed during extraction'));
      }
      maybeResolve();
    } catch (error) {
      fail(error);
    }
  });
}

function concatChunks(chunks: Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
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
  if (input.snapshot.schemaVersion !== GUIDE_SCHEMA_VERSION) {
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

  const sourceResult = await buildSourceEntriesAsync(input, hash);
  entries.push(...sourceResult.entries);
  const reportResult = buildReportEntries(input);
  entries.push(...reportResult.entries);
  const runtimeResult = buildRuntimeEntries(input);
  entries.push(...runtimeResult.entries);

  const manifest: PackageManifest = {
    ...(input.extraManifest ?? {}),
    format: 'gforge',
    version: 2,
    packageType: input.packageType ?? 'draft',
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
    sourceCount: input.snapshot.sources.length,
    sourceByteCount: sourceResult.sourceByteCount,
    sources: sourceResult.sources,
    reportPaths: reportResult.paths,
    runtime: {
      evidenceIncluded: runtimeResult.evidenceIncluded,
      ...(runtimeResult.evidenceIncluded && input.runtime?.evidenceRecords
        ? { evidenceIndexPath: 'runtime/evidence/index.json' }
        : {}),
    },
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

export {
  buildReleaseEntries,
  createReleasePackage,
  serializeReleasePackage,
  verifyReleasePackage,
} from './release.js';
export type {
  ReleaseInput,
  ReleaseSignatureManifest,
  ReleaseVerificationResult,
} from './release.js';
export {
  canonicalJsonRfc8785,
  derivePublicKeyHex,
  generateSigningKeyPair,
  ReleaseSignatureError,
  signReleasePayload,
  TrustedKeyStore,
  verifyReleaseSignature,
} from './signing.js';
export type { Ed25519PublicKey, Ed25519Signature, TrustedKeyEntry } from './signing.js';

export { buildUsdzContainer, quickLookModelLink, USDZ_MIME } from './usdz.js';
export type { QuickLookLink, UsdzInput } from './usdz.js';
