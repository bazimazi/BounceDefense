import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARENAS, ARENA_EVENTS, EVENT_MAP, PACTS } from '../src/data/arenas';
import { ASCENSIONS, MAX_ASCENSION } from '../src/data/ascension';
import { CORES, PARTS, PART_MAP, TRAILS } from '../src/data/balls';
import { CONTRACTS } from '../src/data/contracts';
import { BOSSES, BOSS_MAP, ENEMY_MAP } from '../src/data/enemies';
import { ACHIEVEMENTS, CHALLENGES, MASTERY_TRAIL, RANK_UNLOCKS, RESEARCH, SIGNATURE_UPGRADE, rankLevel, rankRewards } from '../src/data/meta';
import { RELICS, RELIC_MAP } from '../src/data/relics';
import { EVOLUTIONS, SYNERGIES } from '../src/data/synergies';
import { TALENTS } from '../src/data/talents';
import { UPGRADES, UPGRADE_MAP } from '../src/data/upgrades';
import type { Unlock } from '../src/meta/types';
import { applyRun, contractBoard, runConfig } from '../src/meta/progress';
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
    const day = new Date(Date.UTC(2026, 10, 10, 12));
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
    const next = contractBoard(p, new Date(Date.UTC(2026, 10, 11, 12)));
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
