import { spawn } from 'node:child_process';

function run(script) {
  return new Promise((resolve, reject) => {
    const npmCli = process.env.npm_execpath;
    const command = npmCli ? process.execPath : 'npm';
    const args = npmCli ? [npmCli, 'run', script] : ['run', script];
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} failed (${signal ?? code})`));
    });
  });
}

for (const script of ['typecheck', 'test']) {
  console.log(`\n==> npm run ${script}`);
  await run(script);
}
