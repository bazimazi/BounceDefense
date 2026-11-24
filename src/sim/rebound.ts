import { t } from '../i18n';
import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { DEFENSE_Y, FIELD_TOP, W, type Ball, type Segment } from './types';
import type { Arcade, ArcadeResult, Target, TargetKind } from './arcade';
import type { World } from './world';

/**
 * Rebound: a real-time paddle mode. The launcher sleeps; the player slides a paddle along the line and keeps
 * the ball in play. Waves of blocks march down a row at a time; breaking blocks may drop capsules (multiball,
 * a wider paddle, a fire ball, a slower ball, an extra life) that the paddle must catch. A ball lost below the
 * paddle costs a life once no ball is left; a block reaching the paddle row, or the last life, ends the run.
 */
export const REBOUND = {
  cols: 7,
  /** Paddle row (top of the paddle) and the row a block may not reach. */
  paddleY: DEFENSE_Y - 18,
  loseRow: 13,
  top: FIELD_TOP + 6,
  gap: 6,
  paddleW: 108,
  wideW: 168,
  paddleSpeed: 1500,
  /** Ball speed: a share of the base speed, rising a little each wave. */
  speed: 0.7,
  speedStep: 0.025,
  speedMax: 0.95,
  /** Seconds between row steps: shorter each wave, never below `stepMin`. */
  step: 15,
  stepWave: 0.6,
  stepMin: 7,
  lives: 3,
  maxLives: 5,
  dropChance: 0.13,
  capsuleSpeed: 170,
  effect: 12,
  maxBalls: 12,
  /** Widest deflection off the paddle edge, in radians from straight up. */
  maxAngle: 1.1,
  minAngle: 0.14,
};
const CELL = W / REBOUND.cols;
const cellX = (col: number) => CELL * (col + 0.5);
const cellY = (row: number) => REBOUND.top + CELL * 0.62 * (row + 0.5);

export type CapsuleKind = 'multi' | 'wide' | 'fire' | 'slow' | 'life';
export interface Capsule { kind: CapsuleKind; x: number; y: number; alive: boolean; age: number }
export const CAPSULE_COLOR: Record<CapsuleKind, string> = { multi: '#7ef0d2', wide: '#6ad1ff', fire: '#ff8a3d', slow: '#c9b3ff', life: '#ff6b8b' };

export class ReboundRun implements Arcade {
  readonly kind = 'rebound' as const;
  readonly targets: Target[] = [];
  readonly walls: Segment[] = [];
  readonly gates: Segment[] = [];
  timeScale = 1;
  readonly launchGap = 0.075;
  /** The launcher never fires in Rebound: the ball leaves from the paddle. */
  readonly balls = 0;
  readonly preview = 0;
  paddle = { x: W / 2, tx: W / 2, w: REBOUND.paddleW, vx: 0, flash: 0 };
  lives = REBOUND.lives;
  wave = 0;
  score = 0;
  blocks = 0;
  docked = true;
  capsules: Capsule[] = [];
  /** Seconds left on each capsule effect. */
  effects = { wide: 0, fire: 0, slow: 0 };
  /** Seconds until the wall steps down a row. */
  stepT = REBOUND.step;
  private done = false;
  private readonly rng: Rng;
  /** Blocks a block row is built from: half-height bricks, so a wave fills the upper field. */
  readonly brickH = CELL * 0.62 - REBOUND.gap;

  constructor(private w: World) {
    this.rng = w.rng.fork(53);
    this.nextWave();
  }

  get speedMult(): number {
    return Math.min(REBOUND.speedMax, REBOUND.speed + (this.wave - 1) * REBOUND.speedStep) * (this.effects.slow > 0 ? 0.75 : 1);
  }

  canFire(): boolean {
    return !this.done && this.docked && this.w.state === 'playing' && this.w.endTimer < 0;
  }

  /** The ball leaves the paddle, angled by where the paddle is heading. */
  onFire(): void {
    this.docked = false;
    const a = clamp(this.paddle.vx / 2400, -0.5, 0.5);
    const b = this.w.spawnBall('main', this.paddle.x, REBOUND.paddleY - 12, Math.sin(a), -Math.cos(a));
    if (b) b.momentum = 0;
    this.w.emit({ t: 'sfx', name: 'launch' });
  }

  pointer(x: number, _y = 0): void {
    this.paddle.tx = clamp(x, this.paddle.w / 2, W - this.paddle.w / 2);
  }

