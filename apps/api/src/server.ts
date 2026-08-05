/**
 * API service entrypoint (container/local).
 */
import { buildServer } from './index.js';

const port = Number(process.env.PORT ?? 8080);

async function main() {
  const app = await buildServer({
    databaseUrl:
      process.env.DATABASE_URL ?? 'postgres://guideforge:guideforge@localhost:5432/guideforge',
    sessionSecret: process.env.SESSION_SECRET ?? 'dev-change-me-session',
    roomTicketSecret: process.env.ROOM_TICKET_SECRET ?? 'dev-change-me-tickets',
    corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:1420').split(','),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    ...(process.env.DEEPSEEK_API_KEY ? { deepSeekApiKey: process.env.DEEPSEEK_API_KEY } : {}),
    ...(process.env.DEEPSEEK_MODEL ? { deepSeekModel: process.env.DEEPSEEK_MODEL } : {}),
  });
  await app.listen({ port, host: '0.0.0.0' });
  // eslint-disable-next-line no-console
  console.log(`GuideForge API listening on :${port}`);
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
