/**
 * Balance matrix with a human-like autoplayer. Unlike `npm run sim` (which samples angles with the
 * aim tracer), this bot aims straight at the most advanced threat with some noise, decides every
 * 0.3-0.85 s, really holds a third of its shots into the power window, chases Resonance signals
 * half the time when nothing is close to the line, and fires Surge when ready.
 * It approximates a good touch-screen player and is the reference for difficulty tuning.
 *
 *   npm run balance -- --runs 16 --core striker,pyro --arena proving --diff 0,1,2 [--meta none|mid|max]
 *                      [--workshop '{"hull":3}'] [--talents '{"hull":3}'] [--pacts haste] [--full] [--tutorial]
 *                      [--asc 0,5,10,20]   (Ascension levels; only applies to --diff 4 and above)
 *                      [--od 10]           (every Overdrive item at this level, on top of the meta preset)
 *                      [--bp 4]            (every Blueprint level that opens once difficulty 4 is won)
 *                      [--refit 5]         (every core's Refit at this level)
 *                      [--research 4]      (every Advanced/Apex study open once difficulty 4 is won; apex kills from 4 up)
 *                      [--without sentinel,spoils]  (drop these research flags, to measure one study)
 *                      [--tp 60]           (talent points, spent Warden > Havoc > Kinetics > Conduit; deep tiers as if the tier below was won)
 *                      [--mode gauntlet]   (every boss back to back instead of a Standard run)
 *                      [--awaken 5]        (the core's Awakening rank)
 *                      [--build fire]      (draft only from one archetype's upgrades, the core's signature and the shared kit: kinetic,
 *                                           fire, lightning, ice, bleed, poison, explosion, swarm; see ARCHETYPES)
 *                      [--shares]          (print each cell's damage meter: average share of damage by source)
 *                      [--depth 1,5,10]    (Descent depths: Eternity runs scaled by depth, with its Afflictions; replaces --diff)
 *                      [--stars 20]        (every Constellation at this level; --star '{"might":30}' sets them one by one)
 *
 * Meta presets: `mid` is roughly ten runs in (half the Workshop, 6 talent points); `max` is the
 * complete Workshop with 15 talent points; `end` is an Ascension-ready profile (every Workshop item,
 * 20 talent points, the Research flags that shape a run, every relic). Reference results (all cores, 12 runs per cell):
 *   none: Normal ~98%, Veteran ~82%, Nightmare ~55%      mid: Nightmare ~87%, Inferno ~64%
 *   max:  Inferno ~87%, Abyss ~43% (the Colossus closes Abyss; ~70% with --od 10)   end: Abyss ~70%
 * Endgame tiers with --meta end: Oblivion ~70% at --od 15, Singularity ~55% at --od 35, Eternity ~25% at --od 45.
 */
import { BLUEPRINTS, OVERDRIVE, REFITS, RESEARCH, SIGNATURE_UPGRADE } from '../src/data/meta';
import { ASCENSION_TIER } from '../src/data/ascension';
import { computeRewards } from '../src/meta/progress';
import { defaultConfig, FULL_POOL } from '../src/sim/bot';
import { playHuman } from './human';
import { RELICS } from '../src/data/relics';
import { TALENTS, talentRequirement, type TalentRanks } from '../src/data/talents';
import type { RunConfig } from '../src/sim/world';

const META: Record<string, { workshop: Record<string, number>; talents: Record<string, number>; flags?: string[]; relics?: boolean }> = {
  none: { workshop: {}, talents: {} },
  mid: {
    workshop: { hull: 3, calibration: 3, optics: 2, overclock: 1, primer: 1, study: 2, head_start: 1 },
    talents: { hull: 3, bankcraft: 3 },
  },
  max: {
    workshop: { hull: 5, calibration: 5, optics: 4, overclock: 3, primer: 3, head_start: 1, spare_ball: 1, study: 4, salvage: 5 },
    talents: { hull: 3, plating: 3, recovery: 2, repulsion: 2, last_bastion: 1, bankcraft: 3, flow: 1 },
  },
  end: {
    workshop: {
      hull: 5, calibration: 5, optics: 4, overclock: 3, primer: 3, head_start: 1, spare_ball: 1, study: 4, salvage: 5,
      plating: 3, coils: 4, quick_hands: 2, lucky_charm: 2, relic_cache: 1,
    },
    talents: { hull: 3, plating: 3, recovery: 2, repulsion: 2, last_bastion: 1, bankcraft: 3, flow: 1, blasting: 3, keen: 2 },
    flags: ['reroll1', 'reroll2', 'fourth_card', 'relic4', 'surge1', 'tactics', 'bounty', 'medic'],
    relics: true,
  },
};

