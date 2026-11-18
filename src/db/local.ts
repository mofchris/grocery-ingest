import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { config } from '../config.ts';

function executable(name: string): string {
  return join(config.pgBin, process.platform === 'win32' ? `${name}.exe` : name);
}

function run(name: string, args: string[], accept: number[] = [0]): string {
  const result = spawnSync(executable(name), args, { encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (!accept.includes(result.status ?? -1)) {
    throw new Error(`${name} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

export function startDatabase(): void {
  const status = spawnSync(executable('pg_ctl'), ['status', '-D', config.pgDataDir], { windowsHide: true });
  if (status.status === 0) return;
  const started = spawnSync(executable('pg_ctl'), ['start', '-D', config.pgDataDir, '-l', join(config.pgDataDir, 'postgres.log'), '-o', '-p 5433', '-w'], { stdio: 'ignore', windowsHide: true });
  if (started.error) throw started.error;
  if (started.status !== 0) throw new Error(`pg_ctl start failed (${started.status}); see postgres.log`);
}

export function initDatabase(): void {
  mkdirSync(dirname(config.pgDataDir), { recursive: true });
  if (!existsSync(join(config.pgDataDir, 'PG_VERSION'))) {
    run('initdb', ['-A', 'trust', '-U', 'postgres', '-E', 'UTF8', '--no-locale', '-D', config.pgDataDir]);
  }
  startDatabase();
  const exists = run('psql', ['-h', 'localhost', '-p', '5433', '-U', 'postgres', '-d', 'postgres', '-tAc', "SELECT 1 FROM pg_database WHERE datname='grocery'"]);
  if (exists !== '1') run('createdb', ['-h', 'localhost', '-p', '5433', '-U', 'postgres', 'grocery']);
}

export function stopDatabase(): void {
  run('pg_ctl', ['stop', '-D', config.pgDataDir, '-m', 'fast', '-w'], [0, 3]);
}

