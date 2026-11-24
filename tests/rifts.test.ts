import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, PACT_MAP } from '../src/data/arenas';
import { BOSS_MAP } from '../src/data/enemies';
import { AFFLICTION_MAP, DESCENT, aetherFor, descentBossHp, descentDamage, descentHp, starModifiers } from '../src/data/descent';
import { RIFTS, SIGILS, SIGIL_MAP, riftAt, sigilTotals, sigilsFor } from '../src/data/rifts';
import { defaultProfile, migrate } from '../src/meta/profile';
import { aetherReward, applyRun, nextGoals, profileSigils, riftOpen, riftsUnlocked, runConfig } from '../src/meta/progress';
import { FURY } from '../src/sim/director';
import { MAX_DISTINCT_UPGRADES } from '../src/sim/offers';
import { computeStats } from '../src/sim/stats';
import { makeWorld, steps } from './helpers';

const eternityWinner = () => {
  const p = defaultProfile();
  p.tutorialDone = true;
  p.cleared.proving = DESCENT.tier;
  return p;
};

describe('Boss Fury', () => {
  it('only arms on the tiers that set it, longer for apex bosses, never in Endless or the Gauntlet', () => {
    expect(DIFFICULTIES.slice(0, 5).every((d) => !d.fury)).toBe(true);
    expect(DIFFICULTIES.slice(5).every((d) => (d.fury ?? 0) > 0)).toBe(true);
    const low = makeWorld({ difficulty: 4 });
    expect(low.furyDelay('fortress')).toBe(0);
    const top = makeWorld({ difficulty: 9 });
    expect(top.furyDelay('fortress')).toBe(DIFFICULTIES[9].fury);
    expect(top.furyDelay('colossus')).toBeCloseTo(DIFFICULTIES[9].fury! * FURY.apex);
    const g = makeWorld({ difficulty: 9, mode: 'gauntlet' });
    g.director.spawnBoss();
    expect(Number.isFinite(g.director.furyAt)).toBe(false);
  });

  it('erodes the line past armor and barriers once the timer runs out, and the boss falling stops it', () => {
    const w = makeWorld({ difficulty: 9, seed: 5, workshop: { plating: 3 } });
    w.director.spawnBoss();
    const boss = w.enemies.find((e) => e.boss)!;
    boss.hp = boss.maxHp = 1e30;
    w.director.furyAt = w.time + 0.5;
    w.barrier.charges = 5;
    const before = w.hp;
    w.balls.length = 0;
    w.hand = 0;
    steps(w, 6);
    expect(w.director.furyTime()).toBeGreaterThan(4);
    // ~5 s of Fury at 1% growing by 1% every 10 s: about 6% of the line, barriers untouched.
    expect(before - w.hp).toBeGreaterThan(w.maxHp * 0.04);
    expect(w.barrier.charges).toBe(5);
    // Left alone, the line falls within about forty seconds of Fury.
    steps(w, 40);
    expect(w.state).toBe('over');
    expect(w.victory).toBe(false);
  });
});

describe('Rift data', () => {
  it('climbs in power and pressure, each with its own Sigil, rules and real apex Rift Lords', () => {
    expect(RIFTS).toHaveLength(10);
    for (let i = 1; i < RIFTS.length; i++) expect(RIFTS[i].power).toBeGreaterThan(RIFTS[i - 1].power);
    expect(new Set(RIFTS.map((r) => r.sigil)).size).toBe(RIFTS.length);
    expect(sigilsFor(RIFTS.length)).toEqual(SIGILS.map((s) => s.id));
    for (const r of RIFTS) {
      expect(SIGIL_MAP[r.sigil]).toBeTruthy();
      for (const id of r.pacts) expect(PACT_MAP[id]).toBeTruthy();
      for (const id of r.afflictions) expect(AFFLICTION_MAP[id]).toBeTruthy();
      for (const id of r.lords) expect(BOSS_MAP[id]?.apex).toBe(true);
      expect(r.fury).toBeGreaterThan(0);
    }
    expect(riftAt(0)).toBeUndefined();
    expect(riftAt(3)).toBe(RIFTS[2]);
    expect(riftAt(11)).toBeUndefined();
  });
});

