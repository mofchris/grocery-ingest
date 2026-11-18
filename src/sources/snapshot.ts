import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
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

type ConditionalState = { etag?: string | null; lastModified?: string | null; knownEtags?: string[] };
export type DownloadResult = {
  status: 'downloaded' | 'not_modified';
  httpStatus: number;
  bytesDownloaded: number;
  path: string | null;
  etag: string | null;
  lastModified: string | null;
  sha256: string | null;
};

// Windows (antivirus scanners, indexers) can briefly hold a freshly written file open.
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rm(to, { force: true });
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 5 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw error;
      await delay(500 * 2 ** attempt);
    }
  }
}

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
  const etags = [...new Set([...(state.knownEtags ?? []), ...(state.etag ? [state.etag] : [])])];
  if (etags.length) headers.set('If-None-Match', etags.join(', '));
  else if (state.lastModified) headers.set('If-Modified-Since', state.lastModified);
  const response = await fetchImpl(url, { headers, redirect: 'follow' });
  if (response.status === 304) {
    return {
      status: 'not_modified', httpStatus: 304, bytesDownloaded: 0, path: null,
      etag: response.headers.get('etag') ?? state.etag ?? null,
      lastModified: response.headers.get('last-modified') ?? state.lastModified ?? null,
      sha256: null,
    };
  }
  if (!response.ok || !response.body) throw new HttpStatusError(response.status, `Snapshot request failed: HTTP ${response.status}`);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.part-${process.pid}-${Date.now()}`;
  let bytes = 0;
  const hash = createHash('sha256');
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>), counter, createWriteStream(temporary, { flags: 'wx' }));
    await renameWithRetry(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return {
    status: 'downloaded', httpStatus: response.status, bytesDownloaded: bytes, path: destination,
    etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified'),
    sha256: hash.digest('hex'),
  };
}

export async function checkSnapshot(pool: pg.Pool, date: string, url = snapshotUrl(date)): Promise<DownloadResult> {
  const source = `snapshot:${date}`;
  const runId = await createRun(pool, source, 'check_snapshot');
  try {
    const stateResult = await pool.query<{
      etag: string | null; last_modified: string | null; known_etags: string[]; file_sha256: string | null;
    }>('SELECT etag, last_modified, known_etags, file_sha256 FROM source_state WHERE source = $1', [source]);
    const state = stateResult.rows[0];
    const destination = join(config.cacheDir, `FoodData_Central_branded_food_json_${date}.zip`);
    const result = await downloadSnapshot(url, destination, {
      etag: state?.etag ?? null, lastModified: state?.last_modified ?? null, knownEtags: state?.known_etags ?? [],
    });
    if (result.status === 'not_modified') {
      await finishRun(pool, runId, 'not_modified', { httpStatus: 304 });
      return result;
    }
    if (state?.file_sha256 && state.file_sha256 === result.sha256) {
      // Same bytes behind a different backend's ETag: remember the ETag, skip the ingest.
      await pool.query(`
        UPDATE source_state SET known_etags = array_append(known_etags, $2), updated_at = now()
        WHERE source = $1 AND NOT ($2 = ANY(known_etags))
      `, [source, result.etag]);
      await finishRun(pool, runId, 'unchanged_file', {
        httpStatus: result.httpStatus, bytesDownloaded: result.bytesDownloaded,
      });
      return { ...result, status: 'not_modified' };
    }
    await pool.query(`
      INSERT INTO source_state(source, etag, last_modified, known_etags, file_sha256)
      VALUES ($1, $2, $3, CASE WHEN $2::text IS NULL THEN '{}'::text[] ELSE ARRAY[$2::text] END, $4)
      ON CONFLICT (source) DO UPDATE SET etag = EXCLUDED.etag, last_modified = EXCLUDED.last_modified,
        known_etags = EXCLUDED.known_etags, file_sha256 = EXCLUDED.file_sha256, updated_at = now()
    `, [source, result.etag, result.lastModified, result.sha256]);
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

