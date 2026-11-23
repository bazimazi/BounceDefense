/**
 * The human-like autoplayer shared by `npm run balance` and `npm run journey`. It aims straight at the most
 * advanced threat with some noise, decides every 0.3-0.85 s, really holds a third of its shots into the
 * power window, chases Resonance signals half the time when nothing is close to the line, and fires Surge
 * when ready. It approximates a good touch-screen player.
 */
import { Rng } from '../src/core/rng';
import { botChoose } from '../src/sim/bot';
import { LAUNCHER_X, LAUNCHER_Y, SIM_DT } from '../src/sim/types';
import { World, type RunConfig } from '../src/sim/world';

interface Hand { t: number; hold: number }

function humanStep(w: World, rng: Rng, react: Hand, noise: number): void {
  // A held drag releases on its own clock, like a finger waiting for the gold dial.
  if (react.hold >= 0) {
    react.hold -= SIM_DT;
    if (react.hold < 0) w.release();
  }
  react.t -= SIM_DT;
  if (react.t > 0 || react.hold >= 0) return;
  react.t = rng.range(0.3, 0.85);
  if (w.canSurge()) w.activateSurge();
  if (w.hand <= 0 || w.launchQueue > 0 || w.aim.active) return;
  let best: { x: number; y: number } | null = null;
  let bs = -Infinity;
  for (const e of w.enemies) {
    if (!e.alive || e.y < 100) continue;
    const s = (e.boss ? 400 : 0) + e.y + (e.elite.length ? 80 : 0);
    if (s > bs) { bs = s; best = e; }
  }
  const signal = w.resonance.nodes.find((n) => !n.lit);
  let tx: number, ty: number;
  if (signal && (!best || best.y < 560) && rng.chance(0.5)) { tx = signal.x; ty = signal.y; }
  else if (best) { tx = best.x + rng.range(-noise, noise); ty = best.y; }
  else { tx = rng.range(100, 440); ty = 300; }
  w.beginAim();
  w.setAim(tx - LAUNCHER_X, Math.min(ty, LAUNCHER_Y - 10) - LAUNCHER_Y);
  react.hold = rng.chance(0.33) ? 0.7 : 0.06;
}

/** Plays one run to the end (or `maxTime`) and returns the world with its summary and the lowest hull seen. */
export function playHuman(cfg: RunConfig, maxTime: number, noise: number): { w: World; minHp: number } {
  const w = new World(cfg);
  const rng = new Rng(cfg.seed ^ 0x5151);
  const react: Hand = { t: 0, hold: -1 };
  let minHp = 1;
  while (w.time < maxTime && w.state !== 'over') {
    if (w.state === 'levelup') {
      w.choose(botChoose(w, rng, 'focused'));
      continue;
    }
    humanStep(w, rng, react, noise);
    w.step(SIM_DT);
    minHp = Math.min(minHp, w.hp / w.maxHp);
    w.fx.length = 0;
  }
  return { w, minHp };
}
