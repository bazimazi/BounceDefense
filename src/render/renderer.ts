import { fontFamily, isRtl, localizeDigits, t } from '../i18n';
import { TAU, clamp, easeOutBack, formatNum, formatTime } from '../core/math';
import { EVENT_MAP } from '../data/arenas';
import { CORE_MAP } from '../data/balls';
import { BOSS_MAP, ELITE_MAP } from '../data/enemies';
import { EVOLUTION_MAP } from '../data/synergies';
import { SENTINEL_INTERVAL } from '../data/meta';
import { UPGRADE_MAP } from '../data/upgrades';
import { ARCHITECT_WALL, COLOSSUS_CAP, FORTRESS_HALF_ARC, FORTRESS_RING, OVERMIND_WARD_MAX, TWIN_REVIVE } from '../sim/bosses';
import { RELIC_MAP } from '../data/relics';
import { traceAim } from '../sim/physics';
import {
  DEFENSE_Y, FIELD_TOP, FLOOR_Y, H, LAUNCHER_X, LAUNCHER_Y, W,
  type Ball, type Enemy, type Fx,
} from '../sim/types';
import { MOMENTUM_COLORS, momentumName, POWER_START, POWER_END, SENTINEL_POS, type World } from '../sim/world';
import { effectiveTier } from '../sim/physics';
import { FURY } from '../sim/director';
import { Particles } from './particles';
import { createArenaSurface, drawArenaAtmosphere } from './arena';
import { drawResonance } from './resonance';
import { coreSprite, orbLighting } from './cores';
import { drawEnemyShadow, drawEnemyShell, drawEnemyInsignia, enemyShape, eyeAnchor, shade } from './enemy-art';
import { arc, contactShadow, drawBumper, drawPortal, drawRail, drawTurret } from './hardware';
import { PostFx } from './post';

interface Bolt { pts: number[]; life: number; color: string }
interface Ring { x: number; y: number; r: number; life: number; max: number; color: string }
interface Boom { x: number; y: number; r: number; life: number; color: string }
interface Beam { x0: number; y0: number; x1: number; y1: number; life: number; color: string }
interface FloatText { x: number; y: number; text: string; life: number; max: number; color: string; size: number; vy: number }
interface Banner { text: string; sub?: string; color: string; big: boolean; t: number; dur: number; wait: number }
/** Seconds a minor banner may wait in the queue before it is too stale to show. */
const BANNER_STALE = 2;
interface Starfall { pts: number[]; life: number }
interface Debris { x: number; y: number; vx: number; vy: number; spin: number; r: number; life: number; color: string }
interface Impact { x: number; y: number; life: number; color: string; angle: number; reach: number; rays: number }
/** Floor marks left by blasts and kills; they fade over several seconds. */
interface Decal { x: number; y: number; r: number; life: number; max: number; color: string; kind: 'scorch' | 'splat'; rot: number }
interface Smoke { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; tint: string }
/** A lagging health ghost per enemy, so chunks of damage read as they drain. */
interface HpGhost { v: number; seen: number }

export interface RenderOptions {
  shake: boolean;
  damageNumbers: boolean;
  previewBounces: number;
  /** Softens full-screen flashes and the low-hull pulse. */
  reduceFlashes: boolean;
}

/** Resolved per frame so a language switch also changes the canvas typeface. */
let FONT = fontFamily();

/**
 * Every string the HUD draws or measures passes through `localizeDigits`, so canvas numbers follow
 * the language the same way DOM text does. `maxWidth` is forwarded only when given: an explicit
 * `undefined` would make the browser draw nothing.
 */
