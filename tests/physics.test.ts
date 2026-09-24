import { describe, expect, it } from 'vitest';
import { reflect } from '../src/core/math';
import { enforceAngle, MIN_DY, stepBall, traceAim } from '../src/sim/physics';
import { FIELD_TOP, FLOOR_Y, SIM_DT, W } from '../src/sim/types';
import { emptyWorld, steps } from './helpers';

describe('reflection', () => {
  it('reflects off a vertical wall', () => {
    const out = { x: 0, y: 0 };
    reflect(1, 0.5, -1, 0, out);
    expect(out.x).toBeCloseTo(-1);
    expect(out.y).toBeCloseTo(0.5);
  });

  it('enforces a minimum vertical component to prevent endless horizontal loops', () => {
    const b = { dx: 1, dy: 0.01 };
    enforceAngle(b);
    expect(Math.abs(b.dy)).toBeCloseTo(MIN_DY);
    expect(Math.hypot(b.dx, b.dy)).toBeCloseTo(1);
    expect(b.dx).toBeGreaterThan(0);
  });
});

describe('ball movement', () => {
  it('bounces off the side walls and ceiling and stays inside the arena', () => {
    const w = emptyWorld();
    const b = w.spawnBall('main', 270, 700, 0.8, -0.6)!;
    b.floorBounces = 1000;
    for (let i = 0; i < 120 * 30; i++) {
      stepBall(w, b, SIM_DT);
      expect(b.x).toBeGreaterThanOrEqual(b.r - 0.5);
      expect(b.x).toBeLessThanOrEqual(W - b.r + 0.5);
      expect(b.y).toBeGreaterThanOrEqual(FIELD_TOP + b.r - 0.5);
    }
    expect(b.wallBounces).toBeGreaterThan(10);
  });

  it('does not tunnel through walls at extreme speed', () => {
    const w = emptyWorld();
    w.build.tempMods = [{ stat: 'speed', mult: 5 }];
    w.build.recompute();
    const b = w.spawnBall('main', 270, 500, 1, -0.2)!;
    for (let i = 0; i < 600; i++) {
      stepBall(w, b, SIM_DT);
      if (b.state !== 'flight') break;
      expect(b.x).toBeLessThanOrEqual(W);
      expect(b.x).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns main balls to the launcher at the floor and restores the hand', () => {
    const w = emptyWorld();
    w.hand = 0;
    const b = w.spawnBall('main', 270, FLOOR_Y - 5, 0.2, 1)!;
    steps(w, 1);
    expect(b.dead).toBe(true);
    expect(w.hand).toBe(1);
  });

  it('safety net bounces the ball off the floor instead of returning it', () => {
    const w = emptyWorld();
    const b = w.spawnBall('main', 270, FLOOR_Y - 5, 0.2, 1)!;
    b.floorBounces = 1;
    stepBall(w, b, SIM_DT * 4);
    expect(b.state).toBe('flight');
    expect(b.dy).toBeLessThan(0);
    expect(b.floorBounces).toBe(0);
  });

  it('temporary shards die at the floor', () => {
    const w = emptyWorld();
    const b = w.spawnBall('shard', 270, FLOOR_Y - 5, 0, 1)!;
    stepBall(w, b, SIM_DT * 4);
    expect(b.dead).toBe(true);
  });

  it('bounces off enemies and damages them', () => {
    const w = emptyWorld();
    const e = w.spawnEnemy('brute', 270, 400)!;
    e.spawnT = 1;
    const hp = e.hp;
    w.grid.clear();
    w.grid.insert(e);
    const b = w.spawnBall('main', 270, 600, 0, -1)!;
    for (let i = 0; i < 60; i++) stepBall(w, b, SIM_DT);
    expect(e.hp).toBeLessThan(hp);
    expect(b.dy).toBeGreaterThan(0); // reflected back down
  });

  it('aim preview matches the actual path of the ball', () => {
    const w = emptyWorld();
    w.setAim(0.6, -1);
    const pts: number[] = [];
    traceAim(w, 900, 2, pts);
    // first bounce point from the trace
    const bx = pts[2];
    const by = pts[3];
    const b = w.spawnBall('main', pts[0], pts[1], w.aim.dx, w.aim.dy)!;
    let hitWall = false;
    for (let i = 0; i < 600 && !hitWall; i++) {
      const before = b.wallBounces;
      stepBall(w, b, SIM_DT / 4);
      if (b.wallBounces > before) {
        hitWall = true;
        expect(Math.hypot(b.x - bx, b.y - by)).toBeLessThan(12);
      }
    }
    expect(hitWall).toBe(true);
  });
});
