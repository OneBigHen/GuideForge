/**
 * GuideForge collaboration service (Hocuspocus-compatible Yjs WebSocket).
 *
 * Authorization model:
 *  - Clients connect with `?token=<room ticket>` (short-lived, signed).
 *  - The server verifies the ticket signature + expiry with the same secret
 *    as the API (RoomTicketService) and checks the room (document name)
 *    matches the ticket's guideId. Unauthorized rooms fail closed.
 *  - Awareness is ephemeral; only Yjs updates are persisted.
 */
import { RoomTicketService } from '@guideforge/api/src/auth/room-ticket.js';
import { Database } from '@hocuspocus/extension-database';
import { Logger } from '@hocuspocus/extension-logger';
import { Server, type Extension } from '@hocuspocus/server';

export interface CollabConfig {
  roomTicketSecret: string;
  roomTicketTtlSeconds?: number;
  /** Persistence implementation: (docName, state) => Promise<void> */
  persist?: (docName: string, state: Uint8Array) => Promise<void>;
  /** Loader implementation: (docName) => Promise<Uint8Array | null> */
  load?: (docName: string) => Promise<Uint8Array | null>;
}

export function buildCollabServer(config: CollabConfig): Server {
  const tickets = new RoomTicketService(config.roomTicketSecret, config.roomTicketTtlSeconds);

  const extensions: Extension[] = [new Logger()];

  if (config.persist && config.load) {
    extensions.push(
      new Database({
        fetch: async ({ documentName }) => config.load!(documentName) ?? null,
        store: async ({ documentName, state }) => {
          await config.persist!(documentName, state);
        },
      }),
    );
  }

  const server = new Server({
    extensions,
    onAuthenticate: ({ token, documentName }) => {
      if (typeof token !== 'string' || token.length === 0) {
        throw new Error('missing room ticket');
      }
      const result = tickets.verify(token);
      if (!result.ok || !result.claims) {
        throw new Error(`unauthorized: ${result.reason}`);
      }
      if (result.claims.guideId !== documentName) {
        throw new Error('unauthorized: room mismatch');
      }
      return Promise.resolve({
        userId: result.claims.userId,
        workspaceId: result.claims.workspaceId,
      });
    },
  });

  return server;
}
