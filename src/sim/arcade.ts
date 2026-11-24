import { t } from '../i18n';
import { Rng } from '../core/rng';
import { BOMB_RADIUS, CHAPTER_MAP, CRYSTAL_HP, CRYSTAL_RADIUS, STAGES, TRICK_FLIGHT, starsFor, type CrystalKind, type StageDef } from '../data/trickshot';
import { DEFENSE_Y, FIELD_TOP, LAUNCHER_X, LAUNCHER_Y, W, type Ball, type Segment } from './types';
import type { RunConfig, World } from './world';
import { ReboundRun } from './rebound';

/**
 * Arcade modes play on the same physics as a run but with their own rules: no enemies, no upgrades,
 * no hull to defend. Trickshot is a puzzle (a fixed board of crystals, a few single-ball shots);
 * Siege is turn-based (fire a volley, then the wall of numbered blocks steps down a row).
 */
export type ArcadeKind = 'trickshot' | 'siege' | 'rebound';

export type TargetKind = CrystalKind | 'block' | 'bombBlock' | 'orb' | 'coin' | 'laserH' | 'laserV';

export interface Target {
  id: number;
  kind: TargetKind;
  /** Circles use `r` as radius; blocks are boxes of half-width `r` and half-height `hh` (default `r`). */
  shape: 'circle' | 'block';
  x: number;
  y: number;
  r: number;
  hh?: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Hit flash, 1 on impact and fading. */
  flash: number;
  /** Seconds since it appeared (spawn animation). */
  age: number;
  /** Siege grid cell. */
  row: number;
  col: number;
  /** Where a sliding block is heading. */
  ty: number;
  /** A laser already fired for the ball that touched it this volley. */
  used: boolean;
}

/** Pass-through pickups: balls fly through them. */
export const isPickup = (k: TargetKind): boolean => k === 'orb' || k === 'coin' || k === 'laserH' || k === 'laserV';

export interface ArcadeResult {
  mode: ArcadeKind;
  cleared: boolean;
  /** Trickshot stage, shots fired and stars earned (0 when not cleared). */
  stage?: string;
  shots?: number;
  stars?: number;
  /** Rebound wave reached and score. */
  wave?: number;
  score?: number;
  /** Siege turns survived, blocks broken, balls owned at the end and coins picked up. */
  turns?: number;
  blocks?: number;
  balls?: number;
  coins: number;
  time: number;
}

export interface Arcade {
  readonly kind: ArcadeKind;
  readonly targets: Target[];
  /** Permanent stage walls (drawn by the renderer). */
  readonly walls: Segment[];
  /** Gates still closed. */
  readonly gates: Segment[];
  /** Simulation speed multiplier the game applies (Siege fast-forwards long volleys). */
  timeScale: number;
  /** Seconds between balls of one volley. */
  readonly launchGap: number;
  /** Balls this mode owns. */
  readonly balls: number;
  /** Aim-preview bounces. */
  readonly preview: number;
  canFire(): boolean;
  onFire(): void;
  /** A ball struck a solid target: 'pass' lets it fly on, 'bounce' reflects it. */
  hit(b: Ball, tg: Target): 'pass' | 'bounce';
  /** A ball flew through a pickup. */
  touch(b: Ball, tg: Target): void;
  update(dt: number): void;
  result(): ArcadeResult;
  /** Real-time modes steer with the pointer (Rebound's paddle). */
  pointer?(x: number, y: number): void;
  /** Extra collisions a mode adds to every ball sub-step (Rebound's paddle). */
  collideBall?(b: Ball): void;
  /** Ball speed multiplier. */
  readonly speedMult?: number;
}

/** Main balls still in play (flying or on their way home). */
function ballsOut(w: World): number {
  let n = 0;
  for (const b of w.balls) if (b.kind === 'main' && !b.dead) n++;
  return n;
}

function decay(targets: Target[], dt: number): void {
  for (const tg of targets) {
    tg.age += dt;
    tg.flash = Math.max(0, tg.flash - dt * 5);
  }
}

