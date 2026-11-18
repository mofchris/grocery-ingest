import { access } from 'node:fs/promises';
import { join } from 'node:path';

import { categorizePending } from './categories/categorize.ts';
import { config } from './config.ts';
import { initDatabase, startDatabase, stopDatabase } from './db/local.ts';
import { migrate } from './db/migrate.ts';
import { runEvaluation } from './eval.ts';
import { enqueueJob } from './queue.ts';
import { runReport } from './report.ts';
import { runScheduler, syncOnce } from './scheduler.ts';
import { runWorker } from './worker.ts';
import type pg from 'pg';

const command = process.argv[2];
const args = process.argv.slice(3);

function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function withPool(action: (pool: pg.Pool) => Promise<void>): Promise<void> {
  const { createPool } = await import('./db/client.ts');
  const pool = createPool();
  try { await action(pool); } finally { await pool.end(); }
}

switch (command) {
  case 'db:init':
    initDatabase();
    break;
  case 'db:start':
    startDatabase();
    break;
  case 'db:stop':
    stopDatabase();
    break;
  case 'migrate':
    await withPool(migrate);
    break;
  case 'sync':
    await withPool((pool) => syncOnce(pool));
    break;
  case 'ingest': {
    const date = option('--snapshot');
    if (!date) throw new Error('Usage: npm run ingest -- --snapshot YYYY-MM-DD');
    await withPool(async (pool) => {
      const path = join(config.cacheDir, `FoodData_Central_branded_food_json_${date}.zip`);
      try {
        await access(path);
        await enqueueJob(pool, 'ingest_snapshot', { date, path, source: `snapshot:${date}` });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        await enqueueJob(pool, 'check_snapshot', { date });
      }
      await runWorker(pool, { untilEmpty: true });
    });
    break;
  }
  case 'worker':
    await withPool(runWorker);
    break;
  case 'scheduler':
    await withPool(runScheduler);
    break;
  case 'categorize':
    await withPool(async (pool) => { console.table(await categorizePending(pool)); });
    break;
  case 'eval':
    await runEvaluation();
    break;
  case 'report':
    await withPool(runReport);
    break;
  default:
    throw new Error('Usage: node src/cli.ts <db:init|db:start|db:stop|migrate|sync|ingest|worker|scheduler|categorize|eval|report>');
}
