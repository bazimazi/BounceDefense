import { Rng } from '../core/rng';
import { DEFAULT_UNLOCKED_UPGRADES, UPGRADES } from '../data/upgrades';
import type { RunSummary } from '../meta/types';
import type { Offer } from './offers';
import { traceAim } from './physics';
import { LAUNCHER_X, LAUNCHER_Y, SIM_DT } from './types';
import { World, type RunConfig } from './world';

/**
 * A simple autoplayer used for automated tests and balance simulation.
 * It aims at the most threatening enemy with some noise and picks upgrades
 * according to a strategy.
 */
export type BotStrategy = 'random' | 'focused' | 'first';

const trace: number[] = [];

/**
 * Samples launch angles with the real aim tracer and prefers shots that reach
 * enemies from above (they get trapped between the ceiling and the crowd),
 * then shots at the most advanced threats.
 */
export function botStep(w: World, rng: Rng, skill = 1): void {
  if (w.hand <= 0 || w.launchQueue > 0) return;
  let bestA = -Math.PI / 2 + rng.range(-0.6, 0.6);
  let best = -Infinity;
  const samples = skill >= 1 ? 18 : 6;
  for (let i = 0; i < samples; i++) {
    const a = -Math.PI + 0.2 + (i / (samples - 1)) * (Math.PI - 0.4) + rng.range(-0.03, 0.03);
    w.setAim(Math.cos(a), Math.sin(a));
    const r = traceAim(w, 1400, 4, trace);
    if (!r.enemy) continue;
    const e = r.enemy;
    let score = e.y + (e.boss ? 120 : 0) + (e.elite.length ? 120 : 0);
    if (r.ey < e.y - e.r * 0.3) score += 120; // from above
    else if (e.def.ai === 'shielder' && e.phase < 3) score -= 250; // would hit the shield
    score += rng.range(0, 60 / skill);
    if (score > best) {
      best = score;
      bestA = a;
    }
  }
  w.beginAim();
  w.setAim(Math.cos(bestA), Math.sin(bestA));
  w.release();
  void LAUNCHER_X;
  void LAUNCHER_Y;
}

export function botChoose(w: World, rng: Rng, strategy: BotStrategy): Offer {
  const offers = w.offers;
  const evo = offers.find((o) => o.kind === 'evolution');
  if (evo) return evo;
  if (strategy === 'first') return offers[0];
  if (strategy === 'focused') {
    // prefer upgrades already owned (build focus)
    const owned = offers.filter((o) => o.kind === 'upgrade' && w.build.level(o.id) > 0);
    if (owned.length && rng.chance(0.7)) return rng.pick(owned);
  }
  return rng.pick(offers);
}

export function defaultConfig(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    seed: 1234, arena: 'proving', difficulty: 0, core: 'striker',
    parts: ['shell_std', 'impact_std', 'mom_std'], pacts: [], workshop: {},
    pool: DEFAULT_UNLOCKED_UPGRADES, flags: [], trail: 'classic', known: {},
    ...overrides,
  };
}

/** All upgrades unlocked: for balance sims of the "late game" pool. */
export const FULL_POOL = UPGRADES.map((u) => u.id);

export interface HeadlessResult {
  summary: RunSummary;
  world: World;
  steps: number;
}

export function runHeadless(cfg: RunConfig, opts: { maxTime?: number; strategy?: BotStrategy; botSeed?: number } = {}): HeadlessResult {
  const w = new World(cfg);
  const rng = new Rng(opts.botSeed ?? cfg.seed ^ 0xabcdef);
  const maxTime = opts.maxTime ?? 900;
  let steps = 0;
  while (w.time < maxTime && w.state !== 'over') {
    if (w.state === 'levelup') {
      w.choose(botChoose(w, rng, opts.strategy ?? 'focused'));
      continue;
    }
    botStep(w, rng);
    w.step(SIM_DT);
    w.fx.length = 0;
    steps++;
  }
  return { summary: w.summary(), world: w, steps };
}
