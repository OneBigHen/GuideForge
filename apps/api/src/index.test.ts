import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RoomTicketService } from './auth/room-ticket.js';
import * as schema from './db/schema.js';
import { buildServer } from './index.js';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://guideforge:guideforge@localhost:15432/guideforge';

/** Allowed browser origin used by the CSRF check in tests. */
const TEST_ORIGIN = 'http://localhost:1420';

/** Parse a Fastify inject response body with an explicit type. */
function bodyOf<T>(res: { json(): unknown }): T {
  return res.json() as T;
}

let app: FastifyInstance;
let pool: Pool;
const tickets = new RoomTicketService('api-test-secret', 300);

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });

  // Apply the generated migration (0000) for the test DB.
  const { execSync } = await import('node:child_process');
  try {
    execSync('npx drizzle-kit migrate', {
      cwd: new URL('..', import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL },
      stdio: 'pipe',
    });
  } catch {
    // tables may already exist; ignore
  }

  app = await buildServer(
    {
      databaseUrl: DATABASE_URL,
      sessionSecret: 'api-test-session-secret',
      roomTicketSecret: 'api-test-secret',
      logLevel: 'silent',
      ...(process.env.DEEPSEEK_API_KEY ? { deepSeekApiKey: process.env.DEEPSEEK_API_KEY } : {}),
      ...(process.env.DEEPSEEK_MODEL ? { deepSeekModel: process.env.DEEPSEEK_MODEL } : {}),
      ...(process.env.OPENROUTER_API_KEY
        ? {
            modelProvider: 'openrouter' as const,
            openRouterApiKey: process.env.OPENROUTER_API_KEY,
            ...(process.env.OPENROUTER_MODEL
              ? { openRouterModel: process.env.OPENROUTER_MODEL }
              : {}),
          }
        : {}),
    },
    { db, roomTickets: tickets },
  );
  await app.listen({ port: 18788 });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function login(userId: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: { userId, displayName: 'T', email: 't@example.com' },
  });
  return res.cookies.find((c) => c.name === 'gf_session')?.value ?? '';
}

