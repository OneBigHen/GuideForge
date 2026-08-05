/**
 * Deterministic signed `.gforge` release package.
 *
 * Release package layout (extends the draft layout):
 *   manifest.json          — package manifest with per-entry hashes
 *   guide.json             — canonical GuideSnapshot
 *   signatures/release-signature.json — RFC 8785 canonical payload + Ed25519 sig
 *
 * Determinism: fixed mtime, store level, lexicographic entries, canonical JSON.
 * Verification: every entry hash, canonical payload match, and signature.
 */
import type { AssetReference, ContentHash } from '@guideforge/domain';
import type { GuideSnapshot } from '@guideforge/guide-schema';
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import {
  FIXED_TIMESTAMP,
  MAX_ENTRIES,
  MAX_SINGLE_FILE_BYTES,
  MAX_TOTAL_BYTES,
  PackageSafetyError,
  validatePackagePath,
  type PackageEntry,
} from './index.js';
import {
  canonicalJsonRfc8785,
  ReleaseSignatureError,
  signReleasePayload,
  verifyReleaseSignature,
} from './signing.js';

export interface ReleaseInput {
  snapshot: GuideSnapshot;
  assets: Map<ContentHash, AssetReference & { bytes: Uint8Array }>;
  privateKeyHex: string;
  keyId: string;
  /** Release metadata recorded in the signed payload. */
  release: { releaseId: string; releaseVersion: string; createdAt: string; guideId: string };
}

export interface ReleaseSignatureManifest {
  format: 'gforge-release';
  version: 1;
  releaseId: string;
  guideId: string;
  releaseVersion: string;
  createdAt: string;
  keyId: string;
  /** RFC 8785 canonical JSON of this manifest WITHOUT signature/signingKey. */
  payloadJson: string;
  signature: string; // hex
  signingKey: string; // hex public key
}

export function buildReleaseEntries(input: ReleaseInput): PackageEntry[] {
  if (input.snapshot.schemaVersion !== 1) {
    const version = String(input.snapshot.schemaVersion);
    throw new PackageSafetyError(`unsupported schema version ${version}`);
  }
  if (input.assets.size > MAX_ENTRIES) {
    throw new PackageSafetyError(`too many assets: ${input.assets.size}`);
  }

  const entries: PackageEntry[] = [];

  // guide.json (canonical JSON)
  const guideJson = canonicalJsonRfc8785(input.snapshot);
  entries.push({ path: 'guide.json', data: strToU8(guideJson) });

  // assets/<sha256>.<ext> sorted
  const assetEntries: { path: string; data: Uint8Array; sha256: string }[] = [];
  for (const [hash, asset] of input.assets) {
    if (asset.bytes.length > MAX_SINGLE_FILE_BYTES) {
      throw new PackageSafetyError(`asset too large: ${asset.bytes.length}`);
    }
    assetEntries.push({
      path: validatePackagePath(`assets/${hash}.${asset.extension}`),
      data: asset.bytes,
      sha256: hash,
    });
  }
  assetEntries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const entry of assetEntries) entries.push({ path: entry.path, data: entry.data });

  // Signature manifest (RFC 8785 canonical payload, Ed25519 signed).
  const payload = {
    format: 'gforge-release',
    version: 1,
    releaseId: input.release.releaseId,
    guideId: input.release.guideId,
    releaseVersion: input.release.releaseVersion,
    createdAt: input.release.createdAt,
    keyId: input.keyId,
    entryHashes: entries.map((e) => e.path).sort(),
  };
  const signed = signReleasePayload(payload, input.privateKeyHex);
  const signatureManifest: ReleaseSignatureManifest = {
    format: 'gforge-release',
    version: 1,
    releaseId: input.release.releaseId,
    guideId: input.release.guideId,
    releaseVersion: input.release.releaseVersion,
    createdAt: input.release.createdAt,
    keyId: input.keyId,
    payloadJson: signed.payloadJson,
    signature: toHex(signed.signature),
    signingKey: toHex(signed.publicKey),
  };
  entries.push({
    path: 'signatures/release-signature.json',
    data: strToU8(canonicalJsonRfc8785(signatureManifest)),
  });

  // manifest.json (contains per-entry hashes; excludes signature entry itself)
  const manifest = {
    format: 'gforge',
    version: 1,
    packageType: 'release',
    createdAt: FIXED_TIMESTAMP,
    guideId: input.snapshot.guideId,
    schemaVersion: input.snapshot.schemaVersion,
    releaseId: input.release.releaseId,
    entries: entries.map((e) => ({
      path: e.path,
      sha256: hashBytes(e.data),
      sizeBytes: e.data.length,
    })),
    assetCount: assetEntries.length,
  };
  entries.push({ path: 'manifest.json', data: strToU8(canonicalJsonRfc8785(manifest)) });

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

