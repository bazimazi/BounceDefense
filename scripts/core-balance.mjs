// Core balance matrix: every ball core at eight stages of the journey (npm run balance with the kit a player
// plausibly holds there), run in parallel, then each core's deviation from the stage average, overall, early
// (Veteran to Abyss) and late (Oblivion to Eternity A30). A core within about ±5 points is balanced at the
// default 24 runs per cell (one cell has a standard error near 10 points; the averages near 3.5).
//
//   npm run balance:cores -- [runs=24] [cores=striker,pyro,...] [stages=vet,night,...]
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const [runs = '24', coresArg, stagesArg] = process.argv.slice(2);
const everything = '--meta end --od 50 --bp 9 --refit 10 --research 9 --tp 100 --tpwin 9 --awaken 5 --full';
const STAGES = {
  vet: '--diff 1 --meta none',
  night: '--diff 2 --meta none',
  inferno: '--diff 3 --meta mid',
  abyss: '--diff 4 --meta max --bp 3 --research 3 --full',
  oblivion: '--diff 5 --meta end --od 12 --bp 3 --refit 3 --research 4 --tp 30 --full',
  singul: '--diff 7 --meta end --od 35 --bp 6 --refit 6 --research 6 --tp 50 --full',
  eternity: '--diff 9 --meta end --od 45 --bp 8 --refit 8 --research 8 --tp 70 --full',
  a30: `--diff 9 --asc 30 ${everything}`,
};
const EARLY = ['vet', 'night', 'inferno', 'abyss'];
const cores = (coresArg ?? 'striker,pyro,tesla,cryo,blood,void,venom,titan,gemini,chrono,blast').split(',');
const stages = stagesArg ? stagesArg.split(',') : Object.keys(STAGES);
const jobs = stages.flatMap((st) => cores.map((c) => ({ st, c })));
const res = {};
const run = ({ st, c }) => new Promise((resolve) => {
  const p = spawn(process.execPath, ['--import', 'tsx', 'scripts/balance.ts', '--core', c, '--runs', runs, ...STAGES[st].split(' ')], { cwd: root });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.on('close', () => {
    (res[st] ??= {})[c] = Number(out.match(/win\s+(\d+)%/)?.[1] ?? NaN);
    process.stderr.write('.');
    resolve();
  });
});
let next = 0;
await Promise.all(Array.from({ length: Math.max(1, os.cpus().length - 1) }, async () => { while (next < jobs.length) await run(jobs[next++]); }));
process.stderr.write('\n');
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const dev = Object.fromEntries(cores.map((c) => [c, {}]));
const lines = [['stage', ...cores.map((c) => c.slice(0, 6)), 'mean'].join('\t')];
for (const st of stages) {
  const row = cores.map((c) => res[st][c]);
  const mean = avg(row);
  cores.forEach((c, k) => { dev[c][st] = row[k] - mean; });
  lines.push([st, ...row, mean.toFixed(0)].join('\t'));
}
const line = (label, pick) => [label, ...cores.map((c) => avg(stages.filter(pick).map((st) => dev[c][st])).toFixed(1))].join('\t');
lines.push(line('dev all', () => true), line('dev early', (st) => EARLY.includes(st)), line('dev late', (st) => !EARLY.includes(st)));
console.log(lines.join('\n'));