/** Upgrades every archetype may draft: hull, a second ball and the generic hit-damage scalers. */
const SHARED_KIT = ['heavy_impact', 'velocity', 'mass', 'extra_ball', 'fortify', 'regen', 'barrier', 'scholar', 'safety_net'];
/** One damage type each, with its core-signature upgrade, for comparing damage types on equal terms. */
const ARCHETYPES: Record<string, string[]> = {
  kinetic: ['precision', 'lethal', 'ricochet', 'bank_shot', 'piercing', 'long_shot', 'bounty_hunter', 'kinetic_lens', 'accelerant'],
  fire: ['ignite', 'wildfire', 'melt', 'thermal_core', 'attunement'],
  lightning: ['chain_lightning', 'static_charge', 'storm_surge', 'arc_capacitor', 'attunement'],
  ice: ['frostbite', 'permafrost', 'cold_snap', 'glacial_heart', 'attunement'],
  bleed: ['serrated', 'bloodletting', 'vampiric', 'sanguine_pact', 'attunement'],
  poison: ['venom', 'virulence', 'contagion', 'miasma', 'pandemic', 'attunement'],
  explosion: ['volatile', 'blast_radius', 'chain_reaction', 'mine_layer', 'cluster_charge'],
  swarm: ['splitter', 'echo', 'shard_forge', 'mirror_image', 'refraction'],
};