export function serializeReleasePackage(entries: PackageEntry[]): Uint8Array {
  const zipData: Zippable = {};
  for (const entry of entries) {
    zipData[entry.path] = [entry.data, { mtime: new Date(FIXED_TIMESTAMP), level: 0 }];
  }
  return zipSync(zipData, { level: 0 });
}

export function createReleasePackage(input: ReleaseInput): Uint8Array {
  return serializeReleasePackage(buildReleaseEntries(input));
}

export interface ReleaseVerificationResult {
  ok: boolean;
  issues: string[];
  payload?: { releaseId: string; guideId: string; releaseVersion: string; keyId: string };
}

/** Verify a release package offline: entry hashes + signature. */
export function verifyReleasePackage(bytes: Uint8Array): ReleaseVerificationResult {
  const issues: string[] = [];
  if (bytes.length > MAX_TOTAL_BYTES) return { ok: false, issues: ['package too large'] };
  let entries: PackageEntry[];
  try {
    const unzipped = unzipSync(bytes);
    entries = Object.entries(unzipped).map(([path, data]) => ({ path, data }));
  } catch (err) {
    return { ok: false, issues: [`unzip failed: ${String(err)}`] };
  }

  const byPath = new Map(entries.map((e) => [e.path, e]));
  const manifest = byPath.get('manifest.json');
  const signatureEntry = byPath.get('signatures/release-signature.json');
  if (!manifest) issues.push('missing manifest.json');
  if (!signatureEntry) issues.push('missing signature');

  // Verify every declared entry hash.
  if (manifest) {
    try {
      const manifestObj = JSON.parse(new TextDecoder().decode(manifest.data)) as {
        entries?: { path: string; sha256: string; sizeBytes: number }[];
      };
      for (const declared of manifestObj.entries ?? []) {
        const entry = byPath.get(declared.path);
        if (!entry) {
          issues.push(`missing declared entry ${declared.path}`);
          continue;
        }
        if (hashBytes(entry.data) !== declared.sha256) {
          issues.push(`hash mismatch for ${declared.path}`);
        }
      }
    } catch {
      issues.push('invalid manifest.json');
    }
  }

  // Verify signature against the canonical payload.
  if (signatureEntry) {
    try {
      const sigManifest = JSON.parse(
        new TextDecoder().decode(signatureEntry.data),
      ) as ReleaseSignatureManifest;
      const payload = JSON.parse(sigManifest.payloadJson) as Record<string, unknown>;
      const expected = canonicalJsonRfc8785(payload);
      if (expected !== sigManifest.payloadJson) {
        issues.push('signature payload is not canonical');
      }
      const ok = verifyReleaseSignature(
        sigManifest.payloadJson,
        fromHex(sigManifest.signature),
        fromHex(sigManifest.signingKey),
      );
      if (!ok) issues.push('invalid release signature');
      return {
        ok: issues.length === 0,
        issues,
        ...(ok
          ? {
              payload: {
                releaseId: String(payload.releaseId),
                guideId: String(payload.guideId),
                releaseVersion: String(payload.releaseVersion),
                keyId: String(payload.keyId),
              },
            }
          : {}),
      };
    } catch (err) {
      issues.push(`invalid signature: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { ok: issues.length === 0, issues };
}

function hashBytes(bytes: Uint8Array): string {
  // Browser-safe FNV-1a 64-bit hex (deterministic).
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const byte of bytes) {
    h1 ^= byte;
    h1 = Math.imul(h1, 0x01000193);
    h2 = Math.imul(h2 ^ byte, 0x01000193);
  }
  const toHex32 = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `${toHex32(h1)}${toHex32(h2)}`.padEnd(64, '0');
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export { ReleaseSignatureError };
