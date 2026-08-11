import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CompanionDatabase, type SessionRecord } from './db.js';
import type { SecretBox } from './security.js';
import {
  DUMMY_CREDENTIAL_HASH,
  assertPrivateKeyFile,
  hashCredential,
  loadSecretBox,
  randomToken,
  sha256Hex,
  verifyCredential,
} from './security.js';

export interface CompanionTlsOptions {
  key: string | Buffer;
  cert: string | Buffer;
}

export interface CompanionLimits {
  loginAttempts?: number;
  loginWindowMs?: number;
  requestsPerIp?: number;
  requestWindowMs?: number;
  maxSecretBytes?: number;
}

export interface CompanionConfig {
  dataDir?: string;
  databasePath?: string;
  host?: string;
  port?: number;
  tls?: CompanionTlsOptions;
  allowedOrigins?: readonly string[];
  secureCookies?: boolean;
  sessionTtlSeconds?: number;
  bodyLimitBytes?: number;
  secretKey?: string;
  limits?: CompanionLimits;
  logLevel?: string;
}

export interface CompanionDeps {
  db?: CompanionDatabase;
  secretBox?: SecretBox;
}

interface CompanionRequest extends FastifyRequest {
  companionSession?: SessionRecord;
  companionSessionToken?: string;
}

const DEFAULT_ORIGINS = ['http://localhost:1420'] as const;
const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;
const DEFAULT_BODY_LIMIT = 256 * 1024;
const DEFAULT_REQUEST_LIMIT = 240;
const DEFAULT_REQUEST_WINDOW_MS = 60_000;
const DEFAULT_LOGIN_LIMIT = 5;
const DEFAULT_LOGIN_WINDOW_MS = 60_000;
const DEFAULT_SECRET_LIMIT = 16 * 1024;

export function defaultDataDir(): string {
  return join(homedir(), '.guideforge');
}

export function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost';
}

export function assertTransportConfig(host: string, tls?: CompanionTlsOptions): void {
  if (isLoopbackHost(host)) return;
  if (!tls?.key || !tls.cert) {
    throw new Error('HTTPS key and certificate are required for non-loopback companion hosts');
  }
}

export function isSessionActive(session: SessionRecord, now = Date.now()): boolean {
  return session.revokedAt === null && session.expiresAt > now;
}

function bodyRecord(request: FastifyRequest): Record<string, unknown> {
  return (request.body ?? {}) as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function validPassword(value: string): boolean {
  return value.length >= 12 && value.length <= 512;
}

function validSecretName(value: string): boolean {
  return /^[a-z][a-z0-9._-]{0,63}$/.test(value);
}

function clientIp(request: FastifyRequest): string {
  return request.ip || 'unknown';
}

function isMutating(request: FastifyRequest): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
}

function isOriginAllowed(request: FastifyRequest, allowedOrigins: readonly string[]): boolean {
  const origin = request.headers.origin;
  return typeof origin === 'string' && allowedOrigins.includes(origin);
}

