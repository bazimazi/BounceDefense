import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARENAS, ARENA_EVENTS, DIFFICULTIES, EVENT_MAP, PACTS } from '../src/data/arenas';
import { ASCENSIONS, ASCENSION_TIER, MAX_ASCENSION } from '../src/data/ascension';
import { CORES, PARTS, PART_MAP, TRAILS } from '../src/data/balls';
import { CONTRACTS } from '../src/data/contracts';
import { ALL_BOSSES, APEX_BOSSES, BOSSES, BOSS_MAP, ENEMY_MAP } from '../src/data/enemies';
import {
  ACHIEVEMENTS, ALL_WORKSHOP, BLUEPRINTS, CATALYST_LEVELS, CHALLENGES, MASTERY_TRAIL, MAX_DRAFT_CARDS, OVERDRIVE, OVERDRIVE_MAX, OVERDRIVE_PER_TIER, RANK_UNLOCKS,
  INDUSTRY_DISCOUNT, REFITS, REFIT_MAX, RESEARCH, SECOND_WIND, SENTINEL_INTERVAL, SIGNATURE_UPGRADE, masteryXpFor, rankLevel, rankRewards,
} from '../src/data/meta';
import { RELICS, RELIC_MAP } from '../src/data/relics';
import { EVOLUTIONS, SYNERGIES } from '../src/data/synergies';
import { TALENTS } from '../src/data/talents';
import { UPGRADES, UPGRADE_MAP } from '../src/data/upgrades';
import type { Unlock } from '../src/meta/types';
import {
  applyRun, buyWorkshop, canResearch, computeRewards, contractBoard, doResearch, overdriveOpen, researchLock, runConfig, workshopCap, workshopCost, workshopLock,
} from '../src/meta/progress';
import { EVOLUTIONS as EVOS } from '../src/data/synergies';
import { Build } from '../src/sim/build';
import { OVERMIND_WARD_MAX, SOVEREIGN_SEALS } from '../src/sim/bosses';
import { defaultProfile, migrate } from '../src/meta/profile';
import { BEHAVIORS } from '../src/sim/behaviors';
import { applyBurn, applyChill, applyPoison, chainLightning, damageEnemy, killEnemy } from '../src/sim/combat';
import { runHeadless, defaultConfig, FULL_POOL } from '../src/sim/bot';
import { SIM_DT } from '../src/sim/types';
import { World } from '../src/sim/world';
import { emptyWorld, makeWorld, steps } from './helpers';

const allUnlocks = (): Unlock[] => [
  ...ACHIEVEMENTS.flatMap((a) => a.rewards), ...CHALLENGES.flatMap((c) => c.rewards),
  ...RESEARCH.flatMap((r) => r.grants), ...Object.values(RANK_UNLOCKS).flat(),
];

