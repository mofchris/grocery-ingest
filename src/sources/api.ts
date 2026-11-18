import type pg from 'pg';

import { config } from '../config.ts';
import { createRun, finishRun, mergeStagedRun, stageProducts } from '../ingest/upsert.ts';
import { normalizeProduct } from '../products/normalize.ts';
import type { RawFood } from '../products/types.ts';
import { enqueueJob } from '../queue.ts';
import { HttpStatusError } from './snapshot.ts';

const API_URL = 'https://api.nal.usda.gov/fdc/v1/foods/list';

type ApiPageOptions = {
  apiKey?: string;
  pageNumber: number;
  cursor?: string | null;
  fetchImpl?: typeof fetch;
};

export type ApiPageResult =
  | { status: 'skipped_no_key'; records: [] }
  | {
      status: 'ok'; records: RawFood[]; done: boolean; nextPage: number | null;
      newestCursor: string | null; remaining: number | null;
    };

function publicationDate(row: RawFood): string | null {
  return typeof row.publicationDate === 'string' ? row.publicationDate : null;
}

export async function getApiDeltaPage(options: ApiPageOptions): Promise<ApiPageResult> {
  if (!options.apiKey) return { status: 'skipped_no_key', records: [] };
  const url = new URL(API_URL);
  url.search = new URLSearchParams({
    api_key: options.apiKey,
    dataType: 'Branded',
    pageSize: '200',
    pageNumber: String(options.pageNumber),
    sortBy: 'publishedDate',
    sortOrder: 'desc',
  }).toString();
  const response = await (options.fetchImpl ?? fetch)(url, {
    headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
  });
  if (!response.ok) throw new HttpStatusError(response.status, `FDC API request failed: HTTP ${response.status}`);
  const body: unknown = await response.json();
  const rawRows = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as { foods?: unknown }).foods)
      ? (body as { foods: unknown[] }).foods
      : [];
  const rows = rawRows.filter((row): row is RawFood => Boolean(row && typeof row === 'object'));
  let reachedCursor = false;
  const records = rows.filter((row) => {
    const date = publicationDate(row);
    if (options.cursor && date && date <= options.cursor) {
      reachedCursor = true;
      return false;
    }
    return true;
  });
  const dates = records.map(publicationDate).filter((date): date is string => date !== null).sort().reverse();
  const done = reachedCursor || rows.length < 200;
  const rawRemaining = response.headers.get('x-ratelimit-remaining');
  return {
    status: 'ok', records, done, nextPage: done ? null : options.pageNumber + 1,
    newestCursor: dates[0] ?? null,
    remaining: rawRemaining !== null && Number.isFinite(Number(rawRemaining)) ? Number(rawRemaining) : null,
  };
}

export async function processApiDeltaPage(
  pool: pg.Pool,
  payload: { pageNumber?: number; cursor?: string | null; newestCursor?: string | null },
): Promise<void> {
  if (!config.fdcApiKey) {
    console.log('FDC_API_KEY is not set; API delta skipped');
    return;
  }
  const source = 'api:branded';
  const pageNumber = payload.pageNumber ?? 1;
  let cursor = payload.cursor;
  if (cursor === undefined) {
    const state = await pool.query<{ cursor: string | null }>('SELECT cursor FROM source_state WHERE source = $1', [source]);
    cursor = state.rows[0]?.cursor ?? null;
  }
  const runId = await createRun(pool, source, 'api_delta_page');
  try {
    const page = await getApiDeltaPage({ apiKey: config.fdcApiKey, pageNumber, cursor });
    if (page.status !== 'ok') {
      await finishRun(pool, runId, 'skipped_no_key');
      return;
    }
    let failed = 0;
    const products = page.records.flatMap((raw) => {
      try { return [normalizeProduct(raw)]; } catch { failed++; return []; }
    });
    await stageProducts(pool, runId, products);
    const counts = await mergeStagedRun(pool, runId);
    await finishRun(pool, runId, 'completed', { ...counts, seen: page.records.length, failed, httpStatus: 200 });
    const newestCursor = payload.newestCursor ?? page.newestCursor;
    if (page.done) {
      if (newestCursor) {
        await pool.query(`
          INSERT INTO source_state(source, cursor) VALUES ($1, $2)
          ON CONFLICT (source) DO UPDATE SET cursor = EXCLUDED.cursor, updated_at = now()
        `, [source, newestCursor]);
      }
      return;
    }
    const rateLimited = page.remaining !== null && page.remaining <= 0;
    await enqueueJob(pool, 'api_delta_page', {
      pageNumber: page.nextPage, cursor, newestCursor,
    }, rateLimited ? { runAfter: new Date(Date.now() + 60 * 60 * 1000) } : {});
  } catch (error) {
    await finishRun(pool, runId, 'failed');
    throw error;
  }
}
