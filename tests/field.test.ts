import { describe, expect, it } from 'vitest';
import { damageEnemy } from '../src/sim/combat';
import { BOUNTY, WEAK_POINT, hasWeakPoint } from '../src/sim/world';
import { emptyWorld, makeWorld, steps } from './helpers';

describe('Bounty marks', () => {
  it('marks the toughest enemy in the upper field, and a kill pays coins, gems and Surge', () => {
    const w = makeWorld({ seed: 4 });
    w.director.update = function (this: typeof w.director, dt: number) { (this as unknown as { updateBounties(dt: number): void }).updateBounties(dt); };
    const small = w.spawnEnemy('grunt', 150, 300)!;
    const big = w.spawnEnemy('brute', 350, 300)!;
    w.director.bountyTimer = 0.01;
    steps(w, 0.05);
    expect(big.bounty).toBeGreaterThan(0);
    expect(small.bounty).toBe(0);
    const coins = w.pickups.filter((p) => p.kind === 'coin').length;
    const surge = w.surge.charge;
    damageEnemy(w, big, 1e9, { src: 'spark', crit: false, depth: 1 });
    expect(w.run.bounties).toBe(1);
    // A swift kill (more than half the mark left) doubles the drop.
    expect(w.pickups.filter((p) => p.kind === 'coin').length - coins).toBeGreaterThanOrEqual(BOUNTY.coins * 2);
    expect(w.surge.charge).toBeGreaterThan(surge);
    expect(w.summary().bounties).toBe(1);
  });

  it('expires without paying, and never marks during a boss fight or the tutorial', () => {
    const w = makeWorld({ seed: 5 });
    const e = w.spawnEnemy('brute', 270, 300)!;
    e.bounty = 0.05;
    w.director.update = function (this: typeof w.director, dt: number) { (this as unknown as { updateBounties(dt: number): void }).updateBounties(dt); };
    steps(w, 0.2);
    expect(e.bounty).toBe(0);
    damageEnemy(w, e, 1e9, { src: 'spark', crit: false, depth: 1 });
    expect(w.run.bounties).toBe(0);
    const t = makeWorld({ tutorial: true });
    t.spawnEnemy('brute', 270, 300);
    t.director.bountyTimer = 0;
    (t.director as unknown as { updateBounties(dt: number): void }).updateBounties(0.1);
    expect(t.enemies.some((x) => x.bounty > 0)).toBe(false);
  });
});

describe('Linker tethers', () => {
  it('pairs the Linkers of a squad and the tether deflects balls until one falls', () => {
    const w = emptyWorld({ seed: 2 });
    w.director.spawnSquad({ id: 'tether_pair', members: [['linker', 2]], formation: 'line', minTime: 0, weight: 1 });
    const [a, b] = w.enemies.filter((e) => e.def.ai === 'linker');
    expect(a.partner).toBe(b.id);
    expect(b.partner).toBe(a.id);
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(100);
    a.y = b.y = 400;
    a.spawnT = b.spawnT = 5;
    const mid = (a.x + b.x) / 2;
    // A ball fired straight up under the middle of the tether comes back down without touching either body.
    const ball = w.spawnBall('main', mid, 600, 0, -1)!;
    let minY = Infinity;
    for (let i = 0; i < 60; i++) {
      w.step(1 / 120);
      minY = Math.min(minY, ball.y);
    }
    expect(minY).toBeGreaterThan(380);
    expect(ball.dy).toBeGreaterThan(0);
    // With one Linker gone the beam falls.
    damageEnemy(w, a, 1e9, { src: 'spark', crit: false, depth: 1 });
    w.step(1 / 120);
    expect(w.dynSegments.some((s) => s.kind === 'shield')).toBe(false);
    expect(w.tetherPartner(b)).toBeNull();
  });
});

describe('Prism gates', () => {
  it('split a launched ball into two short-lived shards, once per pass; shards pass untouched', () => {
    const w = emptyWorld({ seed: 3 });
    w.obstacles.push({ kind: 'prism', x: 270, y: 500, r: 22, flash: 0 });
    const ball = w.spawnBall('main', 270, 600, 0, -1)!;
    steps(w, 0.3);
    const shards = w.balls.filter((b) => b.kind === 'shard');
    expect(shards.length).toBe(2);
    expect(shards.every((s) => s.life > 0 && s.life <= 4 && s.prism)).toBe(true);
    expect(ball.dy).toBeLessThan(0);
    steps(w, 0.2);
    expect(w.balls.filter((b) => b.kind === 'shard').length).toBe(2);
  });
});

describe('Weak points', () => {
  it('a ball striking an elite inside its weak arc deals bonus damage, then the spot closes and turns away', () => {
    const hit = (angleOff: number) => {
      const w = emptyWorld({ seed: 7 });
      const e = w.director.spawnElite(1, 1, 'brute')!;
      e.x = 270; e.y = 400; e.spawnT = 5; e.armor = 0; e.hp = e.maxHp = 1e9; e.shieldHp = 0;
      e.weakA = Math.PI / 2 + angleOff; // facing down, toward a ball coming from below
      const ball = w.spawnBall('main', 270, 400 + e.r + 12, 0, -1)!;
      ball.dmgMult = 1;
      const before = e.hp;
      w.rng.chance = () => false; // no crits, no procs
      for (let i = 0; i < 20 && e.hp === before; i++) w.step(1 / 120);
      return { dealt: before - e.hp, e, w };
    };
    const weak = hit(0);
    const plain = hit(Math.PI);
    expect(weak.w.run.weakHits).toBe(1);
    expect(plain.w.run.weakHits).toBe(0);
    expect(weak.dealt / plain.dealt).toBeCloseTo(WEAK_POINT.mult, 1);
    expect(weak.e.weakCd).toBeGreaterThan(0);
    expect(Math.abs(weak.e.weakA - (Math.PI / 2 + Math.PI))).toBeLessThan(0.05);
  });

  it('ordinary enemies have none', () => {
    const w = makeWorld();
    const e = w.spawnEnemy('grunt', 200, 300)!;
    expect(hasWeakPoint(e)).toBe(false);
  });
});