describe('content integrity', () => {
  it('every referenced behavior exists', () => {
    const ids = [
      ...UPGRADES.map((u) => u.behavior), ...SYNERGIES.map((s) => s.behavior), ...EVOLUTIONS.map((e) => e.behavior),
      ...RELICS.map((r) => r.behavior), ...CORES.map((c) => c.behavior), ...PARTS.map((p) => p.behavior), ...TALENTS.map((t) => t.behavior),
    ].filter((x): x is string => !!x);
    // A behavior is either a hook in BEHAVIORS or a flag the simulation checks by name.
    const sim = readdirSync('src/sim').map((f) => readFileSync(`src/sim/${f}`, 'utf8')).join(' ');
    for (const id of ids) expect(!!BEHAVIORS[id] || sim.includes(`has('${id}')`), id).toBe(true);
  });

  it('every unlock points at real content and every locked thing can be earned', () => {
    for (const u of allUnlocks()) {
      if (u.type === 'upgrade') expect(UPGRADE_MAP[u.id], u.id).toBeDefined();
      if (u.type === 'part') expect(PART_MAP[u.id], u.id).toBeDefined();
      if (u.type === 'relic') expect(RELIC_MAP[u.id], u.id).toBeDefined();
      if (u.type === 'cosmetic') expect(TRAILS.some((t) => t.id === u.id), u.id).toBe(true);
    }
    const granted = new Set(allUnlocks().filter((u) => 'id' in u).map((u) => (u as { id: string }).id));
    for (const u of UPGRADES.filter((x) => x.locked)) {
      expect(granted.has(u.id) || Object.values(SIGNATURE_UPGRADE).includes(u.id) || CORES.some((c) => c.startUpgrades.includes(u.id)), u.id).toBe(true);
    }
    for (const r of RELICS.filter((x) => x.locked)) expect(granted.has(r.id), r.id).toBe(true);
    for (const p of PARTS.filter((x) => x.unlock?.achievement)) expect(ACHIEVEMENTS.some((a) => a.id === p.unlock!.achievement), p.id).toBe(true);
    for (const c of CORES) {
      if (c.unlockReq?.achievement) expect(ACHIEVEMENTS.some((a) => a.id === c.unlockReq!.achievement), c.id).toBe(true);
      if (c.unlockReq?.boss) expect(BOSS_MAP[c.unlockReq.boss], c.id).toBeDefined();
      expect(UPGRADE_MAP[SIGNATURE_UPGRADE[c.id]], c.id).toBeDefined();
      expect(TRAILS.some((t) => t.id === MASTERY_TRAIL[c.id]), c.id).toBe(true);
    }
  });

  it('recipes, squads, events and bosses reference real ids', () => {
    for (const e of EVOLUTIONS) for (const r of e.recipe) {
      expect(UPGRADE_MAP[r.id], `${e.id}:${r.id}`).toBeDefined();
      expect(r.level, `${e.id}:${r.id}`).toBeLessThanOrEqual(UPGRADE_MAP[r.id].maxLevel);
    }
    for (const a of ARENAS) {
      expect(BOSS_MAP[a.bossId], a.id).toBeDefined();
      for (const e of a.events) expect(EVENT_MAP[e], `${a.id}:${e}`).toBeDefined();
      for (const s of a.squads) for (const [id] of s.members) expect(ENEMY_MAP[id], `${a.id}:${id}`).toBeDefined();
      if (a.unlockReq) expect(BOSS_MAP[a.unlockReq.boss], a.id).toBeDefined();
    }
    for (const b of BOSSES) expect(ENEMY_MAP[b.enemy]?.boss, b.id).toBe(true);
    expect(ARENA_EVENTS.filter((e) => e.hostile).length).toBeGreaterThanOrEqual(4);
    for (const c of CONTRACTS) expect(c.daily > 0 && c.weekly >= c.daily, c.id).toBe(true);
    expect(ASCENSIONS.map((a) => a.level)).toEqual(Array.from({ length: MAX_ASCENSION }, (_, i) => i + 1));
  });

  it('is big: the expansion content is all registered', () => {
    expect(CORES.length).toBe(10);
    expect(ARENAS.length).toBe(6);
    expect(BOSSES.length).toBe(6);
    expect(RELICS.length).toBeGreaterThanOrEqual(30);
    expect(EVOLUTIONS.length).toBe(13);
    expect(SYNERGIES.length).toBe(25);
    expect(UPGRADES.length).toBeGreaterThanOrEqual(65);
    expect(PACTS.length).toBe(10);
  });
});

describe('poison and its reactions', () => {
  it('stacks to the cap and ticks straight through armor', () => {
    const w = emptyWorld();
    const e = w.spawnEnemy('brute', 270, 300)!;
    e.spawnT = 1;
    e.hp = e.maxHp = 1e6;
    applyPoison(w, e, 10, 30, 0);
    expect(e.st.poison).toBe(w.build.stats.poisonCap);
    const before = e.hp;
    steps(w, 0.9);
    // 12 stacks × 10 dps for one second, armor ignored.
    expect(before - e.hp).toBeCloseTo(12 * 10, 0);
  });

  it('respects elemental immunity', () => {
    const w = emptyWorld();
    const frost = w.spawnEnemy('frost_golem', 200, 300)!;
    const magma = w.spawnEnemy('magma_golem', 300, 300)!;
    for (let i = 0; i < 5; i++) applyChill(w, frost, 1, 0);
    applyBurn(w, magma, 50, 0);
    expect(frost.st.frozenT).toBe(0);
    expect(frost.st.chill).toBe(0);
    expect(magma.st.burnT).toBe(0);
  });

  it('Combustion, Necrosis and Neurotoxin trigger and are discovered', () => {
    const w = emptyWorld();
    const grid = () => { w.grid.clear(); for (const e of w.enemies) if (e.alive) w.grid.insert(e); };
    const a = w.spawnEnemy('grunt', 150, 300)!;
    a.hp = a.maxHp = 1e6;
    grid();
    applyPoison(w, a, 5, 6, 0);
    applyBurn(w, a, 5, 0);
    expect(w.reactionsRun.has('combustion')).toBe(true);
    expect(a.st.poison).toBe(0);

    const b = w.spawnEnemy('brute', 350, 300)!;
    b.hp = b.maxHp = 1e6;
    const armor = b.armor;
    applyPoison(w, b, 5, 4, 0);
    applyChill(w, b, 3, 0);
    expect(w.reactionsRun.has('necrosis')).toBe(true);
    expect(b.armor).toBe(Math.max(0, armor - 3));
    expect(b.st.poison).toBe(8);

    const c = w.spawnEnemy('grunt', 270, 420)!;
    const d = w.spawnEnemy('grunt', 300, 450)!;
    for (const e of [c, d]) e.hp = e.maxHp = 1e6;
    grid();
    applyPoison(w, d, 5, 6, 0);
    d.st.reactCd = 0;
    chainLightning(w, c, 5, 2, 1);
    expect(w.reactionsRun.has('neurotoxin')).toBe(true);
    expect(d.st.stunT).toBeGreaterThan(0);
    expect(w.newDiscoveries.filter((x) => x.cat === 'reactions').length).toBe(3);
  });
});

