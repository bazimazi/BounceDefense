import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/data/arenas';
import { applyRun, DAILY_MIN_TIME, dailyRecord, nextGoals } from '../src/meta/progress';
import { defaultProfile } from '../src/meta/profile';
import type { RunSummary } from '../src/meta/types';
import { BOSS_SPAWN_Y } from '../src/sim/bosses';
import { IDLE_FLIGHT_TIME, MAX_PORTAL_HOPS, phaseExitX, phaseY, STUCK_TIME } from '../src/sim/physics';
import { STARFALL_BOSS_SHARE } from '../src/sim/resonance';
import { FLOOR_Y, SIM_DT } from '../src/sim/types';
import { emptyWorld, makeWorld, steps } from './helpers';

function summary(over: Partial<RunSummary> = {}): RunSummary {
  return { ...makeWorld().summary(), ...over };
}

describe('geometry traps', () => {
  it('Rift Phase never re-enters inside a corner pocket behind a deflector', () => {
    const w = emptyWorld({ core: 'void' });
    // The Proving Grounds corner deflectors close a triangle against the top and side walls.
    for (const [ax, ay, bx, by] of [[0, 176, 64, 96], [540, 176, 476, 96]]) {
      w.segments.push({ ax, ay, bx, by, kind: 'deflector' });
    }
    for (const x of [0, 10, 25, 40, 60, 480, 515, 540]) {
      const px = phaseExitX(w, x, 9);
      expect(px).toBeGreaterThan(60);
      expect(px).toBeLessThan(480);
    }
    // Open space keeps the ball where it fell.
    expect(phaseExitX(w, 270, 9)).toBe(270);
  });

  it('a phased void ball keeps moving into the arena instead of looping in a pocket', () => {
    const w = emptyWorld({ core: 'void' });
    w.segments.push({ ax: 0, ay: 176, bx: 64, by: 96, kind: 'deflector' });
    w.hand = 0;
    const b = w.spawnBall('main', 20, FLOOR_Y - 4, 0.14, 0.99)!;
    steps(w, 0.1);
    expect(b.phased).toBe(true);
    expect(b.y).toBeGreaterThanOrEqual(phaseY(b.r) - 1);
    expect(b.x).toBeGreaterThan(50);
  });

  it('sends a ball home when it is trapped in a small area without hitting anything', () => {
    const w = emptyWorld();
    w.hand = 0;
    // A sealed box: the ball can only rattle around inside it.
    w.segments.push(
      { ax: 200, ay: 300, bx: 300, by: 300, kind: 'deflector' }, { ax: 300, ay: 300, bx: 300, by: 380, kind: 'deflector' },
      { ax: 300, ay: 380, bx: 200, by: 380, kind: 'deflector' }, { ax: 200, ay: 380, bx: 200, by: 300, kind: 'deflector' },
    );
    const b = w.spawnBall('main', 250, 340, 0.6, -0.8)!;
    steps(w, STUCK_TIME - 0.2);
    expect(b.state).toBe('flight');
    steps(w, 0.4);
    expect(b.state === 'returning' || b.dead).toBe(true);
    steps(w, 1);
    expect(w.hand).toBe(1);
  });

  it('a ball that touches no enemy for too long comes home', () => {
    const w = emptyWorld();
    w.hand = 0;
    const b = w.spawnBall('main', 270, 400, 0.99, 0.14)!;
    // Keep it flying: bounce it off the floor indefinitely.
    b.floorBounces = 999;
    steps(w, IDLE_FLIGHT_TIME + 0.5);
    expect(b.state === 'returning' || b.dead).toBe(true);
  });

  it('portals allow only a bounded number of jumps between bounces', () => {
    const w = emptyWorld();
    w.hand = 0;
    // Exit B sends the ball straight back into mouth A: a perfect loop without the guard.
    w.obstacles.push({ kind: 'portal', ax: 470, ay: 600, bx: 70, by: 210, r: 24, spin: 0 });
    const d = Math.hypot(400, 390);
    const b = w.spawnBall('main', 70, 210, 400 / d, 390 / d)!;
    b.portalCd = 0.5;
    steps(w, 4);
    expect(b.portalHops).toBeLessThanOrEqual(MAX_PORTAL_HOPS);
    expect(b.state !== 'flight' || b.y > 610).toBe(true);
  });
});

