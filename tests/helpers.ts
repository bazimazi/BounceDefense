import { defaultConfig, FULL_POOL } from '../src/sim/bot';
import { SIM_DT } from '../src/sim/types';
import { World, type RunConfig } from '../src/sim/world';

export function makeWorld(overrides: Partial<RunConfig> = {}): World {
  return new World(defaultConfig({ pool: FULL_POOL, ...overrides }));
}

/** An empty arena (no obstacles) for deterministic geometry tests. */
export function emptyWorld(overrides: Partial<RunConfig> = {}): World {
  const w = makeWorld(overrides);
  w.obstacles = [];
  w.segments = w.segments.filter((s) => s.kind === 'wall');
  // freeze the director so nothing spawns unexpectedly
  w.director.update = () => {};
  return w;
}

export function steps(w: World, seconds: number): void {
  const n = Math.round(seconds / SIM_DT);
  for (let i = 0; i < n; i++) {
    w.step(SIM_DT);
    w.fx.length = 0;
  }
}