// ------------------------------------------------------------------ Trickshot
export class TrickshotRun implements Arcade {
  readonly kind = 'trickshot' as const;
  /** Whether a ball with `bounces` bounces so far would fly on through `tg` (it shatters) rather than bounce off. */
  passes(tg: Target, bounces: number): boolean {
    if (tg.kind === 'bank' && bounces === 0) return false;
    return tg.hp <= 1;
  }
  readonly targets: Target[] = [];
  readonly walls: Segment[] = [];
  readonly gates: Segment[] = [];
  timeScale = 1;
  readonly launchGap = 0.075;
  readonly balls = 1;
  readonly preview: number;
  shotsUsed = 0;
  /** Seconds the current shot has been flying. */
  flightT = 0;
  private done = false;

  constructor(private w: World, readonly stage: StageDef) {
    this.preview = stage.preview;
    for (const [kind, x, y] of stage.targets) {
      const hp = CRYSTAL_HP[kind];
      this.targets.push({ id: w.id(), kind, shape: 'circle', x, y, r: CRYSTAL_RADIUS[kind], hp, maxHp: hp, alive: true, flash: 0, age: 0, row: 0, col: 0, ty: y, used: false });
    }
    for (const [ax, ay, bx, by] of stage.walls ?? []) this.walls.push({ ax, ay, bx, by, kind: 'wall' });
    for (const [ax, ay, bx, by] of stage.gates ?? []) this.gates.push({ ax, ay, bx, by, kind: 'shield' });
  }

  /** Bounces the ball in flight has left (the whole budget between shots). */
  bouncesLeft(): number {
    const b = this.w.balls.find((x) => x.kind === 'main' && x.state === 'flight');
    return Math.max(0, this.stage.bounces - (b?.wallBounces ?? 0));
  }

  get shotsLeft(): number {
    return this.stage.shots - this.shotsUsed;
  }

  remaining(): number {
    let n = 0;
    for (const tg of this.targets) if (tg.alive) n++;
    return n;
  }

  canFire(): boolean {
    return !this.done && this.shotsLeft > 0 && this.remaining() > 0 && this.w.hand > 0 && this.w.launchQueue === 0 && ballsOut(this.w) === 0;
  }

  onFire(): void {
    this.shotsUsed++;
    this.flightT = 0;
  }

  hit(b: Ball, tg: Target): 'pass' | 'bounce' {
    const w = this.w;
    tg.flash = 1;
    if (tg.kind === 'bank' && b.wallBounces === 0) {
      w.emit({ t: 'ring', x: tg.x, y: tg.y, r: tg.r + 10, color: CRYSTAL_COLOR.bank, dur: 0.3 });
      w.emit({ t: 'text', x: tg.x, y: tg.y - tg.r - 10, text: t('arcade.bankFirst'), color: CRYSTAL_COLOR.bank });
      w.emit({ t: 'sfx', name: 'shield', vol: 0.5 });
      return 'bounce';
    }
    this.damage(tg, 1);
    return tg.alive ? 'bounce' : 'pass';
  }

  touch(): void { /* Trickshot boards have no pickups. */ }

