import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyByRule } from '../src/categories/rules.ts';
import { AISLES } from '../src/categories/taxonomy.ts';
import { validateAisle } from '../src/categories/validator.ts';

test('validator accepts only exact taxonomy labels', () => {
  assert.equal(validateAisle('Dairy & Eggs'), 'Dairy & Eggs');
  assert.equal(validateAisle('dairy & eggs'), null);
  assert.equal(validateAisle('Unknown aisle'), null);
  assert.equal(validateAisle(null), null);
  assert.equal(new Set(AISLES).size, AISLES.length);
});

test('rules classify representative grocery category strings', () => {
  const cases = [
    ['Cheese', 'Dairy & Eggs'],
    ['Cookies & Biscuits', 'Bakery'],
    ['Chips, Pretzels & Snacks', 'Snacks'],
    ['Fruit & Vegetable Juice', 'Beverages'],
    ['Frozen Dinners & Entrees', 'Frozen'],
    ['Fish & Seafood', 'Meat & Seafood'],
    ['Canned Vegetables', 'Canned & Jarred'],
    ['Salad Dressing & Mayonnaise', 'Condiments & Sauces'],
    ['Breakfast Cereals', 'Breakfast & Cereal'],
    ['Infant Formula', 'Baby'],
    ['Dog Food', 'Pet'],
    ['Vitamins & Supplements', 'Health & Supplements'],
  ] as const;
  for (const [raw, expected] of cases) assert.equal(classifyByRule(raw), expected, raw);
  assert.equal(classifyByRule('Unmapped Manufacturer Bucket'), null);
});

