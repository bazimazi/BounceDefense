import { TAU } from '../core/math';
import { DEFENSE_Y, FIELD_TOP, FLOOR_Y, H, LAUNCHER_X, LAUNCHER_Y, W } from '../sim/types';
import type { ArenaDef } from '../data/types';
import { drawScenery } from './scenery';

/** Deterministic hash noise, so every bake of an arena is identical. */
function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

let grain: HTMLCanvasElement | null = null;
/** A tileable film of fine grain: brushed metal at a glance, never a flat fill. */
function grainTile(): HTMLCanvasElement {
  if (grain) return grain;
  grain = document.createElement('canvas');
  grain.width = grain.height = 128;
  const g = grain.getContext('2d')!;
  const img = g.createImageData(128, 128);
  const r = rand(91);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r();
    const light = v > .5;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = light ? 255 : 0;
    img.data[i + 3] = Math.round(Math.abs(v - .5) * (light ? 22 : 40));
  }
  g.putImageData(img, 0, 0);
  return grain;
}

interface Floor { tone: string; seam: string; glow: string; glowA: number; cols: number; rows: number }

function floorStyle(arena: ArenaDef): Floor {
  const { accent, wall } = arena.theme;
  switch (arena.id) {
    case 'foundry': return { tone: '#2a160c', seam: '#060302', glow: '#ff7a2a', glowA: .2, cols: 3, rows: 6 };
    case 'rift': return { tone: '#120a24', seam: '#030108', glow: '#b06bff', glowA: .2, cols: 4, rows: 7 };
    case 'blight': return { tone: '#10200c', seam: '#030803', glow: '#8fdc4a', glowA: .12, cols: 4, rows: 6 };
    case 'spire': return { tone: '#2a1f0b', seam: '#0b0703', glow: '#ffd27a', glowA: .14, cols: 3, rows: 6 };
    case 'citadel': return { tone: '#161c28', seam: '#05070c', glow: accent, glowA: .07, cols: 5, rows: 9 };
    default: return { tone: '#0f2431', seam: '#03080d', glow: wall, glowA: .12, cols: 4, rows: 6 };
  }
}

