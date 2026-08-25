/**
 * GuideForge control plane (Fastify BFF + metadata/API).
 *
 * Phase 05 scope: health, identity (session), RBAC-checked room tickets,
 * review/approval workflow with append-only audit, and the release state
 * machine (without signing yet). PostgreSQL via Drizzle.
 */
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import { structuralChunking, type SourceRegion } from '@guideforge/ai-contracts';
import { isContentHash, type ContentHash } from '@guideforge/domain';
import {
  DeepSeekAdapter,
  DEFAULT_OPENROUTER_DEEPSEEK_MODEL,
  getDeepSeekModelProfile,
  getOpenRouterDeepSeekModelProfile,
  ModelGateway,
  OpenRouterAdapter,
  type DeepSeekModelProfile,
  type ModelAdapter,
} from '@guideforge/model-gateway';
import {
  SynthesisGateway,
  validateSynthesisRequest,
  type SynthesisRequest,
} from '@guideforge/synthesis';
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import Fastify, { type FastifyInstance } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { PermissionDeniedError, requirePermission, type Role } from './auth/rbac.js';
import { RoomTicketService } from './auth/room-ticket.js';
import * as schema from './db/schema.js';
import {
  defaultPublicDemoAiLimits,
  InMemoryQuotaStore,
  runPublicDemoAi,
  type DemoAiQuotaStore,
  type PublicDemoAiLimits,
  type PublicDemoProviderResult,
} from './demo-ai.js';
import { verifyTurnstile } from './turnstile.js';

export interface ApiConfig {
  databaseUrl: string;
  sessionSecret: string;
  roomTicketSecret: string;
  roomTicketTtlSeconds?: number;
  corsOrigin?: string[];
  logLevel?: string;
  /** The single owner identity (network mode). When set, only this user can
   * establish a session; roles are never accepted from the request body. */
  ownerId?: string;
  /**
   * The owner's actual credential for network mode. REQUIRED whenever
   * `ownerId` is set: knowing the owner's UUID alone must never be enough to
   * mint an owner session at a public boundary. Compared timing-safely.
   */
  ownerPassword?: string;
  /**
   * Session cookie Secure flag. Defaults to true when every configured CORS
   * origin is HTTPS (i.e. any production deployment); dev HTTP origins keep
   * it off so loopback testing still works.
   */
  sessionCookieSecure?: boolean;
  /** Server-side DeepSeek API key (never exposed to the browser). */
  deepSeekApiKey?: string;
  deepSeekModel?: string;
  /** Semantic model transport. OpenRouter is explicit and never a fake fallback. */
  modelProvider?: 'deepseek' | 'openrouter';
  /** Server-side OpenRouter API key (never exposed to the browser). */
  openRouterApiKey?: string;
  openRouterModel?: string;
  openRouterReferer?: string;
  openRouterAppName?: string;
  /** Cloudflare AI Gateway routing for OpenRouter (server-side only). */
  cloudflareAiGatewayAccountId?: string;
  cloudflareAiGatewayId?: string;
  /** Bounded anonymous demo AI surface. Absent = route disabled entirely. */
  publicDemoAi?: {
    enabled: boolean;
    /** Public widget key (safe to expose); the secret stays server-side. */
    turnstileSiteKey?: string;
    turnstileSecretKey: string;
    expectedHostname?: string;
    dailyBudgetUsd?: number;
    maxCostPerRequestUsd?: number;
    windowCalls?: number;
  };
}

export interface ServerDeps {
  db?: NodePgDatabase<typeof schema>;
  roomTickets?: RoomTicketService;
  /** Test/dev override for the durable demo-AI quota store. */
  demoAiQuotaStore?: DemoAiQuotaStore;
}

type SemanticProvider = 'deepseek' | 'openrouter';

/** Length-normalized timing-safe secret comparison. */
function timingSafeEqualSha256(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a).digest();
  const digestB = createHash('sha256').update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

/** Production deployments are HTTPS-only; cookies follow the origins. */
function corsOriginsAreHttpsOnly(origins: readonly string[]): boolean {
  return origins.length > 0 && origins.every((origin) => origin.startsWith('https://'));
}

function configuredSemanticProvider(config: ApiConfig): SemanticProvider {
  return config.modelProvider ?? (config.openRouterApiKey ? 'openrouter' : 'deepseek');
}

