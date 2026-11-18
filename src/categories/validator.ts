import { AISLES, type Aisle } from './taxonomy.ts';

const allowed = new Set<string>(AISLES);

export function validateAisle(value: unknown): Aisle | null {
  return typeof value === 'string' && allowed.has(value) ? value as Aisle : null;
}

