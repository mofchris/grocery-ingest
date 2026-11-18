import assert from 'node:assert/strict';
import test from 'node:test';

import { migrate } from '../src/db/migrate.ts';
import { normalizeProduct } from '../src/products/normalize.ts';
import { createRun, mergeStagedRun, stageProducts } from '../src/ingest/upsert.ts';
import { testPool } from './db.ts';

test('upsert records new changed and unchanged without duplicate versions', async (t) => {
  const pool = await testPool(t);
  if (!pool) return;
  t.after(() => pool.end());
  await migrate(pool);
  const suffix = `${Date.now()}${Math.random()}`.replace('.', '');
  const gtin = `99${suffix}`;

  const firstRun = await createRun(pool, `test:${suffix}`, 'test');
  await stageProducts(pool, firstRun, [normalizeProduct({
    fdcId: 1, gtinUpc: gtin, description: 'Before', publicationDate: '2025-01-01',
  })]);
  assert.deepEqual(await mergeStagedRun(pool, firstRun), { seen: 1, new: 1, changed: 0, unchanged: 0, missing: 0 });

  const changedRun = await createRun(pool, `test:${suffix}`, 'test');
  await stageProducts(pool, changedRun, [normalizeProduct({
    fdcId: 2, gtinUpc: gtin, description: 'After', publicationDate: '2025-02-01',
  })]);
  assert.deepEqual(await mergeStagedRun(pool, changedRun), { seen: 1, new: 0, changed: 1, unchanged: 0, missing: 0 });

  const repeatRun = await createRun(pool, `test:${suffix}`, 'test');
  await stageProducts(pool, repeatRun, [normalizeProduct({
    fdcId: 3, gtinUpc: gtin, description: 'After', publicationDate: '2025-03-01',
  })]);
  assert.deepEqual(await mergeStagedRun(pool, repeatRun), { seen: 1, new: 0, changed: 0, unchanged: 1, missing: 0 });

  const versions = await pool.query(
    'SELECT fdc_id FROM product_versions WHERE product_id = $1 ORDER BY id',
    [`gtin:${gtin.replace(/^0+/, '')}`],
  );
  assert.deepEqual(versions.rows.map((row) => Number(row.fdc_id)), [1, 2]);
});

test('staging keeps newest duplicate GTIN in a release', async (t) => {
  const pool = await testPool(t);
  if (!pool) return;
  t.after(() => pool.end());
  await migrate(pool);
  const suffix = `${Date.now()}${Math.random()}`.replace('.', '');
  const gtin = `88${suffix}`;
  const runId = await createRun(pool, `test:${suffix}`, 'test');
  await stageProducts(pool, runId, [
    normalizeProduct({ fdcId: 10, gtinUpc: gtin, description: 'New', publicationDate: '2025-03-01' }),
    normalizeProduct({ fdcId: 9, gtinUpc: gtin, description: 'Old', publicationDate: '2025-01-01' }),
  ]);
  await mergeStagedRun(pool, runId);
  const result = await pool.query('SELECT fdc_id, description FROM products WHERE product_id = $1', [`gtin:${gtin}`]);
  assert.deepEqual({ fdcId: Number(result.rows[0].fdc_id), description: result.rows[0].description }, { fdcId: 10, description: 'New' });
});