describe('relics', () => {
  it('the mini-boss leaves a relic cache that opens a relic draft', () => {
    const w = emptyWorld({ seed: 3 });
    const mini = w.spawnEnemy('brute', 270, 300)!;
    mini.tag = 'mini';
    killEnemy(w, mini, { src: 'ball', crit: false, depth: 0 }, 0);
    expect(w.pendingRelics).toBe(1);
    w.step(SIM_DT);
    expect(w.state).toBe('levelup');
    expect(w.draft).toBe('relic');
    expect(w.offers.length).toBe(3);
    expect(w.offers.every((o) => o.kind === 'relic')).toBe(true);
    const pick = w.offers[0];
    w.choose(pick);
    expect(w.state).toBe('playing');
    expect(w.build.relics).toEqual([pick.kind === 'relic' ? pick.id : '']);
    expect(w.newDiscoveries.some((d) => d.cat === 'relics')).toBe(true);
    // Never offered twice.
    w.grantRelic(false);
    w.step(SIM_DT);
    expect(w.offers.some((o) => o.kind === 'relic' && o.id === w.build.relics[0])).toBe(false);
  });

  it('Relicless forbids caches; inert relics are never offered', () => {
    const none = emptyWorld({ pacts: ['relicless'] });
    none.grantRelic();
    expect(none.pendingRelics).toBe(0);
    const lone = emptyWorld({ pacts: ['lone_ball', 'no_heal'], relicPool: RELICS.map((r) => r.id) });
    expect(lone.relicChoices()).not.toContain('twin_engines');
    expect(lone.relicChoices()).not.toContain('phoenix_feather');
  });

  it('every relic applies without breaking the build', () => {
    for (const r of RELICS) {
      const w = emptyWorld({ relicPool: RELICS.map((x) => x.id) });
      w.build.addRelic(r.id);
      w.refreshBehaviors();
      expect(Object.values(w.build.stats).every(Number.isFinite), r.id).toBe(true);
    }
  });

  it('Phoenix Feather survives one lethal hit', () => {
    const w = emptyWorld();
    w.build.addRelic('phoenix_feather');
    w.refreshBehaviors();
    w.hurt(1e6, 270);
    expect(w.hp).toBeGreaterThan(0);
    expect(w.phoenixUsed).toBe(true);
    w.hurt(1e6, 270);
    expect(w.hp).toBe(0);
  });
});

describe('endgame tiers and apex bosses', () => {
  const hit = { src: 'ball' as const, crit: false, depth: 0 };
  const spawnApex = (difficulty: number, id: string) => {
    const w = makeWorld({ difficulty, seed: 4 });
    w.director.bossesSpawned = w.director.queue.indexOf(id);
    w.director.spawnBoss();
    expect(w.director.bossId).toBe(id);
    w.step(SIM_DT);
    return w;
  };

  it('every tier past Abyss is harder and ends with apex bosses', () => {
    for (let i = ASCENSION_TIER; i < DIFFICULTIES.length; i++) {
      const d = DIFFICULTIES[i];
      expect(d.apex?.length, d.id).toBeGreaterThan(0);
      for (const id of d.apex!) expect(BOSS_MAP[id]?.apex, `${d.id}:${id}`).toBe(true);
      if (i > ASCENSION_TIER) {
        const prev = DIFFICULTIES[i - 1];
        expect(d.bossHpMult).toBeGreaterThan(prev.bossHpMult);
        expect(d.rewardMult).toBeGreaterThan(prev.rewardMult);
        expect(d.lateHp ?? 1).toBeGreaterThan(prev.lateHp ?? 1);
      }
    }
    for (const b of APEX_BOSSES) expect(ENEMY_MAP[b.enemy]?.boss, b.id).toBe(true);
    const w = makeWorld({ difficulty: 9 });
    expect(w.director.queue).toEqual([w.arena.bossId, 'colossus', 'overmind', 'sovereign']);
    expect(new Set(w.director.cycle).size).toBe(ALL_BOSSES.length);
  });

  it('the Colossus lets only a steady trickle of burst damage through', () => {
    const w = spawnApex(4, 'colossus');
    const boss = w.enemies.find((x) => x.def.id === 'boss_colossus')!;
    const hp = boss.hp;
    damageEnemy(w, boss, boss.maxHp * 0.5, hit);
    expect(hp - boss.hp).toBeLessThan(boss.maxHp * 0.12);
    expect(boss.alive).toBe(true);
  });

  it('a fallen twin rises again unless its partner falls in time', () => {
    const w = spawnApex(6, 'twins');
    const sol = w.enemies.find((x) => x.def.id === 'boss_sol')!;
    const luna = w.enemies.find((x) => x.def.id === 'boss_luna')!;
    expect(luna).toBeDefined();
    damageEnemy(w, sol, sol.hp * 10 + 1e7, hit);
    expect(sol.alive).toBe(false);
    expect(w.director.bossActive).toBe(true);
    for (let t = 0; t < 10; t += SIM_DT) { w.step(SIM_DT); w.fx.length = 0; if (w.state === 'levelup') w.choose(w.offers[0]); }
    const risen = w.enemies.find((x) => x.alive && x.def.id === 'boss_sol')!;
    expect(risen).toBeDefined();
    expect(risen.hp).toBeCloseTo(risen.maxHp * 0.5, 0);
    damageEnemy(w, risen, risen.hp * 10 + 1e7, hit);
    damageEnemy(w, luna, luna.hp * 10 + 1e7, hit);
    expect(w.director.bossActive).toBe(false);
  });

  it('the Overmind hides behind its swarm', () => {
    const w = spawnApex(5, 'overmind');
    const boss = w.enemies.find((x) => x.def.id === 'boss_overmind')!;
    for (let i = 0; i < 20; i++) w.spawnEnemy('grunt', 60 + i * 20, 400);
    w.director.updateBoss(SIM_DT);
    expect(boss.t3).toBeCloseTo(OVERMIND_WARD_MAX);
    const hp = boss.hp;
    damageEnemy(w, boss, 1000, hit);
    expect(hp - boss.hp).toBeLessThan(1000 * (1 - OVERMIND_WARD_MAX) + 1);
  });

  it('the Void Sovereign seals itself at 70% and cannot be burst past it', () => {
    const w = spawnApex(7, 'sovereign');
    const boss = w.enemies.find((x) => x.def.id === 'boss_sovereign')!;
    damageEnemy(w, boss, boss.maxHp * 5, hit);
    expect(boss.alive).toBe(true);
    expect(boss.hp).toBeCloseTo(boss.maxHp * SOVEREIGN_SEALS[0], 0);
    w.director.updateBoss(SIM_DT);
    expect(boss.phase).toBe(1);
    const shards = w.enemies.filter((x) => x.alive && x.def.id === 'void_shard');
    expect(shards.length).toBe(3);
    for (const s of shards) killEnemy(w, s, hit, 0);
    w.director.updateBoss(SIM_DT);
    expect(boss.t3).toBe(0);
  });
});

