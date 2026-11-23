import { TAU } from '../core/math';
import { coreSprite, orbLighting } from './cores';

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

/** Brushed gunmetal lit from the upper left, shared by every machined part. */
function metal(ctx: CanvasRenderingContext2D, top: number, bottom: number): CanvasGradient {
  const gray = ctx.createLinearGradient(top * .45, top, -bottom * .2, bottom);
  gray.addColorStop(0, '#a9c3d1');
  gray.addColorStop(.12, '#58768a');
  gray.addColorStop(.4, '#1d3142');
  gray.addColorStop(.72, '#0a1420');
  gray.addColorStop(.9, '#16293a');
  gray.addColorStop(1, '#3c5566');
  return gray;
}

/** Chrome: a hard horizon line gives polished metal its mirror read. */
function chrome(ctx: CanvasRenderingContext2D, r: number): CanvasGradient {
  const g = ctx.createLinearGradient(-r * .5, -r, r * .4, r);
  g.addColorStop(0, '#f4fbff'); g.addColorStop(.32, '#9db6c6'); g.addColorStop(.48, '#2a3e4e');
  g.addColorStop(.52, '#0c1722'); g.addColorStop(.78, '#3d5869'); g.addColorStop(1, '#a8c0cc');
  return g;
}

/** A soft contact shadow cast down and to the right of an object resting on the floor. */
export function contactShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = .55): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(.6, `rgba(0,0,0,${a * .5})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y);
  ctx.fillStyle = g; ctx.fillRect(x - rx, y - rx, rx * 2, rx * 2);
  ctx.restore();
}

/** A solid ricochet bumper: chrome collar, lit energy dome and rotating lock tabs. */
export function drawBumper(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, flash: number, time: number): void {
  contactShadow(ctx, x + r * .22, y + r * .34, r * 1.35, r * 1.05, .6);
  ctx.save(); ctx.translate(x, y); ctx.scale(r, r);
  // Chrome collar.
  arc(ctx, 0, 0, 1); ctx.fillStyle = chrome(ctx, 1); ctx.fill();
  ctx.strokeStyle = '#02060c'; ctx.lineWidth = .05; ctx.stroke();
  // Recessed well.
  arc(ctx, 0, 0, .8);
  const well = ctx.createRadialGradient(.1, .14, .3, 0, 0, .82);
  well.addColorStop(0, '#0d1b28'); well.addColorStop(1, '#010409');
  ctx.fillStyle = well; ctx.fill();
  // Lock tabs ride around the collar.
  for (let i = 0; i < 4; i++) {
    ctx.save(); ctx.rotate(i * TAU / 4 + time * .55);
    panel(ctx, [.6, -.16, .93, -.08, .93, .08, .6, .16]);
    ctx.fillStyle = '#0b1726'; ctx.fill(); ctx.strokeStyle = '#d6e9f2'; ctx.lineWidth = .025; ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = color; ctx.fillRect(.72, -.03, .14, .06);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
  // Energy dome: emissive, so the bloom picks it up.
  const hot = .55 + flash * .45;
  const energy = ctx.createRadialGradient(-.12, -.16, 0, 0, 0, .6);
  energy.addColorStop(0, '#ffffff'); energy.addColorStop(.25, color);
  energy.addColorStop(.75, color + '90'); energy.addColorStop(1, '#06101b');
  arc(ctx, 0, 0, .58); ctx.fillStyle = energy; ctx.globalAlpha = .75 + hot * .25; ctx.fill(); ctx.globalAlpha = 1;
  // Hex lattice inside the dome.
  ctx.save(); arc(ctx, 0, 0, .56); ctx.clip();
  ctx.strokeStyle = '#ffffff30'; ctx.lineWidth = .02;
  for (let gx = -2; gx <= 2; gx++) for (let gy = -2; gy <= 2; gy++) {
    const cx = gx * .3 + (gy % 2 ? .15 : 0), cy = gy * .26;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + Math.PI / 6; ctx.lineTo(cx + Math.cos(a) * .16, cy + Math.sin(a) * .16); }
    ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
  // Glass cap highlight.
  ctx.fillStyle = '#ffffffa0';
  ctx.beginPath(); ctx.ellipse(-.18, -.27, .24, .1, -.5, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#ffffff40'; ctx.lineWidth = .03; arc(ctx, 0, 0, .58, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();
  if (flash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, flash);
    arc(ctx, 0, 0, 1 + (1 - flash) * .35); ctx.strokeStyle = '#eaffff'; ctx.lineWidth = .1; ctx.stroke();
    arc(ctx, 0, 0, .58); ctx.fillStyle = '#ffffff'; ctx.globalAlpha = flash * .6; ctx.fill();
  }
  ctx.restore();
}

/** The luminous center follows the actual endpoints for rails and Architect walls. */
export function drawRail(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, color: string, energy: number): void {
  ctx.save(); ctx.lineCap = 'round';
  // Cast shadow on the floor.
  ctx.beginPath(); ctx.moveTo(ax + 4, ay + 6); ctx.lineTo(bx + 4, by + 6);
  ctx.strokeStyle = '#00000070'; ctx.lineWidth = 14; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
  ctx.strokeStyle = '#03080f'; ctx.lineWidth = 13; ctx.stroke();
  // Machined housing, lit along its upper face.
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const nx = -(by - ay) / len, ny = (bx - ax) / len;
  const up = ny > 0 ? -1 : 1;
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const housing = ctx.createLinearGradient(mx + nx * 6 * up, my + ny * 6 * up, mx - nx * 6 * up, my - ny * 6 * up);
  housing.addColorStop(0, '#9fb8c6'); housing.addColorStop(.35, '#2b4050'); housing.addColorStop(.7, '#0b1520'); housing.addColorStop(1, '#22384a');
  ctx.strokeStyle = housing; ctx.lineWidth = 10; ctx.stroke();
  ctx.strokeStyle = '#050b12'; ctx.lineWidth = 4.5; ctx.stroke();
  // Emissive core.
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = color + '60'; ctx.lineWidth = 7; ctx.globalAlpha *= .5 + .5 * energy; ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 2.6; ctx.stroke();
  ctx.strokeStyle = '#f2ffff'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
  // End caps.
  for (const [x, y] of [[ax, ay], [bx, by]]) {
    ctx.save(); ctx.translate(x, y);
    arc(ctx, 0, 0, 6.5); ctx.fillStyle = metal(ctx, -6, 6); ctx.fill();
    ctx.strokeStyle = '#02060c'; ctx.lineWidth = 1; ctx.stroke();
    arc(ctx, 0, 0, 2.2); ctx.fillStyle = color; ctx.fill();
    ctx.restore();
  }
}

/** A directional aperture with a visible center and rotating struts. */
export function drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(r, r);
  // Chrome ring housing.
  arc(ctx, 0, 0, 1.12); ctx.fillStyle = chrome(ctx, 1.1); ctx.fill();
  ctx.strokeStyle = '#05020c'; ctx.lineWidth = .05; ctx.stroke();
  const aperture = ctx.createRadialGradient(0, 0, .05, 0, 0, 1);
  aperture.addColorStop(0, '#000000'); aperture.addColorStop(.4, '#12082a');
  aperture.addColorStop(.8, '#6a2fd0'); aperture.addColorStop(1, '#e6c6ff');
  arc(ctx, 0, 0, 1); ctx.fillStyle = aperture; ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  // Swirling event horizon.
  for (let i = 0; i < 5; i++) {
    const a = spin * 1.4 + i * TAU / 5;
    ctx.beginPath();
    for (let s = 0; s <= 14; s++) {
      const ang = a + s * .3, rr = .95 - s * .058;
      if (!s) ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr); else ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    ctx.strokeStyle = i % 2 ? '#c99bff70' : '#f3e2ff60'; ctx.lineWidth = .06; ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    ctx.save(); ctx.rotate(spin + i * TAU / 4);
    arc(ctx, 0, 0, .92, -.24, .65); ctx.strokeStyle = '#bd86ff'; ctx.lineWidth = .14; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = .04; ctx.stroke();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  arc(ctx, 0, 0, .2); ctx.fillStyle = '#000'; ctx.fill();
  ctx.restore();
}

/** The deck mount does not move. Only the barrel recoils along the measured aim angle. */
export function drawTurret(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number,
  color: string, core: string, recoil: number, charged: boolean, hasBall: boolean, time = 0): void {
  ctx.save(); ctx.translate(x, y);
  const live = charged ? '#ffe3a3' : color;
  // Octagonal armored mount.
  contactShadow(ctx, 4, 7, 46, 40, .7);
  const oct = (r: number) => {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i + .5) * TAU / 8; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath();
  };
  oct(41); ctx.fillStyle = '#02050a'; ctx.fill();
  oct(39); ctx.fillStyle = metal(ctx, -39, 39); ctx.fill();
  ctx.strokeStyle = '#c4dbe655'; ctx.lineWidth = 1; ctx.stroke();
  oct(33); ctx.fillStyle = '#060c16'; ctx.fill();
  ctx.strokeStyle = '#00000090'; ctx.lineWidth = 2; ctx.stroke();
  // Hydraulic pistons at the diagonals.
  for (let i = 0; i < 4; i++) {
    ctx.save(); ctx.rotate(Math.PI / 4 + i * Math.PI / 2);
    ctx.fillStyle = '#0a131d'; ctx.fillRect(22, -4.5, 15, 9);
    const rod = ctx.createLinearGradient(0, -3, 0, 3);
    rod.addColorStop(0, '#e9f5fa'); rod.addColorStop(.5, '#6f8796'); rod.addColorStop(1, '#1a2a36');
    ctx.fillStyle = rod; ctx.fillRect(24, -2.5, 11, 5);
    ctx.restore();
  }
  // Status ring: a lit segment per charge state.
  for (let i = 0; i < 16; i++) {
    ctx.save(); ctx.rotate(i * TAU / 16 + TAU / 32);
    ctx.fillStyle = hasBall ? (i % 2 ? live + 'b0' : live + '60') : '#26323e';
    ctx.fillRect(28, -1.4, 4, 2.8);
    ctx.restore();
  }
  if (hasBall) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(0, 0, 22, 0, 0, 36);
    halo.addColorStop(0, live + '00'); halo.addColorStop(.6, live + '28'); halo.addColorStop(1, live + '00');
    ctx.fillStyle = halo; arc(ctx, 0, 0, 36); ctx.fill();
    ctx.restore();
  }

  // Rotating head with twin accelerator rails.
  ctx.save(); ctx.rotate(angle); ctx.translate(-recoil * 8, 0);
  contactShadow(ctx, 10, 6, 34, 16, .45);
  // Shoulder block.
  panel(ctx, [-20, -15, 16, -15, 22, -11, 22, 11, 16, 15, -20, 15, -25, 9, -25, -9]);
  ctx.fillStyle = metal(ctx, -15, 15); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#02060c'; ctx.stroke();
  // Twin rails.
  for (const s of [-1, 1]) {
    panel(ctx, [16, s * 4, 50, s * 3.5, 52, s * 7.5, 50, s * 11, 16, s * 11]);
    const rail = ctx.createLinearGradient(0, s * 3, 0, s * 11);
    rail.addColorStop(0, s < 0 ? '#1a2b38' : '#8ea8b6'); rail.addColorStop(.5, '#34495a'); rail.addColorStop(1, s < 0 ? '#9db6c4' : '#0c1620');
    ctx.fillStyle = rail; ctx.fill(); ctx.strokeStyle = '#02060c'; ctx.lineWidth = .8; ctx.stroke();
    // Coil bands.
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = '#060c14'; ctx.fillRect(22 + i * 7, s < 0 ? -12 : 3, 2.5, 9);
    }
  }
  // Accelerator channel between the rails: emissive.
  ctx.fillStyle = '#01040a'; ctx.fillRect(16, -3.5, 36, 7);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const charge = hasBall ? 1 : .25;
  const channel = ctx.createLinearGradient(16, 0, 52, 0);
  channel.addColorStop(0, live + '20'); channel.addColorStop(1, live);
  ctx.globalAlpha = charge; ctx.fillStyle = channel; ctx.fillRect(17, -1.6, 35, 3.2);
  ctx.fillStyle = '#ffffff'; ctx.globalAlpha = charge * .8; ctx.fillRect(20, -.5, 32, 1);
  // Pulses travelling up the channel.
  if (hasBall) for (let i = 0; i < 3; i++) {
    const k = ((time * 1.6 + i / 3) % 1);
    ctx.globalAlpha = Math.sin(k * Math.PI);
    ctx.fillStyle = live; ctx.fillRect(18 + k * 32, -3.2, 3, 6.4);
  }
  ctx.restore();
  // Muzzle emitter.
  ctx.fillStyle = '#0a1520'; ctx.fillRect(50, -12, 4, 24);
  ctx.fillStyle = live; ctx.fillRect(53, -10, 1.2, 20);
  if (recoil > .04) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = recoil ** 2;
    const flare = ctx.createRadialGradient(58, 0, 0, 58, 0, 26);
    flare.addColorStop(0, '#ffffff'); flare.addColorStop(.3, live); flare.addColorStop(1, live + '00');
    ctx.fillStyle = flare; ctx.fillRect(32, -26, 52, 52);
    panel(ctx, [52, -4, 62, -10, 60, -2, 80, 0, 60, 2, 62, 10, 52, 4]);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // Central dome: the loaded core sits under armored glass.
  arc(ctx, 0, 0, 21); ctx.fillStyle = chrome(ctx, 21); ctx.fill();
  ctx.strokeStyle = '#02060c'; ctx.lineWidth = 1.2; ctx.stroke();
  arc(ctx, 0, 0, 17.5); ctx.fillStyle = '#01040a'; ctx.fill();
  if (hasBall) {
    ctx.save(); ctx.rotate(time * 1.2);
    ctx.drawImage(coreSprite(core, live), -16, -16, 32, 32);
    ctx.restore();
    ctx.drawImage(orbLighting(), -16, -16, 32, 32);
  } else {
    ctx.strokeStyle = color + '50'; ctx.lineWidth = 1; arc(ctx, 0, 0, 12); ctx.stroke();
    ctx.fillStyle = color + '75'; ctx.fillRect(-4, -1, 8, 2);
  }
  ctx.restore();
}
