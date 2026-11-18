import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeProduct, stableProductId } from '../src/products/normalize.ts';

test('stableProductId strips GTIN leading zeroes', () => {
  assert.equal(stableProductId({ gtinUpc: '000123450000', fdcId: 99 }), 'gtin:123450000');
  assert.equal(stableProductId({ gtinUpc: '0000', fdcId: 99 }), 'gtin:0');
});

test('stableProductId falls back to fdcId when GTIN is absent', () => {
  assert.equal(stableProductId({ gtinUpc: ' ', fdcId: 1234 }), 'fdc:1234');
  assert.throws(() => stableProductId({}), /GTIN or fdcId/);
});

test('normalizeProduct maps bulk nutrient and branded food fields', () => {
  const product = normalizeProduct({
    fdcId: 42,
    gtinUpc: '00123',
    description: '  Oat Drink ',
    brandOwner: 'Example Foods',
    brandedFoodCategory: 'Plant Based Milk',
    publicationDate: '2025-04-24',
    modifiedDate: '2025-04-20',
    foodNutrients: [
      { nutrient: { number: '208', name: 'Energy', unitName: 'KCAL' }, amount: 50 },
      { nutrientNumber: '203', nutrientName: 'Protein', unitName: 'G', value: 1.25 },
    ],
  });

  assert.equal(product.productId, 'gtin:123');
  assert.equal(product.gtinUpc, '123');
  assert.equal(product.description, 'Oat Drink');
  assert.equal(product.rawCategory, 'Plant Based Milk');
  assert.deepEqual(product.nutrients, [
    { number: '203', name: 'Protein', unit: 'G', amount: 1.25 },
    { number: '208', name: 'Energy', unit: 'KCAL', amount: 50 },
  ]);
});


test('isoDate converts bulk MM/DD/YYYY and keeps API ISO dates', async () => {
  const { isoDate } = await import('../src/products/normalize.ts');
  assert.equal(isoDate('11/13/2020'), '2020-11-13');
  assert.equal(isoDate('2026-10-22'), '2026-10-22');
  assert.equal(isoDate('not a date'), null);
});
