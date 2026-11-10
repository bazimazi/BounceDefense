import { describe, expect, it } from 'vitest';
import { RANK_MAX, rankLevel, rankXpFor } from '../src/data/meta';
import { applyRun, contractBoard, runConfig, weekKey } from '../src/meta/progress';
import { defaultProfile } from '../src/meta/profile';
import { applyChill, ballHitEnemy, chainLightning, killEnemy } from '../src/sim/combat';
import { ballSpeed, onWallBounce } from '../src/sim/physics';
import { DEFENSE_Y, SIM_DT } from '../src/sim/types';
import type { World } from '../src/sim/world';
import { emptyWorld, makeWorld, steps } from './helpers';

/** Rebuilds the spatial grid so direct calls see freshly placed enemies. */
const regrid = (w: World) => { w.grid.clear(); for (const e of w.enemies) if (e.alive && !e.phased) w.grid.insert(e); };
const tough = (w: World, id: string, x: number, y: number) => {
  const e = w.spawnEnemy(id, x, y)!;
  e.hp = e.maxHp = 1e6;
  e.spawnT = 1;
  return e;
};

describe('arena events', () => {
  it('Toxic Rain seeds poison clouds that poison enemies', () => {
    const w = emptyWorld({ seed: 4 });
    for (let i = 0; i < 12; i++) tough(w, 'grunt', 60 + i * 40, 300 + (i % 4) * 90).speed = 0;
    w.startEvent('toxic_rain');
    steps(w, 6);
    expect(w.zones.some((z) => z.kind === 'toxic')).toBe(true);
    expect(w.enemies.some((e) => e.st.poison > 0)).toBe(true);
  });

  it('Meteor Shower strikes the crowd', () => {
    const w = emptyWorld({ seed: 4 });
    const crowd = [tough(w, 'grunt', 260, 400), tough(w, 'grunt', 280, 410), tough(w, 'grunt', 270, 390)];
    for (const e of crowd) e.speed = 0;
    w.startEvent('meteor_shower');
    steps(w, 1.3);
    expect(crowd.some((e) => e.hp < e.maxHp)).toBe(true);
  });

  it('Swarm Surge pours in mites and boosts XP', () => {
    const w = emptyWorld({ seed: 4 });
    w.startEvent('swarm_surge');
    steps(w, 0.1);
    expect(w.enemies.filter((e) => e.def.id === 'mite').length).toBe(4);
    const xp = w.xp;
    w.gainXp(1);
    expect(w.xp - xp).toBeCloseTo(1.5 * w.build.stats.xpGain, 5);
  });

  it('Time Warp speeds balls and slows enemies, then ends cleanly', () => {
    const w = emptyWorld({ seed: 4 });
    const speed = w.build.stats.speed;
    const slow = tough(w, 'grunt', 270, 200);
    w.startEvent('time_warp');
    expect(w.build.stats.speed).toBeCloseTo(speed * 1.2, 5);
    const y = slow.y;
    steps(w, 1);
    const warped = slow.y - y;
    w.event = null;
    w.addBuff('noop', 0.01, []);
    const plain = tough(w, 'grunt', 100, 200);
    const y2 = plain.y;
    steps(w, 1);
    expect(warped).toBeLessThan((plain.y - y2) * 0.7);
    expect(w.build.stats.speed).toBeCloseTo(speed, 5);
  });

  it('Iron Tide arrivals are armored and shielded and pay double coins', () => {
    const w = emptyWorld({ seed: 4 });
    w.startEvent('iron_tide');
    const e = w.spawnEnemy('grunt', 270, 300)!;
    expect(e.armor).toBe(3);
    expect(e.shieldHp).toBeGreaterThan(0);
    const before = w.run.coinsCollected;
    w.pickups.push({ kind: 'coin', x: 270, y: 840, vx: 0, vy: 0, value: 10, t: 0, alive: true, homing: true });
    steps(w, 0.3);
    expect(w.run.coinsCollected - before).toBeCloseTo(20 * w.build.stats.coinGain, 5);
  });
});