function configuredSemanticProfile(config: ApiConfig): DeepSeekModelProfile {
  if (configuredSemanticProvider(config) === 'openrouter') {
    return getOpenRouterDeepSeekModelProfile(
      config.openRouterModel ?? DEFAULT_OPENROUTER_DEEPSEEK_MODEL,
    );
  }
  return getDeepSeekModelProfile(config.deepSeekModel);
}

/** Resolved provider transport endpoint (deployment config only). */
export function configuredProviderEndpoint(config: ApiConfig): string | null {
  if (configuredSemanticProvider(config) !== 'openrouter') return null;
  if (!config.openRouterApiKey) return null;
  if (config.cloudflareAiGatewayAccountId && config.cloudflareAiGatewayId) {
    return `https://gateway.ai.cloudflare.com/v1/${config.cloudflareAiGatewayAccountId}/${config.cloudflareAiGatewayId}/openrouter`;
  }
  return 'https://openrouter.ai/api/v1';
}

function configuredModelAdapter(config: ApiConfig): ModelAdapter | undefined {
  if (configuredSemanticProvider(config) === 'openrouter') {
    if (!config.openRouterApiKey) return undefined;
    // Route through the Cloudflare AI Gateway when configured. The gateway
    // base URL is deployment configuration, never client-provided.
    const viaGateway = Boolean(config.cloudflareAiGatewayAccountId && config.cloudflareAiGatewayId);
    return new OpenRouterAdapter({
      apiKey: config.openRouterApiKey,
      model: config.openRouterModel ?? DEFAULT_OPENROUTER_DEEPSEEK_MODEL,
      ...(config.openRouterReferer ? { referer: config.openRouterReferer } : {}),
      ...(config.openRouterAppName ? { appName: config.openRouterAppName } : {}),
      ...(viaGateway
        ? {
            baseUrl: configuredProviderEndpoint(config)!,
            extraAllowedHosts: ['gateway.ai.cloudflare.com'],
          }
        : {}),
    });
  }
  if (!config.deepSeekApiKey) return undefined;
  return new DeepSeekAdapter({
    apiKey: config.deepSeekApiKey,
    ...(config.deepSeekModel ? { model: config.deepSeekModel } : {}),
  });
}

