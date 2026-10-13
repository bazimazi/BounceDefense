import { describe, expect, it } from 'vitest';
import { explode } from '../src/sim/combat';
import { traceAim } from '../src/sim/physics';
import { Renderer } from '../src/render/renderer';
import { emptyWorld, makeWorld, steps } from './helpers';

describe('run outcomes and pacts', () => {
  it('keeps the victory when the player falls in Endless', () => {
    const w = makeWorld({ seed: 11 });
    w.finish(true);
    steps(w, 3);
    expect(w.state).toBe('over');
    w.continueEndless();
    expect(w.state).toBe('playing');
    w.hurt(1e6, 270);
    steps(w, 2);
    expect(w.state).toBe('over');
    expect(w.summary().victory).toBe(true);
  });

  it('never offers inert upgrades under Lone Ball or Bloodless', () => {
    const w = makeWorld({ seed: 5, pacts: ['lone_ball', 'no_heal'] });
    for (let i = 0; i < 40; i++) {
      w.openLevelUp();
      for (const o of w.offers) {
        if (o.kind === 'upgrade') expect(['extra_ball', 'vampiric', 'regen']).not.toContain(o.id);
        expect(o.kind).not.toBe('heal');
      }
      w.state = 'playing';
    }
  });

  it('Abyss events are hostile even in arenas without hostile events of their own', () => {
    const w = makeWorld({ seed: 9, arena: 'proving', difficulty: 4 });
    w.director.eventTime = 0;
    steps(w, 0.1);
    expect(['blood_moon', 'gravity_storm', 'blackout']).toContain(w.event?.id);
  });
});

describe('nested area damage', () => {
  it('a blast nested at the same proc depth does not disturb the outer blast', () => {
    const w = emptyWorld({ seed: 2 });
    // Glacier shatters a frozen kill into a bomber, whose death blast runs at the same
    // depth as the outer explosion while that explosion is still iterating its targets.
    w.build.addEvolution('glacier');
    w.refreshBehaviors();
    const frozen = w.spawnEnemy('grunt', 150, 300)!;
    frozen.hp = 1;
    frozen.st.frozenT = 5;
    const bomber = w.spawnEnemy('bomber', 200, 330)!;
    bomber.hp = 1;
    const grunts = [w.spawnEnemy('grunt', 230, 380)!, w.spawnEnemy('grunt', 300, 450)!, w.spawnEnemy('grunt', 380, 520)!];
    for (const g of grunts) g.hp = g.maxHp = 1e6;
    for (const e of w.enemies) e.spawnT = 1;
    w.grid.clear();
    for (const e of w.enemies) w.grid.insert(e);
    const near = (a: { x: number; y: number }, b: { x: number; y: number }, r: number) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < r * r;
    const expected = grunts.map((g) =>
      10 + (near(g, frozen, 85) ? w.build.stats.damage : 0) + (near(g, bomber, 80 + g.r) ? 45 * (1 + w.time / 300) : 0));
    const before = grunts.map((g) => g.hp);
    explode(w, 270, 420, 220, 10, 4, {});
    expect(frozen.alive).toBe(false);
    expect(bomber.alive).toBe(false);
    grunts.forEach((g, i) => expect(before[i] - g.hp).toBeCloseTo(expected[i], 5));
  });
});

describe('aim preview', () => {
  // Distance from a point to the traced polyline, ignoring joins across portal jumps.
  const offPath = (out: number[], x: number, y: number) => {
    let best = Infinity;
    for (let i = 2; i < out.length; i += 2) {
      const [ax, ay, bx, by] = [out[i - 2], out[i - 1], out[i], out[i + 1]];
      if (![ax, ay, bx, by].every(Number.isFinite)) continue;
      const l2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2));
      best = Math.min(best, Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))));
    }
    return best;
  };
  const follow = (w: ReturnType<typeof makeWorld>, seconds: number) => {
    w.director.update = () => {};
    w.enemies = [];
    w.setAim(w.aim.dx, w.aim.dy);
    const out: number[] = [];
    traceAim(w, 5000, 60, out);
    const b = w.spawnBall('main', 270, 850 - 16, w.aim.dx, w.aim.dy)!;
    let worst = 0;
    for (let i = 0; i < seconds * 120 && !b.dead && b.state === 'flight'; i++) {
      w.step(1 / 120);
      w.fx.length = 0;
      if (b.state === 'flight') worst = Math.max(worst, offPath(out, b.x, b.y));
    }
    return worst;
  };

  it('follows gravity wells and portals the way the ball does', () => {
    for (let seed = 1; seed <= 12; seed++) {
      for (const a of [-2.6, -2.2, -1.9, -1.57, -1.2, -0.9, -0.5]) {
        const w = makeWorld({ seed, arena: 'rift' });
        w.setAim(Math.cos(a), Math.sin(a));
        expect(follow(w, 1.2)).toBeLessThan(3);
      }
    }
  });

  it('follows gravity storms, Rift Phase and safety-net bounces', () => {
    for (const a of [-2.4, -1.8, -1.3, -0.7]) {
      const storm = makeWorld({ seed: 4, arena: 'proving' });
      storm.startEvent('gravity_storm');
      storm.setAim(Math.cos(a), Math.sin(a));
      expect(follow(storm, 1.5)).toBeLessThan(3);
      const rift = makeWorld({ seed: 4, arena: 'proving', core: 'void' });
      rift.build.addUpgrade('safety_net');
      rift.setAim(Math.cos(a), Math.sin(a));
      expect(follow(rift, 2.5)).toBeLessThan(3);
    }
  });

  it('predicts the first bounce where the ball actually bounces', () => {
    const w = emptyWorld({ seed: 1 });
    w.setAim(-0.6, -1);
    const out: number[] = [];
    traceAim(w, 1200, 2, out);
    const b = w.spawnBall('main', 270, 850 - 16, w.aim.dx, w.aim.dy)!;
    for (let i = 0; i < 600 && b.wallBounces === 0; i++) w.step(1 / 120);
    expect(b.wallBounces).toBeGreaterThan(0);
    // The first wall contact of the trace is its second point.
    expect(Math.abs(out[2] - b.trail[b.trail.length - 2]) + Math.abs(out[3] - b.trail[b.trail.length - 1])).toBeLessThan(30);
  });
});

describe('announcement banners', () => {
  const renderer = () => new Renderer({ getContext: () => ({}) } as unknown as HTMLCanvasElement);
  const banner = (text: string, big = false) => ({ t: 'banner' as const, text, color: '#fff', big });

  it('drops stale minor banners and never repeats a waiting one', () => {
    const r = renderer();
    r.handleFx(banner('BOSS', true));
    for (const text of ['A', 'B', 'A', 'C']) r.handleFx(banner(text));
    expect(r.banners.map((b) => b.text)).toEqual(['BOSS', 'B', 'A', 'C']);
    for (let i = 0; i < 60; i++) r.update(1 / 20);
    // Three seconds later the boss banner finished; minor news older than its limit is gone.
    expect(r.banners.length).toBeLessThanOrEqual(1);
  });

  it('keeps the newest announcement when the queue is full', () => {
    const r = renderer();
    for (let i = 0; i < 8; i++) r.handleFx(banner(`E${i}`));
    expect(r.banners).toHaveLength(6);
    expect(r.banners.at(-1)!.text).toBe('E7');
  });
});