describe('zones and arena devices', () => {
  it('mines arm, then blow up on contact', () => {
    const w = emptyWorld();
    w.addZone('mine', 270, 400, 22, 20, 50);
    const e = tough(w, 'grunt', 270, 300);
    e.speed = 0;
    steps(w, 0.4);
    expect(w.zones.some((z) => z.kind === 'mine')).toBe(true);
    e.y = 400;
    steps(w, 0.05);
    expect(w.zones.some((z) => z.kind === 'mine')).toBe(false);
    expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('vortices drag enemies inward; stasis bubbles and time stop slow balls', () => {
    const w = emptyWorld();
    const e = tough(w, 'grunt', 200, 400);
    e.speed = 0;
    w.addZone('vortex', 270, 400, 120, 1.5, 0);
    steps(w, 0.5);
    expect(e.x).toBeGreaterThan(205);
    const b = w.spawnBall('main', 100, 600, 0, -1)!;
    const base = ballSpeed(w, b);
    w.addZone('stasis', 100, 600, 60, 5, 0);
    expect(ballSpeed(w, b)).toBeCloseTo(base * 0.5, 3);
    w.zones = [];
    w.timeStop = 1;
    expect(ballSpeed(w, b)).toBeLessThan(base * 0.2);
  });

  it('spore pods burst into poison and regrow; pylons zap; boosters launch balls', () => {
    const w = makeWorld({ arena: 'blight', seed: 1 });
    w.director.update = () => {};
    const spore = w.obstacles.find((o) => o.kind === 'spore')!;
    if (spore.kind !== 'spore') throw new Error('no spore');
    const near = tough(w, 'grunt', spore.x + 30, spore.y);
    near.speed = 0;
    regrid(w);
    w.burstSpore(spore);
    expect(near.st.poison).toBeGreaterThanOrEqual(3);
    expect(spore.alive).toBe(false);
    steps(w, 10.5);
    expect(spore.alive).toBe(true);

    const s = makeWorld({ arena: 'spire', seed: 1 });
    s.director.update = () => {};
    const pylon = s.obstacles.find((o) => o.kind === 'pylon')!;
    if (pylon.kind !== 'pylon') throw new Error('no pylon');
    const target = tough(s, 'grunt', pylon.x + 60, pylon.y);
    target.speed = 0;
    regrid(s);
    s.zapPylon(pylon);
    expect(target.hp).toBeLessThan(target.maxHp);
    const booster = s.obstacles.find((o) => o.kind === 'booster')!;
    if (booster.kind !== 'booster') throw new Error('no booster');
    const b = s.spawnBall('main', booster.x, booster.y + 2, 0, -1)!;
    s.hand = 0;
    s.step(SIM_DT);
    expect(b.boost).toBeGreaterThan(1.3);
  });
});

describe('new enemy behaviours', () => {
  it('Spitters stop at a firing line and lob acid', () => {
    const w = emptyWorld();
    const sp = w.spawnEnemy('spitter', 270, 120)!;
    steps(w, 20);
    expect(sp.y).toBeLessThan(440);
    expect(w.projectiles.length + w.run.damageTaken).toBeGreaterThan(0);
  });

  it('eggs hatch into three mites', () => {
    const w = emptyWorld();
    w.spawnEnemy('brood_egg', 270, 300);
    steps(w, 4.2);
    expect(w.enemies.filter((e) => e.def.id === 'mite').length).toBe(3);
    expect(w.enemies.some((e) => e.def.id === 'brood_egg')).toBe(false);
  });

  it('Necromancers raise the fallen; Aegis Drones shield their friends', () => {
    const w = emptyWorld();
    const necro = tough(w, 'necromancer', 270, 300);
    necro.speed = 0;
    const victim = w.spawnEnemy('grunt', 300, 320)!;
    killEnemy(w, victim, { src: 'ball', crit: false, depth: 0 }, 0);
    steps(w, 0.1);
    expect(w.enemies.some((e) => e.def.id === 'revenant' && e.tag === 'risen')).toBe(true);

    const a = emptyWorld();
    const drone = tough(a, 'aegis', 270, 300);
    drone.speed = 0;
    const friend = tough(a, 'grunt', 300, 320);
    friend.speed = 0;
    steps(a, 0.1);
    expect(friend.shieldHp).toBeGreaterThan(0);
  });

  it('Pulsars push balls away; Juggernauts ignore knockback', () => {
    const w = emptyWorld();
    const p = tough(w, 'pulsar', 270, 400);
    p.speed = 0;
    p.t0 = 0;
    w.hand = 0;
    steps(w, 0.05);
    expect(p.t1).toBeGreaterThan(0);
    // Off-centre, so the push turns the ball instead of only fighting its speed.
    const b = w.spawnBall('main', 300, 470, 0, -1)!;
    steps(w, 0.05);
    expect(b.dx).toBeGreaterThan(0.02);

    const j = emptyWorld();
    const jug = tough(j, 'juggernaut', 270, 300);
    const ball = j.spawnBall('main', 270, 330, 0, -1)!;
    const x = jug.x;
    ballHitEnemy(j, ball, jug);
    steps(j, 0.1);
    expect(Math.abs(jug.x - x)).toBeLessThan(0.5);
  });

  it('Undying rises once, Fission splits, Commanders hasten their squad', () => {
    const w = emptyWorld();
    const u = w.spawnEnemy('grunt', 200, 300, { elite: ['undying'] })!;
    killEnemy(w, u, { src: 'ball', crit: false, depth: 0 }, 0);
    expect(u.alive).toBe(true);
    expect(u.hp).toBeCloseTo(u.maxHp * 0.4);
    killEnemy(w, u, { src: 'ball', crit: false, depth: 0 }, 0);
    expect(u.alive).toBe(false);

    const f = w.spawnEnemy('brute', 300, 300, { elite: ['fission'] })!;
    const n = w.enemies.length;
    killEnemy(w, f, { src: 'ball', crit: false, depth: 0 }, 0);
    expect(w.enemies.filter((e) => e.alive && e.def.id === 'brute').length).toBe(2);
    expect(w.enemies.length).toBe(n + 2);

    const c = emptyWorld();
    const boss = c.spawnEnemy('grunt', 270, 200, { elite: ['commander'] })!;
    boss.speed = 0;
    const led = tough(c, 'grunt', 300, 220);
    const alone = tough(c, 'grunt', 60, 220);
    led.wobble = alone.wobble = 0;
    const [ly, ay] = [led.y, alone.y];
    steps(c, 0.5);
    expect(led.y - ly).toBeGreaterThan((alone.y - ay) * 1.2);
  });
});

describe('pacts, Ascension finale and run setup', () => {
  it('Elite Surge, Ironclad and Short Fuse change the run; locked pacts are dropped', () => {
    const plain = makeWorld();
    const surge = makeWorld({ pacts: ['elite_surge', 'ironclad', 'short_fuse'] });
    expect(surge.director.eliteEvery()).toBeCloseTo(plain.director.eliteEvery() * 0.5);
    expect(surge.director.bossTime).toBe(plain.director.bossTime - 90);
    expect(surge.spawnEnemy('grunt', 100, 100)!.armor).toBe(3);
    const p = defaultProfile();
    expect(runConfig(p, { arena: 'proving', difficulty: 0, pacts: ['ironclad', 'haste'], seed: 1 }).pacts).toEqual(['haste']);
    p.researchNodes.push('risk_pacts', 'pact_mastery');
    expect(runConfig(p, { arena: 'proving', difficulty: 0, pacts: ['ironclad', 'haste'], seed: 1 }).pacts).toEqual(['ironclad', 'haste']);
  });

  it('Ascension 20 brings a third boss before the victory', () => {
    const w = makeWorld({ difficulty: 4, ascension: 20, seed: 3 });
    const kill = () => {
      w.director.spawnBoss();
      for (const e of [...w.enemies]) if (e.alive) killEnemy(w, e, { src: 'ball', crit: false, depth: 0 }, 0);
      // Hydra heads split on death: finish every part.
      for (let i = 0; i < 6 && w.director.bossActive; i++) for (const e of [...w.enemies]) if (e.alive) killEnemy(w, e, { src: 'ball', crit: false, depth: 0 }, 0);
    };
    kill();
    expect(w.endTimer).toBeLessThan(0);
    kill();
    expect(w.endTimer).toBeLessThan(0);
    kill();
    expect(w.endTimer).toBeGreaterThanOrEqual(0);
    expect(w.run.bossesDefeated.length).toBe(3);
  });

  it('the Relic Cache workshop opens a relic choice at the start; Chaos Die adds rerolls and a card', () => {
    const w = makeWorld({ workshop: { relic_cache: 1 }, relicPool: ['chaos_die'] });
    expect(w.pendingRelics).toBe(1);
    w.step(SIM_DT);
    expect(w.draft).toBe('relic');
    expect(w.offers.length).toBe(3);
    // Whatever the cache rolled, take the Chaos Die.
    const rerolls = w.rerolls;
    w.choose({ kind: 'relic', id: 'chaos_die' });
    expect(w.build.relics).toContain('chaos_die');
    expect(w.rerolls).toBe(rerolls + 2);
    w.openLevelUp();
    expect(w.offers.length).toBe(4);
  });
});

describe('upgrade and core mechanics', () => {
  it('Thunderclap shakes the crowd at walls; Mine Layer drops mines', () => {
    const w = emptyWorld({ seed: 2 });
    w.build.addUpgrade('thunderclap');
    w.build.addUpgrade('mine_layer');
    w.refreshBehaviors();
    const e = tough(w, 'grunt', 40, 300);
    regrid(w);
    const b = w.spawnBall('main', 20, 300, -1, -0.2)!;
    for (let i = 0; i < 3; i++) { b.wallBounces = i * 3 + 2; onWallBounce(w, b, 10, 300, 1, 0, 'wall'); w.time += 1; }
    expect(e.hp).toBeLessThan(e.maxHp);
    expect(w.zones.filter((z) => z.kind === 'mine').length).toBeGreaterThan(0);
  });

  it('Storm Surge adds chain jumps with combo; Cold Snap hurls frozen enemies', () => {
    const jumps = (surge: boolean) => {
      const w = emptyWorld();
      if (surge) { w.build.addUpgrade('storm_surge'); w.refreshBehaviors(); }
      const line = Array.from({ length: 8 }, (_, i) => tough(w, 'grunt', 60 + i * 60, 400));
      regrid(w);
      w.addCombo(100);
      w.fx.length = 0;
      chainLightning(w, line[0], 1, 1, 1);
      return line.filter((e) => e.hp < e.maxHp).length;
    };
    expect(jumps(false)).toBe(1);
    expect(jumps(true)).toBe(5);

    const w = emptyWorld();
    w.build.addUpgrade('cold_snap');
    w.refreshBehaviors();
    const e = tough(w, 'grunt', 270, 400);
    applyChill(w, e, 3, 0);
    expect(e.st.frozenT).toBeCloseTo(1.8 * 1.3);
    expect(e.ky).toBeLessThan(-200);
  });

  it('Gemini fires a twin and Chrono slows enemies near its balls', () => {
    const g = makeWorld({ core: 'gemini', seed: 9 });
    g.director.update = () => {};
    g.beginAim(); g.setAim(0, -1); g.release();
    g.step(SIM_DT);
    const twin = g.balls.find((b) => b.kind === 'clone')!;
    expect(twin.dmgMult).toBeCloseTo(0.45);

    const c = makeWorld({ core: 'chrono', seed: 9 });
    c.director.update = () => {};
    const e = tough(c, 'grunt', 270, 600);
    c.hand = 0;
    c.spawnBall('main', 270, 640, 0.3, -1);
    steps(c, 0.2);
    expect(e.slowT).toBeGreaterThan(0);
  });
});

describe('contracts over time and rank bounds', () => {
  it('the weekly contract keeps progress through the week and resets next week', () => {
    const p = defaultProfile();
    p.tutorialDone = true;
    const mon = new Date(Date.UTC(2026, 10, 9, 12));
    const wed = new Date(Date.UTC(2026, 10, 11, 12));
    const next = new Date(Date.UTC(2026, 10, 16, 12));
    expect(weekKey(mon)).toBe(weekKey(wed));
    expect(weekKey(next)).not.toBe(weekKey(mon));
    const s = { ...makeWorld().summary(), kills: 10, time: 100 };
    applyRun(p, s, [], undefined, mon);
    const progress = p.contracts.weekly!.progress;
    applyRun(p, s, [], undefined, wed);
    const def = p.contracts.weekly!;
    expect(def.progress).toBeGreaterThanOrEqual(progress);
    contractBoard(p, next);
    expect(p.contracts.weekly!.progress).toBe(0);
  });

  it('Pilot Rank stops at 100', () => {
    let total = 0;
    for (let r = 1; r < RANK_MAX; r++) total += rankXpFor(r);
    expect(rankLevel(total).level).toBe(RANK_MAX);
    expect(rankLevel(total * 5)).toEqual({ level: RANK_MAX, into: total * 4, need: 0 });
    expect(rankLevel(total - 1).level).toBe(RANK_MAX - 1);
    expect(DEFENSE_Y).toBeGreaterThan(0);
  });
});