  /** Paddle contact: the further from centre the ball lands, the steeper it leaves. */
  collideBall(b: Ball): void {
    const p = this.paddle;
    if (b.dy <= 0 || b.state !== 'flight') return;
    const top = REBOUND.paddleY;
    if (b.y + b.r < top || b.y - b.r > top + 14 || Math.abs(b.x - p.x) > p.w / 2 + b.r) return;
    const off = clamp((b.x - p.x) / (p.w / 2), -1, 1);
    let a = off * REBOUND.maxAngle + clamp(p.vx / 4000, -0.15, 0.15);
    // Never straight up: a dead-centre return would ride one emptied column forever.
    if (Math.abs(a) < REBOUND.minAngle) a = (a < 0 || (a === 0 && b.dx < 0) ? -1 : 1) * REBOUND.minAngle;
    b.dx = Math.sin(a);
    b.dy = -Math.cos(a);
    b.y = top - b.r - 0.5;
    b.idleT = 0;
    b.stuckT = 0;
    b.wallBounces = 0;
    p.flash = 1;
    this.w.emit({ t: 'wall', x: b.x, y: top, nx: 0, ny: -1, color: this.effects.fire > 0 ? '#ff8a3d' : '#7ef0d2' });
    this.w.emit({ t: 'sfx', name: 'bumper', pitch: 1.1 + Math.abs(off) * 0.3, vol: 0.5 });
  }

  hit(_b: Ball, tg: Target): 'pass' | 'bounce' {
    const fire = this.effects.fire > 0;
    this.damage(tg, fire ? 2 : 1);
    return fire && !tg.alive ? 'pass' : 'bounce';
  }

  touch(): void { /* Rebound drops capsules instead of laying pickups. */ }

  private damage(tg: Target, n: number): void {
    if (!tg.alive) return;
    const w = this.w;
    tg.hp -= n;
    tg.flash = 1;
    w.addCombo(0.5);
    if (tg.hp > 0) {
      w.emit({ t: 'sfx', name: 'crate', pitch: 1.4, vol: 0.35 });
      return;
    }
    tg.alive = false;
    this.blocks++;
    w.run.kills++;
    this.score += 10 * tg.maxHp + Math.floor(w.combo.count);
    w.emit({ t: 'kill', x: tg.x, y: tg.y, r: tg.r, color: reboundColor(tg.maxHp), big: tg.maxHp > 2 });
    w.emit({ t: 'burst', x: tg.x, y: tg.y, color: reboundColor(tg.maxHp), n: 12, speed: 210, size: 3 });
    w.emit({ t: 'sfx', name: 'shatter', pitch: 1 + Math.min(w.combo.count, 30) * 0.02, vol: 0.55 });
    if (tg.kind === 'bombBlock') {
      w.emit({ t: 'explosion', x: tg.x, y: tg.y, r: CELL * 1.3, color: '#ff9a3d' });
      w.emit({ t: 'shake', amt: 5 });
      w.emit({ t: 'sfx', name: 'explode' });
      for (const o of this.targets) if (o.alive && Math.abs(o.row - tg.row) <= 1 && Math.abs(o.col - tg.col) <= 1) this.damage(o, 2);
    }
    if (this.rng.chance(REBOUND.dropChance)) {
      const kind = this.rng.weighted<CapsuleKind>(['multi', 'wide', 'fire', 'slow', 'life'], (k) => (k === 'life' ? (this.lives < REBOUND.maxLives ? 1 : 0) : k === 'multi' ? 4 : 3))!;
      this.capsules.push({ kind, x: tg.x, y: tg.y, alive: true, age: 0 });
    }
  }

