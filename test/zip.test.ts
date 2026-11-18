import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { readBrandedFoods } from '../src/sources/zip.ts';
import { storedZip } from './zip-fixture.ts';

test('readBrandedFoods streams the BrandedFoods array from a real ZIP fixture', async (t) => {
  try {
    await import('yauzl');
    await import('stream-json');
  } catch {
    t.skip('ZIP test skipped: streaming dependencies are not installed');
    return;
  }
  const directory = await mkdtemp(join(tmpdir(), 'grocery-ingest-zip-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'fixture.zip');
  await writeFile(path, storedZip('branded.json', JSON.stringify({
    BrandedFoods: [{ fdcId: 1, gtinUpc: '00123' }, { fdcId: 2, description: 'No GTIN' }],
  })));
  const rows = [];
  for await (const row of readBrandedFoods(path)) rows.push(row);
  assert.deepEqual(rows, [{ fdcId: 1, gtinUpc: '00123' }, { fdcId: 2, description: 'No GTIN' }]);
});