function play(cfg: RunConfig, maxTime: number, noise: number) {
  const { w, minHp } = playHuman(cfg, maxTime, noise);
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
const od = Number(get('od', '0'));
const bpTier = Number(get('bp', '-1'));
const refit = Number(get('refit', '0'));
const workshop: Record<string, number> = {
  ...(get('workshop', '') ? JSON.parse(get('workshop', '{}')) : meta.workshop),
  ...(od > 0 ? Object.fromEntries(OVERDRIVE.map((w) => [w.id, Math.min(w.maxLevel, od)])) : {}),
  ...(bpTier >= 0 ? Object.fromEntries(BLUEPRINTS.map((b) => [b.id, b.tiers!.filter((d) => d <= bpTier).length])) : {}),
  ...(refit > 0 ? Object.fromEntries(REFITS.map((r) => [r.id, Math.min(r.maxLevel, refit)])) : {}),
};
const researchTier = Number(get('research', '-1'));
// Gated studies a profile could hold after winning `researchTier`; the capstone needs Eternity.
const studied = researchTier < 0 ? [] : RESEARCH.filter((r) => r.branch && (r.gate?.apex ? researchTier >= 4 : (r.gate?.win ?? 0) <= researchTier))
  .flatMap((r) => r.grants.filter((g) => g.type === 'flag').map((g) => g.id));
const without = get('without', '').split(',').filter(Boolean);
const flags = [...(meta.flags ?? []), ...studied].filter((f) => !without.includes(f));
const talents = get('talents', '') ? JSON.parse(get('talents', '{}')) : meta.talents;
const tp = Number(get('tp', '0'));
/** Greedy talent build: tree by tree, tier by tier, one rank at a time while the rules allow it. */
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
const full = args.includes('--full');
const tutorial = args.includes('--tutorial');
const noise = Number(get('noise', '25'));
const maxTime = Number(get('max', '1200'));
const ascs = get('asc', '0').split(',').map(Number);
const depths = get('depth', '') ? get('depth', '').split(',').map(Number) : [];
const mode = depths.length ? 'descent' as const : get('mode', 'standard') === 'gauntlet' ? 'gauntlet' as const : 'standard' as const;
const starLevel = Number(get('stars', '0'));
const stars: Record<string, number> = { ...(starLevel > 0 ? { might: starLevel, bastion: starLevel, ward: starLevel, ruin: starLevel } : {}), ...(get('star', '') ? JSON.parse(get('star', '{}')) : {}) };
const awakening = Number(get('awaken', '0'));
const archetype = get('build', '');
if (archetype && !ARCHETYPES[archetype]) throw new Error(`unknown --build ${archetype}; one of ${Object.keys(ARCHETYPES).join(', ')}`);
const showShares = args.includes('--shares');

console.log(`Human-like bot, ${runs} runs per cell${full ? ', full upgrade pool' : ''}${od ? `, Overdrive ${od}` : ''}${bpTier >= 0 ? `, Blueprints to tier ${bpTier}` : ''}${refit ? `, Refit ${refit}` : ''}${researchTier >= 0 ? `, Research to tier ${researchTier}` : ''}${tp ? `, ${tp} talent points` : ''}\n`);
const cells: [number, number][] = depths.length ? depths.map((d) => [9, d]) : diffs.map((d) => [d, 0]);
for (const arena of arenas) for (const [difficulty, depth] of cells) for (const ascension of difficulty >= ASCENSION_TIER && !depth ? ascs : [0]) for (const core of cores) {
  let wins = 0, time = 0, level = 0, minHp = 0, kills = 0, coins = 0, aether = 0;
  const shares = new Map<string, number>();
  const deaths: number[] = [];
  const fights: number[] = [];
  const finals: number[] = [];
  for (let i = 0; i < runs; i++) {
    const cfg = defaultConfig({
      seed: 7000 + i * 977, core, arena, difficulty, pacts, tutorial, workshop, mode, awakening, depth, stars, talents: tp > 0 ? spendTalents(tp, Number(get('tpwin', String(difficulty - 1)))) : talents, ascension,
      flags, bossLore: researchTier < 0 ? 0 : Math.min(10, 6 + researchTier), echoCore: studied.includes('echocore') ? (core === 'pyro' ? 'tesla' : 'pyro') : undefined, ...(meta.relics ? { relicPool: RELICS.map((r) => r.id) } : {}), ...(full ? { pool: FULL_POOL } : {}),
      ...(archetype ? { pool: [...SHARED_KIT, ...ARCHETYPES[archetype], SIGNATURE_UPGRADE[core]] } : {}),
    });
    const r = play(cfg, maxTime, noise);
    if (r.s.victory) wins++;
    else deaths.push(Math.round(r.s.time));
    const total = (r.s.damageBy ?? []).reduce((a, [, v]) => a + v, 0) || 1;
    for (const [k, v] of r.s.damageBy ?? []) shares.set(k, (shares.get(k) ?? 0) + v / total / runs);
    time += r.s.time; level += r.s.level; minHp += r.minHp; kills += r.s.kills;
    coins += computeRewards(r.s, 0, flags, workshop).coins;
    aether += computeRewards(r.s, 0, flags, workshop, stars).aether;
    fights.push(...r.s.bossFightTimes.map(Math.round));
    if (r.s.victory && r.s.bossFightTimes.length) finals.push(Math.round(r.s.bossFightTimes[r.s.bossFightTimes.length - 1]));
  }
  deaths.sort((a, b) => a - b);
  fights.sort((a, b) => a - b);
  finals.sort((a, b) => a - b);
  const median = (xs: number[]) => (xs.length ? `${xs[Math.floor(xs.length / 2)]}s` : '-');
  console.log(
    `${arena.padEnd(8)} ${depth ? `D${depth}`.padEnd(6) : `d${difficulty}${ascension ? `a${ascension}`.padEnd(4) : '    '}`} ${core.padEnd(8)} win ${String(Math.round((wins / runs) * 100)).padStart(3)}%  ` +
    `avgTime ${(time / runs).toFixed(0).padStart(4)}s  lvl ${(level / runs).toFixed(1).padStart(4)}  kills ${(kills / runs).toFixed(0).padStart(4)}  ` +
    `minHp ${((minHp / runs) * 100).toFixed(0).padStart(3)}%  medianDeath ${median(deaths).padStart(5)}  medianBossFight ${median(fights).padStart(5)}  finalBoss ${median(finals).padStart(5)}  ` +
    `coins ${(coins / runs).toFixed(0).padStart(6)}${depth ? `  aether ${(aether / runs).toFixed(0)}` : ''}${archetype ? `  [${archetype}]` : ''}`,
  );
  if (showShares) {
    const top = [...shares].sort((a, b) => b[1] - a[1]).filter(([, v]) => v >= 0.02);
    console.log(`    damage: ${top.map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ')}`);
  }
}