/** Beveled deck plates: lit top-left edges, shadowed bottom-right, recessed seams and bolts. */
function drawPlates(ctx: CanvasRenderingContext2D, arena: ArenaDef): void {
  const f = floorStyle(arena);
  const r = rand(arena.id.length * 977 + arena.id.charCodeAt(0));
  const x0 = 0, y0 = FIELD_TOP, fw = W, fh = DEFENSE_Y - FIELD_TOP;
  const pw = fw / f.cols, ph = fh / f.rows;
  ctx.save();
  for (let row = 0; row < f.rows; row++) {
    // Courses of masonry stagger; machined decks stay square.
    const offset = arena.id === 'citadel' && row % 2 ? pw / 2 : 0;
    for (let col = -1; col <= f.cols; col++) {
      const x = x0 + col * pw + offset, y = y0 + row * ph;
      if (x + pw < 0 || x > W) continue;
      const tone = r();
      // Plate body: a lit upper-left falling into shade, slightly varied per plate.
      ctx.globalAlpha = .5 + tone * .25;
      ctx.fillStyle = f.tone; ctx.fillRect(x + 2, y + 2, pw - 4, ph - 4);
      ctx.globalAlpha = 1;
      const key = ctx.createLinearGradient(x, y, x + pw * .55, y + ph);
      key.addColorStop(0, '#ffffff10'); key.addColorStop(.45, '#ffffff00'); key.addColorStop(1, '#00000048');
      ctx.fillStyle = key; ctx.fillRect(x + 2, y + 2, pw - 4, ph - 4);
      // Brushed grain and a few scuffs catch the light at grazing angles.
      if (arena.id !== 'citadel' && arena.id !== 'blight') {
        for (let i = 0; i < 26; i++) {
          const sy = y + 4 + r() * (ph - 8), sx = x + 4 + r() * pw * .5, len = pw * (.2 + r() * .5);
          ctx.fillStyle = i % 3 ? '#ffffff07' : '#00000016';
          ctx.fillRect(sx, sy, Math.min(len, x + pw - 4 - sx), .6);
        }
      }
      for (let i = 0; i < 3; i++) {
        const sx = x + 8 + r() * (pw - 16), sy = y + 8 + r() * (ph - 16), a = r() * TAU, l = 4 + r() * 10;
        ctx.strokeStyle = '#ffffff0c'; ctx.lineWidth = .6;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); ctx.stroke();
      }
      // Recessed seam with a lit lower lip.
      ctx.fillStyle = f.seam; ctx.fillRect(x, y, pw, 2.5); ctx.fillRect(x, y, 2.5, ph);
      ctx.fillStyle = '#ffffff0e'; ctx.fillRect(x + 2.5, y + 2.5, pw - 3, 1);
      ctx.fillStyle = '#ffffff08'; ctx.fillRect(x + 2.5, y + 2.5, 1, ph - 3);
      ctx.fillStyle = '#00000050'; ctx.fillRect(x + 2.5, y + ph - 1.5, pw - 3, 1.5); ctx.fillRect(x + pw - 1.5, y + 2.5, 1.5, ph - 3);
      if (arena.id !== 'citadel' && arena.id !== 'blight') {
        for (const [bx, by] of [[x + 8, y + 8], [x + pw - 8, y + 8], [x + 8, y + ph - 8], [x + pw - 8, y + ph - 8]]) {
          ctx.fillStyle = '#00000070'; ctx.beginPath(); ctx.arc(bx + .7, by + .9, 2.3, 0, TAU); ctx.fill();
          const bolt = ctx.createRadialGradient(bx - .6, by - .6, 0, bx, by, 2);
          bolt.addColorStop(0, '#ffffff40'); bolt.addColorStop(1, '#ffffff08');
          ctx.fillStyle = bolt; ctx.beginPath(); ctx.arc(bx, by, 1.9, 0, TAU); ctx.fill();
        }
        const detail = r();
        if (detail < .12) {
          // Flush service hatch with a recessed grip.
          ctx.fillStyle = '#00000038'; ctx.fillRect(x + pw / 2 - 16, y + ph / 2 - 3, 32, 6);
          ctx.fillStyle = '#ffffff0c'; ctx.fillRect(x + pw / 2 - 16, y + ph / 2 + 3, 32, 1);
        } else if (detail < .26) {
          ctx.strokeStyle = '#00000058'; ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 14, y + 14, pw - 28, ph - 28);
          ctx.strokeStyle = '#ffffff0b'; ctx.lineWidth = 1;
          ctx.strokeRect(x + 15.5, y + 15.5, pw - 28, ph - 28);
        } else if (detail < .46) {
          // A recessed light strip inlaid near one edge.
          const top = r() < .5;
          const lx = x + pw * (.2 + r() * .2), lw = pw * (.25 + r() * .2), ly = top ? y + 6 : y + ph - 9;
          ctx.fillStyle = '#000000a0'; ctx.fillRect(lx - 1, ly - 1, lw + 2, 4);
          ctx.globalCompositeOperation = 'lighter';
          const strip = ctx.createLinearGradient(lx, 0, lx + lw, 0);
          strip.addColorStop(0, f.glow + '20'); strip.addColorStop(.5, f.glow + '90'); strip.addColorStop(1, f.glow + '20');
          ctx.fillStyle = strip; ctx.fillRect(lx, ly, lw, 2);
          const spill = ctx.createLinearGradient(0, ly - 8, 0, ly + 10);
          spill.addColorStop(0, f.glow + '00'); spill.addColorStop(.5, f.glow + '14'); spill.addColorStop(1, f.glow + '00');
          ctx.fillStyle = spill; ctx.fillRect(lx - 6, ly - 8, lw + 12, 18);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }
  }
  // Seams carry a faint emissive charge in powered arenas.
  if (f.glowA > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = f.glowA;
    ctx.fillStyle = f.glow;
    for (let row = 1; row < f.rows; row++) ctx.fillRect(0, y0 + row * ph, W, .8);
    if (arena.id !== 'citadel') for (let col = 1; col < f.cols; col++) ctx.fillRect(x0 + col * pw, y0, .8, fh);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/**
 * Static arena architecture is baked once, keeping the live effects inexpensive. The playfield
 * bakes at twice the world resolution so the floor stays crisp on high-density phone screens.
 */
export function createArenaSurface(arena: ArenaDef, scale = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  const { accent, wall, bg0, bg1 } = arena.theme;
  const base = ctx.createLinearGradient(0, 0, W * .4, H);
  base.addColorStop(0, bg1);
  base.addColorStop(1, bg0);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  drawPlates(ctx, arena);

  ctx.save();
  ctx.beginPath();
  ctx.rect(14, FIELD_TOP, W - 28, DEFENSE_Y - FIELD_TOP);
  ctx.clip();
  ctx.strokeStyle = accent + '12';
  ctx.lineWidth = 1;
  if (arena.id === 'rift') {
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.ellipse(270, 405, 70 + i * 33, 110 + i * 42, .4, 0, TAU);
      ctx.stroke();
    }
    // Violet fissures glow through the obsidian.
    const r = rand(7);
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 7; k++) {
      let x = 30 + r() * (W - 60), y = FIELD_TOP + r() * (DEFENSE_Y - FIELD_TOP);
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (r() - .5) * 60; y += (r() - .3) * 40; ctx.lineTo(x, y); }
      ctx.strokeStyle = '#a36bff18'; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = '#d7b8ff30'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  } else if (arena.id === 'foundry') {
    for (const x of [42, W - 58]) {
      const trench = ctx.createLinearGradient(x, 0, x + 16, 0);
      trench.addColorStop(0, '#00000080'); trench.addColorStop(.5, '#ff6a1a30'); trench.addColorStop(1, '#00000080');
      ctx.fillStyle = trench;
      ctx.fillRect(x, FIELD_TOP, 16, DEFENSE_Y - FIELD_TOP);
      ctx.globalCompositeOperation = 'lighter';
      for (let y = 130; y < DEFENSE_Y; y += 40) {
        const molten = ctx.createLinearGradient(0, y, 0, y + 19);
        molten.addColorStop(0, '#ff8a3d00'); molten.addColorStop(.5, '#ffac6750'); molten.addColorStop(1, '#ff8a3d00');
        ctx.fillStyle = molten;
        ctx.fillRect(x + 4, y, 8, 19);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  } else if (arena.id === 'blight') {
    // Organic cells and creeping veins.
    for (let i = 0; i < 26; i++) {
      const x = 40 + (i * 151.7) % (W - 80);
      const y = FIELD_TOP + 40 + (i * 89.3) % (DEFENSE_Y - FIELD_TOP - 80);
      const r = 18 + (i * 7) % 26;
      const cell = ctx.createRadialGradient(x - r * .3, y - r * .3, 1, x, y, r);
      cell.addColorStop(0, accent + '14'); cell.addColorStop(.8, accent + '06'); cell.addColorStop(1, '#00000030');
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.75, i, 0, TAU);
      ctx.fillStyle = cell; ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = accent + '16';
    for (let v = 0; v < 5; v++) {
      ctx.beginPath(); ctx.moveTo(30 + v * 120, FIELD_TOP);
      for (let y = FIELD_TOP; y < DEFENSE_Y; y += 40) ctx.lineTo(30 + v * 120 + Math.sin(y * 0.03 + v) * 26, y);
      ctx.lineWidth = 5; ctx.strokeStyle = '#00000030'; ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = accent + '1c'; ctx.stroke();
    }
  } else if (arena.id === 'spire') {
    // Clockwork: concentric dials and tick marks.
    for (const [cx, cy, r] of [[270, 420, 210], [270, 420, 150], [270, 420, 90]] as const) {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      for (let i = 0; i < 24; i++) {
        const a = i * TAU / 24;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6)); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke();
      }
    }
    ctx.beginPath(); ctx.moveTo(270, 420); ctx.lineTo(270, 230); ctx.moveTo(270, 420); ctx.lineTo(400, 470); ctx.stroke();
  } else if (arena.id === 'citadel') {
    // Weathered stone: chipped corners and faint cracks across the courses.
    const r = rand(33);
    ctx.strokeStyle = '#00000045'; ctx.lineWidth = 1;
    for (let k = 0; k < 18; k++) {
      let x = 20 + r() * (W - 40), y = FIELD_TOP + r() * (DEFENSE_Y - FIELD_TOP);
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 4; s++) { x += (r() - .5) * 26; y += (r() - .5) * 26; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  } else {
    for (const r of [135, 145, 225]) {
      ctx.beginPath(); ctx.arc(270, 435, r, 0, TAU); ctx.stroke();
    }
    ctx.setLineDash([5, 12]);
    ctx.beginPath(); ctx.moveTo(270, 115); ctx.lineTo(270, DEFENSE_Y); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  // Floor markings are inlaid: each line casts a hairline shadow into its groove.
  const etch = document.createElement('canvas');
  etch.width = canvas.width; etch.height = canvas.height;
  const e = etch.getContext('2d')!;
  e.scale(canvas.width / W, canvas.height / H);
  drawScenery(e, arena);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.shadowColor = 'rgba(0,0,0,.85)';
  ctx.shadowOffsetX = canvas.width / W * 1.1;
  ctx.shadowOffsetY = canvas.width / W * 1.4;
  ctx.shadowBlur = canvas.width / W;
  ctx.drawImage(etch, 0, 0);
  ctx.restore();

  ctx.save();
  ctx.beginPath(); ctx.rect(14, FIELD_TOP, W - 28, DEFENSE_Y - FIELD_TOP); ctx.clip();
  for (let i = 0; i < 52; i++) {
    const x = 28 + (i * 173.31) % (W - 56);
    const y = FIELD_TOP + 22 + (i * 97.73) % (DEFENSE_Y - FIELD_TOP - 44);
    ctx.fillStyle = i % 7 === 0 ? '#e1eaff30' : accent + '1a';
    ctx.fillRect(x, y, i % 7 === 0 ? 2 : 1, 1);
  }
  ctx.restore();

  // Surface grain over everything on the floor.
  ctx.save();
  ctx.fillStyle = ctx.createPattern(grainTile(), 'repeat')!;
  ctx.fillRect(0, FIELD_TOP, W, H - FIELD_TOP);
  ctx.restore();

  // Overhead key light pooling at the center, with the floor falling off into shadow.
  const light = ctx.createRadialGradient(W / 2, 360, 20, W / 2, 420, 520);
  light.addColorStop(0, accent + '14');
  light.addColorStop(.5, '#00000000');
  light.addColorStop(1, '#00000078');
  ctx.fillStyle = light;
  ctx.fillRect(0, FIELD_TOP, W, DEFENSE_Y - FIELD_TOP);

  // Ambient occlusion where the floor meets the walls, the header and the barrier.
  const ao = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number, a: string) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, a); g.addColorStop(1, '#00000000');
    ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
  };
  ao(0, 0, 46, 0, 0, FIELD_TOP, 46, DEFENSE_Y - FIELD_TOP, '#000000a0');
  ao(W, 0, W - 46, 0, W - 46, FIELD_TOP, 46, DEFENSE_Y - FIELD_TOP, '#000000a0');
  ao(0, FIELD_TOP, 0, FIELD_TOP + 70, 0, FIELD_TOP, W, 70, '#000000b8');
  ao(0, DEFENSE_Y, 0, DEFENSE_Y - 40, 0, DEFENSE_Y - 40, W, 40, '#00000060');

  drawFrame(ctx, arena);
  drawDeck(ctx, arena);
  return canvas;
}