describe('overdrive workshop', () => {
  it('opens five levels per difficulty won and charges steeply', () => {
    const p = defaultProfile();
    p.coins = 1e9;
    expect(overdriveOpen(p)).toBe(0);
    expect(buyWorkshop(p, 'od_forge')).toBe(false);
    p.cleared.proving = 0;
    expect(overdriveOpen(p)).toBe(OVERDRIVE_PER_TIER);
    for (let i = 0; i < 10; i++) buyWorkshop(p, 'od_forge');
    expect(p.workshop.od_forge).toBe(OVERDRIVE_PER_TIER);
    p.cleared.proving = DIFFICULTIES.length - 1;
    expect(overdriveOpen(p)).toBe(OVERDRIVE_MAX);
    for (const od of OVERDRIVE) {
      expect(od.maxLevel).toBe(OVERDRIVE_MAX);
      expect(od.cost(OVERDRIVE_MAX - 1)).toBeGreaterThan(od.cost(0) * 50);
    }
    const forged = makeWorld({ workshop: { od_forge: 20 } });
    expect(forged.build.stats.damage).toBeCloseTo(makeWorld().build.stats.damage * 1.4);
  });
});

describe('blueprints and refits', () => {
  it('every Workshop line has a unique id, a price for each level and a gate for each blueprint level', () => {
    const ids = ALL_WORKSHOP.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const w of ALL_WORKSHOP) {
      for (let l = 0; l < w.maxLevel; l++) expect(w.cost(l), `${w.id} ${l}`).toBeGreaterThan(0);
      expect(w.desc(1).length, w.id).toBeGreaterThan(0);
    }
    for (const b of BLUEPRINTS) {
      expect(b.tiers!.length, b.id).toBe(b.maxLevel);
      for (let l = 1; l < b.maxLevel; l++) {
        expect(b.tiers![l], b.id).toBeGreaterThanOrEqual(b.tiers![l - 1]);
        expect(b.cost(l), b.id).toBeGreaterThan(b.cost(l - 1));
      }
      expect(b.tiers!.every((d) => d < DIFFICULTIES.length), b.id).toBe(true);
    }
    expect(REFITS.map((r) => r.core)).toEqual(CORES.map((c) => c.id));
  });

  it('a blueprint level opens with the difficulty it names', () => {
    const p = defaultProfile();
    p.coins = 1e9;
    expect(workshopCap(p, 'bp_second_wind')).toBe(0);
    expect(workshopLock(p, 'bp_second_wind')).toEqual({ kind: 'win', difficulty: 4 });
    expect(buyWorkshop(p, 'bp_second_wind')).toBe(false);
    p.cleared.proving = 4;
    expect(buyWorkshop(p, 'bp_second_wind')).toBe(true);
    expect(buyWorkshop(p, 'bp_second_wind')).toBe(false);
    expect(workshopLock(p, 'bp_second_wind')).toEqual({ kind: 'win', difficulty: 6 });
    // Launch Protocol builds on Head Start.
    expect(workshopLock(p, 'bp_launch')).toEqual({ kind: 'needs', id: 'head_start' });
    expect(buyWorkshop(p, 'head_start')).toBe(true);
    expect(buyWorkshop(p, 'bp_launch')).toBe(true);
  });

  it('a refit level opens every three Mastery levels of its core, and only applies to that core', () => {
    const p = defaultProfile();
    p.coins = 1e9;
    expect(workshopCap(p, 'refit_striker')).toBe(1);
    expect(workshopLock(p, 'refit_pyro')).toEqual({ kind: 'core', core: 'pyro' });
    expect(buyWorkshop(p, 'refit_striker')).toBe(true);
    expect(workshopLock(p, 'refit_striker')).toEqual({ kind: 'mastery', core: 'striker', level: 4 });
    let xp = 0;
    for (let l = 1; l < 30; l++) xp += masteryXpFor(l);
    p.mastery.striker = xp;
    expect(workshopCap(p, 'refit_striker')).toBe(REFIT_MAX);
    const tuned = makeWorld({ core: 'striker', workshop: { refit_striker: 10 } });
    expect(tuned.build.stats.damage).toBeCloseTo(makeWorld({ core: 'striker' }).build.stats.damage * 1.2);
    expect(makeWorld({ core: 'pyro', workshop: { refit_striker: 10 } }).build.stats.damage).toBeCloseTo(makeWorld({ core: 'pyro' }).build.stats.damage);
  });

  it('the Overdrive Catalyst opens levels ahead of the difficulty gate', () => {
    const p = defaultProfile();
    p.cleared.proving = 5;
    const before = overdriveOpen(p);
    p.workshop.bp_catalyst = 2;
    expect(overdriveOpen(p)).toBe(before + 2 * CATALYST_LEVELS);
    p.cleared.proving = DIFFICULTIES.length - 1;
    expect(overdriveOpen(p)).toBe(OVERDRIVE_MAX);
  });

  it('run blueprints shape the run: rerolls, banishes, opening picks, Surge and draft size', () => {
    const plain = makeWorld();
    const kit = makeWorld({ workshop: { bp_draft: 3, bp_exile: 2, head_start: 1, bp_launch: 2, bp_primed: 3, bp_wide_draft: 1 }, flags: ['fourth_card'] });
    expect(kit.rerolls).toBe(plain.rerolls + 3);
    expect(kit.banishes).toBe(plain.banishes + 2);
    expect(kit.pendingLevels).toBe(plain.pendingLevels + 3);
    expect(kit.surge.charge).toBe(kit.surge.max);
    kit.openLevelUp();
    expect(kit.offers.length).toBeLessThanOrEqual(MAX_DRAFT_CARDS);
    expect(kit.offers.length).toBeGreaterThan(4);
    // A no-reroll pact still wins over the Draft Table.
    expect(makeWorld({ workshop: { bp_draft: 3, bp_exile: 2 }, pacts: ['no_reroll'] }).rerolls).toBeLessThanOrEqual(0);
  });

  it('Second Wind holds the line once', () => {
    const w = makeWorld({ workshop: { bp_second_wind: 2 } });
    w.hurt(w.maxHp * 5, 270);
    expect(w.endTimer).toBeLessThan(0);
    expect(w.hp).toBeCloseTo(w.maxHp * SECOND_WIND[1]);
    w.hurt(w.maxHp * 5, 270);
    expect(w.endTimer).toBeGreaterThanOrEqual(0);
    expect(w.victory).toBe(false);
  });

  it('the War Chest pays on victories and the Mentor Program speeds Mastery', () => {
    const s = { ...makeWorld().summary(), kills: 200, time: 400 };
    const won = { ...s, victory: true };
    expect(computeRewards(won, 0, [], { bp_war_chest: 3 }).coins).toBeCloseTo(computeRewards(won, 0).coins * 1.3, -1);
    expect(computeRewards(s, 0, [], { bp_war_chest: 3 }).coins).toBe(computeRewards(s, 0).coins);
    expect(computeRewards(s, 0, [], { bp_mentor: 3 }).masteryXp).toBeCloseTo(computeRewards(s, 0).masteryXp * 1.3, -1);
  });
});

