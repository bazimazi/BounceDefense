import { Rng } from '../core/rng';
import { damageEnemy } from './combat';
import type { Ball } from './types';
import type { World } from './world';

export const CIRCUIT_DURATION = 24;
export const RESONANCE_COLOR = '#bca7ff';
export interface ResonanceNode { x: number; y: number; lit: boolean; pulse: number }

// Targets are pass-through sensors: they reward a route without changing its physics.
const PATTERNS = [
  [[105, 570], [270, 245], [435, 570]],
  [[100, 300], [270, 600], [440, 300]],
  [[95, 505], [270, 300], [445, 505]],
  [[135, 630], [270, 195], [405, 630]],
];

/** A seeded, optional pinball objective, isolated from the director's random stream. */
export class ResonanceCircuit {
  nodes: ResonanceNode[] = [];
  remaining = 0;
  cooldown = 5;
  overdrive = 0;
  completed = 0;
  private pattern = -1;
  private readonly rng: Rng;

  constructor(private readonly w: World) { this.rng = w.rng.fork(73); }

  get lit(): number { return this.nodes.filter(n => n.lit).length; }

  update(dt: number): void {
    this.overdrive = Math.max(0, this.overdrive - dt);
    for (const n of this.nodes) n.pulse = Math.max(0, n.pulse - dt * 2.5);
    if (this.w.endTimer >= 0) return;
    if (this.nodes.length) {
      this.remaining = Math.max(0, this.remaining - dt);
      if (this.remaining <= 0) {
        this.nodes = [];
        this.cooldown = 4;
      }
    } else {
      this.cooldown -= dt;
      if (this.cooldown <= 0) this.open();
    }
  }

  private open(): void {
    // Avoid repeating a route; relocate sensors if a solid obstacle covers them.
    this.pattern = (this.pattern + this.rng.int(1, PATTERNS.length - 1)) % PATTERNS.length;
    this.nodes = PATTERNS[this.pattern].map(([x, y]) => {
      for (let i = 0; i < 8; i++) {
        const blocked = this.w.obstacles.some(o => {
          if (o.kind === 'bumper' || o.kind === 'barrel') return Math.hypot(x - o.x, y - o.y) < o.r + 44;
          if (o.kind === 'crate') return x > o.x - 44 && x < o.x + o.w + 44 && y > o.y - 44 && y < o.y + o.h + 44;
          if (o.kind === 'portal') return Math.hypot(x - o.ax, y - o.ay) < o.r + 44 || Math.hypot(x - o.bx, y - o.by) < o.r + 44;
          return false;
        });
        if (!blocked) break;
        y -= 38;
      }
      return { x, y, lit: false, pulse: 0 };
    });
    this.remaining = CIRCUIT_DURATION;
  }

  touch(ball: Ball): void {
    if (ball.dead || ball.state !== 'flight' || this.w.endTimer >= 0 || this.w.state !== 'playing') return;
    for (const n of this.nodes) {
      if (n.lit || Math.hypot(ball.x - n.x, ball.y - n.y) > 23 + ball.r) continue;
      n.lit = true;
      n.pulse = 1;
      ball.momentum += 3 * this.w.build.stats.momentumGain;
      ball.pulse = 1;
      this.w.surge.charge = Math.min(this.w.surge.max, this.w.surge.charge + 10);
      this.w.addCombo(2);
      this.w.emit({ t: 'ring', x: n.x, y: n.y, r: 55, color: RESONANCE_COLOR });
      this.w.emit({ t: 'burst', x: n.x, y: n.y, n: 10, speed: 130, color: RESONANCE_COLOR });
      this.w.emit({ t: 'sfx', name: 'resonate', pitch: 1 + this.lit * .25 });
      if (this.lit === 3) { this.complete(); break; }
    }
  }

  private complete(): void {
    const w = this.w;
    this.completed++;
    this.nodes = [];
    this.remaining = 0;
    this.cooldown = 12;
    this.overdrive = 7;
    const damage = w.build.stats.damage * 4 * w.comboMult();
    // Snapshot before dealing damage: deaths can add enemies and end a boss fight.
    const targets = w.enemies.filter(e => e.alive && e.y > 96)
      .sort((a, b) => b.y - a.y || a.id - b.id).slice(0, 5);
    const pts = targets.flatMap(e => [e.x, e.y]);
    w.emit({ t: 'starfall', pts });
    for (const e of targets) damageEnemy(w, e, damage, { src: 'nova', crit: false, depth: 0 });
    for (const p of w.projectiles) p.alive = false;
    w.addBuff('resonance', 7, [{ stat: 'damage', mult: .25 }, { stat: 'speed', mult: .1 }]);
    w.heal(4, false);
    w.gainXp(2);
    w.emit({ t: 'sfx', name: 'starfall' });
    w.emit({ t: 'shake', amt: 5 });
  }
}
