// Finds aim angles that clear each Trickshot stage, greedily (the angle that leaves the fewest crystals,
// widest margin first), and reports how forgiving each shot is.
//   npx tsx scripts/trickshot-solve.ts [stageId,...] [--step 0.25]
import fs from 'node:fs';
import { STAGES, type StageDef } from '../src/data/trickshot';

const STAGE_FILE = new URL('../src/data/trickshot.ts', import.meta.url);
import { arcadeRunConfig, type TrickshotRun } from '../src/sim/arcade';
import { SIM_DT } from '../src/sim/types';
import { World } from '../src/sim/world';

const args = process.argv.slice(2);
const stepArg = args.indexOf('--step');
const valueAt = new Set(args.flatMap((a, i) => (a === '--step' || a === '--robust' ? [i + 1] : [])));
const only = args.find((a, i) => !a.startsWith('--') && !valueAt.has(i))?.split(',');
const write = args.includes('--write');
const BEAM = 4, BRANCH = 3;
const STEP = stepArg >= 0 ? Number(args[stepArg + 1]) : 0.25;
const MIN = -170.5, MAX = -9.5;
const robustArg = args.indexOf('--robust');
const ROBUST = robustArg >= 0 ? Number(args[robustArg + 1]) : 0.5;

/** Plays `angles` on a fresh board; returns crystals left and whether the run is over. */
export function play(stage: StageDef, angles: number[]): { left: number; over: boolean; shots: number } {
  const w = new World(arcadeRunConfig('trickshot', 1, { stage: stage.id }));
  const a = w.arcade as TrickshotRun;
  for (const deg of angles) {
    const r = (deg * Math.PI) / 180;
    w.beginAim();
    w.aim.dx = Math.cos(r);
    w.aim.dy = Math.sin(r);
    w.release();
    for (let i = 0; i < 120 * 16; i++) {
      w.step(SIM_DT);
      if (w.state !== 'playing' || (i > 2 && w.launchQueue === 0 && !w.balls.some((b) => b.kind === 'main'))) break;
    }
    if (w.state !== 'playing' || w.endTimer >= 0) break;
  }
  return { left: a.targets.reduce((n, tg) => n + (tg.alive ? Math.max(0, tg.hp) : 0), 0) + a.gates.length * 0.5, over: w.state !== 'playing' || w.endTimer >= 0, shots: a.shotsUsed };
}

interface Node { angles: number[]; windows: number[]; left: number }

/** Every distinct robust result of one more shot from `node`: the middle of each run of equal worst-case outcomes. */
function expand(stage: StageDef, node: Node): Node[] {
  const scores: [number, number][] = [];
  for (let a = MIN; a <= MAX; a += STEP) scores.push([a, play(stage, [...node.angles, a]).left]);
  // A shot counts for what it does at worst within ±ROBUST degrees: a player's aim is not exact.
  const k = Math.round(ROBUST / STEP);
  const robust = scores.map((_, i) => Math.max(...scores.slice(Math.max(0, i - k), i + k + 1).map((s) => s[1])));
  const runs: { left: number; from: number; to: number }[] = [];
  for (let i = 0; i < robust.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.left === robust[i] && last.to === i) last.to = i + 1;
    else runs.push({ left: robust[i], from: i, to: i + 1 });
  }
  // Best outcome first, then the widest window.
  runs.sort((a, b) => a.left - b.left || (b.to - b.from) - (a.to - a.from));
  return runs.filter((r) => r.left < node.left).slice(0, BRANCH).map((r) => {
    const mid = scores[Math.floor((r.from + r.to - 1) / 2)][0];
    const angles = [...node.angles, Math.round(mid * 100) / 100];
    return { angles, windows: [...node.windows, (r.to - r.from) * STEP + 2 * ROBUST], left: play(stage, angles).left };
  });
}

/** Beam search: the fewest shots that clear the board with forgiving angles. */
function solve(stage: StageDef): Node {
  let beam: Node[] = [{ angles: [], windows: [], left: Infinity }];
  let best: Node = beam[0];
  for (let shot = 0; shot < stage.shots + 2; shot++) {
    const next = beam.flatMap((n) => expand(stage, n));
    if (!next.length) break;
    next.sort((a, b) => a.left - b.left || Math.min(...b.windows) - Math.min(...a.windows));
    const done = next.find((n) => n.left === 0);
    if (done) return done;
    beam = next.slice(0, BEAM);
    best = beam[0];
  }
  return best;
}

let file = write ? fs.readFileSync(STAGE_FILE, 'utf8') : '';
for (const stage of STAGES) {
  if (only && !only.includes(stage.id)) continue;
  const t0 = Date.now();
  const r = solve(stage);
  if (write && r.left === 0) {
    // par = the shots the solver needed; shots = par plus slack (two in the first chapters, one in the last).
    const par = r.angles.length;
    const shots = par + (stage.chapter >= 3 ? 1 : 2);
    const re = new RegExp(String.raw`(id: '${stage.id}',[\s\S]*?)shots: \d+, par: \d+([\s\S]*?)solution: \[[^\]]*\]`);
    file = file.replace(re, `$1shots: ${shots}, par: ${par}$2solution: [${r.angles.join(', ')}]`);
  }
  const verdict = r.left === 0 ? `cleared in ${r.angles.length}` : `FAILED (${r.left} left)`;
  console.log(`${stage.id.padEnd(4)} ${stage.name.padEnd(16)} par ${stage.par} shots ${stage.shots}: ${verdict}  solution: [${r.angles.join(', ')}]  windows°: [${r.windows.map((x) => x.toFixed(2)).join(', ')}]  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
if (write) fs.writeFileSync(STAGE_FILE, file);
