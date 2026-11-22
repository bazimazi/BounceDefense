import { TAU } from '../core/math';

const sprites = new Map<string, HTMLCanvasElement>();

/** Hand-drawn reactor shells, shared by inventory portraits and the live ball. */
export function coreSprite(id: string, color: string): HTMLCanvasElement {
  const key = `${id}:${color}`;
  const cached = sprites.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 192;
  const c = canvas.getContext('2d')!;
  c.translate(96, 96); c.scale(88, 88);
  const circle = (r: number) => { c.beginPath(); c.arc(0, 0, r, 0, TAU); };
  const body = c.createRadialGradient(-.35, -.5, 0, .1, .1, 1.2);
  body.addColorStop(0, '#efffff'); body.addColorStop(.15, color);
  body.addColorStop(.52, color); body.addColorStop(.83, '#142539'); body.addColorStop(1, '#030912');
  circle(1); c.fillStyle = body; c.fill();
  c.save(); circle(.99); c.clip();
  // Curved seams make the sphere feel machined, rather than a flat medallion.
  c.strokeStyle = '#06132188'; c.lineWidth = .055;
  for (const tilt of [-.65, .65]) {
    c.beginPath(); c.ellipse(0, 0, .42, 1.05, tilt, 0, TAU); c.stroke();
  }
  c.fillStyle = '#071322b8'; circle(.65); c.fill();
  c.strokeStyle = color; c.lineWidth = .035; circle(.67); c.stroke();
  c.strokeStyle = '#edffff9c'; c.lineWidth = .018;
  c.beginPath(); c.arc(0, 0, .86, 3.45, 5.72); c.stroke();
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12;
    c.save(); c.rotate(a); c.fillStyle = i % 3 ? '#08182588' : '#e4ffffd0';
    c.fillRect(.75, -.018, .07, .036); c.restore();
  }
  // Each core has an engraved, luminous emblem with its own silhouette.
  c.strokeStyle = '#ecfff9'; c.fillStyle = color;
  c.lineWidth = .045; c.lineCap = 'round'; c.lineJoin = 'round';
  c.shadowColor = color; c.shadowBlur = 10;
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
  const glass = c.createLinearGradient(0, -1, .3, .4);
  glass.addColorStop(0, '#ffffff80'); glass.addColorStop(.48, '#ffffff00'); glass.addColorStop(1, '#ffffff00');
  c.fillStyle = glass; c.beginPath(); c.ellipse(-.18, -.55, .65, .23, -.35, 0, TAU); c.fill();
  c.restore();
  c.strokeStyle = '#cafffca0'; c.lineWidth = .016; circle(.99); c.stroke();
  // Bound the tint cache when many evolution/momentum colors cycle through it.
  if (sprites.size > 96) sprites.delete(sprites.keys().next().value!);
  sprites.set(key, canvas);
  return canvas;
}