  private nextWave(): void {
    const w = this.w;
    this.wave++;
    this.stepT = this.stepDelay();
    const rows = Math.min(7, 3 + Math.floor((this.wave - 1) / 2));
    const base = 1 + Math.floor((this.wave - 1) / 2);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < REBOUND.cols; col++) {
        // Later waves leave gaps and carve a pattern, so each wave has its own shape.
        if (this.wave > 1 && this.rng.chance(0.12 + Math.min(0.14, this.wave * 0.01))) continue;
        const hp = base + (row < 2 && this.wave > 2 && this.rng.chance(0.25) ? base : 0);
        const kind: TargetKind = this.wave >= 3 && this.rng.chance(0.06) ? 'bombBlock' : 'block';
        this.targets.push({
          id: w.id(), kind, shape: 'block', x: cellX(col), y: cellY(row) - 40, r: (CELL - REBOUND.gap) / 2, hh: this.brickH / 2, hp, maxHp: hp,
          alive: true, flash: 0, age: 0, row, col, ty: cellY(row), used: false,
        });
      }
    }
    if (this.wave > 1) {
      w.banner(t('arcade.waveN', { n: this.wave }), '#7ef0d2', t('arcade.waveSub'));
      w.emit({ t: 'sfx', name: 'event' });
      this.score += 100 * (this.wave - 1);
    }
  }

  private stepDelay(): number {
    return Math.max(REBOUND.stepMin, REBOUND.step - (this.wave - 1) * REBOUND.stepWave);
  }

  /** Every block steps down a row; one reaching the paddle row ends the run. */
  private stepDown(): void {
    for (const tg of this.targets) {
      if (!tg.alive) continue;
      tg.row++;
      tg.ty = cellY(tg.row);
    }
    this.w.emit({ t: 'sfx', name: 'wall', pitch: 0.55, vol: 0.5 });
    this.w.emit({ t: 'shake', amt: 2 });
  }

  private lose(): void {
    const w = this.w;
    this.lives--;
    this.effects = { wide: 0, fire: 0, slow: 0 };
    w.emit({ t: 'flash', color: '#ff3b5c', a: 0.25 });
    w.emit({ t: 'sfx', name: 'hurt' });
    if (this.lives <= 0) {
      this.done = true;
      w.banner(t('arcade.reboundOver'), '#ff3b3b', t('arcade.reboundOverSub', { n: this.wave }), true);
      w.finish(false);
      return;
    }
    this.docked = true;
    w.banner(t('arcade.ballLost'), '#ff6b81', t('arcade.livesLeft', { n: this.lives }));
  }

  update(dt: number): void {
    const w = this.w;
    if (this.done) return;
    for (const tg of this.targets) {
      tg.age += dt;
      tg.flash = Math.max(0, tg.flash - dt * 5);
      tg.y += (tg.ty - tg.y) * Math.min(1, dt * 10);
    }
    // Paddle: eased toward the pointer, at a capped speed.
    const p = this.paddle;
    for (const k of ['wide', 'fire', 'slow'] as const) this.effects[k] = Math.max(0, this.effects[k] - dt);
    p.w += ((this.effects.wide > 0 ? REBOUND.wideW : REBOUND.paddleW) - p.w) * Math.min(1, dt * 8);
    p.tx = clamp(p.tx, p.w / 2, W - p.w / 2);
    const move = clamp(p.tx - p.x, -REBOUND.paddleSpeed * dt, REBOUND.paddleSpeed * dt);
    p.vx = dt > 0 ? move / dt : 0;
    p.x += move;
    p.flash = Math.max(0, p.flash - dt * 4);
    // A ball that dropped past the paddle is gone; with none left, a life goes.
    for (const b of w.balls) {
      if (b.kind === 'main' && b.state === 'returning') {
        b.dead = true;
        w.emit({ t: 'burst', x: b.x, y: b.y, color: '#ff6b81', n: 10, speed: 140 });
      }
    }
    if (!this.docked && !w.balls.some((b) => b.kind === 'main' && !b.dead)) this.lose();
    if (this.done) return;
    // Capsules fall and are caught by the paddle.
    for (const c of this.capsules) {
      if (!c.alive) continue;
      c.age += dt;
      c.y += REBOUND.capsuleSpeed * dt;
      if (c.y + 9 >= REBOUND.paddleY && c.y - 9 <= REBOUND.paddleY + 14 && Math.abs(c.x - p.x) <= p.w / 2 + 12) {
        c.alive = false;
        this.apply(c.kind);
      } else if (c.y > DEFENSE_Y + 60) c.alive = false;
    }
    this.capsules = this.capsules.filter((c) => c.alive);
    // The wall steps down on a timer, and only while a ball is in play.
    if (!this.docked) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = this.stepDelay();
        this.stepDown();
      }
    }
    if (this.targets.some((tg) => tg.alive && tg.row >= REBOUND.loseRow)) {
      this.done = true;
      w.banner(t('arcade.reboundOver'), '#ff3b3b', t('arcade.reboundOverSub', { n: this.wave }), true);
      w.finish(false);
      return;
    }
    if (!this.targets.some((tg) => tg.alive)) {
      this.targets.length = 0;
      this.nextWave();
    }
  }

  private apply(kind: CapsuleKind): void {
    const w = this.w;
    const e = this.effects;
    if (kind === 'multi') {
      const src = w.balls.filter((b) => b.kind === 'main' && b.state === 'flight');
      for (const b of src) {
        for (const s of [-1, 1]) {
          if (w.balls.filter((x) => x.kind === 'main').length >= REBOUND.maxBalls) break;
          const a = Math.atan2(b.dy, b.dx) + s * 0.45;
          const n = w.spawnBall('main', b.x, b.y, Math.cos(a), Math.sin(a));
          if (n) n.momentum = 0;
        }
      }
    } else if (kind === 'life') this.lives = Math.min(REBOUND.maxLives, this.lives + 1);
    else e[kind] = REBOUND.effect;
    this.score += 50;
    w.emit({ t: 'text', x: this.paddle.x, y: REBOUND.paddleY - 30, text: t(`arcade.capsule.${kind}`), color: CAPSULE_COLOR[kind] });
    w.emit({ t: 'ring', x: this.paddle.x, y: REBOUND.paddleY, r: 60, color: CAPSULE_COLOR[kind], dur: 0.4 });
    w.emit({ t: 'sfx', name: 'synergy', vol: 0.6 });
  }

  /** Rows of clearance left before the lowest block reaches the paddle. */
  rowsLeft(): number {
    let r = -1;
    for (const tg of this.targets) if (tg.alive) r = Math.max(r, tg.row);
    return Math.max(0, REBOUND.loseRow - 1 - r);
  }

  result(): ArcadeResult {
    return { mode: 'rebound', cleared: false, wave: this.wave, score: this.score, blocks: this.blocks, coins: 0, time: this.w.time };
  }
}

/** Rebound bricks: cool for one hit, warming toward hot pink as they toughen. */
export function reboundColor(hp: number): string {
  const stops = ['#5ee7d0', '#56b6ff', '#7a7dff', '#b46bff', '#ff5dbb', '#ff5d6e'];
  return stops[Math.min(stops.length - 1, Math.max(0, hp - 1))];
}
