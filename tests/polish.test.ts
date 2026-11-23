import { describe, expect, it } from 'vitest';
import { ENEMY_MAP } from '../src/data/enemies';
import { ascensionCap, ascensionDifficulty, ascensionHp } from '../src/data/ascension';
import { defaultProfile } from '../src/meta/profile';
import { applyRun, contractBoard, contractText, dailyOptions, runConfig } from '../src/meta/progress';
import { CONTRACT_MAP, contractMinDifficulty, contractRewards, contractTarget } from '../src/data/contracts';
import { changeTalent, talentPointsUsable, talentProgress } from '../src/meta/talents';
import { TALENTS } from '../src/data/talents';
import { BEHAVIORS, type Behavior } from '../src/sim/behaviors';
import { damageEnemy } from '../src/sim/combat';
import { UPGRADES } from '../src/data/upgrades';
import { makeWorld, steps } from './helpers';

const hit = { src: 'ball' as const, crit: false, depth: 0 };

describe('boss adds scale from their boss, not from the tier twice', () => {
  it('ward pylons are a fixed share of the Architect on every tier', () => {
    for (const difficulty of [0, 4, 9]) {
      const w = makeWorld({ arena: 'citadel', difficulty, seed: 5 });
      w.time = 400;
      w.director.spawnBoss();
      const arch = w.enemies.find((e) => e.def.id === 'boss_architect')!;
      const pylons = w.enemies.filter((e) => e.alive && e.def.id === 'ward_pylon');
      expect(pylons.length).toBeGreaterThan(0);
      for (const p of pylons) expect(p.maxHp / arch.maxHp).toBeCloseTo(0.12, 5);
    }
  });

  it('Hydra heads carry Warlords and Ascension boss health only once', () => {
    const w = makeWorld({ arena: 'blight', difficulty: 4, ascension: 23, pacts: ['warlords'], seed: 9 });
    const hydra = w.spawnEnemy('boss_hydra', 270, 250, { hpMult: 4 })!;
    expect(hydra.maxHp).toBeCloseTo(ENEMY_MAP.boss_hydra.hp * 4 * 1.2 * 1.4 * 1.5 * ascensionHp(23));
    damageEnemy(w, hydra, hydra.hp * 10, hit);
    const heads = w.enemies.filter((e) => e.alive && e.def.id === 'boss_hydra');
    expect(heads.length).toBe(2);
    for (const h of heads) expect(h.maxHp).toBeCloseTo(hydra.maxHp * 0.45);
  });
});

describe('the line after a decided run', () => {
  it('ignores hits during the victory slow-motion and never enters Endless dead', () => {
    const w = makeWorld({ workshop: { bp_second_wind: 1 }, seed: 2 });
    w.finish(true);
    const hp = w.hp;
    w.hurt(1e6, 270);
    expect(w.hp).toBe(hp);
    expect(w.secondWindUsed).toBe(false);
    steps(w, 3);
    expect(w.state).toBe('over');
    w.hp = 0;
    w.continueEndless();
    expect(w.state).toBe('playing');
    expect(w.hp).toBeGreaterThanOrEqual(1);
  });

  it('Cryostasis freezes the field when a save catches a lethal hit', () => {
    const w = makeWorld({ flags: ['cryostasis'], seed: 3 });
    (w as unknown as { talents: Record<string, number> }).talents = { unbreakable: 1 };
    const e = w.spawnEnemy('grunt', 270, 300)!;
    w.hp = w.maxHp * 0.3;
    w.hurt(1e6, 270);
    expect(w.hp).toBe(1);
    expect(w.cryostasisUsed).toBe(true);
    expect(e.st.frozenT).toBeGreaterThan(0);
  });

  it('Second Wind still holds under Bloodless, at 1 HP and without healing', () => {
    const w = makeWorld({ workshop: { bp_second_wind: 3 }, pacts: ['no_heal'], seed: 4 });
    w.hurt(1e6, 270);
    expect(w.secondWindUsed).toBe(true);
    expect(w.hp).toBe(1);
    expect(w.state).not.toBe('over');
  });
});

