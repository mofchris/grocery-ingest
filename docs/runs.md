# Measured ingestion runs

Generated from the PostgreSQL `runs` table by `npm run report`.

| ID | Started (UTC) | Source | Kind | Status | HTTP | Bytes | Seen | New | Changed | Unchanged | Failed | Missing | Skip rate | Duration ms |
|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 2026-11-18T13:30:18.188Z | snapshot:2025-04-24 | ingest_snapshot | completed | — | 0 | 452998 | 432992 | 0 | 0 | 0 | 0 | 0.0% | 419491 |
| 2 | 2026-11-18T13:37:18.955Z | snapshot:2025-12-18 | ingest_snapshot | completed | — | 0 | 454366 | 741 | 29346 | 403646 | 0 | 0 | 93.1% | 536594 |
| 3 | 2026-11-18T13:46:16.776Z | snapshot:2026-04-30 | ingest_snapshot | completed | — | 0 | 455458 | 287 | 5311 | 426961 | 0 | 1461 | 98.7% | 635916 |
| 4 | 2026-11-18T13:56:54.650Z | snapshot:2026-04-30 | check_snapshot | failed | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | 85 |
| 5 | 2026-11-18T13:56:56.268Z | snapshot:2026-04-30 | check_snapshot | failed | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | 63 |
| 6 | 2026-11-18T13:56:56.336Z | snapshot:2026-04-30 | check_snapshot | failed | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | 4 |
| 7 | 2026-11-18T13:56:57.795Z | snapshot:2026-04-30 | check_snapshot | failed | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | 59 |
| 8 | 2026-11-18T13:56:57.860Z | snapshot:2026-04-30 | check_snapshot | failed | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | 4 |
| 9 | 2026-11-18T14:03:03.866Z | snapshot:2026-04-30 | check_snapshot | downloaded | 200 | 204270542 | 0 | 0 | 0 | 0 | 0 | 0 | — | 99290 |
| 10 | 2026-11-18T14:04:43.200Z | snapshot:2026-04-30 | check_snapshot | unchanged_file | 200 | 204270542 | 0 | 0 | 0 | 0 | 0 | 0 | — | 67943 |
| 11 | 2026-11-18T14:05:51.149Z | snapshot:2026-04-30 | check_snapshot | not_modified | 304 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | 200 |
| 12 | 2026-11-18T14:05:51.352Z | snapshot:2026-04-30 | check_snapshot | not_modified | 304 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | 243 |
| 13 | 2026-11-18T14:05:51.597Z | snapshot:2026-04-30 | ingest_snapshot | completed | — | 0 | 455458 | 0 | 0 | 432559 | 0 | 1461 | 100.0% | 1512391 |
| 14 | 2026-11-18T14:31:05.848Z | snapshot:2026-04-30 | check_snapshot | not_modified | 304 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1077 |
| 15 | 2026-11-18T14:31:08.754Z | snapshot:2026-04-30 | check_snapshot | not_modified | 304 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | 966 |
