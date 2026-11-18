import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { evaluateRules, loadGold } from '../src/eval.ts';

test('unrecorded AI fixture keeps the threshold scoped to rules and validator', async () => {
  const fixture = JSON.parse(await readFile('eval/ai-responses.fixture.json', 'utf8')) as { status: string; responses: object };
  assert.equal(fixture.status, 'NOT YET RECORDED');
  assert.deepEqual(fixture.responses, {});
  const gold = await loadGold('eval/categories.gold.jsonl');
  const result = evaluateRules(gold);
  assert.equal(result.total, gold.length);
  if (gold.length) assert.ok(result.accuracy !== null && result.accuracy >= 0.7, `rules accuracy ${result.accuracy}`);
  else assert.equal(result.accuracy, null);
});
