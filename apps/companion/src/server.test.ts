import type { FastifyInstance } from 'fastify';
import { execFileSync } from 'node:child_process';
import { createPublicKey, randomBytes, verify as verifySignature } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CompanionDatabase, type SessionRecord } from './db.js';
import {
  DUMMY_CREDENTIAL_HASH,
  hashCredential,
  isArgon2idHash,
  loadSecretBox,
  SecretBox,
} from './security.js';
import { assertTransportConfig, buildServer, isSessionActive } from './server.js';

const ORIGIN = 'http://localhost:1420';
const PASSWORD = 'correct horse battery staple';

function responseCookie(response: { cookies: { name: string; value: string }[] }): string {
  return response.cookies.find((cookie) => cookie.name === 'gf_session')?.value ?? '';
}

function jsonOf<T>(response: { json(): unknown }): T {
  return response.json() as T;
}

interface NetworkResponse {
  body: string;
  headers: { 'set-cookie': string[] | undefined };
  statusCode: number;
}

function httpsJson(
  method: string,
  url: string,
  payload?: Record<string, string>,
  cookie?: string,
): Promise<NetworkResponse> {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : undefined;
    const request = httpsRequest(
      url,
      {
        method,
        rejectUnauthorized: false,
        headers: {
          ...(body
            ? {
                'content-length': Buffer.byteLength(body),
                'content-type': 'application/json',
              }
            : {}),
          ...(cookie ? { cookie } : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            headers: { 'set-cookie': response.headers['set-cookie'] },
            statusCode: response.statusCode ?? 0,
          });
        });
      },
    );
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

function cookieHeaders(token: string, origin?: string): Record<string, string> {
  return {
    cookie: `gf_session=${token}`,
    ...(origin ? { origin } : {}),
  };
}

async function closeApp(app: FastifyInstance, db: CompanionDatabase): Promise<void> {
  await app.close();
  db.close();
}

