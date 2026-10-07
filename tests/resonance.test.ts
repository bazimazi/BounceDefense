import { describe, expect, it } from 'vitest';
import { stepBall } from '../src/sim/physics';
import { CIRCUIT_DURATION } from '../src/sim/resonance';
import { SIM_DT } from '../src/sim/types';
import { POWER_END, POWER_START, RECALL_COOLDOWN } from '../src/sim/world';
import { emptyWorld, steps } from './helpers';

describe('power shots', () => {
  it.each([0, POWER_START - .01, POWER_END + .01])('fires an ordinary shot after holding %ss', hold => {
    const w = emptyWorld(); w.beginAim(); w.aim.holdTime = hold; w.release(); w.step(SIM_DT);
    expect(w.balls[0].powered).toBe(false);
    expect(w.balls[0].dmgMult).toBe(1);
  });

  it.each([POWER_START, .75, POWER_END])('snapshots a power shot at %ss for the whole volley', hold => {
    const w = emptyWorld(); w.onBuildChanged(w.build.addUpgrade('extra_ball')); w.hand = 2;
    w.beginAim(); w.aim.holdTime = hold; w.release();
    steps(w, .12);
    expect(w.balls).toHaveLength(2);
    expect(w.balls.every(b => b.powered && b.dmgMult === 1.45 && b.momentum >= 5)).toBe(true);
    expect(w.powerQueue).toBe(0);
    expect(w.summary().powerShots).toBe(2);
  });

  it('keeps the power window available during a flight, then streams ordinary shots', () => {
    const w = emptyWorld(); w.onBuildChanged(w.build.addUpgrade('extra_ball'));
    w.spawnBall('main', 270, 450, 0, -1);
    w.beginAim(); steps(w, .7);
    expect(w.hand).toBe(1);
    expect(w.isPowerWindow()).toBe(true);
    steps(w, .6);
    expect(w.aim.streamed).toBe(true);
    expect(w.balls.every(b => !b.powered)).toBe(true);
  });
});

describe('tactical recall', () => {
  it('recovers main balls once without consuming shards or preserving momentum', () => {
    const w = emptyWorld(); w.hand = 0;
    const b = w.spawnBall('main', 100, 450, 1, -1)!; b.momentum = 30;
    const shard = w.spawnBall('shard', 350, 450, 0, -1)!;
    w.activateRecall(); w.activateRecall();
    expect(b.state).toBe('returning'); expect(b.momentum).toBe(0);
    expect(shard.state).toBe('flight'); expect(w.recallCooldown).toBe(RECALL_COOLDOWN);
    steps(w, .5);
    expect(w.hand).toBe(1); expect(w.savedMomentum).toHaveLength(0);
    steps(w, .5); expect(w.hand).toBe(1);
    expect(w.canRecall()).toBe(false);
    expect(w.summary().recalls).toBe(1);
  });

  it('does not mutate a paused level-up, an ending run, or an empty arena', () => {
    const w = emptyWorld(); w.activateRecall(); expect(w.recallCooldown).toBe(0);
    const b = w.spawnBall('main', 270, 500, 0, -1)!;
    w.state = 'levelup'; w.activateRecall(); expect(b.state).toBe('flight');
    w.state = 'playing'; w.endTimer = 1; w.activateRecall(); expect(b.state).toBe('flight');
  });
});

