import { TAU, clamp, easeOutBack, formatNum, formatTime } from '../core/math';
import { EVENT_MAP } from '../data/arenas';
import { CORE_MAP } from '../data/balls';
import { BOSS_MAP, ELITE_MAP } from '../data/enemies';
import { EVOLUTION_MAP } from '../data/synergies';
import { FORTRESS_HALF_ARC, FORTRESS_RING } from '../sim/bosses';
import { traceAim } from '../sim/physics';
import {
  DEFENSE_Y, FIELD_TOP, FLOOR_Y, H, LAUNCHER_X, LAUNCHER_Y, W,
  type Ball, type Enemy, type Fx,
} from '../sim/types';
import { MOMENTUM_COLORS, MOMENTUM_NAMES, momentumTier, type World } from '../sim/world';
import { effectiveTier } from '../sim/physics';
import { Particles } from './particles';
import { createArenaSurface, drawArenaAtmosphere } from './arena';

interface Bolt { pts: number[]; life: number; color: string }
interface Ring { x: number; y: number; r: number; life: number; max: number; color: string }
interface Boom { x: number; y: number; r: number; life: number; color: string }
interface Beam { x0: number; y0: number; x1: number; y1: number; life: number; color: string }
interface FloatText { x: number; y: number; text: string; life: number; max: number; color: string; size: number; vy: number }
interface Banner { text: string; sub?: string; color: string; big: boolean; t: number; dur: number }

export interface RenderOptions {
  shake: boolean;
  damageNumbers: boolean;
  reducedFlashes: boolean;
  previewBounces: number;
  reducedMotion: boolean;
}

