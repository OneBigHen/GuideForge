/**
 * API service entrypoint (container/local).
 */
import { assertSafeBindConfig } from './bind-guard.js';
import { buildServer, type ApiConfig } from './index.js';

const port = Number(process.env.PORT ?? 8080);
// Loopback by default (single-owner companion). Network mode requires an
// explicit HOST + HTTPS proxy + ownerId — enforced by assertSafeBindConfig.
const host = process.env.GUIDEFORGE_HOST ?? '127.0.0.1';
const ownerId = process.env.GUIDEFORGE_OWNER_ID;
assertSafeBindConfig(host, ownerId);
function configuredModelProvider(value: string | undefined): ApiConfig['modelProvider'] {
  if (value === undefined) return undefined;
  if (value === 'deepseek' || value === 'openrouter') return value;
  throw new Error('GUIDEFORGE_MODEL_PROVIDER must be deepseek or openrouter');
}

const modelProvider = configuredModelProvider(process.env.GUIDEFORGE_MODEL_PROVIDER);

async function main() {
  const app = await buildServer({
    databaseUrl:
      process.env.DATABASE_URL ?? 'postgres://guideforge:guideforge@localhost:5432/guideforge',
    sessionSecret: process.env.SESSION_SECRET ?? 'dev-change-me-session',
    roomTicketSecret: process.env.ROOM_TICKET_SECRET ?? 'dev-change-me-tickets',
    corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:1420').split(','),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    ...(ownerId ? { ownerId } : {}),
    ...(process.env.DEEPSEEK_API_KEY ? { deepSeekApiKey: process.env.DEEPSEEK_API_KEY } : {}),
    ...(process.env.DEEPSEEK_MODEL ? { deepSeekModel: process.env.DEEPSEEK_MODEL } : {}),
    ...(modelProvider ? { modelProvider } : {}),
    ...(process.env.OPENROUTER_API_KEY ? { openRouterApiKey: process.env.OPENROUTER_API_KEY } : {}),
    ...(process.env.OPENROUTER_MODEL ? { openRouterModel: process.env.OPENROUTER_MODEL } : {}),
    ...(process.env.OPENROUTER_REFERER
      ? { openRouterReferer: process.env.OPENROUTER_REFERER }
      : {}),
    ...(process.env.OPENROUTER_APP_NAME
      ? { openRouterAppName: process.env.OPENROUTER_APP_NAME }
      : {}),
  });
  await app.listen({ port, host });
  // eslint-disable-next-line no-console
  console.log(`GuideForge API listening on ${host}:${port}`);
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
