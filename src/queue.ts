import type pg from 'pg';

export type JobKind = 'check_snapshot' | 'ingest_snapshot' | 'api_delta_page' | 'categorize';
export type JobStatus = 'queued' | 'running' | 'done' | 'dead';

export type Job = {
  id: number;
  kind: JobKind;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAfter: Date | null;
  lockedAt: Date | null;
  lastError: string | null;
};

type JobRow = {
  id: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_after: Date | null;
  locked_at: Date | null;
  last_error: string | null;
};

function mapJob(row: JobRow): Job {
  return {
    id: Number(row.id), kind: row.kind, payload: row.payload, status: row.status,
    attempts: row.attempts, maxAttempts: row.max_attempts, runAfter: row.run_after,
    lockedAt: row.locked_at, lastError: row.last_error,
  };
}

export async function enqueueJob(
  pool: pg.Pool,
  kind: JobKind,
  payload: Record<string, unknown>,
  options: { maxAttempts?: number; runAfter?: Date } = {},
): Promise<number> {
  const result = await pool.query<{ id: string }>(`
    INSERT INTO jobs(kind, payload, max_attempts, run_after)
    VALUES ($1, $2::jsonb, $3, $4) RETURNING id
  `, [kind, JSON.stringify(payload), options.maxAttempts ?? 5, options.runAfter ?? new Date()]);
  return Number(result.rows[0]!.id);
}

export async function claimJob(pool: pg.Pool): Promise<Job | null> {
  const result = await pool.query<JobRow>(`
    WITH candidate AS (
      SELECT id FROM jobs
      WHERE status = 'queued' AND run_after <= now()
      ORDER BY run_after, id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE jobs j SET status = 'running', locked_at = now()
    FROM candidate c WHERE j.id = c.id
    RETURNING j.*
  `);
  return result.rows[0] ? mapJob(result.rows[0]) : null;
}

export async function completeJob(pool: pg.Pool, id: number): Promise<void> {
  await pool.query(`
    UPDATE jobs SET status = 'done', finished_at = now(), locked_at = NULL
    WHERE id = $1 AND status = 'running'
  `, [id]);
}

export async function failJob(
  pool: pg.Pool,
  job: Job,
  error: unknown,
  options: { baseMs?: number; capMs?: number; jitterMs?: number } = {},
): Promise<Job> {
  const attempts = job.attempts + 1;
  const dead = attempts >= job.maxAttempts;
  const baseMs = options.baseMs ?? 1000;
  const capMs = options.capMs ?? 3_600_000;
  const exponential = Math.min(capMs, baseMs * (2 ** job.attempts));
  const jitterMs = options.jitterMs ?? Math.floor(Math.random() * Math.max(1, exponential * 0.2));
  const next = dead ? null : new Date(Date.now() + exponential + jitterMs);
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 4000);
  const result = await pool.query<JobRow>(`
    UPDATE jobs SET status = $2, attempts = $3, run_after = COALESCE($4, run_after),
      locked_at = NULL, last_error = $5, finished_at = CASE WHEN $2 = 'dead' THEN now() ELSE NULL END
    WHERE id = $1 AND status = 'running'
    RETURNING *
  `, [job.id, dead ? 'dead' : 'queued', attempts, next, message]);
  if (!result.rows[0]) throw new Error(`Job ${job.id} is not running`);
  const mapped = mapJob(result.rows[0]);
  if (dead) mapped.runAfter = null;
  return mapped;
}

export async function runnableJobCount(pool: pg.Pool): Promise<number> {
  const result = await pool.query<{ count: string }>(
    "SELECT count(*) FROM jobs WHERE status = 'queued' AND run_after <= now()",
  );
  return Number(result.rows[0]!.count);
}
