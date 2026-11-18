import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, PACTS, PACT_MAP } from '../src/data/arenas';
import { ASCENSIONS, MAX_ASCENSION } from '../src/data/ascension';
import { AWAKEN_COST, AWAKEN_MASTERY, AWAKEN_MAX, AWAKEN_PERKS, AWAKEN_STEPS, awakenModifiers } from '../src/data/awakening';
import { CORES, TRAILS } from '../src/data/balls';
import { APEX_BOSSES, BOSSES, BOSS_MAP } from '../src/data/enemies';
import { ABYSSAL_PACTS, CHALLENGES, RESEARCH, masteryXpFor } from '../src/data/meta';
import { defaultProfile, migrate } from '../src/meta/profile';
import { applyRun, awaken, awakenCost, awakenOpen, canAwaken, doResearch, gauntletUnlocked, nextGoals, runConfig } from '../src/meta/progress';
import { GAUNTLET } from '../src/sim/director';
import { World } from '../src/sim/world';
import { makeWorld } from './helpers';

/** Total Mastery XP to reach `level`. */
const xpFor = (level: number) => Array.from({ length: level - 1 }, (_, i) => masteryXpFor(i + 1)).reduce((a, b) => a + b, 0);

describe('Ascension II', () => {
  it('runs the ladder to 30 with ten new stacking rules', () => {
    expect(MAX_ASCENSION).toBe(30);
    expect(ASCENSIONS.map((a) => a.level)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(new Set(ASCENSIONS.map((a) => a.id)).size).toBe(30);
  });

  it('every new rule makes the run harder', () => {
    const a20 = makeWorld({ difficulty: 4, ascension: 20 });
    const a30 = makeWorld({ difficulty: 4, ascension: 30 });
    expect(a30.asc.size).toBe(30);
    expect(a30.enemyHpMult).toBeCloseTo(a20.enemyHpMult * 1.5);
    expect(a30.enemySpeedMult).toBeCloseTo(a20.enemySpeedMult * 1.1);
    // Late in the run the steeper ramp shows on top of the flat health rules.
    a20.time = a30.time = 900;
    const late = (w: World) => w.makeEnemy(w.spawnEnemy('grunt', 0, 0)!.def, 0, 0).maxHp;
    expect(late(a30) / late(a20)).toBeGreaterThan(1.5 * 1.2);
    expect(a30.build.stats.surgeGain).toBeLessThan(a20.build.stats.surgeGain);
    const grunt = (w: World) => w.spawnEnemy('grunt', 200, 200)!;
    expect(grunt(a30).armor).toBe(grunt(a20).armor + 3);
  });

  it('Ascension 30 adds the first apex boss the tier does not already field', () => {
    const abyss = makeWorld({ difficulty: 4, ascension: 30 });
    expect(abyss.director.queue).toEqual([...makeWorld({ difficulty: 4, ascension: 20 }).director.queue, 'twins']);
    const eternity = makeWorld({ difficulty: 9, ascension: 30 });
    expect(eternity.director.queue.slice(-4)).toEqual(['colossus', 'overmind', 'sovereign', 'twins']);
    expect(new Set(eternity.director.queue.filter((b) => BOSS_MAP[b].apex)).size).toBe(APEX_BOSSES.length);
  });

  it('wins keep opening the ladder past twenty, one step at a time', () => {
    const p = defaultProfile();
    p.ascension = 20;
    const s = (asc: number) => ({ ...makeWorld().summary(), victory: true, difficulty: 7, ascension: asc });
    expect(applyRun(p, s(20), []).ascensionUnlocked).toBe(21);
    applyRun(p, s(21), []);
    expect(p.ascension).toBe(22);
    p.ascension = 30;
    expect(applyRun(p, s(30), []).ascensionUnlocked).toBeNull();
    expect(p.ascension).toBe(30);
    expect(migrate({ ...p, ascension: 99 }).ascension).toBe(30);
  });
});

describe('Abyssal Pacts', () => {
  it('open with their research after an Abyss win, and pay well', () => {
    const extra = PACTS.filter((pc) => pc.flag === 'pacts3');
    expect(extra.map((pc) => pc.id).sort()).toEqual([...ABYSSAL_PACTS].sort());
    for (const pc of extra) expect(pc.reward).toBeGreaterThanOrEqual(0.3);
    const p = defaultProfile();
    p.research = 999;
    p.researchNodes.push('risk_pacts', 'pact_mastery');
    expect(runConfig(p, { arena: 'proving', difficulty: 4, pacts: ['warlords'], seed: 1 }).pacts).toEqual([]);
    p.cleared.proving = 4;
    expect(doResearch(p, 'abyssal_pacts')).toBeDefined();
    expect(runConfig(p, { arena: 'proving', difficulty: 4, pacts: ['warlords', 'eclipse'], seed: 1 }).pacts).toEqual(['warlords', 'eclipse']);
    expect(RESEARCH.find((r) => r.id === 'grand_unification')!.requires).toContain('abyssal_pacts');
  });

  it('Warlords toughens bosses, Narrow Fate trims the draft, Endless Tide speeds squads', () => {
    const boss = (pacts: string[]) => {
      const w = makeWorld({ difficulty: 2, pacts });
      w.director.spawnBoss();
      return w.enemies.find((e) => e.boss)!.maxHp;
    };
    expect(boss(['warlords'])).toBeCloseTo(boss([]) * 1.5);
    const cards = (pacts: string[]) => {
      const w = makeWorld({ pacts });
      w.openLevelUp();
      return w.offers.length;
    };
    expect(cards(['narrow_fate'])).toBe(cards([]) - 1);
    expect(makeWorld({ pacts: ['tide'] }).director.threatRate(120)).toBeCloseTo(makeWorld().director.threatRate(120) * 1.3);
  });

  it('Eclipse keeps the Resonance circuit dark for the whole run', () => {
    const lit = makeWorld();
    const dark = makeWorld({ pacts: ['eclipse'] });
    for (let i = 0; i < 12 * 120; i++) { lit.resonance.update(1 / 120); dark.resonance.update(1 / 120); }
    expect(lit.resonance.nodes.length).toBeGreaterThan(0);
    expect(dark.resonance.nodes.length).toBe(0);
    expect(PACT_MAP.eclipse.rule).toBe('eclipse');
  });

  it('Pactbreaker counts only Abyssal Pacts', () => {
    const c = CHALLENGES.find((x) => x.id === 'pactbreaker')!;
    const s = { ...makeWorld().summary(), victory: true, difficulty: 4 };
    expect(c.check({ ...s, pacts: ['haste', 'fortified'] })).toBe(false);
    expect(c.check({ ...s, pacts: ['eclipse', 'tide'] })).toBe(true);
    expect(c.check({ ...s, difficulty: 3, pacts: ['eclipse', 'tide'] })).toBe(false);
  });
});

describe('the Gauntlet', () => {
  const allBosses = () => {
    const p = defaultProfile();
    for (const b of BOSSES) p.bossKills[b.id] = 1;
    return p;
  };

  it('opens once all six classic bosses have fallen', () => {
    const p = defaultProfile();
    expect(gauntletUnlocked(p)).toBe(false);
    expect(runConfig(p, { arena: 'proving', difficulty: 0, pacts: [], seed: 1, mode: 'gauntlet' }).mode).toBe('standard');
    const q = allBosses();
    expect(gauntletUnlocked(q)).toBe(true);
    expect(runConfig(q, { arena: 'proving', difficulty: 0, pacts: [], seed: 1, mode: 'gauntlet' }).mode).toBe('gauntlet');
    // The daily seed and the Ascension ladder stay Standard.
    expect(runConfig(q, { arena: 'proving', difficulty: 0, pacts: [], seed: 1, mode: 'gauntlet', daily: true }).mode).toBe('standard');
    q.ascension = 5;
    q.cleared.proving = 4;
    expect(runConfig(q, { arena: 'proving', difficulty: 4, pacts: [], seed: 1, mode: 'gauntlet', ascension: 5 }).ascension).toBe(0);
  });

  it('queues every classic boss, the arena\'s own first, then the tier\'s apex bosses', () => {
    const w = makeWorld({ arena: 'rift', difficulty: 5, mode: 'gauntlet' });
    expect(w.gauntlet).toBe(true);
    expect(w.director.queue.slice(0, BOSSES.length).sort()).toEqual(BOSSES.map((b) => b.id).sort());
    expect(w.director.queue[0]).toBe('hydra');
    expect(w.director.queue.slice(BOSSES.length)).toEqual(DIFFICULTIES[5].apex);
    expect(w.director.bossTime).toBe(GAUNTLET.first);
    expect(w.director.eliteTimer).toBe(Infinity);
    expect(w.director.miniDone).toBe(true);
    expect(w.pendingLevels).toBe(0);
    expect(makeWorld({ mode: 'gauntlet', tutorial: true }).gauntlet).toBe(false);
  });

  it('pays picks after every boss and keeps the next one close', () => {
    const w = makeWorld({ mode: 'gauntlet' });
    w.pendingLevels = 0;
    w.time = GAUNTLET.first;
    w.director.spawnBoss();
    const boss = w.enemies.find((e) => e.boss)!;
    const first = boss.maxHp;
    for (const e of w.enemies) if (e.boss) e.alive = false;
    w.director.onBossPartDeath(boss);
    expect(w.pendingLevels).toBe(GAUNTLET.bossPicks);
    expect(w.director.bossTime).toBeCloseTo(w.time + GAUNTLET.gap);
    w.director.spawnBoss();
    const second = w.enemies.find((e) => e.alive && e.boss)!;
    expect(second.def.id).not.toBe(boss.def.id);
    // A quarter more health per boss rather than half.
    const scale = (e: typeof boss) => e.maxHp / e.def.hp;
    expect(scale(second) / scale(boss)).toBeCloseTo(1 + GAUNTLET.bossRamp);
    expect(first).toBeGreaterThan(0);
  });

  it('apex bosses keep their Standard strength at the end of the queue', () => {
    const apexScale = (mode: 'standard' | 'gauntlet') => {
      const w = makeWorld({ difficulty: 4, mode });
      const d = w.director;
      d.bossesSpawned = d.queue.indexOf('colossus');
      d.spawnBoss();
      const e = w.enemies.find((x) => x.alive && x.boss)!;
      return e.maxHp / e.def.hp;
    };
    expect(apexScale('gauntlet')).toBeCloseTo(apexScale('standard'));
    // Classic bosses grow with the tier's late-run ramp.
    const first = (difficulty: number) => {
      const w = makeWorld({ difficulty, mode: 'gauntlet' });
      w.director.spawnBoss();
      const e = w.enemies.find((x) => x.alive && x.boss)!;
      return e.maxHp / e.def.hp / DIFFICULTIES[difficulty].bossHpMult;
    };
    expect(first(0)).toBeCloseTo(GAUNTLET.bossHp);
    expect(first(9)).toBeCloseTo(GAUNTLET.bossHp * Math.sqrt(DIFFICULTIES[9].lateHp!));
  });

  it('squads keep a thinner stream coming during Gauntlet fights', () => {
    const w = makeWorld({ mode: 'gauntlet' });
    w.time = 120;
    w.director.bossActive = true;
    w.director.budget = 0;
    w.director.next = null;
    w.director.update(1);
    expect(w.director.budget).toBeCloseTo(w.director.threatRate(120) * GAUNTLET.fightSquads, 3);
  });

  it('a Gauntlet win is its own record: no new difficulty or Ascension step', () => {
    const p = allBosses();
    const s = { ...makeWorld().summary(), victory: true, difficulty: 4, mode: 'gauntlet' as const };
    const report = applyRun(p, s, []);
    expect(p.gauntlet).toBe(4);
    expect(p.cleared.proving ?? -1).toBe(-1);
    expect(p.ascension).toBe(0);
    expect(report.difficultyUnlocked).toBeNull();
    expect(p.stats.gauntletWins).toBe(1);
    expect(p.challenges).toEqual(expect.arrayContaining(['gauntlet_run', 'gauntlet_abyss']));
    expect(p.cosmetics).toContain('gladiator');
    expect(makeWorld({ mode: 'gauntlet' }).summary().mode).toBe('gauntlet');
    expect(makeWorld().summary().mode).toBeUndefined();
  });
});

describe('Core Awakening', () => {
  it('has five ranks per core, a perk for every core, and rising prices', () => {
    expect(AWAKEN_COST.length).toBe(AWAKEN_MAX);
    expect(AWAKEN_MASTERY.length).toBe(AWAKEN_MAX);
    expect(AWAKEN_STEPS.length).toBe(AWAKEN_MAX - 1);
    expect(AWAKEN_PERKS.map((x) => x.id).sort()).toEqual(CORES.map((c) => c.id).sort());
    for (let i = 1; i < AWAKEN_MAX; i++) expect(AWAKEN_COST[i]).toBeGreaterThan(AWAKEN_COST[i - 1]);
    for (const c of CORES) expect(awakenModifiers(c.id, AWAKEN_MAX).length).toBeGreaterThan(awakenModifiers(c.id, AWAKEN_MAX - 1).length);
  });

  it('ranks open with the core\'s Mastery and cost Cores', () => {
    const p = defaultProfile();
    p.cores = 1000;
    expect(awakenOpen(p, 'striker')).toBe(0);
    expect(canAwaken(p, 'striker')).toBe(false);
    p.mastery.striker = xpFor(AWAKEN_MASTERY[0]);
    expect(awakenOpen(p, 'striker')).toBe(1);
    expect(awakenCost(p, 'striker')).toBe(AWAKEN_COST[0]);
    expect(awaken(p, 'striker')).toBe(true);
    expect(p.cores).toBe(1000 - AWAKEN_COST[0]);
    expect(awaken(p, 'striker')).toBe(false);
    // Locked cores cannot be awakened, whatever their Mastery.
    p.mastery.pyro = xpFor(30);
    expect(awakenOpen(p, 'pyro')).toBe(0);
    p.unlockedCores.push('pyro');
    expect(awakenOpen(p, 'pyro')).toBe(AWAKEN_MAX);
    for (let i = 0; i < AWAKEN_MAX; i++) expect(awaken(p, 'pyro')).toBe(true);
    expect(awakenCost(p, 'pyro')).toBeNull();
    expect(p.awakening.pyro).toBe(AWAKEN_MAX);
  });

  it('applies only to its own core, and the third rank adds a reroll', () => {
    const p = defaultProfile();
    p.awakening = { striker: 3, pyro: 5 };
    expect(runConfig(p, { arena: 'proving', difficulty: 0, pacts: [], seed: 1 }).awakening).toBe(3);
    const plain = makeWorld();
    const awake = makeWorld({ awakening: 3 });
    expect(awake.build.stats.damage).toBeCloseTo(plain.build.stats.damage * 1.06);
    expect(awake.maxHp).toBeGreaterThan(plain.maxHp);
    expect(awake.rerolls).toBe(plain.rerolls + 1);
    expect(makeWorld({ awakening: 5, core: 'tesla' }).build.stats.chainCount).toBe(makeWorld({ awakening: 4, core: 'tesla' }).build.stats.chainCount + 1);
  });

  it('migration keeps only known cores and whole ranks within the cap', () => {
    const p = migrate({ ...defaultProfile(), awakening: { striker: 9, nope: 3, pyro: -2, tesla: '2' } });
    expect(p.awakening).toEqual({ striker: AWAKEN_MAX, tesla: 2 });
    expect(migrate({ version: 3 }).awakening).toEqual({});
    expect(migrate({ version: 3 }).gauntlet).toBe(-1);
  });

  it('suggests an affordable Awakening as a goal and rewards a full one', () => {
    const p = defaultProfile();
    p.tutorialDone = true;
    p.cores = 50;
    p.mastery.striker = xpFor(AWAKEN_MASTERY[0]);
    expect(nextGoals(p, 10).some((g) => g.text.startsWith('Awaken Striker'))).toBe(true);
    p.awakening.striker = AWAKEN_MAX;
    applyRun(p, makeWorld().summary(), []);
    expect(p.achievements).toContain('awakened');
  });
});

describe('new rewards', () => {
  it('every new trail is earned somewhere', () => {
    for (const id of ['gladiator', 'zenith', 'radiant']) expect(TRAILS.some((tr) => tr.id === id), id).toBe(true);
    const rewards = CHALLENGES.flatMap((c) => c.rewards);
    expect(rewards).toContainEqual({ type: 'cosmetic', id: 'zenith' });
    expect(rewards).toContainEqual({ type: 'cosmetic', id: 'gladiator' });
  });
});