describe('control plane API', () => {
  it('health endpoint responds', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const health = bodyOf<{ status: string }>(res);
    expect(health.status).toBe('ok');
  });

  it('unauthenticated room ticket request is rejected', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/rooms/x/tickets' });
    expect(res.statusCode).toBe(401);
  });

  it('cookie-authenticated writes require an allowed origin (CSRF)', async () => {
    const cookie = await login('22222222-2222-4222-8222-222222222222');
    // No Origin header → refused.
    const noOrigin = await app.inject({
      method: 'POST',
      url: '/api/rooms/x/tickets',
      headers: { cookie: `gf_session=${cookie}` },
    });
    expect(noOrigin.statusCode).toBe(403);
    // Cross-site origin → refused.
    const evil = await app.inject({
      method: 'POST',
      url: '/api/rooms/x/tickets',
      headers: { cookie: `gf_session=${cookie}`, origin: 'https://evil.example' },
    });
    expect(evil.statusCode).toBe(403);
    // Allowed origin → passes the CSRF hook (route 404s later, which proves
    // the hook let it through).
    const ok = await app.inject({
      method: 'POST',
      url: '/api/rooms/x/tickets',
      headers: { cookie: `gf_session=${cookie}`, origin: TEST_ORIGIN },
    });
    expect(ok.statusCode).not.toBe(403);
  });

  it('session endpoint rate-limits repeated attempts (429)', async () => {
    // Isolated server so the shared test instance's session bucket is not
    // exhausted for the other tests.
    const rateApp = await buildServer(
      {
        databaseUrl: DATABASE_URL,
        sessionSecret: 'rate-test-secret',
        roomTicketSecret: 'rate-test-secret',
        logLevel: 'silent',
      },
      { db: drizzle(pool, { schema }), roomTickets: tickets },
    );
    await rateApp.listen({ port: 18790 });
    try {
      for (let i = 0; i < 50; i++) {
        await rateApp.inject({
          method: 'POST',
          url: '/api/session',
          payload: { userId: `rate-${i}`, displayName: 'T', email: 't@x.io' },
        });
      }
      const blocked = await rateApp.inject({
        method: 'POST',
        url: '/api/session',
        payload: { userId: 'rate-over', displayName: 'T', email: 't@x.io' },
      });
      expect(blocked.statusCode).toBe(429);
    } finally {
      await rateApp.close();
    }
  });

  it('authorized author receives a short-lived room ticket', async () => {
    // Create a guide row directly (unit-level) so the ticket route can find it.
    const db = drizzle(pool, { schema });
    const org = await db.insert(schema.organizations).values({ name: 'Org' }).returning();
    const ws = await db
      .insert(schema.workspaces)
      .values({ organizationId: org[0]!.id, name: 'WS' })
      .returning();
    const guide = await db
      .insert(schema.guides)
      .values({ workspaceId: ws[0]!.id, title: 'G', docName: 'g-doc' })
      .returning();

    const cookie = await login('11111111-1111-4111-8111-111111111111');
    const res = await app.inject({
      method: 'POST',
      url: `/api/rooms/${guide[0]!.id}/tickets`,
      headers: { cookie: `gf_session=${cookie}`, origin: TEST_ORIGIN },
    });
    expect(res.statusCode).toBe(200);
    const body = bodyOf<{ token: string }>(res);
    const verified = tickets.verify(body.token);
    expect(verified.ok).toBe(true);
    expect(verified.claims?.guideId).toBe(guide[0]!.id);
  });

  it('body-supplied roles are ignored (single owner derived server-side)', async () => {
    // Regression: the session endpoint used to accept `roles` from the body,
    // letting any caller self-assign `organization-owner`. Roles are now
    // server-derived; the body roles field must have no effect.
    const res = await app.inject({
      method: 'POST',
      url: '/api/session',
      payload: {
        userId: '22222222-2222-4222-8222-222222222222',
        displayName: 'T',
        email: 't@example.com',
        roles: ['operator'],
      },
    });
    expect(res.statusCode).toBe(200);
    const cookie = res.cookies.find((c) => c.name === 'gf_session')?.value ?? '';
    expect(cookie).toBeTruthy();

    const sessionRes = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { cookie: `gf_session=${cookie}`, origin: TEST_ORIGIN },
    });
    const session = bodyOf<{ authenticated: boolean; roles: string[] }>(sessionRes);
    expect(session.authenticated).toBe(true);
    // The caller asked for `operator` but the server granted the owner role.
    expect(session.roles).toContain('organization-owner');
    expect(session.roles).not.toContain('operator');
  });

  it('network mode denies sessions for non-owner identities and requires the owner credential', async () => {
    // A companion exposed beyond loopback must not be usable anonymously or by
    // arbitrary identities: only the configured owner, PROVING the configured
    // credential, can open a session. Knowing the owner UUID is not enough.
    const build = () =>
      buildServer(
        {
          databaseUrl: DATABASE_URL,
          sessionSecret: 'owner-test-secret',
          roomTicketSecret: 'owner-test-secret',
          logLevel: 'silent',
          ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        },
        { db: drizzle(pool, { schema }), roomTickets: tickets },
      );
    // ownerId without its credential refuses to boot at all.
    expect(build).toThrow(/GUIDEFORGE_OWNER_PASSWORD/);

    const ownerApp = await buildServer(
      {
        databaseUrl: DATABASE_URL,
        sessionSecret: 'owner-test-secret',
        roomTicketSecret: 'owner-test-secret',
        logLevel: 'silent',
        ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ownerPassword: 'correct-horse-battery-staple',
      },
      { db: drizzle(pool, { schema }), roomTickets: tickets },
    );
    await ownerApp.listen({ port: 18789 });
    try {
      const nonOwner = await ownerApp.inject({
        method: 'POST',
        url: '/api/session',
        payload: {
          userId: '22222222-2222-4222-8222-222222222222',
          displayName: 'X',
          email: 'x@y.io',
        },
      });
      expect(nonOwner.statusCode).toBe(403);

      // Owner UUID WITHOUT the credential must fail even though it matches.
      const uuidOnly = await ownerApp.inject({
        method: 'POST',
        url: '/api/session',
        payload: {
          userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          displayName: 'Owner',
          email: 'owner@y.io',
        },
      });
      expect(uuidOnly.statusCode).toBe(403);

      // Wrong credential on the owner id also fails.
      const wrongPassword = await ownerApp.inject({
        method: 'POST',
        url: '/api/session',
        payload: {
          userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          displayName: 'Owner',
          email: 'owner@y.io',
          password: 'wrong-password',
        },
      });
      expect(wrongPassword.statusCode).toBe(403);

      const ownerRes = await ownerApp.inject({
        method: 'POST',
        url: '/api/session',
        payload: {
          userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          displayName: 'Owner',
          email: 'owner@y.io',
          password: 'correct-horse-battery-staple',
        },
      });
      expect(ownerRes.statusCode).toBe(200);
    } finally {
      await ownerApp.close();
    }
  });

  it('HTTPS-only CORS origins force Secure session cookies', async () => {
    const httpsApp = await buildServer(
      {
        databaseUrl: DATABASE_URL,
        sessionSecret: 'secure-cookie-secret',
        roomTicketSecret: 'secure-cookie-secret',
        logLevel: 'silent',
        corsOrigin: ['https://guides.henning.rodeo'],
      },
      { db: drizzle(pool, { schema }), roomTickets: tickets },
    );
    try {
      const res = await httpsApp.inject({
        method: 'POST',
        url: '/api/session',
        payload: { userId: 'dev-user', displayName: 'D', email: 'd@y.io' },
      });
      expect(res.statusCode).toBe(200);
      const cookie = res.cookies.find((c) => c.name === 'gf_session');
      expect(cookie?.secure).toBe(true);
      expect(cookie?.httpOnly).toBe(true);
    } finally {
      await httpsApp.close();
    }
  });

  it('audit events use a stable single-owner organization context', async () => {
    const db = drizzle(pool, { schema });
    const org = await db.insert(schema.organizations).values({ name: 'OrgAudit' }).returning();
    const ws = await db
      .insert(schema.workspaces)
      .values({ organizationId: org[0]!.id, name: 'WSAudit' })
      .returning();
    const guide = await db
      .insert(schema.guides)
      .values({ workspaceId: ws[0]!.id, title: 'GAudit', docName: 'g-doc-audit' })
      .returning();

    // Seed the reviewer user (reviews.requestedBy has a users FK).
    const auditorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await db
      .insert(schema.users)
      .values({
        oidcIssuer: 'test',
        oidcSubject: auditorId,
        email: 'audit@x.io',
        displayName: 'Audit',
      })
      .onConflictDoNothing();

    const cookie = await login(auditorId);
    const reviewRes = await app.inject({
      method: 'POST',
      url: `/api/guides/${guide[0]!.id}/review`,
      headers: { cookie: `gf_session=${cookie}`, origin: TEST_ORIGIN },
      payload: { contentHash: 'a'.repeat(64) },
    });
    expect(reviewRes.statusCode).toBe(200);

    const rows = await db.query.auditEvents.findMany({
      where: eq(schema.auditEvents.resourceId, guide[0]!.id),
    });
    expect(rows.length).toBeGreaterThan(0);
    const orgIds = new Set(rows.map((r) => r.organizationId));
    // Every audit row shares the deterministic single-owner context, and the
    // id is stable across events (not a fresh random UUID per event).
    expect(orgIds.size).toBe(1);
    expect([...orgIds][0]).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('review → approve writes append-only audit and sets lifecycle', async () => {
    const db = drizzle(pool, { schema });
    const org = await db.insert(schema.organizations).values({ name: 'Org3' }).returning();
    const ws = await db
      .insert(schema.workspaces)
      .values({ organizationId: org[0]!.id, name: 'WS3' })
      .returning();
    const guide = await db
      .insert(schema.guides)
      .values({ workspaceId: ws[0]!.id, title: 'G3', docName: 'g-doc-3' })
      .returning();

    // Seed user rows referenced by reviews/approvals FK constraints.
    const authorId = '33333333-3333-4333-8333-333333333333';
    const publisherId = '44444444-4444-4444-8444-444444444444';
    const auditorId = '55555555-5555-4555-8555-555555555555';
    await db
      .insert(schema.users)
      .values([
        { oidcIssuer: 'test', oidcSubject: authorId, email: 'a@x.io', displayName: 'A' },
        { oidcIssuer: 'test', oidcSubject: publisherId, email: 'p@x.io', displayName: 'P' },
        { oidcIssuer: 'test', oidcSubject: auditorId, email: 'u@x.io', displayName: 'U' },
      ])
      .onConflictDoNothing();

    const author = await login(authorId);
    const publisher = await login(publisherId);

    const reviewRes = await app.inject({
      method: 'POST',
      url: `/api/guides/${guide[0]!.id}/review`,
      headers: { cookie: `gf_session=${author}`, origin: TEST_ORIGIN },
      payload: { contentHash: 'abc123' },
    });
    expect(reviewRes.statusCode).toBe(200);
    const review = bodyOf<{ id: string }>(reviewRes);

    const decisionRes = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review.id}/decision`,
      headers: { cookie: `gf_session=${publisher}`, origin: TEST_ORIGIN },
      payload: { decision: 'approved', currentContentHash: 'abc123' },
    });
    expect(decisionRes.statusCode).toBe(200);

    // Audit is append-only and contains both events.
    const auditRes = await app.inject({
      method: 'GET',
      url: `/api/guides/${guide[0]!.id}/audit`,
      headers: {
        cookie: `gf_session=${await login('55555555-5555-4555-8555-555555555555')}`,
      },
    });
    expect(auditRes.statusCode).toBe(200);
    const events = bodyOf<{ action: string }[]>(auditRes);
    expect(events.map((e) => e.action)).toContain('guide.submit-review');
    expect(events.map((e) => e.action)).toContain('release.approve');

    const updated = await db.query.guides.findFirst({
      where: (g, { eq }) => eq(g.id, guide[0]!.id),
    });
    expect(updated?.lifecycleState).toBe('approved');
  });

  it('a new review after content change supersedes the old approval', async () => {
    const db = drizzle(pool, { schema });
    const org = await db.insert(schema.organizations).values({ name: 'Org4' }).returning();
    const ws = await db
      .insert(schema.workspaces)
      .values({ organizationId: org[0]!.id, name: 'WS4' })
      .returning();
    const guide = await db
      .insert(schema.guides)
      .values({ workspaceId: ws[0]!.id, title: 'G4', docName: 'g-doc-4' })
      .returning();

    const authorId = '66666666-6666-4666-8666-666666666666';
    const publisherId = '77777777-7777-4777-8777-777777777777';
    await db
      .insert(schema.users)
      .values([
        { oidcIssuer: 'test', oidcSubject: authorId, email: 'a4@x.io', displayName: 'A4' },
        { oidcIssuer: 'test', oidcSubject: publisherId, email: 'p4@x.io', displayName: 'P4' },
      ])
      .onConflictDoNothing();

    const author = await login(authorId);
    const publisher = await login(publisherId);

    // Review + approve with contentHash v1
    const r1 = await app.inject({
      method: 'POST',
      url: `/api/guides/${guide[0]!.id}/review`,
      headers: { cookie: `gf_session=${author}`, origin: TEST_ORIGIN },
      payload: { contentHash: 'v1' },
    });
    const review1 = bodyOf<{ id: string }>(r1);
    await app.inject({
      method: 'POST',
      url: `/api/reviews/${review1.id}/decision`,
      headers: { cookie: `gf_session=${publisher}`, origin: TEST_ORIGIN },
      payload: { decision: 'approved', currentContentHash: 'v1' },
    });

    // Content changed → guide lifecycle returns to draft, old approval invalid.
    await db
      .update(schema.guides)
      .set({ lifecycleState: 'draft', updatedAt: new Date() })
      .where(eq(schema.guides.id, guide[0]!.id));

    const after = await db.query.guides.findFirst({ where: (g, { eq }) => eq(g.id, guide[0]!.id) });
    expect(after?.lifecycleState).toBe('draft');
    // The prior approval remains recorded (append-only) but a fresh review is
    // required before publishing again.
    const approvals = await db.query.approvals.findMany({
      where: (a, { eq }) => eq(a.guideId, guide[0]!.id),
    });
    expect(approvals).toHaveLength(1);
  });

  it('approval is refused when the current content hash differs from the reviewed hash', async () => {
    // Regression: the decision route previously ignored content changes. Now
    // an approval for changed content is refused (409) and the guide returns
    // to draft — real content-hash invalidation.
    const db = drizzle(pool, { schema });
    const org = await db.insert(schema.organizations).values({ name: 'OrgInv' }).returning();
    const ws = await db
      .insert(schema.workspaces)
      .values({ organizationId: org[0]!.id, name: 'WSInv' })
      .returning();
    const guide = await db
      .insert(schema.guides)
      .values({ workspaceId: ws[0]!.id, title: 'GInv', docName: 'g-doc-inv' })
      .returning();

    const authorId = '88888888-8888-4888-8888-888888888888';
    const publisherId = '99999999-9999-4999-8999-999999999999';
    await db
      .insert(schema.users)
      .values([
        { oidcIssuer: 'test', oidcSubject: authorId, email: 'ai@x.io', displayName: 'AI' },
        { oidcIssuer: 'test', oidcSubject: publisherId, email: 'pi@x.io', displayName: 'PI' },
      ])
      .onConflictDoNothing();

    const author = await login(authorId);
    const publisher = await login(publisherId);

    const reviewRes = await app.inject({
      method: 'POST',
      url: `/api/guides/${guide[0]!.id}/review`,
      headers: { cookie: `gf_session=${author}`, origin: TEST_ORIGIN },
      payload: { contentHash: 'reviewed-v1' },
    });
    const review = bodyOf<{ id: string }>(reviewRes);

    // Approving with a stale/current hash that differs from the reviewed hash
    // must be refused — content changed after the review.
    const decisionRes = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review.id}/decision`,
      headers: { cookie: `gf_session=${publisher}`, origin: TEST_ORIGIN },
      payload: { decision: 'approved', currentContentHash: 'changed-v2' },
    });
    expect(decisionRes.statusCode).toBe(409);
    const body = bodyOf<{ error: string; reviewedHash: string; currentHash: string }>(decisionRes);
    expect(body.error).toContain('content changed since review');
    expect(body.reviewedHash).toBe('reviewed-v1');
    expect(body.currentHash).toBe('changed-v2');

    // No approval row was written for the changed content.
    const approvals = await db.query.approvals.findMany({
      where: (a, { eq }) => eq(a.guideId, guide[0]!.id),
    });
    expect(approvals).toHaveLength(0);

    // The guide fell back to draft.
    const after = await db.query.guides.findFirst({ where: (g, { eq }) => eq(g.id, guide[0]!.id) });
    expect(after?.lifecycleState).toBe('draft');
  });

  it(
    'AI proposals endpoint returns real DeepSeek proposals when the key is set',
    { timeout: 90_000 },
    async () => {
      if (!process.env.DEEPSEEK_API_KEY) {
        return; // skipped in CI without a key
      }
      const db = drizzle(pool, { schema });
      const org = await db.insert(schema.organizations).values({ name: 'OrgAi' }).returning();
      const ws = await db
        .insert(schema.workspaces)
        .values({ organizationId: org[0]!.id, name: 'WSAi' })
        .returning();
      const guide = await db
        .insert(schema.guides)
        .values({ workspaceId: ws[0]!.id, title: 'GAi', docName: 'g-doc-ai' })
        .returning();

      const author = await login('99999999-9999-4999-8999-999999999999');
      const res = await app.inject({
        method: 'POST',
        url: `/api/guides/${guide[0]!.id}/ai-proposals`,
        headers: { cookie: `gf_session=${author}`, origin: TEST_ORIGIN },
        payload: {
          steps: [
            { stepId: 'step-1', instructionText: 'Disconnect power before opening the housing.' },
            {
              stepId: 'step-2',
              instructionText: 'Loosen the retaining screw with a 5 mm hex key.',
            },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = bodyOf<{ proposals: unknown[]; receipt: { provider: string } }>(res);
      expect(body.receipt.provider).toBe('deepseek');
      expect(Array.isArray(body.proposals)).toBe(true);
    },
  );

  it('source synthesis endpoint exposes the explicit offline rules mode', async () => {
    const author = await login('88888888-8888-4888-8888-888888888888');
    const sourceHash = 'a'.repeat(64);
    const res = await app.inject({
      method: 'POST',
      url: '/api/guides/guide-offline/source-synthesis',
      headers: { cookie: `gf_session=${author}`, origin: TEST_ORIGIN },
      payload: {
        guideId: 'guide-offline',
        mode: 'offline-rules',
        sources: [
          {
            sourceHash,
            originalFilename: 'manual.txt',
            detectedType: 'text/plain',
            sizeBytes: 32,
            regions: [
              {
                regionId: 'reg-offline',
                sourceHash,
                pageIndex: 0,
                structuralPath: 'p:1',
                excerpt: 'Disconnect power before opening the housing.',
                kind: 'paragraph',
              },
            ],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = bodyOf<{
      mode: string;
      plan: { coverage: { citedRegions: number } };
      receipt: { provider: string; model: string };
    }>(res);
    expect(body.mode).toBe('offline-rules');
    expect(body.receipt.provider).toBe('synthesis-local');
    expect(body.receipt.model).toBe('synthesis-rules-v1');
    expect(body.plan.coverage.citedRegions).toBe(1);
  });

  it(
    'source synthesis endpoint returns a live OpenRouter transport receipt when configured',
    { timeout: 90_000 },
    async () => {
      if (!process.env.OPENROUTER_API_KEY) return;
      const author = await login('77777777-7777-4777-8777-777777777777');
      const sourceHash = 'b'.repeat(64);
      const res = await app.inject({
        method: 'POST',
        url: '/api/guides/guide-openrouter/source-synthesis',
        headers: { cookie: `gf_session=${author}`, origin: TEST_ORIGIN },
        payload: {
          guideId: 'guide-openrouter',
          sources: [
            {
              sourceHash,
              originalFilename: 'manual.txt',
              detectedType: 'text/plain',
              sizeBytes: 80,
              regions: [
                {
                  regionId: 'reg-openrouter',
                  sourceHash,
                  pageIndex: 0,
                  structuralPath: 'p:1',
                  excerpt: 'Disconnect power before opening the housing.',
                  kind: 'paragraph',
                },
              ],
            },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = bodyOf<{
        mode: string;
        receipt: { provider: string; model: string; status: string };
      }>(res);
      expect(body.mode).toBe('deepseek');
      expect(body.receipt.provider).toBe('openrouter');
      expect(body.receipt.model).toBe('deepseek/deepseek-v4-flash-0731');
      expect(body.receipt.status).toBe('complete');
    },
  );
});