describe('Rift runs', () => {
  it('play on Eternity with the Rift power, its rules and Lords, and no Ascension', () => {
    const r = RIFTS[4];
    const w = makeWorld({ difficulty: 2, mode: 'rift', rift: 5, ascension: 20, seed: 7 });
    expect(w.rift).toBe(r);
    expect(w.diff.id).toBe(DIFFICULTIES[DESCENT.tier].id);
    expect(w.asc.size).toBe(0);
    expect(w.power).toBe(r.power);
    expect(w.breachScale).toBeCloseTo(descentDamage(r.power));
    expect(w.pressureHp).toBeCloseTo((DIFFICULTIES[DESCENT.tier].pressure ?? 1) * descentHp(r.power));
    for (const id of r.afflictions) expect(w.afflictions.has(id)).toBe(true);
    // Bloodless Rift: its pacts' rules apply.
    expect(w.noHeal).toBe(true);
    expect(w.director.queue.slice(-r.lords.length)).toEqual(r.lords);
    const boss = w.spawnEnemy('boss_fortress', 270, 200, { hpMult: 1 })!;
    const plain = makeWorld({ difficulty: DESCENT.tier, seed: 7 }).spawnEnemy('boss_fortress', 270, 200, { hpMult: 1 })!;
    expect(boss.maxHp / plain.maxHp).toBeCloseTo(descentBossHp(r.power) * (w.afflictions.has('tyrant') ? 1.5 : 1));
    expect(w.furyDelay('fortress')).toBe(r.fury);
    const s = w.summary();
    expect(s.mode).toBe('rift');
    expect(s.rift).toBe(5);
    // A Rift's own pacts are rules, not the player's: they never enter the reward multiplier.
    expect(s.pacts).toEqual([]);
    expect(makeWorld({ mode: 'rift', rift: 2, tutorial: true }).rift).toBeNull();
    expect(makeWorld({ rift: 2 }).rift).toBeNull();
  });
});

describe('Sigils', () => {
  it('add up and reach the run', () => {
    const all = sigilTotals(sigilsFor(RIFTS.length));
    expect(all.fury).toBe(15);
    expect(all.slots).toBe(1);
    expect(all.picks).toBe(1);
    const base = makeWorld({ seed: 2, difficulty: 9 });
    const w = makeWorld({ seed: 2, difficulty: 9, sigils: sigilsFor(RIFTS.length), flags: ['reroll1', 'banish'] });
    const plain = makeWorld({ seed: 2, difficulty: 9, flags: ['reroll1', 'banish'] });
    expect(w.rerolls).toBe(plain.rerolls + 2);
    expect(w.banishes).toBe(plain.banishes + 1);
    expect(w.pendingLevels).toBe(base.pendingLevels + 1);
    // Bulwark (+30% hull) and the Void (+25% damage).
    expect(w.maxHp).toBeCloseTo(base.maxHp * 1.3, 0);
    expect(w.build.stats.damage).toBeGreaterThan(base.build.stats.damage * 1.2);
    expect(w.build.maxLevel('extra_ball')).toBe(base.build.maxLevel('extra_ball') + 1);
    expect(w.furyDelay('fortress')).toBe(DIFFICULTIES[9].fury! + 15);
    expect(w.pendingRelics).toBe(base.pendingRelics + 1);
    // The Firmament steps every compounding line further.
    const plainStars = computeStats(starModifiers({ might: 20 })).damage;
    const firm = computeStats(starModifiers({ might: 20 }, 0.005)).damage;
    expect(firm / plainStars).toBeCloseTo(Math.pow(1.035, 20) / Math.pow(1.03, 20), 3);
  });

  it('Breadth opens an eleventh upgrade slot', () => {
    const fill = (sigils: string[]) => {
      const w = makeWorld({ seed: 4, sigils });
      let guard = 0;
      while (w.build.upgrades.size < 12 && guard++ < 400) {
        w.openLevelUp();
        const fresh = w.offers.find((o) => o.kind === 'upgrade' && w.build.level(o.id) === 0);
        if (!fresh) break;
        w.choose(fresh);
      }
      return w.build.upgrades.size;
    };
    expect(fill([])).toBe(MAX_DISTINCT_UPGRADES);
    expect(fill(['breadth'])).toBe(MAX_DISTINCT_UPGRADES + 1);
  });
});