describe('companion owner security', () => {
  let app: FastifyInstance;
  let db: CompanionDatabase;
  let secretBox: SecretBox;
  let recoveryCode = '';
  let sessionCookie = '';

  beforeAll(async () => {
    db = new CompanionDatabase();
    secretBox = new SecretBox(randomBytes(32));
    app = await buildServer(
      {
        allowedOrigins: [ORIGIN],
        logLevel: 'silent',
        sessionTtlSeconds: 60,
        limits: { loginAttempts: 20 },
      },
      { db, secretBox },
    );
  });

  afterAll(async () => {
    await closeApp(app, db);
  });

  it('uses a real owner credential and negotiates capabilities', async () => {
    const unknownOwner = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { userId: 'unknown-owner', password: 'wrong password' },
    });
    expect(unknownOwner.statusCode).toBe(401);

    const anonymous = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { userId: 'owner' },
    });
    expect(anonymous.statusCode).toBe(400);

    const setup = await app.inject({
      method: 'POST',
      url: '/api/owner/setup',
      payload: { displayName: 'Owner', password: PASSWORD },
    });
    expect(setup.statusCode).toBe(201);
    recoveryCode = jsonOf<{ recoveryCode: string }>(setup).recoveryCode;
    expect(recoveryCode).toHaveLength(32);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/owner/setup',
      payload: { displayName: 'Other', password: PASSWORD },
    });
    expect(duplicate.statusCode).toBe(409);

    const capabilities = await app.inject({ method: 'GET', url: '/api/capabilities' });
    const body = jsonOf<{
      auth: {
        ownerConfigured: boolean;
        passwordHash: string;
        session: string;
        passkey: { seam: string };
      };
      features: {
        sqlite: boolean;
        encryptedProviderSecrets: boolean;
        pairing: boolean;
        signingKeyStore: boolean;
      };
      transport: {
        loopbackDefault: boolean;
        httpsRequiredForNonLoopback: boolean;
        secureCookies: boolean;
      };
    }>(capabilities);
    expect(capabilities.statusCode).toBe(200);
    expect(body.auth.ownerConfigured).toBe(true);
    expect(body.auth.passwordHash).toBe('argon2id');
    expect(body.auth.session).toBe('opaque-rotating-cookie');
    expect(body.auth.passkey.seam).toBe('webauthn-v1');
    expect(body.features).toEqual({
      sqlite: true,
      encryptedProviderSecrets: true,
      pairing: true,
      signingKeyStore: true,
    });
    expect(body.transport).toEqual({
      loopbackDefault: true,
      httpsRequiredForNonLoopback: true,
      secureCookies: false,
    });
    expect(db.getOwner()?.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('rejects wrong credentials and issues an opaque HttpOnly session', async () => {
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { userId: 'owner', password: 'wrong password' },
    });
    expect(wrong.statusCode).toBe(401);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { userId: 'ignored-user-id', password: PASSWORD },
    });
    sessionCookie = responseCookie(login);
    expect(login.statusCode).toBe(200);
    expect(sessionCookie).not.toBe('');
    expect(String(login.headers['set-cookie'])).toContain('HttpOnly');
    expect(String(login.headers['set-cookie'])).toContain('SameSite=Strict');
    expect(String(login.headers['set-cookie'])).not.toContain('Secure');

    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: cookieHeaders(sessionCookie),
    });
    expect(session.json()).toMatchObject({ authenticated: true, displayName: 'Owner' });
  });

  it('enforces origin checks on cookie-authenticated writes', async () => {
    const noOrigin = await app.inject({
      method: 'PUT',
      url: '/api/settings/secrets/provider',
      headers: cookieHeaders(sessionCookie),
      payload: { value: 'provider-secret' },
    });
    const badOrigin = await app.inject({
      method: 'PUT',
      url: '/api/settings/secrets/provider',
      headers: cookieHeaders(sessionCookie, 'https://evil.example'),
      payload: { value: 'provider-secret' },
    });
    expect(noOrigin.statusCode).toBe(403);
    expect(badOrigin.statusCode).toBe(403);

    const allowed = await app.inject({
      method: 'PUT',
      url: '/api/settings/secrets/provider',
      headers: cookieHeaders(sessionCookie, ORIGIN),
      payload: { value: 'provider-secret' },
    });
    expect(allowed.statusCode).toBe(200);

    const metadata = await app.inject({
      method: 'GET',
      url: '/api/settings/secrets/provider',
      headers: cookieHeaders(sessionCookie),
    });
    expect(metadata.json()).toMatchObject({ configured: true, name: 'provider' });
    expect(JSON.stringify(metadata.json())).not.toContain('provider-secret');
    const stored = db.getSecret('provider');
    expect(stored).toBeDefined();
    expect(secretBox.decrypt(stored!)).toBe('provider-secret');
  });

  it('rotates, signs with, and revokes encrypted companion signing keys', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/signing-keys/rotate',
      headers: cookieHeaders(sessionCookie, ORIGIN),
    });
    expect(first.statusCode).toBe(200);
    const firstKey = jsonOf<{ keyId: string; publicKeyHex: string }>(first);
    expect(firstKey.publicKeyHex).toHaveLength(64);
    expect(db.getSecret(`signing-key-${firstKey.keyId}`)).toBeDefined();

    const second = await app.inject({
      method: 'POST',
      url: '/api/signing-keys/rotate',
      headers: cookieHeaders(sessionCookie, ORIGIN),
    });
    const secondKey = jsonOf<{ keyId: string; publicKeyHex: string }>(second);
    expect(second.statusCode).toBe(200);
    expect(secondKey.keyId).not.toBe(firstKey.keyId);

    const listed = await app.inject({
      method: 'GET',
      url: '/api/signing-keys',
      headers: cookieHeaders(sessionCookie),
    });
    const listedKeys = jsonOf<{ keys: { keyId: string; status: string }[] }>(listed).keys;
    expect(listedKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ keyId: firstKey.keyId, status: 'retired' }),
        expect.objectContaining({ keyId: secondKey.keyId, status: 'active' }),
      ]),
    );

    const payloadJson = '{"guideId":"guide-1","version":1}';
    const signed = await app.inject({
      method: 'POST',
      url: `/api/signing-keys/${secondKey.keyId}/sign`,
      headers: cookieHeaders(sessionCookie, ORIGIN),
      payload: { payloadJson },
    });
    const signature = jsonOf<{ signatureHex: string; publicKeyHex: string }>(signed);
    const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
    const valid = verifySignature(
      null,
      Buffer.from(payloadJson),
      createPublicKey({
        key: Buffer.concat([spkiPrefix, Buffer.from(signature.publicKeyHex, 'hex')]),
        format: 'der',
        type: 'spki',
      }),
      Buffer.from(signature.signatureHex, 'hex'),
    );
    expect(signed.statusCode).toBe(200);
    expect(valid).toBe(true);

    const revoked = await app.inject({
      method: 'POST',
      url: `/api/signing-keys/${secondKey.keyId}/revoke`,
      headers: cookieHeaders(sessionCookie, ORIGIN),
      payload: { reason: 'test rotation' },
    });
    expect(revoked.statusCode).toBe(200);
    expect(db.getSecret(`signing-key-${secondKey.keyId}`)).toBeUndefined();
    const afterRevoke = await app.inject({
      method: 'POST',
      url: `/api/signing-keys/${secondKey.keyId}/sign`,
      headers: cookieHeaders(sessionCookie, ORIGIN),
      payload: { payloadJson },
    });
    expect(afterRevoke.statusCode).toBe(409);
  });

  it('rotates and revokes sessions, and consumes pairing codes once', async () => {
    const previousCookie = sessionCookie;
    const rotated = await app.inject({
      method: 'POST',
      url: '/api/auth/rotate',
      headers: cookieHeaders(previousCookie, ORIGIN),
    });
    sessionCookie = responseCookie(rotated);
    expect(rotated.statusCode).toBe(200);
    expect(sessionCookie).not.toBe(previousCookie);

    const oldSession = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: cookieHeaders(previousCookie),
    });
    expect(oldSession.json()).toEqual({ authenticated: false });

    const pairing = await app.inject({
      method: 'POST',
      url: '/api/pairings',
      headers: cookieHeaders(sessionCookie, ORIGIN),
      payload: { label: 'iPad', ttlSeconds: 60 },
    });
    const pairingCode = jsonOf<{ pairingCode: string }>(pairing).pairingCode;
    expect(pairing.statusCode).toBe(200);

    const paired = await app.inject({
      method: 'POST',
      url: '/api/auth/pair',
      payload: { pairingCode },
    });
    const pairedCookie = responseCookie(paired);
    expect(paired.statusCode).toBe(200);
    expect(pairedCookie).not.toBe('');

    const reused = await app.inject({
      method: 'POST',
      url: '/api/auth/pair',
      payload: { pairingCode },
    });
    expect(reused.statusCode).toBe(401);

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: cookieHeaders(pairedCookie, ORIGIN),
    });
    expect(logout.statusCode).toBe(200);
    const loggedOut = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: cookieHeaders(pairedCookie),
    });
    expect(loggedOut.json()).toEqual({ authenticated: false });

    const revokeAll = await app.inject({
      method: 'POST',
      url: '/api/auth/revoke-all',
      headers: cookieHeaders(sessionCookie, ORIGIN),
    });
    expect(revokeAll.statusCode).toBe(200);
    const revoked = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: cookieHeaders(sessionCookie),
    });
    expect(revoked.json()).toEqual({ authenticated: false });
  });

  it('rotates recovery credentials and invalidates old sessions', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: PASSWORD },
    });
    const oldCookie = responseCookie(login);
    expect(login.statusCode).toBe(200);

    const recovery = await app.inject({
      method: 'POST',
      url: '/api/auth/recover',
      payload: { recoveryCode, password: 'new correct password' },
    });
    expect(recovery.statusCode).toBe(200);
    recoveryCode = jsonOf<{ recoveryCode: string }>(recovery).recoveryCode;

    const oldSession = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: cookieHeaders(oldCookie),
    });
    expect(oldSession.json()).toEqual({ authenticated: false });

    const oldPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: PASSWORD },
    });
    const newPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'new correct password' },
    });
    expect(oldPassword.statusCode).toBe(401);
    expect(newPassword.statusCode).toBe(200);
  });
});

