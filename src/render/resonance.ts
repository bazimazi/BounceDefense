import { t } from '../i18n';
import { TAU } from '../core/math';
import { CIRCUIT_DURATION, RESONANCE_COLOR, SIGNAL_HOLD } from '../sim/resonance';
import type { World } from '../sim/world';
import { arc } from './hardware';

/** The circuit is a hologram, visually distinct from solid pinball bumpers. */
export function drawResonance(ctx: CanvasRenderingContext2D, w: World, time: number, reducedMotion = false): void {
  const circuit = w.resonance;
  if (!circuit.nodes.length) return;
  ctx.save();
  ctx.strokeStyle = RESONANCE_COLOR;
  ctx.lineWidth = 1;
  ctx.globalAlpha = .16 + circuit.lit * .06;
  ctx.setLineDash([3, 10]);
  ctx.lineDashOffset = reducedMotion ? 0 : -time * 14;
  ctx.beginPath();
  circuit.nodes.forEach((n, i) => i ? ctx.lineTo(n.x, n.y) : ctx.moveTo(n.x, n.y));
  ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  // Confirmed links get a solid trace. Incomplete links retain the dashed blueprint.
  for (let i = 0; i < circuit.nodes.length; i++) {
    const from = circuit.nodes[i], to = circuit.nodes[(i + 1) % circuit.nodes.length];
    if (!from.lit || !to.lit) continue;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = '#ffe3a3'; ctx.globalAlpha = .12; ctx.lineWidth = 5; ctx.stroke();
    ctx.globalAlpha = .66; ctx.lineWidth = 1.1; ctx.stroke();
    const fraction = reducedMotion ? .5 : (time * .65 + i / 3) % 1;
    arc(ctx, from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction, 2.6);
    ctx.fillStyle = '#fff3ca'; ctx.fill();
  }
  circuit.nodes.forEach((n, i) => {
    const color = n.lit ? '#ffe3a3' : RESONANCE_COLOR;
    const r = 23 + n.pulse * 8;
    const spin = reducedMotion ? 0 : time * .4;
    const halo = ctx.createRadialGradient(n.x, n.y, 4, n.x, n.y, r * 2.4);
    halo.addColorStop(0, color + (n.lit ? '50' : '25'));
    halo.addColorStop(1, color + '00');
    ctx.globalAlpha = 1; ctx.fillStyle = halo;
    ctx.fillRect(n.x - r * 2.4, n.y - r * 2.4, r * 4.8, r * 4.8);
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = n.lit ? .95 : .65;
    for (let j = 0; j < 3; j++) {
      const angle = spin + j * TAU / 3;
      arc(ctx, n.x, n.y, r, angle, angle + 1.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(n.x + Math.cos(angle) * (r - 5), n.y + Math.sin(angle) * (r - 5));
      ctx.lineTo(n.x + Math.cos(angle) * r, n.y + Math.sin(angle) * r); ctx.stroke();
    }
    // Unlit signals show the circuit's clock; lit ones show how long they hold before fading.
    const clock = n.lit ? Math.max(0, n.litT) / SIGNAL_HOLD : circuit.remaining / CIRCUIT_DURATION;
    // A fading signal blinks through its last two seconds.
    ctx.strokeStyle = n.lit ? color + (!reducedMotion && n.litT < 2 && Math.floor(time * 6) % 2 ? '40' : 'e0') : color + '50';
    ctx.lineWidth = n.lit ? 3 : 1;
    ctx.beginPath(); ctx.arc(n.x, n.y, r + (n.lit ? 9 : 5), -Math.PI / 2, -Math.PI / 2 + TAU * clock); ctx.stroke();
    ctx.fillStyle = n.lit ? '#473049' : '#0a102dc0';
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(n.x, n.y - 12); ctx.lineTo(n.x + 10, n.y);
    ctx.lineTo(n.x, n.y + 12); ctx.lineTo(n.x - 10, n.y); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = n.lit ? '#fff0bf' : '#e8deff';
    ctx.beginPath(); ctx.moveTo(n.x, n.y - 5); ctx.lineTo(n.x + 4, n.y);
    ctx.lineTo(n.x, n.y + 5); ctx.lineTo(n.x - 4, n.y); ctx.closePath(); ctx.fill();
    ctx.font = '9px Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.fillText(n.lit ? `${t('canvas.linked')} ${Math.max(1, Math.ceil(n.litT))}` : `0${i + 1}`, n.x, n.y + 40);
  });
  ctx.restore();
}