describe('Rift progression', () => {
  const riftWin = (n: number, victory = true) => {
    const s = makeWorld({ mode: 'rift', rift: n, seed: n }).summary();
    return { ...s, victory, time: 900, bossesDefeated: victory ? ['fortress', ...RIFTS[n - 1].lords] : [] };
  };

  it('opens with an Eternity win, one Rift at a time, granting each Sigil once', () => {
    const p = defaultProfile();
    expect(riftsUnlocked(p)).toBe(false);
    expect(riftOpen(p)).toBe(0);
    expect(runConfig(p, { arena: 'proving', difficulty: 0, pacts: [], seed: 1, mode: 'rift', rift: 1 }).mode).toBe('standard');
    const q = eternityWinner();
    expect(riftOpen(q)).toBe(1);
    // A Rift beyond the open one is clamped to it.
    const cfg = runConfig(q, { arena: 'proving', difficulty: 0, pacts: [], seed: 1, mode: 'rift', rift: 6 });
    expect(cfg.mode).toBe('rift');
    expect(cfg.rift).toBe(1);
    expect(cfg.difficulty).toBe(DESCENT.tier);
    expect(cfg.sigils).toEqual([]);
    const before = { cores: q.cores, research: q.research };
    const r = applyRun(q, riftWin(1), []);
    expect(r.sigil).toBe(RIFTS[0].sigil);
    expect(q.rifts).toBe(1);
    expect(profileSigils(q)).toEqual([RIFTS[0].sigil]);
    expect(q.cores - before.cores).toBeGreaterThanOrEqual(RIFTS[0].cores);
    expect(q.research - before.research).toBeGreaterThanOrEqual(RIFTS[0].research);
    expect(runConfig(q, { arena: 'proving', difficulty: 9, pacts: [], seed: 1 }).sigils).toEqual([RIFTS[0].sigil]);
    // Clearing it again pays Aether but no second Sigil; losing never opens the next.
    expect(applyRun(q, riftWin(1), []).sigil).toBeNull();
    expect(applyRun(q, riftWin(2, false), []).sigil).toBeNull();
    expect(q.rifts).toBe(1);
    expect(riftOpen(q)).toBe(2);
    expect(q.stats.riftWins).toBe(2);
    // A Rift win never counts as a Standard clear or an Ascension step.
    expect(q.ascension).toBe(0);
    expect(nextGoals(q, 20).some((g) => g.text.includes(RIFTS[1].name))).toBe(true);
  });

  it('pays Aether like a depth of its power, a share when lost, more with the Sigil of Plenty', () => {
    const win = riftWin(3);
    expect(aetherReward(win)).toBe(aetherFor(RIFTS[2].power));
    const lost = { ...riftWin(3, false), time: 400 };
    expect(aetherReward(lost)).toBe(Math.round(aetherFor(RIFTS[2].power) * 0.15));
    const plenty = RIFTS.findIndex((r) => r.sigil === 'plenty') + 1;
    expect(aetherReward(win, {}, plenty)).toBe(Math.round(aetherFor(RIFTS[2].power) * 1.5));
  });

  it('survives save migration', () => {
    expect(migrate({ ...defaultProfile(), rifts: 99 }).rifts).toBe(RIFTS.length);
    expect(migrate({ ...defaultProfile(), rifts: -3 }).rifts).toBe(0);
    expect(migrate({ ...defaultProfile(), rifts: 'x' }).rifts).toBe(0);
    const old = defaultProfile() as unknown as Record<string, unknown>;
    delete old.rifts;
    expect(migrate(old).rifts).toBe(0);
    expect(migrate({ ...defaultProfile(), setup: { ...defaultProfile().setup, mode: 'bogus' } }).setup.mode).toBe('standard');
  });
});