describe('companion boundaries and resource controls', () => {
  it('authenticates a second HTTPS client over a real listener', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'guideforge-companion-tls-'));
    const keyPath = join(directory, 'key.pem');
    const certPath = join(directory, 'cert.pem');
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-subj',
        '/CN=localhost',
        '-days',
        '1',
      ],
      { stdio: 'ignore' },
    );
    const db = new CompanionDatabase();
    const app = await buildServer(
      {
        allowedOrigins: [ORIGIN],
        host: '127.0.0.1',
        logLevel: 'silent',
        tls: { cert: readFileSync(certPath), key: readFileSync(keyPath) },
      },
      { db, secretBox: new SecretBox(randomBytes(32)) },
    );
    try {
      const address = await app.listen({ host: '127.0.0.1', port: 0 });
      const baseUrl = new URL(address);
      baseUrl.pathname = '/api/owner/setup';
      const setup = await httpsJson('POST', baseUrl.toString(), {
        displayName: 'HTTPS owner',
        password: PASSWORD,
      });
      expect(setup.statusCode).toBe(201);

      baseUrl.pathname = '/api/auth/login';
      const login = await httpsJson('POST', baseUrl.toString(), { password: PASSWORD });
      const cookie = login.headers['set-cookie']?.[0]?.split(';', 1)[0] ?? '';
      expect(login.statusCode).toBe(200);
      expect(login.headers['set-cookie']?.[0]).toContain('Secure');

      baseUrl.pathname = '/api/auth/session';
      const session = await httpsJson('GET', baseUrl.toString(), undefined, cookie);
      expect(session.statusCode).toBe(200);
      expect(JSON.parse(session.body)).toMatchObject({
        authenticated: true,
        displayName: 'HTTPS owner',
      });
    } finally {
      await closeApp(app, db);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('requires TLS for LAN hosts and uses Secure cookies when enabled', async () => {
    expect(() => assertTransportConfig('192.168.1.50')).toThrow(/HTTPS/);
    expect(() => assertTransportConfig('192.168.1.50', { key: 'key', cert: 'cert' })).not.toThrow();
    expect(() => assertTransportConfig('127.0.0.1')).not.toThrow();

    const db = new CompanionDatabase();
    const app = await buildServer(
      { allowedOrigins: [ORIGIN], logLevel: 'silent', secureCookies: true },
      { db, secretBox: new SecretBox(randomBytes(32)) },
    );
    try {
      await app.inject({
        method: 'POST',
        url: '/api/owner/setup',
        payload: { displayName: 'Owner', password: PASSWORD },
      });
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { password: PASSWORD },
      });
      expect(String(login.headers['set-cookie'])).toContain('Secure');
    } finally {
      await closeApp(app, db);
    }
  });

  it('limits brute-force attempts and rejects expired or revoked sessions', async () => {
    const db = new CompanionDatabase();
    const app = await buildServer(
      { allowedOrigins: [ORIGIN], logLevel: 'silent', limits: { loginAttempts: 2 } },
      { db, secretBox: new SecretBox(randomBytes(32)) },
    );
    try {
      await app.inject({
        method: 'POST',
        url: '/api/owner/setup',
        payload: { displayName: 'Owner', password: PASSWORD },
      });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { password: 'wrong password' },
        });
        expect(response.statusCode).toBe(401);
      }
      const blocked = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { password: 'wrong password' },
      });
      expect(blocked.statusCode).toBe(429);
    } finally {
      await closeApp(app, db);
    }

    const session: SessionRecord = {
      id: 'session',
      tokenHash: 'hash',
      createdAt: 1,
      expiresAt: 10,
      revokedAt: null,
    };
    expect(isSessionActive(session, 9)).toBe(true);
    expect(isSessionActive(session, 10)).toBe(false);
    expect(isSessionActive({ ...session, revokedAt: 5 }, 9)).toBe(false);
  });

  it('persists migrations and protects the generated master key', () => {
    const directory = mkdtempSync(join(tmpdir(), 'guideforge-companion-'));
    try {
      const databasePath = join(directory, 'companion.sqlite');
      const first = new CompanionDatabase(databasePath);
      first.createOwner('Owner', DUMMY_CREDENTIAL_HASH, DUMMY_CREDENTIAL_HASH);
      first.close();

      const second = new CompanionDatabase(databasePath);
      expect(second.getOwner()?.displayName).toBe('Owner');
      second.close();
      expect(statSync(databasePath).mode & 0o777).toBe(0o600);

      const box = loadSecretBox(join(directory, 'secrets'));
      expect(box).toBeInstanceOf(SecretBox);
      expect(statSync(join(directory, 'secrets', 'master.key')).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('produces and verifies Argon2id credentials', async () => {
    const hash = await hashCredential(PASSWORD);
    expect(isArgon2idHash(hash)).toBe(true);
    expect(hash).not.toContain(PASSWORD);
  });
});
