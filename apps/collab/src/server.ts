/**
 * Collab service entrypoint (container/local).
 *
 * Reads ROOM_TICKET_SECRET and PORT env; persists Yjs updates to the
 * control-plane database via the postgres connection when DATABASE_URL is set,
 * otherwise runs in-memory (dev).
 */
import { Pool } from 'pg';
import { buildCollabServer } from './index.js';

const secret = process.env.ROOM_TICKET_SECRET ?? 'dev-change-me-tickets';
const port = Number(process.env.PORT ?? 1234);

async function main() {
  let persist: ((docName: string, state: Uint8Array) => Promise<void>) | undefined;
  let load: ((docName: string) => Promise<Uint8Array | null>) | undefined;

  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS yjs_documents (
        document_name text PRIMARY KEY,
        state bytea NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    persist = async (docName, state) => {
      await pool.query(
        `INSERT INTO yjs_documents (document_name, state) VALUES ($1, $2)
         ON CONFLICT (document_name) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
        [docName, Buffer.from(state)],
      );
    };
    load = async (docName) => {
      const res = await pool.query<{ state: Buffer }>(
        'SELECT state FROM yjs_documents WHERE document_name = $1',
        [docName],
      );
      return res.rows[0] ? new Uint8Array(res.rows[0].state) : null;
    };
  }

  const server = buildCollabServer({
    roomTicketSecret: secret,
    ...(persist ? { persist } : {}),
    ...(load ? { load } : {}),
  });

  await server.listen(port);
  // eslint-disable-next-line no-console
  console.log(`GuideForge collab listening on :${port}`);
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
