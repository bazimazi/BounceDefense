import { TAU, clamp } from '../core/math';
import { localizeDigits } from '../i18n';
import { blockColor, isPickup, SiegeRun, SIEGE, TrickshotRun, CRYSTAL_COLOR, type Arcade, type Target } from '../sim/arcade';
import { DEFENSE_Y, W, type Segment } from '../sim/types';
import { CAPSULE_COLOR, REBOUND, ReboundRun, reboundColor, type CapsuleKind } from '../sim/rebound';
import type { CrystalKind } from '../data/trickshot';
import { arc, contactShadow } from './hardware';
import { shade } from './enemy-art';

type Light = (x: number, y: number, r: number, color: string, a: number) => void;

const sprites = new Map<string, HTMLCanvasElement>();
function sprite(key: string, size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
  let cv = sprites.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    const px = Math.ceil(size * 2);
    cv.width = cv.height = px;
    const c = cv.getContext('2d')!;
    c.translate(px / 2, px / 2);
    c.scale(2, 2);
    draw(c, size / 2);
    sprites.set(key, cv);
  }
  return cv;
}

/** Facet outline of a cut gem: a tall octagon (pointy top and bottom). */
const GEM: [number, number][] = [[0, -1.15], [.62, -.62], [.88, 0], [.62, .7], [0, 1.1], [-.62, .7], [-.88, 0], [-.62, -.62]];

function gemPath(c: CanvasRenderingContext2D, r: number): void {
  c.beginPath();
  GEM.forEach(([x, y], i) => (i ? c.lineTo(x * r, y * r) : c.moveTo(x * r, y * r)));
  c.closePath();
}

/** A cut crystal lit from the upper left: dark outline, alternating facets, a table highlight and a sparkle. */
function bakeCrystal(kind: CrystalKind, r: number): HTMLCanvasElement {
  const color = CRYSTAL_COLOR[kind];
  return sprite(`gem:${kind}:${r}`, r * 3.2, (c) => {
    gemPath(c, r);
    c.fillStyle = shade(color, .82); c.fill();
    c.lineWidth = 2.2; c.strokeStyle = shade(color, .9); c.stroke();
    // Facets: triangles from the centre to each edge, lit by their facing.
    for (let i = 0; i < GEM.length; i++) {
      const [ax, ay] = GEM[i], [bx, by] = GEM[(i + 1) % GEM.length];
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const lit = clamp(.5 - (mx * .55 + my * .8) * .55, 0, 1);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(ax * r, ay * r); c.lineTo(bx * r, by * r); c.closePath();
      c.fillStyle = lit > .5 ? shade(color, (lit - .5) * 1.4, '#ffffff') : shade(color, (.5 - lit) * 1.3);
      c.fill();
    }
    // Inner table.
    c.beginPath();
    GEM.forEach(([x, y], i) => (i ? c.lineTo(x * r * .45, y * r * .45) : c.moveTo(x * r * .45, y * r * .45)));
    c.closePath();
    const table = c.createLinearGradient(-r * .4, -r * .5, r * .4, r * .5);
    table.addColorStop(0, '#ffffff'); table.addColorStop(.5, shade(color, .15, '#ffffff')); table.addColorStop(1, shade(color, .3));
    c.fillStyle = table; c.globalAlpha = .75; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = '#ffffff70'; c.lineWidth = .8; c.stroke();
    c.strokeStyle = '#ffffff35'; c.lineWidth = .7;
    for (const [x, y] of GEM) { c.beginPath(); c.moveTo(x * r * .45, y * r * .45); c.lineTo(x * r, y * r); c.stroke(); }
    if (kind === 'armored') {
      // Bolted steel bands across the gem.
      c.save(); gemPath(c, r); c.clip();
      for (const y of [-.35, .35]) {
        const band = c.createLinearGradient(0, (y - .14) * r, 0, (y + .14) * r);
        band.addColorStop(0, '#e6eef8'); band.addColorStop(.5, '#5a6b82'); band.addColorStop(1, '#1b2433');
        c.fillStyle = band; c.fillRect(-r, (y - .13) * r, r * 2, r * .26);
        c.fillStyle = '#0b111b';
        for (const x of [-.5, 0, .5]) { arc(c, x * r, y * r, r * .06); c.fill(); }
      }
      c.restore();
    } else if (kind === 'bomb') {
      // A molten core and a fuse cap.
      const core = c.createRadialGradient(0, 0, 0, 0, 0, r * .5);
      core.addColorStop(0, '#fff3c4'); core.addColorStop(.4, '#ff9a3d'); core.addColorStop(1, '#ff9a3d00');
      c.fillStyle = core; arc(c, 0, 0, r * .55); c.fill();
      c.fillStyle = '#2a1206'; c.fillRect(-r * .18, -r * 1.35, r * .36, r * .3);
    } else if (kind === 'key') {
      // A keyhole.
      c.fillStyle = '#3a2600';
      arc(c, 0, -r * .12, r * .2); c.fill();
      c.beginPath(); c.moveTo(-r * .12, -r * .05); c.lineTo(r * .12, -r * .05); c.lineTo(r * .07, r * .38); c.lineTo(-r * .07, r * .38); c.closePath(); c.fill();
    }
  });
}

