import type pg from 'pg';

import { contentHash } from '../products/hash.ts';
import type { NormalizedProduct } from '../products/types.ts';

export type MergeCounts = { seen: number; new: number; changed: number; unchanged: number; missing: number };

export async function createRun(pool: pg.Pool, source: string, kind: string): Promise<number> {
  const result = await pool.query<{ id: string }>(
    'INSERT INTO runs(source, kind) VALUES ($1, $2) RETURNING id',
    [source, kind],
  );
  return Number(result.rows[0]!.id);
}

function recency(product: NormalizedProduct): string {
  return product.modifiedDate ?? product.publicationDate ?? '';
}

function newestPerProduct(products: NormalizedProduct[]): NormalizedProduct[] {
  const chosen = new Map<string, NormalizedProduct>();
  for (const product of products) {
    const current = chosen.get(product.productId);
    if (!current || recency(product) > recency(current)
      || (recency(product) === recency(current) && product.fdcId > current.fdcId)) {
      chosen.set(product.productId, product);
    }
  }
  return [...chosen.values()];
}

export async function stageProducts(pool: pg.Pool, runId: number, input: NormalizedProduct[]): Promise<void> {
  const products = newestPerProduct(input);
  if (!products.length) return;
  const values: unknown[] = [];
  const rows = products.map((product, index) => {
    const offset = index * 17;
    values.push(
      runId, product.productId, product.gtinUpc, product.fdcId, product.description,
      product.brandOwner, product.brandName, product.ingredients, product.rawCategory,
      product.packageWeight, product.servingSize, product.servingSizeUnit,
      product.householdServingFullText, JSON.stringify(product.nutrients), contentHash(product),
      product.publicationDate, product.modifiedDate,
    );
    return `(${Array.from({ length: 17 }, (_, i) => `$${offset + i + 1}`).join(',')})`;
  });
  await pool.query(`
    INSERT INTO ingest_staging (
      run_id, product_id, gtin_upc, fdc_id, description, brand_owner, brand_name,
      ingredients, raw_category, package_weight, serving_size, serving_size_unit,
      household_serving_full_text, nutrients, content_hash, publication_date, modified_date
    ) VALUES ${rows.join(',')}
    ON CONFLICT (run_id, product_id) DO UPDATE SET
      gtin_upc = EXCLUDED.gtin_upc, fdc_id = EXCLUDED.fdc_id,
      description = EXCLUDED.description, brand_owner = EXCLUDED.brand_owner,
      brand_name = EXCLUDED.brand_name, ingredients = EXCLUDED.ingredients,
      raw_category = EXCLUDED.raw_category, package_weight = EXCLUDED.package_weight,
      serving_size = EXCLUDED.serving_size, serving_size_unit = EXCLUDED.serving_size_unit,
      household_serving_full_text = EXCLUDED.household_serving_full_text,
      nutrients = EXCLUDED.nutrients, content_hash = EXCLUDED.content_hash,
      publication_date = EXCLUDED.publication_date, modified_date = EXCLUDED.modified_date
    WHERE COALESCE(EXCLUDED.modified_date, EXCLUDED.publication_date, '-infinity'::date)
      > COALESCE(ingest_staging.modified_date, ingest_staging.publication_date, '-infinity'::date)
      OR (COALESCE(EXCLUDED.modified_date, EXCLUDED.publication_date, '-infinity'::date)
        = COALESCE(ingest_staging.modified_date, ingest_staging.publication_date, '-infinity'::date)
        AND EXCLUDED.fdc_id > ingest_staging.fdc_id)
  `, values);
}

export async function mergeStagedRun(pool: pg.Pool, runId: number, countMissing = false): Promise<MergeCounts> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const seenResult = await client.query<{ count: string }>('SELECT count(*) FROM ingest_staging WHERE run_id = $1', [runId]);
    const result = await client.query<{ inserted: boolean }>(`
      WITH merged AS (
        INSERT INTO products (
          product_id, gtin_upc, fdc_id, description, brand_owner, brand_name, ingredients,
          raw_category, package_weight, serving_size, serving_size_unit,
          household_serving_full_text, nutrients, content_hash, first_seen_run, last_seen_run
        )
        SELECT product_id, gtin_upc, fdc_id, description, brand_owner, brand_name, ingredients,
          raw_category, package_weight, serving_size, serving_size_unit,
          household_serving_full_text, nutrients, content_hash, $1, $1
        FROM ingest_staging WHERE run_id = $1
        ON CONFLICT (product_id) DO UPDATE SET
          gtin_upc = EXCLUDED.gtin_upc, fdc_id = EXCLUDED.fdc_id,
          description = EXCLUDED.description, brand_owner = EXCLUDED.brand_owner,
          brand_name = EXCLUDED.brand_name, ingredients = EXCLUDED.ingredients,
          raw_category = EXCLUDED.raw_category, package_weight = EXCLUDED.package_weight,
          serving_size = EXCLUDED.serving_size, serving_size_unit = EXCLUDED.serving_size_unit,
          household_serving_full_text = EXCLUDED.household_serving_full_text,
          nutrients = EXCLUDED.nutrients, content_hash = EXCLUDED.content_hash,
          last_seen_run = $1, updated_at = now()
        WHERE products.content_hash IS DISTINCT FROM EXCLUDED.content_hash
        RETURNING product_id, content_hash, fdc_id, (xmax = 0) AS inserted
      ), versioned AS (
        INSERT INTO product_versions(product_id, content_hash, fdc_id, run_id)
        SELECT product_id, content_hash, fdc_id, $1 FROM merged
        RETURNING 1
      )
      SELECT inserted FROM merged
    `, [runId]);
    await client.query(`
      UPDATE products p SET last_seen_run = $1
      FROM ingest_staging s
      WHERE s.run_id = $1 AND s.product_id = p.product_id AND p.last_seen_run IS DISTINCT FROM $1
    `, [runId]);
    const missingResult = countMissing
      ? await client.query<{ count: string }>('SELECT count(*) FROM products WHERE last_seen_run <> $1', [runId])
      : { rows: [{ count: '0' }] };
    await client.query('DELETE FROM ingest_staging WHERE run_id = $1', [runId]);
    const inserted = result.rows.filter((row) => row.inserted).length;
    const changed = result.rows.length - inserted;
    const seen = Number(seenResult.rows[0]!.count);
    const counts = { seen, new: inserted, changed, unchanged: seen - inserted - changed, missing: Number(missingResult.rows[0]!.count) };
    await client.query('COMMIT');
    return counts;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function finishRun(
  pool: pg.Pool,
  runId: number,
  status: string,
  counts: Partial<MergeCounts & { failed: number; bytesDownloaded: number; httpStatus: number | null }> = {},
): Promise<void> {
  await pool.query(`
    UPDATE runs SET finished_at = now(), status = $2, http_status = $3,
      bytes_downloaded = $4, records_seen = $5, records_new = $6,
      records_changed = $7, records_unchanged = $8, records_failed = $9,
      records_missing = $10,
      duration_ms = round(extract(epoch FROM (now() - started_at)) * 1000)
    WHERE id = $1
  `, [runId, status, counts.httpStatus ?? null, counts.bytesDownloaded ?? 0, counts.seen ?? 0,
    counts.new ?? 0, counts.changed ?? 0, counts.unchanged ?? 0, counts.failed ?? 0, counts.missing ?? 0]);
}