function localizeCanvasText(ctx: CanvasRenderingContext2D): void {
  const { fillText, strokeText, measureText } = ctx;
  ctx.fillText = (text, x, y, maxWidth?) => maxWidth === undefined ? fillText.call(ctx, localizeDigits(text), x, y) : fillText.call(ctx, localizeDigits(text), x, y, maxWidth);
  ctx.strokeText = (text, x, y, maxWidth?) => maxWidth === undefined ? strokeText.call(ctx, localizeDigits(text), x, y) : strokeText.call(ctx, localizeDigits(text), x, y, maxWidth);
  ctx.measureText = text => measureText.call(ctx, localizeDigits(text));
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  scale = 1;
  dpr = 1;
  particles = new Particles(1400);
  bolts: Bolt[] = [];
  rings: Ring[] = [];
  booms: Boom[] = [];
  beams: Beam[] = [];
  texts: FloatText[] = [];
  banners: Banner[] = [];
  starfalls: Starfall[] = [];
  debris: Debris[] = [];
  private impacts: Impact[] = [];
  private decals: Decal[] = [];
  private smoke: Smoke[] = [];
  private hpGhost = new Map<number, HpGhost>();
  /** Render-side velocity estimates, for lean, exhaust and motion trails. */
  private motion = new Map<number, { x: number; y: number; vx: number; vy: number; seen: number }>();
  private readonly post = new PostFx();
  private shadow: HTMLCanvasElement | null = null;
  private barrierArt = new Map<string, HTMLCanvasElement>();
  shake = 0;
  flash = { color: '#fff', a: 0 };
  hurtFlash = 0;
  time = 0;
  private glow = new Map<string, HTMLCanvasElement>();
  private bg: HTMLCanvasElement | null = null;
  private bgArena = '';
  private dark: HTMLCanvasElement | null = null;
  private trace: number[] = [];
  opts: RenderOptions = { shake: true, damageNumbers: true, previewBounces: 1, reduceFlashes: false };
  /** Emoji upgrade icons are rasterised once; the HUD build strip then blits them. */
  private iconSprites = new Map<string, HTMLCanvasElement>();
  private launcherRecoil = 0;
  private hullGhost = 1;
  /** What visored enemies look at this frame. */
  private gaze: [number, number] = [LAUNCHER_X, LAUNCHER_Y];
  private shakeAt: [number, number] = [0, 0];
  private bossGhost = 1;
  private lastHand = 0;
  private emissionDt = 0;
  private readonly reducedMotion = typeof window === 'undefined' ? null : window.matchMedia('(prefers-reduced-motion: reduce)');

  private emits(rate: number): boolean {
    return Math.random() < 1 - Math.exp(-rate * this.emissionDt);
  }

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    localizeCanvasText(this.ctx);
  }

  resize(): { x: number; y: number; w: number; h: number } {
    const parent = this.canvas.parentElement!;
    const pw = parent.clientWidth;
    const ph = parent.clientHeight;
    const s = Math.min(pw / W, ph / H);
    const cw = Math.floor(W * s);
    const ch = Math.floor(H * s);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.style.width = `${cw}px`;
    this.canvas.style.height = `${ch}px`;
    this.canvas.style.left = `${Math.floor((pw - cw) / 2)}px`;
    this.canvas.style.top = `${Math.floor((ph - ch) / 2)}px`;
    this.canvas.width = Math.floor(cw * this.dpr);
    this.canvas.height = Math.floor(ch * this.dpr);
    this.scale = s;
    return { x: (pw - cw) / 2, y: (ph - ch) / 2, w: cw, h: ch };
  }

  reset(): void {
    this.particles.n = 0;
    this.bolts = [];
    this.rings = [];
    this.booms = [];
    this.beams = [];
    this.texts = [];
    this.banners = [];
    this.starfalls = [];
    this.debris = [];
    this.impacts = [];
    this.decals = [];
    this.smoke = [];
    this.hpGhost.clear();
    this.motion.clear();
    this.shake = 0;
    this.flash.a = 0;
    this.hurtFlash = 0;
    this.launcherRecoil = 0;
    this.lastHand = 0;
    this.hullGhost = 1;
    this.bossGhost = 1;
  }

  private glowSprite(color: string): HTMLCanvasElement {
    let c = this.glow.get(color);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, color + '88');
    grad.addColorStop(1, color + '00');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.glow.set(color, c);
    return c;
  }

  private drawGlow(x: number, y: number, r: number, color: string, a = 1): void {
    const ctx = this.ctx;
    ctx.globalAlpha = a;
    ctx.drawImage(this.glowSprite(color), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  /** Glows deferred to one additive pass, so dozens of small lights cost one blend-mode switch. */
  private lightQueue: (string | number)[] = [];
  private queueLight(x: number, y: number, r: number, color: string, a: number): void {
    if (a > .01) this.lightQueue.push(x, y, r, color, a);
  }
  private flushLights(): void {
    const q = this.lightQueue;
    if (!q.length) return;
    const ctx = this.ctx;
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < q.length; i += 5) {
      const x = q[i] as number, y = q[i + 1] as number, r = q[i + 2] as number;
      ctx.globalAlpha = q[i + 4] as number;
      ctx.drawImage(this.glowSprite(q[i + 3] as string), x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = op;
    q.length = 0;
  }
  /** High quality: full detail until the device proves too slow for the bloom pass. */
  private get hq(): boolean { return this.post.enabled; }
  /** Swarm scenes drop per-unit flourishes to keep the frame rate. */
  private dense = false;

  /** Additive light: glows that add to what is under them, so overlapping lights burn hotter. */
  private drawLight(x: number, y: number, r: number, color: string, a = 1): void {
    const ctx = this.ctx;
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    this.drawGlow(x, y, r, color, a);
    ctx.globalCompositeOperation = op;
  }

  /** A soft elliptical contact shadow; the key light sits above and to the upper left. */
  private drawShadow(x: number, y: number, r: number, a = .5, lift = 1): void {
    if (!this.shadow) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(.45, 'rgba(0,0,0,.7)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
      this.shadow = c;
    }
    const ctx = this.ctx;
    const off = r * .28 * lift;
    ctx.globalAlpha = a;
    ctx.drawImage(this.shadow, x - r * 1.25 + off * .6, y - r * .95 + off, r * 2.5, r * 1.9 + off * .4);
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ fx intake
  handleFx(f: Fx): void {
    const p = this.particles;
    switch (f.t) {
      case 'starfall':
        this.starfalls.push({ pts: f.pts, life: .85 });
        this.rings.push({ x: W / 2, y: 400, r: 360, life: .9, max: .9, color: '#bca7ff' });
        this.queueBanner({ text: t('canvas.starfall'), sub: t('canvas.starfallSub'), color: '#bca7ff', big: true, t: 0, dur: 1.8, wait: 0 }, true);
        break;
      case 'hit': {
        const rays = f.crit ? 8 : f.mat === 'metal' || f.mat === 'crystal' ? 5 : 3;
        if (this.impacts.length < 100) this.impacts.push({
          x: f.x, y: f.y, color: f.color, life: .18, angle: Math.random() * TAU,
          reach: (f.crit ? 25 : 12) + Math.min(9, Math.sqrt(Math.max(0, f.power || 0)) * .6), rays,
        });
        const n = f.crit ? 14 : 6;
        p.burst(f.x, f.y, f.color, n, f.crit ? 340 : 220, f.crit ? 3.5 : 2.5, 0.35);
        if (f.crit) this.rings.push({ x: f.x, y: f.y, r: 26, life: 0.22, max: 0.22, color: '#ffe066' });
        break;
      }
      case 'dmg':
        if (!this.opts.damageNumbers || this.texts.length > 90) break;
        this.texts.push({ x: f.x, y: f.y, text: formatNum(f.v), life: 0.7, max: 0.7, color: f.color, size: f.crit ? 22 : 14, vy: f.crit ? -70 : -45 });
        break;
      case 'wall': {
        const angle = Math.atan2(f.ny, f.nx);
        for (let i = 0; i < 6; i++) {
          const a = angle + (i - 2.5) * .29;
          const speed = 120 + Math.random() * 120;
          p.spawn(f.x, f.y, Math.cos(a) * speed, Math.sin(a) * speed, .23, i % 2 ? 1.5 : 2.5, f.color, 4);
        }
        this.rings.push({ x: f.x, y: f.y, r: 24, life: .28, max: .28, color: f.color });
        break;
      }
      case 'explosion': {
        this.booms.push({ x: f.x, y: f.y, r: f.r, life: 0.42, color: f.color });
        p.burst(f.x, f.y, f.color, Math.min(26, 8 + f.r / 5), f.r * 4, 3.5, 0.45);
        // Hot white sparks thrown wide, then a slow column of smoke and a scorch on the deck.
        p.burst(f.x, f.y, '#fff1c9', Math.min(14, 4 + f.r / 8), f.r * 6, 2, 0.3);
        const puffs = Math.min(9, 3 + Math.round(f.r / 14));
        for (let i = 0; i < puffs && this.smoke.length < 70; i++) {
          const a = Math.random() * TAU, d = Math.random() * f.r * .45;
          this.smoke.push({ x: f.x + Math.cos(a) * d, y: f.y + Math.sin(a) * d, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 18,
            r: f.r * (.22 + Math.random() * .18), life: .9 + Math.random() * .6, max: 1.5, tint: shade(f.color, .82) });
        }
        this.addDecal({ x: f.x, y: f.y, r: f.r * .8, life: 7, max: 7, color: f.color, kind: 'scorch', rot: Math.random() * TAU });
        break;
      }
      case 'lightning':
        this.bolts.push({ pts: jaggedify(f.pts), life: 0.18, color: f.color });
        break;
      case 'kill':
        p.burst(f.x, f.y, f.color, f.big ? 34 : 12, f.big ? 380 : 240, f.big ? 4.5 : 3, f.big ? 0.8 : 0.5);
        p.burst(f.x, f.y, '#ffffff', f.big ? 10 : 4, f.big ? 300 : 180, 1.6, .25);
        this.rings.push({ x: f.x, y: f.y, r: f.r * 2.2, life: 0.3, max: 0.3, color: f.color });
        this.booms.push({ x: f.x, y: f.y, r: f.r * (f.big ? 2.4 : 1.5), life: f.big ? .4 : .24, color: f.color });
        this.addDecal({ x: f.x, y: f.y, r: f.r * (f.big ? 1.8 : 1.3), life: 5, max: 5, color: f.color, kind: 'splat', rot: f.x * 1.7 });
        for (let i = 0; i < (f.big ? 9 : 4) && this.debris.length < 160; i++) {
          const a = i * 2.4 + f.x;
          this.debris.push({ x: f.x, y: f.y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140 - 70,
            spin: a, r: Math.min(9, f.r * .25), life: .65, color: f.color });
        }
        break;
      case 'burst':
        p.burst(f.x, f.y, f.color, f.n, f.speed, f.size ?? 2.5);
        break;
      case 'ring':
        this.rings.push({ x: f.x, y: f.y, r: f.r, life: f.dur ?? 0.4, max: f.dur ?? 0.4, color: f.color });
        break;
      case 'beam':
        this.beams.push({ ...f, life: 0.16 });
        break;
      case 'banner':
        this.queueBanner({ text: f.text, sub: f.sub, color: f.color, big: !!f.big, t: 0, dur: f.big ? 2.2 : 1.5, wait: 0 });
        break;
      case 'shake':
        if (this.opts.shake) this.shake = Math.min(22, this.shake + f.amt);
        break;
      case 'flash':
        this.flash = { color: f.color, a: Math.max(this.flash.a, f.a) };
        break;
      case 'hurt':
        this.hurtFlash = 1;
        p.burst(f.x, DEFENSE_Y, '#ff3b3b', 16, 260, 3, 0.5);
        this.texts.push({ x: f.x, y: DEFENSE_Y - 16, text: `-${Math.round(f.dmg)}`, life: 0.9, max: 0.9, color: '#ff5d73', size: 20, vy: -50 });
        break;
      case 'heal':
        this.texts.push({ x: f.x, y: f.y, text: `+${Math.round(f.v)}`, life: 0.8, max: 0.8, color: '#6dff9c', size: 14, vy: -40 });
        break;
      case 'text':
        this.texts.push({ x: f.x, y: f.y, text: f.text, life: 1.1, max: 1.1, color: f.color, size: 15, vy: -30 });
        break;
      default:
        break;
    }
  }

  private addDecal(d: Decal): void {
    if (this.decals.length >= 40) this.decals.shift();
    this.decals.push(d);
  }

  private queueBanner(b: Banner, front = false): void {
    const q = this.banners;
    // The same announcement already waiting (e.g. repeated synergy/combo calls) is refreshed, not repeated.
    const dup = q.findIndex((x, i) => i > 0 && x.text === b.text && x.sub === b.sub);
    if (dup > 0) q.splice(dup, 1);
    if (front) q.unshift(b);
    else q.push(b);
    // Over capacity: drop the oldest waiting minor banner, then the oldest waiting one.
    while (q.length > 6) {
      const minor = q.findIndex((x, i) => i > 0 && !x.big && x !== b);
      q.splice(minor > 0 ? minor : 1, 1);
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.emissionDt = dt;
    this.launcherRecoil *= Math.exp(-dt * 15);
    this.particles.update(dt);
    for (const hit of this.impacts) hit.life -= dt;
    this.impacts = this.impacts.filter(hit => hit.life > 0);
    for (const d of this.decals) d.life -= dt;
    if (this.decals.length && this.decals[0].life <= 0) this.decals = this.decals.filter(d => d.life > 0);
    for (const m of this.smoke) {
      m.life -= dt; m.x += m.vx * dt; m.y += m.vy * dt;
      m.vx *= Math.exp(-dt * 2); m.vy = m.vy * Math.exp(-dt * 2) - 8 * dt; m.r += dt * 16;
    }
    this.smoke = this.smoke.filter(m => m.life > 0);
    for (const s of this.starfalls) s.life -= dt;
    this.starfalls = this.starfalls.filter(s => s.life > 0);
    for (const d of this.debris) {
      d.life -= dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 260 * dt; d.spin += dt * 5;
    }
    this.debris = this.debris.filter(d => d.life > 0);
    for (const b of this.bolts) b.life -= dt;
    this.bolts = this.bolts.filter((b) => b.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const b of this.booms) b.life -= dt;
    this.booms = this.booms.filter((b) => b.life > 0);
    for (const b of this.beams) b.life -= dt;
    this.beams = this.beams.filter((b) => b.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.exp(-dt * 3);
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    if (this.banners.length) {
      // A busy queue drains faster, and minor news that waited too long is dropped,
      // so banners never describe something that ended seconds ago.
      const b = this.banners[0];
      b.t += dt * Math.min(b.big ? 1.5 : 3, 1 + 0.75 * (this.banners.length - 1));
      if (b.t >= b.dur) this.banners.shift();
      for (let i = 1; i < this.banners.length; i++) this.banners[i].wait += dt;
      this.banners = this.banners.filter((q, i) => i === 0 || q.big || q.wait < BANNER_STALE);
    }
    this.shake = Math.max(0, this.shake - dt * 40);
    this.flash.a = Math.max(0, this.flash.a - dt * 2.5);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
  }

  // ------------------------------------------------------------------ frame
  draw(w: World, hud = true): void {
    const ctx = this.ctx;
    FONT = fontFamily();
    // Persian telemetry needs a right-to-left base direction for mixed digits and punctuation.
    ctx.direction = isRtl() ? 'rtl' : 'ltr';
    const k = this.scale * this.dpr;
    this.post.pace(typeof performance === 'undefined' ? 0 : performance.now());
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    this.drawBackground(w);
    if (w.hand < this.lastHand) this.launcherRecoil = 1;
    this.lastHand = w.hand;

    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    this.shakeAt = [sx, sy];
    ctx.setTransform(k, 0, 0, k, sx * k, sy * k);

    this.drawDecals();
    this.drawFloorLights(w);
    this.drawDefenseLine(w);
    this.drawObstacles(w);
    drawResonance(ctx, w, this.time, this.reducedMotion?.matches ?? false);
    this.drawZones(w);
    this.drawPickups(w);
    // Arrivals slide in from under the header instead of covering its telemetry.
    ctx.save();
    ctx.beginPath(); ctx.rect(-40, FIELD_TOP - 2, W + 80, H); ctx.clip();
    // Every shadow lands on the floor before any body, so bodies never sit under a neighbor's shadow.
    let alive = 0;
    for (const e of w.enemies) if (e.alive) alive++;
    this.dense = alive > 45;
    for (const e of w.enemies) if (e.alive && !e.phased && e.spawnT > .2) this.drawEnemyGroundShadow(e);
    this.flushLights();
    const lead = w.balls.find(b => b.kind === 'main' && b.state === 'flight') ?? w.balls[0];
    this.gaze = lead ? [lead.x, lead.y] : [LAUNCHER_X, LAUNCHER_Y];
    for (const e of w.enemies) if (e.alive) this.drawEnemy(e);
    this.flushLights();
    this.drawBossExtras(w);
    ctx.restore();
    this.drawThreats(w);
    this.drawRefraction();
    this.drawSmoke();
    this.drawProjectiles(w);
    this.drawEffects();
    this.particles.draw(ctx);
    this.drawAim(w);
    this.drawLauncher(w);
    if (w.flags.has('sentinel')) this.drawSentinels(w);
    for (const b of w.balls) this.drawBall(w, b);
    if (w.event?.id === 'blackout') this.drawBlackout(w);
    if (w.timeStop > 0 || w.event?.id === 'time_warp') {
      const a = w.timeStop > 0 ? Math.min(0.22, w.timeStop * 0.3) : 0.05;
      ctx.fillStyle = `rgba(255,214,122,${a})`;
      ctx.fillRect(0, FIELD_TOP, W, DEFENSE_Y - FIELD_TOP);
    }
    // Bloom gathers every emissive surface drawn so far; flashes are toned down on request.
    this.post.bloom(ctx, this.canvas, this.opts.reduceFlashes ? .55 : 1);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    this.post.finish(ctx, !this.reducedMotion?.matches, this.hq);
    ctx.setTransform(k, 0, 0, k, sx * k, sy * k);
    this.drawTexts();

    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (hud) {
      this.drawHud(w);
      this.drawBanner();
    } else {
      ctx.fillStyle = 'rgba(7,6,15,0.45)';
      ctx.fillRect(0, 0, W, H);
    }
    if (hud) this.drawLowHull(w);
    if (this.flash.a > 0) {
      ctx.globalAlpha = this.flash.a * (this.opts.reduceFlashes ? 0.3 : 1);
      ctx.fillStyle = this.flash.color;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (this.hurtFlash > 0) {
      const g = ctx.createLinearGradient(0, H, 0, H - 260);
      g.addColorStop(0, `rgba(255,40,60,${(this.opts.reduceFlashes ? 0.2 : 0.45) * this.hurtFlash})`);
      g.addColorStop(1, 'rgba(255,40,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, H - 260, W, 260);
    }
    // Ambient emitters must not run again while the simulation is paused.
    this.emissionDt = 0;
  }

  private drawBackground(w: World): void {
    const ctx = this.ctx;
    if (!this.bg || this.bgArena !== w.arena.id) {
      this.bg = createArenaSurface(w.arena, 2);
      this.bgArena = w.arena.id;
    }
    ctx.drawImage(this.bg, 0, 0, W, H);
    drawArenaAtmosphere(ctx, w.arena, this.reducedMotion?.matches ? 0 : this.time, this.hq);
  }

  private decalArt = new Map<string, HTMLCanvasElement>();
  /** Scorches are soot with radial streaks; splats are tinted ichor with droplets. */
  private decalSprite(kind: Decal['kind'], color: string): HTMLCanvasElement {
    const key = kind === 'scorch' ? 'scorch' : color;
    let c = this.decalArt.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.translate(64, 64);
    if (kind === 'scorch') {
      const soot = g.createRadialGradient(0, 0, 0, 0, 0, 60);
      soot.addColorStop(0, 'rgba(0,0,0,.85)'); soot.addColorStop(.5, 'rgba(4,2,2,.55)'); soot.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = soot; g.fillRect(-64, -64, 128, 128);
      g.strokeStyle = 'rgba(0,0,0,.45)';
      for (let i = 0; i < 22; i++) {
        const a = i * 2.39996, l = 34 + (i * 37 % 26);
        g.lineWidth = 1 + (i % 3);
        g.beginPath(); g.moveTo(Math.cos(a) * 14, Math.sin(a) * 14); g.lineTo(Math.cos(a) * l, Math.sin(a) * l); g.stroke();
      }
    } else {
      const ink = shade(color, .55);
      g.fillStyle = ink;
      for (let i = 0; i < 9; i++) {
        const a = i * 2.39996, d = 10 + (i * 29 % 30), r = 4 + (i * 13 % 9);
        g.globalAlpha = .55;
        g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, TAU); g.fill();
      }
      const pool = g.createRadialGradient(0, 0, 0, 0, 0, 30);
      pool.addColorStop(0, ink); pool.addColorStop(1, ink + '00');
      g.globalAlpha = .8; g.fillStyle = pool; g.beginPath(); g.arc(0, 0, 30, 0, TAU); g.fill();
    }
    if (this.decalArt.size > 64) this.decalArt.delete(this.decalArt.keys().next().value!);
    this.decalArt.set(key, c);
    return c;
  }

  private drawDecals(): void {
    const ctx = this.ctx;
    for (const d of this.decals) {
      const fade = Math.min(1, d.life / 1.5);
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
      ctx.globalAlpha = fade * (d.kind === 'scorch' ? .75 : .4);
      ctx.drawImage(this.decalSprite(d.kind, d.color), -d.r, -d.r, d.r * 2, d.r * 2);
      ctx.restore();
      // Fresh scorches smoulder for a moment.
      const hot = (d.life - (d.max - 1)) / 1;
      if (d.kind === 'scorch' && hot > 0) this.drawLight(d.x, d.y, d.r * .7, '#ff7a2a', hot * .45);
    }
    ctx.globalAlpha = 1;
  }

  private drawSmoke(): void {
    const ctx = this.ctx;
    for (const m of this.smoke) {
      const t = m.life / m.max;
      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
      g.addColorStop(0, m.tint + 'b0'); g.addColorStop(.6, m.tint + '50'); g.addColorStop(1, m.tint + '00');
      ctx.globalAlpha = Math.min(1, t * 1.6) * .7;
      ctx.fillStyle = g; ctx.fillRect(m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
    }
    ctx.globalAlpha = 1;
  }

  /** Light that spills onto the deck from everything emissive in play. */
  private drawFloorLights(w: World): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath(); ctx.rect(12, FIELD_TOP, W - 24, H - FIELD_TOP); ctx.clip();
    const [, trail] = w.trailColors;
    for (const b of w.balls) {
      const main = b.kind === 'main';
      this.drawLight(b.x, b.y + 8, main ? 95 : 55, b.powered ? '#ffe3a3' : trail, main ? .22 : .12);
    }
    for (const p of w.projectiles) this.drawLight(p.x, p.y, 46, p.color, .28);
    for (const b of this.booms) {
      const t = 1 - b.life / .42;
      this.drawLight(b.x, b.y, b.r * 2.6, b.color, Math.max(0, 1 - t) * .55);
    }
    for (const z of w.zones) {
      if (z.kind === 'fire') this.drawLight(z.x, z.y, z.r * 1.6, '#ff7a2a', .26 * (1 - z.t / z.dur));
      else if (z.kind === 'toxic') this.drawLight(z.x, z.y, z.r * 1.5, '#8dff3a', .14 * (1 - z.t / z.dur));
    }
    for (const e of w.enemies) {
      if (!e.alive) continue;
      if (e.st.burnT > 0) this.drawLight(e.x, e.y, e.r * 3, '#ff7a2a', .2);
      else if (e.boss) this.drawLight(e.x, e.y, e.r * 3.2, e.def.color, .14);
      else if (e.def.material === 'energy') this.drawLight(e.x, e.y, e.r * 2.6, e.def.color, .1);
    }
    for (const o of w.obstacles) {
      if (o.kind === 'oil' && o.burning > 0) this.drawLight(o.x, o.y, o.r * 1.8, '#ff7a2a', .3);
      else if (o.kind === 'bumper') this.drawLight(o.x, o.y, o.r * 3, w.arena.theme.accent, .1 + o.flash * .3);
    }
    ctx.restore();
  }

  /** The barrier's hex lattice, baked per state color and scrolled at draw time. */
  private barrierSprite(col: string): HTMLCanvasElement {
    let c = this.barrierArt.get(col);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = W * 2; c.height = 64;
    const g = c.getContext('2d')!;
    g.scale(2, 2);
    const curtain = g.createLinearGradient(0, 0, 0, 32);
    curtain.addColorStop(0, col + '00'); curtain.addColorStop(.75, col + '20'); curtain.addColorStop(1, col + '58');
    g.fillStyle = curtain; g.fillRect(0, 0, W, 32);
    g.strokeStyle = col; g.lineWidth = .8;
    const R = 7;
    for (let row = 0; row < 4; row++) {
      for (let x = -R; x < W + R * 2; x += R * 1.732) {
        const cx = x + (row % 2) * R * .866, cy = 32 - row * R * 1.5 - 3;
        g.globalAlpha = (1 - row / 4) * .55;
        g.beginPath();
        for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + Math.PI / 6; g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
        g.closePath(); g.stroke();
      }
    }
    this.barrierArt.set(col, c);
    return c;
  }

  private drawDefenseLine(w: World): void {
    const ctx = this.ctx;
    const hpFrac = w.hp / w.maxHp;
    const col = this.hurtFlash > .15 ? '#ff5e76' : hpFrac > 0.5 ? '#5ad7ff' : hpFrac > 0.25 ? '#ffd166' : '#ff3b3b';
    const time = this.reducedMotion?.matches ? 0 : this.time;
    // Light thrown onto the deck by the barrier.
    const spill = ctx.createLinearGradient(0, DEFENSE_Y - 60, 0, DEFENSE_Y + 40);
    spill.addColorStop(0, col + '00'); spill.addColorStop(.6, col + '1c'); spill.addColorStop(.7, col + '30'); spill.addColorStop(1, col + '00');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = spill;
    ctx.fillRect(0, DEFENSE_Y - 60, W, 100);
    // Shimmering hex curtain, rising off the emitter line.
    const art = this.barrierSprite(col);
    const shimmer = .55 + .25 * Math.sin(time * 2.3) + this.hurtFlash * .5;
    ctx.globalAlpha = Math.min(1, shimmer);
    const off = (time * 12) % 24;
    ctx.drawImage(art, -off, DEFENSE_Y - 33, W + 24, 33);
    // Travelling interference bands.
    for (let i = 0; i < 3; i++) {
      const x = ((time * 140 + i * W / 3) % (W + 160)) - 80;
      const band = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
      band.addColorStop(0, col + '00'); band.addColorStop(.5, col + '50'); band.addColorStop(1, col + '00');
      ctx.globalAlpha = .5;
      ctx.fillStyle = band; ctx.fillRect(x - 60, DEFENSE_Y - 26, 120, 26);
    }
    ctx.restore();
    // Emitter channel set into the deck.
    ctx.fillStyle = '#02060c'; ctx.fillRect(0, DEFENSE_Y + 2, W, 10);
    ctx.fillStyle = '#ffffff12'; ctx.fillRect(0, DEFENSE_Y + 12, W, 1);
    for (let x = 18; x < W; x += 28) {
      ctx.fillStyle = col + '60'; ctx.fillRect(x, DEFENSE_Y + 6, 12, 2);
    }
    // The beam itself: a white-hot core in a colored sheath.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sheath = ctx.createLinearGradient(0, DEFENSE_Y - 5, 0, DEFENSE_Y + 5);
    sheath.addColorStop(0, col + '00'); sheath.addColorStop(.5, col); sheath.addColorStop(1, col + '00');
    ctx.fillStyle = sheath; ctx.fillRect(0, DEFENSE_Y - 5, W, 10);
    ctx.fillStyle = col; ctx.fillRect(0, DEFENSE_Y - 1.2, W, 2.6);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, DEFENSE_Y - .4, W, 1);
    if (!this.reducedMotion?.matches) {
      for (let i = 0; i < 5; i++) {
        const x = (this.time * 160 + i * W / 5) % W;
        const pulse = ctx.createLinearGradient(x - 30, 0, x + 4, 0);
        pulse.addColorStop(0, '#ffffff00'); pulse.addColorStop(1, '#ffffff');
        ctx.fillStyle = pulse; ctx.fillRect(x - 30, DEFENSE_Y - 1.5, 34, 3);
      }
    }
    ctx.restore();
    // Emitter pylons at each wall.
    for (const x of [16, W - 16]) {
      contactShadow(ctx, x + 3, DEFENSE_Y + 8, 14, 9, .7);
      const casing = ctx.createLinearGradient(x - 8, 0, x + 8, 0);
      casing.addColorStop(0, '#0a1622'); casing.addColorStop(.3, '#8aa4b4'); casing.addColorStop(.55, '#2b4050'); casing.addColorStop(1, '#050b13');
      ctx.fillStyle = casing;
      roundRect(ctx, x - 8, DEFENSE_Y - 18, 16, 32, 3); ctx.fill();
      ctx.strokeStyle = '#01040a'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#01040a'; ctx.fillRect(x - 3.5, DEFENSE_Y - 12, 7, 20);
      ctx.fillStyle = col; ctx.fillRect(x - 2, DEFENSE_Y - 10, 4, 16);
      this.drawLight(x, DEFENSE_Y - 2, 26, col, .7 + this.hurtFlash * .3);
    }
    if (w.barrier.charges > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#5ad7ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 6]);
      ctx.lineDashOffset = -time * 30;
      ctx.beginPath();
      ctx.moveTo(0, DEFENSE_Y - 10);
      ctx.lineTo(W, DEFENSE_Y - 10);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  private drawThreats(w: World): void {
    const ctx = this.ctx;
    ctx.save();
    for (const e of w.enemies) {
      if (!e.alive || e.boss || e.def.ai === 'golden' || e.y < DEFENSE_Y - 165) continue;
      const danger = clamp((e.y - DEFENSE_Y + 165) / 165, 0, 1);
      const fade = ctx.createLinearGradient(e.x, e.y, e.x, DEFENSE_Y);
      fade.addColorStop(0, '#ff5d7300'); fade.addColorStop(1, `rgba(255,93,115,${.05 + danger * .12})`);
      ctx.fillStyle = fade;
      ctx.beginPath(); ctx.moveTo(e.x, e.y + e.r);
      ctx.lineTo(e.x + 23, DEFENSE_Y); ctx.lineTo(e.x - 23, DEFENSE_Y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff8a96'; ctx.globalAlpha = .45 + danger * .5;
      ctx.beginPath(); ctx.moveTo(e.x, DEFENSE_Y - 7); ctx.lineTo(e.x - 5, DEFENSE_Y - 14);
      ctx.lineTo(e.x + 5, DEFENSE_Y - 14); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  private drawObstacles(w: World): void {
    const ctx = this.ctx;
    const th = w.arena.theme;
    const time = this.reducedMotion?.matches ? 0 : this.time;
    for (const o of w.obstacles) {
      switch (o.kind) {
        case 'bumper':
          this.drawLight(o.x, o.y, o.r * 2.4, th.accent, .22 + o.flash * (this.opts.reduceFlashes ? .2 : .55));
          drawBumper(ctx, o.x, o.y, o.r, th.accent, o.flash * (this.opts.reduceFlashes ? .5 : 1), time);
          break;
        case 'deflector':
          drawRail(ctx, o.ax, o.ay, o.bx, o.by, th.wall, o.flash);
          break;
        case 'barrel': {
          if (!o.alive) {
            // A charred ring where the drum stood, waiting to be restocked.
            ctx.globalAlpha = 0.35;
            ctx.strokeStyle = '#ff8a3d';
            ctx.setLineDash([3, 4]);
            arc(ctx, o.x, o.y, o.r); ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            break;
          }
          const pulse = .5 + .5 * Math.sin(time * 6);
          contactShadow(ctx, o.x + o.r * .3, o.y + o.r * .45, o.r * 1.5, o.r * 1.1, .7);
          this.drawLight(o.x, o.y, o.r * 2.4, '#ff5a1f', .2 + .15 * pulse);
          ctx.save(); ctx.translate(o.x, o.y);
          // Drum seen from above: a lit rim around a ribbed lid.
          const rim = ctx.createLinearGradient(-o.r, -o.r, o.r, o.r);
          rim.addColorStop(0, '#ffb08a'); rim.addColorStop(.35, '#c4361e'); rim.addColorStop(.7, '#5a120c'); rim.addColorStop(1, '#2a0606');
          arc(ctx, 0, 0, o.r); ctx.fillStyle = rim; ctx.fill();
          ctx.strokeStyle = '#140303'; ctx.lineWidth = 1.2; ctx.stroke();
          const lid = ctx.createRadialGradient(-o.r * .3, -o.r * .35, 1, 0, 0, o.r * .82);
          lid.addColorStop(0, '#ff6a3d'); lid.addColorStop(.6, '#9a1d10'); lid.addColorStop(1, '#3a0705');
          arc(ctx, 0, 0, o.r * .8); ctx.fillStyle = lid; ctx.fill();
          ctx.strokeStyle = '#00000080'; ctx.lineWidth = 1; arc(ctx, 0, 0, o.r * .58); ctx.stroke();
          ctx.strokeStyle = '#ffffff28'; arc(ctx, .5, .8, o.r * .58, -.4, 1.9); ctx.stroke();
          // Hazard band.
          ctx.save(); arc(ctx, 0, 0, o.r * .8); ctx.clip();
          ctx.fillStyle = '#1a0d08'; ctx.fillRect(-o.r, -o.r * .2, o.r * 2, o.r * .4);
          ctx.fillStyle = '#ffbe3c';
          for (let x = -o.r - 6; x < o.r; x += 6) {
            ctx.beginPath(); ctx.moveTo(x, o.r * .2); ctx.lineTo(x + 3, -o.r * .2); ctx.lineTo(x + 6, -o.r * .2); ctx.lineTo(x + 3, o.r * .2); ctx.closePath(); ctx.fill();
          }
          ctx.restore();
          // The pressure valve glows hotter as the fuse breathes.
          arc(ctx, 0, 0, o.r * .24); ctx.fillStyle = '#1a0603'; ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          arc(ctx, 0, 0, o.r * .16); ctx.fillStyle = 'rgba(255,' + Math.round(150 + pulse * 80) + ',80,' + (.6 + pulse * .4) + ')'; ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#ffffff60'; ctx.beginPath(); ctx.ellipse(-o.r * .4, -o.r * .5, o.r * .3, o.r * .12, -.6, 0, TAU); ctx.fill();
          ctx.restore();
          break;
        }
        case 'oil': {
          const burning = o.burning > 0;
          ctx.save(); ctx.translate(o.x, o.y);
          // A spill of lobes filling the simulated burn circle, so it reads as liquid, not a hole.
          const lobe = (lx: number, ly: number, rx: number, ry: number, rot: number) => {
            ctx.beginPath(); ctx.ellipse(lx, ly, rx, ry, rot, 0, TAU);
          };
          const lobes: [number, number, number, number, number][] = [
            [0, 0, o.r * .86, o.r * .8, 0], [-o.r * .38, -o.r * .3, o.r * .55, o.r * .42, .5],
            [o.r * .4, o.r * .25, o.r * .52, o.r * .46, -.3], [o.r * .25, -o.r * .45, o.r * .4, o.r * .35, .2],
            [-o.r * .35, o.r * .42, o.r * .44, o.r * .36, .9],
          ];
          // The rim strokes go down first; the fills cover their inner halves, leaving one outline.
          ctx.strokeStyle = burning ? 'rgba(255,120,40,0.35)' : 'rgba(190,160,255,0.3)'; ctx.lineWidth = 2.2;
          for (const l of lobes) { lobe(...l); ctx.stroke(); }
          ctx.fillStyle = burning ? '#2a0c03' : '#07050c';
          for (const l of lobes) { lobe(...l); ctx.fill(); }
          if (!burning) {
            ctx.save();
            ctx.beginPath(); for (const l of lobes) ctx.ellipse(l[0], l[1], l[2], l[3], l[4], 0, TAU); ctx.clip();
            // Oily rainbow film and the reflection of the overhead rig on the glossy surface.
            const film = ctx.createLinearGradient(-o.r, -o.r, o.r, o.r);
            film.addColorStop(0, '#5af0ff00'); film.addColorStop(.3, '#5af0ff22'); film.addColorStop(.45, '#c77dff2a');
            film.addColorStop(.6, '#ffd1661e'); film.addColorStop(.8, '#5af0ff00');
            ctx.fillStyle = film; ctx.fillRect(-o.r * 1.3, -o.r * 1.3, o.r * 2.6, o.r * 2.6);
            const shift = Math.sin(time * .6 + o.x) * o.r * .1;
            const glare = ctx.createLinearGradient(-o.r + shift, 0, o.r + shift, 0);
            glare.addColorStop(0, '#ffffff00'); glare.addColorStop(.42, '#ffffff00'); glare.addColorStop(.5, '#e8f6ff38');
            glare.addColorStop(.58, '#ffffff00'); glare.addColorStop(1, '#ffffff00');
            ctx.save(); ctx.rotate(-.7); ctx.fillStyle = glare; ctx.fillRect(-o.r * 1.4, -o.r * 1.4, o.r * 2.8, o.r * 2.8); ctx.restore();
            ctx.restore();
          } else {
            ctx.globalCompositeOperation = 'lighter';
            const fire = ctx.createRadialGradient(0, 0, 0, 0, 0, o.r);
            fire.addColorStop(0, '#ffd16660'); fire.addColorStop(.6, '#ff6a1a40'); fire.addColorStop(1, '#ff3a0a00');
            ctx.fillStyle = fire; arc(ctx, 0, 0, o.r); ctx.fill();
            // Flame wisps dance across the slick.
            for (let i = 0; i < 16; i++) {
              const k = (time * 1.5 + i * .377) % 1;
              const ang = i * 2.39996, dist = o.r * (.12 + ((i * .41) % .7));
              const fx = Math.cos(ang) * dist, fy = Math.sin(ang) * dist - k * o.r * .3;
              const fw = o.r * .11 * (1 - k * .5), fh = o.r * (.15 + .1 * (1 - k));
              ctx.globalAlpha = Math.sin(k * Math.PI) * .85;
              ctx.drawImage(this.glowSprite(k < .45 ? '#ffd166' : '#ff6a1a'), fx - fw, fy - fh, fw * 2, fh * 2);
            }
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
          }
          ctx.restore();
          if (burning && this.emits(36)) {
            const a = Math.random() * TAU;
            const r = Math.random() * o.r;
            this.particles.spawn(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r, 0, -60, 0.5, 4, Math.random() < 0.5 ? '#ff8a3d' : '#ffd166', 1);
          }
          break;
        }
        case 'crate': {
          if (!o.alive) break;
          contactShadow(ctx, o.x + o.w / 2 + 4, o.y + o.h / 2 + 6, o.w * .62, o.h * .9, .65);
          const hit = o.flash > .1;
          // Armored cargo crate: lit lid, chamfered frame, hazard trim and status lamps.
          const lidG = ctx.createLinearGradient(o.x, o.y, o.x + o.w * .3, o.y + o.h);
          lidG.addColorStop(0, hit ? '#fff0c8' : '#c9a774'); lidG.addColorStop(.35, hit ? '#e2c18a' : '#7a5a34'); lidG.addColorStop(1, '#2a1e14');
          ctx.fillStyle = '#100a06'; roundRect(ctx, o.x - 1, o.y - 1, o.w + 2, o.h + 4, 4); ctx.fill();
          ctx.fillStyle = lidG; roundRect(ctx, o.x, o.y, o.w, o.h, 3); ctx.fill();
          ctx.strokeStyle = '#ffe2b080'; ctx.lineWidth = 1; roundRect(ctx, o.x + .5, o.y + .5, o.w - 1, o.h - 1, 3); ctx.stroke();
          ctx.fillStyle = '#0d0a0e'; roundRect(ctx, o.x + 5, o.y + 5, o.w - 10, o.h - 10, 2); ctx.fill();
          ctx.save(); ctx.beginPath(); ctx.rect(o.x + 5, o.y + 5, o.w - 10, o.h - 10); ctx.clip();
          ctx.fillStyle = '#e0a83020';
          for (let x = o.x - 10; x < o.x + o.w; x += 10) {
            ctx.beginPath(); ctx.moveTo(x, o.y + o.h); ctx.lineTo(x + o.h, o.y); ctx.lineTo(x + o.h + 5, o.y); ctx.lineTo(x + 5, o.y + o.h); ctx.closePath(); ctx.fill();
          }
          ctx.restore();
          for (let i = 0; i < o.hp; i++) {
            const lx = o.x + 10 + i * 8, ly = o.y + o.h / 2;
            ctx.fillStyle = '#ffd18a'; ctx.fillRect(lx - 2, ly - 2, 4, 4);
            this.drawLight(lx, ly, 8, '#ffb13b', .7);
          }
          ctx.fillStyle = '#fff2d2a0';
          for (const [bx, by] of [[o.x + 2.5, o.y + 2.5], [o.x + o.w - 2.5, o.y + 2.5], [o.x + 2.5, o.y + o.h - 2.5], [o.x + o.w - 2.5, o.y + o.h - 2.5]]) {
            ctx.fillRect(bx - 1, by - 1, 2, 2);
          }
          break;
        }
        case 'portal':
          for (const [x, y, spin] of [[o.ax, o.ay, o.spin], [o.bx, o.by, -o.spin]]) {
            contactShadow(ctx, x + o.r * .25, y + o.r * .35, o.r * 1.5, o.r * 1.1, .55);
            this.drawLight(x, y, o.r * 2.6, '#c77dff', .4);
            drawPortal(ctx, x, y, o.r, this.reducedMotion?.matches ? 0 : spin);
          }
          break;
        case 'spore': {
          if (!o.alive) {
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = '#9cff5e';
            ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.6, 0, TAU); ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            break;
          }
          const r = o.r * (1 + Math.sin(time * 3 + o.x) * 0.06);
          contactShadow(ctx, o.x + r * .3, o.y + r * .45, r * 1.4, r * 1.05, .6);
          this.drawLight(o.x, o.y, o.r * 2.6, '#9cff5e', .28);
          ctx.save(); ctx.translate(o.x, o.y);
          // Translucent pod: a lit membrane over glowing seeds.
          const pod = ctx.createRadialGradient(-r * .3, -r * .35, 1, 0, 0, r);
          pod.addColorStop(0, '#d8ff9a'); pod.addColorStop(.35, '#5aa82a'); pod.addColorStop(.85, '#1d3d0c'); pod.addColorStop(1, '#0a1a04');
          arc(ctx, 0, 0, r); ctx.fillStyle = pod; ctx.fill();
          ctx.strokeStyle = '#061003'; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 5; i++) {
            const a = i * TAU / 5 + time * 0.4;
            const sx = Math.cos(a) * r * .48, sy = Math.sin(a) * r * .48;
            const seed = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * .26);
            seed.addColorStop(0, '#ffffff'); seed.addColorStop(.3, '#c4ff7a'); seed.addColorStop(1, '#9cff5e00');
            ctx.fillStyle = seed; arc(ctx, sx, sy, r * .26); ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = '#c4ff7a80'; ctx.lineWidth = 1;
          for (let i = 0; i < 6; i++) {
            const a = i * TAU / 6;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(Math.cos(a + .4) * r * .5, Math.sin(a + .4) * r * .5, Math.cos(a) * r * .95, Math.sin(a) * r * .95); ctx.stroke();
          }
          ctx.fillStyle = '#ffffff70'; ctx.beginPath(); ctx.ellipse(-r * .35, -r * .45, r * .3, r * .12, -.6, 0, TAU); ctx.fill();
          ctx.restore();
          if (this.emits(3)) this.particles.spawn(o.x + (Math.random() - 0.5) * o.r, o.y - o.r * 0.6, 0, -24, 0.8, 2.5, '#9cff5e', 1);
          break;
        }
        case 'pylon': {
          contactShadow(ctx, o.x + o.r * .3, o.y + o.r * .45, o.r * 1.5, o.r * 1.1, .65);
          this.drawLight(o.x, o.y, o.r * 2.8, '#ffe38a', 0.22 + o.flash * 0.6);
          ctx.save(); ctx.translate(o.x, o.y);
          // Tesla coil: brass hex base, stacked toroids and a charged sphere.
          const hex = (rr: number) => {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + Math.PI / 6; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
            ctx.closePath();
          };
          const brass = ctx.createLinearGradient(-o.r, -o.r, o.r, o.r);
          brass.addColorStop(0, '#fff0b8'); brass.addColorStop(.3, '#b8862e'); brass.addColorStop(.7, '#4a3108'); brass.addColorStop(1, '#2a1c04');
          hex(o.r); ctx.fillStyle = brass; ctx.fill();
          ctx.strokeStyle = o.flash > 0 ? '#ffffff' : '#1a1002'; ctx.lineWidth = 1.2; ctx.stroke();
          hex(o.r * .78); ctx.fillStyle = '#1c1606'; ctx.fill();
          for (const k of [.66, .5]) {
            arc(ctx, 0, 0, o.r * k);
            const torus = ctx.createRadialGradient(-o.r * k * .3, -o.r * k * .4, 0, 0, 0, o.r * k);
            torus.addColorStop(0, '#f6f0dc'); torus.addColorStop(.6, '#7a6a48'); torus.addColorStop(1, '#241c08');
            ctx.fillStyle = torus; ctx.fill(); ctx.strokeStyle = '#000000a0'; ctx.lineWidth = 1; ctx.stroke();
          }
          ctx.globalCompositeOperation = 'lighter';
          const charge = ctx.createRadialGradient(0, 0, 0, 0, 0, o.r * .42);
          charge.addColorStop(0, '#ffffff'); charge.addColorStop(.5, o.flash > 0 ? '#ffffff' : '#fff4c4'); charge.addColorStop(1, '#ffe38a00');
          arc(ctx, 0, 0, o.r * .42); ctx.fillStyle = charge; ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          ctx.restore();
          if (this.emits(1.5)) {
            const a = Math.random() * TAU;
            this.bolts.push({ pts: jaggedify([o.x, o.y, o.x + Math.cos(a) * o.r * 1.8, o.y + Math.sin(a) * o.r * 1.8]), life: 0.08, color: '#ffe38a' });
          }
          break;
        }
        case 'booster': {
          const a = 0.18 + o.flash * 0.4;
          ctx.save(); ctx.translate(o.x, o.y);
          // Recessed launch pad: a dark well ringed in lit segments.
          const well = ctx.createRadialGradient(0, -o.r * .2, 0, 0, 0, o.r);
          well.addColorStop(0, 'rgba(255,210,122,' + (a * .6) + ')'); well.addColorStop(.75, 'rgba(20,14,4,.75)'); well.addColorStop(1, 'rgba(0,0,0,.2)');
          arc(ctx, 0, 0, o.r); ctx.fillStyle = well; ctx.fill();
          ctx.strokeStyle = '#05040280'; ctx.lineWidth = 3; arc(ctx, 0, 0, o.r); ctx.stroke();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(255,226,150,' + (0.35 + o.flash * 0.6) + ')'; ctx.lineWidth = 2;
          for (let i = 0; i < 12; i++) {
            const s0 = i * TAU / 12;
            arc(ctx, 0, 0, o.r - 1, s0 + .06, s0 + TAU / 12 - .06); ctx.stroke();
          }
          // Chevrons drift upward: the plate throws balls on.
          ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.strokeStyle = '#ffe9b0';
          for (let i = 0; i < 3; i++) {
            const k = ((time * 0.9 + i / 3) % 1);
            const y = o.r * 0.55 - k * o.r * 1.1;
            ctx.globalAlpha = Math.sin(k * Math.PI) * 0.95;
            ctx.beginPath(); ctx.moveTo(-9, y + 6); ctx.lineTo(0, y - 2); ctx.lineTo(9, y + 6); ctx.stroke();
          }
          ctx.restore();
          ctx.globalAlpha = 1;
          break;
        }
        case 'well': {
          ctx.save(); ctx.translate(o.x, o.y);
          // A gravity lens: the floor darkens and rings are dragged inward.
          const lens = ctx.createRadialGradient(0, 0, 0, 0, 0, o.r);
          lens.addColorStop(0, '#000000c0'); lens.addColorStop(.3, '#1a0a3a70'); lens.addColorStop(1, '#00000000');
          arc(ctx, 0, 0, o.r); ctx.fillStyle = lens; ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineWidth = 1.5; ctx.strokeStyle = '#c77dff';
          for (let i = 0; i < 4; i++) {
            const r = ((time * 30 + i * (o.r / 4)) % o.r) + 4;
            if (r >= o.r) continue;
            ctx.globalAlpha = (1 - r / o.r) * .6;
            arc(ctx, 0, 0, o.r - r); ctx.stroke();
          }
          ctx.restore();
          ctx.globalAlpha = 1;
          this.drawLight(o.x, o.y, 26, '#c77dff', 0.8);
          arc(ctx, o.x, o.y, 5); ctx.fillStyle = '#000'; ctx.fill();
          ctx.strokeStyle = '#e8d4ff'; ctx.lineWidth = 1; ctx.stroke();
          break;
        }
      }
    }
  }

  private drawZones(w: World): void {
    const ctx = this.ctx;
    const time = this.reducedMotion?.matches ? 0 : this.time;
    for (const z of w.zones) {
      const life = 1 - z.t / z.dur;
      if (z.kind === 'fire' || z.kind === 'toxic') {
        const fire = z.kind === 'fire';
        const color = fire ? '#ff8a43' : '#a6ff4d';
        const hot = fire ? '#ffd166' : '#eaffb0';
        const opacity = Math.min(1, life * 3) * (fire ? 1 : Math.min(1, z.t * 4));
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.translate(z.x, z.y);
        // A dark scorched or corroded floor under the effect.
        if (fire) {
          // Burning ground is irregular: overlapping soot and flame lobes, never a clean disc.
          for (let i = 0; i < 7; i++) {
            const ang = i * 2.39996 + z.x, dist = i ? z.r * .42 : 0, br = z.r * (i ? .62 : .8);
            ctx.globalAlpha = opacity * .75;
            ctx.drawImage(this.glowSprite('#000000'), Math.cos(ang) * dist - br, Math.sin(ang) * dist - br, br * 2, br * 2);
          }
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 6; i++) {
            const ang = i * 2.39996 + z.y + time * .3, dist = z.r * (.15 + (i % 3) * .2);
            const br = z.r * (.45 + .1 * Math.sin(time * 7 + i * 2));
            ctx.globalAlpha = opacity * .32;
            ctx.drawImage(this.glowSprite(i % 2 ? '#ff5a14' : '#ff9a3c'), Math.cos(ang) * dist - br, Math.sin(ang) * dist - br, br * 2, br * 2);
          }
          ctx.globalAlpha = opacity;
        } else {
          const bed = ctx.createRadialGradient(0, 0, 0, 0, 0, z.r);
          bed.addColorStop(0, '#0a1a02a0'); bed.addColorStop(.85, '#10260470'); bed.addColorStop(1, '#00000000');
          arc(ctx, 0, 0, z.r); ctx.fillStyle = bed; ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, z.r);
          pool.addColorStop(0, color + '30'); pool.addColorStop(.75, color + '16'); pool.addColorStop(.95, color + '30'); pool.addColorStop(1, color + '00');
          arc(ctx, 0, 0, z.r); ctx.fillStyle = pool; ctx.fill();
        }
        if (fire) {
          // Soft flickering wisps scattered over the pool, and a hot core.
          for (let i = 0; i < 18; i++) {
            // Each wisp rises, thins and dies, then re-ignites at its root.
            const k = (time * 1.6 + i * .377) % 1;
            const ang = i * 2.39996, dist = z.r * (.15 + ((i * .37) % .72));
            const fx = Math.cos(ang) * dist, fy = Math.sin(ang) * dist - k * z.r * .32;
            const fw = z.r * .1 * (1 - k * .5), fh = z.r * (.14 + .1 * (1 - k));
            ctx.globalAlpha = opacity * Math.sin(k * Math.PI) * .85;
            ctx.drawImage(this.glowSprite(k < .45 ? '#ffd166' : '#ff6a1a'), fx - fw, fy - fh, fw * 2, fh * 2);
          }
          ctx.globalAlpha = opacity;
          const core = ctx.createRadialGradient(0, 0, 0, 0, 0, z.r * .5);
          core.addColorStop(0, hot + '40'); core.addColorStop(1, hot + '00');
          ctx.fillStyle = core; arc(ctx, 0, 0, z.r * .5); ctx.fill();
        } else {
          // Bubbles swell and pop across the acid.
          for (let i = 0; i < 9; i++) {
            const k = (time * .7 + i * .37) % 1;
            const a = i * 2.39996, d = z.r * (.15 + (i * .29 % .7));
            const bx = Math.cos(a) * d, by = Math.sin(a) * d;
            const br = (1.5 + (i % 3)) * (.4 + k);
            ctx.globalAlpha = opacity * (1 - k) * .9;
            ctx.strokeStyle = hot; ctx.lineWidth = 1;
            arc(ctx, bx, by, br); ctx.stroke();
            ctx.fillStyle = '#ffffff80'; ctx.fillRect(bx - br * .4, by - br * .5, 1, 1);
          }
          ctx.globalAlpha = opacity;
        }
        ctx.strokeStyle = color + (fire ? '28' : '50'); ctx.lineWidth = 1;
        ctx.setLineDash([z.r * .2, z.r * .12]);
        arc(ctx, 0, 0, z.r * .97, time * .3, time * .3 + TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        if (this.emits(fire ? 16 : 10)) {
          const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * z.r;
          this.particles.spawn(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r, 0, fire ? -60 : -18,
            fire ? .45 : .7, fire ? 3.5 : 3, fire && Math.random() < .4 ? hot : color, 1);
        }
      } else if (z.kind === 'vortex') {
        ctx.save();
        ctx.translate(z.x, z.y);
        ctx.globalAlpha = .35 + .65 * life;
        const funnel = ctx.createRadialGradient(0, 0, 0, 0, 0, z.r);
        funnel.addColorStop(0, '#000000e0'); funnel.addColorStop(.25, '#0a0520c0'); funnel.addColorStop(.6, '#754df140'); funnel.addColorStop(1, '#965aff00');
        arc(ctx, 0, 0, z.r); ctx.fillStyle = funnel; ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 5; i++) {
          const a = -time * 3.4 + i * TAU / 5;
          ctx.beginPath();
          for (let step = 0; step <= 16; step++) {
            const angle = a + step * .2;
            const r = z.r * (.12 + step * .052);
            if (!step) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
            else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
          }
          ctx.strokeStyle = i % 2 ? '#c4acff90' : '#f0e6ff70'; ctx.lineWidth = i % 2 ? 2.2 : 1.2;
          ctx.stroke();
        }
        const eye = ctx.createRadialGradient(0, 0, 0, 0, 0, z.r * .25);
        eye.addColorStop(0, '#00000000'); eye.addColorStop(.7, '#b48cff40'); eye.addColorStop(1, '#b48cff00');
        ctx.fillStyle = eye; arc(ctx, 0, 0, z.r * .25); ctx.fill();
        ctx.restore();
      } else if (z.kind === 'mine') {
        const armed = z.t > 0.25;
        const pulse = this.opts.reduceFlashes || this.reducedMotion?.matches ? .5 : .5 + Math.sin(time * 10 + z.x) * .5;
        contactShadow(ctx, z.x + 2, z.y + 3, 11, 8, .6);
        ctx.save(); ctx.translate(z.x, z.y);
        // A squat proximity mine: lit casing, prongs and a blinking lamp.
        for (let i = 0; i < 6; i++) {
          ctx.save(); ctx.rotate(i * TAU / 6 + .3);
          ctx.fillStyle = '#3a2a22'; ctx.fillRect(6, -1.4, 4.5, 2.8);
          ctx.fillStyle = '#ffffff30'; ctx.fillRect(6, -1.4, 4.5, 1);
          ctx.restore();
        }
        const casing = ctx.createRadialGradient(-3, -3, 0, 0, 0, 8.5);
        casing.addColorStop(0, '#8a7060'); casing.addColorStop(.5, '#3a2a24'); casing.addColorStop(1, '#120c0a');
        arc(ctx, 0, 0, 8); ctx.fillStyle = casing; ctx.fill();
        ctx.strokeStyle = '#ffb13b'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
        arc(ctx, z.x, z.y, 2.6); ctx.fillStyle = armed ? '#fff0b2' : '#775b4a'; ctx.fill();
        if (armed) this.drawLight(z.x, z.y, 18, '#ffb13b', .35 + pulse * .55);
      } else if (z.kind === 'stasis') {
        const fade = Math.min(1, z.t * 3) * Math.min(1, life * 4);
        ctx.save();
        ctx.translate(z.x, z.y);
        // A temporal bubble: a lensed dome with a slow clock face.
        const dome = ctx.createRadialGradient(-z.r * .3, -z.r * .35, 0, 0, 0, z.r);
        dome.addColorStop(0, 'rgba(255,240,200,' + (fade * .16) + ')'); dome.addColorStop(.8, 'rgba(255,214,122,' + (fade * .06) + ')');
        dome.addColorStop(.97, 'rgba(255,226,150,' + (fade * .3) + ')'); dome.addColorStop(1, 'rgba(255,226,150,0)');
        arc(ctx, 0, 0, z.r); ctx.fillStyle = dome; ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,226,150,' + (fade * 0.6) + ')'; ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        arc(ctx, 0, 0, z.r * .92, time * .6, time * .6 + TAU); ctx.stroke();
        ctx.setLineDash([]);
        for (let i = 0; i < 12; i++) {
          const a = i * TAU / 12;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * z.r * .74, Math.sin(a) * z.r * .74);
          ctx.lineTo(Math.cos(a) * z.r * .82, Math.sin(a) * z.r * .82); ctx.stroke();
        }
        // A slow clock hand.
        const a = time * 1.2;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * z.r * 0.6, Math.sin(a) * z.r * 0.6); ctx.stroke();
        ctx.restore();
      }
    }
  }

  private drawPickups(w: World): void {
    const ctx = this.ctx;
    const time = this.reducedMotion?.matches ? 0 : this.time;
    for (const p of w.pickups) {
      // Everything collectable hovers a little above the deck.
      const bob = Math.sin(time * 4 + p.x * .37) * 1.6;
      const y = p.y + bob;
      switch (p.kind) {
        case 'xp': {
          const big = p.value > 4;
          const s = big ? 7 : 5;
          const color = big ? '#b388ff' : '#6de2ff';
          this.drawShadow(p.x, p.y + 4, s * .9, .35);
          this.drawLight(p.x, y, s * 3.2, color, .45);
          // A cut gem: lit facet, shadowed facet and a crown glint.
          ctx.save(); ctx.translate(p.x, y);
          ctx.rotate(Math.sin(time * 2 + p.x) * .25);
          ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * .7, -s * .2); ctx.lineTo(0, s); ctx.lineTo(-s * .7, -s * .2); ctx.closePath();
          ctx.fillStyle = shade(color, .45); ctx.fill();
          ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(-s * .7, -s * .2); ctx.lineTo(0, s); ctx.lineTo(0, -s * .1); ctx.closePath();
          ctx.fillStyle = color; ctx.fill();
          ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(-s * .7, -s * .2); ctx.lineTo(0, -s * .1); ctx.lineTo(s * .7, -s * .2); ctx.closePath();
          ctx.fillStyle = '#f4ffff'; ctx.globalAlpha = .85; ctx.fill(); ctx.globalAlpha = 1;
          ctx.restore();
          break;
        }
        case 'coin': {
          // A spinning gold coin: its width follows the turn.
          const turn = Math.cos(time * 5 + p.x);
          const wdt = 4.8 * Math.max(.18, Math.abs(turn));
          this.drawShadow(p.x, p.y + 4, 4, .35);
          this.drawLight(p.x, y, 13, '#ffd84a', .35);
          ctx.save(); ctx.translate(p.x, y);
          ctx.beginPath(); ctx.ellipse(.6, .6, wdt, 4.8, 0, 0, TAU); ctx.fillStyle = '#7a4a05'; ctx.fill();
          const gold = ctx.createLinearGradient(-wdt, -4.8, wdt, 4.8);
          gold.addColorStop(0, '#fff6c0'); gold.addColorStop(.4, turn > 0 ? '#ffd84a' : '#e0a820'); gold.addColorStop(1, '#a86a0a');
          ctx.beginPath(); ctx.ellipse(0, 0, wdt, 4.8, 0, 0, TAU); ctx.fillStyle = gold; ctx.fill();
          ctx.strokeStyle = '#fff3a8b0'; ctx.lineWidth = .7;
          ctx.beginPath(); ctx.ellipse(0, 0, wdt * .65, 3.1, 0, 0, TAU); ctx.stroke();
          ctx.restore();
          break;
        }
        case 'core': {
          this.drawShadow(p.x, p.y + 6, 6, .4);
          this.drawLight(p.x, y, 24, '#ff7ad9', 0.8);
          ctx.save(); ctx.translate(p.x, y); ctx.rotate(time * 1.4);
          ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, -1); ctx.lineTo(0, 8); ctx.lineTo(-6, -1); ctx.closePath();
          ctx.fillStyle = '#a02a86'; ctx.fill();
          ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-6, -1); ctx.lineTo(0, 8); ctx.lineTo(0, -1); ctx.closePath();
          ctx.fillStyle = '#ff7ad9'; ctx.fill();
          ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-6, -1); ctx.lineTo(0, -1); ctx.lineTo(6, -1); ctx.closePath();
          ctx.fillStyle = '#ffe1fa'; ctx.fill();
          ctx.restore();
          break;
        }
        case 'heal': {
          this.drawShadow(p.x, p.y + 6, 7, .4);
          this.drawLight(p.x, y, 20, '#6dff9c', .55);
          ctx.save(); ctx.translate(p.x, y);
          // A medical canister: glass shell, glowing cross.
          const shell = ctx.createRadialGradient(-2.5, -3, 0, 0, 0, 8);
          shell.addColorStop(0, '#e8fff0'); shell.addColorStop(.5, '#2a8a50'); shell.addColorStop(1, '#0a2a16');
          arc(ctx, 0, 0, 7.5); ctx.fillStyle = shell; ctx.fill();
          ctx.strokeStyle = '#03140a'; ctx.lineWidth = 1; ctx.stroke();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = '#b8ffd0';
          ctx.fillRect(-4.5, -1.5, 9, 3); ctx.fillRect(-1.5, -4.5, 3, 9);
          ctx.globalCompositeOperation = 'source-over';
          ctx.restore();
          break;
        }
        case 'relic': {
          const glow = 0.7 + 0.3 * Math.sin(time * 6);
          this.drawShadow(p.x, p.y + 7, 9, .45);
          this.drawLight(p.x, y, 30, '#ffb300', glow * .8);
          ctx.save(); ctx.translate(p.x, y);
          // A gilded reliquary with a glowing seam.
          const gold = ctx.createLinearGradient(-7, -6, 7, 6);
          gold.addColorStop(0, '#fff2b0'); gold.addColorStop(.4, '#e0a020'); gold.addColorStop(1, '#6a3a04');
          roundRect(ctx, -7.5, -5.5, 15, 11, 2); ctx.fillStyle = gold; ctx.fill();
          ctx.strokeStyle = '#3a1e02'; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = '#5a3204'; ctx.fillRect(-7.5, -1.5, 15, 1.5);
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = '#ffe9a0'; ctx.globalAlpha = glow; ctx.fillRect(-7, -1.2, 14, .9);
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#fff6d0'; ctx.fillRect(-1.5, -.5, 3, 3);
          ctx.restore();
          break;
        }
        case 'mystery': {
          const glow = 0.6 + 0.3 * Math.sin(time * 8);
          this.drawShadow(p.x, p.y + 7, 8, .4);
          this.drawLight(p.x, y, 26, '#c9b8ff', glow);
          ctx.save(); ctx.translate(p.x, y);
          const orbG = ctx.createRadialGradient(-2.5, -3, 0, 0, 0, 9);
          orbG.addColorStop(0, '#ffffff'); orbG.addColorStop(.5, '#8a6ad8'); orbG.addColorStop(1, '#1a0e3a');
          arc(ctx, 0, 0, 8.5); ctx.fillStyle = orbG; ctx.fill();
          ctx.strokeStyle = '#e8deff'; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 11px ' + FONT;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', 0, .5);
          ctx.restore();
          break;
        }
      }
    }
  }

  private drawEnemy(e: Enemy): void {
    const ctx = this.ctx;
    const d = e.def;
    const time = this.reducedMotion?.matches ? 0 : this.time;
    const spawn = easeOutBack(clamp(e.spawnT / .35, 0, 1));
    // A slow idle breath keeps the field alive; flesh heaves more than plate.
    const breath = 1 + Math.sin(time * (d.material === 'flesh' ? 3.2 : 2) + e.id * 1.3) * (d.material === 'flesh' ? .035 : .015);
    const r = e.r * spawn * (1 + e.flash * .7) * breath;
    if (r <= 0.5) return;
    const x = e.x;
    // Hovering units bob a pixel or two; the shadow stays put, which sells the height.
    const y = e.y + (e.boss ? 0 : Math.sin(time * 2.4 + e.id * 1.7) * 1.3);
    if (e.spawnT < .65) {
      // Arrivals drop in through a teleport column.
      const k = 1 - e.spawnT / .65;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k * .45;
      const arrival = ctx.createLinearGradient(x, FIELD_TOP, x, y + r);
      arrival.addColorStop(0, d.color + '00'); arrival.addColorStop(1, d.color);
      ctx.fillStyle = arrival; ctx.fillRect(x - r * .5, FIELD_TOP, r, Math.max(0, y + r - FIELD_TOP));
      ctx.globalAlpha = k;
      ctx.strokeStyle = d.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + r * .3, r * (1.6 - k * .6), r * (.5 - k * .2), 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    const phasedAlpha = e.phased ? 0.28 : 1;
    if (e.elite.length) {
      const col = ELITE_MAP[e.elite[0]]?.color ?? '#fff';
      this.drawLight(x, y, r * 2.6, col, 0.35 + 0.2 * Math.sin(this.time * 5));
      // An elite stands on a rotating sigil.
      ctx.save(); ctx.translate(x, y + r * .25); ctx.scale(1, .45); ctx.rotate(time * .8);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = col; ctx.globalAlpha = .55; ctx.lineWidth = 2;
      ctx.setLineDash([r * .5, r * .3]);
      arc(ctx, 0, 0, r * 1.45); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    if (d.ai === 'golden') this.drawLight(x, y, r * 3, '#ffd84a', 0.8);
    if (e.boss) this.drawLight(x, y, r * 2.8, e.phase ? '#ff7088' : d.color, .28);
    ctx.globalAlpha = phasedAlpha;
    if (d.ai === 'pulsar') {
      const k = e.t1 > 0 ? 1 - e.t1 / 0.45 : 0;
      ctx.strokeStyle = e.t1 > 0 ? `rgba(255,138,240,${0.7 * (1 - k)})` : 'rgba(255,138,240,0.18)';
      ctx.lineWidth = e.t1 > 0 ? 3 : 2;
      ctx.beginPath(); ctx.arc(x, y, e.t1 > 0 ? 20 + k * 110 : 130, 0, TAU); ctx.stroke();
    }
    if (d.ai === 'aegis') {
      ctx.strokeStyle = 'rgba(122,240,255,0.16)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 7]);
      ctx.beginPath(); ctx.arc(x, y, 150, this.time * 0.5, this.time * 0.5 + TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (d.ai === 'necro') this.drawLight(x, y, r * 2.4, '#b48cff', 0.3 + 0.15 * Math.sin(this.time * 3));
    if (d.ai === 'charger' && (e.t0 % 7) > 6.1) this.drawLight(x, y, r * 2.8, '#ff8a6b', 0.7);
    if (e.elite.includes('commander')) {
      ctx.strokeStyle = 'rgba(255,177,59,0.2)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 140, 0, TAU); ctx.stroke();
    }
    if (d.ai === 'warden') {
      // The slowing field: a faint dome with dashed edge.
      const field = ctx.createRadialGradient(x, y, r, x, y, 115);
      field.addColorStop(0, 'rgba(255,224,102,0.06)'); field.addColorStop(.9, 'rgba(255,224,102,0.04)'); field.addColorStop(1, 'rgba(255,224,102,0)');
      ctx.fillStyle = field; arc(ctx, x, y, 115); ctx.fill();
      ctx.strokeStyle = 'rgba(255,224,102,0.25)';
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1.5;
      arc(ctx, x, y, 115); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (d.ai === 'magnet') {
      ctx.strokeStyle = 'rgba(255,153,80,0.22)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 2; i++) {
        const rr = 150 - ((this.time * 60 + i * 60) % 120);
        arc(ctx, x, y, Math.max(r, rr)); ctx.stroke();
      }
    }
    const rot = d.shape === 'star' ? this.time * 1.5 : d.shape === 'gear' ? this.time * 0.8 : d.shape === 'spike' ? -this.time : 0;
    // Motion, estimated from frame to frame: lean into it, burn exhaust behind it, smear when fast.
    let m = this.motion.get(e.id);
    if (!m) { m = { x: e.x, y: e.y, vx: 0, vy: d.speed || 0, seen: this.time }; this.motion.set(e.id, m); }
    const dt = this.emissionDt;
    if (dt > 0) {
      const ix = e.x - m.x, iy = e.y - m.y;
      if (Math.abs(ix) + Math.abs(iy) < 60) {
        const k = Math.min(1, dt * 10);
        m.vx += (ix / dt - m.vx) * k; m.vy += (iy / dt - m.vy) * k;
      }
      m.x = e.x; m.y = e.y;
    }
    m.seen = this.time;
    const speed = Math.hypot(m.vx, m.vy);
    const machine = d.material !== 'flesh' && !e.boss && d.ai !== 'egg';
    const detail = this.hq && !this.dense;
    if (detail && !e.boss && !e.phased && speed > 90 && !this.reducedMotion?.matches) {
      for (let i = 3; i >= 1; i--) {
        ctx.globalAlpha = .16 / i * Math.min(1, (speed - 90) / 120);
        drawEnemyShell(ctx, d, x - m.vx * .018 * i, y - m.vy * .018 * i, r, rot);
      }
      ctx.globalAlpha = phasedAlpha;
    }
    const lean = e.boss || this.reducedMotion?.matches ? 0 : clamp(m.vx / 900, -.12, .12);
    if (lean) { ctx.save(); ctx.translate(x, y); ctx.rotate(lean); ctx.translate(-x, -y); }
    drawEnemyShell(ctx, d, x, y, r, rot);
    const blink = !e.boss && (this.time + e.id * .73) % 4.7 > 4.55;
    drawEnemyInsignia(ctx, d, x, y, r, blink);
    if (!blink && !e.phased && this.hq) this.drawPupils(e, x, y, r);
    if (detail) this.drawSheen(e, x, y, r, rot, time);
    if (detail && machine && r > 7 && !e.phased) {
      // Running lights on the hull blink in a per-unit rhythm.
      for (let k = 0; k < 2; k++) {
        const on = ((time * 1.7 + e.id * .41 + k * .5) % 1) < .32;
        if (!on) continue;
        const a = rot + (k ? -Math.PI * .2 : Math.PI * 1.2);
        this.queueLight(x + Math.cos(a) * r * .9, y + Math.sin(a) * r * .9, r * .3, k ? '#ff7a7a' : '#9dffc4', .95);
      }
    }
    if (lean) ctx.restore();
    const frozen = e.st.frozenT > 0;
    if (frozen || e.flash > .02 || e.st.chill > 0 || e.st.burnT > 0 || e.st.poison > 0) {
      enemyShape(ctx, d.shape, x, y, r, rot);
    }
    if (e.flash > .02) {
      // Hit flash: an additive white-out of the silhouette.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = phasedAlpha * Math.min(1, e.flash * 4) * (this.opts.reduceFlashes ? .35 : .85);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }
    if (e.st.chill > 0 && !frozen) {
      ctx.globalAlpha = 0.28 * e.st.chill * phasedAlpha;
      ctx.fillStyle = '#9fdcff';
      ctx.fill();
      ctx.globalAlpha = phasedAlpha;
    }
    if (frozen) {
      // Encased in ice: a frosted shell, refracted cracks and a cold rim.
      ctx.save(); ctx.clip();
      const ice = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      ice.addColorStop(0, '#f2fdffd0'); ice.addColorStop(.35, '#9fdcff70'); ice.addColorStop(1, '#2a7ab070');
      ctx.fillStyle = ice; ctx.fillRect(x - r * 1.3, y - r * 1.3, r * 2.6, r * 2.6);
      ctx.strokeStyle = '#ffffffc0'; ctx.lineWidth = 1.25;
      ctx.beginPath(); ctx.moveTo(x - r, y - r * .13);
      ctx.lineTo(x - r * .19, y - r * .28); ctx.lineTo(x + r * .13, y + r * .29);
      ctx.lineTo(x + r, y + r * .15); ctx.moveTo(x - r * .19, y - r * .28);
      ctx.lineTo(x + r * .19, y - r); ctx.moveTo(x + r * .13, y + r * .29);
      ctx.lineTo(x - r * .38, y + r); ctx.stroke();
      ctx.fillStyle = '#ffffffa0';
      ctx.beginPath(); ctx.ellipse(x - r * .4, y - r * .5, r * .35, r * .12, -.6, 0, TAU); ctx.fill();
      ctx.restore();
      enemyShape(ctx, d.shape, x, y, r, rot);
      ctx.strokeStyle = '#e8f8ff'; ctx.lineWidth = 2.5; ctx.stroke();
      this.drawLight(x, y, r * 1.8, '#9fdcff', .3);
    }
    if (e.st.burnT > 0) {
      // Flames lick up the body from below.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      enemyShape(ctx, d.shape, x, y, r, rot);
      ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 2; ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const fx = x + (i - 2) * r * .38;
        const h = r * (.7 + .35 * Math.sin(time * 12 + i * 1.9 + e.id));
        const base = y + r * .4;
        const flame = ctx.createLinearGradient(fx, base, fx, base - h * 1.6);
        flame.addColorStop(0, '#ff5a1a00'); flame.addColorStop(.25, '#ff6a1a80'); flame.addColorStop(.6, '#ffd16670'); flame.addColorStop(1, '#fff6d000');
        ctx.fillStyle = flame;
        ctx.beginPath(); ctx.moveTo(fx - r * .22, base); ctx.quadraticCurveTo(fx - r * .2, base - h * .8, fx, base - h * 1.6);
        ctx.quadraticCurveTo(fx + r * .2, base - h * .8, fx + r * .22, base); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      if (this.emits(18)) this.particles.spawn(x + (Math.random() - 0.5) * r, y - r * 0.5, 0, -70, 0.35, 3, Math.random() < 0.5 ? '#ff8a3d' : '#ffd166', 1);
    }
    if (e.st.bleed > 0 && this.emits(4.8 * e.st.bleed)) this.particles.spawn(x, y + r * 0.5, 0, 40, 0.4, 2.5, '#ff2a55', 1, 200);
    if (e.st.poison > 0) {
      enemyShape(ctx, d.shape, x, y, r, rot);
      ctx.globalAlpha = Math.min(0.45, 0.12 + e.st.poison * 0.025) * phasedAlpha;
      ctx.fillStyle = '#7dff3a';
      ctx.fill();
      ctx.globalAlpha = phasedAlpha;
      ctx.strokeStyle = '#a6ff4d'; ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
      // Toxic bubbles rise off the body.
      ctx.strokeStyle = '#d4ff9a';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const k = (time * .9 + i / 3 + e.id * .17) % 1;
        ctx.globalAlpha = (1 - k) * phasedAlpha;
        arc(ctx, x + (i - 1) * r * .45, y - r * .2 - k * r * 1.1, 1.5 + k * 2); ctx.stroke();
      }
      ctx.globalAlpha = phasedAlpha;
      if (this.emits(1.4 * Math.min(e.st.poison, 8))) this.particles.spawn(x + (Math.random() - 0.5) * r, y - r * 0.2, 0, -30, 0.6, 2.5, '#a6ff4d', 1);
    }
    if (e.st.stunT > 0) {
      for (let i = 0; i < 3; i++) {
        const a = this.time * 5 + i * TAU / 3;
        const sx = x + Math.cos(a) * r * 0.8, sy = y - r - 6 + Math.sin(a) * 3;
        this.drawLight(sx, sy, 6, '#fff6a0', .9);
        star(ctx, sx, sy, 3, '#fff6a0');
      }
    }
    if (d.immune?.length && !e.boss) {
      // A thin ring in the colour of the element it ignores.
      const col = { fire: '#ff7a2f', ice: '#9fdcff', lightning: '#ffe14a', poison: '#8dff5a' }[d.immune[0]];
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7 * phasedAlpha;
      ctx.setLineDash([4, 3]);
      arc(ctx, x, y, r + 4, time, time + TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = phasedAlpha;
    }
    if (d.ai === 'egg') {
      ctx.strokeStyle = '#1d2a0c'; ctx.lineWidth = 1.5;
      const k = Math.min(1, e.t0 / 4);
      ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 0.2);
      ctx.lineTo(x - r * 0.1, y + r * 0.1 * k); ctx.lineTo(x + r * 0.2 * k, y - r * 0.3 * k); ctx.lineTo(x + r * 0.5 * k, y); ctx.stroke();
      // The embryo glows brighter as it nears hatching.
      this.drawLight(x, y, r * 1.2, d.color, .08 + k * .2);
    }
    if (d.ai === 'shielder' && e.phase < 3) {
      // A curved energy shield below the body; it dims with each crack.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const strength = 1 - e.phase / 3;
      ctx.strokeStyle = 'rgba(191,240,255,' + (.25 * strength) + ')'; ctx.lineWidth = 9;
      arc(ctx, x, y, r + 6, Math.PI / 2 - 1.05, Math.PI / 2 + 1.05); ctx.stroke();
      ctx.strokeStyle = '#bff0ff'; ctx.lineWidth = 4 - e.phase;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    if (e.shieldHp > 0) {
      // Hex bubble shield.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const bubble = ctx.createRadialGradient(x, y, r, x, y, r + 8);
      bubble.addColorStop(0, '#5ad7ff00'); bubble.addColorStop(.8, '#5ad7ff30'); bubble.addColorStop(1, '#5ad7ff90');
      ctx.fillStyle = bubble; arc(ctx, x, y, r + 8); ctx.fill();
      ctx.strokeStyle = 'rgba(160,235,255,0.9)'; ctx.lineWidth = 1.5;
      arc(ctx, x, y, r + 7.5); ctx.stroke();
      ctx.fillStyle = '#ffffff60';
      ctx.beginPath(); ctx.ellipse(x - r * .45, y - r * .7, r * .35, r * .1, -.6, 0, TAU); ctx.fill();
      ctx.restore();
    }
    if (e.elite.length) {
      // A crown floating above elites.
      const col = ELITE_MAP[e.elite[0]]?.color ?? '#fff';
      const cy = y - r - 10 + Math.sin(time * 3 + e.id) * 1.2;
      this.drawLight(x, cy, 12, col, .6);
      ctx.beginPath();
      ctx.moveTo(x - 7, cy + 4); ctx.lineTo(x - 7, cy - 3); ctx.lineTo(x - 3.5, cy + 1);
      ctx.lineTo(x, cy - 4); ctx.lineTo(x + 3.5, cy + 1); ctx.lineTo(x + 7, cy - 3); ctx.lineTo(x + 7, cy + 4);
      ctx.closePath();
      const crown = ctx.createLinearGradient(x, cy - 4, x, cy + 4);
      crown.addColorStop(0, '#ffffff'); crown.addColorStop(.4, col); crown.addColorStop(1, shade(col, .5));
      ctx.fillStyle = crown; ctx.fill();
      ctx.strokeStyle = '#02050a'; ctx.lineWidth = 1; ctx.stroke();
    }
    if (e.boss) this.drawBossBody(e, r);
    ctx.globalAlpha = 1;
    // Health: a slim bar with a lagging ghost so damage reads as it drains.
    const frac = clamp(e.hp / e.maxHp, 0, 1);
    if (!e.boss && (e.hp < e.maxHp || e.elite.length)) {
      let ghost = this.hpGhost.get(e.id);
      if (!ghost) { ghost = { v: frac, seen: 0 }; this.hpGhost.set(e.id, ghost); }
      ghost.seen = this.time;
      if (ghost.v < frac) ghost.v = frac;
      else ghost.v = Math.max(frac, ghost.v - this.emissionDt * .9);
      const bw = Math.max(22, e.r * 2);
      const bx = x - bw / 2, by = y + e.r + 6;
      ctx.fillStyle = 'rgba(2,4,10,0.85)';
      roundRect(ctx, bx - 1, by - 1, bw + 2, 5, 2.5); ctx.fill();
      ctx.fillStyle = '#fff3d0';
      roundRect(ctx, bx, by, bw * ghost.v, 3, 1.5); ctx.fill();
      const hp = ctx.createLinearGradient(0, by, 0, by + 3);
      const hc = e.elite.length ? '#ff7ad9' : '#ff5d73';
      hp.addColorStop(0, shade(hc, .35, '#ffffff')); hp.addColorStop(1, shade(hc, .25));
      ctx.fillStyle = hp;
      roundRect(ctx, bx, by, bw * frac, 3, 1.5); ctx.fill();
    }
    if (this.motion.size > 400) {
      for (const [id, m] of this.motion) if (this.time - m.seen > 2) this.motion.delete(id);
    }
    if (this.hpGhost.size > 400) {
      for (const [id, g] of this.hpGhost) if (this.time - g.seen > 2) this.hpGhost.delete(id);
    }
  }

  private drawEnemyGroundShadow(e: Enemy): void {
    const d = e.def;
    const r = e.r * easeOutBack(clamp(e.spawnT / .35, 0, 1));
    if (r <= .5) return;
    const rot = d.shape === 'star' ? this.time * 1.5 : d.shape === 'gear' ? this.time * 0.8 : d.shape === 'spike' ? -this.time : 0;
    const lift = e.boss ? r * .28 + 8 : r * .42 + 4;
    drawEnemyShadow(this.ctx, d, e.x, e.y, r * (e.boss ? 1.02 : .98), rot, lift, e.boss ? .62 : .55);
    // Machines burn a small exhaust behind their motion, under the hull.
    if (this.hq && !this.dense && d.material !== 'flesh' && !e.boss && d.ai !== 'egg' && e.spawnT > .2) {
      const m = this.motion.get(e.id);
      const speed = m ? Math.hypot(m.vx, m.vy) : 0;
      const nx = m && speed > 8 ? m.vx / speed : 0, ny = m && speed > 8 ? m.vy / speed : 1;
      const flick = .75 + .25 * Math.sin(this.time * 31 + e.id * 5);
      const ex = e.x - nx * r * .95, ey = e.y - ny * r * .95;
      this.queueLight(ex, ey, r * .85 * flick, d.color, .45);
      this.queueLight(ex, ey, r * .3, '#ffffff', .5 * flick);
    }
  }

  /** Lit pupils inside the visor slits, turned toward the ball in play. */
  private drawPupils(e: Enemy, x: number, y: number, r: number): void {
    const eye = eyeAnchor(e.def);
    if (!eye || r < 6) return;
    const [tx, ty] = this.gaze;
    const dx = tx - x, dy = ty - y;
    const len = Math.hypot(dx, dy) || 1;
    const look = .05 * r;
    const ox = dx / len * look, oy = dy / len * look * .6;
    for (const side of [-1, 1]) {
      const px = x + (eye.x + side * eye.spread) * r + ox;
      const py = y + eye.y * r + oy;
      this.queueLight(px, py, r * .2, e.def.color, .55);
      if (!this.dense) this.queueLight(px, py, Math.max(1.6, r * .1), '#ffffff', .95);
    }
  }

  /**
   * Every few seconds a band of light glides across the armor, clipped to the silhouette.
   * Staggered by id, so only a handful of enemies pay for the clip in any frame.
   */
  private drawSheen(e: Enemy, x: number, y: number, r: number, rot: number, time: number): void {
    if (this.reducedMotion?.matches || r < 7) return;
    const period = e.boss ? 2.6 : 3.8;
    const k = ((time + e.id * 1.37) % period) / .55;
    if (k >= 1) return;
    const ctx = this.ctx;
    ctx.save();
    enemyShape(ctx, e.def.shape, x, y, r, rot);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    const c = -1.6 + k * 3.2;
    const band = ctx.createLinearGradient(x + (c - .45) * r, y + (c - .45) * r * .6, x + (c + .45) * r, y + (c + .45) * r * .6);
    band.addColorStop(0, '#ffffff00'); band.addColorStop(.5, e.def.material === 'crystal' ? '#ffffff90' : '#ffffff55'); band.addColorStop(1, '#ffffff00');
    ctx.fillStyle = band;
    ctx.fillRect(x - r * 1.3, y - r * 1.3, r * 2.6, r * 2.6);
    ctx.restore();
  }

  private drawBossBody(e: Enemy, r: number): void {
    const ctx = this.ctx;
    const halo = e.phase ? '#ff7088' : e.def.color;
    ctx.save();
    ctx.translate(e.x, e.y);
    const time = this.reducedMotion?.matches ? 0 : this.time;
    // Armored orbit plates with emissive inlays.
    for (let i = 0; i < 3; i++) {
      const a = -time * .35 + i * TAU / 3;
      ctx.strokeStyle = '#02040a'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(0, 0, r + 10, a, a + 1.25); ctx.stroke();
      ctx.strokeStyle = shade(halo, .55); ctx.lineWidth = 5.5; ctx.stroke();
      ctx.strokeStyle = shade(halo, .3, '#ffffff'); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, r + 8, a + .03, a + 1.22); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = halo; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r + 10.5, a + .1, a + 1.15); ctx.stroke();
      ctx.strokeStyle = halo + '60'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, r + 16, a + .15, a + 1.1); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    if (e.def.id === 'boss_chronarch') {
      // Clock hands: the long hand sweeps toward the next time stop.
      const k = 1 - Math.max(0, Math.min(1, e.t0 / (e.phase ? 7.5 : 10)));
      ctx.strokeStyle = '#ffe9ae'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(-Math.PI / 2 + k * TAU) * e.r * 0.8, e.y + Math.sin(-Math.PI / 2 + k * TAU) * e.r * 0.8); ctx.stroke();
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(this.time * 0.3) * e.r * 0.45, e.y + Math.sin(this.time * 0.3) * e.r * 0.45); ctx.stroke();
      ctx.lineCap = 'butt';
    }
    if (e.def.id === 'boss_broodmother') {
      ctx.fillStyle = '#c4ff7a55';
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6 + this.time * 0.3;
        ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * e.r * 0.62, e.y + Math.sin(a) * e.r * 0.62 + 6, e.r * 0.13, 0, TAU); ctx.fill();
      }
    }
    if (e.def.id === 'boss_magnetar') {
      ctx.strokeStyle = e.t1 > 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,153,80,0.3)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const rr = e.t1 > 0 ? 320 * (1 - e.t1 / 0.8) : 320 - ((this.time * 90 + i * 100) % 300);
        ctx.beginPath();
        ctx.arc(e.x, e.y, Math.max(e.r, rr), 0, TAU);
        ctx.stroke();
      }
    }
    if (e.def.id === 'boss_colossus') {
      // Stone plates, and a gauge of the damage budget: when it runs dry, extra hits barely land.
      ctx.strokeStyle = '#5a3f26'; ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const a = i * TAU / 4 + Math.PI / 4;
        ctx.beginPath(); ctx.moveTo(e.x + Math.cos(a) * e.r * 0.35, e.y + Math.sin(a) * e.r * 0.35);
        ctx.lineTo(e.x + Math.cos(a + 0.25) * e.r * 0.85, e.y + Math.sin(a + 0.25) * e.r * 0.85); ctx.stroke();
      }
      const k = Math.max(0, Math.min(1, e.t3 / (e.maxHp * COLOSSUS_CAP)));
      ctx.strokeStyle = k > 0.15 ? '#ffd9a8' : '#ff5d3b'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 16, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
      ctx.lineCap = 'butt';
    }
    if (e.def.id === 'boss_sol' || e.def.id === 'boss_luna') {
      const sol = e.def.id === 'boss_sol';
      ctx.strokeStyle = sol ? '#ffd27a99' : '#d8f1ff99'; ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8 + this.time * (sol ? 0.6 : -0.4);
        ctx.beginPath(); ctx.moveTo(e.x + Math.cos(a) * (e.r + 4), e.y + Math.sin(a) * (e.r + 4));
        ctx.lineTo(e.x + Math.cos(a) * (e.r + 14), e.y + Math.sin(a) * (e.r + 14)); ctx.stroke();
      }
      if (e.t1 > 0) {
        // The partner is rising: a closing ring counts down the revive.
        ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 20, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, e.t1 / TWIN_REVIVE)); ctx.stroke();
        ctx.lineCap = 'butt';
      }
    }
    if (e.def.id === 'boss_overmind') {
      ctx.globalAlpha = 0.25 + 0.6 * Math.min(1, e.t3 / OVERMIND_WARD_MAX);
      ctx.strokeStyle = '#ff9be6'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 12 + Math.sin(this.time * 4) * 2, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (e.def.id === 'boss_sovereign') {
      ctx.strokeStyle = '#c9a2ff66'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const rr = 280 - ((this.time * 70 + i * 93) % 230);
        ctx.beginPath(); ctx.arc(e.x, e.y, Math.max(e.r, rr), 0, TAU); ctx.stroke();
      }
      if (e.t3 > 0) {
        ctx.strokeStyle = '#e0ccff'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 9, 0, TAU); ctx.stroke();
      }
    }
  }

  private drawBossExtras(w: World): void {
    const ctx = this.ctx;
    for (const e of w.enemies) {
      if (!e.alive || (e.def.id !== 'boss_overmind' && e.def.id !== 'boss_sovereign')) continue;
      // Tethers: the minds feeding the Overmind's ward, the shards sealing the Sovereign.
      const sov = e.def.id === 'boss_sovereign';
      ctx.strokeStyle = sov ? 'rgba(201,162,255,0.55)' : 'rgba(255,107,214,0.22)';
      ctx.lineWidth = sov ? 2 : 1;
      ctx.setLineDash(sov ? [6, 4] : [3, 5]);
      let n = 0;
      for (const o of w.enemies) {
        if (!o.alive || o.boss) continue;
        if (sov ? o.def.id !== 'void_shard' : o.def.ai === 'golden' || o.def.ai === 'pylon') continue;
        if (++n > 16) break;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(o.x, o.y); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    for (const e of w.enemies) {
      if (!e.alive || e.def.id !== 'boss_architect') continue;
      // Tethers to the ward pylons that shield it.
      for (const p of w.enemies) {
        if (!p.alive || p.def.id !== 'ward_pylon') continue;
        ctx.strokeStyle = 'rgba(154,216,255,0.45)'; ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (e.t3 > 0) {
        ctx.strokeStyle = 'rgba(154,216,255,0.6)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 8, 0, TAU); ctx.stroke();
      }
      if (e.t1 > 0) {
        const y = e.y + ARCHITECT_WALL.below;
        const half = ARCHITECT_WALL.half * (e.phase ? 1.35 : 1);
        const tilt = e.phase ? Math.sin(w.time * 1.4) * 22 : 0;
        ctx.globalAlpha = Math.min(1, e.t1 * 2);
        drawRail(ctx, e.x - half, y - tilt, e.x + half, y + tilt, '#7aa8ff', 1);
        ctx.globalAlpha = 1;
      }
    }
    for (const e of w.enemies) {
      if (!e.alive || e.def.id !== 'boss_fortress') continue;
      const n = e.phase ? 4 : 3;
      const R = e.r + FORTRESS_RING;
      const color = e.phase ? '#ff8aa0' : '#bcd0ff';
      ctx.lineCap = 'round';
      for (let k = 0; k < n; k++) {
        const a = e.t0 + (k * TAU) / n;
        arc(ctx, e.x, e.y, R, a - FORTRESS_HALF_ARC, a + FORTRESS_HALF_ARC);
        ctx.strokeStyle = color + '55'; ctx.lineWidth = 14; ctx.stroke();
        ctx.strokeStyle = '#101929'; ctx.lineWidth = 10; ctx.stroke();
        ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.stroke();
        ctx.strokeStyle = '#f4f8ff'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
  }

  private drawProjectiles(w: World): void {
    const ctx = this.ctx;
    for (const p of w.projectiles) {
      const speed = Math.hypot(p.vx, p.vy) || 1;
      const ux = p.vx / speed, uy = p.vy / speed;
      this.drawShadow(p.x + 3, p.y + p.r * 1.4, p.r * .9, .35);
      // A comet of hostile plasma: a long tapering wake behind a hot nucleus.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const tail = p.r * 5;
      const x = p.x - ux * tail, y = p.y - uy * tail;
      const wake = ctx.createLinearGradient(x, y, p.x, p.y);
      wake.addColorStop(0, p.color + '00'); wake.addColorStop(1, p.color + 'c0');
      ctx.fillStyle = wake;
      ctx.beginPath();
      ctx.moveTo(p.x - uy * p.r * .9, p.y + ux * p.r * .9);
      ctx.lineTo(x, y);
      ctx.lineTo(p.x + uy * p.r * .9, p.y - ux * p.r * .9);
      ctx.closePath(); ctx.fill();
      this.drawGlow(p.x, p.y, p.r * 3.4, p.color, .85);
      const core = ctx.createRadialGradient(p.x - p.r * .2, p.y - p.r * .2, 0, p.x, p.y, p.r);
      core.addColorStop(0, '#ffffff'); core.addColorStop(.45, shade(p.color, .4, '#ffffff')); core.addColorStop(1, p.color);
      arc(ctx, p.x, p.y, p.r * .85); ctx.fillStyle = core; ctx.fill();
      ctx.restore();
      ctx.strokeStyle = shade(p.color, .5);
      ctx.lineWidth = 1.5;
      arc(ctx, p.x, p.y, p.r); ctx.stroke();
      // A warning ring pulses while it falls toward the line.
      const k = (this.time * 3 + p.x * .01) % 1;
      ctx.globalAlpha = (1 - k) * .6;
      ctx.strokeStyle = p.color; ctx.lineWidth = 1;
      arc(ctx, p.x, p.y, p.r * (1.2 + k * 1.2)); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** An anamorphic lens streak: the horizontal flare a camera lens throws off a hot light. */
  private flare(x: number, y: number, len: number, color: string, a: number): void {
    if (a <= .01 || len < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const wide = ctx.createLinearGradient(x - len, 0, x + len, 0);
    wide.addColorStop(0, color + '00'); wide.addColorStop(.5, color + hex2(a * .55)); wide.addColorStop(1, color + '00');
    ctx.fillStyle = wide; ctx.fillRect(x - len, y - 1.6, len * 2, 3.2);
    const core = ctx.createLinearGradient(x - len * .55, 0, x + len * .55, 0);
    core.addColorStop(0, '#ffffff00'); core.addColorStop(.5, '#ffffff' + hex2(a)); core.addColorStop(1, '#ffffff00');
    ctx.fillStyle = core; ctx.fillRect(x - len * .55, y - .55, len * 1.1, 1.1);
    const up = ctx.createLinearGradient(0, y - len * .22, 0, y + len * .22);
    up.addColorStop(0, '#ffffff00'); up.addColorStop(.5, '#ffffff' + hex2(a * .6)); up.addColorStop(1, '#ffffff00');
    ctx.fillStyle = up; ctx.fillRect(x - .5, y - len * .22, 1, len * .44);
    ctx.restore();
  }

  /**
   * Blast shockwaves bend the light behind them: the frame under a thin annulus is redrawn
   * slightly magnified about the blast, like heat refraction.
   */
  private drawRefraction(): void {
    if (this.reducedMotion?.matches || this.opts.reduceFlashes || !this.canvas.width || !this.post.enabled) return;
    const ctx = this.ctx;
    let n = 0;
    for (const b of this.booms) {
      if (b.r < 30 || n >= 2) continue;
      const t = 1 - b.life / .42;
      if (t <= .02 || t >= .9) continue;
      n++;
      const front = b.r * (.5 + .75 * (1 - (1 - Math.min(1, t * 1.15)) ** 3));
      const band = 7 + b.r * .1;
      const strength = (1 - t) * .06;
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, front + band, 0, TAU);
      ctx.arc(b.x, b.y, Math.max(0, front - band), 0, TAU, true);
      ctx.clip();
      ctx.translate(b.x, b.y); ctx.scale(1 + strength, 1 + strength); ctx.translate(-b.x, -b.y);
      ctx.drawImage(this.canvas, 0, 0, this.canvas.width, this.canvas.height, -this.shakeAt[0], -this.shakeAt[1], W, H);
      ctx.restore();
    }
  }

  private drawEffects(): void {
    const ctx = this.ctx;
    for (const d of this.debris) {
      // Lit shell fragments tumbling away.
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.spin); ctx.globalAlpha = Math.min(1, d.life / .45);
      ctx.beginPath(); ctx.moveTo(-d.r, -d.r * .4); ctx.lineTo(d.r * .8, -d.r);
      ctx.lineTo(d.r * .4, d.r); ctx.closePath();
      const lit = ctx.createLinearGradient(-d.r, -d.r, d.r, d.r);
      lit.addColorStop(0, shade(d.color, .3, '#ffffff')); lit.addColorStop(.5, d.color); lit.addColorStop(1, shade(d.color, .75));
      ctx.fillStyle = lit; ctx.fill();
      ctx.strokeStyle = '#02050a'; ctx.lineWidth = .8; ctx.stroke();
      ctx.restore();
    }
    for (const s of this.starfalls) {
      const progress = 1 - s.life / .85;
      const intensity = this.opts.reduceFlashes ? .55 : 1;
      for (let i = 0; i < s.pts.length; i += 2) {
        const x = s.pts[i], y = s.pts[i + 1];
        ctx.save();
        ctx.beginPath(); ctx.rect(0, FIELD_TOP, W, H - FIELD_TOP); ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        const falloff = 1 - progress;
        const cut = this.reducedMotion?.matches ? 0 : progress * .75;
        const topX = x - 75 * (1 - cut), topY = FIELD_TOP + (y - FIELD_TOP) * cut;
        const width = 12 * falloff;
        const beam = ctx.createLinearGradient(topX, topY, x, y);
        beam.addColorStop(0, '#bca7ff00'); beam.addColorStop(.36, '#a48bff4d'); beam.addColorStop(1, '#e7cfffaa');
        ctx.globalAlpha = falloff * intensity;
        ctx.fillStyle = beam;
        ctx.beginPath(); ctx.moveTo(topX - width, topY); ctx.lineTo(topX + width, topY);
        ctx.lineTo(x + width * .45, y); ctx.lineTo(x - width * .45, y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#f3eaff'; ctx.lineWidth = Math.max(.65, falloff * 3.5);
        ctx.beginPath(); ctx.moveTo(topX, topY); ctx.lineTo(x, y); ctx.stroke();
        const radius = 13 + 59 * (1 - falloff ** 2);
        ctx.strokeStyle = '#c9b9ff'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.ellipse(x, y, radius, radius * .42, -.2, 0, TAU); ctx.stroke();
        ctx.globalAlpha = falloff * falloff * intensity;
        ctx.strokeStyle = '#f8e8ff'; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.ellipse(x, y, radius * .68, radius * .27, .2, 0, TAU); ctx.stroke();
        this.drawGlow(x, y, 34, '#ceb4ff', falloff ** 3 * intensity);
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    const flashScale = this.opts.reduceFlashes ? .35 : 1;
    for (const hit of this.impacts) {
      const age = 1 - hit.life / .18;
      const reach = hit.reach * (.4 + age * .8);
      // A star-shaped impact flare with a white-hot center.
      this.drawGlow(hit.x, hit.y, reach * 1.1, hit.color, (1 - age) * .6 * flashScale);
      ctx.save(); ctx.translate(hit.x, hit.y); ctx.rotate(hit.angle);
      ctx.globalAlpha = (1 - age) ** 2 * .9 * flashScale;
      ctx.fillStyle = hit.color;
      for (let i = 0; i < hit.rays; i++) {
        ctx.rotate(TAU / hit.rays);
        ctx.beginPath(); ctx.moveTo(2, -1.8); ctx.lineTo(reach * (i % 2 ? .63 : 1), 0);
        ctx.lineTo(2, 1.8); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < hit.rays; i++) {
        ctx.rotate(TAU / hit.rays);
        ctx.beginPath(); ctx.moveTo(1.5, -.6); ctx.lineTo(reach * (i % 2 ? .4 : .65), 0);
        ctx.lineTo(1.5, .6); ctx.closePath(); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, 0, 3.2 * (1 - age), 0, TAU); ctx.fill(); ctx.restore();
    }
    for (const b of this.booms) {
      const t = 1 - b.life / 0.42;
      if (t < 0) continue;
      const r = b.r * (0.35 + 0.65 * Math.sqrt(Math.min(1, t * 1.3)));
      const fade = Math.max(0, 1 - t);
      // Fireball: a white core blooming through the blast color into dark edges.
      const ball = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      ball.addColorStop(0, `rgba(255,255,255,${fade * fade})`);
      ball.addColorStop(.25, shade(b.color, .35, '#ffffff') + hex2(fade * .9));
      ball.addColorStop(.6, b.color + hex2(fade * .55));
      ball.addColorStop(1, b.color + '00');
      ctx.globalAlpha = flashScale;
      ctx.fillStyle = ball;
      arc(ctx, b.x, b.y, r); ctx.fill();
      // Shockwave front, racing ahead of the fire.
      const front = b.r * (.5 + .75 * (1 - (1 - Math.min(1, t * 1.15)) ** 3));
      ctx.globalAlpha = fade * flashScale;
      ctx.strokeStyle = b.color; ctx.lineWidth = 5 * fade + .5;
      arc(ctx, b.x, b.y, front); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5 * fade;
      arc(ctx, b.x, b.y, front); ctx.stroke();
      ctx.globalAlpha = fade * .6 * flashScale;
      ctx.strokeStyle = '#ffefd5'; ctx.lineWidth = 1.2;
      const outer = front * 1.08;
      for (let i = 0; i < 10; i++) {
        const a = i * TAU / 10 + b.x + t * .35;
        arc(ctx, b.x, b.y, outer, a, a + .18); ctx.stroke();
      }
    }
    for (const b of this.booms) {
      const t = 1 - b.life / .42;
      if (t >= 0) this.flare(b.x, b.y, b.r * 1.8 * (1 - t * .5), b.color, (1 - t) ** 2 * .9 * flashScale);
    }
    for (const hit of this.impacts) {
      if (hit.rays >= 8) this.flare(hit.x, hit.y, hit.reach * 2.2, hit.color, hit.life / .18 * .8 * flashScale);
    }
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      const rad = r.r * (0.3 + 0.7 * (1 - (1 - t) ** 3));
      ctx.globalAlpha = (1 - t) ** 1.5;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 4 * (1 - t) + .5;
      arc(ctx, r.x, r.y, rad); ctx.stroke();
      ctx.globalAlpha *= .8;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2 * (1 - t);
      arc(ctx, r.x, r.y, rad); ctx.stroke();
    }
    for (const b of this.bolts) {
      const a = b.life / 0.18;
      ctx.beginPath();
      for (let i = 0; i < b.pts.length; i += 2) {
        if (i === 0) ctx.moveTo(b.pts[i], b.pts[i + 1]);
        else ctx.lineTo(b.pts[i], b.pts[i + 1]);
      }
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // Wide corona, colored channel and a white-hot filament.
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = a * .18; ctx.lineWidth = 12; ctx.stroke();
      ctx.globalAlpha = a * .45; ctx.lineWidth = 5; ctx.stroke();
      ctx.globalAlpha = a; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.1; ctx.stroke();
      // Forks spit off the main channel.
      ctx.strokeStyle = b.color; ctx.lineWidth = 1; ctx.globalAlpha = a * .7;
      for (let i = 2; i < b.pts.length - 2; i += 4) {
        const x = b.pts[i], y = b.pts[i + 1];
        const ang = (i * 2.39996 + b.pts[0]) % TAU;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(ang) * 9, y + Math.sin(ang) * 9);
        ctx.lineTo(x + Math.cos(ang + .5) * 15, y + Math.sin(ang + .5) * 15);
        ctx.stroke();
      }
      for (let i = 0; i < b.pts.length; i += Math.max(2, b.pts.length - 2)) this.drawGlow(b.pts[i], b.pts[i + 1], 16, b.color, a * .8);
    }
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    for (const b of this.beams) {
      const a = b.life / 0.16;
      ctx.strokeStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(b.x0, b.y0);
      ctx.lineTo(b.x1, b.y1);
      ctx.globalAlpha = a * .2; ctx.lineWidth = 14; ctx.stroke();
      ctx.globalAlpha = a * .5; ctx.lineWidth = 6; ctx.stroke();
      ctx.globalAlpha = a; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
      this.drawGlow(b.x1, b.y1, 20, b.color, a);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawAim(w: World): void {
    if (!w.aim.active || w.hand <= 0 || w.state !== 'playing') return;
    const ctx = this.ctx;
    const res = traceAim(w, 520 + this.opts.previewBounces * 260, this.opts.previewBounces, this.trace);
    const pts = this.trace;
    const powered = w.isPowerWindow();
    const color = powered ? '#ffe3a3' : '#d9faff';
    ctx.save();
    ctx.beginPath();
    let broken = true;
    for (let i = 0; i < pts.length; i += 2) {
      if (!Number.isFinite(pts[i]) || !Number.isFinite(pts[i + 1])) { broken = true; continue; }
      if (broken) ctx.moveTo(pts[i], pts[i + 1]); else ctx.lineTo(pts[i], pts[i + 1]);
      broken = false;
    }
    // A projected laser guide: a soft beam under a bright dotted track.
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = powered ? '#e7b96930' : '#8edafa1c';
    ctx.lineWidth = powered ? 9 : 7; ctx.stroke();
    ctx.strokeStyle = powered ? '#ffe3a350' : '#8edafa38';
    ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = color;
    let acc = this.reducedMotion?.matches ? 0 : (this.time * 36) % 13;
    let total = 0;
    for (let i = 2; i < pts.length; i += 2) {
      const x0 = pts[i - 2];
      const y0 = pts[i - 1];
      const dx = pts[i] - x0;
      const dy = pts[i + 1] - y0;
      const len = Math.hypot(dx, dy);
      if (!Number.isFinite(len)) continue; // a portal or Rift Phase jump, not a path
      while (acc < len) {
        const t = acc / len;
        const fade = 1 - Math.min(1, (total + acc) / 900);
        ctx.globalAlpha = 0.25 + 0.75 * fade;
        ctx.beginPath();
        ctx.arc(x0 + dx * t, y0 + dy * t, 1.2 + 1.4 * fade, 0, TAU);
        ctx.fill();
        acc += 13;
      }
      acc -= len;
      total += len;
      // Each bounce point gets a small flare.
      if (i < pts.length - 2 && Number.isFinite(pts[i + 2])) {
        ctx.globalAlpha = .9;
        this.drawGlow(pts[i], pts[i + 1], 12, powered ? '#ffe3a3' : '#8edafa', .8);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (res.enemy) {
      const { x, y, r } = res.enemy;
      const radius = r + 8;
      const spin = this.reducedMotion?.matches ? 0 : this.time * 1.5;
      // Lock-on reticle.
      ctx.strokeStyle = '#ffe3a3'; ctx.lineWidth = 2.1;
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * TAU / 4 + spin;
        arc(ctx, x, y, radius, a - .25, a + .25); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * (radius + 3), y + Math.sin(a) * (radius + 3));
        ctx.lineTo(x + Math.cos(a) * (radius + 8), y + Math.sin(a) * (radius + 8)); ctx.stroke();
      }
      this.drawLight(res.ex, res.ey, 10, '#ffe3a3', .9);
      arc(ctx, res.ex, res.ey, 3); ctx.fillStyle = '#fff4cd'; ctx.fill();
    }
    ctx.restore();
  }

  /** Sentinel drones: a hovering diamond whose ring fills as the next shot charges. */
  private drawSentinels(w: World): void {
    const ctx = this.ctx;
    const twin = w.flags.has('sentinel2');
    const charge = 1 - clamp(w.sentinelT / SENTINEL_INTERVAL[twin ? 1 : 0], 0, 1);
    for (const [x, y0] of twin ? SENTINEL_POS : SENTINEL_POS.slice(0, 1)) {
      const y = y0 + Math.sin(this.time * 2.4 + x) * 3;
      this.drawShadow(x, y0 + 14, 8, .45, 2);
      this.drawLight(x, y, 24, '#7ef0ff', 0.35 + charge * 0.4);
      const hull = ctx.createLinearGradient(x - 8, y - 9, x + 8, y + 9);
      hull.addColorStop(0, '#d8fbff'); hull.addColorStop(.4, '#2a6a7a'); hull.addColorStop(1, '#06141c');
      ctx.fillStyle = hull; ctx.strokeStyle = '#02080c'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x + 9, y); ctx.lineTo(x, y + 10); ctx.lineTo(x - 9, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      arc(ctx, x, y, 3); ctx.fillStyle = '#eaffff'; ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#7ef0ffc0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 14, -Math.PI / 2, -Math.PI / 2 + TAU * charge); ctx.stroke();
      ctx.restore();
    }
  }

  private drawLauncher(w: World): void {
    const ctx = this.ctx;
    const core = CORE_MAP[w.cfg.core];
    const ang = Math.atan2(w.aim.dy, w.aim.dx);
    const color = core.id === 'striker' ? '#9aeadb' : core.color;
    const charged = w.isPowerWindow();
    const recoil = this.reducedMotion?.matches ? 0 : this.launcherRecoil;
    this.drawLight(LAUNCHER_X, LAUNCHER_Y, 80, charged ? '#ffe3a3' : color, w.aim.active ? .4 : .2);
    const live = charged ? '#ffe3a3' : color;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (w.aim.active && w.hand > 0) {
      // A searchlight cone thrown up the field along the aim.
      ctx.save();
      ctx.translate(LAUNCHER_X, LAUNCHER_Y); ctx.rotate(ang);
      const cone = ctx.createLinearGradient(30, 0, 330, 0);
      cone.addColorStop(0, live + '30'); cone.addColorStop(1, live + '00');
      ctx.fillStyle = cone;
      ctx.beginPath(); ctx.moveTo(30, -10); ctx.lineTo(330, -70); ctx.lineTo(330, 70); ctx.lineTo(30, 10); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // Pit lights chase around the launch well.
    const spin = this.reducedMotion?.matches ? 0 : this.time * (w.hand > 0 ? 1.4 : .4);
    for (let i = 0; i < 24; i++) {
      const a = i * TAU / 24;
      const k = (((a - spin) % TAU) + TAU) % TAU / TAU;
      ctx.globalAlpha = .15 + .85 * k ** 4;
      ctx.fillStyle = live;
      ctx.save(); ctx.translate(LAUNCHER_X, LAUNCHER_Y); ctx.rotate(a); ctx.fillRect(53, -1.2, 6, 2.4); ctx.restore();
    }
    ctx.restore();
    drawTurret(ctx, LAUNCHER_X, LAUNCHER_Y, ang, color, core.id,
      recoil * (this.opts.reduceFlashes ? .45 : 1), charged, w.hand > 0, this.reducedMotion?.matches ? 0 : this.time);
    if (w.aim.active && w.hand > 0 && !w.aim.streamed) {
      const t = clamp(w.aim.holdTime / 1.15, 0, 1);
      const start = -Math.PI / 2;
      const radius = 48;
      const from = start + TAU * POWER_START / 1.15;
      const to = start + TAU * POWER_END / 1.15;
      const cursor = start + TAU * t;
      arc(ctx, LAUNCHER_X, LAUNCHER_Y, radius);
      ctx.strokeStyle = '#040a16d0'; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = color + '42'; ctx.lineWidth = 1; ctx.stroke();
      arc(ctx, LAUNCHER_X, LAUNCHER_Y, radius, from, to);
      ctx.strokeStyle = charged ? '#ffe3a3' : '#bc976b'; ctx.lineWidth = 6; ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      arc(ctx, LAUNCHER_X, LAUNCHER_Y, radius, start, cursor);
      ctx.strokeStyle = charged ? '#fff3ce' : color; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();
      const x = LAUNCHER_X + Math.cos(cursor) * radius;
      const y = LAUNCHER_Y + Math.sin(cursor) * radius;
      this.drawLight(x, y, 12, charged ? '#ffe3a3' : color, .9);
      arc(ctx, x, y, 3.5); ctx.fillStyle = '#efffff'; ctx.fill();
    }
    // Energy feeds the turret through the deck conduits.
    if (!this.reducedMotion?.matches) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? 14 : W - 14, x1 = LAUNCHER_X + s * 58;
        for (let i = 0; i < 3; i++) {
          const k = (this.time * (w.hand > 0 ? .9 : .35) + i / 3) % 1;
          const px = x0 + (x1 - x0) * k;
          this.drawGlow(px, LAUNCHER_Y + 4, 9, charged ? '#ffe3a3' : color, Math.sin(k * Math.PI) * .9);
        }
      }
      ctx.restore();
    }
    // Balls in hand: a row of lit cells under the turret.
    const total = w.maxBallsAllowed();
    for (let i = 0; i < total; i++) {
      const x = LAUNCHER_X - ((total - 1) * 12) / 2 + i * 12;
      const y = LAUNCHER_Y + 44;
      const full = i < w.hand;
      ctx.fillStyle = full ? '#edffff' : '#162434';
      ctx.strokeStyle = full ? color : '#607383';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y);
      ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (full) this.drawLight(x, y, 8, color, .6);
    }
  }

  private drawBall(w: World, b: Ball): void {
    const ctx = this.ctx;
    const evo = [...w.build.evolutions][0];
    const evoColor = evo ? EVOLUTION_MAP[evo].color : null;
    const tier = b.kind === 'main' ? effectiveTier(w, b) : 0;
    const tierColor = MOMENTUM_COLORS[tier];
    const [c0, c1] = w.trailColors;
    const main = evoColor ?? (b.powered ? '#ffe3a3' : tier > 0 ? tierColor : c1);
    const tr = b.trail;
    const railgun = w.build.has('evo_railgun');
    const isMain = b.kind === 'main';
    const r = b.r * (1 + b.pulse * 0.25);
    // Floating above the deck, the ball casts a soft offset shadow.
    this.drawShadow(b.x + 3, b.y + r * .9, r * .95, .45, 1.6);
    if (tr.length >= 4) {
      const n = tr.length / 2;
      // A single tapered ribbon avoids the beaded overlaps of round line segments.
      const ribbon = (width: number) => {
        ctx.beginPath();
        for (const side of [1, -1]) for (let j = 0; j < n; j++) {
          const i = side === 1 ? j : n - 1 - j;
          const prev = Math.max(0, i - 1) * 2;
          const next = Math.min(n - 1, i + 1) * 2;
          const dx = (next === tr.length - 2 ? b.x : tr[next]) - tr[prev];
          const dy = (next === tr.length - 2 ? b.y : tr[next + 1]) - tr[prev + 1];
          const length = Math.hypot(dx, dy) || 1;
          const size = width * (i / (n - 1)) ** .8 * side;
          const x = (i === n - 1 ? b.x : tr[i * 2]) - dy / length * size;
          const y = (i === n - 1 ? b.y : tr[i * 2 + 1]) + dx / length * size;
          if (i === 0 && side === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill();
      };
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = main; ctx.globalAlpha = .1;
      ribbon(r * (isMain ? 2.1 : 1.4));
      const trail = ctx.createLinearGradient(tr[0], tr[1], b.x, b.y);
      trail.addColorStop(0, main + '00'); trail.addColorStop(.55, main + '70'); trail.addColorStop(1, c0 + 'c0');
      ctx.fillStyle = trail; ctx.globalAlpha = isMain ? .75 : .45;
      ribbon(r * (railgun ? .45 : .8));
      const filament = ctx.createLinearGradient(tr[0], tr[1], b.x, b.y);
      filament.addColorStop(0, '#ffffff00'); filament.addColorStop(1, '#ffffff');
      ctx.fillStyle = filament; ctx.globalAlpha = .55;
      ribbon(r * .22);
      ctx.restore();
    }
    this.drawLight(b.x, b.y, r * (3.2 + tier * 0.55), main, isMain ? 0.85 : 0.5);
    // Speed squash: the ball stretches along its flight, never below its true size.
    const flying = b.state === 'flight';
    const stretch = this.reducedMotion?.matches || !flying ? 1 : 1.06 + Math.min(.16, tier * .04) + (b.powered ? .05 : 0);
    const heading = Math.atan2(b.dy, b.dx);
    const sprite = coreSprite(isMain ? w.cfg.core : 'striker', main);
    const half = r * 1.09;
    ctx.save(); ctx.translate(b.x, b.y);
    ctx.rotate(heading); ctx.scale(stretch, 1 / Math.sqrt(stretch)); ctx.rotate(-heading);
    arc(ctx, 0, 0, r + 1.2); ctx.fillStyle = '#02040a'; ctx.fill();
    ctx.save();
    if (!this.reducedMotion?.matches) ctx.rotate(this.time * (2.2 + tier * .65) + b.id);
    ctx.drawImage(sprite, -half, -half, half * 2, half * 2);
    ctx.restore();
    ctx.drawImage(orbLighting(), -half, -half, half * 2, half * 2);
    ctx.restore();
    // A white-hot core and an energy rim make the ball the brightest thing on the field.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.drawGlow(b.x, b.y, r * 1.5, main, isMain ? .55 : .35);
    ctx.strokeStyle = main; ctx.lineWidth = 1.2; ctx.globalAlpha = .7;
    arc(ctx, b.x, b.y, r * 1.02, Math.PI * .1, Math.PI * .9); ctx.stroke();
    ctx.restore();
    if (isMain) this.flare(b.x, b.y, r * (5 + tier), main, b.powered ? .7 : .45);
    if (tier > 0 || b.powered) {
      // Momentum halos: one orbiting arc per tier.
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = main; ctx.lineWidth = 1.8;
      const spin = this.reducedMotion?.matches ? 0 : this.time * (2 + tier);
      for (let i = 0; i <= tier; i++) {
        const a = spin + i * TAU / (tier + 1);
        arc(ctx, b.x, b.y, r + 4, a, a + TAU / (tier + 1) * .7); ctx.stroke();
      }
      ctx.restore();
    }
    if (tier >= 3 && this.emits(30)) this.particles.spawn(b.x, b.y, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 0.3, 3, tierColor, 2);
    if (evo === 'inferno' && this.emits(36)) this.particles.spawn(b.x, b.y, (Math.random() - 0.5) * 50, -40, 0.35, 4, Math.random() < 0.5 ? '#ff6a2a' : '#ffd166', 2);
    if (isMain && flying && (tier > 0 || b.powered) && this.emits(14 + tier * 6)) {
      this.particles.spawn(b.x, b.y, -b.dx * 60 + (Math.random() - .5) * 40, -b.dy * 60 + (Math.random() - .5) * 40, .3, 2.2, main, 3);
    }
  }

  private drawBlackout(w: World): void {
    if (!this.dark) {
      this.dark = document.createElement('canvas');
      this.dark.width = W / 2;
      this.dark.height = H / 2;
    }
    const d = this.dark.getContext('2d')!;
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, W / 2, H / 2);
    const fade = Math.min(1, w.event!.t / 1.5, (w.event!.dur - w.event!.t) / 1.5);
    d.fillStyle = `rgba(2,1,8,${0.9 * fade})`;
    d.fillRect(0, 0, W / 2, H / 2);
    d.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number) => {
      const g = d.createRadialGradient(x / 2, y / 2, 0, x / 2, y / 2, r / 2);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g;
      d.fillRect((x - r) / 2, (y - r) / 2, r, r);
    };
    for (const b of w.balls) hole(b.x, b.y, 150);
    for (const b of this.booms) hole(b.x, b.y, b.r * 2.5);
    hole(LAUNCHER_X, LAUNCHER_Y, 160);
    for (const e of w.enemies) if (e.st.burnT > 0) hole(e.x, e.y, 60);
    for (const n of w.resonance.nodes) hole(n.x, n.y, n.lit ? 90 : 60);
    this.ctx.drawImage(this.dark, 0, 0, W, H);
  }

  private drawTexts(): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of this.texts) {
      const a = Math.min(1, t.life / (t.max * 0.5));
      const age = t.max - t.life;
      // Pop in oversized, settle, then shrink slightly as it fades.
      const pop = age < .1 ? 1 + (1 - age / .1) * .55 : 1 - (1 - a) * .15;
      const size = Math.round(t.size * pop);
      ctx.globalAlpha = a;
      ctx.font = `900 ${size}px ${FONT}`;
      const width = Math.min(W - 40, ctx.measureText(t.text).width);
      const x = clamp(t.x, 20 + width / 2, W - 20 - width / 2);
      // Numbers from arrivals near the top stay in the field instead of drifting over the header.
      const y = Math.max(t.y, FIELD_TOP + t.size * 0.7);
      ctx.lineWidth = Math.max(3, size * .2);
      ctx.strokeStyle = 'rgba(2,3,8,0.9)';
      ctx.strokeText(t.text, x, y + 1.5, W - 40);
      ctx.strokeText(t.text, x, y, W - 40);
      const fill = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
      fill.addColorStop(0, '#ffffff'); fill.addColorStop(.45, t.color); fill.addColorStop(1, shade(t.color, .35));
      ctx.fillStyle = fill;
      ctx.fillText(t.text, x, y, W - 40);
    }
    ctx.globalAlpha = 1;
    ctx.lineJoin = 'miter';
  }

  // ------------------------------------------------------------------ HUD
  private iconSprite(glyph: string): HTMLCanvasElement {
    let c = this.iconSprites.get(glyph);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 40;
    const g = c.getContext('2d')!;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `30px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", ${FONT}`;
    g.fillText(glyph, 20, 22);
    this.iconSprites.set(glyph, c);
    return c;
  }

  /** Below 30% hull the screen edge breathes red: danger reads without looking at the bar. */
  private drawLowHull(w: World): void {
    const frac = w.hp / w.maxHp;
    if (frac > 0.3 || w.state !== 'playing') return;
    const ctx = this.ctx;
    const k = (1 - frac / 0.3) * (0.55 + 0.45 * Math.sin(this.time * 6.5)) * (this.opts.reduceFlashes ? 0.35 : 1);
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.62);
    g.addColorStop(0, 'rgba(255,40,70,0)');
    g.addColorStop(1, `rgba(255,40,70,${0.32 * k})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  private drawHud(w: World): void {
    const ctx = this.ctx;
    const compact = W * this.scale < 300 && innerWidth > innerHeight;
    const smallText = (size: number) => Math.max(size, 8 / this.scale);
    // DOM controls keep a physical touch size while canvas telemetry scales.
    const right = Math.min(W - 88, W - 64 / this.scale);
    ctx.textBaseline = 'middle';
    if (!compact) {
      // Hull: a heart, the number that matters, and a segmented bar.
      const hpFrac = clamp(w.hp / w.maxHp, 0, 1);
      const hpColor = hpFrac > .5 ? '#7ef0d2' : hpFrac > .25 ? '#ffd166' : '#ff5d73';
      const beat = hpFrac <= .3 ? 1 + Math.max(0, Math.sin(this.time * 6.5)) * .18 : 1;
      heart(ctx, 25, 17, 8.5 * beat, hpColor);
      ctx.textAlign = 'left'; ctx.fillStyle = '#f2fbff';
      ctx.font = `900 ${smallText(17)}px ${FONT}`;
      const hpText = formatNum(Math.ceil(w.hp));
      ctx.fillText(hpText, 40, 18, 70);
      const hpWidth = Math.min(70, ctx.measureText(hpText).width);
      ctx.fillStyle = '#8fa6b8'; ctx.font = `700 ${smallText(10)}px ${FONT}`;
      ctx.fillText(`/ ${formatNum(w.maxHp)}`, 44 + hpWidth, 19, 80);
      // Recessed track, a glossy fill with a lagging damage ghost, and segment notches.
      ctx.fillStyle = '#02060c'; roundRect(ctx, 15, 30, 188, 10, 4); ctx.fill();
      ctx.fillStyle = '#16232f'; roundRect(ctx, 16, 31, 186, 8, 3); ctx.fill();
      this.hullGhost = this.hullGhost < hpFrac ? hpFrac : Math.max(hpFrac, this.hullGhost - this.emissionDt * .35);
      if (this.hullGhost > hpFrac) { ctx.fillStyle = '#ffe9c8'; roundRect(ctx, 16, 31, 186 * this.hullGhost, 8, 3); ctx.fill(); }
      const health = ctx.createLinearGradient(0, 31, 0, 39);
      health.addColorStop(0, shade(hpColor, .45, '#ffffff')); health.addColorStop(.45, hpColor); health.addColorStop(1, shade(hpColor, .45));
      ctx.fillStyle = health; roundRect(ctx, 16, 31, 186 * hpFrac, 8, 3); ctx.fill();
      ctx.fillStyle = '#ffffff40'; ctx.fillRect(18, 32, Math.max(0, 186 * hpFrac - 4), 1);
      ctx.fillStyle = '#07111d';
      for (let i = 1; i < 10; i++) ctx.fillRect(16 + i * 18.6, 31, 2, 8);
      if (hpFrac > .02) this.drawLight(16 + 186 * hpFrac, 35, 10, hpColor, .5);
      // Level badge and kills.
      ctx.font = `900 ${smallText(11)}px ${FONT}`;
      const levelText = t('canvas.level', { n: String(w.level).padStart(2, '0') });
      const badgeW = Math.min(64, ctx.measureText(levelText).width + 16);
      ctx.fillStyle = '#ffd45126'; ctx.strokeStyle = '#ffd451aa'; ctx.lineWidth = 1;
      roundRect(ctx, 16, 46, badgeW, 19, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe38a'; ctx.textAlign = 'center';
      ctx.fillText(levelText, 16 + badgeW / 2, 56, badgeW - 8);
      ctx.textAlign = 'left'; ctx.fillStyle = '#9db3c4'; ctx.font = `700 ${smallText(10)}px ${FONT}`;
      ctx.fillText(t('canvas.eliminated', { n: formatNum(w.run.kills) }), 24 + badgeW, 56, 190 - badgeW);
      // Clock and the road to the boss.
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = '700 23px Consolas, monospace';
      ctx.fillText(formatTime(w.time), W / 2, 21, 116);
      this.drawBossTrack(w, smallText);
      // combo
      if (w.combo.count >= 3) {
        const c = Math.floor(w.combo.count);
        // A brief pop on each hit, bounded so the count never grows into its subtitle.
        const pulse = 1 + clamp(w.combo.timer - w.build.stats.comboWindow + 0.15, 0, 0.15) * 3;
        ctx.textAlign = 'right';
        ctx.fillStyle = c >= 100 ? '#ff7ad9' : c >= 50 ? '#ffb13b' : c >= 25 ? '#ffe066' : '#ffffff';
        ctx.font = `900 ${Math.round(24 * pulse)}px ${FONT}`;
        // Anchor the baseline so the pop grows upward, away from the COMBO line.
        ctx.textBaseline = 'alphabetic';
        // Glyphs below the baseline (the Persian decimal sign ٫) lift the count by their depth.
        const count = t('canvas.comboCount', { n: formatNum(c) });
        const sink = Math.max(0, ctx.measureText(count).actualBoundingBoxDescent - 1);
        ctx.fillText(count, right, 35 - sink, Math.min(110, right - W / 2 - 64));
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${smallText(10)}px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(t('canvas.comboBonus', { n: Math.round((w.comboMult() - 1) * 100) }), right, 48, 110);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        roundRect(ctx, right - 86, 57, 86, 4, 2); ctx.fill();
        ctx.fillStyle = '#ffe066';
        roundRect(ctx, right - 86, 57, 86 * clamp(w.combo.timer / w.build.stats.comboWindow, 0, 1), 4, 2); ctx.fill();
      }
      // Build strip: every upgrade owned, at a glance, like a loadout bar.
      this.drawBuildStrip(w, 16, 77, Math.min(260, right - 170));
      // XP bar
      const xpFrac = clamp(w.xp / w.xpNext, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, FIELD_TOP - 7, W, 6);
      const xp = ctx.createLinearGradient(0, 0, W, 0);
      xp.addColorStop(0, '#3f8fd8'); xp.addColorStop(.6, '#6fe0d0'); xp.addColorStop(1, '#d4ffe9');
      ctx.fillStyle = xp;
      ctx.fillRect(0, FIELD_TOP - 7, W * xpFrac, 6);
      ctx.fillStyle = '#ffffff50'; ctx.fillRect(0, FIELD_TOP - 7, W * xpFrac, 1);
      // A shimmer travels along the filled part.
      if (xpFrac > .05 && !this.reducedMotion?.matches) {
        const sx = (this.time * 220) % (W * xpFrac + 120) - 60;
        const shine = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0);
        shine.addColorStop(0, '#ffffff00'); shine.addColorStop(.5, '#ffffff70'); shine.addColorStop(1, '#ffffff00');
        ctx.save(); ctx.beginPath(); ctx.rect(0, FIELD_TOP - 7, W * xpFrac, 6); ctx.clip();
        ctx.fillStyle = shine; ctx.fillRect(sx - 40, FIELD_TOP - 7, 80, 6); ctx.restore();
      }
      if (xpFrac > 0.02) this.drawLight(W * xpFrac, FIELD_TOP - 4, 14, '#c8fff0', 0.8);
      ctx.textAlign = 'right'; ctx.font = `700 ${smallText(10)}px ${FONT}`;
      ctx.fillStyle = w.resonance.overdrive > 0 ? '#ffe3a3' : '#c3b1ff';
      const circuit = w.resonance;
      ctx.fillText(circuit.overdrive > 0 ? t('canvas.overdrive', { n: Math.ceil(circuit.overdrive) }) :
        circuit.nodes.length ? t('canvas.circuit', { lit: circuit.lit, n: Math.ceil(circuit.remaining) }) : t('canvas.signalIn', { n: Math.max(0, Math.ceil(circuit.cooldown)) }), right, 77, 150);
    }
    // An active anomaly is a pill at the top of the field, where the eye already is.
    if (w.event && !w.director.bossActive) {
      const ev = EVENT_MAP[w.event.id];
      const text = t('canvas.eventTimer', { icon: ev.icon, name: ev.name, n: Math.ceil(w.event.dur - w.event.t) });
      ctx.font = `800 ${smallText(12)}px ${FONT}`;
      const tw = Math.min(W - 80, ctx.measureText(text).width + 28);
      const y = FIELD_TOP + 18;
      ctx.fillStyle = 'rgba(6,10,20,0.78)'; ctx.strokeStyle = ev.color; ctx.lineWidth = 1.5;
      roundRect(ctx, W / 2 - tw / 2, y - 12, tw, 24, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = ev.color; ctx.textAlign = 'center';
      ctx.fillText(text, W / 2, y + 1, tw - 16);
    }
    // Shot coaching only while it is actionable: aiming, or with overdrive to spend.
    const circuit = w.resonance;
    const aiming = w.aim.active && w.hand > 0;
    if (aiming || circuit.overdrive > 0) {
      ctx.textAlign = 'center'; ctx.font = `800 ${smallText(11)}px ${FONT}`;
      ctx.fillStyle = w.isPowerWindow() || (circuit.overdrive > 0 && !aiming) ? '#ffe3a3' : '#a9c0d3';
      ctx.fillText(w.isPowerWindow() ? t('canvas.releasePower') : aiming ?
        w.aim.holdTime < POWER_START ? t('canvas.holdGold') : w.aim.streamed ? t('canvas.stream') : t('canvas.releaseNormal') :
        t('canvas.overdriveBonus'), W / 2, H - 33, W - 180);
    }
    // boss bar
    if (w.director.bossActive) {
      const bosses = w.enemies.filter((e) => e.alive && e.boss);
      const hp = bosses.reduce((a, e) => a + e.hp, 0);
      const max = bosses.reduce((a, e) => a + e.maxHp, 0) || 1;
      const y = FIELD_TOP + 8;
      const frac = clamp(hp / max, 0, 1);
      this.bossGhost = this.bossGhost < frac ? frac : Math.max(frac, this.bossGhost - this.emissionDt * .25);
      // Armored frame with beveled end caps.
      ctx.fillStyle = 'rgba(2,3,8,0.85)';
      roundRect(ctx, 36, y - 4, W - 72, 24, 10); ctx.fill();
      ctx.strokeStyle = '#ff6b8150'; ctx.lineWidth = 1;
      roundRect(ctx, 36.5, y - 3.5, W - 73, 23, 10); ctx.stroke();
      ctx.fillStyle = '#1a0a10';
      roundRect(ctx, 40, y, W - 80, 16, 8); ctx.fill();
      if (this.bossGhost > frac) {
        ctx.fillStyle = '#fff0d8';
        roundRect(ctx, 40, y, (W - 80) * this.bossGhost, 16, 8); ctx.fill();
      }
      const bg = ctx.createLinearGradient(0, y, 0, y + 16);
      bg.addColorStop(0, '#ff8a9c'); bg.addColorStop(.4, '#ff2d55'); bg.addColorStop(1, '#8a0a24');
      ctx.fillStyle = bg;
      roundRect(ctx, 40, y, (W - 80) * frac, 16, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff38';
      roundRect(ctx, 44, y + 2, Math.max(0, (W - 80) * frac - 8), 4, 2); ctx.fill();
      // Quarter notches mark the phase thresholds players plan around.
      ctx.fillStyle = '#0a0206a0';
      for (let i = 1; i < 4; i++) ctx.fillRect(40 + (W - 80) * i / 4 - 1, y, 2, 16);
      if (frac > .01) this.drawLight(40 + (W - 80) * frac, y + 8, 22, '#ff3b5c', .7);
      ctx.strokeStyle = '#ffb3c066'; ctx.lineWidth = 1;
      roundRect(ctx, 40, y, W - 80, 16, 8); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = `900 ${smallText(11)}px ${FONT}`;
      const name = BOSS_MAP[w.director.bossId]?.name ?? '';
      const label = bosses.length > 1 ? t('canvas.bossCount', { name: name.toUpperCase(), n: bosses.length }) : name.toUpperCase();
      // The name stays legible over the fill and the pale damage ghost alike.
      ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = '#1a0610';
      ctx.strokeText(label, W / 2, y + 8.5, W - 100);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, W / 2, y + 8.5, W - 100);
      ctx.lineJoin = 'miter';
      // Boss Fury: a fuse under the bar burns down to the moment the line starts to crumble.
      const furyAt = w.director.furyAt;
      if (Number.isFinite(furyAt)) {
        const span = Math.max(1, furyAt - w.bossStart);
        const left = clamp((furyAt - w.time) / span, 0, 1);
        const fy = y + 19;
        ctx.fillStyle = 'rgba(2,3,8,0.85)';
        roundRect(ctx, 96, fy, W - 192, 6, 3); ctx.fill();
        if (left > 0) {
          const soon = furyAt - w.time <= FURY.warn;
          ctx.fillStyle = soon && Math.sin(w.time * 12) > 0 ? '#ff2d55' : '#ffb36b';
          roundRect(ctx, 96, fy, (W - 192) * left, 6, 3); ctx.fill();
        } else {
          const pulse = 0.55 + 0.45 * Math.sin(w.time * 10);
          ctx.fillStyle = `rgba(255,45,85,${pulse})`;
          roundRect(ctx, 96, fy, W - 192, 6, 3); ctx.fill();
          ctx.font = `900 ${smallText(10)}px ${FONT}`;
          ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = '#1a0610';
          ctx.strokeText(t('canvas.fury'), W / 2, fy + 14, W - 100);
          ctx.fillStyle = '#ff6b81';
          ctx.fillText(t('canvas.fury'), W / 2, fy + 14, W - 100);
          ctx.lineJoin = 'miter';
        }
      }
    }
    // momentum readout of the lead ball
    const lead = w.balls.find((b) => b.kind === 'main' && b.state === 'flight');
    if (lead) {
      // Match the ball's own glow, including tiers granted by Combo Reactor.
      const tier = effectiveTier(w, lead);
      if (tier > 0) {
        ctx.textAlign = 'center';
        ctx.font = `800 ${smallText(10)}px ${FONT}`;
        ctx.fillStyle = MOMENTUM_COLORS[tier];
        ctx.fillText(momentumName(tier).toUpperCase(), W / 2, H - 59);
      }
    }
  }

  /** Progress toward the boss, with the next anomaly marked on the same road. */
  private drawBossTrack(w: World, smallText: (n: number) => number): void {
    const ctx = this.ctx;
    const x0 = W / 2 - 58, width = 116, y = 42;
    ctx.textAlign = 'center';
    if (w.director.bossActive) {
      ctx.font = `900 ${smallText(10)}px ${FONT}`;
      ctx.fillStyle = '#ff6b81';
      ctx.fillText(t('canvas.bossFight'), W / 2, y + 4, width + 20);
      return;
    }
    if (w.director.endless) {
      ctx.font = `800 ${smallText(10)}px ${FONT}`; ctx.fillStyle = '#c77dff';
      ctx.fillText(t('canvas.endless', { n: w.director.endlessPressure().toFixed(1) }), W / 2, y + 4, width + 60);
      return;
    }
    const bossTime = Math.max(1, w.director.bossTime);
    const frac = clamp(w.time / bossTime, 0, 1);
    ctx.fillStyle = '#ffffff1a'; roundRect(ctx, x0, y - 2.5, width, 5, 2.5); ctx.fill();
    const g = ctx.createLinearGradient(x0, 0, x0 + width, 0);
    g.addColorStop(0, '#ffb38a66'); g.addColorStop(1, '#ff6b81');
    ctx.fillStyle = g; roundRect(ctx, x0, y - 2.5, width * frac, 5, 2.5); ctx.fill();
    const anomaly = w.director.eventTime - w.time;
    if (anomaly > 0 && w.director.eventTime < bossTime && !w.event) {
      const ax = x0 + width * clamp(w.director.eventTime / bossTime, 0, 1);
      ctx.fillStyle = '#e8c3ff';
      ctx.beginPath(); ctx.moveTo(ax, y - 5); ctx.lineTo(ax + 4, y); ctx.lineTo(ax, y + 5); ctx.lineTo(ax - 4, y); ctx.closePath(); ctx.fill();
    }
    skull(ctx, x0 + width + 9, y, 6.5, frac > .85 ? '#ff6b81' : '#e7a88c');
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x0 + width * frac, y, 3, 0, TAU); ctx.fill();
    ctx.font = `700 ${smallText(9)}px ${FONT}`;
    ctx.fillStyle = '#e7a88c';
    const dLeft = bossTime - w.time;
    ctx.fillText(anomaly > 0 && anomaly <= 30 && !w.event ? t('canvas.anomalyIn', { time: formatTime(anomaly) }) : t('canvas.bossIn', { time: formatTime(Math.max(0, dLeft)) }), W / 2, y + 14, width + 30);
  }

  private drawBuildStrip(w: World, x: number, y: number, maxWidth: number): void {
    const ctx = this.ctx;
    const entries = [...w.build.upgrades.entries()];
    const evo = [...w.build.evolutions];
    const step = 21;
    const fit = Math.max(0, Math.floor(maxWidth / step));
    const items: [string, number][] = [
      ...evo.map((id): [string, number] => [EVOLUTION_MAP[id].icon, 0]),
      ...w.build.relics.map((id): [string, number] => [RELIC_MAP[id]?.icon ?? '•', -1]),
      ...entries.map(([id, lv]): [string, number] => [UPGRADE_MAP[id]?.icon ?? '•', lv]),
    ];
    const shown = items.length > fit ? items.slice(0, Math.max(0, fit - 1)) : items;
    ctx.textAlign = 'center';
    shown.forEach(([glyph, lv], i) => {
      const cx = x + 8 + i * step;
      ctx.fillStyle = lv === 0 ? '#ffb21e33' : lv < 0 ? '#ffd45130' : '#ffffff10';
      roundRect(ctx, cx - 9, y - 9, 18, 18, 5); ctx.fill();
      ctx.drawImage(this.iconSprite(glyph), cx - 8, y - 8, 16, 16);
      if (lv > 1) {
        ctx.font = `900 8px ${FONT}`;
        ctx.fillStyle = '#05101a'; ctx.fillRect(cx + 2, y + 3, 8, 8);
        ctx.fillStyle = '#ffe38a'; ctx.fillText(String(lv), cx + 6, y + 7.5);
      }
    });
    if (items.length > shown.length) {
      ctx.font = `800 9px ${FONT}`; ctx.fillStyle = '#9db3c4';
      ctx.fillText(`+${items.length - shown.length}`, x + 8 + shown.length * step, y + 1);
    }
  }

  private drawBanner(): void {
    const b = this.banners[0];
    if (!b) return;
    const ctx = this.ctx;
    const t = b.t / b.dur;
    const inT = Math.min(1, b.t / 0.25);
    const out = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
    const s = easeOutBack(inT);
    const y = b.big ? H * 0.36 : H * 0.3;
    ctx.save();
    ctx.globalAlpha = out;
    ctx.translate(W / 2, y);
    ctx.scale(s, s);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const g = ctx.createLinearGradient(-W / 2, 0, W / 2, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.65)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-W / 2, -34, W, b.sub ? 76 : 60);
    // Hairlines in the banner's color frame the band.
    const line = ctx.createLinearGradient(-W / 2, 0, W / 2, 0);
    line.addColorStop(0, b.color + '00'); line.addColorStop(.5, b.color + 'c0'); line.addColorStop(1, b.color + '00');
    ctx.fillStyle = line;
    ctx.fillRect(-W / 2, -34, W, 1.5); ctx.fillRect(-W / 2, (b.sub ? 76 : 60) - 35.5, W, 1.5);
    ctx.font = `900 ${b.big ? 38 : 28}px ${FONT}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(b.text, 0, 0, W - 40);
    ctx.shadowColor = b.color; ctx.shadowBlur = b.big ? 22 : 14;
    const fill = ctx.createLinearGradient(0, -20, 0, 18);
    fill.addColorStop(0, '#ffffff'); fill.addColorStop(.5, b.color); fill.addColorStop(1, shade(b.color, .3));
    ctx.fillStyle = fill;
    ctx.fillText(b.text, 0, 0, W - 40);
    ctx.shadowBlur = 0;
    if (b.sub) {
      ctx.font = `700 ${b.big ? 20 : 15}px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(b.sub, 0, b.big ? 34 : 28, W - 40);
    }
    ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (w <= 0) return;
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.bezierCurveTo(x - r * 1.6, y - r * .1, x - r * .9, y - r * 1.25, x, y - r * .45);
  ctx.bezierCurveTo(x + r * .9, y - r * 1.25, x + r * 1.6, y - r * .1, x, y + r);
  ctx.fill();
}

function skull(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y - r * .15, r, 0, TAU); ctx.fill();
  ctx.fillRect(x - r * .55, y + r * .4, r * 1.1, r * .6);
  ctx.fillStyle = '#0a0f1c';
  ctx.beginPath(); ctx.arc(x - r * .38, y - r * .1, r * .26, 0, TAU); ctx.arc(x + r * .38, y - r * .1, r * .26, 0, TAU); ctx.fill();
}

/** Turns a lightning polyline into a jagged bolt. */
function jaggedify(pts: number[]): number[] {
  const out: number[] = [pts[0], pts[1]];
  for (let i = 2; i < pts.length; i += 2) {
    const x0 = pts[i - 2];
    const y0 = pts[i - 1];
    const x1 = pts[i];
    const y1 = pts[i + 1];
    const segs = 5;
    const nx = -(y1 - y0);
    const ny = x1 - x0;
    const l = Math.hypot(nx, ny) || 1;
    for (let s = 1; s < segs; s++) {
      const t = s / segs;
      const off = (Math.random() - 0.5) * 22;
      out.push(x0 + (x1 - x0) * t + (nx / l) * off, y0 + (y1 - y0) * t + (ny / l) * off);
    }
    out.push(x1, y1);
  }
  return out;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 - Math.PI / 2;
    const rr = i % 2 ? r * .4 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
}

/** Two-digit hex alpha for a 0..1 opacity. */
function hex2(a: number): string {
  return Math.round(clamp(a, 0, 1) * 255).toString(16).padStart(2, '0');
}
