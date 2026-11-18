export const AISLES = [
  'Dairy & Eggs',
  'Bakery',
  'Snacks',
  'Beverages',
  'Frozen',
  'Meat & Seafood',
  'Produce',
  'Pantry Staples',
  'Condiments & Sauces',
  'Breakfast & Cereal',
  'Candy & Sweets',
  'Baby',
  'Pet',
  'Health & Supplements',
  'Deli & Prepared',
  'Pasta & Noodles',
  'Canned & Jarred',
  'Baking',
  'International',
  'Alcohol',
  'Household',
  'Personal Care',
  'Other',
] as const;

export type Aisle = typeof AISLES[number];

