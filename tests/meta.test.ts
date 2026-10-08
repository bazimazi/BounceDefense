import { describe, expect, it } from 'vitest';
import { masteryLevel, masteryXpFor } from '../src/data/meta';
import {
  applyRun, buyWorkshop, canUnlockCore, computeRewards, doResearch, isArenaUnlocked, maxDifficulty, nextGoals,
  runConfig, unlockCore, upgradePool,
} from '../src/meta/progress';
import { defaultProfile, loadProfile, migrate, saveProfile, SAVE_KEY, type KeyValueStore } from '../src/meta/profile';
import type { RunSummary } from '../src/meta/types';
import { xpForLevel } from '../src/sim/world';
import { makeWorld } from './helpers';

function memStore(): KeyValueStore & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}

function summary(over: Partial<RunSummary> = {}): RunSummary {
  const w = makeWorld();
  return { ...w.summary(), ...over };
}

describe('run progression', () => {
  it('xp requirements increase monotonically', () => {
    for (let l = 1; l < 60; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
  });

  it('collecting xp levels up and queues upgrade choices', () => {
    const w = makeWorld();
    w.gainXp(xpForLevel(1) + xpForLevel(2) + 0.5);
    expect(w.level).toBe(3);
    expect(w.pendingLevels).toBe(2);
  });

  it('mastery levels are derived from xp', () => {
    expect(masteryLevel(0).level).toBe(1);
    expect(masteryLevel(masteryXpFor(1)).level).toBe(2);
    expect(masteryLevel(1e9).level).toBe(20);
  });
});

describe('rewards', () => {
  it('a failed run still pays out', () => {
    const r = computeRewards(summary({ victory: false, kills: 100, time: 200, coinsCollected: 20 }), 0);
    expect(r.coins).toBeGreaterThan(0);
    expect(r.masteryXp).toBeGreaterThan(0);
  });

  it('victory, difficulty and pacts increase rewards', () => {
    const base = computeRewards(summary({ kills: 100, time: 300 }), 0).coins;
    expect(computeRewards(summary({ kills: 100, time: 300, victory: true }), 0).coins).toBeGreaterThan(base);
    expect(computeRewards(summary({ kills: 100, time: 300, difficulty: 2 }), 0).coins).toBeGreaterThan(base);
    expect(computeRewards(summary({ kills: 100, time: 300, pacts: ['haste'] }), 0).coins).toBeGreaterThan(base);
  });
});

describe('meta progression', () => {
  it('applyRun merges stats, discoveries and unlocks achievements', () => {
    const p = defaultProfile();
    const s = summary({ kills: 120, bestCombo: 70, time: 300 });
    const report = applyRun(p, s, [{ cat: 'synergies', id: 'shatter' }, { cat: 'reactions', id: 'steam_burst' }]);
    expect(p.stats.kills).toBe(120);
    expect(p.discoveries.synergies).toContain('shatter');
    expect(report.rewards.research).toBeGreaterThanOrEqual(2);
    expect(p.achievements).toContain('first_hundred'); // 100 kills
    expect(p.unlockedParts).toContain('shell_titan');
    expect(p.achievements).toContain('combo_reactor');
    expect(p.unlockedUpgrades).toContain('combo_engine');
    expect(report.goals.length).toBeGreaterThan(0);
    expect(p.tutorialDone).toBe(true);
  });

  it('defeating a boss unlocks the next arena and difficulty', () => {
    const p = defaultProfile();
    expect(isArenaUnlocked(p, 'foundry')).toBe(false);
    const report = applyRun(p, summary({ victory: true, bossesDefeated: ['fortress'], bossFightTimes: [60] }), []);
    expect(isArenaUnlocked(p, 'foundry')).toBe(true);
    expect(report.arenaUnlocked).toBe('The Foundry');
    expect(maxDifficulty(p)).toBe(1);
    expect(p.challenges).toContain('speed_demon');
  });

  it('cores unlock with currency and requirements', () => {
    const p = defaultProfile();
    expect(canUnlockCore(p, 'pyro')).toBe(false);
    p.cores = 3;
    expect(unlockCore(p, 'pyro')).toBe(true);
    expect(p.cores).toBe(0);
    p.cores = 99;
    expect(canUnlockCore(p, 'void')).toBe(false); // requires defeating the Magnetar
    p.bossKills.magnetar = 1;
    expect(canUnlockCore(p, 'void')).toBe(true);
  });

  it('research expands the upgrade pool and grants flags', () => {
    const p = defaultProfile();
    p.research = 10;
    expect(upgradePool(p)).not.toContain('frostbite');
    doResearch(p, 'cryogenics');
    expect(upgradePool(p)).toContain('frostbite');
    expect(doResearch(p, 'banish')).toEqual([]); // prerequisite missing
    doResearch(p, 'reroll_1');
    doResearch(p, 'banish');
    const cfg = runConfig(p, { arena: 'proving', difficulty: 0, pacts: [], seed: 1 });
    expect(cfg.flags).toContain('banish');
  });

  it('workshop purchases cost coins and cap at max level', () => {
    const p = defaultProfile();
    p.coins = 1e6;
    for (let i = 0; i < 10; i++) buyWorkshop(p, 'hull');
    expect(p.workshop.hull).toBe(5);
  });

  it('next goals are few and varied', () => {
    const goals = nextGoals(defaultProfile(), 3);
    expect(goals.length).toBe(3);
  });
});

describe('save system', () => {
  it('round-trips the profile', () => {
    const store = memStore();
    const p = defaultProfile();
    p.coins = 1234;
    p.discoveries.enemies.push('grunt');
    saveProfile(store, p);
    expect(loadProfile(store)).toEqual(p);
  });

  it('migrates old saves and fills missing fields', () => {
    const old = { version: 0, gold: 500, loadout: { core: 'pyro', shell: 'shell_std', impact: 'impact_std', momentum: 'mom_std' },
      settings: { sfx: .25, shake: false, obsoleteEffect: true } };
    const p = migrate(old);
    expect(p.coins).toBe(500);
    expect(p.loadout.trail).toBe('classic');
    expect(p.stats.runs).toBe(0);
    expect(p.unlockedCores).toContain('striker');
    expect(p.settings).toEqual({ ...defaultProfile().settings, sfx: .25, shake: false });
  });

  it('recovers from a corrupted save using the backup', () => {
    const store = memStore();
    const p = defaultProfile();
    p.coins = 77;
    saveProfile(store, p);
    saveProfile(store, p); // creates backup
    store.data[SAVE_KEY] = '{corrupt';
    expect(loadProfile(store).coins).toBe(77);
  });

  it('never throws on garbage', () => {
    expect(migrate(null).coins).toBe(0);
    expect(migrate('nope').version).toBe(defaultProfile().version);
  });
});
