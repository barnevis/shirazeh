// Runs both browser spikes against the installed engines.
//   npm run spikes                 -> chromium only
//   npm run spikes -- firefox webkit  -> specific engines
//   npm run spikes -- --all        -> chromium, firefox and webkit
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);

let failed = false;
for (const spike of ['svg-use-spike.js', 'css-attach-spike.js']) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(spike, import.meta.url)), ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  failed = failed || result.status !== 0;
}

process.exitCode = failed ? 1 : 0;
