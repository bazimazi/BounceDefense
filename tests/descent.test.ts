import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/data/arenas';
import { ascensionDamage, ascensionHp } from '../src/data/ascension';
import {
  AETHER, AFFLICTIONS, DEPTH_MILESTONES, DESCENT, STARS, STAR_STEP, aetherFor, afflictionCount, compound, descentAfflictions,
  descentBossHp, descentDamage, descentHp, fortuneMult, pressureAt, starModifiers,
} from '../src/data/descent';
import { OVERDRIVE, OVERDRIVE_MAX } from '../src/data/meta';
import { formatMult, formatNum } from '../src/core/math';
import { defaultProfile, migrate } from '../src/meta/profile';
import {
  aetherReward, applyRun, buyStar, canBuyStar, descentOpen, descentUnlocked, nextGoals, overdriveDeep, runConfig, starCost, workshopCap,
  workshopCost, workshopLock,
} from '../src/meta/progress';
import { computeStats } from '../src/sim/stats';
import { BOLSTER, damageEnemy, targetMult } from '../src/sim/combat';

const hit = { src: 'ball' as const, crit: false, depth: 0 };
import { emptyWorld, makeWorld } from './helpers';

const eternityWinner = () => {
  const p = defaultProfile();
  p.tutorialDone = true;
  p.cleared.proving = DESCENT.tier;
  return p;
};

describe('Descent scaling', () => {
  it('compounds per depth, softens the opening for ordinary enemies and hits bosses in full', () => {
    expect(descentHp(0)).toBe(1);
    expect(descentHp(10)).toBeCloseTo(Math.pow(DESCENT.hp, 10));
    expect(descentBossHp(10)).toBeCloseTo(Math.pow(DESCENT.boss, 10));
    expect(descentDamage(10)).toBeCloseTo(Math.pow(DESCENT.damage, 10));
    const full = descentHp(20);
    expect(pressureAt(full, 0)).toBeCloseTo(Math.pow(full, DESCENT.early));
    expect(pressureAt(full, DESCENT.rampEnd)).toBeCloseTo(full);
    expect(pressureAt(full, DESCENT.rampEnd * 3)).toBeCloseTo(full);
    expect(pressureAt(1, 100)).toBe(1);
  });

  it('adds an Affliction every five depths (none at 1-2, at most six), fixed within a band and drawn afresh per band', () => {
    expect(afflictionCount(1)).toBe(0);
    expect(afflictionCount(2)).toBe(0);
    expect(afflictionCount(3)).toBe(1);
    expect(afflictionCount(8)).toBe(2);
    expect(afflictionCount(28)).toBe(6);
    expect(afflictionCount(500)).toBe(6);
    expect(descentAfflictions(3)).toEqual(descentAfflictions(7));
    expect(descentAfflictions(13)).toHaveLength(3);
    expect(new Set(descentAfflictions(40)).size).toBe(6);
    for (const id of descentAfflictions(40)) expect(AFFLICTIONS.some((a) => a.id === id)).toBe(true);
    // Deep bands keep reshuffling: not every band past the cap draws the same six.
    const bands = new Set([30, 35, 40, 45, 50, 55].map((d) => [...descentAfflictions(d)].sort().join()));
    expect(bands.size).toBeGreaterThan(1);
  });

  it('plays a depth on Eternity with its scaling, never with Ascension rules', () => {
    const w = makeWorld({ difficulty: 2, mode: 'descent', depth: 12, ascension: 20, seed: 3 });
    expect(w.diff.id).toBe(DIFFICULTIES[DESCENT.tier].id);
    expect(w.depth).toBe(12);
    expect(w.asc.size).toBe(0);
    // The summary records the tier the depth was played on, so rewards follow Eternity.
    expect(w.summary().difficulty).toBe(DESCENT.tier);
    expect(w.breachScale).toBeCloseTo(descentDamage(12));
    expect(w.pressureHp).toBeCloseTo((DIFFICULTIES[DESCENT.tier].pressure ?? 1) * descentHp(12));
    const boss = w.spawnEnemy('boss_fortress', 270, 200, { hpMult: 1 })!;
    const plain = makeWorld({ difficulty: DESCENT.tier, seed: 3 }).spawnEnemy('boss_fortress', 270, 200, { hpMult: 1 })!;
    const tyrant = w.afflictions.has('tyrant') ? 1.5 : 1;
    expect(boss.maxHp / plain.maxHp).toBeCloseTo(descentBossHp(12) * tyrant);
    // A standard run (and the tutorial) ignores a stray depth.
    expect(makeWorld({ depth: 12 }).depth).toBe(0);
    expect(makeWorld({ mode: 'descent', depth: 12, tutorial: true }).depth).toBe(0);
  });

  it('applies Afflictions where they belong', () => {
    const find = (id: string) => { for (let d = 3; d < 200; d++) if (descentAfflictions(d).includes(id as never)) return d; throw new Error(id); };
    const bulwark = makeWorld({ mode: 'descent', depth: find('bulwark') });
    const grunt = bulwark.spawnEnemy('grunt', 200, 200)!;
    expect(grunt.armor).toBe(4 + makeWorld().spawnEnemy('grunt', 200, 200)!.armor);
    const frenzy = makeWorld({ mode: 'descent', depth: find('frenzy') });
    expect(frenzy.enemySpeedMult).toBeCloseTo(DIFFICULTIES[DESCENT.tier].speedMult * 1.12);
    const bolster = emptyWorld({ mode: 'descent', depth: find('bolster') });
    const a = bolster.spawnEnemy('grunt', 200, 300)!;
    const b = bolster.spawnEnemy('grunt', 230, 300)!;
    const before = b.maxHp;
    // Kill `a` through the damage pipeline; `b` stands within the radius and gains a stack.
    damageEnemy(bolster, a, a.hp * 10, hit);
    expect(a.alive).toBe(false);
    expect(b.maxHp).toBeCloseTo(before * (1 + BOLSTER.step));
  });
});

