import { TAU } from '../core/math';
import type { EnemyDef, EnemyShape } from '../data/types';

export function enemyShape(ctx: CanvasRenderingContext2D, shape: EnemyShape, x: number, y: number, r: number, rot = 0): void {
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
    case 'pentagon': poly(5, -Math.PI / 2, r * 1.08); break;
    case 'gear': {
      const teeth = 8;
      for (let i = 0; i < teeth * 2; i++) {
        const a = rot + (i / (teeth * 2)) * TAU;
        const rr = i % 2 === 0 ? r * 1.1 : r * 0.82;
        const a2 = a + TAU / (teeth * 2);
        if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        ctx.lineTo(x + Math.cos(a2) * rr, y + Math.sin(a2) * rr);
      }
      ctx.closePath();
      break;
    }
    case 'spike': {
      for (let i = 0; i < 16; i++) {
        const a = rot + (i / 16) * TAU;
        const rr = i % 2 === 0 ? r * 1.25 : r * 0.7;
        if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      break;
    }
    case 'egg':
      ctx.ellipse(x, y, r * 0.86, r * 1.08, 0, 0, TAU);
      break;
    case 'crescent':
      ctx.arc(x, y, r, Math.PI * 0.25, Math.PI * 1.75);
      ctx.arc(x + r * 0.45, y, r * 0.72, Math.PI * 1.62, Math.PI * 0.38, true);
      ctx.closePath();
      break;
    case 'skull':
      ctx.arc(x, y - r * 0.12, r, Math.PI * 0.82, Math.PI * 2.18);
      ctx.lineTo(x + r * 0.55, y + r * 0.95);
      ctx.lineTo(x - r * 0.55, y + r * 0.95);
      ctx.closePath();
      break;
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

const RESOLUTION = 192;
const SCALE = 68;
const shells = new Map<string, HTMLCanvasElement>();
const insignias = new Map<string, HTMLCanvasElement>();

/** Bosses fill a third of the screen, so their art is baked at twice the density. */
function artCanvas(boss = false): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = boss ? RESOLUTION * 2 : 256;
  const k = canvas.width / RESOLUTION;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(SCALE * k, SCALE * k);
  return [canvas, ctx];
}

function polygon(ctx: CanvasRenderingContext2D, points: readonly number[]): void {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
}

/** Linear blend of a #rrggbb color toward another (black by default). */
export function shade(color: string, t: number, to = '#000000'): string {
  if (color.length < 7 || color[0] !== '#') return color;
  const pa = parseInt(color.slice(1, 7), 16), pb = parseInt(to.slice(1, 7), 16);
  const ch = (k: number) => Math.round(((pa >> k) & 255) * (1 - t) + ((pb >> k) & 255) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

/** Relative luminance of a #rrggbb color, 0..1. */
function luma(color: string): number {
  const v = parseInt(color.slice(1, 7), 16);
  return (((v >> 16) & 255) * .299 + ((v >> 8) & 255) * .587 + (v & 255) * .114) / 255;
}

function bakeShell(def: EnemyDef): HTMLCanvasElement {
  const [canvas, ctx] = artCanvas(def.boss);
  const { shape, material } = def;
  // Pale armor is exposed down a stop so it keeps form under the bloom.
  const l = luma(def.color);
  const color = l > .7 ? shade(def.color, (l - .7) * 1.6) : def.color;
  const dark = shade(color, .7), deep = shade(color, .86), light = shade(color, .45, '#ffffff');
  ctx.lineJoin = 'round';
  // Extruded side wall: the shell has real thickness under the key light.
  for (let i = 4; i >= 1; i--) {
    enemyShape(ctx, shape, i * .012, i * .042, 1);
    ctx.fillStyle = i === 4 ? '#010309' : shade(color, .78 + i * .04); ctx.fill();
  }
  enemyShape(ctx, shape, .048, .168, 1);
  ctx.strokeStyle = '#010309'; ctx.lineWidth = .09; ctx.stroke();
  // Armor bevel, lit from the upper left.
  const bevel = ctx.createLinearGradient(-.6, -1, .6, 1);
  bevel.addColorStop(0, '#ffffff'); bevel.addColorStop(.18, light); bevel.addColorStop(.45, color);
  bevel.addColorStop(.75, dark); bevel.addColorStop(1, deep);
  enemyShape(ctx, shape, 0, 0, 1);
  ctx.fillStyle = bevel; ctx.fill();
  ctx.strokeStyle = '#02040a'; ctx.lineWidth = .05; ctx.stroke();

  // Recessed face plate.
  enemyShape(ctx, shape, .015, .035, .8);
  ctx.fillStyle = '#00000090'; ctx.fill();
  const face = ctx.createRadialGradient(-.3, -.55, .05, 0, .05, 1.05);
  face.addColorStop(0, shade(color, .22)); face.addColorStop(.45, shade(color, .6)); face.addColorStop(1, shade(color, .9));
  enemyShape(ctx, shape, 0, 0, .78);
  ctx.fillStyle = face; ctx.fill();
  // Inner bevel: the upper lip shadows the plate, the lower lip catches light.
  ctx.save(); enemyShape(ctx, shape, 0, 0, .78); ctx.clip();
  enemyShape(ctx, shape, .025, .06, .8); ctx.strokeStyle = '#00000090'; ctx.lineWidth = .08; ctx.stroke();
  ctx.restore();
  enemyShape(ctx, shape, 0, 0, .785);
  ctx.strokeStyle = light + '60'; ctx.lineWidth = .02; ctx.stroke();

  ctx.save();
  enemyShape(ctx, shape, 0, 0, .77); ctx.clip();
  if (material === 'metal' || material === 'stone') {
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(side, 1);
      polygon(ctx, [.27, -.9, .95, -.56, .77, .64, .51, .9, .39, .45, .57, -.16]);
      const plate = ctx.createLinearGradient(.3 * side, -.9, .8 * side, .8);
      plate.addColorStop(0, light + '90'); plate.addColorStop(.5, color + '48'); plate.addColorStop(1, deep + 'c0');
      ctx.fillStyle = plate; ctx.fill(); ctx.strokeStyle = '#00000090'; ctx.lineWidth = .03; ctx.stroke();
      polygon(ctx, [.37, -.57, .65, -.7, .58, -.29, .36, -.16]);
      ctx.fillStyle = side < 0 ? '#ffffff48' : '#ffffff20'; ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = '#02050bd0'; ctx.fillRect(.51, i * .115 + .17, .19, .06);
        ctx.fillStyle = color; ctx.fillRect(.53, i * .115 + .2, .15, .022);
      }
      for (const [rx, ry] of [[.62, .58], [.47, -.42]]) {
        ctx.beginPath(); ctx.arc(rx, ry, .036, 0, TAU); ctx.fillStyle = '#000000a0'; ctx.fill();
        ctx.beginPath(); ctx.arc(rx - .008 * side, ry - .01, .022, 0, TAU); ctx.fillStyle = '#ffffff70'; ctx.fill();
      }
      ctx.restore();
    }
    if (material === 'stone') {
      ctx.lineWidth = .03;
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(side * .78, -.42); ctx.lineTo(side * .45, -.28);
        ctx.lineTo(side * .52, -.05); ctx.lineTo(side * .19, .17); ctx.lineTo(side * .29, .78);
        ctx.strokeStyle = '#000000b0'; ctx.stroke();
        ctx.save(); ctx.translate(.015, .022); ctx.strokeStyle = light + '48'; ctx.stroke(); ctx.restore();
      }
    }
  } else if (material === 'crystal') {
    const shards = [[-.14, -.92, -.85, -.32, .3, .12], [.69, -.81, .32, .73, .02, -.3], [-.8, .38, .1, .87, -.07, -.1]];
    shards.forEach((points, i) => {
      polygon(ctx, points);
      const facet = ctx.createLinearGradient(points[0], points[1], points[4], points[5]);
      facet.addColorStop(0, i === 1 ? '#ffffffa8' : light + 'a0'); facet.addColorStop(1, color + '18');
      ctx.fillStyle = facet; ctx.fill();
      ctx.strokeStyle = '#f4ffffb0'; ctx.lineWidth = .02; ctx.stroke();
    });
    // Refracted inner light.
    const inner = ctx.createRadialGradient(0, .05, 0, 0, .05, .6);
    inner.addColorStop(0, '#ffffff70'); inner.addColorStop(.4, color + '40'); inner.addColorStop(1, color + '00');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = inner; ctx.fillRect(-1, -1, 2, 2);
    ctx.globalCompositeOperation = 'source-over';
  } else if (material === 'energy') {
    const plasma = ctx.createRadialGradient(0, 0, 0, 0, 0, .8);
    plasma.addColorStop(0, '#ffffffa0'); plasma.addColorStop(.3, color + 'a0'); plasma.addColorStop(1, color + '00');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = plasma; ctx.fillRect(-1, -1, 2, 2);
    ctx.lineWidth = .04;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = i === 0 ? '#ffffffb0' : color + 'a0';
      ctx.beginPath(); ctx.ellipse(0, 0, .94, .28 + i * .07, i * TAU / 3 - .4, 0, TAU); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  } else {
    // Flesh: membrane folds and glowing capillaries.
    for (let i = 0; i < 7; i++) {
      ctx.save(); ctx.rotate(i * TAU / 7);
      ctx.beginPath(); ctx.ellipse(.57, .015, .36, .09, -.42, 0, TAU);
      ctx.fillStyle = '#00000040'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(.555, -.01, .32, .05, -.42, 0, TAU);
      ctx.fillStyle = light + '30'; ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = color + '60'; ctx.lineWidth = .022;
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5 + .3;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * .2, Math.sin(a) * .2);
      ctx.quadraticCurveTo(Math.cos(a + .5) * .5, Math.sin(a + .5) * .5, Math.cos(a + .2) * .8, Math.sin(a + .2) * .8);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // Ambient occlusion toward the lower right of the face.
  const occlusion = ctx.createLinearGradient(-.4, -.8, .5, .9);
  occlusion.addColorStop(0, '#ffffff18'); occlusion.addColorStop(.5, '#ffffff00'); occlusion.addColorStop(1, '#00000070');
  ctx.fillStyle = occlusion; ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
  // Specular glint on the armor and a lit rim on its upper edge.
  ctx.save();
  enemyShape(ctx, shape, 0, 0, 1); ctx.clip();
  const glint = ctx.createRadialGradient(-.45, -.62, 0, -.45, -.62, .5);
  glint.addColorStop(0, '#ffffff90'); glint.addColorStop(1, '#ffffff00');
  ctx.fillStyle = glint; ctx.fillRect(-1.2, -1.2, 1.4, 1.4);
  enemyShape(ctx, shape, .04, .06, 1);
  ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = .28; ctx.lineWidth = .05; ctx.stroke();
  // Cool bounce light from the arena wraps the shadowed lower-right edge: warm key, cold rim.
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  enemyShape(ctx, shape, -.07, -.09, 1);
  ctx.strokeStyle = '#6fc8ff58'; ctx.lineWidth = .16; ctx.stroke();
  enemyShape(ctx, shape, -.035, -.045, 1);
  ctx.strokeStyle = '#bfeaff70'; ctx.lineWidth = .04; ctx.stroke();
  ctx.restore();
  return canvas;
}

export function drawEnemyShell(ctx: CanvasRenderingContext2D, def: EnemyDef, x: number, y: number, r: number, rotation: number): void {
  let shell = shells.get(def.id);
  if (!shell) { shell = bakeShell(def); shells.set(def.id, shell); }
  const half = RESOLUTION / (2 * SCALE) * r;
  if (rotation) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
    ctx.drawImage(shell, -half, -half, half * 2, half * 2); ctx.restore();
  } else ctx.drawImage(shell, x - half, y - half, half * 2, half * 2);
}

