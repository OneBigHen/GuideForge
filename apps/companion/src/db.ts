import Database from 'better-sqlite3';
import { chmodSync } from 'node:fs';

export interface OwnerRecord {
  displayName: string;
  passwordHash: string;
  recoveryHash: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionRecord {
  id: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

export interface SecretMetadata {
  name: string;
  updatedAt: number;
}

export interface EncryptedSecretRecord extends SecretMetadata {
  nonce: string;
  ciphertext: string;
  tag: string;
}

export interface SigningKeyRecord {
  keyId: string;
  publicKeyHex: string;
  createdAt: number;
  status: 'active' | 'revoked' | 'retired';
  revokedAt: number | null;
  reason: string | null;
}

interface OwnerRow {
  display_name: string;
  password_hash: string;
  recovery_hash: string;
  created_at: number;
  updated_at: number;
}

interface SessionRow {
  id: string;
  token_hash: string;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
}

interface SecretRow {
  name: string;
  nonce: string;
  ciphertext: string;
  tag: string;
  updated_at: number;
}

interface PairingRow {
  id: string;
  label: string;
  token_hash: string;
  created_at: number;
  expires_at: number;
  used_at: number | null;
}

interface SigningKeyRow {
  key_id: string;
  public_key_hex: string;
  created_at: number;
  status: 'active' | 'revoked' | 'retired';
  revoked_at: number | null;
  reason: string | null;
}

const MIGRATIONS = [
  `
    CREATE TABLE owner (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      recovery_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER
    ) STRICT;
    CREATE INDEX sessions_active_idx ON sessions (token_hash, expires_at, revoked_at);

    CREATE TABLE secrets (
      name TEXT PRIMARY KEY,
      nonce TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      tag TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE pairings (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    ) STRICT;
    CREATE INDEX pairings_active_idx ON pairings (token_hash, expires_at, used_at);
  `,
  `
    CREATE TABLE signing_keys (
      key_id TEXT PRIMARY KEY,
      public_key_hex TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'retired')),
      revoked_at INTEGER,
      reason TEXT
    ) STRICT;
    CREATE INDEX signing_keys_status_idx ON signing_keys (status, created_at);
  `,
] as const;

export class CompanionDatabase {
  readonly filename: string;
  private readonly database: Database.Database;

  constructor(filename = ':memory:') {
    this.filename = filename;
    this.database = new Database(filename);
    this.database.pragma('foreign_keys = ON');
    if (filename !== ':memory:') {
      this.database.pragma('journal_mode = WAL');
      chmodSync(filename, 0o600);
    }
    this.migrate();
  }

  close(): void {
    if (this.database.open) this.database.close();
  }

  getOwner(): OwnerRecord | undefined {
    const row = this.database
      .prepare(
        'SELECT display_name, password_hash, recovery_hash, created_at, updated_at FROM owner WHERE id = 1',
      )
      .get() as OwnerRow | undefined;
    if (!row) return undefined;
    return {
      displayName: row.display_name,
      passwordHash: row.password_hash,
      recoveryHash: row.recovery_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  createOwner(
    displayName: string,
    passwordHash: string,
    recoveryHash: string,
    now = Date.now(),
  ): void {
    this.database
      .prepare(
        'INSERT INTO owner (id, display_name, password_hash, recovery_hash, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?)',
      )
      .run(displayName, passwordHash, recoveryHash, now, now);
  }

  updateOwner(passwordHash: string, recoveryHash: string, now = Date.now()): void {
    this.database
      .prepare('UPDATE owner SET password_hash = ?, recovery_hash = ?, updated_at = ? WHERE id = 1')
      .run(passwordHash, recoveryHash, now);
  }

  createSession(id: string, tokenHash: string, expiresAt: number, createdAt = Date.now()): void {
    this.database
      .prepare(
        'INSERT INTO sessions (id, token_hash, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, NULL)',
      )
      .run(id, tokenHash, createdAt, expiresAt);
  }

  getSession(tokenHash: string): SessionRecord | undefined {
    const row = this.database
      .prepare(
        'SELECT id, token_hash, created_at, expires_at, revoked_at FROM sessions WHERE token_hash = ?',
      )
      .get(tokenHash) as SessionRow | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      tokenHash: row.token_hash,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    };
  }

  revokeSession(tokenHash: string, now = Date.now()): void {
    this.database
      .prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .run(now, tokenHash);
  }

  revokeAllSessions(now = Date.now()): void {
    this.database.prepare('UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL').run(now);
  }

  putSecret(record: EncryptedSecretRecord): void {
    this.database
      .prepare(
        `INSERT INTO secrets (name, nonce, ciphertext, tag, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET nonce = excluded.nonce, ciphertext = excluded.ciphertext,
           tag = excluded.tag, updated_at = excluded.updated_at`,
      )
      .run(record.name, record.nonce, record.ciphertext, record.tag, record.updatedAt);
  }

  getSecret(name: string): EncryptedSecretRecord | undefined {
    const row = this.database
      .prepare('SELECT name, nonce, ciphertext, tag, updated_at FROM secrets WHERE name = ?')
      .get(name) as SecretRow | undefined;
    if (!row) return undefined;
    return {
      name: row.name,
      nonce: row.nonce,
      ciphertext: row.ciphertext,
      tag: row.tag,
      updatedAt: row.updated_at,
    };
  }

  listSecretMetadata(): SecretMetadata[] {
    const rows = this.database
      .prepare('SELECT name, updated_at FROM secrets ORDER BY name')
      .all() as { name: string; updated_at: number }[];
    return rows.map((row) => ({ name: row.name, updatedAt: row.updated_at }));
  }

  deleteSecret(name: string): void {
    this.database.prepare('DELETE FROM secrets WHERE name = ?').run(name);
  }

  putSigningKey(record: SigningKeyRecord): void {
    this.database
      .prepare(
        `INSERT INTO signing_keys (key_id, public_key_hex, created_at, status, revoked_at, reason)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(key_id) DO UPDATE SET public_key_hex = excluded.public_key_hex,
           status = excluded.status, revoked_at = excluded.revoked_at, reason = excluded.reason`,
      )
      .run(
        record.keyId,
        record.publicKeyHex,
        record.createdAt,
        record.status,
        record.revokedAt,
        record.reason,
      );
  }

  getSigningKey(keyId: string): SigningKeyRecord | undefined {
    const row = this.database
      .prepare(
        'SELECT key_id, public_key_hex, created_at, status, revoked_at, reason FROM signing_keys WHERE key_id = ?',
      )
      .get(keyId) as SigningKeyRow | undefined;
    return row ? signingKeyFromRow(row) : undefined;
  }

  listSigningKeys(): SigningKeyRecord[] {
    const rows = this.database
      .prepare(
        'SELECT key_id, public_key_hex, created_at, status, revoked_at, reason FROM signing_keys ORDER BY created_at DESC',
      )
      .all() as SigningKeyRow[];
    return rows.map(signingKeyFromRow);
  }

  retireActiveSigningKeys(): void {
    this.database
      .prepare("UPDATE signing_keys SET status = 'retired' WHERE status = 'active'")
      .run();
  }

  revokeSigningKey(keyId: string, reason: string, now = Date.now()): boolean {
    const result = this.database
      .prepare(
        "UPDATE signing_keys SET status = 'revoked', revoked_at = ?, reason = ? WHERE key_id = ? AND status != 'revoked'",
      )
      .run(now, reason, keyId);
    return result.changes > 0;
  }

  createPairing(
    id: string,
    label: string,
    tokenHash: string,
    expiresAt: number,
    createdAt = Date.now(),
  ): void {
    this.database
      .prepare(
        'INSERT INTO pairings (id, label, token_hash, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?, NULL)',
      )
      .run(id, label, tokenHash, createdAt, expiresAt);
  }

  consumePairing(tokenHash: string, now = Date.now()): PairingRow | undefined {
    const transaction = this.database.transaction(() => {
      const row = this.database
        .prepare(
          'SELECT id, label, token_hash, created_at, expires_at, used_at FROM pairings WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
        )
        .get(tokenHash, now) as PairingRow | undefined;
      if (!row) return undefined;
      this.database.prepare('UPDATE pairings SET used_at = ? WHERE id = ?').run(now, row.id);
      return row;
    });
    return transaction();
  }

  private migrate(): void {
    this.database.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL) STRICT;',
    );
    const row = this.database
      .prepare('SELECT MAX(version) AS version FROM schema_migrations')
      .get() as { version: number | null } | undefined;
    let version = row?.version ?? 0;
    for (const [index, sql] of MIGRATIONS.entries()) {
      const nextVersion = index + 1;
      if (nextVersion <= version) continue;
      this.database.exec('BEGIN');
      try {
        this.database.exec(sql);
        this.database
          .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
          .run(nextVersion, Date.now());
        this.database.exec('COMMIT');
        version = nextVersion;
      } catch (error) {
        this.database.exec('ROLLBACK');
        throw error;
      }
    }
  }
}

function signingKeyFromRow(row: SigningKeyRow): SigningKeyRecord {
  return {
    keyId: row.key_id,
    publicKeyHex: row.public_key_hex,
    createdAt: row.created_at,
    status: row.status,
    revokedAt: row.revoked_at,
    reason: row.reason,
  };
}
