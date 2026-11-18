CREATE TABLE IF NOT EXISTS runs (
  id bigserial PRIMARY KEY,
  source text NOT NULL,
  kind text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  http_status integer,
  bytes_downloaded bigint NOT NULL DEFAULT 0,
  records_seen bigint NOT NULL DEFAULT 0,
  records_new bigint NOT NULL DEFAULT 0,
  records_changed bigint NOT NULL DEFAULT 0,
  records_unchanged bigint NOT NULL DEFAULT 0,
  records_failed bigint NOT NULL DEFAULT 0,
  records_missing bigint NOT NULL DEFAULT 0,
  duration_ms bigint
);

CREATE TABLE IF NOT EXISTS products (
  product_id text PRIMARY KEY,
  gtin_upc text,
  fdc_id bigint NOT NULL,
  description text,
  brand_owner text,
  brand_name text,
  ingredients text,
  raw_category text,
  package_weight text,
  serving_size double precision,
  serving_size_unit text,
  household_serving_full_text text,
  nutrients jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_hash char(64) NOT NULL,
  first_seen_run bigint NOT NULL REFERENCES runs(id),
  last_seen_run bigint NOT NULL REFERENCES runs(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_raw_category_idx ON products(raw_category) WHERE raw_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_last_seen_run_idx ON products(last_seen_run);

CREATE TABLE IF NOT EXISTS product_versions (
  id bigserial PRIMARY KEY,
  product_id text NOT NULL,
  content_hash char(64) NOT NULL,
  fdc_id bigint NOT NULL,
  run_id bigint NOT NULL REFERENCES runs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, run_id)
);
CREATE INDEX IF NOT EXISTS product_versions_product_idx ON product_versions(product_id, id);

CREATE TABLE IF NOT EXISTS ingest_staging (
  run_id bigint NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  gtin_upc text,
  fdc_id bigint NOT NULL,
  description text,
  brand_owner text,
  brand_name text,
  ingredients text,
  raw_category text,
  package_weight text,
  serving_size double precision,
  serving_size_unit text,
  household_serving_full_text text,
  nutrients jsonb NOT NULL,
  content_hash char(64) NOT NULL,
  publication_date date,
  modified_date date,
  PRIMARY KEY (run_id, product_id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('check_snapshot', 'ingest_snapshot', 'api_delta_page', 'categorize')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'dead')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs(status, run_after, id);

CREATE TABLE IF NOT EXISTS source_state (
  source text PRIMARY KEY,
  etag text,
  last_modified text,
  cursor text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS category_map (
  raw_category text PRIMARY KEY,
  aisle text NOT NULL,
  source text NOT NULL CHECK (source IN ('rule', 'ai', 'fallback')),
  model text,
  flagged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