// Glyphs identify the enemies that change how a shot plays, at the same size as their faces.
const symbols: Record<string, string> = {
  healer: 'M-.28 0H.28M0-.28V.28',
  golden: 'M0-.31.23 0 0 .31-.23 0Z',
  shielder: 'M-.25-.16 0-.25.25-.16V.04L0 .28-.25.04Z',
  warden: 'M-.24-.24H.24L-.24.24H.24Z',
  charger: 'M-.28-.16 0 .06.28-.16M-.28.01 0 .23.28.01',
  aegis: 'M-.24-.15 0-.28.24-.15V.15L0 .28-.24.15Z',
  pulsar: 'M-.32.05H-.17L-.07-.19.06.22.17-.06H.32',
  pylon: 'M0-.32.18 0 0 .32-.18 0ZM-.32 0H.32',
  bomber: 'M0-.3.29.23H-.29ZM0-.12V.04M0 .14V.16',
  splitter: 'M0-.25V-.04L-.23.18M0-.04.23.18',
  reflector: 'M-.25.14.14-.25M-.12.23.25-.14',
  boss_fortress: 'M-.51-.16H-.33V-.36H-.15V-.16H.15V-.36H.33V-.16H.51V.09L.27.4H-.27L-.51.09ZM-.28.04H.28M-.17.18H.17',
  boss_magnetar: 'M-.53.17C-.25-.52.54-.58.53-.23S.22.52-.21.46-.55.25-.53.17ZM-.4-.18C-.08.13.09.29.42.33',
  boss_hydra: 'M-.52-.26-.27-.17-.21.06 0 .35.21.06.27-.17.52-.26M0 .29V-.12L0-.38M-.47-.34-.28-.26M.47-.34.28-.26',
  boss_broodmother: 'M0-.51C.31-.24.46.03.19.37S-.39.27-.34-.04C-.31-.18-.19-.39 0-.51ZM-.26.05.23-.15M-.14.3.29.04',
  boss_chronarch: 'M0-.49A.49.49 0 1 1 0 .49.49.49 0 1 1 0-.49ZM0-.38V-.3M-.38 0H-.3M.38 0H.3M0 .38V.3',
  boss_architect: 'M0-.47.47.31H-.47ZM0-.27.25.16H-.25ZM-.45-.07H.45',
  boss_colossus: 'M-.52.31-.31-.17-.16-.02 0-.39.45.31ZM-.15-.01.02.11.11.02.36.27',
  boss_sol: 'M0-.34A.34.34 0 1 1 0 .34.34.34 0 1 1 0-.34ZM0-.54V-.42M0 .54V.42M-.54 0H-.42M.54 0H.42M-.4-.4-.3-.3M-.4.4-.3.3M.4-.4.3-.3M.4.4.3.3',
  boss_luna: 'M.11-.38C-.56-.42-.62.38.09.41L-.14.15-.16-.12Z',
  boss_overmind: 'M-.5 0Q0-.62.5 0 0 .62-.5 0ZM0-.21A.21.21 0 1 1 0 .21.21.21 0 1 1 0-.21Z',
  boss_sovereign: 'M-.43.19-.56-.19-.27-.05 0-.45.27-.05.56-.19.43.19ZM-.31.33H.31M0-.16.125.03 0 .18-.125.03Z',
};

