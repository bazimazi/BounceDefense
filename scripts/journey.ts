/**
 * A whole career, from a fresh profile, played by the human-like bot with the game's real meta code:
 * every run goes through `runConfig` and `applyRun`, and between runs the player spends what they earned
 * (cheapest first: Workshop, Research, Awakening, new cores), re-spends talents and picks the next run.
 * It answers "how many runs, and how many hours, until a player gets here?" for every milestone.
 *
 *   npm run journey -- [--runs 1500] [--seed 1] [--cores 4] [--every 50] [--hours]
 *
 * Run choice: push the next difficulty (or the next Ascension step once difficulties stall, or the next
 * Descent depth once Eternity is won); after two straight losses at a frontier, farm three runs at the hardest
 * setting recently won, then try again. The bot never uses pacts, rerolls or banishes and keeps the standard
 * parts, so a human who drafts with intent progresses faster than these numbers.
 */
import { ARENAS, DIFFICULTIES } from '../src/data/arenas';
import { CORES } from '../src/data/balls';
import { ALL_WORKSHOP, RESEARCH, masteryLevel, rankLevel } from '../src/data/meta';
import { ascensionDifficulty, MAX_ASCENSION } from '../src/data/ascension';
import { TALENTS, talentRequirement, type TalentRanks } from '../src/data/talents';
import { AWAKEN_MAX } from '../src/data/awakening';
import {
  applyRun, awaken, awakenCost, bestCleared, buyStar, buyWorkshop, canResearch, canUnlockCore, descentOpen, doResearch, maxDifficulty, riftOpen, runConfig, starCost, starWallet, unlockCore, workshopCost,
} from '../src/meta/progress';
import { STARS } from '../src/data/descent';
import { defaultProfile } from '../src/meta/profile';
import { talentProgress, talentWins } from '../src/meta/talents';
import type { Profile } from '../src/meta/types';
import { CORE_MAP } from '../src/data/balls';
import { playHuman } from './human';

const args = process.argv.slice(2);
const get = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const maxRuns = Number(get('runs', '1500'));
const seed0 = Number(get('seed', '1'));
const favorites = Number(get('cores', '4'));
const every = Number(get('every', '100'));
const noise = Number(get('noise', '25'));
const perDay = Number(get('perday', '8'));
const drafter = get('draft', 'focused') === 'smart' ? 'smart' as const : 'focused' as const;
const income = { runCoins: 0, otherCoins: 0, runCores: 0, otherCores: 0, runResearch: 0, otherResearch: 0 };


function spendTalents(points: number, won: number): TalentRanks {
  const out: TalentRanks = {};
  let left = points;
  for (const tree of ['warden', 'havoc', 'kinetics', 'conduit']) {
    for (const t of TALENTS.filter((x) => x.tree === tree).sort((a, b) => a.tier - b.tier)) {
      while (left > 0 && (out[t.id] ?? 0) < t.maxRank && !talentRequirement(out, t, won)) { out[t.id] = (out[t.id] ?? 0) + 1; left--; }
    }
  }
  return out;
}

