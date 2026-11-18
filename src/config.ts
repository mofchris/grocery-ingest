import { access } from 'node:fs/promises';
import { join } from 'node:path';

try {
  await access('.env');
  process.loadEnvFile('.env');
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  if (code !== 'ENOENT') throw error;
}

const localAppData = process.env.LOCALAPPDATA ?? join(process.env.HOME ?? '.', '.local', 'share');
const dataRoot = join(localAppData, 'grocery-ingest');

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5433/grocery',
  cacheDir: process.env.CACHE_DIR || join(dataRoot, 'cache'),
  pgDataDir: process.env.PGDATA_DIR || join(dataRoot, 'pgdata'),
  pgBin: process.env.PG_BIN || 'C:/Program Files/PostgreSQL/16/bin',
  fdcApiKey: process.env.FDC_API_KEY || undefined,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
  snapshotDate: process.env.SNAPSHOT_DATE || '2026-04-30',
  syncIntervalHours: Number(process.env.SYNC_INTERVAL_HOURS || 24),
  userAgent: 'grocery-ingest/0.1 (+https://github.com/mofchris/grocery-ingest)',
} as const;

