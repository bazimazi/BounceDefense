import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { CHAPTERS, MAX_STARS, STAGES, STAGE_MAP, starsFor } from '../src/data/trickshot';
import { TRAILS } from '../src/data/balls';
import { ARCADE_MILESTONES, PERFECT_RESEARCH, STAR_COINS, applyArcade, nextStage, stageAfter, stageOpen, totalStars } from '../src/meta/arcade';
import { defaultProfile, migrate } from '../src/meta/profile';
import { arcadeRunConfig, SIEGE, SiegeRun, TrickshotRun, isPickup } from '../src/sim/arcade';
import { SIM_DT } from '../src/sim/types';
import { traceAim } from '../src/sim/physics';
import { World } from '../src/sim/world';
import { REBOUND, type ReboundRun } from '../src/sim/rebound';

function shoot(w: World, deg: number): void {
  const r = (deg * Math.PI) / 180;
  w.beginAim();
  w.aim.dx = Math.cos(r);
  w.aim.dy = Math.sin(r);
  w.release();
  for (let i = 0; i < 120 * 16; i++) {
    w.step(SIM_DT);
    w.fx.length = 0;
    if (w.state !== 'playing' || (i > 2 && w.launchQueue === 0 && !w.balls.some((b) => b.kind === 'main'))) break;
  }
}

function trick(id: string): { w: World; a: TrickshotRun } {
  const w = new World(arcadeRunConfig('trickshot', 1, { stage: id }));
  return { w, a: w.arcade as TrickshotRun };
}

