import type { TestContext } from 'node:test';

export async function testPool(t: TestContext): Promise<import('pg').Pool | null> {
  let pg: typeof import('pg');
  try {
    pg = await import('pg');
  } catch {
    t.skip('PostgreSQL test skipped: pg dependency is not installed');
    return null;
  }
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5433/grocery',
    connectionTimeoutMillis: 500,
  });
  try {
    await pool.query('SELECT 1');
    return pool;
  } catch {
    await pool.end();
    t.skip('PostgreSQL test skipped: DATABASE_URL is unreachable');
    return null;
  }
}