  private damage(tg: Target, n: number): void {
    if (!tg.alive) return;
    const w = this.w;
    tg.hp -= n;
    tg.flash = 1;
    if (tg.hp > 0) {
      w.emit({ t: 'burst', x: tg.x, y: tg.y, color: '#cfe3ff', n: 8, speed: 160, size: 2 });
      w.emit({ t: 'sfx', name: 'shield', pitch: 1.3, vol: 0.55 });
      return;
    }
    tg.alive = false;
    const color = CRYSTAL_COLOR[tg.kind as CrystalKind] ?? '#7ef0d2';
    w.run.kills++;
    w.addCombo(1);
    w.emit({ t: 'kill', x: tg.x, y: tg.y, r: tg.r, color, big: tg.kind !== 'crystal' });
    w.emit({ t: 'burst', x: tg.x, y: tg.y, color, n: 18, speed: 260, size: 3 });
    w.emit({ t: 'ring', x: tg.x, y: tg.y, r: tg.r * 2.4, color, dur: 0.35 });
    w.emit({ t: 'sfx', name: 'shatter', pitch: 1.1 + Math.min(this.shatteredThisShot++, 8) * 0.08, vol: 0.7 });
    if (tg.kind === 'bomb') {
      w.emit({ t: 'explosion', x: tg.x, y: tg.y, r: BOMB_RADIUS, color: '#ff9a3d' });
      w.emit({ t: 'shake', amt: 6 });
      w.emit({ t: 'sfx', name: 'explode' });
      for (const o of this.targets) if (o.alive && o.kind !== 'bank' && (o.x - tg.x) ** 2 + (o.y - tg.y) ** 2 <= (BOMB_RADIUS + o.r) ** 2) this.damage(o, 1);
    }
    if (tg.kind === 'key' && this.gates.length) {
      for (const g of this.gates) {
        w.emit({ t: 'beam', x0: g.ax, y0: g.ay, x1: g.bx, y1: g.by, color: '#ffd166' });
        w.emit({ t: 'burst', x: (g.ax + g.bx) / 2, y: (g.ay + g.by) / 2, color: '#ffd166', n: 22, speed: 200 });
      }
      this.gates.length = 0;
      w.banner(t('arcade.gatesOpen'), '#ffd166');
      w.emit({ t: 'sfx', name: 'relic' });
    }
    if (!this.done && this.remaining() === 0) {
      this.done = true;
      const stars = starsFor(this.stage, this.shotsUsed);
      w.banner(t('arcade.stageClear'), '#ffe066', '★'.repeat(stars) + '☆'.repeat(3 - stars), true);
      w.emit({ t: 'flash', color: '#ffffff', a: 0.35 });
      w.emit({ t: 'sfx', name: 'victory' });
      w.finish(true);
    }
  }

  private shatteredThisShot = 0;

  update(dt: number): void {
    const w = this.w;
    decay(this.targets, dt);
    const out = ballsOut(w);
    if (out > 0) {
      this.flightT += dt;
      for (const b of w.balls) {
        if (b.kind !== 'main' || b.state !== 'flight') continue;
        // A ball past its bounce budget fizzles; a wandering one is called home. The shot is spent either way.
        if (b.wallBounces > this.stage.bounces) {
          w.emit({ t: 'burst', x: b.x, y: b.y, color: '#9fb4c8', n: 10, speed: 120 });
          w.emit({ t: 'sfx', name: 'net', pitch: 0.7, vol: 0.5 });
          w.sendHome(b);
        } else if (this.flightT > TRICK_FLIGHT) w.sendHome(b);
      }
    } else this.shatteredThisShot = 0;
    if (!this.done && out === 0 && w.launchQueue === 0 && this.shotsLeft <= 0 && this.remaining() > 0) {
      this.done = true;
      w.banner(t('arcade.outOfShots'), '#ff5d73', t('arcade.outOfShotsSub', { n: this.remaining() }), true);
      w.finish(false);
    }
  }

  result(): ArcadeResult {
    const cleared = this.remaining() === 0;
    return { mode: 'trickshot', cleared, stage: this.stage.id, shots: this.shotsUsed, stars: cleared ? starsFor(this.stage, this.shotsUsed) : 0, coins: 0, time: this.w.time };
  }
}

export const CRYSTAL_COLOR: Record<CrystalKind, string> = { crystal: '#6ff2dc', armored: '#c9d6ff', bank: '#a58bff', bomb: '#ff9a3d', key: '#ffd166' };

// ------------------------------------------------------------------ Siege
/**
 * Siege: a turn-based block breaker. Each volley fires every ball; when the last one is home the wall
 * steps down a row and a new row arrives at the top. Blocks carry their hits as a number that grows
 * with the turn. Orbs add a ball for the next volley; lasers strike their whole row or column each time
 * a ball passes. A block reaching the line ends the siege: the score is the turns survived.
 */
