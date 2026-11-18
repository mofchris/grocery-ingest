# grocery-ingest: build spec

An incremental ingestion pipeline for the USDA FoodData Central (FDC) **Branded Foods** dataset
(public domain, US government, official bulk files + official API). TypeScript on Node 24, PostgreSQL 16.

## Sources (verified 2026-11-18)

1. **Bulk snapshots** (no key needed):
   `https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_json_<DATE>.zip`
   Known releases: `2025-04-24`, `2025-12-18`, `2026-04-30` (each ~204 MB zipped; server returns
   `ETag` and `Last-Modified`, so conditional GET with `If-None-Match` / `If-Modified-Since` works).
   The zip holds one JSON file shaped `{"BrandedFoods":[ {...}, ... ]}` (very large: stream it, never
   `JSON.parse` the whole file). Inspect the real file before finalising field mapping.
2. **API delta** (needs a free api.data.gov key in `.env` as `FDC_API_KEY`; `DEMO_KEY` is limited to ~10 req/h):
   `GET https://api.nal.usda.gov/fdc/v1/foods/list?api_key=..&dataType=Branded&pageSize=200&pageNumber=N&sortBy=publishedDate&sortOrder=desc`
   Records carry `fdcId`, `publicationDate`, `gtinUpc`, `brandOwner`, `description`, `foodNutrients`.
   Cursor = newest `publicationDate` already ingested; page until records are older than the cursor.
   Respect `X-RateLimit-Remaining`; on 429/5xx retry via the queue with backoff.

## Requirements

- **Stable IDs.** FDC issues a new `fdcId` when a branded product is updated. Check this against the
  real snapshots and choose the stable key accordingly (expected: `gtinUpc`, normalised by stripping
  leading zeros, falling back to `fdcId` when GTIN is missing; if one GTIN appears more than once in a
  release, keep the newest `publicationDate`/`modifiedDate`). Document the finding in the README.
- **Content hashing.** sha256 over a canonical JSON of the fields we store (sorted keys, nutrients
  sorted by nutrient number; exclude volatile fields like `fdcId`/dates so a re-published but
  identical product is "unchanged"). Store `content_hash` per product.
- **Idempotent upserts** in batches (~1000 rows, `unnest` arrays or multi-row VALUES):
  `INSERT ... ON CONFLICT (product_id) DO UPDATE ... WHERE products.content_hash IS DISTINCT FROM EXCLUDED.content_hash RETURNING (xmax = 0) AS inserted`
  → counts new vs changed; rows not returned are unchanged (skipped). Also bump `last_seen_run` for
  unchanged rows cheaply (separate UPDATE by id list) so we can count records that disappeared.
  Running the same snapshot twice must produce 0 new, 0 changed.
- **Change history:** `product_versions` table storing (product_id, content_hash, fdc_id, run_id) on
  insert/change only (small, proves what changed).
- **Queue** in Postgres: `jobs(id, kind, payload jsonb, status, attempts, max_attempts, run_after,
  locked_at, last_error, created_at, finished_at)`. Workers claim with
  `SELECT ... FOR UPDATE SKIP LOCKED`. Failure → `attempts+1`, `run_after = now() + base * 2^attempts + jitter`
  (cap), status `dead` after max_attempts. Job kinds: `check_snapshot` (conditional GET, on change
  enqueue `ingest_snapshot`), `ingest_snapshot`, `api_delta_page`, `categorize`.
- **Source state:** `source_state(source, etag, last_modified, cursor, updated_at)`; conditional GET
  304 → run recorded as `not_modified`, nothing downloaded.
- **Scheduler:** `npm run scheduler` = long-running process that enqueues `check_snapshot` (and
  `api_delta` if key present) on an interval (default every 24h, configurable) and runs the worker.
  Also document a Windows Task Scheduler / cron one-liner for `npm run sync` (one-shot).
- **Metrics per run:** `runs(id, source, kind, started_at, finished_at, status, http_status,
  bytes_downloaded, records_seen, records_new, records_changed, records_unchanged, records_failed,
  records_missing, duration_ms)`. `npm run report` prints a table of runs (skip rate =
  unchanged/seen) and writes `docs/runs.md` from the DB (this is how README numbers are produced:
  never type numbers by hand).
