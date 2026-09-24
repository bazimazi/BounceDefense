import { describe, expect, it } from 'vitest';
import { defaultConfig, FULL_POOL, runHeadless } from '../src/sim/bot';
import { damageEnemy } from '../src/sim/combat';
import { SIM_DT } from '../src/sim/types';
import { World } from '../src/sim/world';
import { steps } from './helpers';

describe('headless simulation', () => {
  it('is deterministic for a given seed', () => {
    const a = runHeadless(defaultConfig({ seed: 42 }), { maxTime: 90 }).summary;
    const b = runHeadless(defaultConfig({ seed: 42 }), { maxTime: 90 }).summary;
    expect(a.kills).toBe(b.kills);
    expect(a.damageDealt).toBeCloseTo(b.damageDealt);
    expect(a.upgrades).toEqual(b.upgrades);
  });

  it('plays full runs on every arena and core without crashing', () => {
    for (const arena of ['proving', 'foundry', 'rift']) {
      for (const core of ['striker', 'pyro', 'tesla', 'cryo', 'blood', 'void']) {
        const { summary } = runHeadless(defaultConfig({ seed: 7, arena, core, pool: FULL_POOL }), { maxTime: 150 });
        expect(summary.time).toBeGreaterThan(10);
        expect(Number.isFinite(summary.damageDealt)).toBe(true);
      }
    }
  });

  it('every boss can be fought and defeated', () => {
    for (const arena of ['proving', 'foundry', 'rift']) {
      const w = new World(defaultConfig({ seed: 3, arena }));
      w.director.bossTime = 0.1;
      steps(w, 1);
      expect(w.director.bossActive).toBe(true);
      // defeat all boss parts (the Hydra splits several times)
      for (let guard = 0; guard < 20 && w.director.bossActive; guard++) {
        for (const e of w.enemies.filter((x) => x.boss && x.alive)) damageEnemy(w, e, 1e9, { src: 'ball', crit: false, depth: 0 });
        steps(w, 0.2);
      }
      expect(w.run.bossesDefeated.length).toBe(1);
      expect(w.endTimer).toBeGreaterThanOrEqual(0); // victory sequence started
    }
  });

  it('nightmare difficulty sends a second boss', () => {
    const w = new World(defaultConfig({ seed: 5, difficulty: 2 }));
    w.director.bossTime = 0.1;
    steps(w, 0.5);
    for (const e of w.enemies.filter((x) => x.boss)) damageEnemy(w, e, 1e9, { src: 'ball', crit: false, depth: 0 });
    expect(w.run.bossesDefeated.length).toBe(1);
    expect(w.endTimer).toBe(-1);
    expect(w.director.bossTime).toBeGreaterThan(w.time);
  });

  it('losing all HP ends the run with a defeat', () => {
    const w = new World(defaultConfig({ seed: 5 }));
    let over: boolean | null = null;
    w.bus.on('over', ({ victory }) => { over = victory; });
    w.hurt(10000, 100);
    steps(w, 3);
    expect(w.state).toBe('over');
    expect(over).toBe(false);
  });

  it('handles a stress scenario (many balls, hundreds of enemies) within budget', () => {
    const w = new World(defaultConfig({ seed: 9, pool: FULL_POOL }));
    for (const id of ['extra_ball', 'extra_ball', 'extra_ball', 'extra_ball', 'splitter', 'splitter', 'splitter', 'splitter', 'volatile', 'volatile', 'volatile', 'chain_lightning', 'chain_lightning', 'chain_lightning', 'ignite', 'ignite']) {
      w.onBuildChanged(w.build.addUpgrade(id));
    }
    w.hand = w.maxBallsAllowed();
    w.hp = w.maxHp = 1e9;
    for (let i = 0; i < 250; i++) w.spawnEnemy('brute', 30 + (i % 20) * 24, 120 + Math.floor(i / 20) * 40);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 120 * 5; i++) {
      if (w.state === 'levelup') w.choose(w.offers[0]);
      w.setAim(Math.sin(i) * 0.6, -1);
      w.beginAim();
      w.release();
      w.step(SIM_DT);
      w.fx.length = 0;
      n++;
    }
    const msPerStep = (performance.now() - t0) / n;
    // 120 steps/s at 60 fps means ~2 steps per frame; keep sim well under a frame
    expect(msPerStep).toBeLessThan(4);
  });
});