/** Spends everything affordable, cheapest first (coins and Cores and Research are separate wallets). */
function shop(p: Profile): void {
  for (let guard = 0; guard < 2000; guard++) {
    let bought = false;
    // Coins: the cheapest Workshop level.
    let best: string | null = null, price = Infinity;
    for (const w of ALL_WORKSHOP) {
      const c = workshopCost(p, w.id);
      if (c !== null && c <= p.coins && c < price) { price = c; best = w.id; }
    }
    if (best && buyWorkshop(p, best)) bought = true;
    // Research: the cheapest open study.
    const r = RESEARCH.filter((x) => canResearch(p, x.id)).sort((a, b) => a.cost - b.cost)[0];
    if (r) { doResearch(p, r.id); bought = true; }
    // Cores: unlock the next core first, then Awakening.
    const next = CORES.find((c) => canUnlockCore(p, c.id));
    if (next) { unlockCore(p, next.id); bought = true; }
    else {
      const aw = p.unlockedCores.map((id) => ({ id, c: awakenCost(p, id) })).filter((x) => x.c !== null && x.c <= p.cores).sort((a, b) => a.c! - b.c!)[0];
      if (aw && awaken(p, aw.id)) bought = true;
    }
    // Constellations: the cheapest level in each wallet (Cores and Research go to the classic sinks first).
    for (const cur of ['aether', 'cores', 'research'] as const) {
      // Cores: new cores and open Awakening ranks first (Awakening also waits on Mastery, so it cannot hold Ruin up).
      if (cur === 'cores' && (CORES.some((c) => canUnlockCore(p, c.id)) || p.unlockedCores.some((id) => (awakenCost(p, id) ?? Infinity) <= p.cores))) continue;
      if (cur === 'research' && RESEARCH.some((x) => !p.researchNodes.includes(x.id))) continue;
      const star = STARS.filter((x) => x.currency === cur).map((x) => ({ id: x.id, c: starCost(p, x.id) })).filter((x) => x.c !== null && x.c <= starWallet(p, cur)).sort((a, b) => a.c! - b.c!)[0];
      if (star && buyStar(p, star.id)) bought = true;
    }
    if (!bought) break;
  }
  p.talents = spendTalents(talentProgress(p).total, talentWins(p));
}

interface Setting { difficulty: number; ascension: number; depth: number; rift?: number }
const key = (s: Setting) => `${s.difficulty}/${s.ascension}/${s.depth}${s.rift ? `/R${s.rift}` : ''}`;

const p = defaultProfile();
p.settings.language = 'en';
let lossStreak = 0, farm = 0, lastWin: Setting = { difficulty: 0, ascension: 0, depth: 0 };
let hours = 0;
const milestones: string[] = [];
const mark = (run: number, text: string) => { milestones.push(`run ${String(run).padStart(5)}  ${hours.toFixed(1).padStart(6)} h  ${text}`); console.log(milestones[milestones.length - 1]); };
const seenDiff = new Set<number>();
let seenAsc = 0, seenDepth = 0, seenRift = 0, rotation = 0, turn = 0, riftTurn = 0;
const wins: Record<string, [number, number]> = {};

function frontier(): Setting {
  const won = bestCleared(p);
  const open = maxDifficulty(p);
  const depthOpen = descentOpen(p);
  // A new difficulty first; then Ascension and the Descent by turns once Eternity has been won.
  if (open > won) return { difficulty: open, ascension: 0, depth: 0 };
  const ascLeft = p.ascension > p.stats.maxAscension && p.stats.maxAscension < MAX_ASCENSION;
  // The next Rift gets every third frontier run once the Rifts are open (it is a wall, not a ladder).
  const rift = riftOpen(p);
  if (rift > p.rifts && rift > 0 && riftTurn++ % 3 === 2) return { difficulty: DIFFICULTIES.length - 1, ascension: 0, depth: 0, rift };
  if (depthOpen > 0 && (!ascLeft || turn++ % 2 === 0)) return { difficulty: DIFFICULTIES.length - 1, ascension: 0, depth: depthOpen };
  if (ascLeft) {
    const d = Math.max(ascensionDifficulty(p.ascension), 0);
    if (d <= won) return { difficulty: d, ascension: p.ascension, depth: 0 };
  }
  return { difficulty: won, ascension: Math.min(p.ascension, p.stats.maxAscension), depth: 0 };
}