describe('advanced and apex research', () => {
  const branch = RESEARCH.filter((r) => r.branch);

  it('every gated study names a real tier, real prerequisites, and costs more than the founding tree', () => {
    const founding = Math.max(...RESEARCH.filter((r) => !r.branch).map((r) => r.cost));
    for (const r of branch) {
      expect(r.gate, r.id).toBeDefined();
      if (r.gate!.win !== undefined) expect(r.gate!.win).toBeLessThan(DIFFICULTIES.length);
      expect(r.cost, r.id).toBeGreaterThan(founding);
      for (const x of r.requires) expect(RESEARCH.some((y) => y.id === x), `${r.id} needs ${x}`).toBe(true);
    }
    const capstone = RESEARCH.find((r) => r.id === 'grand_unification')!;
    expect(capstone.requires.length).toBe(branch.length - 1);
    expect(branch.reduce((a, r) => a + r.cost, 0)).toBeGreaterThan(RESEARCH.filter((r) => !r.branch).reduce((a, r) => a + r.cost, 0) * 4);
  });

  it('a study opens with its win or apex kill, not only with points', () => {
    const p = defaultProfile();
    p.research = 9999;
    expect(researchLock(p, 'sentinel')).toEqual({ kind: 'win', difficulty: 4 });
    expect(canResearch(p, 'sentinel')).toBe(false);
    p.cleared.proving = 4;
    expect(doResearch(p, 'sentinel')).toBeDefined();
    expect(p.researchNodes).toContain('sentinel');
    expect(researchLock(p, 'trophy_hunter')).toEqual({ kind: 'apex' });
    p.bossKills.colossus = 1;
    expect(canResearch(p, 'trophy_hunter')).toBe(true);
    p.cleared.proving = DIFFICULTIES.length - 1;
    expect(researchLock(p, 'grand_unification')?.kind).toBe('requires');
  });

  it('Scholarship and Midas pay more, and Industrial Theory cuts Workshop prices', () => {
    const s = { ...makeWorld().summary(), kills: 200, time: 400, victory: true, difficulty: 9 };
    expect(computeRewards(s, 0).research).toBe(1);
    expect(computeRewards(s, 0, ['scholar']).research).toBe(5);
    expect(computeRewards(s, 0, ['midas']).coins).toBeCloseTo(computeRewards(s, 0).coins * 1.15, -1);
    expect(computeRewards({ ...s, difficulty: 2 }, 0, ['midas']).coins).toBe(computeRewards({ ...s, difficulty: 2 }, 0).coins);
    const p = defaultProfile();
    const full = workshopCost(p, 'od_forge');
    p.cleared.proving = 9;
    const before = workshopCost(p, 'od_forge')!;
    p.researchNodes.push('industrial_theory');
    expect(full).toBeNull();
    expect(workshopCost(p, 'od_forge')).toBeCloseTo(before * (1 - INDUSTRY_DISCOUNT), -1);
  });

  it('Sentinel drones fire shards on their own clock', () => {
    const one = emptyWorld({ flags: ['sentinel'] });
    one.enemies.push(one.makeEnemy(ENEMY_MAP.grunt, 270, 400));
    steps(one, SENTINEL_INTERVAL[0] / 2 + 0.1);
    expect(one.balls.filter((b) => b.kind === 'shard').length).toBe(1);
    const two = emptyWorld({ flags: ['sentinel', 'sentinel2'] });
    two.enemies.push(two.makeEnemy(ENEMY_MAP.grunt, 270, 400));
    steps(two, SENTINEL_INTERVAL[1] / 2 + 0.1);
    expect(two.balls.filter((b) => b.kind === 'shard').length).toBe(2);
  });

  it('Aftershock echoes a Surge once at half length', () => {
    const w = emptyWorld({ flags: ['aftershock'] });
    w.surge.charge = w.surge.max;
    w.activateSurge();
    const dur = w.build.stats.surgeDuration;
    steps(w, dur + 0.1);
    expect(w.surge.active).toBeGreaterThan(0);
    expect(w.surge.active).toBeLessThanOrEqual(dur / 2);
    steps(w, dur / 2 + 0.1);
    expect(w.surge.active).toBeLessThanOrEqual(0);
  });

  it('Cryostasis freezes the field once when the line runs low', () => {
    const w = emptyWorld({ flags: ['cryostasis'] });
    const e = w.makeEnemy(ENEMY_MAP.grunt, 270, 400);
    w.enemies.push(e);
    w.hurt(w.maxHp * 0.5, 270);
    expect(e.st.frozenT).toBe(0);
    w.hurt(w.maxHp * 0.3, 270);
    expect(e.st.frozenT).toBeGreaterThan(2);
    expect(w.cryostasisUsed).toBe(true);
  });

  it('Evolution Catalyst takes a level off multi-level ingredients', () => {
    const evo = EVOS.find((e) => e.recipe.some((r) => r.level > 1))!;
    const b = new Build('striker', [], []);
    b.evoDiscount = 1;
    for (const r of evo.recipe) for (let i = 0; i < Math.max(1, r.level - 1); i++) b.addUpgrade(r.id);
    expect(b.eligibleEvolutions()).toContain(evo.id);
    const plain = new Build('striker', [], []);
    for (const r of evo.recipe) for (let i = 0; i < Math.max(1, r.level - 1); i++) plain.addUpgrade(r.id);
    expect(plain.eligibleEvolutions()).not.toContain(evo.id);
  });

  it('Fate Weaving always shows a rare or better card', () => {
    for (let seed = 1; seed < 30; seed++) {
      const w = makeWorld({ seed, flags: ['fate'] });
      w.openLevelUp();
      expect(w.offers.some((o) => o.kind === 'evolution' || (o.kind === 'upgrade' && UPGRADE_MAP[o.id].rarity !== 'common')), `seed ${seed}`).toBe(true);
    }
  });

  it('relic floors: Attunement lifts the first cache, Grand Unification opens with a legendary', () => {
    const w = makeWorld({ flags: ['attune', 'unified'], relicPool: RELICS.map((r) => r.id) });
    expect(w.pendingRelics).toBe(1);
    w.openRelicDraft();
    expect(w.offers.every((o) => o.kind === 'relic' && RELIC_MAP[o.id].rarity === 'legendary')).toBe(true);
    w.choose(w.offers[0]);
    w.grantRelic(false);
    w.openRelicDraft();
    expect(w.offers.some((o) => o.kind === 'relic' && RELIC_MAP[o.id].rarity === 'common')).toBe(true);
  });

  it('Signature Mastery, Combat Archive and Core Resonance shape the opening build', () => {
    const sig = SIGNATURE_UPGRADE.pyro;
    expect(makeWorld({ core: 'pyro', flags: ['signature'] }).build.level(sig)).toBe(1);
    const plain = makeWorld();
    expect(makeWorld({ flags: ['archive'], bossLore: 10 }).build.stats.eliteDamage).toBeCloseTo(plain.build.stats.eliteDamage + 0.2);
    const echo = makeWorld({ flags: ['echocore'], echoCore: 'tesla' });
    expect(echo.build.stats.chainChance).toBeCloseTo(plain.build.stats.chainChance + 0.05);
    const p = defaultProfile();
    p.unlockedCores.push('pyro', 'tesla');
    p.mastery = { striker: 9000, pyro: 300, tesla: 800 };
    expect(runConfig(p, { arena: 'proving', difficulty: 0, pacts: [], seed: 1 }).echoCore).toBe('tesla');
  });

  it('Spoils of War grants a pick and Trophy Hunter mends the line after an apex kill', () => {
    const w = makeWorld({ flags: ['spoils', 'trophy'], difficulty: 4 });
    w.director.bossId = 'colossus';
    const boss = w.makeEnemy(ENEMY_MAP.boss_colossus, 270, 300);
    w.enemies.push(boss);
    w.hp = w.maxHp * 0.2;
    const levels = w.pendingLevels;
    boss.alive = false;
    w.director.onBossPartDeath(boss);
    expect(w.pendingLevels).toBe(levels + 1);
    expect(w.hp).toBeCloseTo(w.maxHp * 0.5);
  });
});

