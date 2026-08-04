/**
 * @guideforge/domain — pure guide entities and invariants.
 *
 * MUST remain framework-independent: no React, Three.js, Yjs, Dexie, Node,
 * Tauri, or database imports (enforced by `boundary` check).
 */

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

/** Guide lifecycle states. */
export type GuideLifecycleState = 'draft' | 'in-review' | 'approved' | 'signing' | 'released';

export interface GuideMetadata {
  title: string;
  description: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export function isGuideLifecycleState(value: string): value is GuideLifecycleState {
  return (
    value === 'draft' ||
    value === 'in-review' ||
    value === 'approved' ||
    value === 'signing' ||
    value === 'released'
  );
}