describe('relics and pacts', () => {
  it('Soul Lantern stops at exactly +40% damage', () => {
    const w = makeWorld({ seed: 6 });
    const base = w.build.stats.damage;
    for (let k = 1; k <= 2000; k++) {
      w.killIndex = k;
      BEHAVIORS.relic_soul_lantern.onKill!(w, w.spawnEnemy('grunt', 270, 300)!, hit, 1);
    }
    expect(w.lanternStacks).toBe(40);
    expect(w.build.stats.damage / base).toBeCloseTo(1.4, 6);
  });

  it('Star Compass is never offered under Eclipse, where there is no Starfall', () => {
    const relicPool = ['star_compass'];
    expect(makeWorld({ relicPool }).relicChoices()).toContain('star_compass');
    expect(makeWorld({ relicPool, pacts: ['eclipse'], flags: ['pacts3'] }).relicChoices()).not.toContain('star_compass');
  });

  it('every-Nth-kill hooks read their own kill, even when a death kills again first', () => {
    const w = makeWorld({ seed: 8 });
    w.enemies.length = 0;
    const [a, b] = [w.spawnEnemy('grunt', 200, 300)!, w.spawnEnemy('grunt', 340, 300)!];
    const seen: number[] = [];
    const chain: Behavior = { onKill: (ww, e) => { if (e === a) damageEnemy(ww, b, 1e9, hit); } };
    const record: Behavior = { onKill: (ww) => { seen.push(ww.killIndex); } };
    w.bh.push([chain, 1], [record, 1]);
    damageEnemy(w, a, 1e9, hit);
    // The nested kill (#2) finishes first; the outer hook still sees kill #1.
    expect(seen).toEqual([2, 1]);
  });
});

describe('a finished build does not stop the fight', () => {
  it('resolves Repair/Salvage-only level-ups without opening a draft', () => {
    const w = makeWorld({ seed: 11 });
    // Ten maxed upgrades: nothing left to offer.
    for (const u of UPGRADES.filter((x) => !x.core && x.id !== 'extra_ball').slice(0, 10)) {
      while (w.build.level(u.id) < w.build.maxLevel(u.id)) w.build.addUpgrade(u.id);
    }
    w.onBuildChanged([]);
    // Keep evolutions out of it: an eligible evolution is a real choice and still opens the draft.
    w.build.eligibleEvolutions = () => [];
    let opened = 0;
    w.bus.on('levelUp', () => opened++);
    const coins = w.run.coinsCollected;
    w.pendingLevels = 2;
    steps(w, 0.1);
    expect(opened).toBe(0);
    expect(w.state).toBe('playing');
    expect(w.pendingLevels).toBe(0);
    expect(w.run.coinsCollected).toBe(coins + 50);
    // A damaged line repairs instead.
    w.hp = w.maxHp * 0.4;
    w.pendingLevels = 1;
    steps(w, 0.05);
    expect(w.hp).toBeGreaterThan(w.maxHp * 0.6);
  });
});

describe('Ascension bands', () => {
  it('opens ten levels per band: Abyss, Singularity, Eternity', () => {
    expect([3, 4, 6, 7, 8, 9].map(ascensionCap)).toEqual([0, 10, 10, 20, 20, 30]);
    expect([1, 10, 11, 20, 21, 30].map(ascensionDifficulty)).toEqual([4, 4, 7, 7, 9, 9]);
  });

  it('runConfig clamps the chosen level to the tier\'s band and the open ladder', () => {
    const p = defaultProfile();
    p.ascension = 25;
    const asc = (difficulty: number, ascension: number) => runConfig(p, { arena: 'proving', difficulty, pacts: [], seed: 1, ascension }).ascension;
    expect(asc(4, 25)).toBe(10);
    expect(asc(7, 25)).toBe(20);
    expect(asc(9, 25)).toBe(25);
    expect(asc(9, 30)).toBe(25);
  });
});