describe('ascension', () => {
  it('applies only on Abyss and stacks its rules', () => {
    const abyss = makeWorld({ difficulty: 4, ascension: 20 });
    const plain = makeWorld({ difficulty: 4 });
    const lower = makeWorld({ difficulty: 3, ascension: 20 });
    expect(abyss.asc.size).toBe(20);
    expect(lower.asc.size).toBe(0);
    expect(abyss.enemyHpMult).toBeGreaterThan(plain.enemyHpMult * 1.5);
    expect(abyss.maxHp).toBeLessThan(plain.maxHp);
    expect(abyss.xpNext).toBeGreaterThanOrEqual(plain.xpNext);
  });

  it('winning on Abyss opens the ladder one step at a time', () => {
    const p = defaultProfile();
    const s = (asc: number) => ({ ...makeWorld().summary(), victory: true, difficulty: 4, ascension: asc });
    expect(applyRun(p, s(0), []).ascensionUnlocked).toBe(1);
    expect(p.ascension).toBe(1);
    expect(applyRun(p, s(0), []).ascensionUnlocked).toBeNull();
    applyRun(p, s(1), []);
    expect(p.ascension).toBe(2);
    expect(runConfig(p, { arena: 'proving', difficulty: 4, pacts: [], seed: 1, ascension: 9 }).ascension).toBe(2);
    expect(runConfig(p, { arena: 'proving', difficulty: 2, pacts: [], seed: 1, ascension: 2 }).ascension).toBe(0);
  });
});

