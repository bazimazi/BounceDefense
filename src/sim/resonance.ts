import { Rng } from '../core/rng';
import { damageEnemy } from './combat';
import { DEFENSE_Y, FIELD_TOP, type Ball } from './types';
import type { World } from './world';

export const CIRCUIT_DURATION = 24;
/**
 * A lit signal fades after this many seconds unless the circuit completes, so Starfall rewards a
 * deliberate route (one bank shot or a quick volley) instead of balls drifting through the sensors.
 */
export const SIGNAL_HOLD = 7;
/** Seconds before a fresh circuit opens after a Starfall. */
export const CIRCUIT_COOLDOWN = 16;
export const RESONANCE_COLOR = '#bca7ff';
/** Starfall strikes every boss for at least this share of its maximum health (before armor). */
export const STARFALL_BOSS_SHARE = 0.06;
/** Depth bosses settle at; sensors keep clear of this band. */
const BOSS_REST_Y = 240;
export interface ResonanceNode { x: number; y: number; lit: boolean; pulse: number; /** Seconds until a lit signal fades. */ litT: number }

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
    for (const n of this.nodes) {
      if (!n.lit) continue;
      n.litT -= dt;
      if (n.litT <= 0) {
        n.lit = false;
        n.pulse = 0.6;
        this.w.emit({ t: 'ring', x: n.x, y: n.y, r: 30, color: '#6c6c9c' });
      }
    }
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
    // Avoid repeating a route; relocate sensors if a solid obstacle or a boss covers them.
    this.pattern = (this.pattern + this.rng.int(1, PATTERNS.length - 1)) % PATTERNS.length;
    this.nodes = PATTERNS[this.pattern].map(([x, y]) => ({ x, y: this.clearY(x, y), lit: false, pulse: 0, litT: 0 }));
    this.remaining = CIRCUIT_DURATION;
  }

  /** A boss arrived mid-circuit: move unlit sensors out of its body and shield ring. */
  avoidBosses(): void {
    for (const n of this.nodes) if (!n.lit) n.y = this.clearY(n.x, n.y);
  }

  private blocked(x: number, y: number): boolean {
    const obstacle = this.w.obstacles.some(o => {
      if (o.kind === 'bumper' || o.kind === 'barrel') return Math.hypot(x - o.x, y - o.y) < o.r + 44;
      if (o.kind === 'crate') return x > o.x - 44 && x < o.x + o.w + 44 && y > o.y - 44 && y < o.y + o.h + 44;
      if (o.kind === 'portal') return Math.hypot(x - o.ax, y - o.ay) < o.r + 44 || Math.hypot(x - o.bx, y - o.by) < o.r + 44;
      return false;
    });
    if (obstacle) return true;
    // Bosses sway sideways and settle at a fixed depth: keep their whole band clear,
    // including Fortress shields, so every signal stays reachable during the fight.
    return this.w.enemies.some(e => e.alive && e.boss && Math.abs(y - Math.max(e.y, BOSS_REST_Y)) < e.r + 80);
  }

  /** Nearest clear height for a sensor, searching alternately below and above its pattern spot. */
  private clearY(x: number, y: number): number {
    for (let i = 0; i < 16; i++) {
      const off = Math.ceil(i / 2) * 38 * (i % 2 ? 1 : -1);
      const ny = y + off;
      if (ny < FIELD_TOP + 70 || ny > DEFENSE_Y - 150) continue;
      if (!this.blocked(x, ny)) return ny;
    }
    return y;
  }

  touch(ball: Ball): void {
    // Only launched balls link signals; temporary shards, clones and frenzy balls pass through.
    if (ball.dead || ball.kind !== 'main' || ball.state !== 'flight' || this.w.endTimer >= 0 || this.w.state !== 'playing') return;
    for (const n of this.nodes) {
      if (n.lit || Math.hypot(ball.x - n.x, ball.y - n.y) > 23 + ball.r) continue;
      n.lit = true;
      n.litT = SIGNAL_HOLD;
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
    this.cooldown = CIRCUIT_COOLDOWN;
    this.overdrive = 7;
    const damage = w.build.stats.damage * 4 * w.comboMult();
    // Snapshot before dealing damage: deaths can add enemies and end a boss fight.
    // The five threats closest to the line are struck, and every boss takes a heavy blow,
    // so linking signals is a real plan during boss fights.
    const bosses = w.enemies.filter(e => e.alive && e.boss);
    const targets = w.enemies.filter(e => e.alive && !e.boss && e.y > 96)
      .sort((a, b) => b.y - a.y || a.id - b.id).slice(0, 5);
    const pts = [...bosses, ...targets].flatMap(e => [e.x, e.y]);
    w.emit({ t: 'starfall', pts });
    for (const e of targets) damageEnemy(w, e, damage, { src: 'nova', crit: false, depth: 0 });
    for (const e of bosses) damageEnemy(w, e, Math.max(damage, e.maxHp * STARFALL_BOSS_SHARE), { src: 'nova', crit: false, depth: 0 });
    for (const p of w.projectiles) p.alive = false;
    w.addBuff('resonance', 7, [{ stat: 'damage', mult: .25 }, { stat: 'speed', mult: .1 }]);
    w.heal(4, false);
    w.gainXp(2);
    w.emit({ t: 'sfx', name: 'starfall' });
    w.emit({ t: 'shake', amt: 5 });
  }
}