export async function buildServer(
  config: ApiConfig,
  deps: ServerDeps = {},
): Promise<FastifyInstance> {
  // Public-boundary invariant: a configured owner identity MUST come with a
  // real credential. Otherwise anyone who learns (or guesses) the owner UUID
  // — it is an identifier, not a secret — could mint themselves the
  // organization-owner role.
  if (config.ownerId && !config.ownerPassword) {
    throw new Error(
      'refusing to start: GUIDEFORGE_OWNER_ID requires GUIDEFORGE_OWNER_PASSWORD. ' +
        'An owner id is an identifier, not a credential; network mode needs both.',
    );
  }

  const app = Fastify({ logger: { level: config.logLevel ?? 'info' } });

  const pool = new Pool({ connectionString: config.databaseUrl });
  const db = deps.db ?? drizzle(pool, { schema });
  const tickets =
    deps.roomTickets ?? new RoomTicketService(config.roomTicketSecret, config.roomTicketTtlSeconds);

  await app.register(cors, { origin: config.corsOrigin ?? true, credentials: true });
  await app.register(cookie);
  await app.register(jwt, { secret: config.sessionSecret });
  await app.register(swagger, {
    openapi: { info: { title: 'GuideForge API', version: '0.5.0' }, components: {} },
  });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof PermissionDeniedError) {
      return reply.code(403).send({ error: error.message });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'internal error' });
  });

  app.decorate('db', db);
  app.decorate('tickets', tickets);

  // Read the BFF session cookie into req.user for cookie-authenticated routes.
  app.addHook('preHandler', async (req, _reply) => {
    const cookie = req.cookies.gf_session;
    if (cookie) {
      try {
        req.user = app.jwt.verify(cookie);
      } catch {
        // leave req.user undefined
      }
    }
  });

  // CSRF protection: cookie-authenticated mutating requests must come from an
  // allowed origin. SameSite=lax blocks cross-site POSTs, and this explicit
  // Origin check is defense in depth (network companion requirement).
  const allowedOrigins = config.corsOrigin ?? ['http://localhost:1420'];
  app.addHook('preHandler', async (req, reply) => {
    const method = req.method;
    const isMutating = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
    if (!isMutating) return;
    const hasSession = Boolean(req.cookies.gf_session);
    if (!hasSession) return; // anonymous mutating calls are rejected by auth below
    const origin = req.headers.origin;
    if (!origin) {
      return reply.code(403).send({ error: 'origin required for cookie-authenticated writes' });
    }
    if (!allowedOrigins.includes(origin)) {
      return reply.code(403).send({ error: `origin not allowed: ${origin}` });
    }
  });

  // Simple per-IP in-memory rate limiter for identity and AI (expensive) routes.
  const rateBuckets = new Map<string, { count: number; resetAt: number }>();
  function rateLimit(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= limit;
  }
  function rateLimited(key: string, limit: number, windowMs: number): boolean {
    return !rateLimit(key, limit, windowMs);
  }

  app.get('/health', () => ({ status: 'ok', time: new Date().toISOString() }));

  // Explicit AI capability state. The browser learns only whether the server
  // runs a real provider or offline mode — never a key, model id, or URL.
  app.get('/api/ai/capability', () => {
    const adapterConfigured = configuredModelAdapter(config) !== undefined;
    return {
      mode: adapterConfigured ? 'real' : 'offline',
      provider: adapterConfigured ? configuredSemanticProvider(config) : null,
      // The concrete model stays a server decision; clients cannot pick one.
      model: 'server-selected',
      available: adapterConfigured,
      publicDemo: {
        enabled: Boolean(config.publicDemoAi?.enabled),
        // Public widget key only (safe to expose by design).
        siteKey: config.publicDemoAi?.turnstileSiteKey ?? null,
      },
    };
  });

  app.get('/openapi.json', () => app.swagger());

  // Identity: single-owner BFF session. Roles are NEVER accepted from the
  // request body; the server derives the owner role from configuration.
  // In network mode the caller must also prove the owner credential — the
  // user id alone is an identifier, not a secret.
  app.post('/api/session', async (req, reply) => {
    // Rate-limit identity attempts (login brute-force protection).
    const ip = req.ip ?? 'unknown';
    if (rateLimited(`session:${ip}`, 50, 60_000)) {
      return reply.code(429).send({ error: 'too many session attempts; slow down' });
    }
    const body = req.body as {
      userId: string;
      displayName: string;
      email: string;
      password?: unknown;
    };
    if (!body?.userId) {
      return reply.code(401).send({ error: 'missing identity' });
    }
    // Network mode: only the configured owner may establish a session, and
    // only with the configured credential (timing-safe comparison).
    if (config.ownerId) {
      const password = typeof body.password === 'string' ? body.password : '';
      const validPassword =
        config.ownerPassword !== undefined && timingSafeEqualSha256(password, config.ownerPassword);
      const userIdMatches = body.userId === config.ownerId;
      // Check both before answering so probing cannot learn which half failed.
      if (!userIdMatches || !validPassword) {
        return reply.code(403).send({ error: 'not the owner' });
      }
    }
    const token = app.jwt.sign({
      sub: body.userId,
      name: body.displayName,
      roles: ['organization-owner'],
    });
    reply.setCookie('gf_session', token, {
      httpOnly: true,
      secure: config.sessionCookieSecure ?? corsOriginsAreHttpsOnly(allowedOrigins),
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8,
    });
    return { ok: true };
  });

  app.get('/api/session', (req) => {
    const session = req.user as { sub?: string; name?: string; roles?: string[] } | undefined;
    if (!session?.sub) return { authenticated: false };
    return {
      authenticated: true,
      userId: session.sub,
      name: session.name,
      roles: session.roles ?? [],
    };
  });

  // Room ticket issuance (authorization-checked)
  app.post('/api/rooms/:guideId/tickets', async (req, reply) => {
    const session = req.user as { sub?: string; roles?: string[] } | undefined;
    if (!session?.sub) return reply.code(401).send({ error: 'unauthenticated' });
    requirePermission((session.roles ?? []) as Role[], 'collaborate', 'guide');

    const { guideId } = req.params as { guideId: string };
    const guideRow = await db.query.guides.findFirst({ where: eq(schema.guides.id, guideId) });
    if (!guideRow) return reply.code(404).send({ error: 'guide not found' });

    const token = tickets.issue({
      ticketId: crypto.randomUUID(),
      guideId,
      workspaceId: guideRow.workspaceId,
      userId: session.sub,
      role: 'author',
      permission: 'collaborate',
    });
    return { token, expiresInSeconds: config.roomTicketTtlSeconds ?? 300 };
  });

  /** Resolve a local user id from the OIDC session subject. */
  async function resolveUserId(sub: string): Promise<string> {
    const user = await db.query.users.findFirst({
      where: (u, { eq, and }) => and(eq(u.oidcSubject, sub), eq(u.oidcIssuer, 'test')),
    });
    return user?.id ?? sub;
  }

  // Review/approval workflow
  app.post('/api/guides/:guideId/review', async (req, reply) => {
    const session = req.user as { sub?: string; roles?: string[] } | undefined;
    if (!session?.sub) return reply.code(401).send({ error: 'unauthenticated' });
    requirePermission((session.roles ?? []) as Role[], 'review', 'guide');
    const { guideId } = req.params as { guideId: string };
    const body = req.body as { contentHash: string };
    if (!body.contentHash) return reply.code(400).send({ error: 'contentHash required' });

    const review = await db
      .insert(schema.reviews)
      .values({
        guideId,
        requestedBy: await resolveUserId(session.sub),
        status: 'in-review',
        contentHash: body.contentHash,
      })
      .returning();

    await db.insert(schema.auditEvents).values({
      organizationId: SINGLE_OWNER_ORG_ID,
      actorId: session.sub,
      action: 'guide.submit-review',
      resourceType: 'guide',
      resourceId: guideId,
      metadata: { reviewId: review[0]!.id, contentHash: body.contentHash },
    });

    return review[0];
  });

  app.post('/api/reviews/:reviewId/decision', async (req, reply) => {
    const session = req.user as { sub?: string; roles?: string[] } | undefined;
    if (!session?.sub) return reply.code(401).send({ error: 'unauthenticated' });
    requirePermission((session.roles ?? []) as Role[], 'approve', 'guide');
    const { reviewId } = req.params as { reviewId: string };
    const body = req.body as {
      decision: 'approved' | 'rejected';
      /** SHA-256 of the current guide content, supplied by the client. */
      currentContentHash?: string;
    };
    if (body.decision !== 'approved' && body.decision !== 'rejected') {
      return reply.code(400).send({ error: 'decision must be approved or rejected' });
    }

    const review = await db.query.reviews.findFirst({ where: eq(schema.reviews.id, reviewId) });
    if (!review) return reply.code(404).send({ error: 'review not found' });
    if (review.status !== 'in-review') {
      return reply.code(409).send({ error: 'review already decided' });
    }

    // Content-change invalidation: an approval is only valid for the exact
    // content that was reviewed. If the client's current hash differs from the
    // reviewed hash, the approval is refused and the guide returns to draft.
    if (body.decision === 'approved' && body.currentContentHash) {
      if (body.currentContentHash !== review.contentHash) {
        await db
          .update(schema.guides)
          .set({ lifecycleState: 'draft' })
          .where(eq(schema.guides.id, review.guideId));
        return reply.code(409).send({
          error: 'content changed since review; approval invalidated',
          reviewedHash: review.contentHash,
          currentHash: body.currentContentHash,
        });
      }
    }

    const approval = await db
      .insert(schema.approvals)
      .values({
        guideId: review.guideId,
        reviewId,
        approverId: await resolveUserId(session.sub),
        decision: body.decision,
        contentHash: review.contentHash,
      })
      .returning();

    await db
      .update(schema.reviews)
      .set({
        status: body.decision === 'approved' ? 'approved' : 'rejected',
        decidedAt: new Date(),
      })
      .where(eq(schema.reviews.id, reviewId));

    if (body.decision === 'approved') {
      await db
        .update(schema.guides)
        .set({ lifecycleState: 'approved' })
        .where(eq(schema.guides.id, review.guideId));
    }

    await db.insert(schema.auditEvents).values({
      organizationId: SINGLE_OWNER_ORG_ID,
      actorId: session.sub,
      action: body.decision === 'approved' ? 'release.approve' : 'release.reject',
      resourceType: 'release',
      resourceId: review.guideId,
      metadata: { reviewId, approvalId: approval[0]!.id },
    });

    return approval[0];
  });

  app.get('/api/guides/:guideId/audit', async (req, reply) => {
    const session = req.user as { sub?: string; roles?: string[] } | undefined;
    if (!session?.sub) return reply.code(401).send({ error: 'unauthenticated' });
    requirePermission((session.roles ?? []) as Role[], 'audit', 'organization');
    const { guideId } = req.params as { guideId: string };
    const rows = await db.query.auditEvents.findMany({
      where: eq(schema.auditEvents.resourceId, guideId),
      orderBy: (a, { asc }) => [asc(a.occurredAt)],
    });
    return rows;
  });

  // AI proposal generation (server-side; the API key never reaches the
  // browser). The client sends step text; the server builds source regions,
  // runs the configured DeepSeek adapter, and returns cited,
  // schema-validated proposals. Browser-only callers own the explicit local
  // fallback; this route does not silently substitute a fake provider.
  app.post('/api/guides/:guideId/ai-proposals', async (req, reply) => {
    const session = req.user as { sub?: string; roles?: string[] } | undefined;
    if (!session?.sub) return reply.code(401).send({ error: 'unauthenticated' });
    requirePermission((session.roles ?? []) as Role[], 'read', 'guide');
    // Rate-limit expensive model calls per user.
    const ip = req.ip ?? 'unknown';
    if (rateLimited(`ai:${session.sub}:${ip}`, 10, 60_000)) {
      return reply.code(429).send({ error: 'too many AI requests; slow down' });
    }
    const { guideId } = req.params as { guideId: string };
    const body = req.body as { steps: { stepId: string; instructionText: string }[] };

    if (!Array.isArray(body?.steps) || body.steps.length === 0) {
      return reply.code(400).send({ error: 'steps required' });
    }

    // Deterministic source hash from the step text (immutable reference).
    const sourceHash = sha256HexText(JSON.stringify(body.steps));
    const regions = new Map<string, SourceRegion>();
    const chunks = structuralChunking(
      sourceHash,
      0,
      body.steps.map((s, i) => ({
        kind: 'paragraph' as const,
        text: s.instructionText || 'Untitled step',
        structuralPath: `step:${s.stepId}/i:${i}`,
      })),
    );
    for (const c of chunks) regions.set(c.region.regionId, c.region);

    // Gateway: real DeepSeek only when configured; no silent fake fallback.
    const adapter = configuredModelAdapter(config);
    const adapters = adapter ? [adapter] : [];
    const gateway = new ModelGateway(adapters);
    const response = await gateway.run({
      sourceHash,
      chunks: chunks.map((c) => ({
        regionId: c.region.regionId,
        text: c.region.excerpt,
        pageIndex: 0,
      })),
      regions,
      promptVersion: 'api-v1',
      policy: 'default',
    });

    if (!response.ok || !response.output) {
      return reply.code(502).send({ error: response.error ?? 'model failed' });
    }

    const proposals = [];
    for (const task of response.output.tasks) {
      for (const step of task.steps) {
        for (const warning of step.warnings) {
          proposals.push({ kind: 'warning', stepId: step.stepId, message: warning });
        }
        for (const tool of step.tools) {
          proposals.push({ kind: 'tool', stepId: step.stepId, name: tool });
        }
        for (const verification of step.verificationSteps) {
          proposals.push({ kind: 'verification', stepId: step.stepId, message: verification });
        }
      }
    }

    await db.insert(schema.auditEvents).values({
      organizationId: SINGLE_OWNER_ORG_ID,
      actorId: session.sub,
      action: 'ai.propose',
      resourceType: 'guide',
      resourceId: guideId,
      metadata: {
        provider: response.receipt.provider,
        model: response.receipt.model,
        proposalCount: proposals.length,
        citations: response.citations?.length ?? 0,
        inputTokens: response.receipt.inputTokens,
        outputTokens: response.receipt.outputTokens,
      },
    });

    return {
      proposals,
      citations: response.citations ?? [],
      sourceHash,
      confidence: response.confidence?.overall ?? null,
      receipt: {
        provider: response.receipt.provider,
        model: response.receipt.model,
        inputTokens: response.receipt.inputTokens,
        outputTokens: response.receipt.outputTokens,
        cacheTokens: response.receipt.cacheTokens,
        providerCostUsd: response.receipt.providerCostUsd,
        latencyMs: response.receipt.latencyMs,
        requestId: response.receipt.requestId,
        schemaVersion: response.receipt.schemaVersion,
        promptVersion: response.receipt.promptVersion,
        createdAtIso: response.receipt.createdAtIso,
      },
    };
  });

  // Bounded anonymous demo AI. A separate, stateless endpoint — the full
  // owner surface is never exposed anonymously, and this route performs no
  // canonical writes at all.
  app.post('/api/demo/ai-proposals', async (req, reply) => {
    const publicDemo = config.publicDemoAi;
    if (!publicDemo) {
      return reply.code(404).send({ error: 'demo AI is not available' });
    }
    const adapter = configuredModelAdapter(config);
    if (!adapter) {
      // No real provider configured — never substitute a fake adapter here.
      return reply.code(503).send({ error: 'demo AI requires a configured provider' });
    }
    const limits: PublicDemoAiLimits = defaultPublicDemoAiLimits({
      enabled: publicDemo.enabled,
      ...(publicDemo.dailyBudgetUsd !== undefined
        ? { dailyBudgetUsd: publicDemo.dailyBudgetUsd }
        : {}),
      ...(publicDemo.maxCostPerRequestUsd !== undefined
        ? { maxCostPerRequestUsd: publicDemo.maxCostPerRequestUsd }
        : {}),
      ...(publicDemo.windowCalls !== undefined ? { windowCalls: publicDemo.windowCalls } : {}),
      model: adapter.model,
    });

    const outcome = await runPublicDemoAi(
      req.body,
      {
        limits,
        verifyTurnstile: (token, ip) =>
          verifyTurnstile(token, ip, {
            secretKey: publicDemo.turnstileSecretKey,
            ...(publicDemo.expectedHostname
              ? { expectedHostname: publicDemo.expectedHostname }
              : {}),
          }),
        quotaStore: deps.demoAiQuotaStore ?? new InMemoryQuotaStore(limits.dailyBudgetUsd),
        runModel: async (request, modelLimits) => {
          // Same deterministic chunking as the owner route; the fixed,
          // server-allowlisted model comes from configuration only.
          const sourceHash = sha256HexText(JSON.stringify(request.steps));
          const regions = new Map<string, SourceRegion>();
          const chunks = structuralChunking(
            sourceHash,
            0,
            request.steps.map((s, i) => ({
              kind: 'paragraph' as const,
              text: s.instructionText || 'Untitled step',
              structuralPath: `step:${s.stepId}/i:${i}`,
            })),
          );
          for (const c of chunks) regions.set(c.region.regionId, c.region);
          const gateway = new ModelGateway([adapter]);
          const response = await gateway.run({
            sourceHash,
            chunks: chunks.map((c) => ({
              regionId: c.region.regionId,
              text: c.region.excerpt,
              pageIndex: 0,
            })),
            regions,
            promptVersion: 'demo-v1',
            policy: 'default',
            maxOutputTokens: modelLimits.maxOutputTokens,
          });
          if (!response.ok || !response.output) {
            throw new Error(response.error ?? 'model failed');
          }
          const proposals: PublicDemoProviderResult['proposals'] = [];
          for (const task of response.output.tasks) {
            for (const step of task.steps) {
              for (const warning of step.warnings) {
                proposals.push({ kind: 'warning', stepId: step.stepId, message: warning });
              }
              for (const tool of step.tools) {
                proposals.push({ kind: 'tool', stepId: step.stepId, name: tool });
              }
              for (const verification of step.verificationSteps) {
                proposals.push({
                  kind: 'verification',
                  stepId: step.stepId,
                  message: verification,
                });
              }
            }
          }
          return {
            proposals,
            citations: (response.citations ?? []).map((c) => ({
              regionId: c.regionId,
              pageIndex: c.pageIndex,
              excerptHash: c.excerptHash,
              claimRef: c.claimRef,
            })),
            receipt: {
              provider: response.receipt.provider,
              model: response.receipt.model,
              inputTokens: response.receipt.inputTokens,
              outputTokens: response.receipt.outputTokens,
              providerCostUsd: response.receipt.providerCostUsd,
              requestId: response.receipt.requestId,
            },
          };
        },
      },
      req.ip,
    );

    if (outcome.status === 'rejected') {
      return reply.code(outcome.httpStatus).send({ error: outcome.reason });
    }
    return outcome.response;
  });

  /**
   * Source Studio synthesis. The browser sends only immutable source hashes
   * and citable excerpts; provider credentials remain server-side.
   */
  app.post('/api/guides/:guideId/source-synthesis', async (req, reply) => {
    const session = req.user as { sub?: string; roles?: string[] } | undefined;
    if (!session?.sub) return reply.code(401).send({ error: 'unauthenticated' });
    requirePermission((session.roles ?? []) as Role[], 'read', 'guide');
    const ip = req.ip ?? 'unknown';
    if (rateLimited(`synthesis:${session.sub}:${ip}`, 6, 60_000)) {
      return reply.code(429).send({ error: 'too many synthesis requests; slow down' });
    }

    const { guideId } = req.params as { guideId: string };
    const body = (req.body ?? {}) as {
      guideId?: unknown;
      sources?: unknown;
      mode?: unknown;
      maxInputTokens?: unknown;
      maxOutputTokens?: unknown;
      maxCostUsd?: unknown;
    };
    if (body.guideId !== undefined && body.guideId !== guideId) {
      return reply.code(400).send({ error: 'guideId does not match route' });
    }
    const requestValue = { guideId, sources: body.sources };
    const validation = validateSynthesisRequest(requestValue);
    if (!validation.ok) return reply.code(400).send({ error: validation.issues.join('; ') });
    if (JSON.stringify(requestValue).length > 2_000_000) {
      return reply.code(413).send({ error: 'synthesis request is too large' });
    }

    const requestedMode = body.mode;
    if (
      requestedMode !== undefined &&
      requestedMode !== 'deepseek' &&
      requestedMode !== 'offline-rules'
    ) {
      return reply.code(400).send({ error: 'mode must be deepseek or offline-rules' });
    }
    const mode: 'deepseek' | 'offline-rules' =
      requestedMode === 'offline-rules' ? requestedMode : 'deepseek';
    const request = requestValue as SynthesisRequest;
    const budget = {
      maxInputTokens: boundedNumber(body.maxInputTokens, 12_000, 1, 12_000),
      maxOutputTokens: boundedNumber(body.maxOutputTokens, 4_096, 1, 4_096),
      maxCostUsd: boundedNumber(body.maxCostUsd, 0.25, 0, 0.25),
    };

    let profile: DeepSeekModelProfile | undefined;
    const provider = configuredSemanticProvider(config);
    try {
      profile = configuredSemanticProfile(config);
    } catch (err) {
      if (mode === 'deepseek') {
        return reply.code(503).send({ error: err instanceof Error ? err.message : String(err) });
      }
    }
    const adapter = mode === 'deepseek' ? configuredModelAdapter(config) : undefined;
    const modelGateway = adapter ? new ModelGateway([adapter]) : undefined;
    const synthesis = new SynthesisGateway({
      mode,
      ...(modelGateway ? { modelGateway } : {}),
      ...(profile ? { profile } : {}),
      ...(mode === 'deepseek' ? { provider } : {}),
      budget,
    });
    const result = await synthesis.run(request);
    if (!result.ok || !result.plan) {
      return reply.code(result.receipt.error?.includes('budget') ? 429 : 502).send({
        error: result.error ?? 'synthesis failed',
        mode: result.mode,
        receipt: result.receipt,
      });
    }

    await db.insert(schema.auditEvents).values({
      organizationId: SINGLE_OWNER_ORG_ID,
      actorId: session.sub,
      action: 'ai.synthesize',
      resourceType: 'guide',
      resourceId: guideId,
      metadata: {
        provider: result.receipt.provider,
        model: result.receipt.model,
        sourceCount: request.sources.length,
        citedRegions: result.plan.coverage.citedRegions,
        inputTokens: result.receipt.inputTokens,
        outputTokens: result.receipt.outputTokens,
        providerCostUsd: result.receipt.providerCostUsd,
        cacheHit: result.receipt.cacheHit,
      },
    });
    return {
      mode: result.mode,
      plan: result.plan,
      receipt: result.receipt,
    };
  });

  return app;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function sha256HexText(text: string): ContentHash {
  // Real SHA-256 of the UTF-8 bytes — the API claims SHA-256 content identity,
  // so the digest must actually be SHA-256 (never a padded short hash).
  const digest = createHash('sha256').update(text, 'utf8').digest('hex');
  if (!isContentHash(digest)) {
    throw new Error('internal error: sha256 produced an invalid content hash');
  }
  return digest;
}

/**
 * Deterministic single-owner organization context for the append-only audit.
 * A fixed UUID (not random per event) so audit rows are stable, sortable, and
 * attributable to the one owner. Random per-event org IDs were an audit
 * finding; the single-user model has exactly one owner context.
 */
const SINGLE_OWNER_ORG_ID = '00000000-0000-4000-8000-000000000001';
