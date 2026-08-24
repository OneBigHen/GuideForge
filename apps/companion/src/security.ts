import * as argon2 from 'argon2';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

// This is only used to keep unknown-owner login timing close to a known-owner
// failure. It never grants access and is not a credential for any owner.
export const DUMMY_CREDENTIAL_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$ZZRfzv6SluqUjf8hqgJ5fQ$Fbjf2IxkahbexI3BDKvHAV9jaRilsFSLuPifDAeYrWs';

export async function hashCredential(value: string): Promise<string> {
  return argon2.hash(value, ARGON2_OPTIONS);
}

export async function verifyCredential(hash: string, value: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, value);
  } catch {
    return false;
  }
}

export function isArgon2idHash(value: string): boolean {
  return value.startsWith('$argon2id$');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function constantTimeStringEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export interface EncryptedValue {
  nonce: string;
  ciphertext: string;
  tag: string;
}

export class SecretBox {
  private readonly key: Buffer;

  constructor(key: Buffer) {
    if (key.length !== 32) throw new Error('secret box key must be 32 bytes');
    this.key = Buffer.from(key);
  }

  encrypt(value: string): EncryptedValue {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      nonce: nonce.toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
    };
  }

  decrypt(value: EncryptedValue): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(value.nonce, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(value.tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}

export function loadSecretBox(dataDir: string, configuredKey?: string): SecretBox {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  chmodSync(dataDir, 0o700);
  if (configuredKey) {
    const key = Buffer.from(configuredKey, 'base64url');
    return new SecretBox(key);
  }

  const keyPath = join(dataDir, 'master.key');
  let key: Buffer;
  try {
    key = readFileSync(keyPath);
  } catch {
    key = randomBytes(32);
    writeFileSync(keyPath, key, { mode: 0o600, flag: 'wx' });
  }
  chmodSync(keyPath, 0o600);
  if (key.length !== 32) throw new Error('master.key must contain exactly 32 bytes');
  return new SecretBox(key);
}

export function assertPrivateKeyFile(path: string): void {
  const mode = statSync(path).mode & 0o777;
  if ((mode & 0o077) !== 0) throw new Error(`private key file is too permissive: ${path}`);
}