/** Armored side rails and the header lip: heavy, beveled, with recessed light strips. */
function drawFrame(ctx: CanvasRenderingContext2D, arena: ArenaDef): void {
  const { accent, wall } = arena.theme;
  for (const left of [true, false]) {
    const x = left ? 0 : W - 12;
    const metal = ctx.createLinearGradient(x, 0, x + 12, 0);
    if (left) {
      metal.addColorStop(0, '#02060c'); metal.addColorStop(.35, '#2a3b48'); metal.addColorStop(.6, '#4f6676');
      metal.addColorStop(.75, '#1a2731'); metal.addColorStop(1, '#03070d');
    } else {
      metal.addColorStop(0, '#03070d'); metal.addColorStop(.25, '#1a2731'); metal.addColorStop(.4, '#4f6676');
      metal.addColorStop(.65, '#2a3b48'); metal.addColorStop(1, '#02060c');
    }
    ctx.fillStyle = metal; ctx.fillRect(x, FIELD_TOP, 12, FLOOR_Y - FIELD_TOP);
    // Inner lip catching the arena's light.
    const lip = left ? 11 : W - 12;
    ctx.fillStyle = wall + '90'; ctx.fillRect(lip, FIELD_TOP, 1, FLOOR_Y - FIELD_TOP);
    ctx.fillStyle = '#000000a0'; ctx.fillRect(left ? 12 : W - 14, FIELD_TOP, 2, FLOOR_Y - FIELD_TOP);
    for (let y = FIELD_TOP + 18; y < FLOOR_Y; y += 54) {
      // Recessed housings with a lit diode.
      ctx.fillStyle = '#050a10'; ctx.fillRect(x + 3, y, 6, 30);
      ctx.fillStyle = '#ffffff14'; ctx.fillRect(x + 3, y + 30, 6, 1);
      const diode = ctx.createLinearGradient(0, y + 2, 0, y + 12);
      diode.addColorStop(0, '#ffffff'); diode.addColorStop(.3, accent); diode.addColorStop(1, accent + '40');
      ctx.fillStyle = diode; ctx.fillRect(x + 4, y + 2, 4, 9);
      ctx.fillStyle = '#ffffff20'; ctx.fillRect(x + 4, y + 16, 4, 1); ctx.fillRect(x + 4, y + 20, 4, 1); ctx.fillRect(x + 4, y + 24, 4, 1);
    }
  }
  // Header: smoked glass over dark alloy, with a beveled lower lip.
  const head = ctx.createLinearGradient(0, 0, 0, FIELD_TOP);
  head.addColorStop(0, '#03070df8'); head.addColorStop(.7, '#081320f4'); head.addColorStop(1, '#0d1c2bf2');
  ctx.fillStyle = head; ctx.fillRect(0, 0, W, FIELD_TOP - 2);
  ctx.fillStyle = '#ffffff10'; ctx.fillRect(0, FIELD_TOP - 6, W, 1);
  ctx.fillStyle = '#01040a'; ctx.fillRect(0, FIELD_TOP - 4, W, 3);
  ctx.fillStyle = wall + '90'; ctx.fillRect(0, FIELD_TOP - 1.5, W, 1.5);
  const spill = ctx.createLinearGradient(0, FIELD_TOP, 0, FIELD_TOP + 10);
  spill.addColorStop(0, wall + '30'); spill.addColorStop(1, wall + '00');
  ctx.fillStyle = spill; ctx.fillRect(12, FIELD_TOP, W - 24, 10);
}

