import { createHash } from 'node:crypto';

import type { NormalizedProduct } from './types.ts';

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
}

export function storedContent(product: NormalizedProduct): Record<string, unknown> {
  return {
    brandName: product.brandName,
    brandOwner: product.brandOwner,
    description: product.description,
    householdServingFullText: product.householdServingFullText,
    ingredients: product.ingredients,
    nutrients: [...product.nutrients].sort((a, b) => a.number.localeCompare(b.number, 'en', { numeric: true })),
    packageWeight: product.packageWeight,
    rawCategory: product.rawCategory,
    servingSize: product.servingSize,
    servingSizeUnit: product.servingSizeUnit,
  };
}

export function contentHash(product: NormalizedProduct): string {
  return createHash('sha256').update(canonical(storedContent(product))).digest('hex');
}
