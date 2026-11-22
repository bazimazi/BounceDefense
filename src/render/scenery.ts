import { TAU } from '../core/math';
import type { ArenaDef } from '../data/types';
import { DEFENSE_Y, FIELD_TOP, W } from '../sim/types';

/** Painted once into the arena floor. Every mark is decorative and has no collision. */
export function drawScenery(c: CanvasRenderingContext2D, arena: ArenaDef): void {
  const col = arena.theme.accent;
  c.save();
  c.beginPath(); c.rect(14, FIELD_TOP, W - 28, DEFENSE_Y - FIELD_TOP); c.clip();
  const halo = c.createRadialGradient(270, 390, 20, 270, 430, 330);
  halo.addColorStop(0, col + '18'); halo.addColorStop(.55, col + '07'); halo.addColorStop(1, col + '00');
  c.fillStyle = halo; c.fillRect(14, FIELD_TOP, W - 28, DEFENSE_Y - FIELD_TOP);
  c.translate(270, 420);
  const ring = (r: number, width = 1, color = col + '24') => {
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.strokeStyle = color; c.lineWidth = width; c.stroke();
  };
  const spokes = (n: number, inner: number, outer: number, color = col + '28') => {
    c.strokeStyle = color; c.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const a = i * TAU / n;
      c.beginPath(); c.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      c.lineTo(Math.cos(a) * outer, Math.sin(a) * outer); c.stroke();
    }
  };
  if (arena.id === 'rift') {
    // Lensing around an inky singularity, like an accretion disk seen at an angle.
    c.save(); c.rotate(-.45);
    for (let i = 0; i < 28; i++) {
      c.beginPath(); c.ellipse(0, 0, 65 + i * 5.5, 48 + i * 2.8, 0, 0, TAU);
      c.strokeStyle = i % 4 === 0 ? '#cbacff25' : col + '0b'; c.lineWidth = i % 4 === 0 ? 2 : 1; c.stroke();
    }
    const well = c.createRadialGradient(0, 0, 20, 0, 0, 98);
    well.addColorStop(0, '#02030bec'); well.addColorStop(.68, '#050512e8'); well.addColorStop(1, col + '00');
    c.fillStyle = well; c.fillRect(-110, -110, 220, 220); c.restore();
    spokes(8, 225, 240);
  } else if (arena.id === 'foundry') {
    // Cast steel heat exchanger, with copper conduits sunk into the floor.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const x = side * (180 + i * 18);
        c.strokeStyle = '#03080b90'; c.lineWidth = 12; c.beginPath();
        c.moveTo(x, -340); c.lineTo(x, -170 + i * 28); c.lineTo(x - side * 52, -110 + i * 28);
        c.lineTo(x - side * 52, 260); c.stroke();
        c.strokeStyle = col + '28'; c.lineWidth = 2; c.stroke();
      }
    }
    ring(158, 22, '#080b0d85'); ring(171, 2); ring(144, 1); spokes(48, 145, 169);
    for (let i = 0; i < 7; i++) {
      c.fillStyle = '#ff8a3220'; c.fillRect(-87, -84 + i * 27, 174, 9);
      c.fillStyle = '#ffe4a51a'; c.fillRect(-87, -84 + i * 27, 174, 1);
    }
  } else if (arena.id === 'blight') {
    // Root networks grow through fractured containment rings.
    ring(174, 12, '#06180980'); ring(183, 1); ring(162, 1);
    for (let i = 0; i < 16; i++) {
      c.save(); c.rotate(i * TAU / 16);
      c.strokeStyle = col + '22'; c.lineWidth = 1 + i % 3;
      c.beginPath(); c.moveTo(42, 0); c.bezierCurveTo(100, -40, 150, 40, 310, 10); c.stroke();
      for (let j = 0; j < 3; j++) {
        const x = 115 + j * 58;
        c.beginPath(); c.ellipse(x, j % 2 ? -16 : 15, 13, 5, j % 2 ? .6 : -.6, 0, TAU);
        c.fillStyle = col + '0e'; c.fill(); c.strokeStyle = col + '22'; c.lineWidth = .6; c.stroke();
      }
      c.restore();
    }
    ring(62, 1, col + '30'); spokes(6, 62, 82);
  } else if (arena.id === 'spire') {
    // Interlocking toothed wheels and a finely engraved astronomical dial.
    for (const [x, y, r] of [[0, 0, 174], [-178, -193, 88], [181, 184, 92]]) {
      c.save(); c.translate(x, y); ring(r, 13, '#0b101a80'); ring(r + 9); ring(r - 11);
      spokes(60, r - 5, r + 6); ring(r * .62, 1); spokes(6, r * .25, r * .59); c.restore();
    }
    ring(111, 1, col + '32'); spokes(12, 101, 110, col + '44'); ring(32, 1);
    c.strokeStyle = col + '40'; c.lineWidth = 2; c.beginPath(); c.moveTo(-38, 38); c.lineTo(78, -78); c.stroke();
    c.lineWidth = 4; c.beginPath(); c.moveTo(-18, -15); c.lineTo(65, 54); c.stroke();
  } else if (arena.id === 'citadel') {
    // A massive octagonal vault with recessed armor plates.
    for (let layer = 0; layer < 4; layer++) {
      const r = 107 + layer * 42;
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i + .5) * TAU / 8;
        if (!i) c.moveTo(Math.cos(a) * r, Math.sin(a) * r); else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath(); c.strokeStyle = layer % 2 ? '#03081770' : col + '23'; c.lineWidth = layer % 2 ? 14 : 2; c.stroke();
    }
    spokes(8, 116, 266); ring(72, 14, '#03081780'); ring(82); spokes(16, 65, 79);
    c.strokeStyle = col + '28'; c.lineWidth = 1;
    for (const s of [-1, 1]) { c.strokeRect(-20, s * 220 - 8, 40, 16); }
  } else {
    // Observatory iris, with an illuminated compass and segmented outer bearing.
    ring(194, 24, '#030d1780'); ring(208, 1); ring(181, 1); spokes(72, 184, 203);
    ring(139, 1, col + '30'); ring(133, 2, col + '10'); ring(94, 1, col + '18');
    for (let i = 0; i < 8; i++) {
      c.save(); c.rotate(i * TAU / 8);
      c.beginPath(); c.moveTo(38, 0); c.lineTo(91, -27); c.lineTo(138, -18); c.lineTo(92, 4); c.closePath();
      c.fillStyle = col + '06'; c.fill(); c.strokeStyle = col + '16'; c.lineWidth = 1; c.stroke();
      c.fillStyle = col + '55'; c.fillRect(211, -2, 9, 4); c.restore();
    }
    ring(29, 2, col + '30'); spokes(4, 35, 49, col + '50');
  }
  c.restore();
  // Peripheral technical markings and subtle surface grain, all deterministic.
  c.save();
  c.fillStyle = col + '38';
  for (let i = 0; i < 13; i++) {
    c.fillRect(25 + i * 3, FIELD_TOP + 15, i % 3 ? 1 : 2, i % 4 ? 6 : 10);
    c.fillRect(W - 63 + i * 3, DEFENSE_Y - 20, i % 3 ? 1 : 2, i % 4 ? 6 : 10);
  }
  for (let i = 0; i < 900; i++) {
    c.fillStyle = i % 2 ? '#ffffff04' : '#0000000a';
    c.fillRect(16 + (i * 137.31) % (W - 32), FIELD_TOP + (i * 79.73) % (DEFENSE_Y - FIELD_TOP), 1, 1);
  }
  c.restore();
}
