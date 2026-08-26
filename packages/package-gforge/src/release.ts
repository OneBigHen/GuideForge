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
import { sha256Hex } from '@guideforge/domain';
import type { GuideSnapshot } from '@guideforge/guide-schema';
import { GUIDE_SCHEMA_VERSION } from '@guideforge/guide-schema';
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import {
  FIXED_TIMESTAMP,
  MAX_ENTRIES,
  MAX_SINGLE_FILE_BYTES,
  MAX_TOTAL_BYTES,
  PackageSafetyError,
  preflightZipArchive,
  validatePackagePath,
  type PackageEntry,
} from './index.js';
import {
  canonicalJsonRfc8785,
  ReleaseSignatureError,
  signReleasePayload,
  verifyReleaseSignature,
  type TrustedKeyStore,
} from './signing.js';

export interface ReleaseInput {
  snapshot: GuideSnapshot;
  assets: Map<ContentHash, AssetReference & { bytes: Uint8Array }>;
  /** Optional owner signing key. When omitted the release is UNSIGNED: a
   * personal draft release that browsers may export without ever holding a
   * signing key (keys belong in the companion key store / OS secure store,
   * never localStorage). */
  privateKeyHex?: string;
  /** Key identifier; required for signed releases, informational otherwise. */
  keyId?: string;
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
  if (input.snapshot.schemaVersion !== GUIDE_SCHEMA_VERSION) {
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
    if (!/^[0-9a-f]{64}$/.test(hash) || hashBytes(asset.bytes) !== hash) {
      throw new PackageSafetyError(`asset hash mismatch for ${hash}`);
    }
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
  // Content entries: guide.json + assets (signature and manifest come later).
  const contentEntries = entries.slice();

  // manifest.json lists ONLY content entries (no signature file) and its
  // canonical JSON is the signed payload, so every content byte is bound.
  const manifest = {
    format: 'gforge',
    version: 1,
    packageType: 'release',
    createdAt: FIXED_TIMESTAMP,
    guideId: input.snapshot.guideId,
    schemaVersion: input.snapshot.schemaVersion,
    releaseId: input.release.releaseId,
    releaseVersion: input.release.releaseVersion,
    keyId: input.keyId ?? 'unsigned',
    signed: Boolean(input.privateKeyHex),
    entries: contentEntries.map((e) => ({
      path: e.path,
      sha256: hashBytes(e.data),
      sizeBytes: e.data.length,
    })),
    assetCount: assetEntries.length,
  };
  const manifestJson = canonicalJsonRfc8785(manifest);
  entries.push({ path: 'manifest.json', data: strToU8(manifestJson) });

  // Optional signature over the canonical manifest JSON (Ed25519). Unsigned
  // personal releases carry no signature entry; verification reports them as
  // valid-but-unsigned (trust warning) per the package policy.
  if (input.privateKeyHex) {
    const signed = signReleasePayload(manifest, input.privateKeyHex);
    const signatureManifest: ReleaseSignatureManifest = {
      format: 'gforge-release',
      version: 1,
      releaseId: input.release.releaseId,
      guideId: input.release.guideId,
      releaseVersion: input.release.releaseVersion,
      createdAt: input.release.createdAt,
      keyId: input.keyId ?? 'local',
      payloadJson: signed.payloadJson,
      signature: toHex(signed.signature),
      signingKey: toHex(signed.publicKey),
    };
    entries.push({
      path: 'signatures/release-signature.json',
      data: strToU8(canonicalJsonRfc8785(signatureManifest)),
    });
  }

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

export interface VerifyReleasePackageOptions {
  /**
   * When provided, the embedded signature is only trusted if its `keyId`
   * resolves to a currently-active entry in this store AND the embedded
   * public key matches that entry's pinned `publicKeyHex`. Without this, a
   * package's signature only proves internal self-consistency (nothing was
   * modified after signing) — anyone can generate their own keypair, sign a
   * package with it, and embed that same key alongside, which verifies as
   * `ok: true` with no trust check at all. That is fine for a local-only
   * round-trip of a release you just made yourself, but never sufficient for
   * a package received from anywhere else. Pin to companion-published
   * `keyId`s (see `TrustedKeyStore`) before trusting an externally-sourced
   * `.gforge` file.
   */
  trustedKeys?: TrustedKeyStore;
}

/** Verify a release package offline: entry hashes + signature. */
export function verifyReleasePackage(
  bytes: Uint8Array,
  options?: VerifyReleasePackageOptions,
): ReleaseVerificationResult {
  const issues: string[] = [];
  if (bytes.length > MAX_TOTAL_BYTES) return { ok: false, issues: ['package too large'] };
  let entries: PackageEntry[];
  try {
    // Bounded preflight before inflation (entry count, sizes, ratio).
    preflightZipArchive(bytes);
    const unzipped = unzipSync(bytes);
    entries = Object.entries(unzipped).map(([path, data]) => ({ path, data }));
  } catch (err) {
    return { ok: false, issues: [`unzip failed: ${String(err)}`] };
  }

  const byPath = new Map(entries.map((e) => [e.path, e]));
  const manifest = byPath.get('manifest.json');
  const signatureEntry = byPath.get('signatures/release-signature.json');
  if (!manifest) issues.push('missing manifest.json');

  // Verify every declared entry hash.
  let declaredSigned = false;
  if (manifest) {
    try {
      const manifestObj = JSON.parse(new TextDecoder().decode(manifest.data)) as {
        entries?: { path: string; sha256: string; sizeBytes: number }[];
        signed?: boolean;
      };
      declaredSigned = manifestObj.signed === true;
      const declaredPaths = new Set<string>();
      for (const declared of manifestObj.entries ?? []) {
        validatePackagePath(declared.path);
        if (declaredPaths.has(declared.path)) {
          issues.push(`duplicate declared entry ${declared.path}`);
          continue;
        }
        declaredPaths.add(declared.path);
        const entry = byPath.get(declared.path);
        if (!entry) {
          issues.push(`missing declared entry ${declared.path}`);
          continue;
        }
        if (hashBytes(entry.data) !== declared.sha256) {
          issues.push(`hash mismatch for ${declared.path}`);
        }
        if (entry.data.length !== declared.sizeBytes) {
          issues.push(`size mismatch for ${declared.path}`);
        }
      }
      for (const entry of entries) {
        if (
          entry.path !== 'manifest.json' &&
          entry.path !== 'signatures/release-signature.json' &&
          !declaredPaths.has(entry.path)
        ) {
          issues.push(`unlisted package entry ${entry.path}`);
        }
      }
    } catch {
      issues.push('invalid manifest.json');
    }
  }

  // A package that declares itself signed must carry a valid signature.
  // An unsigned personal release is valid but untrusted (reported via the
  // ok flag without a signature issue).
  if (declaredSigned && !signatureEntry)
    issues.push('missing signature (manifest declares signed)');
  if (!declaredSigned && signatureEntry)
    issues.push('signature present but manifest declares unsigned');

  // Verify signature against the canonical manifest JSON.
  if (signatureEntry) {
    try {
      const sigManifest = JSON.parse(
        new TextDecoder().decode(signatureEntry.data),
      ) as ReleaseSignatureManifest;
      const payload = JSON.parse(sigManifest.payloadJson) as Record<string, unknown>;
      if (canonicalJsonRfc8785(payload) !== sigManifest.payloadJson) {
        issues.push('signature payload is not canonical');
      }
      // `keyId` is a self-declared label with no cryptographic binding to
      // `signingKey` on its own — pinning must resolve `keyId` through the
      // trusted store and compare against ITS public key, never trust
      // whatever `signingKey` happens to be embedded in the file.
      if (options?.trustedKeys) {
        const pinned = options.trustedKeys.get(sigManifest.keyId);
        if (!pinned || !options.trustedKeys.isActive(sigManifest.keyId)) {
          issues.push(`signing key ${sigManifest.keyId} is not a trusted, active key`);
        } else if (pinned.publicKeyHex !== sigManifest.signingKey) {
          issues.push(
            `embedded signing key does not match the pinned key for ${sigManifest.keyId}`,
          );
        }
      }
      const ok = verifyReleaseSignature(
        sigManifest.payloadJson,
        fromHex(sigManifest.signature),
        fromHex(sigManifest.signingKey),
      );
      if (!ok) issues.push('invalid release signature');
      // The signed payload must equal the on-disk manifest.json content.
      if (manifest) {
        const onDisk = canonicalJsonRfc8785(JSON.parse(new TextDecoder().decode(manifest.data)));
        if (onDisk !== sigManifest.payloadJson) {
          issues.push('manifest.json does not match the signed payload');
        }
      }
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
  // Real SHA-256 of the bytes (release verification claims SHA-256 content
  // identity; FNV was an audit finding).
  return sha256Hex(bytes);
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