describe('offers', () => {
  it('guarantees Extra Ball in the second hand when it has not appeared yet', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const w = makeWorld({ seed });
      w.pendingLevels = 2;
      w.step(SIM_DT);
      const first = w.offers.map((o) => (o.kind === 'upgrade' ? o.id : o.kind));
      const pick = w.offers.find((o) => o.kind !== 'upgrade' || o.id !== 'extra_ball') ?? w.offers[0];
      w.choose(pick);
      w.step(SIM_DT);
      const second = w.offers.map((o) => (o.kind === 'upgrade' ? o.id : o.kind));
      expect(first.includes('extra_ball') || second.includes('extra_ball')).toBe(true);
    }
  });

  it('never features Extra Ball under Lone Ball', () => {
    const w = makeWorld({ pacts: ['lone_ball'] });
    for (let i = 0; i < 6; i++) {
      w.pendingLevels = 1;
      w.step(SIM_DT);
      expect(w.offers.some((o) => o.kind === 'upgrade' && o.id === 'extra_ball')).toBe(false);
      w.choose(w.offers[0]);
    }
  });

  it('Spare Ball raises Extra Ball by one level instead of granting a ball at launch', () => {
    const plain = makeWorld();
    const spare = makeWorld({ workshop: { spare_ball: 1 } });
    expect(spare.maxBallsAllowed()).toBe(1);
    expect(spare.build.maxLevel('extra_ball')).toBe(plain.build.maxLevel('extra_ball') + 1);
    for (let i = 0; i < 6; i++) spare.build.addUpgrade('extra_ball');
    expect(spare.build.level('extra_ball')).toBe(plain.build.maxLevel('extra_ball') + 1);
    expect(spare.maxBallsAllowed()).toBe(plain.build.maxLevel('extra_ball') + 2);
  });
});

describe('bosses and resonance', () => {
  it('starfall strikes every boss for a share of its health', () => {
    const w = emptyWorld();
    const boss = w.spawnEnemy('boss_fortress', 270, 250)!;
    w.director.bossActive = true;
    const before = boss.hp;
    w.resonance.cooldown = 0;
    w.resonance.update(SIM_DT);
    const ball = w.spawnBall('main', 0, 0, 0, -1)!;
    for (const n of [...w.resonance.nodes]) { ball.x = n.x; ball.y = n.y; w.resonance.touch(ball); }
    expect(w.resonance.completed).toBe(1);
    expect(before - boss.hp).toBeGreaterThanOrEqual(before * STARFALL_BOSS_SHARE - boss.armor - 1);
  });

  it('keeps resonance signals clear of a boss and its shields', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = emptyWorld({ seed });
      const boss = w.spawnEnemy('boss_fortress', 270, BOSS_SPAWN_Y)!;
      for (let k = 0; k < 4; k++) {
        w.resonance.nodes = [];
        w.resonance.cooldown = 0;
        w.resonance.update(SIM_DT);
        for (const n of w.resonance.nodes) expect(Math.abs(n.y - 250)).toBeGreaterThanOrEqual(boss.r + 80);
      }
    }
  });
});

describe('difficulty tiers', () => {
  it('harder tiers grow enemy health faster and hit the line harder', () => {
    for (let i = 1; i < DIFFICULTIES.length; i++) {
      expect(DIFFICULTIES[i].growth).toBeGreaterThan(DIFFICULTIES[i - 1].growth);
      expect(DIFFICULTIES[i].dmgMult).toBeGreaterThan(DIFFICULTIES[i - 1].dmgMult);
    }
    const normal = makeWorld({ difficulty: 0 });
    const abyss = makeWorld({ difficulty: 4 });
    normal.time = abyss.time = 300;
    const n = normal.spawnEnemy('grunt', 100, 100)!;
    const a = abyss.spawnEnemy('grunt', 100, 100)!;
    expect(a.maxHp / n.maxHp).toBeGreaterThan(DIFFICULTIES[4].hpMult);
  });

  it('elites start with a single modifier and ramp to the tier count', () => {
    const w = makeWorld({ difficulty: 4 });
    expect(w.director.eliteMods()).toBe(1);
    w.time = 320;
    expect(w.director.eliteMods()).toBe(3);
  });
});

describe('daily seed', () => {
  it('pays its bonus once per day, only for a run that was really played', () => {
    const p = defaultProfile();
    const early = applyRun(p, summary({ daily: true, time: DAILY_MIN_TIME - 5, kills: 3 }), [], '2026-11-7');
    expect(early.daily?.bonus).toBe(false);
    const played = applyRun(p, summary({ daily: true, time: 200, kills: 40 }), [], '2026-11-7');
    expect(played.daily?.bonus).toBe(true);
    expect(played.rewards.research).toBeGreaterThanOrEqual(1);
    const again = applyRun(p, summary({ daily: true, time: 300, kills: 80 }), [], '2026-11-7');
    expect(again.daily).toEqual({ bonus: false, best: 80, newBest: true });
    expect(dailyRecord(p, '2026-11-8')).toEqual({ day: '2026-11-8', claimed: false, best: 0, runs: 0 });
  });

  it('ordinary runs leave the daily record alone', () => {
    const p = defaultProfile();
    expect(applyRun(p, summary({ time: 200 }), []).daily).toBeNull();
    expect(p.daily.runs).toBe(0);
  });
});

describe('goals', () => {
  it('points at the Loadout once a core is affordable instead of a finished collect bar', () => {
    const p = defaultProfile();
    p.tutorialDone = true;
    p.cores = 50;
    const goals = nextGoals(p, 10);
    expect(goals.some((g) => g.text.includes('Unlock') && g.text.includes('Loadout'))).toBe(true);
    expect(goals.some((g) => /^Collect \d+ Cores$/.test(g.text) && g.cur >= g.max)).toBe(false);
  });
});