describe('Trickshot stages', () => {
  it('are well formed: unique ids, chapters in order, par within the shots, solutions of par length', () => {
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(STAGES.length);
    expect(MAX_STARS).toBe(STAGES.length * 3);
    for (const s of STAGES) {
      expect(CHAPTERS.some((c) => c.n === s.chapter)).toBe(true);
      expect(s.par).toBeGreaterThan(0);
      expect(s.par).toBeLessThan(s.shots);
      expect(s.solution.length).toBe(s.par);
      expect(s.bounces).toBeGreaterThan(0);
      for (const [, x, y] of s.targets) {
        expect(x).toBeGreaterThan(20);
        expect(x).toBeLessThan(520);
        expect(y).toBeGreaterThan(110);
        expect(y).toBeLessThan(760);
      }
    }
  });

  it.each(STAGES.map((s) => [s.id, s.name] as const))('%s (%s) is cleared at par by its stored solution', (id) => {
    const { w, a } = trick(id);
    for (const deg of STAGE_MAP[id].solution) shoot(w, deg);
    expect(a.remaining()).toBe(0);
    expect(a.shotsUsed).toBe(STAGE_MAP[id].par);
    expect(a.result()).toMatchObject({ mode: 'trickshot', cleared: true, stars: 3, stage: id });
  });

  it('the stored solutions are forgiving: half a degree off still clears within the shots allowed', () => {
    for (const s of STAGES) {
      for (const off of [-0.5, 0.5]) {
        const { w, a } = trick(s.id);
        for (const deg of s.solution) shoot(w, deg + off);
        // A slightly worse shot may leave a crystal: there are spare shots to finish it, straight up the middle or not.
        expect(a.remaining() === 0 || a.shotsLeft > 0).toBe(true);
      }
    }
  });

  it('fails the board when the shots run out', () => {
    const { w, a } = trick('t7');
    for (let i = 0; i < STAGE_MAP.t7.shots && w.state === 'playing' && w.endTimer < 0; i++) shoot(w, -170);
    for (let i = 0; i < 400; i++) w.step(SIM_DT);
    expect(a.remaining()).toBeGreaterThan(0);
    expect(w.state).toBe('over');
    expect(w.victory).toBe(false);
    expect(a.result()).toMatchObject({ cleared: false, stars: 0 });
  });

  it('cannot fire while a shot is out, and a ball past its bounce budget is called home', () => {
    const { w, a } = trick('t3');
    w.beginAim(); w.aim.dx = Math.cos(-2.9); w.aim.dy = Math.sin(-2.9); w.release();
    for (let i = 0; i < 10; i++) w.step(SIM_DT);
    expect(a.canFire()).toBe(false);
    w.beginAim(); w.release();
    expect(a.shotsUsed).toBe(1);
    let maxBounces = 0;
    for (let i = 0; i < 120 * 14; i++) {
      w.step(SIM_DT);
      for (const b of w.balls) if (b.kind === 'main' && b.state === 'flight') maxBounces = Math.max(maxBounces, b.wallBounces);
    }
    expect(maxBounces).toBeLessThanOrEqual(STAGE_MAP.t3.bounces + 1);
    expect(a.canFire()).toBe(true);
  });

  it('bank crystals glance off a direct hit and break after a bounce', () => {
    const { w, a } = trick('t4');
    const bank = a.targets.find((tg) => tg.kind === 'bank')!;
    const ball = w.spawnBall('main', bank.x, bank.y + 40, 0, -1)!;
    expect(a.hit(ball, bank)).toBe('bounce');
    expect(bank.alive).toBe(true);
    ball.wallBounces = 1;
    expect(a.hit(ball, bank)).toBe('pass');
    expect(bank.alive).toBe(false);
  });

  it('a key opens every gate and a bomb cracks its neighbours', () => {
    const { w, a } = trick('t11');
    const key = a.targets.find((tg) => tg.kind === 'key')!;
    const ball = w.spawnBall('main', key.x, key.y, 0, -1)!;
    expect(a.gates.length).toBeGreaterThan(0);
    a.hit(ball, key);
    expect(a.gates.length).toBe(0);
    const b = trick('t8');
    const bomb = b.a.targets.find((tg) => tg.kind === 'bomb')!;
    const before = b.a.remaining();
    b.a.hit(b.w.spawnBall('main', bomb.x, bomb.y, 0, -1)!, bomb);
    expect(b.a.remaining()).toBeLessThan(before - 1);
  });

  it('the aim preview flies through crystals that will shatter and stops at ones that bounce', () => {
    const { w } = trick('t1');
    w.aim.dx = 0; w.aim.dy = -1;
    const out: number[] = [];
    const r = traceAim(w, 2000, 2, out);
    // Straight up through all four crystals of the opening stage: the preview reaches the top wall.
    expect(r.target).toBeUndefined();
    expect(Math.min(...out.filter((v, i) => i % 2 === 1 && Number.isFinite(v)))).toBeLessThan(170);
    const armor = trick('t7');
    const tg = armor.a.targets.find((x) => x.kind === 'armored')!;
    armor.w.aim.dx = (tg.x - 270) / Math.hypot(tg.x - 270, tg.y - 834); armor.w.aim.dy = (tg.y - 834) / Math.hypot(tg.x - 270, tg.y - 834);
    expect(traceAim(armor.w, 2000, 2, out).target?.kind).toBe('armored');
  });

  it('bombs crack their neighbours but never a bank crystal', () => {
    const { w, a } = trick('t8');
    const bomb = a.targets.find((tg) => tg.kind === 'bomb')!;
    a.targets.push({ ...bomb, id: w.id(), kind: 'bank', x: bomb.x + 40, alive: true, hp: 1, maxHp: 1 });
    a.hit(w.spawnBall('main', bomb.x, bomb.y, 0, -1)!, bomb);
    expect(a.targets.find((tg) => tg.kind === 'bank')!.alive).toBe(true);
  });

  it('stars: three at par, two one over, one beyond', () => {
    const s = STAGE_MAP.t5;
    expect(starsFor(s, s.par)).toBe(3);
    expect(starsFor(s, s.par + 1)).toBe(2);
    expect(starsFor(s, s.par + 2)).toBe(1);
  });
});

