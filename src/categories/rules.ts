import type { Aisle } from './taxonomy.ts';

const RULES: ReadonlyArray<readonly [RegExp, Aisle]> = [
  [/\b(infant|baby|toddler|formula)\b/i, 'Baby'],
  [/\b(dog|cat|pet|canine|feline)\b/i, 'Pet'],
  [/\b(vitamin|supplement|protein powder|nutrition bar|meal replacement|electrolyte)\b/i, 'Health & Supplements'],
  [/\b(frozen|ice cream|sorbet|frozen yogurt)\b/i, 'Frozen'],
  [/\b(beer|wine|liquor|spirits|alcohol|cocktail)\b/i, 'Alcohol'],
  [/\b(milk|cheese|yogurt|butter|cream|egg|dairy)\b/i, 'Dairy & Eggs'],
  [/\b(bread|bun|roll|bakery|cake|cupcake|cookies?|biscuits?|pastr|donut|doughnut|muffin|bagel|tortilla)\b/i, 'Bakery'],
  [/\b(chip|pretzel|popcorn|snack|cracker|nut|seed)\b/i, 'Snacks'],
  [/\b(candy|chocolate|gum|confection|sweet|marshmallow|caramel)\b/i, 'Candy & Sweets'],
  [/\b(coffee|tea|juice|drink|beverage|soda|water|nectar|smoothie|energy drink)\b/i, 'Beverages'],
  [/\b(fish|seafood|shrimp|salmon|tuna|meat|beef|pork|chicken|turkey|sausage|bacon)\b/i, 'Meat & Seafood'],
  [/\b(canned|jarred|pickle|olive|preserve)\b/i, 'Canned & Jarred'],
  [/\b(fruit|vegetable|produce|salad green|fresh herb)\b/i, 'Produce'],
  [/\b(cereal|granola|oatmeal|breakfast|pancake|waffle)\b/i, 'Breakfast & Cereal'],
  [/\b(ketchup|mustard|mayonnaise|dressing|sauce|salsa|relish|condiment|marinade|vinegar)\b/i, 'Condiments & Sauces'],
  [/\b(pasta|noodle|macaroni|spaghetti|ravioli)\b/i, 'Pasta & Noodles'],
  [/\b(flour|baking|yeast|frosting|cake mix|brownie mix)\b/i, 'Baking'],
  [/\b(deli|prepared|ready.?to.?eat|sandwich|pizza|meal|entree|soup)\b/i, 'Deli & Prepared'],
  [/\b(rice|bean|lentil|grain|oil|sugar|salt|spice|seasoning|pantry)\b/i, 'Pantry Staples'],
  [/\b(asian|mexican|indian|italian|international|kosher)\b/i, 'International'],
  [/\b(detergent|cleaner|paper towel|trash bag|household)\b/i, 'Household'],
  [/\b(shampoo|soap|toothpaste|deodorant|personal care)\b/i, 'Personal Care'],
];

export function classifyByRule(rawCategory: string): Aisle | null {
  const normalized = rawCategory.trim();
  if (!normalized) return null;
  const singularized = normalized.replace(/\b([a-z]+)ies\b/gi, '$1y').replace(/\b([a-z]{3,})s\b/gi, '$1');
  const searchable = `${normalized} ${singularized}`;
  return RULES.find(([pattern]) => pattern.test(searchable))?.[1] ?? null;
}
