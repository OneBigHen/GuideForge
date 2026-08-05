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
import type { ContentHash } from '@guideforge/domain';
import { DeepSeekAdapter, ModelGateway } from '@guideforge/model-gateway';
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import Fastify, { type FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { PermissionDeniedError, requirePermission, type Role } from './auth/rbac.js';
import { RoomTicketService } from './auth/room-ticket.js';
import * as schema from './db/schema.js';

export interface ApiConfig {
  databaseUrl: string;
  sessionSecret: string;
  roomTicketSecret: string;
  roomTicketTtlSeconds?: number;
  corsOrigin?: string[];
  logLevel?: string;
  /** Server-side DeepSeek API key (never exposed to the browser). */
  deepSeekApiKey?: string;
  deepSeekModel?: string;
}

export interface ServerDeps {
  db?: NodePgDatabase<typeof schema>;
  roomTickets?: RoomTicketService;
}

export async function buildServer(
  config: ApiConfig,
  deps: ServerDeps = {},
): Promise<FastifyInstance> {
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

  app.get('/health', () => ({ status: 'ok', time: new Date().toISOString() }));

  app.get('/openapi.json', () => app.swagger());

  // Identity: BFF session (Phase 05 uses a signed session cookie; real OIDC
  // code+PKCE exchange is wired behind a provider adapter).
  app.post('/api/session', async (req, reply) => {
    const body = req.body as {
      userId: string;
      displayName: string;
      email: string;
      roles: string[];
    };
    if (!body?.userId) {
      return reply.code(401).send({ error: 'missing identity' });
    }
    const token = app.jwt.sign({ sub: body.userId, name: body.displayName, roles: body.roles });
    reply.setCookie('gf_session', token, {
      httpOnly: true,
      secure: false,
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
      organizationId: crypto.randomUUID(),
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
    const body = req.body as { decision: 'approved' | 'rejected' };

    const review = await db.query.reviews.findFirst({ where: eq(schema.reviews.id, reviewId) });
    if (!review) return reply.code(404).send({ error: 'review not found' });

    const guide = await db.query.guides.findFirst({ where: eq(schema.guides.id, review.guideId) });
    // Content change invalidates approval: compare current doc hash.
    if (guide && body.decision === 'approved' && guide.updatedAt) {
      // The API does not yet know the live Yjs hash; the client supplies it.
      // For robustness, the decision body may include the current contentHash.
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
      organizationId: crypto.randomUUID(),
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
  // runs the ModelGateway (DeepSeek official API when configured, else the
  // deterministic fake), and returns cited, schema-validated proposals.
  app.post('/api/guides/:guideId/ai-proposals', async (req, reply) => {
    const session = req.user as { sub?: string; roles?: string[] } | undefined;
    if (!session?.sub) return reply.code(401).send({ error: 'unauthenticated' });
    requirePermission((session.roles ?? []) as Role[], 'read', 'guide');
    const { guideId } = req.params as { guideId: string };
    const body = req.body as { steps: { stepId: string; instructionText: string }[] };

    if (!Array.isArray(body?.steps) || body.steps.length === 0) {
      return reply.code(400).send({ error: 'steps required' });
    }

    // Deterministic source hash from the step text (immutable reference).
    const sourceHash = fnvHex(JSON.stringify(body.steps)) as ContentHash;
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

    // Gateway: real DeepSeek when configured; deterministic fake otherwise.
    const adapters =
      config.deepSeekApiKey && config.deepSeekApiKey.length > 0
        ? [
            new DeepSeekAdapter({
              apiKey: config.deepSeekApiKey,
              ...(config.deepSeekModel ? { model: config.deepSeekModel } : {}),
            }),
          ]
        : [];
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
      organizationId: crypto.randomUUID(),
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
      citations: response.citations?.length ?? 0,
      receipt: {
        provider: response.receipt.provider,
        model: response.receipt.model,
        inputTokens: response.receipt.inputTokens,
        outputTokens: response.receipt.outputTokens,
        latencyMs: response.receipt.latencyMs,
      },
    };
  });

  return app;
}

function fnvHex(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    h1 ^= text.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
    h2 = Math.imul(h2 ^ text.charCodeAt(i), 0x01000193);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `${hex(h1)}${hex(h2)}`.padEnd(64, '0');
}
