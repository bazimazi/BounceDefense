import { spawn } from 'node:child_process';
import path from 'node:path';

const engines = process.env.ENGINE ? [process.env.ENGINE] : ['chromium', 'firefox', 'webkit'];
async function run(script, engine, extra = {}) {
  const suffix = extra.UI_LANG ? `-${extra.UI_LANG}` : '';
  const env = { ...process.env, ENGINE: engine, SHOTS: path.join(process.env.SHOTS ?? 'smoke-shots/ui-audit', engine + suffix), ...extra };
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', `scripts/${script}.mjs`], { env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${engine} ${script} exited with ${code}`)));
  });
}
const results = await Promise.allSettled(engines.map(async engine => {
  await run('ui-audit', engine);
  await run('game-flow', engine);
  await run('back-check', engine);
  await run('motion-check', engine);
  await run('aim-check', engine);
  // Persian: the same layout audit right-to-left, then the language flow itself.
  await run('ui-audit', engine, { UI_LANG: 'fa' });
  await run('i18n-check', engine);
}));
for (const result of results) if (result.status === 'rejected') console.error(result.reason.message);
if (results.some(result => result.status === 'rejected')) process.exitCode = 1;
else console.log(`UI and gameplay checks passed in ${engines.join(', ')}.`);
