-- USDA serves the bulk files from several nginx backends that each report a different ETag
-- (and Last-Modified) for the same bytes. Remember every ETag seen for the current file and the
-- file's sha256, so a new backend's ETag never triggers a re-ingest of identical data.
ALTER TABLE source_state ADD COLUMN IF NOT EXISTS known_etags text[] NOT NULL DEFAULT '{}';
ALTER TABLE source_state ADD COLUMN IF NOT EXISTS file_sha256 text;
