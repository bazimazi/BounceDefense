/**
 * Balance simulator: runs many headless games with an autoplayer and reports
 * win rates, pacing and which upgrades correlate with success.
 *
 *   npm run sim -- --runs 40 --core pyro --arena foundry --diff 1 --full
 */
import { performance } from 'node:perf_hooks';
import { defaultConfig, FULL_POOL, runHeadless, type BotStrategy } from '../src/sim/bot';

const args = process.argv.slice(2);
const arg = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const runs = Number(arg('runs', '20'));
const cores = arg('core', 'striker,pyro,tesla').split(',');
const arena = arg('arena', 'proving');
const diff = Number(arg('diff', '0'));
const strategy = arg('strategy', 'focused') as BotStrategy;
const full = args.includes('--full');
const tutorial = args.includes('--tutorial');

const pickStats = new Map<string, { picks: number; wins: number }>();
console.log(`Simulating ${runs} runs per core on ${arena} (difficulty ${diff}, ${full ? 'full' : 'default'} pool, ${strategy} bot)\n`);

for (const core of cores) {
  let wins = 0;
  let totalTime = 0;
  let totalLevel = 0;
  let totalKills = 0;
  let bestCombo = 0;
  let evolutions = 0;
  let synergies = 0;
  let deathTimes: number[] = [];
  let reachedBoss = 0;
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) {
    const cfg = defaultConfig({ seed: 1000 + i * 7919, core, arena, difficulty: diff, ...(full ? { pool: FULL_POOL } : {}), tutorial });
    const { summary: s } = runHeadless(cfg, { strategy, maxTime: 1200 });
    if (s.victory) wins++;
    if (s.bossesDefeated.length || s.time >= (tutorial ? 330 : 400)) reachedBoss++;
    else deathTimes.push(s.time);
    totalTime += s.time;
    totalLevel += s.level;
    totalKills += s.kills;
    bestCombo = Math.max(bestCombo, s.bestCombo);
    evolutions += s.evolutions.length;
    synergies += s.synergies.length;
    for (const u of s.upgrades) {
      const p = pickStats.get(u.id) ?? { picks: 0, wins: 0 };
      p.picks++;
      if (s.victory) p.wins++;
      pickStats.set(u.id, p);
    }
  }
  const ms = performance.now() - t0;
  deathTimes = deathTimes.sort((a, b) => a - b);
  const median = deathTimes.length ? deathTimes[Math.floor(deathTimes.length / 2)] : 0;
  console.log(
    `${core.padEnd(8)} win ${((wins / runs) * 100).toFixed(0).padStart(3)}%  avgTime ${(totalTime / runs).toFixed(0).padStart(4)}s  ` +
      `medianDeath ${median.toFixed(0).padStart(4)}s  lvl ${(totalLevel / runs).toFixed(1)}  kills ${(totalKills / runs).toFixed(0)}  ` +
      `reachBoss ${((reachedBoss / runs) * 100).toFixed(0)}%  bestCombo ${bestCombo}  evo/run ${(evolutions / runs).toFixed(2)}  syn/run ${(synergies / runs).toFixed(2)}  (${(ms / runs).toFixed(0)}ms/run)`,
  );
}

console.log('\nUpgrade pick -> win correlation (min 5 picks):');
[...pickStats.entries()]
  .filter(([, p]) => p.picks >= 5)
  .sort((a, b) => b[1].wins / b[1].picks - a[1].wins / a[1].picks)
  .forEach(([id, p]) => console.log(`  ${id.padEnd(16)} ${String(p.picks).padStart(4)} picks  ${((p.wins / p.picks) * 100).toFixed(0).padStart(3)}% win`));