for (let run = 1; run <= maxRuns; run++) {
  const target = farm > 0 ? lastWin : frontier();
  if (farm > 0) farm--;
  const pool = p.unlockedCores.slice(0, favorites);
  p.loadout.core = pool[rotation++ % pool.length];
  const cfg = runConfig(p, {
    arena: ARENAS[0].id, difficulty: target.difficulty, pacts: [], seed: seed0 * 100003 + run * 977,
    ascension: target.ascension, ...(target.depth ? { mode: 'descent' as const, depth: target.depth } : {}),
    ...(target.rift ? { mode: 'rift' as const, rift: target.rift } : {}),
  });
  const { w } = playHuman(cfg, 1500, noise, drafter);
  const s = w.summary();
  hours += s.time / 3600 + 45 / 3600; // plus menus and drafting between runs
  const k = key(target);
  wins[k] = wins[k] ?? [0, 0];
  wins[k][1]++;
  if (s.victory) wins[k][0]++;
  const before = { coins: p.coins, cores: p.cores, research: p.research };
  // A dedicated player: about eight runs a day, so the daily contracts turn over every eighth run.
  const report = applyRun(p, s, w.newDiscoveries, 'journey', new Date(Date.UTC(2026, 0, 1 + Math.floor(run / perDay))));
  income.runCoins += report.rewards.coins; income.otherCoins += p.coins - before.coins - report.rewards.coins;
  income.runCores += report.rewards.cores; income.otherCores += p.cores - before.cores - report.rewards.cores;
  income.runResearch += report.rewards.research; income.otherResearch += p.research - before.research - report.rewards.research;
  shop(p);

  if (s.victory) {
    lossStreak = 0;
    // A Rift win is a one-off wall: farming goes back to the Descent or the ladder.
    if (!target.rift && (target.difficulty > lastWin.difficulty || target.ascension > lastWin.ascension || target.depth > lastWin.depth || farm === 0)) lastWin = target;
  } else if (key(target) !== key(lastWin) && !target.rift) {
    lossStreak++;
    if (lossStreak >= 2) { farm = 3; lossStreak = 0; }
  }
  const won = bestCleared(p);
  for (let d = 0; d <= won; d++) if (!seenDiff.has(d)) { seenDiff.add(d); mark(run, `won ${DIFFICULTIES[d].name}`); }
  if (p.stats.maxAscension > seenAsc) { seenAsc = p.stats.maxAscension; if (seenAsc % 5 === 0 || seenAsc === 1) mark(run, `won Ascension ${seenAsc}`); }
  if (p.rifts > seenRift) { seenRift = p.rifts; mark(run, `cleared Rift ${seenRift}`); }
  const depthBest = p.descent.best;
  if (depthBest > seenDepth) { const before = seenDepth; seenDepth = depthBest; if (Math.floor(seenDepth / 5) > Math.floor(before / 5) || seenDepth === 1) mark(run, `cleared Depth ${seenDepth}`); }

  if (run % every === 0 || (run < every && run % Math.max(1, Math.floor(every / 5)) === 0)) {
    const ws = ALL_WORKSHOP.reduce((a, x) => a + Math.min(x.maxLevel, p.workshop[x.id] ?? 0), 0);
    const wsMax = ALL_WORKSHOP.reduce((a, x) => a + x.maxLevel, 0);
    const masteries = p.unlockedCores.map((c) => `${CORE_MAP[c].icon}${masteryLevel(p.mastery[c] ?? 0).level}`).join(' ');
    console.log(`  [${run}] ${hours.toFixed(1)}h won ${won >= 0 ? DIFFICULTIES[won].name : '-'} A${p.stats.maxAscension} D${depthBest} R${p.rifts} | coins ${Math.round(p.coins)} cores ${p.cores} research ${p.research} aether ${p.aether} stars ${STARS.map((x) => p.stars[x.id] ?? 0).join('/')} | workshop ${ws}/${wsMax} research ${p.researchNodes.length}/${RESEARCH.length} talents ${talentProgress(p).total} rank ${rankLevel(p.rankXp).level} awaken ${Object.values(p.awakening).reduce((a, b) => a + b, 0)}/${CORES.length * AWAKEN_MAX} | ${masteries} | last ${k} ${s.victory ? 'W' : 'L'} @${Math.round(s.time)}s`);
  }
}
console.log(`\nIncome from runs vs from goals, ranks, contracts and mastery: coins ${Math.round(income.runCoins)} / ${Math.round(income.otherCoins)}, cores ${income.runCores} / ${income.otherCores}, research ${income.runResearch} / ${income.otherResearch}`);
const saveTo = get('save', '');
if (saveTo) (await import('node:fs')).writeFileSync(saveTo, JSON.stringify(p));
console.log('\nMilestones:');
for (const m of milestones) console.log(m);
console.log('\nWin rate per setting tried (difficulty/ascension/depth):');
console.log(Object.entries(wins).map(([k, [a, b]]) => `${k} ${a}/${b}`).join('  '));