/** Siege block body: a bevelled, glossy tile tinted by strength. Numbers are drawn over it each frame. */
/** Block body: a bevelled, glossy tile (square in Siege, a brick in Rebound). Numbers are drawn over it each frame. */
function bakeBlock(color: string, hw: number, hh: number, bomb: boolean): HTMLCanvasElement {
  return sprite(`block:${color}:${hw}:${hh}:${bomb ? 1 : 0}`, hw * 2.6, (c) => {
    const s = Math.min(hw, hh), rr = s * .26;
    const rect = (inset: number) => {
      const ax = -hw + inset, bx = hw - inset, ay = -hh + inset, by = hh - inset, r = Math.max(1, rr - inset * .5);
      c.beginPath();
      c.moveTo(ax + r, ay); c.lineTo(bx - r, ay); c.quadraticCurveTo(bx, ay, bx, ay + r); c.lineTo(bx, by - r);
      c.quadraticCurveTo(bx, by, bx - r, by); c.lineTo(ax + r, by); c.quadraticCurveTo(ax, by, ax, by - r); c.lineTo(ax, ay + r);
      c.quadraticCurveTo(ax, ay, ax + r, ay); c.closePath();
    };
    rect(0); c.fillStyle = shade(color, .78); c.fill();
    const bevel = c.createLinearGradient(-hw, -hh, hw, hh);
    bevel.addColorStop(0, shade(color, .55, '#ffffff')); bevel.addColorStop(.45, color); bevel.addColorStop(1, shade(color, .55));
    rect(2); c.fillStyle = bevel; c.fill();
    const face = c.createLinearGradient(0, -hh, 0, hh);
    face.addColorStop(0, shade(color, .15, '#ffffff')); face.addColorStop(.5, shade(color, .25)); face.addColorStop(1, shade(color, .5));
    rect(s * .16); c.fillStyle = face; c.fill();
    // Inner glow and gloss.
    c.save(); rect(s * .16); c.clip();
    const glow = c.createRadialGradient(0, hh * .2, 0, 0, hh * .2, Math.max(hw, hh));
    glow.addColorStop(0, color + '90'); glow.addColorStop(1, color + '00');
    c.fillStyle = glow; c.fillRect(-hw, -hh, hw * 2, hh * 2);
    c.fillStyle = '#ffffff2a'; c.beginPath(); c.ellipse(-hw * .25, -hh * .62, hw * .75, hh * .26, -.12, 0, TAU); c.fill();
    c.restore();
    c.strokeStyle = '#00000066'; c.lineWidth = 1.2; rect(s * .16); c.stroke();
    if (bomb) {
      // Hazard chevrons in the corners.
      c.fillStyle = '#ffcf3a';
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        c.beginPath(); c.moveTo(sx * hw * .9, sy * hh * .45); c.lineTo(sx * hw * .9, sy * hh * .9); c.lineTo(sx * (hw - s * .45), sy * hh * .9); c.closePath(); c.fill();
      }
    }
  });
}

