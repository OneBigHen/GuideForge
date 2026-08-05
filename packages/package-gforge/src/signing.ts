/**
 * RFC 8785 canonical JSON + Ed25519 release signing for `.gforge` packages.
 *
 * - `canonicalJsonRfc8785` produces the RFC 8785 canonical serialization used
 *   for the signed release payload (JCS — JSON Canonicalization Scheme).
 * - `signReleasePayload` signs the canonical JSON of the release payload with
 *   the organization's Ed25519 key (separate key domain from object
 *   encryption and session signing).
 * - `verifyReleaseSignature` verifies offline.
 */
import { ed25519 } from '@noble/curves/ed25519.js';
import canonicalize from 'canonicalize';

export type Ed25519PublicKey = Uint8Array;
export type Ed25519Signature = Uint8Array;

export class ReleaseSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseSignatureError';
  }
}

/** RFC 8785 canonical serialization (JCS). Throws on unserializable input. */
export function canonicalJsonRfc8785(value: unknown): string {
  const out = canonicalize(value);
  if (out === undefined) {
    throw new ReleaseSignatureError('cannot canonicalize value');
  }
  return out;
}

/** Generate a fresh organization Ed25519 key pair (hex strings). */
export function generateSigningKeyPair(): { publicKeyHex: string; privateKeyHex: string } {
  const { secretKey, publicKey } = ed25519.keygen();
  return {
    publicKeyHex: toHex(publicKey),
    privateKeyHex: toHex(secretKey),
  };
}

export interface SignedReleasePayload {
  /** Canonicalized (RFC 8785) JSON string of the release manifest. */
  payloadJson: string;
  signature: Ed25519Signature;
  publicKey: Ed25519PublicKey;
}

/** Sign a release payload (any JSON-serializable object). */
export function signReleasePayload(payload: unknown, privateKeyHex: string): SignedReleasePayload {
  const payloadJson = canonicalJsonRfc8785(payload);
  const privateKey = fromHex(privateKeyHex);
  const signature = ed25519.sign(new TextEncoder().encode(payloadJson), privateKey);
  return {
    payloadJson,
    signature,
    publicKey: ed25519.getPublicKey(privateKey),
  };
}

/**
 * Verify a signature against the canonical payload. Returns true only for a
 * valid signature under the given public key.
 */
export function verifyReleaseSignature(
  payloadJson: string,
  signature: Ed25519Signature,
  publicKey: Ed25519PublicKey,
): boolean {
  try {
    return ed25519.verify(signature, new TextEncoder().encode(payloadJson), publicKey);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Trusted key management (rotation + revocation ledger)
// ---------------------------------------------------------------------------

export interface TrustedKeyEntry {
  keyId: string;
  publicKeyHex: string;
  createdAtIso: string;
  status: 'active' | 'revoked' | 'retired';
  revokedAtIso?: string;
  reason?: string;
}

export class TrustedKeyStore {
  private readonly keys = new Map<string, TrustedKeyEntry>();

  constructor(initial: TrustedKeyEntry[] = []) {
    for (const entry of initial) this.keys.set(entry.keyId, entry);
  }

  add(entry: TrustedKeyEntry): void {
    if (this.keys.has(entry.keyId))
      throw new ReleaseSignatureError(`key ${entry.keyId} already exists`);
    this.keys.set(entry.keyId, entry);
  }

  revoke(keyId: string, reason: string): void {
    const entry = this.keys.get(keyId);
    if (!entry) throw new ReleaseSignatureError(`unknown key ${keyId}`);
    entry.status = 'revoked';
    entry.revokedAtIso = new Date().toISOString();
    entry.reason = reason;
  }

  /** True if the key is active at the given time. */
  isActive(keyId: string, atIso?: string): boolean {
    const entry = this.keys.get(keyId);
    if (entry?.status !== 'active') return false;
    if (atIso === undefined) return true;
    return !(entry.revokedAtIso !== undefined && entry.revokedAtIso <= atIso);
  }

  get(keyId: string): TrustedKeyEntry | undefined {
    return this.keys.get(keyId);
  }

  list(): TrustedKeyEntry[] {
    return [...this.keys.values()];
  }
}

/** Derive the public key hex from a private key hex (Ed25519). */
export function derivePublicKeyHex(privateKeyHex: string): string {
  const publicKey = ed25519.getPublicKey(fromHex(privateKeyHex));
  return toHex(publicKey);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
