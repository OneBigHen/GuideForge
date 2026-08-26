import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { PostgresQuotaStore } from './demo-ai.js';
import { createDefaultDemoAiQuotaStore } from './index.js';

describe('public demo quota wiring', () => {
  it('selects the PostgreSQL-backed store for the production pool', async () => {
    const pool = new Pool({
      connectionString: 'postgres://guideforge:unused@127.0.0.1:1/guideforge',
    });
    try {
      const store = createDefaultDemoAiQuotaStore(pool, 2);

      expect(store).toBeInstanceOf(PostgresQuotaStore);
    } finally {
      await pool.end();
    }
  });
});
