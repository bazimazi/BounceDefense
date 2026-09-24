import { describe, expect, it } from 'vitest';
import { applyBurn, applyChill, chainLightning, damageEnemy, explode } from '../src/sim/combat';
import { emptyWorld } from './helpers';

function rebuildGrid(w: ReturnType<typeof emptyWorld>) {
  w.grid.clear();
  for (const e of w.enemies) w.grid.insert(e);
}

describe('damage calculation', () => {
  it('armor reduces flat damage but never below 15%', () => {
    const w = emptyWorld();
    const e = w.spawnEnemy('brute', 200, 300)!;
    e.armor = 10;
    const hp = e.hp;
    damageEnemy(w, e, 20, { src: 'ball', crit: false, depth: 0 });
    expect(hp - e.hp).toBeCloseTo(10);
    const hp2 = e.hp;
    damageEnemy(w, e, 5, { src: 'ball', crit: false, depth: 0 });
    expect(hp2 - e.hp).toBeCloseTo(0.75);
  });

  it('burn and bleed ignore armor', () => {
    const w = emptyWorld();
    const e = w.spawnEnemy('brute', 200, 300)!;
    e.armor = 50;
    const hp = e.hp;
    damageEnemy(w, e, 10, { src: 'burn', crit: false, depth: 0 });
    expect(hp - e.hp).toBeCloseTo(10);
  });

  it('armor penetration offsets armor', () => {
    const w = emptyWorld();
    w.build.addUpgrade('armor_breaker');
    const e = w.spawnEnemy('brute', 200, 300)!;
    e.armor = 5;
    const hp = e.hp;
    damageEnemy(w, e, 20, { src: 'ball', crit: false, depth: 0 });
    expect(hp - e.hp).toBeCloseTo(20);
  });

  it('elite energy shields absorb damage first', () => {
    const w = emptyWorld();
    const e = w.spawnEnemy('grunt', 200, 300, { elite: ['shielded'] })!;
    const hp = e.hp;
    const shield = e.shieldHp;
    damageEnemy(w, e, shield / 2, { src: 'ball', crit: false, depth: 0 });
    expect(e.hp).toBe(hp);
    expect(e.shieldHp).toBeCloseTo(shield / 2);
  });

  it('kills drop xp and count toward run stats', () => {
    const w = emptyWorld();
    const e = w.spawnEnemy('grunt', 200, 300)!;
    damageEnemy(w, e, 1e6, { src: 'explosion', crit: false, depth: 0 });
    expect(e.alive).toBe(false);
    expect(w.run.kills).toBe(1);
    expect(w.run.explosionKills).toBe(1);
    expect(w.pickups.some((p) => p.kind === 'xp')).toBe(true);
  });

  it('splitters split into smaller enemies on death', () => {
    const w = emptyWorld();
    const e = w.spawnEnemy('splitter', 200, 300)!;
    damageEnemy(w, e, 1e6, { src: 'ball', crit: false, depth: 0 });
    expect(w.enemies.filter((x) => x.def.id === 'splitling').length).toBe(2);
  });

  it('lifesteal heals the player', () => {
    const w = emptyWorld();
    w.build.addUpgrade('vampiric');
    w.hp = 50;
    w.healBudget = 100;
    const e = w.spawnEnemy('brute', 200, 300)!;
    e.armor = 0;
    damageEnemy(w, e, 50, { src: 'ball', crit: false, depth: 0 });
    expect(w.hp).toBeCloseTo(51);
  });
});

describe('elements & reactions', () => {
  it('three chill stacks freeze an enemy', () => {
    const w = emptyWorld();
    const e = w.spawnEnemy('grunt', 200, 300)!;
    applyChill(w, e, 1, 0);
    applyChill(w, e, 1, 0);
    expect(e.st.frozenT).toBe(0);
    applyChill(w, e, 1, 0);
    expect(e.st.frozenT).toBeGreaterThan(0);
    expect(w.run.frozenCount).toBe(1);
  });

  it('burning a chilled enemy triggers Steam Burst and records the discovery', () => {
    const w = emptyWorld();
    const e = w.spawnEnemy('brute', 200, 300)!;
    const n = w.spawnEnemy('brute', 230, 300)!;
    rebuildGrid(w);
    applyChill(w, e, 1, 0);
    const hp = n.hp;
    applyBurn(w, e, 10, 0);
    expect(w.reactionsRun.has('steam_burst')).toBe(true);
    expect(w.newDiscoveries.some((d) => d.id === 'steam_burst')).toBe(true);
    expect(n.hp).toBeLessThan(hp); // splash damage
    expect(e.st.chill).toBe(0);
  });

  it('chain lightning jumps between nearby enemies but not far ones', () => {
    const w = emptyWorld();
    const a = w.spawnEnemy('brute', 100, 300)!;
    const b = w.spawnEnemy('brute', 180, 300)!;
    const c = w.spawnEnemy('brute', 260, 300)!;
    const far = w.spawnEnemy('brute', 500, 700)!;
    rebuildGrid(w);
    const [hb, hc, hf] = [b.hp, c.hp, far.hp];
    chainLightning(w, a, 10, 5, 1);
    expect(b.hp).toBeLessThan(hb);
    expect(c.hp).toBeLessThan(hc);
    expect(far.hp).toBe(hf);
  });

  it('lightning on a burning enemy triggers Overload', () => {
    const w = emptyWorld();
    const a = w.spawnEnemy('brute', 100, 300)!;
    const b = w.spawnEnemy('brute', 170, 300)!;
    rebuildGrid(w);
    applyBurn(w, b, 5, 0);
    chainLightning(w, a, 10, 2, 1);
    expect(w.reactionsRun.has('overload')).toBe(true);
  });

  it('explosions damage everything in radius and chain barrels', () => {
    const w = emptyWorld();
    const a = w.spawnEnemy('grunt', 200, 300)!;
    const b = w.spawnEnemy('grunt', 330, 300)!;
    w.obstacles.push({ kind: 'barrel', x: 260, y: 300, r: 15, alive: true, respawn: 0 });
    rebuildGrid(w);
    const hb = b.hp;
    explode(w, 200, 300, 70, 1, 1, {});
    expect(w.run.barrelsExploded).toBe(1);
    expect(b.hp).toBeLessThan(hb);
    void a;
  });

  it('explosion cascades are bounded per step', () => {
    const w = emptyWorld();
    w.build.tempMods = [{ stat: 'chainReaction', add: 1 }];
    w.build.recompute();
    for (let i = 0; i < 100; i++) w.spawnEnemy('grunt', 30 + (i % 10) * 50, 150 + Math.floor(i / 10) * 50);
    rebuildGrid(w);
    expect(() => explode(w, 270, 300, 80, 1e6, 1, {})).not.toThrow();
    expect(w.explosionsThisStep).toBeLessThanOrEqual(17);
  });
});
