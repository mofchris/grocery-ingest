export type RawFood = Record<string, unknown>;

export type Nutrient = {
  number: string;
  name: string | null;
  unit: string | null;
  amount: number | null;
};

export type NormalizedProduct = {
  productId: string;
  gtinUpc: string | null;
  fdcId: number;
  description: string | null;
  brandOwner: string | null;
  brandName: string | null;
  ingredients: string | null;
  rawCategory: string | null;
  packageWeight: string | null;
  servingSize: number | null;
  servingSizeUnit: string | null;
  householdServingFullText: string | null;
  nutrients: Nutrient[];
  publicationDate: string | null;
  modifiedDate: string | null;
};