describe('Ascension pressure', () => {
  it('grows with the square of the level: a step past Abyss at first, a wall at the top', () => {
    expect(ascensionHp(0)).toBe(1);
    expect(ascensionHp(10)).toBeGreaterThan(1.3);
    expect(ascensionHp(10)).toBeLessThan(1.7);
    expect(ascensionHp(30)).toBeGreaterThan(15);
    expect(ascensionDamage(30)).toBeGreaterThan(2.5);
    const w = makeWorld({ difficulty: 9, ascension: 30 });
    expect(w.breachScale).toBeCloseTo(ascensionDamage(30));
    expect(w.pressureHp).toBeCloseTo((DIFFICULTIES[9].pressure ?? 1) * ascensionHp(30));
  });
});

describe('Descent progress', () => {
  it('opens with an Eternity win, clamps the depth to what is open and keeps the daily seed out', () => {
    const p = defaultProfile();
    expect(descentUnlocked(p)).toBe(false);
    expect(descentOpen(p)).toBe(0);
    expect(runConfig(p, { arena: 'proving', difficulty: 0, pacts: [], seed: 1, mode: 'descent', depth: 5 }).mode).toBe('standard');
    const q = eternityWinner();
    expect(descentOpen(q)).toBe(1);
    const cfg = runConfig(q, { arena: 'proving', difficulty: 3, pacts: [], seed: 1, mode: 'descent', depth: 9, ascension: 10 });
    expect(cfg).toMatchObject({ mode: 'descent', depth: 1, difficulty: DESCENT.tier, ascension: 0 });
    expect(runConfig(q, { arena: 'proving', difficulty: 9, pacts: [], seed: 1, mode: 'descent', depth: 1, daily: true }).mode).toBe('standard');
    expect(nextGoals(q, 20).some((g) => g.text.includes('Depth 1'))).toBe(true);
  });

  it('a win opens the next depth, keeps the record, pays Aether and the depth milestones once; a loss pays a share', () => {
    const p = eternityWinner();
    const cleared = { ...p.cleared };
    const run = (depth: number, victory: boolean, bosses = 4) => {
      const s = makeWorld({ mode: 'descent', depth, difficulty: DESCENT.tier }).summary();
      return applyRun(p, { ...s, victory, bossesDefeated: Array(bosses).fill('colossus'), time: 600 }, []);
    };
    const r1 = run(1, true);
    expect(r1.rewards.aether).toBe(aetherFor(1));
    expect(r1.depthUnlocked).toBe(2);
    expect(p.descent).toEqual({ best: 1, open: 2 });
    expect(p.aether).toBe(aetherFor(1));
    expect(p.cleared).toEqual(cleared);
    expect(p.stats.descentWins).toBe(1);
    const loss = run(2, false, 2);
    expect(loss.rewards.aether).toBe(Math.round(aetherFor(2) * (0.15 + 0.35 * 0.5)));
    expect(loss.depthUnlocked).toBeNull();
    expect(p.descent).toEqual({ best: 1, open: 2 });
    // Replaying a shallower depth never narrows the ladder.
    run(1, true);
    expect(p.descent).toEqual({ best: 1, open: 2 });
    // Skipping to a milestone depth (an old save, or a test) pays every record passed.
    const cores = p.cores;
    p.descent.open = 10;
    const r10 = run(10, true);
    const owed = DEPTH_MILESTONES.filter((m) => m.depth <= 10);
    expect(p.cosmetics).toContain('fathom');
    expect(p.cores - cores).toBeGreaterThanOrEqual(owed.reduce((a, m) => a + m.cores, 0));
    expect(r10.depthUnlocked).toBe(11);
    const again = p.cores;
    run(10, true);
    expect(p.cores - again).toBeLessThan(owed.reduce((a, m) => a + m.cores, 0));
  });

  it('Aether grows with depth and Fortune multiplies it', () => {
    expect(aetherFor(0)).toBe(0);
    expect(aetherFor(1)).toBe(Math.round(AETHER.base * AETHER.growth));
    expect(aetherFor(30)).toBeGreaterThan(aetherFor(29));
    expect(fortuneMult({ fortune: 5 })).toBeCloseTo(1 + 5 * STAR_STEP.fortune);
    expect(STARS.find((x) => x.id === 'fortune')!.desc(7)).toBe('+28% Aether from every run');
    expect(aetherReward({ depth: 10, victory: true, bossesDefeated: [], time: 700 }, { fortune: 5 })).toBe(Math.round(aetherFor(10) * fortuneMult({ fortune: 5 })));
    expect(aetherReward({ depth: 0, victory: true, bossesDefeated: [], time: 700 })).toBe(0);
    // An early loss still pays a little for the time it lasted.
    expect(aetherReward({ depth: 30, victory: false, bossesDefeated: [], time: 200 })).toBe(Math.round(aetherFor(30) * 0.075));
  });
});

