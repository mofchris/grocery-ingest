import assert from 'node:assert/strict';
import test from 'node:test';

import { claimJob, enqueueJob, failJob } from '../src/queue.ts';
import { migrate } from '../src/db/migrate.ts';
import { testPool } from './db.ts';

test('claimJob gives a queued job to only one worker', async (t) => {
  const pool = await testPool(t);
  if (!pool) return;
  t.after(() => pool.end());
  await migrate(pool);
  const marker = `${Date.now()}-${Math.random()}`;
  const id = await enqueueJob(pool, 'categorize', { marker });
  const claimed = await claimJob(pool);
  assert.equal(claimed?.id, id);
  assert.equal(claimed?.status, 'running');
  const second = await pool.query('SELECT status FROM jobs WHERE id = $1', [id]);
  assert.equal(second.rows[0].status, 'running');
});

test('failJob applies exponential backoff then dead-letters at max attempts', async (t) => {
  const pool = await testPool(t);
  if (!pool) return;
  t.after(() => pool.end());
  await migrate(pool);
  const id = await enqueueJob(pool, 'categorize', {}, { maxAttempts: 2 });
  const first = await claimJob(pool);
  assert.equal(first?.id, id);
  const before = Date.now();
  const retry = await failJob(pool, first!, new Error('temporary'), { baseMs: 1000, capMs: 10000, jitterMs: 0 });
  assert.equal(retry.status, 'queued');
  assert.equal(retry.attempts, 1);
  assert.ok(retry.runAfter!.getTime() >= before + 900);

  await pool.query('UPDATE jobs SET run_after = now() WHERE id = $1', [id]);
  const second = await claimJob(pool);
  const dead = await failJob(pool, second!, new Error('again'), { baseMs: 1000, capMs: 10000, jitterMs: 0 });
  assert.equal(dead.status, 'dead');
  assert.equal(dead.attempts, 2);
  assert.equal(dead.runAfter, null);
});