describe('contracts and pilot rank', () => {
  it('draws the same board for everyone on a day and pays each contract once', () => {
    const p = defaultProfile();
    p.tutorialDone = true;
    // Today, not a fixed date: the goals list reads the board on the real clock between runs.
    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
    const a = contractBoard(p, day).daily.map((c) => c.id);
    const q = defaultProfile();
    expect(contractBoard(q, day).daily.map((c) => c.id)).toEqual(a);
    expect(new Set(a).size).toBe(3);
    // A huge run finishes every daily contract that one run can finish.
    const s = { ...makeWorld().summary(), victory: true, kills: 5000, eliteKills: 99, fireKills: 999, lightningKills: 999, explosionKills: 999,
      frozenCount: 999, bestCombo: 999, maxWallChain: 99, bossesDefeated: ['fortress', 'magnetar'], powerShots: 99, starfalls: 9, goldenCaught: 9,
      level: 40, time: 900, relics: ['lucky_coin', 'war_drum', 'hourglass'], evolutions: ['inferno', 'glacier'], barrelsExploded: 99, poisonKills: 999, bleedKills: 999 };
    const coins = p.coins;
    const first = applyRun(p, s, [], undefined, day);
    const runs = p.contracts.daily.find((c) => c.id === 'runs');
    expect(first.contracts.length).toBe(3 - (runs ? 1 : 0) + (p.contracts.weekly?.done ? 1 : 0));
    expect(p.coins).toBeGreaterThan(coins);
    const again = applyRun(p, s, [], undefined, day);
    for (const c of again.contracts) expect(first.contracts).not.toContain(c);
    expect(p.stats.contractsDone).toBe(first.contracts.length + again.contracts.length);
    // Tomorrow brings a fresh board.
    const next = contractBoard(p, new Date(day.getTime() + 86400000));
    expect(next.daily.every((c) => !c.done && c.progress === 0)).toBe(true);
  });

  it('rank grows from every run and pays its rewards once', () => {
    const p = defaultProfile();
    expect(rankLevel(0).level).toBe(1);
    const s = { ...makeWorld().summary(), victory: true, kills: 400, level: 20 };
    const r = applyRun(p, s, []);
    expect(p.rankXp).toBeGreaterThan(0);
    expect(r.rank.after).toBeGreaterThan(r.rank.before);
    expect(r.unlocks.some((u) => u.startsWith('Pilot Rank'))).toBe(true);
    expect(rankRewards(5).some((u) => u.type === 'relic')).toBe(true);
    expect(migrate({ version: 3, mastery: { striker: 900, pyro: 100 } }).rankXp).toBe(1000);
  });
});