function drawWall(ctx: CanvasRenderingContext2D, s: Segment, accent: string): void {
  ctx.save(); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(s.ax + 4, s.ay + 6); ctx.lineTo(s.bx + 4, s.by + 6);
  ctx.strokeStyle = '#00000080'; ctx.lineWidth = 12; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by);
  ctx.strokeStyle = '#04090f'; ctx.lineWidth = 11; ctx.stroke();
  const len = Math.hypot(s.bx - s.ax, s.by - s.ay) || 1;
  const nx = -(s.by - s.ay) / len, ny = (s.bx - s.ax) / len;
  const mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2;
  const g = ctx.createLinearGradient(mx + nx * 5, my + ny * 5, mx - nx * 5, my - ny * 5);
  g.addColorStop(0, '#8fa8bb'); g.addColorStop(.4, '#2c3f51'); g.addColorStop(1, '#0d1824');
  ctx.strokeStyle = g; ctx.lineWidth = 8; ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = accent + '55'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.restore();
}

function drawGate(ctx: CanvasRenderingContext2D, s: Segment, time: number): void {
  ctx.save(); ctx.lineCap = 'round';
  const pulse = .6 + .4 * Math.sin(time * 5);
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by);
  ctx.strokeStyle = `rgba(255,209,102,${.18 * pulse})`; ctx.lineWidth = 14; ctx.stroke();
  ctx.strokeStyle = `rgba(255,209,102,${.55 + .3 * pulse})`; ctx.lineWidth = 3; ctx.stroke();
  // Energy dashes run along the gate.
  ctx.setLineDash([6, 8]); ctx.lineDashOffset = -time * 40;
  ctx.strokeStyle = '#fff6d8'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalCompositeOperation = 'source-over';
  for (const [x, y] of [[s.ax, s.ay], [s.bx, s.by]]) {
    arc(ctx, x, y, 6); ctx.fillStyle = '#1a1408'; ctx.fill();
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1.5; ctx.stroke();
    arc(ctx, x, y, 2.2); ctx.fillStyle = '#ffe9b0'; ctx.fill();
  }
  ctx.restore();
}

