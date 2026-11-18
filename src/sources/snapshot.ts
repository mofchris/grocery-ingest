import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type pg from 'pg';

import { config } from '../config.ts';
import { createRun, finishRun } from '../ingest/upsert.ts';
import { enqueueJob } from '../queue.ts';

export const SNAPSHOT_BASE_URL = 'https://fdc.nal.usda.gov/fdc-datasets';

export function snapshotUrl(date: string): string {
  return `${SNAPSHOT_BASE_URL}/FoodData_Central_branded_food_json_${date}.zip`;
}

type ConditionalState = { etag?: string | null; lastModified?: string | null };
export type DownloadResult = {
  status: 'downloaded' | 'not_modified';
  httpStatus: number;
  bytesDownloaded: number;
  path: string | null;
  etag: string | null;
  lastModified: string | null;
};

export class HttpStatusError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.retryable = status === 429 || status >= 500;
  }
}

export async function downloadSnapshot(
  url: string,
  destination: string,
  state: ConditionalState = {},
  fetchImpl: typeof fetch = fetch,
): Promise<DownloadResult> {
  const headers = new Headers({ 'User-Agent': config.userAgent, Accept: 'application/zip' });
  if (state.etag) headers.set('If-None-Match', state.etag);
  if (state.lastModified) headers.set('If-Modified-Since', state.lastModified);
  const response = await fetchImpl(url, { headers, redirect: 'follow' });
  if (response.status === 304) {
    return {
      status: 'not_modified', httpStatus: 304, bytesDownloaded: 0, path: null,
      etag: response.headers.get('etag') ?? state.etag ?? null,
      lastModified: response.headers.get('last-modified') ?? state.lastModified ?? null,
    };
  }
  if (!response.ok || !response.body) throw new HttpStatusError(response.status, `Snapshot request failed: HTTP ${response.status}`);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.part-${process.pid}-${Date.now()}`;
  let bytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>), counter, createWriteStream(temporary, { flags: 'wx' }));
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return {
    status: 'downloaded', httpStatus: response.status, bytesDownloaded: bytes, path: destination,
    etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified'),
  };
}

export async function checkSnapshot(pool: pg.Pool, date: string, url = snapshotUrl(date)): Promise<DownloadResult> {
  const source = `snapshot:${date}`;
  const runId = await createRun(pool, source, 'check_snapshot');
  try {
    const stateResult = await pool.query<{ etag: string | null; last_modified: string | null }>(
      'SELECT etag, last_modified FROM source_state WHERE source = $1', [source],
    );
    const destination = join(config.cacheDir, `FoodData_Central_branded_food_json_${date}.zip`);
    const result = await downloadSnapshot(url, destination, {
      etag: stateResult.rows[0]?.etag, lastModified: stateResult.rows[0]?.last_modified,
    });
    if (result.status === 'not_modified') {
      await finishRun(pool, runId, 'not_modified', { httpStatus: 304 });
      return result;
    }
    await pool.query(`
      INSERT INTO source_state(source, etag, last_modified) VALUES ($1, $2, $3)
      ON CONFLICT (source) DO UPDATE SET etag = EXCLUDED.etag,
        last_modified = EXCLUDED.last_modified, updated_at = now()
    `, [source, result.etag, result.lastModified]);
    await enqueueJob(pool, 'ingest_snapshot', { date, path: result.path, source });
    await finishRun(pool, runId, 'downloaded', {
      httpStatus: result.httpStatus, bytesDownloaded: result.bytesDownloaded,
    });
    return result;
  } catch (error) {
    await finishRun(pool, runId, 'failed');
    throw error;
  }
}