export const SIEGE = {
  cols: 7,
  /** Rows above the line; a block stepping into row `rows` breaks the line. */
  rows: 8,
  top: FIELD_TOP + 6,
  gap: 6,
  maxBalls: 60,
  /** Seconds into a volley before it speeds up to ×2 and ×3. */
  fast: [4, 9],
  /** A volley still running after this long is called home. */
  limit: 40,
  slide: 0.28,
};
export const SIEGE_CELL = W / SIEGE.cols;

export const siegeX = (col: number): number => SIEGE_CELL * (col + 0.5);
export const siegeY = (row: number): number => SIEGE.top + SIEGE_CELL * (row + 0.5);

export class SiegeRun implements Arcade {
  readonly kind = 'siege' as const;
  readonly targets: Target[] = [];
  readonly walls: Segment[] = [];
  readonly gates: Segment[] = [];
  timeScale = 1;
  readonly launchGap = 0.06;
  readonly preview = 1;
  balls = 1;
  /** Orbs collected this volley, added when it ends. */
  pending = 0;
  turn = 1;
  phase: 'aim' | 'fire' | 'advance' = 'aim';
  turnT = 0;
  private advanceT = 0;
  blocks = 0;
  coins = 0;
  private done = false;
  private readonly rng: Rng;

  constructor(private w: World) {
    this.rng = w.rng.fork(31);
    // The first two rows are already in place, so the opening volley has something to break.
    this.spawnRow(1, 1);
    this.spawnRow(0, 2);
    this.turn = 2;
  }

  canFire(): boolean {
    return !this.done && this.phase === 'aim' && this.w.launchQueue === 0 && this.w.hand >= this.balls;
  }

  onFire(): void {
    this.phase = 'fire';
    this.turnT = 0;
    for (const tg of this.targets) tg.used = false;
  }

  hit(_b: Ball, tg: Target): 'pass' | 'bounce' {
    this.damage(tg, 1);
    return 'bounce';
  }

  touch(b: Ball, tg: Target): void {
    const w = this.w;
    if (tg.kind === 'orb') {
      tg.alive = false;
      this.pending++;
      w.emit({ t: 'ring', x: tg.x, y: tg.y, r: 26, color: '#7ef0d2', dur: 0.3 });
      w.emit({ t: 'text', x: tg.x, y: tg.y - 18, text: t('arcade.ballPlus'), color: '#7ef0d2' });
      w.emit({ t: 'sfx', name: 'pickup', pitch: 1.4 });
    } else if (tg.kind === 'coin') {
      tg.alive = false;
      this.coins += 5;
      w.emit({ t: 'burst', x: tg.x, y: tg.y, color: '#ffd166', n: 10, speed: 160 });
      w.emit({ t: 'sfx', name: 'coin' });
    } else {
      // A laser fires once for every ball that crosses it, and burns out when the volley ends.
      if (b.recentId.includes(-tg.id)) return;
      b.recentId.push(-tg.id);
      b.recentT.push(w.time);
      if (b.recentId.length > 6) { b.recentId.shift(); b.recentT.shift(); }
      tg.used = true;
      tg.flash = 1;
      const horizontal = tg.kind === 'laserH';
      const hits = this.targets.filter((o) => o.alive && !isPickup(o.kind) && (horizontal ? o.row === tg.row : o.col === tg.col));
      w.emit(horizontal ? { t: 'beam', x0: 0, y0: tg.y, x1: W, y1: tg.y, color: '#ff5df0' } : { t: 'beam', x0: tg.x, y0: FIELD_TOP, x1: tg.x, y1: DEFENSE_Y, color: '#ff5df0' });
      w.emit({ t: 'sfx', name: 'zap', vol: 0.4 });
      for (const o of hits) this.damage(o, 1);
    }
  }

