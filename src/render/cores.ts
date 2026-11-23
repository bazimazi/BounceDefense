import { TAU } from '../core/math';

const sprites = new Map<string, HTMLCanvasElement>();
const portraits = new Map<string, HTMLCanvasElement>();
let lighting: HTMLCanvasElement | null = null;
const SIZE = 224;
const HALF = SIZE / 2;
/** The sphere fills 88% of the half-size, leaving room for a soft outline. */
const R = HALF * .9;

function bounded(map: Map<string, HTMLCanvasElement>, key: string, canvas: HTMLCanvasElement): HTMLCanvasElement {
  // Bound the tint cache when many evolution/momentum colors cycle through it.
  if (map.size > 96) map.delete(map.keys().next().value!);
  map.set(key, canvas);
  return canvas;
}

/**
 * The spinning body of a reactor core: albedo, machined seams and its luminous emblem.
 * It carries no directional light, so it can rotate freely under `orbLighting`.
 */
export function coreSprite(id: string, color: string): HTMLCanvasElement {
  const key = `${id}:${color}`;
  const cached = sprites.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const c = canvas.getContext('2d')!;
  c.translate(HALF, HALF); c.scale(R, R);
  const circle = (r: number) => { c.beginPath(); c.arc(0, 0, r, 0, TAU); };
  // Symmetric limb darkening: the shell is lit by its own core.
  const body = c.createRadialGradient(0, 0, 0, 0, 0, 1);
  body.addColorStop(0, '#ffffff'); body.addColorStop(.18, color);
  body.addColorStop(.62, color); body.addColorStop(.9, mix(color, '#050b14', .55)); body.addColorStop(1, '#02060c');
  circle(1); c.fillStyle = body; c.fill();
  c.save(); circle(.995); c.clip();
  // Armored hull plates with recessed seams.
  c.strokeStyle = '#03091380'; c.lineWidth = .06;
  for (const tilt of [-.65, .65]) {
    c.beginPath(); c.ellipse(0, 0, .42, 1.05, tilt, 0, TAU); c.stroke();
  }
  c.strokeStyle = '#ffffff30'; c.lineWidth = .016;
  for (const tilt of [-.65, .65]) {
    c.beginPath(); c.ellipse(.03, .03, .42, 1.05, tilt, 0, TAU); c.stroke();
  }
  // Core window.
  const porthole = c.createRadialGradient(0, 0, .1, 0, 0, .66);
  porthole.addColorStop(0, mix(color, '#ffffff', .15)); porthole.addColorStop(.45, mix(color, '#000000', .45)); porthole.addColorStop(.85, '#030812f0'); porthole.addColorStop(1, '#01040a');
  c.fillStyle = porthole; circle(.66); c.fill();
  c.strokeStyle = '#000000a0'; c.lineWidth = .05; circle(.69); c.stroke();
  c.strokeStyle = color; c.lineWidth = .028; circle(.66); c.stroke();
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12;
    c.save(); c.rotate(a); c.fillStyle = i % 3 ? '#04101a90' : '#f4ffff';
    c.fillRect(.76, -.02, .09, .04); c.restore();
  }
  // Each core has an engraved, luminous emblem with its own silhouette.
  c.strokeStyle = '#f4fffb'; c.fillStyle = color;
  c.lineWidth = .05; c.lineCap = 'round'; c.lineJoin = 'round';
  c.shadowColor = color; c.shadowBlur = 16;
  c.beginPath();
  switch (id) {
    case 'pyro':
      c.moveTo(0, -.49); c.bezierCurveTo(.08, -.12, .5, -.05, .31, .3);
      c.bezierCurveTo(.08, .6, -.48, .37, -.3, -.03);
      c.quadraticCurveTo(-.23, .14, -.13, .12); c.quadraticCurveTo(-.19, -.17, 0, -.49);
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#fff4c6'; c.beginPath(); c.ellipse(0, .23, .1, .18, 0, 0, TAU); c.fill(); break;
    case 'tesla':
      c.moveTo(.12, -.47); c.lineTo(-.31, .08); c.lineTo(-.02, .08);
      c.lineTo(-.11, .47); c.lineTo(.32, -.1); c.lineTo(.05, -.1); c.closePath(); c.fill(); c.stroke(); break;
    case 'cryo':
      for (let i = 0; i < 6; i++) {
        c.save(); c.rotate(i * TAU / 6); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -.44);
        c.moveTo(-.1, -.25); c.lineTo(0, -.15); c.lineTo(.1, -.25); c.stroke(); c.restore();
      } break;
    case 'blood':
      c.moveTo(0, -.46); c.bezierCurveTo(.12, -.17, .37, .02, .28, .27);
      c.bezierCurveTo(.12, .57, -.4, .4, -.28, .08); c.closePath(); c.fill(); c.stroke(); break;
    case 'void':
      for (let i = 0; i < 3; i++) {
        c.beginPath(); c.ellipse(0, 0, .43, .16, i * Math.PI / 3, 0, TAU); c.stroke();
      }
      c.fillStyle = '#080c1e'; circle(.16); c.fill(); break;
    case 'venom':
      for (let i = 0; i < 3; i++) {
        c.save(); c.rotate(i * TAU / 3); c.beginPath(); c.arc(0, -.22, .21, -.25, Math.PI + .25); c.stroke(); c.restore();
      }
      circle(.1); c.fill(); break;
    case 'titan':
      c.moveTo(0, -.43); c.lineTo(.37, -.21); c.lineTo(.37, .21); c.lineTo(0, .43);
      c.lineTo(-.37, .21); c.lineTo(-.37, -.21); c.closePath(); c.stroke();
      c.moveTo(-.37, -.21); c.lineTo(0, 0); c.lineTo(.37, -.21); c.moveTo(0, 0); c.lineTo(0, .43); c.stroke(); break;
    case 'gemini':
      c.beginPath(); c.ellipse(0, 0, .47, .22, -.65, 0, TAU); c.stroke();
      for (const s of [-1, 1]) { c.beginPath(); c.arc(s * .23, -s * .18, .13, 0, TAU); c.fill(); c.stroke(); } break;
    case 'blast':
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8; c.moveTo(Math.cos(a) * .31, Math.sin(a) * .31);
        c.lineTo(Math.cos(a) * .46, Math.sin(a) * .46);
      }
      c.stroke(); circle(.22); c.fill(); c.stroke(); break;
    case 'chrono':
      circle(.43); c.stroke(); c.moveTo(0, -.29); c.lineTo(0, 0); c.lineTo(.21, .13); c.stroke();
      for (let i = 0; i < 4; i++) { c.save(); c.rotate(i * Math.PI / 2); c.fillRect(-.025, -.39, .05, .07); c.restore(); } break;
    default:
      c.moveTo(0, -.4); c.lineTo(.33, 0); c.lineTo(0, .4); c.lineTo(-.33, 0); c.closePath(); c.stroke();
      circle(.12); c.fill();
  }
  c.shadowBlur = 0;
  c.restore();
  return bounded(sprites, key, canvas);
}

