import { describe, expect, it } from 'vitest';
import { TALENTS, normalizeTalents, talentSpent } from '../src/data/talents';
import { applyTalents, changeTalent, talentProgress } from '../src/meta/talents';
import { defaultProfile, loadProfile, migrate, saveProfile } from '../src/meta/profile';
import { applyRun, runConfig } from '../src/meta/progress';
import { BEHAVIORS } from '../src/sim/behaviors';
import { ballHitEnemy } from '../src/sim/combat';
import { onWallBounce } from '../src/sim/physics';
import { World } from '../src/sim/world';
import { emptyWorld, steps } from './helpers';

const kinetics = { bankcraft: 3, flow: 3, precision: 2, inertia: 2, banked_power: 1 };
const conduit = { embers: 3, voltage: 3, catalyst: 2, brittle: 2, convergence: 1 };
const warden = { hull: 3, plating: 3, recovery: 2, repulsion: 2, last_bastion: 1 };
const opts = { seed: 1, arena: 'proving', difficulty: 0, pacts: [] };

describe('talent progression and save safety', () => {
  it('grants 3 starter points and counts mastery across cores, capped at 15', () => {
    const p = defaultProfile();
    expect(talentProgress(p)).toEqual({ total: 3, xp: 0, next: 500 });
    p.mastery = { striker: 250, pyro: 249, unknown: 9999 };
    expect(talentProgress(p).next).toBe(1);
    p.mastery.pyro++;
    expect(talentProgress(p).total).toBe(4);
    p.mastery.striker = 99999;
    expect(talentProgress(p).total).toBe(15);
    expect(talentProgress(p).next).toBe(0);
  });

  it('migrates old profiles without spending currencies or choosing talents', () => {
    const p = migrate({ version: 2, coins: 300, research: 5, mastery: { striker: 2000 } });
    expect(p.version).toBe(3);
    expect(p.talents).toEqual({});
    expect(talentProgress(p).total).toBe(7);
    expect(p.coins).toBe(300);
    expect(p.research).toBe(5);
  });

  it('rejects malformed ranks, unknown ids, unmet prerequisites and overspending', () => {
    expect(normalizeTalents({ bankcraft: NaN, flow: 1.5, hull: -1, plating: '3', convergence: 1, unknown: 9 })).toEqual({});
    expect(normalizeTalents({ bankcraft: 99, flow: 3 }, 4)).toEqual({ bankcraft: 3, flow: 1 });
    expect(normalizeTalents({ precision: 2, banked_power: 1 })).toEqual({});
    expect(normalizeTalents({ bankcraft: 3, precision: 2, banked_power: 1 }).banked_power).toBeUndefined();
    expect(talentSpent(normalizeTalents({ ...kinetics, ...conduit, ...warden }))).toBe(15);
    expect(migrate({ talents: { ...kinetics, ...warden } }).talents).toEqual({ bankcraft: 3 });
  });

  it('enforces rank caps, prerequisites and a shared point budget when learning', () => {
    expect(changeTalent({}, 'precision', 1, 15)).toBeNull();
    expect(changeTalent({ bankcraft: 3 }, 'bankcraft', 1, 15)).toBeNull();
    expect(changeTalent({ bankcraft: 3 }, 'hull', 1, 3)).toBeNull();
    expect(changeTalent({ bankcraft: 3 }, 'precision', 1, 15)).toEqual({ bankcraft: 3, precision: 1 });
    expect(changeTalent({}, 'toString', 1, 15)).toBeNull();
  });

  it('refunds dependent nodes, preserves independent choices and never spends currency', () => {
    const next = changeTalent(kinetics, 'bankcraft', -1, 15)!;
    expect(next).toEqual({ bankcraft: 2, flow: 3, inertia: 2 });
    const p = defaultProfile();
    p.coins = 50; p.cores = 4; p.research = 3;
    applyTalents(p, { hull: 3 });
    applyTalents(p, {});
    expect([p.coins, p.cores, p.research]).toEqual([50, 4, 3]);
  });

  it('roundtrips allocations and announces newly earned points after a run', () => {
    const p = defaultProfile();
    applyTalents(p, { bankcraft: 3 });
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
    saveProfile(store, p);
    expect(loadProfile(store).talents).toEqual(p.talents);
    p.mastery.striker = 499;
    const report = applyRun(p, emptyWorld().summary(), []);
    expect(report.unlocks.some(s => s.includes('Talent point'))).toBe(true);
    expect(talentProgress(p).total).toBe(4);
  });

  it('snapshots talents and validates the earned budget before a run', () => {
    const p = defaultProfile();
    p.talents = { ...kinetics };
    const cfg = runConfig(p, opts);
    expect(cfg.talents).toEqual({ bankcraft: 3 });
    const w = new World(cfg);
    p.talents.bankcraft = 0;
    cfg.talents!.bankcraft = 0;
    expect(w.talents.bankcraft).toBe(3);
    expect(w.cfg.talents!.bankcraft).toBe(3);
  });
});