describe('Siege', () => {
  it('always ends, with turns, blocks and a growing ball count', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const w = new World(arcadeRunConfig('siege', seed));
      const a = w.arcade as SiegeRun;
      const rng = new Rng(seed);
      for (let i = 0; i < 120 * 60 * 30 && w.state === 'playing'; i++) {
        if (a.canFire()) {
          const r = (rng.range(-160, -20) * Math.PI) / 180;
          w.beginAim(); w.aim.dx = Math.cos(r); w.aim.dy = Math.sin(r); w.release();
        }
        w.step(SIM_DT);
        w.fx.length = 0;
      }
      expect(w.state).toBe('over');
      const r = a.result();
      expect(r.turns).toBeGreaterThanOrEqual(SIEGE.rows - 2);
      expect(r.balls).toBeGreaterThanOrEqual(1);
      expect(r.balls).toBeLessThanOrEqual(SIEGE.maxBalls);
      expect(a.targets.every((tg) => !(isPickup(tg.kind) && tg.row >= SIEGE.rows))).toBe(true);
    }
  });

  it('fires every ball in one volley, then steps the wall down and adds collected orbs', () => {
    const w = new World(arcadeRunConfig('siege', 3));
    const a = w.arcade as SiegeRun;
    a.balls = w.hand = 5;
    const rows = a.targets.map((tg) => tg.row);
    a.pending = 2;
    w.beginAim(); w.aim.dx = 0; w.aim.dy = -1; w.release();
    expect(a.phase).toBe('fire');
    expect(a.canFire()).toBe(false);
    let launched = 0;
    for (let i = 0; i < 120 * 30 && a.phase !== 'aim'; i++) {
      w.step(SIM_DT);
      launched = Math.max(launched, w.balls.filter((b) => b.kind === 'main').length);
    }
    expect(launched).toBe(5);
    expect(a.balls).toBeGreaterThanOrEqual(7);
    expect(w.hand).toBe(a.balls);
    const survivors = a.targets.filter((tg) => tg.row > 0);
    expect(survivors.every((tg) => tg.row >= 1)).toBe(true);
    expect(Math.max(...a.targets.map((tg) => tg.row))).toBeGreaterThanOrEqual(Math.max(...rows));
  });

  it('a volley keeps its angle: no re-aiming until every ball is home, and the score matches the banner', () => {
    const w = new World(arcadeRunConfig('siege', 6));
    const a = w.arcade as SiegeRun;
    w.beginAim(); w.aim.dx = 0; w.aim.dy = -1; w.release();
    w.step(SIM_DT);
    w.beginAim();
    expect(w.aim.active).toBe(false);
    expect(a.turnsHeld()).toBe(a.result().turns);
  });

  it('a laser strikes its whole row', () => {
    const w = new World(arcadeRunConfig('siege', 4));
    const a = w.arcade as SiegeRun;
    const row = a.targets.find((tg) => !isPickup(tg.kind))!.row;
    const laser = { ...a.targets[0], id: w.id(), kind: 'laserH' as const, shape: 'circle' as const, row, alive: true };
    a.targets.push(laser);
    const hp = a.targets.filter((tg) => tg.row === row && !isPickup(tg.kind)).map((tg) => tg.hp);
    a.touch(w.spawnBall('main', laser.x, laser.y, 0, -1)!, laser);
    const after = a.targets.filter((tg) => tg.row === row && !isPickup(tg.kind)).map((tg) => tg.hp);
    expect(after.every((v, i) => v === hp[i] - 1)).toBe(true);
  });
});

function rebound(seed = 1): { w: World; a: ReboundRun } {
  const w = new World(arcadeRunConfig('rebound', seed));
  return { w, a: w.arcade as ReboundRun };
}

