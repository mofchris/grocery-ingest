# AGENTS.md

Contract for coding agents working in this repo. Read `SPEC.md` first; it is the source of truth.

- Stack: TypeScript on Node 24 (run `.ts` directly via type stripping, erasable syntax only), PostgreSQL 16, ESM.
- Definition of done: `npm run check` (typecheck + all tests) passes. Run it before you finish and report its real output.
- Never invent numbers. Records counts, skip rates and eval scores in docs come only from `npm run report` / `npm run eval` output.
- Never put secrets in code, fixtures, logs or commits. Keys live only in `.env` (gitignored). Do not read or print `.env`.
- Keep dependencies minimal; no paid services. Data comes only from the official USDA FDC bulk files and API.
- Large files: always stream (download, unzip, JSON parse). Cache and DB data live outside the repo (`%LOCALAPPDATA%/grocery-ingest`).
- Commits: short imperative subject lines. No AI co-author or attribution trailers of any kind.
- Do not push, create GitHub repos, or change global config.
