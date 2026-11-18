import type pg from 'pg';

import { normalizeProduct } from '../products/normalize.ts';
import type { NormalizedProduct } from '../products/types.ts';
import { readBrandedFoods } from '../sources/zip.ts';
import { createRun, finishRun, mergeStagedRun, stageProducts } from './upsert.ts';

export async function ingestSnapshot(pool: pg.Pool, path: string, source: string): Promise<number> {
  const runId = await createRun(pool, source, 'ingest_snapshot');
  let batch: NormalizedProduct[] = [];
  let recordsSeen = 0;
  let recordsFailed = 0;
  try {
    for await (const raw of readBrandedFoods(path)) {
      recordsSeen++;
      try {
        batch.push(normalizeProduct(raw));
      } catch {
        recordsFailed++;
      }
      if (batch.length >= 1000) {
        await stageProducts(pool, runId, batch);
        batch = [];
      }
    }
    await stageProducts(pool, runId, batch);
    const counts = await mergeStagedRun(pool, runId, true);
    await finishRun(pool, runId, 'completed', { ...counts, seen: recordsSeen, failed: recordsFailed });
    return runId;
  } catch (error) {
    await finishRun(pool, runId, 'failed', { seen: recordsSeen, failed: recordsFailed + 1 });
    throw error;
  }
}