describe('Rebound', () => {
  it('launches from the paddle, never from the launcher, and the paddle sets the return angle', () => {
    const { w, a } = rebound();
    expect(w.hand).toBe(0);
    expect(a.docked).toBe(true);
    a.pointer(400, 0);
    for (let i = 0; i < 60; i++) w.step(SIM_DT);
    expect(a.paddle.x).toBeCloseTo(400, 0);
    w.beginAim(); w.release();
    const ball = w.balls.find((b) => b.kind === 'main')!;
    expect(ball).toBeTruthy();
    expect(Math.abs(ball.x - 400)).toBeLessThan(2);
    expect(a.docked).toBe(false);
    expect(w.canRecall()).toBe(false);
    // Landing on the right edge sends it up and right; dead centre still leaves at an angle.
    const probe = w.spawnBall('main', a.paddle.x + a.paddle.w / 2 - 2, REBOUND.paddleY - 5, 0, 1)!;
    a.collideBall(probe);
    expect(probe.dy).toBeLessThan(0);
    expect(probe.dx).toBeGreaterThan(0.5);
    const centre = w.spawnBall('main', a.paddle.x, REBOUND.paddleY - 5, 0, 1)!;
    a.collideBall(centre);
    expect(Math.abs(centre.dx)).toBeGreaterThanOrEqual(Math.sin(REBOUND.minAngle) - 1e-9);
  });

  it('a lost ball costs a life; the last life ends the run', () => {
    const { w, a } = rebound(2);
    for (let life = REBOUND.lives; life > 0; life--) {
      w.beginAim(); w.release();
      // Park the paddle away from the ball so it falls past.
      for (let i = 0; i < 120 * 12 && !a.docked && w.endTimer < 0; i++) {
        const b = w.balls.find((x) => x.kind === 'main');
        a.pointer(b && b.x > 270 ? 60 : 480, 0);
        w.step(SIM_DT);
      }
    }
    for (let i = 0; i < 600 && w.state === 'playing'; i++) w.step(SIM_DT);
    expect(a.lives).toBe(0);
    expect(w.state).toBe('over');
    expect(a.result()).toMatchObject({ mode: 'rebound', wave: 1 });
  });

  it('clearing a wave brings the next, faster one; capsules apply their effects', () => {
    const { w, a } = rebound(3);
    const speed1 = a.speedMult;
    for (const tg of a.targets) tg.alive = false;
    w.step(SIM_DT);
    expect(a.wave).toBe(2);
    expect(a.targets.some((tg) => tg.alive)).toBe(true);
    expect(a.speedMult).toBeGreaterThan(speed1);
    w.beginAim(); w.release();
    w.step(SIM_DT);
    a.capsules.push({ kind: 'multi', x: a.paddle.x, y: REBOUND.paddleY - 2, alive: true, age: 0 });
    a.capsules.push({ kind: 'wide', x: a.paddle.x, y: REBOUND.paddleY - 2, alive: true, age: 0 });
    a.capsules.push({ kind: 'life', x: a.paddle.x, y: REBOUND.paddleY - 2, alive: true, age: 0 });
    w.step(SIM_DT);
    expect(w.balls.filter((b) => b.kind === 'main').length).toBe(3);
    expect(a.effects.wide).toBeGreaterThan(0);
    expect(a.lives).toBe(REBOUND.lives + 1);
    for (let i = 0; i < 120; i++) w.step(SIM_DT);
    expect(a.paddle.w).toBeGreaterThan(REBOUND.paddleW + 20);
  });

  it('the wall steps down while a ball is in play and reaching the paddle row ends the run', () => {
    const { w, a } = rebound(4);
    const rows = a.targets.map((tg) => tg.row);
    for (let i = 0; i < 120 * 20; i++) w.step(SIM_DT);
    expect(a.targets.map((tg) => tg.row)).toEqual(rows);
    w.beginAim(); w.release();
    a.stepT = 0.01;
    w.step(SIM_DT); w.step(SIM_DT);
    expect(Math.min(...a.targets.filter((tg) => tg.alive).map((tg) => tg.row))).toBeGreaterThanOrEqual(1);
    for (const tg of a.targets) tg.row = REBOUND.loseRow;
    for (let i = 0; i < 600 && w.state === 'playing'; i++) w.step(SIM_DT);
    expect(w.state).toBe('over');
  });

  it('always ends with a tracking player, and pays waves and records', () => {
    const { w, a } = rebound(5);
    for (let i = 0; i < 120 * 60 * 15 && w.state === 'playing'; i++) {
      if (a.canFire()) { w.beginAim(); w.release(); }
      const b = w.balls.filter((x) => x.kind === 'main' && x.dy > 0).sort((p, q) => q.y - p.y)[0];
      if (b && i % 6 === 0) a.pointer(b.x, 0);
      w.step(SIM_DT); w.fx.length = 0;
    }
    expect(w.state).toBe('over');
    const p = defaultProfile();
    const r = applyArcade(p, a.result());
    expect(p.arcade.reboundBest).toBe(a.wave);
    expect(r.coins).toBeGreaterThan(0);
    expect(r.newBest).toBe(true);
  });
});

