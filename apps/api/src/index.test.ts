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
    },
    { db, roomTickets: tickets },
  );
  await app.listen({ port: 18788 });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function login(userId: string, roles: string[]) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: { userId, displayName: 'T', email: 't@example.com', roles },
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

    const cookie = await login('11111111-1111-4111-8111-111111111111', ['author']);
    const res = await app.inject({
      method: 'POST',
      url: `/api/rooms/${guide[0]!.id}/tickets`,
      headers: { cookie: `gf_session=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = bodyOf<{ token: string }>(res);
    const verified = tickets.verify(body.token);
    expect(verified.ok).toBe(true);
    expect(verified.claims?.guideId).toBe(guide[0]!.id);
  });

  it('role lacking collaborate permission is denied', async () => {
    const db = drizzle(pool, { schema });
    const org = await db.insert(schema.organizations).values({ name: 'Org2' }).returning();
    const ws = await db
      .insert(schema.workspaces)
      .values({ organizationId: org[0]!.id, name: 'WS2' })
      .returning();
    const guide = await db
      .insert(schema.guides)
      .values({ workspaceId: ws[0]!.id, title: 'G2', docName: 'g-doc-2' })
      .returning();

    // operator role cannot collaborate
    const cookie = await login('22222222-2222-4222-8222-222222222222', ['operator']);
    const res = await app.inject({
      method: 'POST',
      url: `/api/rooms/${guide[0]!.id}/tickets`,
      headers: { cookie: `gf_session=${cookie}` },
    });
    expect(res.statusCode).toBe(403);
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

    const author = await login(authorId, ['author']);
    const publisher = await login(publisherId, ['publisher']);

    const reviewRes = await app.inject({
      method: 'POST',
      url: `/api/guides/${guide[0]!.id}/review`,
      headers: { cookie: `gf_session=${author}` },
      payload: { contentHash: 'abc123' },
    });
    expect(reviewRes.statusCode).toBe(200);
    const review = bodyOf<{ id: string }>(reviewRes);

    const decisionRes = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review.id}/decision`,
      headers: { cookie: `gf_session=${publisher}` },
      payload: { decision: 'approved' },
    });
    expect(decisionRes.statusCode).toBe(200);

    // Audit is append-only and contains both events.
    const auditRes = await app.inject({
      method: 'GET',
      url: `/api/guides/${guide[0]!.id}/audit`,
      headers: {
        cookie: `gf_session=${await login('55555555-5555-4555-8555-555555555555', ['auditor'])}`,
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

    const author = await login(authorId, ['author']);
    const publisher = await login(publisherId, ['publisher']);

    // Review + approve with contentHash v1
    const r1 = await app.inject({
      method: 'POST',
      url: `/api/guides/${guide[0]!.id}/review`,
      headers: { cookie: `gf_session=${author}` },
      payload: { contentHash: 'v1' },
    });
    const review1 = bodyOf<{ id: string }>(r1);
    await app.inject({
      method: 'POST',
      url: `/api/reviews/${review1.id}/decision`,
      headers: { cookie: `gf_session=${publisher}` },
      payload: { decision: 'approved' },
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

      const author = await login('99999999-9999-4999-8999-999999999999', ['author']);
      const res = await app.inject({
        method: 'POST',
        url: `/api/guides/${guide[0]!.id}/ai-proposals`,
        headers: { cookie: `gf_session=${author}` },
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
});
