import { TAU } from '../core/math';
import { CIRCUIT_DURATION, RESONANCE_COLOR } from '../sim/resonance';
import type { World } from '../sim/world';

/** The circuit is a hologram, visually distinct from solid pinball bumpers. */
export function drawResonance(ctx: CanvasRenderingContext2D, w: World, time: number): void {
  const circuit = w.resonance;
  if (!circuit.nodes.length) return;
  ctx.save();
  ctx.strokeStyle = RESONANCE_COLOR;
  ctx.lineWidth = 1;
  ctx.globalAlpha = .16 + circuit.lit * .06;
  ctx.setLineDash([3, 10]);
  ctx.lineDashOffset = -time * 14;
  ctx.beginPath();
  circuit.nodes.forEach((n, i) => i ? ctx.lineTo(n.x, n.y) : ctx.moveTo(n.x, n.y));
  ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  circuit.nodes.forEach((n, i) => {
    const color = n.lit ? '#ffe3a3' : RESONANCE_COLOR;
    const r = 23 + n.pulse * 8;
    const halo = ctx.createRadialGradient(n.x, n.y, 4, n.x, n.y, r * 2.4);
    halo.addColorStop(0, color + (n.lit ? '50' : '25'));
    halo.addColorStop(1, color + '00');
    ctx.globalAlpha = 1; ctx.fillStyle = halo;
    ctx.fillRect(n.x - r * 2.4, n.y - r * 2.4, r * 4.8, r * 4.8);
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = n.lit ? .95 : .65;
    for (let j = 0; j < 3; j++) {
      const angle = time * .4 + j * TAU / 3;
      ctx.beginPath(); ctx.arc(n.x, n.y, r, angle, angle + 1.1); ctx.stroke();
    }
    ctx.strokeStyle = color + '50'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(n.x, n.y, r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * circuit.remaining / CIRCUIT_DURATION); ctx.stroke();
    ctx.fillStyle = n.lit ? '#ffe3a3' : '#0a102dc0';
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(n.x, n.y - 12); ctx.lineTo(n.x + 10, n.y);
    ctx.lineTo(n.x, n.y + 12); ctx.lineTo(n.x - 10, n.y); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = n.lit ? '#2a2048' : '#e8deff';
    ctx.fillRect(n.x - 2, n.y - 2, 4, 4);
    ctx.font = '9px Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.fillText(n.lit ? 'LINKED' : `0${i + 1}`, n.x, n.y + 40);
  });
  ctx.restore();
}