describe('new arenas, enemies and bosses', () => {
  it('every arena and layout plays several minutes without errors', () => {
    for (const a of ARENAS.slice(3)) {
      for (let seed = 1; seed <= 3; seed++) {
        const r = runHeadless(defaultConfig({ seed, arena: a.id, difficulty: 1, pool: FULL_POOL }), { maxTime: 240 });
        expect(r.summary.time, a.id).toBeGreaterThan(60);
        expect(r.world.obstacles.length).toBeGreaterThan(0);
      }
    }
  });

  it('each new boss fights and falls', () => {
    for (const [arena, boss] of [['blight', 'boss_broodmother'], ['spire', 'boss_chronarch'], ['citadel', 'boss_architect']] as const) {
      const w = makeWorld({ arena, seed: 5 });
      w.director.spawnBoss();
      expect(w.director.bossActive).toBe(true);
      const e = w.enemies.find((x) => x.def.id === boss)!;
      expect(e).toBeDefined();
      for (let i = 0; i < 30 * 120; i++) { w.step(SIM_DT); w.fx.length = 0; if (w.state === 'levelup') w.choose(w.offers[0]); }
      expect(e.alive).toBe(true);
      // Clear helpers first (pylons gate the Architect's damage), then the boss.
      for (const o of [...w.enemies]) if (o.alive && !o.boss) killEnemy(w, o, { src: 'ball', crit: false, depth: 0 }, 0);
      w.grid.clear();
      damageEnemy(w, e, e.hp * 10 + 1e6, { src: 'ball', crit: false, depth: 0 });
      expect(w.director.bossActive).toBe(false);
      expect(w.run.bossesDefeated).toContain(BOSSES.find((b) => b.enemy === boss)!.id);
    }
  });

  it('the Architect shrugs off damage while its pylons stand', () => {
    const w = makeWorld({ arena: 'citadel', seed: 2 });
    w.director.spawnBoss();
    w.step(SIM_DT);
    const boss = w.enemies.find((x) => x.def.id === 'boss_architect')!;
    expect(boss.t3).toBe(3);
    const hp = boss.hp;
    damageEnemy(w, boss, 1000, { src: 'ball', crit: false, depth: 0 });
    const guarded = hp - boss.hp;
    for (const o of w.enemies) if (o.def.ai === 'pylon') o.alive = false;
    w.step(SIM_DT);
    const hp2 = boss.hp;
    damageEnemy(w, boss, 1000, { src: 'ball', crit: false, depth: 0 });
    expect(hp2 - boss.hp).toBeGreaterThan(guarded * 3);
  });

  it('phased enemies are out of reach', () => {
    const w = emptyWorld();
    const e = w.spawnEnemy('phantom', 270, 300)!;
    e.wobble = 3.0 + 3.6 - ((e.id * 0.37) % 3.6);
    w.step(SIM_DT);
    expect(e.phased).toBe(true);
    w.step(SIM_DT);
    expect(w.grid.query(e.x, e.y, 5, []).includes(e)).toBe(false);
  });

  it('new cores start runs with their passives', () => {
    for (const core of ['venom', 'titan', 'gemini', 'chrono']) {
      const w = new World(defaultConfig({ core, pool: FULL_POOL }));
      expect(w.build.core).toBe(core);
      steps(w, 1);
    }
    const gem = new World(defaultConfig({ core: 'gemini', pool: FULL_POOL, seed: 9 }));
    gem.director.update = () => {};
    gem.beginAim();
    gem.setAim(0, -1);
    gem.release();
    gem.step(SIM_DT);
    expect(gem.balls.some((b) => b.kind === 'clone')).toBe(true);
  });
});