describe('Constellations', () => {
  it('open with the first depth won and take each line from its own wallet', () => {
    const p = eternityWinner();
    p.aether = 1000; p.cores = 1000; p.research = 1000;
    expect(starCost(p, 'might')).toBeNull();
    expect(buyStar(p, 'might')).toBe(false);
    p.descent.best = 1;
    for (const s of STARS) {
      const before = { aether: p.aether, cores: p.cores, research: p.research };
      const cost = starCost(p, s.id)!;
      expect(canBuyStar(p, s.id)).toBe(true);
      expect(buyStar(p, s.id)).toBe(true);
      expect(p.stars[s.id]).toBe(1);
      expect(before[s.currency] - (s.currency === 'aether' ? p.aether : s.currency === 'cores' ? p.cores : p.research)).toBe(cost);
      expect(starCost(p, s.id)!).toBeGreaterThanOrEqual(cost);
    }
    p.aether = 0;
    expect(buyStar(p, 'might')).toBe(false);
  });

  it('compound: every level multiplies the line, and runs carry them', () => {
    const st = computeStats(starModifiers({ might: 10, bastion: 10, ward: 10, ruin: 10 }));
    const base = computeStats([]);
    expect(st.damage / base.damage).toBeCloseTo(compound(STAR_STEP.might, 10));
    expect(st.maxHp / base.maxHp).toBeCloseTo(compound(STAR_STEP.bastion, 10));
    expect(st.damageTaken).toBeCloseTo(Math.pow(1 - STAR_STEP.ward, 10));
    expect(st.ruin).toBeCloseTo(compound(STAR_STEP.ruin, 10));
    const p = eternityWinner();
    p.stars = { might: 4 };
    const cfg = runConfig(p, { arena: 'proving', difficulty: 0, pacts: [], seed: 1 });
    expect(cfg.stars).toEqual({ might: 4 });
    expect(makeWorld({ stars: { might: 4 } }).build.stats.damage / makeWorld().build.stats.damage).toBeCloseTo(compound(STAR_STEP.might, 4));
  });

  it('Ruin multiplies damage to elites and bosses only', () => {
    const mult = (stars: Record<string, number>, elite: boolean) => {
      const w = emptyWorld({ stars });
      return targetMult(w, w.spawnEnemy('brute', 270, 300, elite ? { elite: ['swift'] } : {})!);
    };
    expect(mult({ ruin: 10 }, true) / mult({}, true)).toBeCloseTo(compound(STAR_STEP.ruin, 10));
    expect(mult({ ruin: 10 }, false)).toBeCloseTo(mult({}, false));
  });

  it('every Descent depth won opens one Overdrive level beyond fifty', () => {
    const p = eternityWinner();
    p.workshop.bp_catalyst = 2;
    const id = OVERDRIVE[0].id;
    expect(workshopCap(p, id)).toBe(OVERDRIVE_MAX);
    p.workshop[id] = OVERDRIVE_MAX;
    expect(workshopCost(p, id)).toBeNull();
    p.descent.best = 7;
    expect(overdriveDeep(p)).toBe(7);
    expect(workshopCap(p, id)).toBe(OVERDRIVE_MAX + 7);
    expect(workshopCost(p, id)).toBeGreaterThan(OVERDRIVE[0].cost(OVERDRIVE_MAX - 1));
    expect(workshopLock(p, id)).toBeNull();
    p.workshop[id] = OVERDRIVE_MAX + 7;
    expect(workshopLock(p, id)).toEqual({ kind: 'overdrive' });
    // Below fifty open levels, depths add nothing yet.
    const q = defaultProfile();
    q.descent.best = 7;
    expect(overdriveDeep(q)).toBe(0);
  });
});

describe('saves and numbers', () => {
  it('migrates Descent fields: whole numbers, known stars, an open depth past the record', () => {
    const p = migrate({ version: 4, aether: -5, descent: { best: 6.7, open: 2 }, stars: { might: 3.9, bogus: 4, ward: -2 }, setup: { depth: 'x' } });
    expect(p.aether).toBe(0);
    expect(p.descent).toEqual({ best: 6, open: 7 });
    expect(p.stars).toEqual({ might: 3 });
    expect(p.setup.depth).toBe(1);
    const fresh = migrate({ version: 3 });
    expect(fresh.descent).toEqual({ best: 0, open: 1 });
    expect(fresh.stars).toEqual({});
  });

  it('formats deep numbers', () => {
    expect(formatNum(1.5e12)).toBe('1.5T');
    expect(formatNum(2.5e15)).toBe('2.5Qa');
    expect(formatNum(3.21e20)).toBe('3.21e20');
    expect(formatMult(1.234)).toBe('×1.23');
    expect(formatMult(28.6)).toBe('×28.6');
    expect(formatMult(12345)).toBe('×12.3K');
  });
});