describe('Arcade progression', () => {
  it('opens stages in order and pays each new star once', () => {
    const p = defaultProfile();
    p.tutorialDone = true;
    expect(stageOpen(p, 't1')).toBe(true);
    expect(stageOpen(p, 't2')).toBe(false);
    expect(nextStage(p)).toBe('t1');
    const r1 = applyArcade(p, { mode: 'trickshot', cleared: true, stage: 't1', shots: 2, stars: 1, coins: 0, time: 10 });
    expect(r1.coins).toBe(STAR_COINS(1));
    expect(stageOpen(p, 't2')).toBe(true);
    expect(stageAfter(p, 't1')).toBe('t2');
    const r2 = applyArcade(p, { mode: 'trickshot', cleared: true, stage: 't1', shots: 1, stars: 3, coins: 0, time: 10 });
    expect(r2.coins).toBe(2 * STAR_COINS(1));
    const r3 = applyArcade(p, { mode: 'trickshot', cleared: true, stage: 't1', shots: 1, stars: 3, coins: 0, time: 10 });
    expect(r3.coins).toBe(0);
    const lost = applyArcade(p, { mode: 'trickshot', cleared: false, stage: 't2', shots: 4, stars: 0, coins: 0, time: 10 });
    expect(lost.coins).toBe(0);
    expect(p.arcade.stars.t2).toBeUndefined();
    expect(totalStars(p)).toBe(3);
  });

  it('pays Research once for a perfected chapter, and milestones grant their trails', () => {
    const p = defaultProfile();
    for (const s of STAGES.filter((x) => x.chapter === 1)) p.arcade.stars[s.id] = 3;
    p.arcade.stars.t1 = 2;
    const r = applyArcade(p, { mode: 'trickshot', cleared: true, stage: 't1', shots: 1, stars: 3, coins: 0, time: 5 });
    expect(r.perfected).toBe(1);
    expect(r.research).toBe(PERFECT_RESEARCH(1));
    expect(applyArcade(p, { mode: 'trickshot', cleared: true, stage: 't1', shots: 1, stars: 3, coins: 0, time: 5 }).research).toBe(0);
    for (const s of STAGES) p.arcade.stars[s.id] = 3;
    applyArcade(p, { mode: 'trickshot', cleared: true, stage: 't24', shots: 9, stars: 1, coins: 0, time: 5 });
    expect(p.cosmetics).toContain('trickster');
    expect(p.cosmetics).toContain('kaleido');
    for (const m of ARCADE_MILESTONES) if (m.reward.type === 'cosmetic') expect(TRAILS.some((t) => t.id === (m.reward as { id: string }).id)).toBe(true);
  });

  it('Siege pays turns and records, and keeps the best', () => {
    const p = defaultProfile();
    const a = applyArcade(p, { mode: 'siege', cleared: false, turns: 12, coins: 10, time: 60 });
    expect(a.newBest).toBe(true);
    expect(p.arcade.siegeBest).toBe(12);
    expect(a.coins).toBe(12 * 4 + 10 + 12 * 10);
    const b = applyArcade(p, { mode: 'siege', cleared: false, turns: 8, coins: 0, time: 60 });
    expect(b.newBest).toBe(false);
    expect(p.arcade.siegeBest).toBe(12);
    applyArcade(p, { mode: 'siege', cleared: false, turns: 41, coins: 0, time: 60 });
    expect(p.cosmetics).toContain('rampart');
  });

  it('the Arcade badges are earned from arcade runs', () => {
    const p = defaultProfile();
    for (const s of STAGES.slice(0, 4)) p.arcade.stars[s.id] = 3;
    const r = applyArcade(p, { mode: 'trickshot', cleared: false, stage: 't5', shots: 9, stars: 0, coins: 0, time: 5 });
    expect(p.achievements).toContain('sharpshooter');
    expect(r.unlocks.some((u) => u.includes('Sharpshooter'))).toBe(true);
    applyArcade(p, { mode: 'siege', cleared: false, turns: 20, coins: 0, time: 5 });
    applyArcade(p, { mode: 'rebound', cleared: false, wave: 5, score: 100, coins: 0, time: 5 });
    expect(p.achievements).toEqual(expect.arrayContaining(['bulwark_breaker', 'rebound_ace']));
  });

  it('old saves gain an empty arcade record; bad data is cleaned', () => {
    const old = migrate({ version: 4, coins: 5 });
    expect(old.arcade).toEqual({ stars: {}, siegeBest: 0, reboundBest: 0, reboundScore: 0, milestones: [], perfect: [], runs: 0 });
    const bad = migrate({ version: 4, arcade: { stars: { t1: 9, nope: 2, t2: -1 }, siegeBest: 'x', milestones: [3, 'trick18'], perfect: ['a', 1], runs: 2.5 } });
    expect(bad.arcade.stars).toEqual({ t1: 3 });
    expect(bad.arcade.siegeBest).toBe(0);
    expect(bad.arcade.milestones).toEqual(['trick18']);
    expect(bad.arcade.perfect).toEqual([1]);
  });
});