function drawCrystal(ctx: CanvasRenderingContext2D, tg: Target, time: number, light: Light): void {
  const kind = tg.kind as CrystalKind;
  const color = CRYSTAL_COLOR[kind];
  const pop = tg.age < .35 ? 0.4 + 0.6 * (1 - Math.pow(1 - tg.age / .35, 3)) : 1;
  const bob = Math.sin(time * 1.6 + tg.id) * 1.2;
  const r = tg.r * pop;
  contactShadow(ctx, tg.x + 4, tg.y + tg.r * .9, tg.r * 1.1, tg.r * .45, .5);
  light(tg.x, tg.y, tg.r * 3.2, color, .32 + tg.flash * .5);
  if (kind === 'bank') {
    // The bank ring: it glances off a direct hit.
    ctx.save();
    ctx.strokeStyle = color; ctx.globalAlpha = .55 + tg.flash * .45; ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]); ctx.lineDashOffset = -time * 12;
    arc(ctx, tg.x, tg.y + bob, tg.r + 6); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  const img = bakeCrystal(kind, tg.r);
  const size = img.width / 2;
  ctx.save();
  ctx.translate(tg.x, tg.y + bob);
  ctx.scale(pop, pop);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  if (tg.kind === 'armored' && tg.hp < tg.maxHp) {
    // Cracked armor.
    ctx.strokeStyle = '#0a0f18'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-r * .6, -r * .5); ctx.lineTo(-r * .1, -r * .05); ctx.lineTo(-r * .35, r * .3); ctx.lineTo(r * .1, r * .75); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * .1, -r * .05); ctx.lineTo(r * .45, -r * .3); ctx.stroke();
  }
  if (tg.flash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = tg.flash * .8;
    gemPath(ctx, tg.r); ctx.fillStyle = '#ffffff'; ctx.fill();
  }
  ctx.restore();
  // A slow glint sweeps each gem.
  const glint = (time * .45 + tg.id * .37) % 3;
  if (glint < .5) {
    const k = glint / .5;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.sin(k * Math.PI) * .9;
    const gx = tg.x - tg.r * .35, gy = tg.y + bob - tg.r * .55;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(gx, gy - 6); ctx.lineTo(gx + 1.3, gy); ctx.lineTo(gx, gy + 6); ctx.lineTo(gx - 1.3, gy); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(gx - 6, gy); ctx.lineTo(gx, gy + 1.3); ctx.lineTo(gx + 6, gy); ctx.lineTo(gx, gy - 1.3); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function drawBlock(ctx: CanvasRenderingContext2D, tg: Target, color: string, font: string, light: Light): void {
  const hh = tg.hh ?? tg.r;
  const pop = tg.age < .3 ? 0.55 + 0.45 * (1 - Math.pow(1 - Math.max(0, tg.age) / .3, 3)) : 1;
  const img = bakeBlock(color, tg.r, hh, tg.kind === 'bombBlock');
  const size = img.width / 2;
  light(tg.x, tg.y, Math.max(tg.r, hh) * 1.6, color, .12 + tg.flash * .35);
  ctx.save();
  ctx.translate(tg.x, tg.y);
  const squash = 1 + tg.flash * .06;
  ctx.scale(pop * squash, pop * (2 - squash));
  ctx.fillStyle = '#00000055'; ctx.fillRect(-tg.r + 4, -hh + 6, tg.r * 2, hh * 2);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  if (tg.flash > 0) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = tg.flash * .55;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-tg.r + 3, -hh + 3, tg.r * 2 - 6, hh * 2 - 6);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  // The hits left, big and centred.
  const txt = localizeDigits(String(Math.max(0, Math.ceil(tg.hp))));
  const fs = Math.min(hh * 1.2, txt.length >= 4 ? 17 : txt.length === 3 ? 21 : 25);
  ctx.font = `900 ${fs}px ${font}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 4; ctx.strokeStyle = shade(color, .82); ctx.lineJoin = 'round';
  ctx.strokeText(txt, 0, 1);
  ctx.fillStyle = '#ffffff'; ctx.fillText(txt, 0, 1);
  ctx.restore();
}

function drawPickup(ctx: CanvasRenderingContext2D, tg: Target, time: number, light: Light): void {
  const bob = Math.sin(time * 3 + tg.id) * 2;
  const x = tg.x, y = tg.y + bob;
  if (tg.kind === 'orb') {
    light(x, y, 30, '#7ef0d2', .45);
    const pulse = 1 + Math.sin(time * 5 + tg.id) * .12;
    ctx.save();
    ctx.strokeStyle = '#7ef0d2'; ctx.lineWidth = 2.5; arc(ctx, x, y, tg.r * pulse); ctx.stroke();
    ctx.globalAlpha = .35; ctx.lineWidth = 1; arc(ctx, x, y, tg.r * 1.55 * pulse); ctx.stroke(); ctx.globalAlpha = 1;
    const core = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, 7);
    core.addColorStop(0, '#ffffff'); core.addColorStop(1, '#7ef0d2');
    ctx.fillStyle = core; arc(ctx, x, y, 6); ctx.fill();
    ctx.fillStyle = '#062a22'; ctx.font = '900 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('+', x, y + .5);
    ctx.restore();
  } else if (tg.kind === 'coin') {
    light(x, y, 26, '#ffd166', .35);
    const sx = Math.abs(Math.cos(time * 2.4 + tg.id));
    ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(.15, sx), 1);
    const g = ctx.createLinearGradient(-10, -10, 10, 10);
    g.addColorStop(0, '#fff3b0'); g.addColorStop(.5, '#ffc23a'); g.addColorStop(1, '#a86a00');
    arc(ctx, 0, 0, 11); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#6a4200'; ctx.lineWidth = 1.5; ctx.stroke();
    arc(ctx, 0, 0, 7); ctx.strokeStyle = '#fff3b0aa'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  } else {
    const horizontal = tg.kind === 'laserH';
    light(x, y, 30, '#ff5df0', .4 + tg.flash * .5);
    ctx.save(); ctx.translate(x, y); if (!horizontal) ctx.rotate(Math.PI / 2);
    // Faint guide along the line it will strike.
    ctx.globalAlpha = .18 + tg.flash * .5; ctx.strokeStyle = '#ff5df0'; ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.moveTo(-W, 0); ctx.lineTo(W, 0); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    arc(ctx, 0, 0, 13); ctx.fillStyle = '#1a0620'; ctx.fill();
    ctx.strokeStyle = '#ff5df0'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffd6fb';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 9, 0); ctx.lineTo(s * 3, -5); ctx.lineTo(s * 3, 5); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
}

/** Stage walls, gates and every target; drawn after the obstacles and before the balls. */
export function drawArcadeBoard(ctx: CanvasRenderingContext2D, a: Arcade, accent: string, time: number, font: string, light: Light): void {
  for (const s of a.walls) drawWall(ctx, s, accent);
  for (const g of a.gates) drawGate(ctx, g, time);
  const turn = a instanceof SiegeRun ? a.turn : 1;
  if (a instanceof SiegeRun) {
    // The breach row: a warning band that brightens as the wall closes in.
    const lowest = a.lowestRow();
    const danger = clamp((lowest - (SIEGE.rows - 4)) / 3, 0, 1);
    if (danger > 0) {
      const g = ctx.createLinearGradient(0, DEFENSE_Y - 90, 0, DEFENSE_Y);
      g.addColorStop(0, 'rgba(255,59,59,0)');
      g.addColorStop(1, `rgba(255,59,59,${.12 + danger * .25 * (.7 + .3 * Math.sin(time * 6))})`);
      ctx.fillStyle = g; ctx.fillRect(0, DEFENSE_Y - 90, W, 90);
    }
  }
  for (const tg of a.targets) {
    if (!tg.alive) continue;
    if (isPickup(tg.kind)) drawPickup(ctx, tg, time, light);
    else if (tg.shape === 'block') drawBlock(ctx, tg, a instanceof ReboundRun ? reboundColor(tg.maxHp) : blockColor(tg.maxHp, turn), font, light);
    else drawCrystal(ctx, tg, time, light);
  }
}

/** Bounce pips orbiting a Trickshot ball: how many bounces this shot has left. */
export function drawBouncePips(ctx: CanvasRenderingContext2D, a: Arcade, x: number, y: number, r: number, bounces: number, time: number): void {
  if (!(a instanceof TrickshotRun)) return;
  const left = Math.max(0, a.stage.bounces - bounces);
  ctx.save();
  for (let i = 0; i < a.stage.bounces; i++) {
    const ang = time * 3 + (i / a.stage.bounces) * TAU;
    const px = x + Math.cos(ang) * (r + 7), py = y + Math.sin(ang) * (r + 7);
    arc(ctx, px, py, 2.2);
    ctx.fillStyle = i < left ? '#eafffa' : '#ffffff30';
    ctx.fill();
  }
  ctx.restore();
}

const CAPSULE_GLYPH: Record<CapsuleKind, string> = { multi: '3', wide: '\u2194', fire: '\u2739', slow: '\u25d4', life: '\u2665' };

/** Rebound: the paddle (with the docked ball), falling capsules and the active effects' timers. */
export function drawRebound(ctx: CanvasRenderingContext2D, a: ReboundRun, ballR: number, time: number, font: string, light: Light): void {
  const p = a.paddle;
  const y = REBOUND.paddleY;
  const fire = a.effects.fire > 0;
  const col = fire ? '#ff8a3d' : a.effects.wide > 0 ? '#6ad1ff' : '#7ef0d2';
  // Light pooled under the paddle and a trailing smear from its speed.
  light(p.x, y + 4, p.w * .7, col, .3 + p.flash * .4);
  const lean = clamp(p.vx / 3000, -.25, .25);
  ctx.save();
  ctx.translate(p.x, y);
  contactShadow(ctx, 4, 16, p.w * .55, 7, .55);
  const hw = p.w / 2, h = 13;
  const body = ctx.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, '#d8f2ff'); body.addColorStop(.25, '#5f7f96'); body.addColorStop(.6, '#17283a'); body.addColorStop(1, '#0a1420');
  ctx.beginPath();
  ctx.moveTo(-hw + 7, 0); ctx.lineTo(hw - 7, 0); ctx.quadraticCurveTo(hw, 0, hw, 6); ctx.lineTo(hw - 5, h); ctx.lineTo(-hw + 5, h); ctx.lineTo(-hw, 6); ctx.quadraticCurveTo(-hw, 0, -hw + 7, 0);
  ctx.closePath(); ctx.fillStyle = body; ctx.fill();
  ctx.strokeStyle = '#02060c'; ctx.lineWidth = 1.2; ctx.stroke();
  // Emissive strip along the striking face; it flares on contact.
  ctx.globalCompositeOperation = 'lighter';
  const strip = ctx.createLinearGradient(-hw, 0, hw, 0);
  strip.addColorStop(0, col + '00'); strip.addColorStop(.5 + lean, col); strip.addColorStop(1, col + '00');
  ctx.fillStyle = strip; ctx.fillRect(-hw + 4, 1, p.w - 8, 3 + p.flash * 2);
  ctx.fillStyle = `rgba(255,255,255,${.35 + p.flash * .5})`; ctx.fillRect(-hw * .5, 1.5, hw, 1);
  // Edge emitters show where the steep returns are.
  for (const s of [-1, 1]) { ctx.fillStyle = col; ctx.fillRect(s * (hw - 9) - 2, 5, 4, 4); }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  // The docked ball, breathing on the paddle until launch.
  if (a.docked) {
    const by = y - ballR - 1 - Math.abs(Math.sin(time * 4)) * 3;
    light(p.x, by, 22, '#ffffff', .4);
    const g = ctx.createRadialGradient(p.x - 3, by - 3, 1, p.x, by, ballR);
    g.addColorStop(0, '#ffffff'); g.addColorStop(.5, '#cfe9ff'); g.addColorStop(1, '#5a86a8');
    ctx.beginPath(); ctx.arc(p.x, by, ballR, 0, TAU); ctx.fillStyle = g; ctx.fill();
  }
  // Capsules: spinning pills with their glyph.
  for (const c of a.capsules) {
    const cc = CAPSULE_COLOR[c.kind];
    light(c.x, c.y, 26, cc, .45);
    ctx.save(); ctx.translate(c.x, c.y);
    const sx = .75 + .25 * Math.cos(time * 5 + c.x);
    ctx.scale(sx, 1);
    ctx.beginPath(); ctx.moveTo(-14, -8); ctx.lineTo(14, -8); ctx.arc(14, 0, 8, -Math.PI / 2, Math.PI / 2); ctx.lineTo(-14, 8); ctx.arc(-14, 0, 8, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
    const pill = ctx.createLinearGradient(0, -8, 0, 8);
    pill.addColorStop(0, shade(cc, .3, '#ffffff')); pill.addColorStop(.5, cc); pill.addColorStop(1, shade(cc, .5));
    ctx.fillStyle = pill; ctx.fill();
    ctx.strokeStyle = shade(cc, .7); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#0b1220'; ctx.font = `900 12px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(CAPSULE_GLYPH[c.kind], 0, 1);
    ctx.restore();
  }
}
