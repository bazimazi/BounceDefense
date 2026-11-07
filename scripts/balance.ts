/**
 * Balance matrix with a human-like autoplayer. Unlike `npm run sim` (which samples angles with the
 * aim tracer), this bot aims straight at the most advanced threat with some noise, reacts every
 * 0.25-0.6 s, holds a third of its shots into the power window and fires Surge when ready.
 * It approximates a decent casual player and is the reference for difficulty tuning.
 *
 *   npm run balance -- --runs 16 --core striker,pyro --arena proving --diff 0,1,2 [--meta none|mid|max]
 *                      [--workshop '{"hull":3}'] [--talents '{"hull":3}'] [--pacts haste] [--full] [--tutorial]
 *
 * Meta presets: `mid` is roughly ten runs in (half the Workshop, 6 talent points); `max` is the
 * complete Workshop with 15 talent points. Reference results (16 runs, proving):
 *   none: Normal ~85%, Veteran ~70%, Nightmare ~45%      mid: Veteran ~90%, Nightmare ~70%, Inferno ~50%
 *   max:  Nightmare ~95%, Inferno ~85%, Abyss ~65%
 */
import { Rng } from '../src/core/rng';
import { botChoose, defaultConfig, FULL_POOL } from '../src/sim/bot';
import { LAUNCHER_X, LAUNCHER_Y, SIM_DT } from '../src/sim/types';
import { World, type RunConfig } from '../src/sim/world';

const META: Record<string, { workshop: Record<string, number>; talents: Record<string, number> }> = {
  none: { workshop: {}, talents: {} },
  mid: {
    workshop: { hull: 3, calibration: 3, optics: 2, overclock: 1, primer: 1, study: 2, head_start: 1 },
    talents: { hull: 3, bankcraft: 3 },
  },
  max: {
    workshop: { hull: 5, calibration: 5, optics: 4, overclock: 3, primer: 3, head_start: 1, spare_ball: 1, study: 4, salvage: 5 },
    talents: { hull: 3, plating: 3, recovery: 2, repulsion: 2, last_bastion: 1, bankcraft: 3, flow: 1 },
  },
};

function humanStep(w: World, rng: Rng, react: { t: number }, noise: number): void {
  react.t -= SIM_DT;
  if (react.t > 0) return;
  react.t = rng.range(0.25, 0.6);
  if (w.canSurge() && rng.chance(0.5)) w.activateSurge();
  if (w.hand <= 0 || w.launchQueue > 0 || w.aim.active) return;
  let best: { x: number; y: number } | null = null;
  let bs = -Infinity;
  for (const e of w.enemies) {
    if (!e.alive || e.y < 100) continue;
    const s = (e.boss ? 400 : 0) + e.y + (e.elite.length ? 80 : 0);
    if (s > bs) { bs = s; best = e; }
  }
  const tx = best ? best.x + rng.range(-noise, noise) : rng.range(80, 460);
  const ty = best ? best.y : 300;
  w.beginAim();
  w.setAim(tx - LAUNCHER_X, Math.min(ty, LAUNCHER_Y - 10) - LAUNCHER_Y);
  if (rng.chance(0.33)) w.aim.holdTime = 0.7;
  w.release();
}

function play(cfg: RunConfig, maxTime: number, noise: number) {
  const w = new World(cfg);
  const rng = new Rng(cfg.seed ^ 0x5151);
  const react = { t: 0 };
  let minHp = 1;
  while (w.time < maxTime && w.state !== 'over') {
    if (w.state === 'levelup') {
      w.choose(botChoose(w, rng, 'focused'));
      continue;
    }
    humanStep(w, rng, react, noise);
    w.step(SIM_DT);
    minHp = Math.min(minHp, w.hp / w.maxHp);
    w.fx.length = 0;
  }
  return { s: w.summary(), minHp };
}

const args = process.argv.slice(2);
const get = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const runs = Number(get('runs', '12'));
const cores = get('core', 'striker,pyro,tesla').split(',');
const arenas = get('arena', 'proving').split(',');
const diffs = get('diff', '0').split(',').map(Number);
const pacts = get('pacts', '') ? get('pacts', '').split(',') : [];
const meta = META[get('meta', 'none')] ?? META.none;
const workshop = get('workshop', '') ? JSON.parse(get('workshop', '{}')) : meta.workshop;
const talents = get('talents', '') ? JSON.parse(get('talents', '{}')) : meta.talents;
const full = args.includes('--full');
const tutorial = args.includes('--tutorial');
const noise = Number(get('noise', '30'));
const maxTime = Number(get('max', '1200'));

console.log(`Human-like bot, ${runs} runs per cell${full ? ', full upgrade pool' : ''}\n`);
for (const arena of arenas) for (const difficulty of diffs) for (const core of cores) {
  let wins = 0, time = 0, level = 0, minHp = 0, kills = 0;
  const deaths: number[] = [];
  const fights: number[] = [];
  for (let i = 0; i < runs; i++) {
    const cfg = defaultConfig({ seed: 7000 + i * 977, core, arena, difficulty, pacts, tutorial, workshop, talents, ...(full ? { pool: FULL_POOL } : {}) });
    const r = play(cfg, maxTime, noise);
    if (r.s.victory) wins++;
    else deaths.push(Math.round(r.s.time));
    time += r.s.time; level += r.s.level; minHp += r.minHp; kills += r.s.kills;
    fights.push(...r.s.bossFightTimes.map(Math.round));
  }
  deaths.sort((a, b) => a - b);
  fights.sort((a, b) => a - b);
  const median = (xs: number[]) => (xs.length ? `${xs[Math.floor(xs.length / 2)]}s` : '-');
  console.log(
    `${arena.padEnd(8)} d${difficulty} ${core.padEnd(8)} win ${String(Math.round((wins / runs) * 100)).padStart(3)}%  ` +
    `avgTime ${(time / runs).toFixed(0).padStart(4)}s  lvl ${(level / runs).toFixed(1).padStart(4)}  kills ${(kills / runs).toFixed(0).padStart(4)}  ` +
    `minHp ${((minHp / runs) * 100).toFixed(0).padStart(3)}%  medianDeath ${median(deaths).padStart(5)}  medianBossFight ${median(fights).padStart(5)}`,
  );
}