function bakeInsignia(def: EnemyDef, blink: boolean): HTMLCanvasElement {
  const [canvas, ctx] = artCanvas(def.boss);
  const tint = luma(def.color) > .7 ? shade(def.color, .28) : def.color;
  const symbol = symbols[def.id] ?? symbols[def.ai];
  if (def.shape === 'crescent') ctx.translate(-.23, 0);
  if (def.ai === 'runner' || def.shape === 'triangle') ctx.translate(0, -.08);
  if (def.boss) ctx.scale(.91, .91);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // Boss glyphs are large already; a tighter glow keeps them from blooming into a blob.
  const bloom = canvas.width * (def.boss ? .025 : .05);
  if (symbol) {
    const shape = new Path2D(symbol);
    ctx.strokeStyle = '#030811'; ctx.lineWidth = .24; ctx.stroke(shape);
    // Engraved glyphs glow from within.
    ctx.shadowColor = tint; ctx.shadowBlur = bloom;
    ctx.strokeStyle = tint; ctx.lineWidth = .13; ctx.stroke(shape);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = def.boss ? '#ffffffb0' : '#ffffff'; ctx.lineWidth = def.boss ? .032 : .046; ctx.stroke(shape);
  } else if (def.ai !== 'egg') {
    // A dark visor slit with emissive eyes.
    polygon(ctx, [-.53, -.13, -.32, -.24, 0, -.13, .32, -.24, .53, -.13, .33, .19, -.33, .19]);
    const visor = ctx.createLinearGradient(0, -.24, 0, .19);
    visor.addColorStop(0, '#000000'); visor.addColorStop(1, '#0a1424');
    ctx.fillStyle = visor; ctx.fill();
    ctx.strokeStyle = tint + 'b0'; ctx.lineWidth = .036; ctx.stroke();
    const eyes = blink ? .034 : .18;
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(side, 1);
      polygon(ctx, [.09, .022, .37, -.075, .31, eyes, .11, eyes]);
      ctx.shadowColor = tint; ctx.shadowBlur = bloom * 1.3;
      ctx.fillStyle = tint; ctx.fill();
      ctx.shadowBlur = 0;
      const hot = ctx.createLinearGradient(0, -.06, 0, eyes);
      hot.addColorStop(0, '#ffffffe0'); hot.addColorStop(1, '#ffffff00');
      ctx.fillStyle = hot; ctx.fill();
      ctx.strokeStyle = '#f4ffff'; ctx.lineWidth = .016; ctx.stroke(); ctx.restore();
    }
    // Visor glass reflection.
    ctx.fillStyle = '#ffffff1c';
    polygon(ctx, [-.5, -.13, -.32, -.22, 0, -.12, .32, -.22, .5, -.13, .3, -.08, -.3, -.08]); ctx.fill();
  }
  return canvas;
}

