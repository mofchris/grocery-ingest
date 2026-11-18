import type { NormalizedProduct, Nutrient, RawFood } from './types.ts';

function text(value: unknown): string | null {
  if (typeof value !== 'string') return value == null ? null : String(value);
  const trimmed = value.trim();
  return trimmed || null;
}

function number(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function normalizeGtin(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const stripped = raw.replace(/^0+/, '');
  return stripped || '0';
}

export function stableProductId(raw: RawFood): string {
  const gtin = normalizeGtin(raw.gtinUpc);
  if (gtin) return `gtin:${gtin}`;
  const fdcId = number(raw.fdcId);
  if (fdcId != null) return `fdc:${Math.trunc(fdcId)}`;
  throw new Error('Product requires GTIN or fdcId');
}

function normalizeNutrient(value: unknown): Nutrient | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const nested = item.nutrient && typeof item.nutrient === 'object'
    ? item.nutrient as Record<string, unknown>
    : {};
  const nutrientNumber = text(item.nutrientNumber ?? item.number ?? nested.number ?? item.nutrientId ?? nested.id);
  if (!nutrientNumber) return null;
  return {
    number: nutrientNumber,
    name: text(item.nutrientName ?? item.name ?? nested.name),
    unit: text(item.unitName ?? item.unit ?? nested.unitName),
    amount: number(item.value ?? item.amount),
  };
}

function normalizeNutrients(value: unknown): Nutrient[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeNutrient)
    .filter((item): item is Nutrient => item !== null)
    .sort((a, b) => a.number.localeCompare(b.number, 'en', { numeric: true }));
}

export function normalizeProduct(raw: RawFood): NormalizedProduct {
  const fdcId = number(raw.fdcId);
  if (fdcId == null) throw new Error('Product requires fdcId');
  return {
    productId: stableProductId(raw),
    gtinUpc: normalizeGtin(raw.gtinUpc),
    fdcId: Math.trunc(fdcId),
    description: text(raw.description),
    brandOwner: text(raw.brandOwner),
    brandName: text(raw.brandName),
    ingredients: text(raw.ingredients),
    rawCategory: text(raw.brandedFoodCategory),
    packageWeight: text(raw.packageWeight),
    servingSize: number(raw.servingSize),
    servingSizeUnit: text(raw.servingSizeUnit),
    householdServingFullText: text(raw.householdServingFullText),
    nutrients: normalizeNutrients(raw.foodNutrients),
    publicationDate: text(raw.publicationDate),
    modifiedDate: text(raw.modifiedDate ?? raw.availableDate),
  };
}

