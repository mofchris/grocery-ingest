import { setTimeout as delay } from 'node:timers/promises';

import type pg from 'pg';

import { categorizePending } from './categories/categorize.ts';
import { ingestSnapshot } from './ingest/snapshot.ts';
import { claimJob, completeJob, failJob, type Job } from './queue.ts';
import { processApiDeltaPage } from './sources/api.ts';
import { checkSnapshot } from './sources/snapshot.ts';

function stringPayload(job: Job, key: string): string {
  const value = job.payload[key];
  if (typeof value !== 'string' || !value) throw new Error(`Job ${job.id} requires string payload.${key}`);
  return value;
}

export async function dispatchJob(pool: pg.Pool, job: Job): Promise<void> {
  switch (job.kind) {
    case 'check_snapshot':
      await checkSnapshot(pool, stringPayload(job, 'date'), typeof job.payload.url === 'string' ? job.payload.url : undefined);
      return;
    case 'ingest_snapshot':
      await ingestSnapshot(pool, stringPayload(job, 'path'), stringPayload(job, 'source'));
      return;
    case 'api_delta_page':
      await processApiDeltaPage(pool, {
        pageNumber: typeof job.payload.pageNumber === 'number' ? job.payload.pageNumber : undefined,
        cursor: typeof job.payload.cursor === 'string' ? job.payload.cursor : null,
        newestCursor: typeof job.payload.newestCursor === 'string' ? job.payload.newestCursor : null,
      });
      return;
    case 'categorize':
      await categorizePending(pool);
      return;
  }
}

export async function runWorker(pool: pg.Pool, options: { untilEmpty?: boolean; pollMs?: number } = {}): Promise<void> {
  const untilEmpty = options.untilEmpty ?? false;
  const pollMs = options.pollMs ?? 1000;
  while (true) {
    const job = await claimJob(pool);
    if (!job) {
      if (untilEmpty) return;
      await delay(pollMs);
      continue;
    }
    try {
      await dispatchJob(pool, job);
      await completeJob(pool, job.id);
    } catch (error) {
      const result = await failJob(pool, job, error);
      console.error(`Job ${job.id} (${job.kind}) ${result.status}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