describe('resonance circuit', () => {
  it('offers reproducible routes and expires without granting rewards', () => {
    const a = emptyWorld({ seed: 51 }), b = emptyWorld({ seed: 51 });
    steps(a, 5.1); steps(b, 5.1);
    expect(a.resonance.nodes).toEqual(b.resonance.nodes);
    expect(a.resonance.nodes).toHaveLength(3);
    steps(a, CIRCUIT_DURATION);
    expect(a.resonance.nodes).toHaveLength(0);
    expect(a.resonance.completed).toBe(0);
    expect(a.buffs).toHaveLength(0);
  });

  it('only rewards each signal once and requires all three for starfall', () => {
    const w = emptyWorld(); steps(w, 5.1);
    const ball = w.spawnBall('main', 270, 500, 0, -1)!;
    const nodes = [...w.resonance.nodes];
    for (let i = 0; i < 2; i++) {
      ball.x = nodes[i].x; ball.y = nodes[i].y;
      w.resonance.touch(ball); w.resonance.touch(ball);
    }
    expect(w.resonance.lit).toBe(2); expect(w.surge.charge).toBe(20);
    expect(w.resonance.completed).toBe(0);
    ball.x = nodes[2].x; ball.y = nodes[2].y; w.resonance.touch(ball);
    expect(w.resonance.completed).toBe(1); expect(w.resonance.nodes).toHaveLength(0);
    expect(w.surge.charge).toBe(30); expect(w.buffs.map(b => b.id)).toContain('resonance');
    expect(w.fx.some(f => f.t === 'starfall')).toBe(true);
    expect(w.summary().starfalls).toBe(1);
  });

  it('detects fast passes through a signal without altering ball direction', () => {
    const w = emptyWorld(); steps(w, 5.1);
    const node = w.resonance.nodes[0];
    const ball = w.spawnBall('main', node.x, node.y + 100, 0, -1)!;
    w.build.tempMods = [{ stat: 'speed', mult: 5 }]; w.build.recompute();
    stepBall(w, ball, .06);
    expect(node.lit).toBe(true); expect(ball.dx).toBe(0); expect(ball.dy).toBe(-1);
  });

  it('prioritizes five approaching threats, clears bullets and honors Bloodless', () => {
    const w = emptyWorld({ pacts: ['no_heal', 'lone_ball'] }); steps(w, 5.1); w.hp = 50;
    const enemies = Array.from({ length: 6 }, (_, i) => w.spawnEnemy('brute', 70 + i * 75, 200 + i * 70)!);
    const hp = enemies.map(e => e.hp);
    w.spawnProjectile(80, 250, 0, 100, 10);
    const ball = w.spawnBall('main', 270, 700, 0, -1)!;
    for (const node of [...w.resonance.nodes]) { ball.x = node.x; ball.y = node.y; w.resonance.touch(ball); }
    expect(enemies[0].hp).toBe(hp[0]);
    expect(enemies.slice(1).every((e, i) => e.hp < hp[i + 1])).toBe(true);
    expect(w.projectiles[0].alive).toBe(false); expect(w.hp).toBe(50);
    expect(w.maxBallsAllowed()).toBe(1);
    // Pausing for an upgrade freezes the circuit and its buff clock.
    const remaining = w.resonance.overdrive; w.state = 'levelup'; steps(w, 3);
    expect(w.resonance.overdrive).toBe(remaining);
    w.state = 'playing'; w.pendingLevels = 0; w.pickups = []; w.enemies = []; steps(w, 7.1);
    expect(w.buffs.some(b => b.id === 'resonance')).toBe(false);
  });
});

describe('assault pacing', () => {
  it('brings the opening squad into play promptly', () => {
    const w = emptyWorld();
    // Restore only the director update that the geometry helper freezes.
    w.director.update = Object.getPrototypeOf(w.director).update.bind(w.director);
    steps(w, 2);
    expect(w.enemies).toHaveLength(3);
    expect(w.enemies.every(e => e.def.id === 'grunt')).toBe(true);
  });

  it('repeats seeded anomalies while deferring them during boss fights', () => {
    const w = emptyWorld({ arena: 'foundry' });
    w.director.update = Object.getPrototypeOf(w.director).update.bind(w.director);
    w.time = 65; w.director.update(SIM_DT);
    expect(w.eventsSeen).toHaveLength(1);
    expect(w.director.eventTime).toBeGreaterThanOrEqual(w.time + 85);
    expect(w.director.eventTime).toBeLessThanOrEqual(w.time + 105);
    w.event = null; w.time = w.director.eventTime + 1;
    w.director.bossActive = true; w.director.update(SIM_DT);
    expect(w.eventsSeen).toHaveLength(1);
    w.director.bossActive = false; w.director.update(SIM_DT);
    expect(w.eventsSeen).toHaveLength(2);
  });
});