/** The command deck: tread plate, hazard chevrons and a recessed launch pit. */
function drawDeck(ctx: CanvasRenderingContext2D, arena: ArenaDef): void {
  const { accent } = arena.theme;
  ctx.save();
  ctx.beginPath(); ctx.rect(12, DEFENSE_Y, W - 24, H - DEFENSE_Y); ctx.clip();
  const deck = ctx.createLinearGradient(0, DEFENSE_Y, 0, H);
  deck.addColorStop(0, '#16222e'); deck.addColorStop(.35, '#0d1620'); deck.addColorStop(1, '#05090f');
  ctx.fillStyle = deck; ctx.fillRect(12, DEFENSE_Y, W - 24, H - DEFENSE_Y);
  // Diamond tread.
  for (let y = DEFENSE_Y + 22; y < H; y += 10) {
    for (let x = 16 + ((y / 10) % 2) * 9; x < W - 12; x += 18) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(((x + y) / 10 % 2) ? .7 : -.7);
      ctx.fillStyle = '#00000050'; ctx.fillRect(-4, .6, 8, 2);
      ctx.fillStyle = '#ffffff0d'; ctx.fillRect(-4, -.6, 8, 1.4);
      ctx.restore();
    }
  }
  // Hazard band directly under the barrier.
  const band = DEFENSE_Y + 12;
  ctx.fillStyle = '#05080c'; ctx.fillRect(12, band, W - 24, 9);
  ctx.save(); ctx.beginPath(); ctx.rect(12, band + 1, W - 24, 7); ctx.clip();
  for (let x = 0; x < W; x += 16) {
    ctx.fillStyle = '#d9a72a55';
    ctx.beginPath(); ctx.moveTo(x, band + 8); ctx.lineTo(x + 7, band + 1); ctx.lineTo(x + 13, band + 1); ctx.lineTo(x + 6, band + 8); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = '#ffffff10'; ctx.fillRect(12, band + 9, W - 24, 1);
  // Conduits running from the pit to the walls.
  for (const s of [-1, 1]) {
    const y = LAUNCHER_Y + 4;
    const x0 = LAUNCHER_X + s * 58, x1 = s < 0 ? 14 : W - 14;
    ctx.fillStyle = '#02050a'; ctx.fillRect(Math.min(x0, x1), y - 5, Math.abs(x1 - x0), 10);
    ctx.fillStyle = '#ffffff0e'; ctx.fillRect(Math.min(x0, x1), y + 5, Math.abs(x1 - x0), 1);
    const glow = ctx.createLinearGradient(x0, 0, x1, 0);
    glow.addColorStop(0, accent + '90'); glow.addColorStop(1, accent + '10');
    ctx.fillStyle = glow; ctx.fillRect(Math.min(x0, x1), y - 1, Math.abs(x1 - x0), 2);
  }
  // Launch pit: concentric recessed rings around the turret.
  const pit = ctx.createRadialGradient(LAUNCHER_X, LAUNCHER_Y, 20, LAUNCHER_X, LAUNCHER_Y, 64);
  pit.addColorStop(0, '#000000'); pit.addColorStop(.7, '#03070c'); pit.addColorStop(.86, '#1c2a36'); pit.addColorStop(1, '#0b131c');
  ctx.fillStyle = pit; ctx.beginPath(); ctx.arc(LAUNCHER_X, LAUNCHER_Y, 64, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#ffffff14'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(LAUNCHER_X, LAUNCHER_Y + .5, 63.5, .2, Math.PI - .2); ctx.stroke();
  ctx.strokeStyle = '#000000'; ctx.beginPath(); ctx.arc(LAUNCHER_X, LAUNCHER_Y - .5, 63.5, Math.PI + .2, TAU - .2); ctx.stroke();
  for (let i = 0; i < 24; i++) {
    const a = i * TAU / 24;
    ctx.fillStyle = i % 2 ? '#00000080' : accent + '38';
    ctx.save(); ctx.translate(LAUNCHER_X, LAUNCHER_Y); ctx.rotate(a); ctx.fillRect(52, -1.5, 8, 3); ctx.restore();
  }
  ctx.restore();
  // Outer service trim around the deck.
  ctx.strokeStyle = accent + '1c'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(25, H - 26); ctx.lineTo(25, FLOOR_Y + 27);
  ctx.lineTo(170, FLOOR_Y + 27); ctx.lineTo(190, FLOOR_Y + 47);
  ctx.lineTo(350, FLOOR_Y + 47); ctx.lineTo(370, FLOOR_Y + 27);
  ctx.lineTo(W - 25, FLOOR_Y + 27); ctx.lineTo(W - 25, H - 26); ctx.stroke();
}

const fogArt = new Map<string, HTMLCanvasElement>();
const FOG = 128;
/** Tileable fractal value noise in one color: slow banks of haze that drift over the floor. */
function fogTile(color: string): HTMLCanvasElement {
  let c = fogArt.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = FOG;
  const g = c.getContext('2d')!;
  const img = g.createImageData(FOG, FOG);
  const r = rand(4242);
  const octaves = [4, 8, 16, 32].map(n => ({ n, v: Array.from({ length: n * n }, r) }));
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const sample = (o: { n: number; v: number[] }, x: number, y: number) => {
    const fx = x / FOG * o.n, fy = y / FOG * o.n;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = smooth(fx - ix), ty = smooth(fy - iy);
    const at = (i: number, j: number) => o.v[((j % o.n) * o.n + (i % o.n))];
    const a = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
    const b = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
  const v = parseInt(color.slice(1, 7), 16);
  for (let y = 0; y < FOG; y++) for (let x = 0; x < FOG; x++) {
    let n = 0, amp = .55, sum = 0;
    for (const o of octaves) { n += sample(o, x, y) * amp; sum += amp; amp *= .5; }
    n /= sum;
    const i = (y * FOG + x) * 4;
    img.data[i] = (v >> 16) & 255; img.data[i + 1] = (v >> 8) & 255; img.data[i + 2] = v & 255;
    img.data[i + 3] = Math.max(0, Math.min(255, (n - .38) * 2.4 * 255));
  }
  g.putImageData(img, 0, 0);
  fogArt.set(color, c);
  return c;
}

/** Tiles a fog layer across the field, scrolled by (ox, oy) and scaled to `size`. */
function fogLayer(ctx: CanvasRenderingContext2D, tile: HTMLCanvasElement, size: number, ox: number, oy: number): void {
  const sx = ((ox % size) + size) % size, sy = ((oy % size) + size) % size;
  for (let y = FIELD_TOP - sy; y < DEFENSE_Y; y += size) {
    for (let x = -sx; x < W; x += size) ctx.drawImage(tile, x, y, size + .5, size + .5);
  }
}

/** Light packets racing along the floor seams, as if power were being routed under the deck. */
function seamRunners(ctx: CanvasRenderingContext2D, arena: ArenaDef, time: number): void {
  const f = floorStyle(arena);
  const pw = W / f.cols, ph = (DEFENSE_Y - FIELD_TOP) / f.rows;
  ctx.fillStyle = f.glow;
  for (let i = 0; i < 6; i++) {
    const horizontal = i % 2 === 0 || arena.id === 'citadel';
    const lane = 1 + (i * 3) % ((horizontal ? f.rows : f.cols) - 1);
    const span = horizontal ? W : DEFENSE_Y - FIELD_TOP;
    const speed = 70 + (i % 3) * 25;
    const pos = (time * speed + i * 211) % (span + 160) - 80;
    const dir = i % 4 < 2 ? 1 : -1;
    const head = dir > 0 ? pos : span - pos;
    const tail = 70;
    const x = horizontal ? head : lane * pw, y = horizontal ? FIELD_TOP + lane * ph : FIELD_TOP + head;
    const g = horizontal
      ? ctx.createLinearGradient(x - tail * dir, y, x, y)
      : ctx.createLinearGradient(x, y - tail * dir, x, y);
    g.addColorStop(0, f.glow + '00'); g.addColorStop(1, f.glow + 'b0');
    ctx.fillStyle = g;
    if (horizontal) ctx.fillRect(Math.min(x, x - tail * dir), y - .8, tail, 1.8);
    else ctx.fillRect(x - .8, Math.min(y, y - tail * dir), 1.8, tail);
    const dot = ctx.createRadialGradient(x, y, 0, x, y, 9);
    dot.addColorStop(0, '#ffffffb0'); dot.addColorStop(.3, f.glow + '60'); dot.addColorStop(1, f.glow + '00');
    ctx.fillStyle = dot; ctx.fillRect(x - 9, y - 9, 18, 18);
  }
}

export function drawArenaAtmosphere(ctx: CanvasRenderingContext2D, arena: ArenaDef, time: number, rich = true): void {
  ctx.save();
  ctx.beginPath(); ctx.rect(12, FIELD_TOP, W - 24, DEFENSE_Y - FIELD_TOP); ctx.clip();
  const color = arena.theme.accent;
  // Cloud shadows: dark haze drifting slowly, so the floor lighting is never uniform.
  if (rich) {
    ctx.globalAlpha = .32;
    fogLayer(ctx, fogTile('#000000'), 420, time * 6, time * -3);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    seamRunners(ctx, arena, time);
    ctx.globalCompositeOperation = 'source-over';
  }
  // Volumetric shafts from the overhead rig drift slowly across the floor.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const sway = Math.sin(time * .09 + i * 2.1) * 50;
    const x = 90 + i * 180 + sway;
    const shaft = ctx.createLinearGradient(x - 60, FIELD_TOP, x + 40, DEFENSE_Y);
    shaft.addColorStop(0, color + '0e'); shaft.addColorStop(.6, color + '04'); shaft.addColorStop(1, color + '00');
    ctx.fillStyle = shaft;
    ctx.beginPath();
    ctx.moveTo(x - 40, FIELD_TOP); ctx.lineTo(x + 20, FIELD_TOP);
    ctx.lineTo(x + 110, DEFENSE_Y); ctx.lineTo(x - 10, DEFENSE_Y); ctx.closePath(); ctx.fill();
  }
  // Broad translucent aurora ribbons, kept behind every combat silhouette.
  for (let i = 0; i < 2; i++) {
    const shift = Math.sin(time * .12 + i * 2) * 40;
    const ribbon = ctx.createLinearGradient(0, 120, W, 650);
    ribbon.addColorStop(0, color + '00'); ribbon.addColorStop(.5, i ? '#a38bff08' : color + '0a'); ribbon.addColorStop(1, color + '00');
    ctx.fillStyle = ribbon;
    ctx.beginPath(); ctx.moveTo(-80 + shift, 160 + i * 95);
    ctx.bezierCurveTo(170, 230 + i * 110, 300, 550, W + 80, 650 + i * 40);
    ctx.lineTo(W + 80, 720 + i * 40);
    ctx.bezierCurveTo(320, 540, 130, 320 + i * 110, -80 + shift, 230 + i * 95);
    ctx.closePath(); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  // Deterministic drifting motes: visual time never enters simulation state.
  for (let i = 0; i < 30; i++) {
    let x = 20 + ((i * 137.51 + Math.sin(time * .2 + i) * 14) % 500 + 500) % 500;
    let y = FIELD_TOP + ((i * 71.3 - time * (4 + i % 5)) % 690 + 690) % 690;
    if (arena.id === 'rift' || arena.id === 'spire') {
      const a = i * 2.4 + time * (arena.id === 'rift' ? -.07 : .035);
      const r = 75 + i * 8;
      x = W / 2 + Math.cos(a) * r; y = 420 + Math.sin(a) * r * 1.15;
    }
    const twinkle = (1 + Math.sin(time * 1.3 + i * 2)) * .5;
    ctx.globalAlpha = .1 + twinkle * .28;
    ctx.fillStyle = arena.id === 'foundry' && i % 3 === 0 ? '#ffd291' : color;
    if (arena.id === 'foundry') {
      // Rising embers, hot at the head.
      const ey = FIELD_TOP + ((i * 71.3 + 400 - time * (18 + i % 7 * 4)) % 690 + 690) % 690;
      ctx.fillRect(x, ey, 1.4, 3 + i % 3);
      ctx.fillStyle = '#fff1c9'; ctx.fillRect(x, ey, 1.4, 1.2);
    } else if (arena.id === 'blight') {
      ctx.beginPath(); ctx.ellipse(x, y, 1.6 + i % 2, 1.1, i + time * .1, 0, TAU); ctx.fill();
    } else {
      const s = i % 3 === 0 ? 2 : 1.2;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
  }
  const scanY = FIELD_TOP + (time * 23) % (DEFENSE_Y - FIELD_TOP);
  const scan = ctx.createLinearGradient(0, scanY - 60, 0, scanY);
  scan.addColorStop(0, color + '00'); scan.addColorStop(1, color + '08');
  ctx.globalAlpha = 1; ctx.fillStyle = scan; ctx.fillRect(12, scanY - 60, W - 24, 60);
  ctx.fillStyle = color + '12'; ctx.fillRect(12, scanY, W - 24, 1);
  ctx.restore();
  // Moving packets travel along the physical rails, outside the playing field.
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const y = FIELD_TOP + (time * 95 + i * 177) % (FLOOR_Y - FIELD_TOP - 35);
    const x = i % 2 ? W - 6 : 6;
    const packet = ctx.createLinearGradient(0, y, 0, y + 28);
    packet.addColorStop(0, color + '00'); packet.addColorStop(.8, color + 'cc'); packet.addColorStop(1, '#ffffff');
    ctx.fillStyle = packet; ctx.fillRect(x - 1, y, 2, 28);
  }
  ctx.restore();
}