describe('talents compose with existing power systems', () => {
  it('do not grant proc chances, upgrade levels, tags, synergies, or recipes', () => {
    const base = emptyWorld();
    const w = emptyWorld({ talents: conduit });
    expect([...w.build.upgrades]).toEqual([...base.build.upgrades]);
    expect([...w.build.synergies]).toEqual([...base.build.synergies]);
    expect(w.build.eligibleEvolutions()).toEqual([]);
    expect(w.build.tag('fire')).toBe(0);
    for (const key of ['burnChance', 'chillChance', 'chainChance', 'bleedChance', 'splitChance', 'explosionChance'] as const) {
      expect(w.build.stats[key]).toBe(base.build.stats[key]);
    }
    w.build.addUpgrade('ignite');
    w.build.addUpgrade('volatile');
    expect(w.build.synergies.has('burning_explosion')).toBe(true);
    for (let i = 0; i < 4; i++) w.build.addUpgrade('ignite');
    expect(w.build.eligibleEvolutions()).toContain('inferno');
  });

  it('coexists with the similarly named run upgrade and survives recomputes', () => {
    const w = emptyWorld({ talents: kinetics });
    const crit = w.build.stats.critChance;
    w.build.addUpgrade('precision');
    expect(w.build.level('precision')).toBe(1);
    expect(w.talents.precision).toBe(2);
    expect(w.build.stats.critChance).toBeGreaterThan(crit);
    expect(w.build.stats.bankCrit).toBeCloseTo(emptyWorld().build.stats.bankCrit + 0.08);
    const stats = { ...w.build.stats };
    for (let i = 0; i < 5; i++) w.build.recompute();
    expect(w.build.stats).toEqual(stats);
    expect(w.build.has('talent_banked_power')).toBe(true);
  });

  it('all talent modifier ranks produce finite stats with upgrades and evolutions', () => {
    for (const talents of [kinetics, conduit, warden]) {
      const w = emptyWorld({ talents });
      w.build.addUpgrade('fortify');
      w.build.addUpgrade('ignite');
      w.build.addEvolution('inferno');
      expect(Object.values(w.build.stats).every(Number.isFinite)).toBe(true);
      expect(talentSpent(w.talents)).toBe(11);
    }
    expect(TALENTS).toHaveLength(15);
  });

  it('preserves Glass Heart, Bloodless, Lone Ball and Fate Sealed', () => {
    const plain = emptyWorld({ talents: warden });
    const w = emptyWorld({ talents: warden, pacts: ['fragile', 'no_heal', 'lone_ball', 'no_reroll'], flags: ['banish', 'reroll1'] });
    expect(w.maxHp).toBeCloseTo(plain.maxHp / 2);
    w.hp -= 20;
    const hp = w.hp;
    w.heal(100, false);
    steps(w, 2);
    expect(w.hp).toBe(hp);
    w.build.addUpgrade('extra_ball');
    expect(w.maxBallsAllowed()).toBe(1);
    expect(w.rerolls).toBe(0);
    expect(w.banishes).toBe(0);
  });

  it('composes Workshop flat HP, run upgrades and talent multipliers exactly once', () => {
    const w = emptyWorld({ talents: { hull: 3 }, workshop: { hull: 5 }, pacts: ['fragile'] });
    const base = emptyWorld();
    expect(w.maxHp).toBeCloseTo((base.maxHp + 50) * 1.12 * 0.5);
    w.build.addUpgrade('fortify');
    expect(w.build.stats.maxHp).toBeCloseTo((base.maxHp + 50 + 25) * 1.12 * 0.5);
    w.build.recompute();
    expect(w.build.stats.maxHp).toBeCloseTo((base.maxHp + 50 + 25) * 1.12 * 0.5);
  });

  it('Banked Power uses one shared cooldown, excludes clones and respects Surge limits', () => {
    const w = emptyWorld({ talents: kinetics });
    const a = w.spawnBall('main', 200, 300, 0, -1)!;
    const b = w.spawnBall('main', 250, 300, 0, -1)!;
    const shard = w.spawnBall('shard', 250, 300, 0, -1)!;
    const bounce = (ball: typeof a) => onWallBounce(w, ball, 0, 300, 1, 0, 'wall');
    bounce(shard);
    expect(w.surge.charge).toBe(0);
    bounce(a); bounce(b);
    expect(w.surge.charge).toBe(4);
    w.time = 2;
    bounce(b);
    expect(w.surge.charge).toBe(8);
    w.time = 4; w.surge.active = 1;
    bounce(a);
    expect(w.surge.charge).toBe(8);
    w.surge.active = 0; w.surge.charge = w.surge.max - 1;
    bounce(a);
    expect(w.surge.charge).toBe(w.surge.max);
    expect(BEHAVIORS.talent_banked_power).toBeDefined();
  });

  it('Convergence rewards existing statuses on direct hits without amplifying secondary hooks', () => {
    const hit = (cap: boolean, statuses: boolean) => {
      const w = emptyWorld({ talents: { ...conduit, convergence: cap ? 1 : 0 } });
      const e = w.spawnEnemy('brute', 200, 300)!;
      e.hp = e.maxHp = 10000; e.armor = 0;
      if (statuses) { e.st.burnT = 3; e.st.chill = 1; e.st.bleed = 1; }
      w.build.stats.critChance = 0;
      const b = w.spawnBall('main', 200, 300, 0, -1)!;
      let secondary = 0;
      w.bh.push([{ onHit(_w, _b, _e, _crit, dmg) { secondary = dmg; } }, 1]);
      ballHitEnemy(w, b, e);
      return { damage: 10000 - e.hp, secondary };
    };
    const base = hit(false, true);
    const boosted = hit(true, true);
    expect(boosted.damage).toBeCloseTo(base.damage * 1.24);
    expect(boosted.secondary).toBeCloseTo(base.secondary);
    expect(hit(true, false).damage).toBeCloseTo(hit(false, false).damage);
  });

  it('Last Bastion checks starting HP, applies after armor, preserves barriers and allows death', () => {
    const w = emptyWorld({ talents: warden });
    const amount = 20 - w.build.stats.armor;
    w.hp = w.maxHp * 0.35 + 1;
    let before = w.hp;
    w.hurt(20, 200);
    expect(before - w.hp).toBeCloseTo(amount);
    w.hp = w.maxHp * 0.35;
    before = w.hp;
    w.hurt(20, 200);
    expect(before - w.hp).toBeCloseTo(amount * 0.75);
    w.barrier.charges = 1;
    before = w.hp;
    w.hurt(10000, 200);
    expect(w.hp).toBe(before);
    expect(w.barrier.charges).toBe(0);
    w.hurt(10000, 200);
    expect(w.hp).toBe(0);
  });
});
