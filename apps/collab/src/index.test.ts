import { RoomTicketService } from '@guideforge/api/src/auth/room-ticket.js';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { buildCollabServer } from './index.js';

const secret = 'collab-test-secret';
const GUIDE = '22222222-2222-4222-8222-222222222222';
const WORKSPACE = '33333333-3333-4333-8333-333333333333';
const USER_A = '44444444-4444-4444-8444-444444444444';
const USER_B = '55555555-5555-4555-8555-555555555555';

const state = new Map<string, Uint8Array>();
const server = buildCollabServer({
  roomTicketSecret: secret,
  persist: (docName, bytes) => {
    state.set(docName, bytes);
    return Promise.resolve();
  },
  load: (docName) => Promise.resolve(state.get(docName) ?? null),
});

const port = 18777;

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 25));
  }
}

beforeAll(async () => {
  await server.listen(port);
});

afterAll(async () => {
  await server.destroy();
});

const tickets = new RoomTicketService(secret, 120);
function ticketFor(userId: string, guideId: string) {
  return tickets.issue({
    ticketId: crypto.randomUUID(),
    guideId,
    workspaceId: WORKSPACE,
    userId,
    role: 'author',
    permission: 'collaborate',
  });
}

describe('collab convergence', () => {
  it('two authorized devices converge through Yjs', async () => {
    const url = `ws://127.0.0.1:${port}`;
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const providerA = new HocuspocusProvider({
      url,
      name: GUIDE,
      token: ticketFor(USER_A, GUIDE),
      document: docA,
    });
    const providerB = new HocuspocusProvider({
      url,
      name: GUIDE,
      token: ticketFor(USER_B, GUIDE),
      document: docB,
    });

    await new Promise<void>((resolve) => providerA.on('synced', () => resolve()));
    await new Promise<void>((resolve) => providerB.on('synced', () => resolve()));

    docA.getMap('guide').set('title', 'Converged title');
    await waitFor(() => docB.getMap('guide').get('title') === 'Converged title');

    expect(docB.getMap('guide').get('title')).toBe('Converged title');

    providerA.destroy();
    providerB.destroy();
  });

  it('offline edit reconnects without loss', async () => {
    const url = `ws://127.0.0.1:${port}`;
    // Device A writes while B is offline (not connected), then B connects.
    const docA = new Y.Doc();
    const providerA = new HocuspocusProvider({
      url,
      name: GUIDE,
      token: ticketFor(USER_A, GUIDE),
      document: docA,
    });
    await new Promise<void>((resolve) => providerA.on('synced', () => resolve()));
    docA.getMap('guide').set('note', 'written offline by A');
    await waitFor(() => state.has(GUIDE));
    providerA.destroy();

    const docB = new Y.Doc();
    const providerB = new HocuspocusProvider({
      url,
      name: GUIDE,
      token: ticketFor(USER_B, GUIDE),
      document: docB,
    });
    await new Promise<void>((resolve) => providerB.on('synced', () => resolve()));
    await waitFor(() => docB.getMap('guide').get('note') === 'written offline by A');
    expect(docB.getMap('guide').get('note')).toBe('written offline by A');
    providerB.destroy();
  });
});

describe('collab authorization', () => {
  it('unauthorized room access fails closed', async () => {
    const url = `ws://127.0.0.1:${port}`;
    const doc = new Y.Doc();
    // Ticket valid but for a DIFFERENT guideId than the room.
    const wrongRoom = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const provider = new HocuspocusProvider({
      url,
      name: GUIDE,
      token: ticketFor(USER_A, wrongRoom),
      document: doc,
    });

    const authError = new Promise<string>((resolve) => {
      provider.on('authenticationFailed', (payload: unknown) => resolve(String(payload)));
      // Safety: fail if it connects anyway.
      provider.on('synced', () => resolve('CONNECTED'));
    });

    const result = await Promise.race([
      authError,
      new Promise<string>((r) => setTimeout(() => r('TIMEOUT'), 5000)),
    ]);
    expect(result).not.toBe('CONNECTED');
    expect(result).not.toBe('TIMEOUT');
    provider.destroy();
  });

  it('missing ticket is rejected', async () => {
    const url = `ws://127.0.0.1:${port}`;
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({ url, name: GUIDE, token: '', document: doc });
    const authError = new Promise<string>((resolve) => {
      provider.on('authenticationFailed', (payload: unknown) => resolve(String(payload)));
      provider.on('synced', () => resolve('CONNECTED'));
    });
    const result = await Promise.race([
      authError,
      new Promise<string>((r) => setTimeout(() => r('TIMEOUT'), 5000)),
    ]);
    expect(result).not.toBe('CONNECTED');
    expect(result).not.toBe('TIMEOUT');
    provider.destroy();
  });
});