const FONT = '"Rubik", "Segoe UI", system-ui, sans-serif';

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
  shake = 0;
  flash = { color: '#fff', a: 0 };
  hurtFlash = 0;
  time = 0;
  private glow = new Map<string, HTMLCanvasElement>();
  private bg: HTMLCanvasElement | null = null;
  private bgArena = '';
  private dark: HTMLCanvasElement | null = null;
  private trace: number[] = [];
  opts: RenderOptions = { shake: true, damageNumbers: true, reducedFlashes: false, previewBounces: 1, reducedMotion: false };
  private launcherRecoil = 0;
  private lastHand = 0;
  private emissionDt = 0;

  private get visualTime(): number { return this.opts.reducedMotion ? 0 : this.time; }

  private emits(rate: number): boolean {
    return !this.opts.reducedMotion && Math.random() < 1 - Math.exp(-rate * this.emissionDt);
  }

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
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
    this.shake = 0;
    this.flash.a = 0;
    this.hurtFlash = 0;
    this.launcherRecoil = 0;
    this.lastHand = 0;
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

  // ------------------------------------------------------------------ fx intake
  handleFx(f: Fx): void {
    const p = this.particles;
    switch (f.t) {
      case 'hit': {
        const n = f.crit ? 14 : 6;
        p.burst(f.x, f.y, f.color, n, f.crit ? 340 : 220, f.crit ? 3.5 : 2.5, 0.35);
        if (f.crit) this.rings.push({ x: f.x, y: f.y, r: 26, life: 0.22, max: 0.22, color: '#ffe066' });
        break;
      }
      case 'dmg':
        if (!this.opts.damageNumbers || this.texts.length > 90) break;
        this.texts.push({ x: f.x, y: f.y, text: formatNum(f.v), life: 0.7, max: 0.7, color: f.color, size: f.crit ? 22 : 14, vy: f.crit ? -70 : -45 });
        break;
      case 'wall':
        p.burst(f.x, f.y, f.color, 4, 140, 2, 0.25);
        this.rings.push({ x: f.x, y: f.y, r: 24, life: .28, max: .28, color: f.color });
        break;
      case 'explosion':
        this.booms.push({ x: f.x, y: f.y, r: f.r, life: 0.32, color: f.color });
        p.burst(f.x, f.y, f.color, Math.min(26, 8 + f.r / 5), f.r * 4, 3.5, 0.45);
        break;
      case 'lightning':
        this.bolts.push({ pts: jaggedify(f.pts), life: 0.18, color: f.color });
        break;
      case 'kill':
        p.burst(f.x, f.y, f.color, f.big ? 34 : 12, f.big ? 380 : 240, f.big ? 4.5 : 3, f.big ? 0.8 : 0.5);
        this.rings.push({ x: f.x, y: f.y, r: f.r * 2.2, life: 0.3, max: 0.3, color: f.color });
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
        if (this.banners.length < 6) this.banners.push({ text: f.text, sub: f.sub, color: f.color, big: !!f.big, t: 0, dur: f.big ? 2.2 : 1.5 });
        break;
      case 'shake':
        if (this.opts.shake) this.shake = Math.min(22, this.shake + f.amt);
        break;
      case 'flash':
        if (!this.opts.reducedFlashes) this.flash = { color: f.color, a: Math.max(this.flash.a, f.a) };
        break;
      case 'hurt':
        if (!this.opts.reducedFlashes) this.hurtFlash = 1;
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

  update(dt: number): void {
    this.time += dt;
    this.emissionDt = dt;
    this.launcherRecoil *= Math.exp(-dt * 15);
    this.particles.update(dt);
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
      const b = this.banners[0];
      b.t += dt * (this.banners.length > 2 ? 1.8 : 1);
      if (b.t >= b.dur) this.banners.shift();
    }
    this.shake = Math.max(0, this.shake - dt * 40);
    this.flash.a = Math.max(0, this.flash.a - dt * 2.5);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
  }

  // ------------------------------------------------------------------ frame
  draw(w: World, hud = true): void {
    const ctx = this.ctx;
    const k = this.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    this.drawBackground(w);
    if (w.hand < this.lastHand && !this.opts.reducedMotion) this.launcherRecoil = 1;
    this.lastHand = w.hand;

    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    ctx.setTransform(k, 0, 0, k, sx * k, sy * k);

    this.drawDefenseLine(w);
    this.drawObstacles(w);
    this.drawZones(w);
    this.drawPickups(w);
    for (const e of w.enemies) this.drawEnemy(w, e);
    this.drawBossExtras(w);
    this.drawProjectiles(w);
    this.drawEffects();
    this.particles.draw(ctx);
    this.drawAim(w);
    this.drawLauncher(w);
    for (const b of w.balls) this.drawBall(w, b);
    if (w.event?.id === 'blackout') this.drawBlackout(w);
    this.drawTexts();

    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (hud) {
      this.drawHud(w);
      this.drawBanner();
    } else {
      ctx.fillStyle = 'rgba(7,6,15,0.45)';
      ctx.fillRect(0, 0, W, H);
    }
    if (this.flash.a > 0) {
      ctx.globalAlpha = this.flash.a;
      ctx.fillStyle = this.flash.color;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (this.hurtFlash > 0) {
      const g = ctx.createLinearGradient(0, H, 0, H - 260);
      g.addColorStop(0, `rgba(255,40,60,${0.45 * this.hurtFlash})`);
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
      this.bg = createArenaSurface(w.arena);
      this.bgArena = w.arena.id;
    }
    ctx.drawImage(this.bg, 0, 0, W, H);
    drawArenaAtmosphere(ctx, w.arena, this.visualTime);
  }

  private drawDefenseLine(w: World): void {
    const ctx = this.ctx;
    const hpFrac = w.hp / w.maxHp;
    const col = hpFrac > 0.5 ? '#5ad7ff' : hpFrac > 0.25 ? '#ffd166' : '#ff3b3b';
    const shield = ctx.createLinearGradient(0, DEFENSE_Y - 28, 0, DEFENSE_Y + 38);
    shield.addColorStop(0, col + '00'); shield.addColorStop(.42, col + '22'); shield.addColorStop(1, col + '00');
    ctx.fillStyle = shield;
    ctx.fillRect(0, DEFENSE_Y - 28, W, 66);
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(0, DEFENSE_Y - 1.5, W, 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = col + '80';
    for (let x = 18; x < W; x += 28) ctx.fillRect(x, DEFENSE_Y + 7, 12, 2);
    ctx.font = `9px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText('DEFENSE LINE', 24, DEFENSE_Y + 29);
    ctx.textAlign = 'right'; ctx.fillText(`${Math.ceil(hpFrac * 100)}% INTEGRITY`, W - 24, DEFENSE_Y + 29);
    if (w.barrier.charges > 0) {
      ctx.strokeStyle = '#5ad7ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(0, DEFENSE_Y - 8);
      ctx.lineTo(W, DEFENSE_Y - 8);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawObstacles(w: World): void {
    const ctx = this.ctx;
    const th = w.arena.theme;
    for (const o of w.obstacles) {
      switch (o.kind) {
        case 'bumper':
          this.drawGlow(o.x, o.y, o.r * 2.2, th.accent, 0.3 + o.flash * 0.6);
          ctx.fillStyle = '#12102a';
          ctx.strokeStyle = o.flash > 0 ? '#ffffff' : th.accent;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.r * (1 + o.flash * 0.15), 0, TAU);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.r * 0.45, 0, TAU);
          ctx.fillStyle = th.accent;
          ctx.fill();
          ctx.strokeStyle = th.accent + '60';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r + 7, 0, TAU); ctx.stroke();
          for (let i = 0; i < 3; i++) {
            const a = this.visualTime * .6 + i * TAU / 3;
            ctx.strokeStyle = '#e1ffff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(o.x, o.y, o.r * .74, a, a + .6); ctx.stroke();
          }
          ctx.fillStyle = '#ffffffb0';
          ctx.beginPath(); ctx.arc(o.x - o.r * .13, o.y - o.r * .15, o.r * .14, 0, TAU); ctx.fill();
          break;
        case 'deflector':
          ctx.strokeStyle = o.flash > 0 ? '#ffffff' : th.wall;
          ctx.lineWidth = 9;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(o.ax, o.ay);
          ctx.lineTo(o.bx, o.by);
          ctx.stroke();
          ctx.strokeStyle = '#e2faff'; ctx.lineWidth = 2; ctx.stroke();
          ctx.lineCap = 'butt';
          break;
        case 'barrel':
          if (!o.alive) {
            ctx.globalAlpha = 0.25;
            ctx.strokeStyle = '#ff8a3d';
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(o.x, o.y, o.r, 0, TAU);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            break;
          }
          this.drawGlow(o.x, o.y, o.r * 2, '#ff5a1f', 0.35 + 0.15 * Math.sin(this.visualTime * 6));
          ctx.fillStyle = '#c0331a';
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.r, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#ffd166';
          ctx.fillRect(o.x - o.r, o.y - 3, o.r * 2, 6);
          ctx.fillStyle = '#1a0a05';
          ctx.font = `bold 11px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('!', o.x, o.y);
          break;
        case 'oil':
          ctx.fillStyle = o.burning > 0 ? 'rgba(255,110,30,0.28)' : 'rgba(20,14,30,0.75)';
          ctx.beginPath();
          ctx.ellipse(o.x, o.y, o.r, o.r * 0.7, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = o.burning > 0 ? '#ff8a3d' : 'rgba(160,120,255,0.35)';
          ctx.lineWidth = 2;
          ctx.stroke();
          if (o.burning > 0 && this.emits(36)) {
            const a = Math.random() * TAU;
            const r = Math.random() * o.r;
            this.particles.spawn(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r * 0.7, 0, -60, 0.5, 4, Math.random() < 0.5 ? '#ff8a3d' : '#ffd166', 1);
          }
          break;
        case 'crate':
          if (!o.alive) break;
          ctx.fillStyle = o.flash > 0 ? '#fff3d6' : '#8a6a3d';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.strokeStyle = '#3d2a14';
          ctx.lineWidth = 2;
          ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
          ctx.fillStyle = '#3d2a14';
          for (let i = 0; i < o.hp; i++) ctx.fillRect(o.x + 6 + i * 7, o.y + o.h / 2 - 2, 4, 4);
          break;
        case 'portal':
          for (const [x, y] of [[o.ax, o.ay], [o.bx, o.by]]) {
            this.drawGlow(x, y, o.r * 2.4, '#c77dff', 0.5);
            ctx.strokeStyle = '#e0b3ff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x, y, o.r, o.spin, o.spin + TAU * 0.75);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, o.r * 0.6, -o.spin * 1.5, -o.spin * 1.5 + TAU * 0.6);
            ctx.stroke();
          }
          break;
        case 'well': {
          ctx.strokeStyle = 'rgba(199,125,255,0.35)';
          ctx.lineWidth = 1.5;
          for (let i = 0; i < 3; i++) {
            const r = ((this.visualTime * 30 + i * (o.r / 3)) % o.r) + 4;
            if (r >= o.r) continue;
            ctx.globalAlpha = 1 - r / o.r;
            ctx.beginPath();
            ctx.arc(o.x, o.y, o.r - r, 0, TAU);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          this.drawGlow(o.x, o.y, 22, '#c77dff', 0.7);
          break;
        }
      }
    }
  }

  private drawZones(w: World): void {
    for (const z of w.zones) {
      if (z.kind === 'fire') {
        const a = (1 - z.t / z.dur) * 0.45;
        this.drawGlow(z.x, z.y, z.r * 1.6, '#ff6a2a', a);
        if (this.emits(9)) this.particles.spawn(z.x + (Math.random() - 0.5) * z.r, z.y, 0, -50, 0.4, 3, '#ffb13b', 1);
      }
    }
  }

  private drawPickups(w: World): void {
    const ctx = this.ctx;
    for (const p of w.pickups) {
      switch (p.kind) {
        case 'xp': {
          const s = p.value > 4 ? 6 : 4;
          ctx.fillStyle = p.value > 4 ? '#b388ff' : '#6de2ff';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - s);
          ctx.lineTo(p.x + s * 0.7, p.y);
          ctx.lineTo(p.x, p.y + s);
          ctx.lineTo(p.x - s * 0.7, p.y);
          ctx.fill();
          break;
        }
        case 'coin':
          ctx.fillStyle = '#ffd84a';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4.5, 0, TAU);
          ctx.fill();
          break;
        case 'core':
          this.drawGlow(p.x, p.y, 20, '#ff7ad9', 0.8);
          ctx.fillStyle = '#ff7ad9';
          ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
          break;
        case 'heal':
          ctx.fillStyle = '#6dff9c';
          ctx.fillRect(p.x - 6, p.y - 2, 12, 4);
          ctx.fillRect(p.x - 2, p.y - 6, 4, 12);
          break;
        case 'mystery':
          this.drawGlow(p.x, p.y, 22, '#ffffff', 0.6 + 0.3 * Math.sin(this.visualTime * 8));
          ctx.fillStyle = '#fff';
          ctx.font = `bold 14px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', p.x, p.y);
          break;
      }
    }
  }

  private shapePath(shape: string, x: number, y: number, r: number, rot = 0): void {
    const ctx = this.ctx;
    ctx.beginPath();
    const poly = (n: number, off: number, rr = r) => {
      for (let i = 0; i < n; i++) {
        const a = off + rot + (i / n) * TAU;
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };
    switch (shape) {
      case 'triangle': poly(3, Math.PI / 2); break;
      case 'square': poly(4, Math.PI / 4, r * 1.15); break;
      case 'hex': poly(6, 0); break;
      case 'diamond': poly(4, 0, r * 1.1); break;
      case 'star': {
        for (let i = 0; i < 10; i++) {
          const a = rot + (i / 10) * TAU - Math.PI / 2;
          const rr = i % 2 === 0 ? r * 1.15 : r * 0.55;
          const px = x + Math.cos(a) * rr;
          const py = y + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;
      }
      case 'cross': {
        const t = r * 0.38;
        ctx.moveTo(x - t, y - r);
        ctx.lineTo(x + t, y - r);
        ctx.lineTo(x + t, y - t);
        ctx.lineTo(x + r, y - t);
        ctx.lineTo(x + r, y + t);
        ctx.lineTo(x + t, y + t);
        ctx.lineTo(x + t, y + r);
        ctx.lineTo(x - t, y + r);
        ctx.lineTo(x - t, y + t);
        ctx.lineTo(x - r, y + t);
        ctx.lineTo(x - r, y - t);
        ctx.lineTo(x - t, y - t);
        ctx.closePath();
        break;
      }
      case 'mirror': poly(8, Math.PI / 8); break;
      case 'hourglass':
        ctx.moveTo(x - r, y - r);
        ctx.lineTo(x + r, y - r);
        ctx.lineTo(x - r * 0.2, y);
        ctx.lineTo(x + r, y + r);
        ctx.lineTo(x - r, y + r);
        ctx.lineTo(x + r * 0.2, y);
        ctx.closePath();
        break;
      default:
        ctx.arc(x, y, r, 0, TAU);
    }
  }

  private drawEnemy(w: World, e: Enemy): void {
    const ctx = this.ctx;
    const d = e.def;
    const spawn = this.opts.reducedMotion ? 1 : easeOutBack(clamp(e.spawnT / .35, 0, 1));
    const r = e.r * spawn * (1 + (this.opts.reducedMotion ? 0 : e.flash * .7));
    if (r <= 0.5) return;
    const x = e.x;
    const y = e.y;
    if (e.elite.length) {
      const col = ELITE_MAP[e.elite[0]]?.color ?? '#fff';
      this.drawGlow(x, y, r * 2.6, col, 0.45 + 0.2 * Math.sin(this.visualTime * 5));
    }
    if (d.ai === 'golden') this.drawGlow(x, y, r * 3, '#ffd84a', 0.8);
    if (d.ai === 'warden') {
      ctx.strokeStyle = 'rgba(255,224,102,0.25)';
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 115, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (d.ai === 'magnet') {
      ctx.strokeStyle = 'rgba(255,153,80,0.22)';
      ctx.lineWidth = 1.5;
      const rr = 150 - ((this.visualTime * 60) % 120);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(r, rr), 0, TAU);
      ctx.stroke();
    }
    const rot = d.shape === 'star' ? this.visualTime * 1.5 : 0;
    this.shapePath(d.shape, x + 1, y + 6, r, rot);
    ctx.fillStyle = '#00000065'; ctx.fill();
    this.shapePath(d.shape, x, y, r, rot);
    const frozen = e.st.frozenT > 0;
    const color = frozen ? '#bfe9ff' : d.color;
    const body = ctx.createLinearGradient(x - r, y - r, x + r * .6, y + r);
    body.addColorStop(0, '#f0ffff'); body.addColorStop(.15, color);
    body.addColorStop(.6, color); body.addColorStop(1, '#172134');
    ctx.fillStyle = e.flash > .02 && !this.opts.reducedFlashes ? '#ffffff' : body;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color + 'aa';
    ctx.stroke();
    this.shapePath(d.shape, x, y + 1, r * .73, rot);
    ctx.fillStyle = '#0b14233b'; ctx.fill();
    ctx.strokeStyle = '#ffffff30'; ctx.lineWidth = 1; ctx.stroke();
    // Metal rivets and pulsing energy cores distinguish enemy materials.
    if (d.material === 'metal' || e.boss) {
      ctx.fillStyle = '#efffffaa';
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.arc(x + r * .5 * side, y - r * .35, Math.max(1, r * .07), 0, TAU); ctx.fill();
      }
    }
    if (d.material === 'energy' || d.shape === 'ring') {
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r * .48, this.visualTime * 2, this.visualTime * 2 + TAU * .72); ctx.stroke();
    }
    // Re-select the silhouette so elemental outlines follow the outer shell.
    this.shapePath(d.shape, x, y, r, rot);
    if (e.st.chill > 0 && !frozen) {
      ctx.globalAlpha = 0.25 * e.st.chill;
      ctx.fillStyle = '#9fdcff';
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (frozen) {
      ctx.strokeStyle = '#e8f8ff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    if (e.st.burnT > 0) {
      ctx.strokeStyle = '#ff8a3d';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (this.emits(18)) this.particles.spawn(x + (Math.random() - 0.5) * r, y - r * 0.5, 0, -70, 0.35, 3, Math.random() < 0.5 ? '#ff8a3d' : '#ffd166', 1);
    }
    if (e.st.bleed > 0 && this.emits(4.8 * e.st.bleed)) this.particles.spawn(x, y + r * 0.5, 0, 40, 0.4, 2.5, '#ff2a55', 1, 200);
    // eyes give silhouettes some life and show "facing"
    if (!e.boss && r > 9) {
      ctx.fillStyle = '#08121f';
      roundRect(ctx, x - r * .55, y - r * .08, r * 1.1, r * .42, r * .14); ctx.fill();
      const blink = !this.opts.reducedMotion && (this.time + e.id * .73) % 4.7 > 4.55;
      const eyeH = r * (blink ? .045 : .15);
      ctx.fillStyle = '#f3fffa';
      ctx.fillRect(x - r * .34, y + r * .04, r * .22, eyeH);
      ctx.fillRect(x + r * .12, y + r * .04, r * .22, eyeH);
    }
    if (d.ai === 'shielder' && e.phase < 3) {
      ctx.strokeStyle = '#bff0ff';
      ctx.lineWidth = 4 - e.phase;
      ctx.beginPath();
      ctx.arc(x, y, r + 5, Math.PI / 2 - 1.05, Math.PI / 2 + 1.05);
      ctx.stroke();
    }
    if (e.shieldHp > 0) {
      ctx.strokeStyle = 'rgba(90,215,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 7, 0, TAU);
      ctx.stroke();
    }
    if (e.elite.length) {
      ctx.fillStyle = ELITE_MAP[e.elite[0]]?.color ?? '#fff';
      ctx.beginPath();
      ctx.moveTo(x - 7, y - r - 6);
      ctx.lineTo(x - 7, y - r - 13);
      ctx.lineTo(x - 3.5, y - r - 9);
      ctx.lineTo(x, y - r - 14);
      ctx.lineTo(x + 3.5, y - r - 9);
      ctx.lineTo(x + 7, y - r - 13);
      ctx.lineTo(x + 7, y - r - 6);
      ctx.closePath();
      ctx.fill();
    }
    if (e.boss) this.drawBossBody(w, e);
    // hp bar
    if (!e.boss && (e.hp < e.maxHp || e.elite.length)) {
      const bw = Math.max(20, e.r * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - bw / 2, y + e.r + 5, bw, 4);
      ctx.fillStyle = e.elite.length ? '#ff7ad9' : '#ff5d73';
      ctx.fillRect(x - bw / 2, y + e.r + 5, bw * clamp(e.hp / e.maxHp, 0, 1), 4);
    }
  }

  private drawBossBody(w: World, e: Enemy): void {
    const ctx = this.ctx;
    this.drawGlow(e.x, e.y, e.r * 2.2, e.def.color, 0.4);
    for (let i = 0; i < 3; i++) {
      const a = -this.visualTime * .35 + i * TAU / 3;
      ctx.strokeStyle = e.def.color + '90'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 10, a, a + 1.25); ctx.stroke();
    }
    ctx.fillStyle = '#0a0612';
    ctx.beginPath();
    ctx.arc(e.x - e.r * 0.3, e.y - e.r * 0.05, e.r * 0.13, 0, TAU);
    ctx.arc(e.x + e.r * 0.3, e.y - e.r * 0.05, e.r * 0.13, 0, TAU);
    ctx.fill();
    ctx.fillStyle = e.phase ? '#ff3b3b' : '#fff';
    ctx.beginPath();
    ctx.arc(e.x - e.r * 0.3, e.y - e.r * 0.05, e.r * 0.06, 0, TAU);
    ctx.arc(e.x + e.r * 0.3, e.y - e.r * 0.05, e.r * 0.06, 0, TAU);
    ctx.fill();
    if (e.def.id === 'boss_magnetar') {
      ctx.strokeStyle = e.t1 > 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,153,80,0.3)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const rr = e.t1 > 0 ? 320 * (1 - e.t1 / 0.8) : 320 - ((this.visualTime * 90 + i * 100) % 300);
        ctx.beginPath();
        ctx.arc(e.x, e.y, Math.max(e.r, rr), 0, TAU);
        ctx.stroke();
      }
    }
    void w;
  }

  private drawBossExtras(w: World): void {
    const ctx = this.ctx;
    for (const e of w.enemies) {
      if (!e.alive || e.def.id !== 'boss_fortress') continue;
      const n = e.phase ? 4 : 3;
      const R = e.r + FORTRESS_RING;
      ctx.strokeStyle = e.phase ? '#ff8aa0' : '#bcd0ff';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      for (let k = 0; k < n; k++) {
        const a = e.t0 + (k * TAU) / n;
        ctx.beginPath();
        ctx.arc(e.x, e.y, R, a - FORTRESS_HALF_ARC, a + FORTRESS_HALF_ARC);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
  }

  private drawProjectiles(w: World): void {
    const ctx = this.ctx;
    for (const p of w.projectiles) {
      this.drawGlow(p.x, p.y, p.r * 3, p.color, 0.7);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.6, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.stroke();
    }
  }

  private drawEffects(): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.booms) {
      const t = 1 - b.life / 0.32;
      const r = b.r * (0.4 + 0.6 * Math.sqrt(t));
      this.drawGlow(b.x, b.y, r * 1.4, b.color, (1 - t) * 0.9);
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = '#ffefd5'; ctx.lineWidth = 1;
      ctx.globalAlpha = (1 - t) * .7;
      ctx.beginPath(); ctx.arc(b.x, b.y, r * .8, 0, TAU); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8 + b.x;
        ctx.beginPath();
        ctx.moveTo(b.x + Math.cos(a) * r * .85, b.y + Math.sin(a) * r * .85);
        ctx.lineTo(b.x + Math.cos(a) * r * (1.2 - t * .2), b.y + Math.sin(a) * r * (1.2 - t * .2));
        ctx.stroke();
      }
    }
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (0.3 + 0.7 * t), 0, TAU);
      ctx.stroke();
    }
    for (const b of this.bolts) {
      ctx.globalAlpha = b.life / 0.18;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < b.pts.length; i += 2) {
        if (i === 0) ctx.moveTo(b.pts[i], b.pts[i + 1]);
        else ctx.lineTo(b.pts[i], b.pts[i + 1]);
      }
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (const b of this.beams) {
      ctx.globalAlpha = b.life / 0.16;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(b.x0, b.y0);
      ctx.lineTo(b.x1, b.y1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawAim(w: World): void {
    if (!w.aim.active || w.hand <= 0 || w.state !== 'playing') return;
    const ctx = this.ctx;
    const res = traceAim(w, 520 + this.opts.previewBounces * 260, this.opts.previewBounces, this.trace);
    const pts = this.trace;
    ctx.fillStyle = '#ffffff';
    let acc = (this.visualTime * 36) % 13;
    let total = 0;
    for (let i = 2; i < pts.length; i += 2) {
      const x0 = pts[i - 2];
      const y0 = pts[i - 1];
      const dx = pts[i] - x0;
      const dy = pts[i + 1] - y0;
      const len = Math.hypot(dx, dy);
      while (acc < len) {
        const t = acc / len;
        const fade = 1 - Math.min(1, (total + acc) / 900);
        ctx.globalAlpha = 0.25 + 0.65 * fade;
        ctx.beginPath();
        ctx.arc(x0 + dx * t, y0 + dy * t, 2.4, 0, TAU);
        ctx.fill();
        acc += 13;
      }
      acc -= len;
      total += len;
    }
    ctx.globalAlpha = 1;
    if (res.enemy) {
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(res.enemy.x, res.enemy.y, res.enemy.r + 6 + Math.sin(this.visualTime * 10) * 2, 0, TAU);
      ctx.stroke();
    }
  }

  private drawLauncher(w: World): void {
    const ctx = this.ctx;
    const core = CORE_MAP[w.cfg.core];
    const ang = Math.atan2(w.aim.dy, w.aim.dx);
    const color = core.id === 'striker' ? '#9aeadb' : core.color;
    this.drawGlow(LAUNCHER_X, LAUNCHER_Y, 58, color, w.aim.active ? .65 : .3);
    ctx.strokeStyle = color + '40'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(LAUNCHER_X, LAUNCHER_Y, 36, 0, TAU); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + this.visualTime * .15;
      ctx.strokeStyle = color + (w.aim.active ? 'bb' : '66'); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(LAUNCHER_X, LAUNCHER_Y, 30, a, a + .35); ctx.stroke();
    }
    ctx.save();
    ctx.translate(LAUNCHER_X, LAUNCHER_Y);
    ctx.rotate(ang);
    ctx.translate(-this.launcherRecoil * 7, 0);
    ctx.fillStyle = '#08131e'; ctx.strokeStyle = '#50707c'; ctx.lineWidth = 1.5;
    roundRect(ctx, 2, -10, 34, 20, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.fillRect(28, -8, 6, 16);
    ctx.fillStyle = '#dbfff1'; ctx.fillRect(10, -2, 18, 4);
    ctx.restore();
    const dome = ctx.createRadialGradient(LAUNCHER_X - 6, LAUNCHER_Y - 8, 1, LAUNCHER_X, LAUNCHER_Y, 22);
    dome.addColorStop(0, '#47616d'); dome.addColorStop(.6, '#203646'); dome.addColorStop(1, '#0a1422');
    ctx.fillStyle = dome;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(LAUNCHER_X, LAUNCHER_Y, 20, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(LAUNCHER_X, LAUNCHER_Y, 7 + (w.aim.active ? Math.sin(this.visualTime * 5) : 0), 0, TAU); ctx.fill();
    ctx.fillStyle = '#ecfff7';
    ctx.beginPath(); ctx.arc(LAUNCHER_X - 2, LAUNCHER_Y - 2, 3, 0, TAU); ctx.fill();
    // balls in hand
    const total = w.maxBallsAllowed();
    for (let i = 0; i < total; i++) {
      const x = LAUNCHER_X - ((total - 1) * 12) / 2 + i * 12;
      ctx.fillStyle = i < w.hand ? '#ffffff' : 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(x, LAUNCHER_Y + 34, 4, 0, TAU);
      ctx.fill();
    }
  }

  private drawBall(w: World, b: Ball): void {
    const ctx = this.ctx;
    const evo = [...w.build.evolutions][0];
    const evoColor = evo ? EVOLUTION_MAP[evo].color : null;
    const tier = b.kind === 'main' ? effectiveTier(w, b) : 0;
    const tierColor = MOMENTUM_COLORS[tier];
    const [c0, c1] = w.trailColors;
    const main = evoColor ?? (tier > 0 ? tierColor : c1);
    const tr = b.trail;
    const railgun = w.build.has('evo_railgun');
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
          const size = width * i / (n - 1) * side;
          const x = (i === n - 1 ? b.x : tr[i * 2]) - dy / length * size;
          const y = (i === n - 1 ? b.y : tr[i * 2 + 1]) + dx / length * size;
          if (i === 0 && side === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill();
      };
      ctx.fillStyle = main; ctx.globalAlpha = .12;
      ribbon(b.r * 1.8);
      const trail = ctx.createLinearGradient(tr[0], tr[1], b.x, b.y);
      trail.addColorStop(0, main + '00'); trail.addColorStop(.5, main + 'a0'); trail.addColorStop(1, c0);
      ctx.fillStyle = trail; ctx.globalAlpha = b.kind === 'main' ? .85 : .5;
      ribbon(b.r * (railgun ? .4 : .8));
      ctx.fillStyle = '#efffff'; ctx.globalAlpha = .65;
      ribbon(b.r * .22);
      ctx.globalAlpha = 1;
    }
    const r = b.r * (1 + (this.opts.reducedMotion ? 0 : b.pulse * 0.25));
    this.drawGlow(b.x, b.y, r * (3 + tier * 0.5), main, b.kind === 'main' ? 0.9 : 0.5);
    ctx.fillStyle = '#0a0612';
    ctx.beginPath();
    ctx.arc(b.x, b.y, r + 1.5, 0, TAU);
    ctx.fill();
    const sphere = ctx.createRadialGradient(b.x - r * .35, b.y - r * .4, 0, b.x, b.y, r);
    sphere.addColorStop(0, '#ffffff'); sphere.addColorStop(.25, '#eaffff'); sphere.addColorStop(.55, main); sphere.addColorStop(1, '#13253b');
    ctx.fillStyle = sphere;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#ffffffa0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(b.x, b.y, r * .82, Math.PI, Math.PI * 1.65); ctx.stroke();
    if (tier > 0) {
      ctx.strokeStyle = main; ctx.lineWidth = 1.5;
      const spin = this.visualTime * (2 + tier);
      ctx.beginPath(); ctx.arc(b.x, b.y, r + 4, spin, spin + Math.PI * 1.25); ctx.stroke();
    }
    if (tier >= 3 && this.emits(30)) this.particles.spawn(b.x, b.y, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 0.3, 3, tierColor, 2);
    if (evo === 'inferno' && this.emits(36)) this.particles.spawn(b.x, b.y, (Math.random() - 0.5) * 50, -40, 0.35, 4, Math.random() < 0.5 ? '#ff6a2a' : '#ffd166', 2);
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
    this.ctx.drawImage(this.dark, 0, 0, W, H);
  }

  private drawTexts(): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const a = Math.min(1, t.life / (t.max * 0.5));
      const pop = t.max - t.life < 0.08 ? 1.3 : 1;
      ctx.globalAlpha = a;
      ctx.font = `900 ${Math.round(t.size * pop)}px ${FONT}`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ HUD
  private drawHud(w: World): void {
    const ctx = this.ctx;
    ctx.textBaseline = 'middle';
    // HP
    const hpFrac = clamp(w.hp / w.maxHp, 0, 1);
    const hpColor = hpFrac > .5 ? '#9aeadb' : hpFrac > .25 ? '#ffd166' : '#ff5d73';
    ctx.textAlign = 'left';
    ctx.font = `700 9px ${FONT}`; ctx.fillStyle = '#9bb3bf';
    ctx.fillText('HULL INTEGRITY', 16, 18);
    ctx.textAlign = 'right'; ctx.fillStyle = hpColor; ctx.font = `800 11px ${FONT}`;
    ctx.fillText(`${Math.ceil(w.hp)} / ${Math.round(w.maxHp)}`, 202, 18);
    ctx.fillStyle = '#20333f'; roundRect(ctx, 16, 29, 186, 7, 2); ctx.fill();
    const health = ctx.createLinearGradient(16, 0, 202, 0);
    health.addColorStop(0, hpColor + '88'); health.addColorStop(1, hpColor);
    ctx.fillStyle = health; roundRect(ctx, 16, 29, 186 * hpFrac, 7, 2); ctx.fill();
    ctx.fillStyle = '#07111d';
    for (let i = 1; i < 10; i++) ctx.fillRect(16 + i * 18.6, 29, 2, 7);
    // level + timer
    ctx.textAlign = 'left'; ctx.fillStyle = '#d9f8ef';
    ctx.font = `800 12px ${FONT}`;
    ctx.fillText(`LV ${String(w.level).padStart(2, '0')}`, 16, 53);
    ctx.fillStyle = '#92aebb'; ctx.font = `600 10px ${FONT}`;
    ctx.fillText(`${w.run.kills} ELIMINATED`, 70, 53);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = '700 23px Consolas, monospace';
    ctx.fillText(formatTime(w.time), W / 2, 24);
    const dLeft = w.director.bossTime - w.time;
    if (!w.director.bossActive && dLeft > 0 && dLeft < 400) {
      ctx.font = `700 11px ${FONT}`;
      ctx.fillStyle = '#e7a88c';
      ctx.fillText(`BOSS IN ${formatTime(dLeft)}`, W / 2, 44);
    }
    // combo
    if (w.combo.count >= 3) {
      const c = Math.floor(w.combo.count);
      const pulse = this.opts.reducedMotion ? 1 : 1 + Math.max(0, w.combo.timer - w.build.stats.comboWindow + 0.15) * 3;
      ctx.textAlign = 'right';
      ctx.fillStyle = c >= 100 ? '#ff7ad9' : c >= 50 ? '#ffb13b' : c >= 25 ? '#ffe066' : '#ffffff';
      ctx.font = `900 ${Math.round(24 * pulse)}px ${FONT}`;
      ctx.fillText(`${c}x`, W - 88, 26);
      ctx.font = `700 10px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(`COMBO +${Math.round((w.comboMult() - 1) * 100)}%`, W - 88, 48);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(W - 174, 58, 86, 3);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(W - 174, 58, 86 * clamp(w.combo.timer / w.build.stats.comboWindow, 0, 1), 3);
    }
    // XP bar
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(0, FIELD_TOP - 8, W, 5);
    const xp = ctx.createLinearGradient(0, 0, W, 0);
    xp.addColorStop(0, '#499cb4'); xp.addColorStop(1, '#b7ffdb');
    ctx.fillStyle = xp;
    ctx.fillRect(0, FIELD_TOP - 8, W * clamp(w.xp / w.xpNext, 0, 1), 5);
    if (!w.event) {
      ctx.textAlign = 'left'; ctx.font = `600 9px ${FONT}`; ctx.fillStyle = '#6e929f';
      ctx.fillText(w.arena.name.toUpperCase(), 16, 75);
    }
    // event
    if (w.event) {
      const ev = EVENT_MAP[w.event.id];
      ctx.textAlign = 'left';
      ctx.font = `800 12px ${FONT}`;
      ctx.fillStyle = ev.color;
      ctx.fillText(`${ev.icon} ${ev.name}  ${Math.ceil(w.event.dur - w.event.t)}s`, 14, 72);
    }
    // boss bar
    if (w.director.bossActive) {
      const bosses = w.enemies.filter((e) => e.alive && e.boss);
      const hp = bosses.reduce((a, e) => a + e.hp, 0);
      const max = bosses.reduce((a, e) => a + e.maxHp, 0) || 1;
      const y = FIELD_TOP + 8;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      roundRect(ctx, 40, y, W - 80, 14, 7);
      ctx.fill();
      ctx.fillStyle = '#ff3b5c';
      roundRect(ctx, 40, y, (W - 80) * clamp(hp / max, 0, 1), 14, 7);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.font = `800 11px ${FONT}`;
      ctx.fillStyle = '#fff';
      const name = BOSS_MAP[w.director.bossId]?.name ?? '';
      ctx.fillText(bosses.length > 1 ? `${name.toUpperCase()} ×${bosses.length}` : name.toUpperCase(), W / 2, y + 7.5);
    }
    // momentum readout of the lead ball
    const lead = w.balls.find((b) => b.kind === 'main' && b.state === 'flight');
    if (lead) {
      const t = momentumTier(lead.momentum);
      if (t > 0) {
        ctx.textAlign = 'left';
        ctx.font = `800 12px ${FONT}`;
        ctx.fillStyle = MOMENTUM_COLORS[t];
        ctx.fillText(`⚡ ${MOMENTUM_NAMES[t].toUpperCase()}`, 14, H - 30);
      }
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
    ctx.font = `900 ${b.big ? 38 : 28}px ${FONT}`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(b.text, 0, 0);
    ctx.fillStyle = b.color;
    ctx.fillText(b.text, 0, 0);
    if (b.sub) {
      ctx.font = `700 ${b.big ? 20 : 15}px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(b.sub, 0, b.big ? 34 : 28);
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