  private damage(tg: Target, n: number): void {
    if (!tg.alive) return;
    const w = this.w;
    tg.hp -= n;
    tg.flash = 1;
    w.addCombo(0.25);
    if (tg.hp > 0) return;
    tg.alive = false;
    this.blocks++;
    w.run.kills++;
    const color = blockColor(tg.maxHp, this.turn);
    w.emit({ t: 'kill', x: tg.x, y: tg.y, r: tg.r, color, big: tg.maxHp >= this.turn });
    w.emit({ t: 'burst', x: tg.x, y: tg.y, color, n: 14, speed: 230, size: 3 });
    w.emit({ t: 'sfx', name: 'crate', pitch: 1.1 + Math.min(this.blocks % 10, 9) * 0.04, vol: 0.55 });
    if (tg.kind === 'bombBlock') {
      w.emit({ t: 'explosion', x: tg.x, y: tg.y, r: SIEGE_CELL * 1.5, color: '#ff9a3d' });
      w.emit({ t: 'shake', amt: 5 });
      w.emit({ t: 'sfx', name: 'explode' });
      const blast = Math.max(1, Math.ceil(tg.maxHp / 2));
      for (const o of this.targets) {
        if (o.alive && !isPickup(o.kind) && Math.abs(o.row - tg.row) <= 1 && Math.abs(o.col - tg.col) <= 1) this.damage(o, blast);
      }
    }
  }

  /** Fills one row: blocks with this turn's strength, one orb, sometimes a laser or a coin. */
  private spawnRow(row: number, turn: number): void {
    const rng = this.rng;
    const cols = rng.shuffle([0, 1, 2, 3, 4, 5, 6]);
    const blocks = Math.min(6, rng.int(2, 3 + Math.min(3, Math.floor(turn / 8))));
    let i = 0;
    const place = (kind: TargetKind, hp: number) => {
      const col = cols[i++];
      const x = siegeX(col);
      const y = siegeY(row);
      const block = !isPickup(kind);
      const r = block ? (SIEGE_CELL - SIEGE.gap) / 2 : kind === 'orb' ? 12 : 14;
      this.targets.push({ id: this.w.id(), kind, shape: block ? 'block' : 'circle', x, y: y - SIEGE_CELL, r, hp, maxHp: hp, alive: true, flash: 0, age: 0, row, col, ty: y, used: false });
    };
    for (let k = 0; k < blocks; k++) {
      const heavy = turn >= 8 && rng.chance(0.2);
      const bomb = !heavy && turn >= 5 && rng.chance(0.09);
      place(bomb ? 'bombBlock' : 'block', heavy ? turn * 2 : turn);
    }
    place('orb', 1);
    if (i < SIEGE.cols && turn >= 3 && rng.chance(0.14)) place(rng.chance(0.5) ? 'laserH' : 'laserV', 1);
    if (i < SIEGE.cols && rng.chance(0.16)) place('coin', 1);
  }

  update(dt: number): void {
    const w = this.w;
    decay(this.targets, dt);
    if (this.phase === 'fire') {
      this.turnT += dt;
      this.timeScale = this.turnT > SIEGE.fast[1] ? 3 : this.turnT > SIEGE.fast[0] ? 2 : 1;
      if (this.turnT > SIEGE.limit) for (const b of w.balls) if (b.kind === 'main' && b.state === 'flight') w.sendHome(b);
      if (this.turnT > 0.2 && w.launchQueue === 0 && ballsOut(w) === 0) this.endVolley();
    } else if (this.phase === 'advance') {
      this.advanceT += dt;
      const k = Math.min(1, this.advanceT / SIEGE.slide);
      const ease = 1 - Math.pow(1 - k, 3);
      for (const tg of this.targets) tg.y = tg.y + (tg.ty - tg.y) * ease;
      if (k >= 1) {
        for (const tg of this.targets) tg.y = tg.ty;
        this.targets.splice(0, this.targets.length, ...this.targets.filter((tg) => tg.alive));
        if (this.targets.some((tg) => tg.alive && !isPickup(tg.kind) && tg.row >= SIEGE.rows)) {
          this.done = true;
          w.banner(t('arcade.siegeBroken'), '#ff3b3b', t('arcade.siegeBrokenSub', { n: this.turnsHeld() }), true);
          w.finish(false);
          return;
        }
        this.phase = 'aim';
        w.recallCooldown = 0;
      }
    }
    // Dead targets are cleared at the end of the volley; the line breaks only after the slide.
    if (this.phase === 'aim') this.timeScale = 1;
  }