- **Downloads cache** outside the repo: `%LOCALAPPDATA%/grocery-ingest/cache` (env `CACHE_DIR`),
  streamed to disk, read with a streaming zip reader + streaming JSON parser. A downloaded zip is
  ingested from disk; keep it so tests/re-runs don't re-download.
- **AI step (category normalisation only).** `brandedFoodCategory` is free text from manufacturers
  (a few hundred distinct values, messy). Map each *distinct raw string* to a fixed taxonomy of
  ~20-25 grocery aisles (define in `src/categories/taxonomy.ts`, e.g. Dairy & Eggs, Bakery, Snacks,
  Beverages, Frozen, Meat & Seafood, Produce, Pantry Staples, Condiments & Sauces, Breakfast & Cereal,
  Candy & Sweets, Baby, Pet, Health & Supplements, Deli & Prepared, Other).
  1. Rule-based classifier first (keyword rules) → `source='rule'`.
  2. Unmatched strings → Claude API (`@anthropic-ai/sdk`, model `claude-haiku-5-5`, key from
     `ANTHROPIC_API_KEY` in `.env`), batched (~50 strings per call), JSON output, temperature 0.
  3. **Validator** rejects any label not in the taxonomy (retry once, then `Other` + flagged).
  4. Cache in `category_map(raw_category PK, aisle, source, model, created_at)` so AI only runs on
     never-seen strings. Products join to it; never call AI per product.
  5. **Eval set** `eval/categories.gold.jsonl` (~80 real raw strings from the data, hand-labelled,
     include hard/ambiguous ones). `npm run eval` reports accuracy for rules-only, AI-only and the
     combined pipeline, plus confusion of mistakes, writes `docs/eval.md`. Unit test asserts the
     combined accuracy on the gold set ≥ a threshold using a **recorded** fixture of AI answers
     (`eval/ai-responses.fixture.json`) so CI needs no key. Without a key, AI step is skipped
     gracefully (records stay `uncategorised`).
- **Respectful fetching:** User-Agent `grocery-ingest/0.1 (+https://github.com/mofchris/grocery-ingest)`,
  one request at a time to the API, honour rate-limit headers. No personal data exists in this dataset.

## Layout / tooling

- Node 24 runs `.ts` directly (type stripping): use `node src/cli.ts <cmd>`; erasable TS only
  (no enums/namespaces/parameter properties). `tsc --noEmit` for typecheck. ESM.
- Deps (keep minimal): `pg`, `yauzl` (or `unzipper`), `stream-json`, `@anthropic-ai/sdk`, `dotenv`
  (or `process.loadEnvFile`). Dev: `typescript`, `@types/node`, `@types/pg`. Tests: `node --test`.
- Migrations: plain SQL files in `migrations/` applied in order by `npm run migrate` (tracked in a
  `schema_migrations` table).
- Local DB with **no password**: `npm run db:init` creates a cluster with
  `initdb -A trust -U postgres -D %LOCALAPPDATA%/grocery-ingest/pgdata` and `pg_ctl start -o "-p 5433"`
  (binaries from `PG_BIN`, default `C:/Program Files/PostgreSQL/16/bin`). `DATABASE_URL` default
  `postgres://postgres@localhost:5433/grocery`.
- npm scripts: `db:init`, `db:start`, `db:stop`, `migrate`, `sync` (check snapshot + delta, run
  worker until queue empty), `ingest -- --snapshot 2025-04-24` (enqueue + run a specific release),
  `worker`, `scheduler`, `categorize`, `eval`, `report`, `test`, `typecheck`, `check`.
- `tools/check.mjs` = definition of done: typecheck + tests (`npm run check`).
- Tests (`test/`): hashing determinism & volatile-field exclusion; stable-ID normalisation; upsert
  idempotency against a real Postgres (new → changed → unchanged counts on a small fixture JSON zip
  built in the test); queue backoff/retry/dead-letter; conditional GET 304 path (local `http`
  server); taxonomy validator; eval threshold with fixture. DB tests use `DATABASE_URL` and skip
  with a message if unreachable.
- CI: `.github/workflows/ci.yml` on push/PR: Postgres 16 service, `npm ci`, migrate, `npm run check`.
- `.env.example` (no real values), `.gitignore` (.env, node_modules, cache, pgdata).
- README: what it is, architecture diagram (ASCII/mermaid), how incremental works, how to run,
  **Measured results** section filled from `docs/runs.md` only, eval results, honest limits.
