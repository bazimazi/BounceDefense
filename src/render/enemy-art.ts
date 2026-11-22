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

function artCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = RESOLUTION;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(RESOLUTION / 2, RESOLUTION / 2);
  ctx.scale(SCALE, SCALE);
  return [canvas, ctx];
}

function polygon(ctx: CanvasRenderingContext2D, points: readonly number[]): void {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
}

function bakeShell(def: EnemyDef): HTMLCanvasElement {
  const [canvas, ctx] = artCanvas();
  const { shape, color, material } = def;
  ctx.lineJoin = 'round';
  // Preserve each silhouette, with a deep extrusion under the lit surface.
  enemyShape(ctx, shape, 0, .18, 1.02);
  ctx.fillStyle = '#02050c'; ctx.fill();
  ctx.strokeStyle = '#03050bf0'; ctx.lineWidth = .12; ctx.stroke();
  const bevel = ctx.createLinearGradient(-.7, -.9, .52, .93);
  bevel.addColorStop(0, '#f6ffff'); bevel.addColorStop(.28, color);
  bevel.addColorStop(.56, color + 'b0'); bevel.addColorStop(.83, '#101928'); bevel.addColorStop(1, color + 'c0');
  enemyShape(ctx, shape, 0, 0, 1);
  ctx.fillStyle = '#101724'; ctx.fill(); ctx.fillStyle = bevel; ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = .032; ctx.stroke();

  const face = ctx.createRadialGradient(-.32, -.65, .05, 0, .01, 1.04);
  face.addColorStop(0, color + 'b8'); face.addColorStop(.54, '#182435'); face.addColorStop(1, '#080d18');
  enemyShape(ctx, shape, 0, 0, .8);
  ctx.fillStyle = '#0a0f1b'; ctx.fill(); ctx.fillStyle = face; ctx.fill();
  ctx.strokeStyle = '#050b17'; ctx.lineWidth = .038; ctx.stroke();

  ctx.save();
  enemyShape(ctx, shape, 0, 0, .79); ctx.clip();
  if (material === 'metal' || material === 'stone') {
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(side, 1);
      polygon(ctx, [.27, -.9, .95, -.56, .77, .64, .51, .9, .39, .45, .57, -.16]);
      ctx.fillStyle = color + '54'; ctx.fill(); ctx.strokeStyle = color + '70'; ctx.lineWidth = .025; ctx.stroke();
      polygon(ctx, [.37, -.57, .65, -.7, .58, -.29, .36, -.16]);
      ctx.fillStyle = '#efffff56'; ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = '#060b14bd'; ctx.fillRect(.51, i * .115 + .17, .19, .055);
        ctx.fillStyle = color + 'cc'; ctx.fillRect(.52, i * .115 + .22, .17, .021);
      }
      ctx.restore();
    }
    if (material === 'stone') {
      ctx.strokeStyle = color + '90'; ctx.lineWidth = .027;
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(side * .78, -.42); ctx.lineTo(side * .45, -.28);
        ctx.lineTo(side * .52, -.05); ctx.lineTo(side * .19, .17); ctx.lineTo(side * .29, .78); ctx.stroke();
      }
    }
  } else if (material === 'crystal') {
    const shards = [[-.14, -.92, -.85, -.32, .3, .12], [.69, -.81, .32, .73, .02, -.3], [-.8, .38, .1, .87, -.07, -.1]];
    shards.forEach((points, i) => {
      polygon(ctx, points);
      ctx.fillStyle = i === 1 ? '#f1ffff60' : color + '70'; ctx.fill();
      ctx.strokeStyle = '#e9ffff8a'; ctx.lineWidth = .023; ctx.stroke();
    });
  } else if (material === 'energy') {
    ctx.lineWidth = .036;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = i === 0 ? '#f4ffffa0' : color + '88';
      ctx.beginPath(); ctx.ellipse(0, 0, .94, .28 + i * .07, i * TAU / 3 - .4, 0, TAU); ctx.stroke();
    }
  } else {
    for (let i = 0; i < 7; i++) {
      ctx.save(); ctx.rotate(i * TAU / 7);
      ctx.beginPath(); ctx.ellipse(.57, 0, .36, .087, -.42, 0, TAU);
      ctx.fillStyle = color + '30'; ctx.fill();
      ctx.strokeStyle = color + '68'; ctx.lineWidth = .03; ctx.stroke();
      ctx.restore();
    }
  }
  const sheen = ctx.createLinearGradient(0, -.8, .38, .55);
  sheen.addColorStop(0, '#f4ffff42'); sheen.addColorStop(.55, '#ffffff00'); sheen.addColorStop(1, '#03081148');
  ctx.fillStyle = sheen; ctx.fillRect(-1, -1, 2, 2);
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
  const [canvas, ctx] = artCanvas();
  const symbol = symbols[def.id] ?? symbols[def.ai];
  if (def.shape === 'crescent') ctx.translate(-.23, 0);
  if (def.ai === 'runner' || def.shape === 'triangle') ctx.translate(0, -.08);
  if (def.boss) ctx.scale(.91, .91);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (symbol) {
    const shape = new Path2D(symbol);
    ctx.strokeStyle = '#030811'; ctx.lineWidth = .22; ctx.stroke(shape);
    ctx.strokeStyle = def.color; ctx.lineWidth = .129; ctx.stroke(shape);
    ctx.strokeStyle = '#ecffff'; ctx.lineWidth = .042; ctx.stroke(shape);
  } else if (def.ai !== 'egg') {
    polygon(ctx, [-.53, -.13, -.32, -.24, 0, -.13, .32, -.24, .53, -.13, .33, .19, -.33, .19]);
    ctx.fillStyle = '#050c18'; ctx.fill();
    ctx.strokeStyle = def.color + 'b0'; ctx.lineWidth = .038; ctx.stroke();
    const eyes = blink ? .034 : .18;
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(side, 1);
      polygon(ctx, [.09, .022, .37, -.075, .31, eyes, .11, eyes]);
      ctx.fillStyle = def.color; ctx.fill();
      ctx.strokeStyle = '#e9ffff'; ctx.lineWidth = .02; ctx.stroke(); ctx.restore();
    }
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
