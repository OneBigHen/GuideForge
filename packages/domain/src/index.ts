/**
 * @guideforge/domain — pure guide entities and invariants.
 *
 * MUST remain framework-independent: no React, Three.js, Yjs, Dexie, Node,
 * Tauri, or database imports (enforced by `boundary` check).
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/** Deterministic UUID v4 generated outside the domain (injected). */
export type EntityId = string & { readonly __brand: 'EntityId' };

export function isEntityId(value: string): value is EntityId {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** SHA-256 hex content hash (64 hex chars). */
export type ContentHash = string & { readonly __brand: 'ContentHash' };

export function isContentHash(value: string): value is ContentHash {
  return /^[0-9a-f]{64}$/i.test(value);
}

/**
 * Real SHA-256 digest of arbitrary bytes, hex-encoded (64 lowercase chars).
 * Uses @noble/hashes (pure JS, audited, browser + node safe) — never FNV or
 * a padded short hash. Runtime callers must verify `isContentHash` on the
 * result when the value is typed as a ContentHash.
 */
export function sha256Hex(data: Uint8Array): string {
  return bytesToHex(sha256(data));
}

/** Guide lifecycle states (canonical release state machine). */
export type GuideLifecycleState = 'draft' | 'in-review' | 'approved' | 'signing' | 'released';

export function isGuideLifecycleState(value: string): value is GuideLifecycleState {
  return (
    value === 'draft' ||
    value === 'in-review' ||
    value === 'approved' ||
    value === 'signing' ||
    value === 'released'
  );
}

/** Release status of an immutable release package. */
export type ReleaseStatus = 'active' | 'superseded' | 'revoked';

export function isReleaseStatus(value: string): value is ReleaseStatus {
  return value === 'active' || value === 'superseded' || value === 'revoked';
}

/** Command origins (canonical, from the universal build spec). */
export type CommandOrigin =
  | 'user'
  | 'undo-redo'
  | 'migration'
  | 'import-ms-guide'
  | 'import-gforge'
  | 'ai-proposal-accept'
  | 'system-normalization';

export function isCommandOrigin(value: string): value is CommandOrigin {
  return (
    value === 'user' ||
    value === 'undo-redo' ||
    value === 'migration' ||
    value === 'import-ms-guide' ||
    value === 'import-gforge' ||
    value === 'ai-proposal-accept' ||
    value === 'system-normalization'
  );
}

/** Transform persisted as quaternion + position + scale. */
export interface SpatialTransform {
  position: { x: number; y: number; z: number };
  /** Unit quaternion (w,x,y,z). */
  rotation: { w: number; x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

export function isUnitQuaternion(r: SpatialTransform['rotation']): boolean {
  const norm = Math.sqrt(r.w * r.w + r.x * r.x + r.y * r.y + r.z * r.z);
  return Math.abs(norm - 1) < 1e-6;
}

/** Content-addressed binary asset reference. */
export interface AssetReference {
  /** SHA-256 of the asset bytes. */
  hash: ContentHash;
  mimeType: string;
  /** Preferred file extension, no leading dot. */
  extension: string;
  sizeBytes: number;
}

export interface GuideMetadata {
  title: string;
  description: string;
  createdAtIso: string;
  updatedAtIso: string;
}
