import { TAU } from '../core/math';
import { DEFENSE_Y, FIELD_TOP, FLOOR_Y, H, W } from '../sim/types';
import type { ArenaDef } from '../data/types';

/** Static arena architecture is baked once, keeping the live effects inexpensive. */
export function createArenaSurface(arena: ArenaDef): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const { accent, wall, bg0, bg1 } = arena.theme;
  const base = ctx.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, bg1);
  base.addColorStop(1, bg0);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  const light = ctx.createRadialGradient(W / 2, 310, 10, W / 2, 380, 510);
  light.addColorStop(0, accent + '15');
  light.addColorStop(1, '#00000070');
  ctx.fillStyle = light;
  ctx.fillRect(0, FIELD_TOP, W, FLOOR_Y - FIELD_TOP);

  // Staggered hexagonal floor panels, with tiny registration marks.
  ctx.lineWidth = 0.7;
  for (let row = 0; row < 19; row++) {
    for (let col = 0; col < 9; col++) {
      const x = col * 68 + (row % 2) * 34;
      const y = FIELD_TOP + row * 39;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = TAU * i / 6 + Math.PI / 6;
        const px = x + Math.cos(a) * 23;
        const py = y + Math.sin(a) * 23;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = accent + '0c';
      ctx.stroke();
      ctx.fillStyle = accent + '20';
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }
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
  } else if (arena.id === 'foundry') {
    for (const x of [42, W - 58]) {
      ctx.fillStyle = '#ff9e4510';
      ctx.fillRect(x, FIELD_TOP, 16, DEFENSE_Y - FIELD_TOP);
      for (let y = 130; y < DEFENSE_Y; y += 40) {
        ctx.fillStyle = '#ffac6725';
        ctx.fillRect(x + 4, y, 8, 19);
      }
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

  // Armored side rails and inset luminous strips frame the collision boundary.
  for (const x of [0, W - 12]) {
    ctx.fillStyle = '#060d18'; ctx.fillRect(x, FIELD_TOP, 12, FLOOR_Y - FIELD_TOP);
    ctx.fillStyle = wall + '70'; ctx.fillRect(x === 0 ? 2 : W - 4, FIELD_TOP, 2, FLOOR_Y - FIELD_TOP);
    for (let y = FIELD_TOP + 18; y < FLOOR_Y; y += 54) {
      ctx.fillStyle = '#243647'; ctx.fillRect(x + 3, y, 6, 27);
      ctx.fillStyle = accent + '90'; ctx.fillRect(x + 4, y, 4, 7);
    }
  }
  ctx.fillStyle = '#050d17f5'; ctx.fillRect(0, 0, W, FIELD_TOP - 2);
  ctx.fillStyle = wall + '70'; ctx.fillRect(0, FIELD_TOP - 2, W, 2);
  const deck = ctx.createLinearGradient(0, DEFENSE_Y, 0, H);
  deck.addColorStop(0, '#112333'); deck.addColorStop(1, '#060d17');
  ctx.fillStyle = deck; ctx.fillRect(12, DEFENSE_Y, W - 24, H - DEFENSE_Y);
  ctx.strokeStyle = accent + '22';
  ctx.beginPath(); ctx.moveTo(25, H - 26); ctx.lineTo(25, FLOOR_Y + 27);
  ctx.lineTo(170, FLOOR_Y + 27); ctx.lineTo(190, FLOOR_Y + 47);
  ctx.lineTo(350, FLOOR_Y + 47); ctx.lineTo(370, FLOOR_Y + 27);
  ctx.lineTo(W - 25, FLOOR_Y + 27); ctx.lineTo(W - 25, H - 26); ctx.stroke();
  ctx.font = '9px Consolas, monospace'; ctx.fillStyle = accent + '70';
  ctx.fillText('KINETIC DEFENSE SYSTEM', 24, FLOOR_Y + 65);
  ctx.textAlign = 'right'; ctx.fillText('BD / ' + arena.id.toUpperCase(), W - 24, FLOOR_Y + 65);
  return canvas;
}

export function drawArenaAtmosphere(ctx: CanvasRenderingContext2D, arena: ArenaDef, time: number): void {
  ctx.save();
  ctx.beginPath(); ctx.rect(12, FIELD_TOP, W - 24, DEFENSE_Y - FIELD_TOP); ctx.clip();
  const color = arena.theme.accent;
  // Deterministic drifting motes: visual time never enters simulation state.
  for (let i = 0; i < 25; i++) {
    const x = 20 + ((i * 137.51 + Math.sin(time * .2 + i) * 14) % 500 + 500) % 500;
    const y = FIELD_TOP + ((i * 71.3 - time * (4 + i % 5)) % 690 + 690) % 690;
    ctx.globalAlpha = .12 + (1 + Math.sin(time + i * 2)) * .1;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
  }
  const scanY = FIELD_TOP + (time * 23) % (DEFENSE_Y - FIELD_TOP);
  const scan = ctx.createLinearGradient(0, scanY - 60, 0, scanY);
  scan.addColorStop(0, color + '00'); scan.addColorStop(1, color + '09');
  ctx.globalAlpha = 1; ctx.fillStyle = scan; ctx.fillRect(12, scanY - 60, W - 24, 60);
  ctx.restore();
}
