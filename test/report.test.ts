import assert from 'node:assert/strict';
import test from 'node:test';

import { formatRuns } from '../src/report.ts';

test('formatRuns calculates skip rate from unchanged over seen', () => {
  const report = formatRuns([{
    id: '7', source: 'snapshot:2026-04-30', kind: 'ingest_snapshot',
    started_at: new Date('2026-11-18T12:00:00Z'), status: 'completed', http_status: null,
    bytes_downloaded: '0', records_seen: '100', records_new: '10', records_changed: '5',
    records_unchanged: '80', records_failed: '5', records_missing: '2', duration_ms: '1234',
  }]);
  assert.match(report, /\| 7 \| 2026-11-18T12:00:00\.000Z \| snapshot:2026-04-30 \| ingest_snapshot \| completed \| — \| 0 \| 100 \| 10 \| 5 \| 80 \| 5 \| 2 \| 80\.0% \| 1234 \|/);
});

test('formatRuns does not invent a percentage for an empty run', () => {
  const report = formatRuns([{
    id: '8', source: 'snapshot:2026-04-30', kind: 'check_snapshot',
    started_at: new Date('2026-11-18T12:00:00Z'), status: 'not_modified', http_status: 304,
    bytes_downloaded: '0', records_seen: '0', records_new: '0', records_changed: '0',
    records_unchanged: '0', records_failed: '0', records_missing: '0', duration_ms: '10',
  }]);
  assert.match(report, /\| — \| 10 \|$/m);
});