export function drawEnemyInsignia(ctx: CanvasRenderingContext2D, def: EnemyDef, x: number, y: number, r: number, blink: boolean): void {
  if (def.ai === 'egg') return;
  const key = blink ? `${def.id}:blink` : def.id;
  let art = insignias.get(key);
  if (!art) { art = bakeInsignia(def, blink); insignias.set(key, art); }
  const half = RESOLUTION / (2 * SCALE) * r;
  ctx.drawImage(art, x - half, y - half, half * 2, half * 2);
}

const shadowArt = new Map<string, HTMLCanvasElement>();
const SHADOW_RES = 96;
/** Shadow sprites span 3 radii, leaving room for the blur penumbra. */
const SHADOW_SPAN = 3;

/**
 * A soft shadow in the enemy's own silhouette, baked once per type. The blur comes from the
 * canvas shadow itself: the shape is drawn off-canvas and only its shadow lands in frame.
 */
function bakeShadow(def: EnemyDef): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SHADOW_RES;
  const ctx = canvas.getContext('2d')!;
  const unit = SHADOW_RES / (SHADOW_SPAN * 2);
  ctx.setTransform(unit, 0, 0, unit, SHADOW_RES / 2 - SHADOW_RES * 2, SHADOW_RES / 2);
  ctx.shadowColor = 'rgba(0,0,0,1)';
  ctx.shadowBlur = unit * .55;
  ctx.shadowOffsetX = SHADOW_RES * 2;
  enemyShape(ctx, def.shape, 0, 0, 1.02);
  ctx.fillStyle = '#000';
  ctx.fill();
  return canvas;
}

/** Draws the silhouette shadow `lift` units below and right of the body. */
export function drawEnemyShadow(ctx: CanvasRenderingContext2D, def: EnemyDef, x: number, y: number, r: number,
  rotation: number, lift: number, alpha: number): void {
  let art = shadowArt.get(def.id);
  if (!art) { art = bakeShadow(def); shadowArt.set(def.id, art); }
  const half = r * SHADOW_SPAN;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + lift * .55, y + lift);
  if (rotation) ctx.rotate(rotation);
  ctx.drawImage(art, -half, -half, half * 2, half * 2);
  ctx.restore();
}

/**
 * Where the pupils of a visored enemy sit, in units of its radius, or null when its face is a
 * glyph. Mirrors the offsets `bakeInsignia` applies.
 */
export function eyeAnchor(def: EnemyDef): { x: number; y: number; spread: number } | null {
  if (def.ai === 'egg' || symbols[def.id] || symbols[def.ai]) return null;
  let x = 0, y = .065;
  if (def.shape === 'crescent') x -= .23;
  if (def.ai === 'runner' || def.shape === 'triangle') y -= .08;
  return { x, y, spread: .22 };
}