export async function buildServer(
  config: CompanionConfig = {},
  deps: CompanionDeps = {},
): Promise<FastifyInstance> {
  const host = config.host ?? '127.0.0.1';
  assertTransportConfig(host, config.tls);
  const dataDir = config.dataDir ?? defaultDataDir();
  const ownsDb = !deps.db;
  const secretBox = deps.secretBox ?? loadSecretBox(dataDir, config.secretKey);
  const db =
    deps.db ?? new CompanionDatabase(config.databasePath ?? join(dataDir, 'companion.sqlite'));
  const allowedOrigins = [...(config.allowedOrigins ?? DEFAULT_ORIGINS)];
  const secureCookies = config.secureCookies ?? Boolean(config.tls);
  const sessionTtlSeconds = config.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  const limits = config.limits ?? {};
  const requestLimit = limits.requestsPerIp ?? DEFAULT_REQUEST_LIMIT;
  const requestWindowMs = limits.requestWindowMs ?? DEFAULT_REQUEST_WINDOW_MS;
  const loginLimit = limits.loginAttempts ?? DEFAULT_LOGIN_LIMIT;
  const loginWindowMs = limits.loginWindowMs ?? DEFAULT_LOGIN_WINDOW_MS;
  const maxSecretBytes = limits.maxSecretBytes ?? DEFAULT_SECRET_LIMIT;
  const requestBuckets = new Map<string, { count: number; resetAt: number }>();
  const loginBuckets = new Map<string, { count: number; resetAt: number }>();

  const fastifyOptions = {
    bodyLimit: config.bodyLimitBytes ?? DEFAULT_BODY_LIMIT,
    logger: { level: config.logLevel ?? 'info' },
  };
  const app: FastifyInstance = config.tls
    ? Fastify({ ...fastifyOptions, https: config.tls })
    : Fastify(fastifyOptions);

  await app.register(cookie);
  await app.register(cors, { origin: allowedOrigins, credentials: true });

  app.addHook('onClose', () => {
    if (ownsDb) db.close();
  });

  app.addHook('onRequest', async (request, reply) => {
    const key = clientIp(request);
    const now = Date.now();
    const bucket = requestBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      requestBuckets.set(key, { count: 1, resetAt: now + requestWindowMs });
    } else {
      bucket.count += 1;
      if (bucket.count > requestLimit) {
        return reply.code(429).send({ error: 'too many requests; slow down' });
      }
    }

    const token = request.cookies.gf_session;
    if (token) {
      const session = db.getSession(sha256Hex(token));
      if (session && isSessionActive(session, now)) {
        const companionRequest = request as CompanionRequest;
        companionRequest.companionSession = session;
        companionRequest.companionSessionToken = token;
      }
    }

    if (isMutating(request) && token && !isOriginAllowed(request, allowedOrigins)) {
      return reply.code(403).send({ error: 'origin not allowed for cookie-authenticated write' });
    }
  });

  function sessionOf(request: FastifyRequest): SessionRecord | undefined {
    return (request as CompanionRequest).companionSession;
  }

  function requireSession(request: FastifyRequest, reply: FastifyReply): SessionRecord | undefined {
    const session = sessionOf(request);
    if (!session) {
      void reply.code(401).send({ error: 'unauthenticated' });
      return undefined;
    }
    return session;
  }

  function setSessionCookie(reply: FastifyReply, token: string): void {
    reply.setCookie('gf_session', token, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'strict',
      path: '/',
      maxAge: sessionTtlSeconds,
    });
  }

  function clearSessionCookie(reply: FastifyReply): void {
    reply.clearCookie('gf_session', {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'strict',
      path: '/',
    });
  }

  function issueSession(reply: FastifyReply): { expiresAt: number } {
    const token = randomToken(32);
    const expiresAt = Date.now() + sessionTtlSeconds * 1000;
    db.createSession(randomToken(16), sha256Hex(token), expiresAt);
    setSessionCookie(reply, token);
    return { expiresAt };
  }

  function loginAllowed(ip: string): boolean {
    const now = Date.now();
    const bucket = loginBuckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      loginBuckets.set(ip, { count: 1, resetAt: now + loginWindowMs });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= loginLimit;
  }

  app.get('/health', () => ({ status: 'ok', companion: true }));
  app.get('/api/health', () => ({ status: 'ok', companion: true }));

  app.get('/api/capabilities', (request) => {
    const owner = db.getOwner();
    return {
      version: 1,
      companion: true,
      authenticated: Boolean(sessionOf(request)),
      transport: {
        loopbackDefault: true,
        httpsRequiredForNonLoopback: true,
        secureCookies: secureCookies,
      },
      auth: {
        ownerConfigured: Boolean(owner),
        passwordHash: 'argon2id',
        session: 'opaque-rotating-cookie',
        passkey: { available: false, seam: 'webauthn-v1' },
      },
      features: {
        sqlite: true,
        encryptedProviderSecrets: true,
        pairing: true,
      },
    };
  });

  app.get('/api/owner/status', () => {
    const owner = db.getOwner();
    return { configured: Boolean(owner), displayName: owner?.displayName ?? null };
  });

  app.post('/api/owner/setup', async (request, reply) => {
    if (db.getOwner()) return reply.code(409).send({ error: 'owner already configured' });
    const body = bodyRecord(request);
    const displayName = requiredString(body, 'displayName')?.trim();
    const password = requiredString(body, 'password');
    if (!displayName || displayName.length > 120 || !password || !validPassword(password)) {
      return reply
        .code(400)
        .send({ error: 'displayName and a 12-512 character password are required' });
    }
    const recoveryCode = randomToken(24);
    db.createOwner(
      displayName.trim(),
      await hashCredential(password),
      await hashCredential(recoveryCode),
    );
    return reply.code(201).send({ ok: true, displayName: displayName.trim(), recoveryCode });
  });

  app.post('/api/auth/login', async (request, reply) => {
    if (!loginAllowed(clientIp(request))) {
      return reply.code(429).send({ error: 'too many login attempts; slow down' });
    }
    const password = requiredString(bodyRecord(request), 'password');
    if (!password) return reply.code(400).send({ error: 'password required' });
    const owner = db.getOwner();
    const valid = await verifyCredential(owner?.passwordHash ?? DUMMY_CREDENTIAL_HASH, password);
    if (!owner || !valid) return reply.code(401).send({ error: 'invalid credentials' });

    const previousToken = (request as CompanionRequest).companionSessionToken;
    if (previousToken) db.revokeSession(sha256Hex(previousToken));
    const session = issueSession(reply);
    return { ok: true, expiresAt: session.expiresAt };
  });

  app.post('/api/auth/pair', async (request, reply) => {
    const code = requiredString(bodyRecord(request), 'pairingCode');
    if (!code) return reply.code(400).send({ error: 'pairingCode required' });
    const pairing = db.consumePairing(sha256Hex(code));
    if (!pairing) return reply.code(401).send({ error: 'invalid or expired pairing code' });
    const session = issueSession(reply);
    return { ok: true, expiresAt: session.expiresAt, label: pairing.label };
  });

  app.get('/api/auth/session', (request) => {
    const session = sessionOf(request);
    const owner = db.getOwner();
    return session && owner
      ? { authenticated: true, displayName: owner.displayName, expiresAt: session.expiresAt }
      : { authenticated: false };
  });

  app.post('/api/auth/rotate', (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;
    db.revokeSession(session.tokenHash);
    return { ok: true, ...issueSession(reply) };
  });

  app.post('/api/auth/logout', (request, reply) => {
    const session = sessionOf(request);
    if (session) db.revokeSession(session.tokenHash);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.post('/api/auth/revoke-all', (request, reply) => {
    if (!requireSession(request, reply)) return;
    db.revokeAllSessions();
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.post('/api/auth/recover', async (request, reply) => {
    const owner = db.getOwner();
    const body = bodyRecord(request);
    const recoveryCode = requiredString(body, 'recoveryCode');
    const password = requiredString(body, 'password');
    if (!owner || !recoveryCode || !password || !validPassword(password)) {
      return reply.code(401).send({ error: 'invalid recovery request' });
    }
    if (!(await verifyCredential(owner.recoveryHash, recoveryCode))) {
      return reply.code(401).send({ error: 'invalid recovery request' });
    }
    const nextRecoveryCode = randomToken(24);
    db.updateOwner(await hashCredential(password), await hashCredential(nextRecoveryCode));
    db.revokeAllSessions();
    return { ok: true, recoveryCode: nextRecoveryCode };
  });

  app.get('/api/settings', (request, reply) => {
    if (!requireSession(request, reply)) return;
    return {
      origins: allowedOrigins,
      transport: { secureCookies, host },
      secrets: db.listSecretMetadata(),
      passkey: { available: false, seam: 'webauthn-v1' },
    };
  });

  app.put('/api/settings/secrets/:name', async (request, reply) => {
    if (!requireSession(request, reply)) return;
    const { name } = request.params as { name: string };
    const value = requiredString(bodyRecord(request), 'value');
    if (!validSecretName(name) || !value || Buffer.byteLength(value, 'utf8') > maxSecretBytes) {
      return reply.code(400).send({ error: 'invalid secret name or value' });
    }
    const encrypted = secretBox.encrypt(value);
    db.putSecret({ name, ...encrypted, updatedAt: Date.now() });
    return { ok: true, name };
  });

  app.get('/api/settings/secrets/:name', (request, reply) => {
    if (!requireSession(request, reply)) return;
    const { name } = request.params as { name: string };
    if (!validSecretName(name)) return reply.code(400).send({ error: 'invalid secret name' });
    const secret = db.getSecret(name);
    return secret
      ? { configured: true, name: secret.name, updatedAt: secret.updatedAt }
      : { configured: false, name };
  });

  app.delete('/api/settings/secrets/:name', (request, reply) => {
    if (!requireSession(request, reply)) return;
    const { name } = request.params as { name: string };
    if (!validSecretName(name)) return reply.code(400).send({ error: 'invalid secret name' });
    db.deleteSecret(name);
    return { ok: true };
  });

  app.post('/api/pairings', (request, reply) => {
    if (!requireSession(request, reply)) return;
    const body = bodyRecord(request);
    const requestedLabel = requiredString(body, 'label') ?? 'device';
    const label = requestedLabel.slice(0, 80);
    const requestedTtl = typeof body.ttlSeconds === 'number' ? body.ttlSeconds : 300;
    const ttlSeconds = Math.max(60, Math.min(900, Math.floor(requestedTtl)));
    const pairingCode = randomToken(24);
    db.createPairing(
      randomToken(16),
      label,
      sha256Hex(pairingCode),
      Date.now() + ttlSeconds * 1000,
    );
    return { pairingCode, expiresInSeconds: ttlSeconds };
  });

  app.get('/api/auth/passkey', (_request, reply) =>
    reply.code(501).send({ error: 'passkey unavailable', seam: 'webauthn-v1' }),
  );

  return app;
}

export async function startCompanion(): Promise<void> {
  const host = process.env.GUIDEFORGE_HOST ?? '127.0.0.1';
  const dataDir = process.env.GUIDEFORGE_DATA_DIR ?? defaultDataDir();
  const keyPath = process.env.GUIDEFORGE_TLS_KEY;
  const certPath = process.env.GUIDEFORGE_TLS_CERT;
  if (Boolean(keyPath) !== Boolean(certPath)) {
    throw new Error('GUIDEFORGE_TLS_KEY and GUIDEFORGE_TLS_CERT must be set together');
  }
  const tls =
    keyPath && certPath
      ? (assertPrivateKeyFile(keyPath),
        { key: readFileSync(keyPath), cert: readFileSync(certPath) })
      : undefined;
  const config: CompanionConfig = {
    host,
    dataDir,
    port: Number(process.env.PORT ?? 4317),
    allowedOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:1420').split(','),
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
  if (tls) config.tls = tls;
  if (process.env.GUIDEFORGE_SECRET_KEY) config.secretKey = process.env.GUIDEFORGE_SECRET_KEY;
  const app = await buildServer(config);
  await app.listen({ host, port: Number(process.env.PORT ?? 4317) });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void startCompanion().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
