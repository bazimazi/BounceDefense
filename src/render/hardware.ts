import { TAU } from '../core/math';
import { coreSprite } from './cores';

export function arc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, start = 0, end = TAU): void {
  ctx.beginPath();
  ctx.arc(x, y, r, start, end);
}

function panel(ctx: CanvasRenderingContext2D, points: readonly number[]): void {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
}

function metal(ctx: CanvasRenderingContext2D, top: number, bottom: number): CanvasGradient {
  const gray = ctx.createLinearGradient(0, top, 0, bottom);
  gray.addColorStop(0, '#7391a3');
  gray.addColorStop(.18, '#2c4659');
  gray.addColorStop(.5, '#101e2d');
  gray.addColorStop(.84, '#070d18');
  gray.addColorStop(1, '#273c4d');
  return gray;
}

/** A solid ricochet bumper with a recessed piston and moving lock tabs. */
export function drawBumper(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, flash: number, time: number): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(r, r);
  arc(ctx, 0, .14, 1.06); ctx.fillStyle = '#020710cc'; ctx.fill();
  arc(ctx, 0, 0, 1); ctx.fillStyle = metal(ctx, -1, 1); ctx.fill();
  ctx.strokeStyle = color + '90'; ctx.lineWidth = .065; ctx.stroke();
  arc(ctx, 0, 0, .76); ctx.fillStyle = '#071421'; ctx.fill();
  ctx.strokeStyle = color + '6c'; ctx.lineWidth = .05; ctx.stroke();
  const energy = ctx.createRadialGradient(-.15, -.19, 0, 0, 0, .63);
  energy.addColorStop(0, '#eaffff'); energy.addColorStop(.28, color);
  energy.addColorStop(.7, color + '72'); energy.addColorStop(1, '#0a1523');
  arc(ctx, 0, 0, .64); ctx.fillStyle = energy; ctx.fill();
  for (let i = 0; i < 4; i++) {
    ctx.save(); ctx.rotate(i * TAU / 4 + time * .55);
    panel(ctx, [.53, -.18, .9, -.09, .9, .09, .53, .18]);
    ctx.fillStyle = '#0a1629'; ctx.fill(); ctx.strokeStyle = '#bdd6de'; ctx.lineWidth = .027; ctx.stroke();
    ctx.fillStyle = color; ctx.fillRect(.71, -.032, .13, .064); ctx.restore();
  }
  if (flash > 0) {
    ctx.globalAlpha = Math.min(1, flash);
    arc(ctx, 0, 0, 1 + (1 - flash) * .24); ctx.strokeStyle = '#eaffff'; ctx.lineWidth = .074; ctx.stroke();
  }
  ctx.restore();
}

/** The luminous center follows the actual endpoints for rails and Architect walls. */
export function drawRail(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, color: string, energy: number): void {
  ctx.save(); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
  ctx.strokeStyle = color + '35'; ctx.lineWidth = 16; ctx.stroke();
  ctx.strokeStyle = '#071523'; ctx.lineWidth = 11; ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.stroke();
  ctx.strokeStyle = '#132638'; ctx.lineWidth = 4; ctx.stroke();
  ctx.globalAlpha *= .5 + .5 * energy;
  ctx.strokeStyle = '#eeffff'; ctx.lineWidth = 1.7; ctx.stroke();
  ctx.restore();
}

/** A directional aperture with a visible center and rotating struts. */
export function drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(r, r);
  const aperture = ctx.createRadialGradient(0, 0, .13, 0, 0, 1);
  aperture.addColorStop(0, '#040319'); aperture.addColorStop(.45, '#160d30');
  aperture.addColorStop(.83, '#723ace'); aperture.addColorStop(1, '#260f49');
  arc(ctx, 0, 0, 1); ctx.fillStyle = aperture; ctx.fill();
  ctx.strokeStyle = '#a278e990'; ctx.lineWidth = .05; ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.save(); ctx.rotate(spin + i * TAU / 4);
    arc(ctx, 0, 0, .92, -.24, .65); ctx.strokeStyle = '#bd86ff'; ctx.lineWidth = .18; ctx.stroke();
    ctx.strokeStyle = '#f6e4ff'; ctx.lineWidth = .045; ctx.stroke();
    ctx.restore();
    const a = -spin * 1.5 + i * TAU / 4;
    ctx.strokeStyle = '#a18dff'; ctx.lineWidth = .046;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * .67, Math.sin(a) * .67);
    ctx.quadraticCurveTo(Math.cos(a + .9) * .62, Math.sin(a + .9) * .62,
      Math.cos(a + 1.7) * .22, Math.sin(a + 1.7) * .22);
    ctx.stroke();
  }
  ctx.restore();
}

/** The deck mount does not move. Only the barrel recoils along the measured aim angle. */
export function drawTurret(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number,
  color: string, core: string, recoil: number, charged: boolean, hasBall: boolean): void {
  ctx.save(); ctx.translate(x, y);
  arc(ctx, 0, 2, 37); ctx.fillStyle = '#020712bb'; ctx.fill();
  arc(ctx, 0, 0, 34); ctx.fillStyle = metal(ctx, -34, 34); ctx.fill();
  ctx.strokeStyle = color + '73'; ctx.lineWidth = 1.2; ctx.stroke();
  arc(ctx, 0, 0, 29); ctx.fillStyle = '#070e1b'; ctx.fill();
  for (let i = 0; i < 8; i++) {
    ctx.save(); ctx.rotate(i * TAU / 8);
    ctx.fillStyle = hasBall ? color + '9a' : '#344252'; ctx.fillRect(29, -1.5, 4, 3);
    ctx.restore();
  }

  ctx.save(); ctx.rotate(angle); ctx.translate(-recoil * 7, 0);
  panel(ctx, [-19, -14, 19, -14, 24, -10, 38, -10, 42, -6, 42, 6, 38, 10, 24, 10, 19, 14, -19, 14, -23, 9, -23, -9]);
  ctx.fillStyle = metal(ctx, -14, 14); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#7595aa'; ctx.stroke();
  ctx.fillStyle = '#050b16'; ctx.fillRect(19, -5, 22, 10);
  ctx.fillStyle = charged ? '#ffe1a0' : color;
  ctx.fillRect(20, -1, 20, 2); ctx.fillRect(34, -8, 3, 3); ctx.fillRect(34, 5, 3, 3);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = '#06121d'; ctx.fillRect(20 + i * 4, -10, 2, 4); ctx.fillRect(20 + i * 4, 6, 2, 4);
  }
  if (recoil > .04) {
    ctx.globalAlpha = recoil ** 2 * .82;
    panel(ctx, [39, -5, 48, -8, 48, -2, 62, 0, 48, 2, 48, 8, 39, 5]);
    ctx.fillStyle = charged ? '#fff1ce' : '#efffff'; ctx.fill();
  }
  ctx.restore();
  arc(ctx, 0, 0, 20); ctx.fillStyle = metal(ctx, -20, 20); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.stroke();
  if (hasBall) {
    ctx.drawImage(coreSprite(core, charged ? '#ffe3a3' : color), -17, -17, 34, 34);
  } else {
    arc(ctx, 0, 0, 13); ctx.fillStyle = '#020814'; ctx.fill();
    ctx.strokeStyle = color + '50'; ctx.stroke();
    ctx.fillStyle = color + '75'; ctx.fillRect(-4, -1, 8, 2);
  }
  ctx.restore();
}
