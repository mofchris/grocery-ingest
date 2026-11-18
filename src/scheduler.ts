import type pg from 'pg';

import { config } from './config.ts';
import { enqueueJob } from './queue.ts';
import { runWorker } from './worker.ts';

export async function enqueueSyncCycle(pool: pg.Pool, date = config.snapshotDate): Promise<void> {
  await enqueueJob(pool, 'check_snapshot', { date });
  if (config.fdcApiKey) await enqueueJob(pool, 'api_delta_page', { pageNumber: 1 });
  else console.log('FDC_API_KEY is not set; scheduler will skip the API delta');
}

export async function syncOnce(pool: pg.Pool, date = config.snapshotDate): Promise<void> {
  await enqueueSyncCycle(pool, date);
  await runWorker(pool, { untilEmpty: true });
}

export async function runScheduler(pool: pg.Pool): Promise<never> {
  await enqueueSyncCycle(pool);
  const intervalMs = config.syncIntervalHours * 60 * 60 * 1000;
  const timer = setInterval(() => {
    void enqueueSyncCycle(pool).catch((error) => console.error('Scheduler enqueue failed', error));
  }, intervalMs);
  timer.unref();
  await runWorker(pool);
  throw new Error('Worker exited unexpectedly');
}