describe('run accounting', () => {
  const summary = (over: Record<string, unknown> = {}) => ({ ...makeWorld().summary(), ...over });

  it('a run abandoned at once does not count toward run contracts or run goals', () => {
    const p = defaultProfile();
    p.tutorialDone = true;
    applyRun(p, summary({ time: 5 }), [], undefined, undefined, { abandoned: true });
    expect(p.stats.runs).toBe(0);
    applyRun(p, summary({ time: 120 }), [], undefined, undefined, { abandoned: true });
    expect(p.stats.runs).toBe(1);
    applyRun(p, summary({ time: 5 }), []);
    expect(p.stats.runs).toBe(2);
  });

  it('the first Daily Seed run of the day sets the record without calling it a new best', () => {
    const p = defaultProfile();
    const day = '2026-11-20';
    expect(applyRun(p, summary({ daily: true, kills: 40, time: 100 }), [], day).daily?.newBest).toBe(false);
    expect(applyRun(p, summary({ daily: true, kills: 30, time: 100 }), [], day).daily?.newBest).toBe(false);
    expect(applyRun(p, summary({ daily: true, kills: 90, time: 100 }), [], day).daily?.newBest).toBe(true);
  });

  it('talent points that only locked tiers could hold do not light the red dot', () => {
    const p = defaultProfile();
    p.mastery.striker = 400000;
    expect(talentProgress(p).total).toBeGreaterThan(52);
    expect(talentPointsUsable(p)).toBeGreaterThan(0);
    // Learn everything a profile without an Abyss win can learn.
    for (let pass = 0; pass < 10; pass++) {
      for (const tl of TALENTS) {
        const next = changeTalent(p.talents, tl.id, 1, talentProgress(p).total, -1);
        if (next) p.talents = next;
      }
    }
    expect(talentProgress(p).total).toBeGreaterThan(Object.values(p.talents).reduce((a, b) => a + b, 0));
    expect(talentPointsUsable(p)).toBe(0);
  });
});

describe('dailies grow with the player', () => {
  it('contract targets, minimum tier and rewards follow difficulties won', () => {
    const def = CONTRACT_MAP.kills;
    expect(contractTarget(def, 0, false)).toBe(def.daily);
    expect(contractTarget(def, 10, false)).toBeGreaterThan(def.daily * 5);
    expect(contractTarget(CONTRACT_MAP.runs, 10, false)).toBe(CONTRACT_MAP.runs.daily);
    expect(contractMinDifficulty(0)).toBe(0);
    expect(contractMinDifficulty(1)).toBe(0);
    expect(contractMinDifficulty(10)).toBe(8);
    const coins = (tier: number) => contractRewards(0, tier).find((u) => u.type === 'coins')!;
    expect(coins(10).type === 'coins' && coins(0).type === 'coins' && coins(10).amount > coins(0).amount * 100).toBe(true);
  });

  it('a strong profile draws a hard board, and easy runs do not count toward it', () => {
    const p = defaultProfile();
    p.tutorialDone = true;
    p.cleared.proving = 9;
    const board = contractBoard(p, new Date('2026-11-20T12:00:00Z'));
    for (const slot of board.daily) expect(slot.tier).toBe(10);
    expect(contractText(board.daily[0])).toMatch(/Pandemonium or harder/);
    const before = board.daily.map((s) => s.progress);
    applyRun(p, { ...makeWorld().summary(), difficulty: 0, kills: 9999, time: 600, victory: true }, [], undefined, new Date('2026-11-20T13:00:00Z'));
    expect(p.contracts.daily.map((s) => s.progress)).toEqual(before);
  });

  it('the Daily Seed is played at the hardest tier won, with the Ascension and a pact of the day', () => {
    const p = defaultProfile();
    p.cleared.proving = 1;
    expect(dailyOptions(p, 123).difficulty).toBe(1);
    p.cleared.proving = 9;
    p.ascension = 23;
    p.stats.maxAscension = 22;
    p.researchNodes.push('risk_pacts');
    const o = dailyOptions(p, 123);
    expect(o.difficulty).toBe(9);
    expect(o.ascension).toBe(22);
    expect(o.pacts.length).toBe(1);
    expect(o.pacts).not.toContain('lone_ball');
    // The same day gives every such player the same pact.
    expect(dailyOptions(p, 123).pacts).toEqual(o.pacts);
    // Runs through runConfig unchanged: the tier's band allows it.
    expect(runConfig(p, o).ascension).toBe(22);
  });
});