/**
 * The fixed key light over any core: shading toward the lower right, a fresnel rim, a broad
 * window reflection and a hot specular point. Pure black and white, so it suits every tint.
 */
export function orbLighting(): HTMLCanvasElement {
  if (lighting) return lighting;
  lighting = document.createElement('canvas');
  lighting.width = lighting.height = SIZE;
  const c = lighting.getContext('2d')!;
  c.translate(HALF, HALF); c.scale(R, R);
  const circle = (r: number) => { c.beginPath(); c.arc(0, 0, r, 0, TAU); };
  c.save(); circle(1); c.clip();
  const shade = c.createRadialGradient(-.42, -.5, .1, -.1, -.1, 1.35);
  shade.addColorStop(0, '#00000000'); shade.addColorStop(.55, '#00000020'); shade.addColorStop(1, '#000000b8');
  c.fillStyle = shade; c.fillRect(-1, -1, 2, 2);
  // Fresnel rim: grazing light wraps the lower-right edge.
  const rim = c.createRadialGradient(0, 0, .78, 0, 0, 1);
  rim.addColorStop(0, '#ffffff00'); rim.addColorStop(.85, '#ffffff10'); rim.addColorStop(1, '#ffffff50');
  c.fillStyle = rim;
  c.beginPath(); c.arc(0, 0, 1, -.3, Math.PI * .85); c.arc(0, 0, .7, Math.PI * .85, -.3, true); c.fill();
  // Window reflection, soft-edged.
  const glass = c.createLinearGradient(-.4, -.85, -.1, -.25);
  glass.addColorStop(0, '#ffffffb0'); glass.addColorStop(1, '#ffffff00');
  c.fillStyle = glass; c.beginPath(); c.ellipse(-.3, -.5, .5, .26, -.6, 0, TAU); c.fill();
  c.restore();
  const hot = c.createRadialGradient(-.38, -.52, 0, -.38, -.52, .16);
  hot.addColorStop(0, '#ffffff'); hot.addColorStop(1, '#ffffff00');
  c.fillStyle = hot; c.fillRect(-.6, -.75, .45, .45);
  c.strokeStyle = '#02050ad0'; c.lineWidth = .045; circle(1); c.stroke();
  c.strokeStyle = '#ffffff30'; c.lineWidth = .02; c.beginPath(); c.arc(0, 0, .97, Math.PI * 1.05, Math.PI * 1.6); c.stroke();
  return lighting;
}

/** The finished, lit core, as inventory portraits and cards show it. */
export function corePortrait(id: string, color: string): HTMLCanvasElement {
  const key = `${id}:${color}`;
  const cached = portraits.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const c = canvas.getContext('2d')!;
  c.drawImage(coreSprite(id, color), 0, 0);
  c.drawImage(orbLighting(), 0, 0);
  return bounded(portraits, key, canvas);
}

/** Linear blend of two #rrggbb colors. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1, 7), 16), pb = parseInt(b.slice(1, 7), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}
