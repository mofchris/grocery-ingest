import assert from 'node:assert/strict';
import test from 'node:test';

import { getApiDeltaPage } from '../src/sources/api.ts';
import { HttpStatusError } from '../src/sources/snapshot.ts';

// Records published on the cursor day are re-fetched on purpose; content hashing skips them if unchanged.
test('getApiDeltaPage stops at the publication cursor', async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls++;
    return new Response(JSON.stringify([
      { fdcId: 3, publicationDate: '2025-03-01' },
      { fdcId: 2, publicationDate: '2025-02-01' },
      { fdcId: 1, publicationDate: '2025-01-01' },
    ]), { status: 200, headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '7' } });
  };
  const result = await getApiDeltaPage({ apiKey: 'test-key', pageNumber: 1, cursor: '2025-02-01', fetchImpl });
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.deepEqual(result.records.map((row) => row.fdcId), [3, 2]);
  assert.equal(result.done, true);
  assert.equal(result.nextPage, null);
  assert.equal(result.newestCursor, '2025-03-01');
  assert.equal(result.remaining, 7);
  assert.equal(calls, 1);
});

test('getApiDeltaPage skips gracefully without a key', async () => {
  const result = await getApiDeltaPage({ pageNumber: 1, fetchImpl: async () => { throw new Error('must not fetch'); } });
  assert.deepEqual(result, { status: 'skipped_no_key', records: [] });
});

test('getApiDeltaPage marks 429 as retryable', async () => {
  await assert.rejects(
    getApiDeltaPage({ apiKey: 'DEMO_KEY', pageNumber: 1, fetchImpl: async () => new Response('', { status: 429 }) }),
    (error) => error instanceof HttpStatusError && error.status === 429 && error.retryable,
  );
});