  private endVolley(): void {
    const w = this.w;
    this.timeScale = 1;
    this.balls = Math.min(SIEGE.maxBalls, this.balls + this.pending);
    if (this.pending) {
      w.emit({ t: 'ring', x: LAUNCHER_X, y: LAUNCHER_Y, r: 60, color: '#7ef0d2' });
      w.emit({ t: 'text', x: LAUNCHER_X, y: LAUNCHER_Y - 60, text: t('arcade.ballsNow', { n: this.balls }), color: '#7ef0d2' });
    }
    this.pending = 0;
    w.hand = this.balls;
    w.recallCooldown = 0;
    this.targets.splice(0, this.targets.length, ...this.targets.filter((tg) => tg.alive && !(tg.used && (tg.kind === 'laserH' || tg.kind === 'laserV'))));
    for (const tg of this.targets) {
      tg.row++;
      tg.ty = siegeY(tg.row);
    }
    // Pickups that reach the line are simply lost.
    this.targets.splice(0, this.targets.length, ...this.targets.filter((tg) => !(isPickup(tg.kind) && tg.row >= SIEGE.rows)));
    this.spawnRow(0, this.turn);
    this.turn++;
    this.phase = 'advance';
    this.advanceT = 0;
    w.emit({ t: 'sfx', name: 'wall', pitch: 0.6, vol: 0.5 });
    if (this.turn % 10 === 0) w.banner(t('arcade.turnN', { n: this.turn }), '#ffd166');
  }

  /** The lowest row a block stands in (for the danger glow). */
  lowestRow(): number {
    let r = -1;
    for (const tg of this.targets) if (tg.alive && !isPickup(tg.kind)) r = Math.max(r, tg.row);
    return r;
  }

  /** Volleys completed: the score. */
  turnsHeld(): number {
    return Math.max(0, this.turn - 2);
  }

  result(): ArcadeResult {
    return { mode: 'siege', cleared: false, turns: this.turnsHeld(), blocks: this.blocks, balls: this.balls, coins: this.coins, time: this.w.time };
  }
}

/**
 * Block colour from its strength against this turn: teal when nearly spent, blue-violet for a fresh row,
 * hot pink for a heavy one. Quantised to eight steps so the renderer can cache one tile per colour.
 */
export function blockColor(hp: number, turn: number): string {
  const k = Math.round(Math.max(0, Math.min(1, hp / Math.max(1, turn) / 2)) * 8) / 8;
  return hslHex(172 + k * 158, 0.78, 0.6 - k * 0.06);
}

function hslHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function createArcade(w: World, kind: ArcadeKind, stage?: string): Arcade {
  if (kind === 'rebound') return new ReboundRun(w);
  if (kind === 'trickshot') return new TrickshotRun(w, STAGES.find((s) => s.id === stage) ?? STAGES[0]);
  return new SiegeRun(w);
}

/** The run configuration of an arcade mode: a bare Striker (no parts, Workshop, talents or research), so every board plays the same for everyone. */
export function arcadeRunConfig(kind: ArcadeKind, seed: number, opts: { stage?: string; trail?: string } = {}): RunConfig {
  const stage = STAGES.find((s) => s.id === opts.stage) ?? STAGES[0];
  return {
    seed, arena: kind === 'trickshot' ? CHAPTER_MAP[stage.chapter]?.arena ?? 'proving' : kind === 'rebound' ? 'spire' : 'citadel', difficulty: 0, core: 'striker',
    parts: [], pacts: [], workshop: {}, pool: [], flags: [], trail: opts.trail ?? 'classic', known: {}, mode: kind,
    ...(kind === 'trickshot' ? { stage: stage.id } : {}),
  };
}
