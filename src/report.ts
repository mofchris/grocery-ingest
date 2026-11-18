import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type pg from 'pg';

export type RunRow = {
  id: string;
  source: string;
  kind: string;
  started_at: Date;
  status: string;
  http_status: number | null;
  bytes_downloaded: string;
  records_seen: string;
  records_new: string;
  records_changed: string;
  records_unchanged: string;
  records_failed: string;
  records_missing: string;
  duration_ms: string | null;
};

function cell(value: string | number | null): string {
  return value === null || value === '' ? '—' : String(value).replaceAll('|', '\\|');
}

export function formatRuns(rows: RunRow[]): string {
  const lines = [
    '# Measured ingestion runs', '',
    'Generated from the PostgreSQL `runs` table by `npm run report`.', '',
  ];
  if (!rows.length) return `${lines.join('\n')}No runs recorded.\n`;
  lines.push(
    '| ID | Started (UTC) | Source | Kind | Status | HTTP | Bytes | Seen | New | Changed | Unchanged | Failed | Missing | Skip rate | Duration ms |',
    '|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  );
  for (const row of rows) {
    const seen = Number(row.records_seen);
    const skip = seen > 0 ? `${((Number(row.records_unchanged) / seen) * 100).toFixed(1)}%` : '—';
    lines.push(`| ${row.id} | ${row.started_at.toISOString()} | ${cell(row.source)} | ${cell(row.kind)} | ${cell(row.status)} | ${cell(row.http_status)} | ${row.bytes_downloaded} | ${row.records_seen} | ${row.records_new} | ${row.records_changed} | ${row.records_unchanged} | ${row.records_failed} | ${row.records_missing} | ${skip} | ${cell(row.duration_ms)} |`);
  }
  return `${lines.join('\n')}\n`;
}

export async function runReport(pool: pg.Pool): Promise<void> {
  const result = await pool.query<RunRow>(`
    SELECT id, source, kind, started_at, status, http_status, bytes_downloaded,
      records_seen, records_new, records_changed, records_unchanged,
      records_failed, records_missing, duration_ms
    FROM runs ORDER BY id
  `);
  const report = formatRuns(result.rows);
  await mkdir(dirname('docs/runs.md'), { recursive: true });
  await writeFile('docs/runs.md', report);
  console.log(report);
}

