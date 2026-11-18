import assert from 'node:assert/strict';
import test from 'node:test';

import { contentHash } from '../src/products/hash.ts';
import { normalizeProduct } from '../src/products/normalize.ts';

test('contentHash is deterministic across key and nutrient order', () => {
  const first = normalizeProduct({
    fdcId: 1, gtinUpc: '0012', description: 'Food', publicationDate: '2024-01-01',
    foodNutrients: [
      { nutrientNumber: '208', nutrientName: 'Energy', unitName: 'KCAL', value: 9 },
      { nutrientNumber: '203', nutrientName: 'Protein', unitName: 'G', value: 2 },
    ],
  });
  const second = normalizeProduct({
    foodNutrients: [
      { value: 2, unitName: 'G', nutrientName: 'Protein', nutrientNumber: '203' },
      { value: 9, unitName: 'KCAL', nutrientName: 'Energy', nutrientNumber: '208' },
    ],
    publicationDate: '2025-01-01', description: 'Food', gtinUpc: '12', fdcId: 999,
  });

  assert.equal(contentHash(first), contentHash(second));
  assert.match(contentHash(first), /^[a-f0-9]{64}$/);
});

test('contentHash changes when stored content changes', () => {
  const first = normalizeProduct({ fdcId: 1, description: 'Food' });
  const second = normalizeProduct({ fdcId: 1, description: 'Changed' });
  assert.notEqual(contentHash(first), contentHash(second));
});
