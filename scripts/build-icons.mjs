// Builds the app icon from code and regenerates every platform size.
// Run: node scripts/build-icons.mjs
//
// Writes the layered sources to src-tauri/icons/source/, then runs `tauri icon`
// on its manifest (desktop .ico/.icns/PNGs, iOS, Android adaptive + legacy
// mipmaps, copied into gen/android), and refreshes the web icon in public/.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const srcDir = path.join(root, 'src-tauri/icons/source');
fs.mkdirSync(srcDir, { recursive: true });

const BG = '#060d16';

// Full-bleed backdrop: the game's deep navy with a teal glow behind the orb.
const backdrop = `
  <defs>
    <radialGradient id="bgGlow" cx="0.56" cy="0.42" r="0.62">
      <stop offset="0" stop-color="#1d4f58"/>
      <stop offset="0.45" stop-color="#0d2330"/>
      <stop offset="1" stop-color="${BG}"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bgGlow)"/>
  <circle cx="512" cy="512" r="430" fill="none" stroke="#8fa8ff" stroke-opacity="0.14" stroke-width="4" stroke-dasharray="14 22"/>
  <circle cx="512" cy="512" r="355" fill="none" stroke="#7de8d0" stroke-opacity="0.10" stroke-width="3"/>
  <g fill="#cfe9ff">
    <circle cx="214" cy="220" r="5" opacity="0.55"/>
    <circle cx="820" cy="190" r="4" opacity="0.45"/>
    <circle cx="866" cy="640" r="5" opacity="0.4"/>
    <circle cx="160" cy="590" r="3.5" opacity="0.4"/>
    <circle cx="300" cy="880" r="4" opacity="0.3"/>
  </g>`;

// Foreground: the ball ricochets off the defense line. Everything stays inside
// a 320px radius of the centre, the Android adaptive-icon safe zone.
const START = [252, 330];
const BOUNCE = [468, 708];
const BALL = [640, 400];
const R = 118;

// A streak from a to b that widens from wa to wb, like a comet tail.
const taper = (a, b, wa, wb) => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
  const pt = (p, w, s) => `${(p[0] + nx * w / 2 * s).toFixed(1)} ${(p[1] + ny * w / 2 * s).toFixed(1)}`;
  return `M${pt(a, wa, 1)} L${pt(b, wb, 1)} L${pt(b, wb, -1)} L${pt(a, wa, -1)}z`;
};
const foreground = `
  <defs>
    <linearGradient id="trailIn" x1="${START[0]}" y1="${START[1]}" x2="${BOUNCE[0]}" y2="${BOUNCE[1]}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#7de8d0" stop-opacity="0"/>
      <stop offset="1" stop-color="#9ff5df" stop-opacity="0.85"/>
    </linearGradient>
    <linearGradient id="trailOut" x1="${BOUNCE[0]}" y1="${BOUNCE[1]}" x2="${BALL[0]}" y2="${BALL[1]}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#9ff5df" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#7de8d0" stop-opacity="0.15"/>
    </linearGradient>
    <linearGradient id="line" x1="330" y1="0" x2="694" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#5fe3c8"/>
      <stop offset="0.5" stop-color="#d9fff4"/>
      <stop offset="1" stop-color="#5fe3c8"/>
    </linearGradient>
    <radialGradient id="orb" cx="0.36" cy="0.32" r="0.78">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.18" stop-color="#d4fff3"/>
      <stop offset="0.48" stop-color="#6cc9b6"/>
      <stop offset="0.8" stop-color="#1c4b55"/>
      <stop offset="1" stop-color="#0a1c26"/>
    </radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#9ff5df" stop-opacity="0.9"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="8"/>
    </filter>
  </defs>

  <!-- defense line -->
  <rect x="330" y="${BOUNCE[1] + 14}" width="364" height="26" rx="13" fill="#5fe3c8" opacity="0.65" filter="url(#glow)"/>
  <rect x="330" y="${BOUNCE[1] + 14}" width="364" height="26" rx="13" fill="url(#line)"/>
  <path d="M318 ${BOUNCE[1] + 27} l20 -20 l20 20 l-20 20z" fill="#a78bfa"/>
  <path d="M666 ${BOUNCE[1] + 27} l20 -20 l20 20 l-20 20z" fill="#a78bfa"/>

  <!-- ricochet trail -->
  <path d="${taper(START, BOUNCE, 2, 22)}" fill="url(#trailIn)"/>
  <path d="${taper(BOUNCE, BALL, 16, R * 1.5)}" fill="#7de8d0" opacity="0.35" filter="url(#glow)"/>
  <path d="${taper(BOUNCE, BALL, 10, R * 1.3)}" fill="url(#trailOut)"/>

  <!-- impact spark -->
  <circle cx="${BOUNCE[0]}" cy="${BOUNCE[1]}" r="44" fill="#ffe066" opacity="0.55" filter="url(#glow)"/>
  <path d="M${BOUNCE[0]} ${BOUNCE[1] - 62} Q${BOUNCE[0] + 9} ${BOUNCE[1] - 9} ${BOUNCE[0] + 62} ${BOUNCE[1]} Q${BOUNCE[0] + 9} ${BOUNCE[1] + 9} ${BOUNCE[0]} ${BOUNCE[1] + 30} Q${BOUNCE[0] - 9} ${BOUNCE[1] + 9} ${BOUNCE[0] - 62} ${BOUNCE[1]} Q${BOUNCE[0] - 9} ${BOUNCE[1] - 9} ${BOUNCE[0]} ${BOUNCE[1] - 62}z" fill="#fff6c8"/>

  <!-- orb -->
  <circle cx="${BALL[0]}" cy="${BALL[1]}" r="${R + 26}" fill="#7de8d0" opacity="0.45" filter="url(#glow)"/>
  <circle cx="${BALL[0]}" cy="${BALL[1]}" r="${R}" fill="url(#orb)"/>
  <circle cx="${BALL[0]}" cy="${BALL[1]}" r="${R - 3}" fill="none" stroke="url(#rim)" stroke-width="6"/>
  <ellipse cx="${BALL[0] - 40}" cy="${BALL[1] - 48}" rx="38" ry="22" transform="rotate(-35 ${BALL[0] - 40} ${BALL[1] - 48})" fill="#ffffff" opacity="0.85" filter="url(#soft)"/>`;

// Android 13+ themed icon: one flat colour, the launcher tints it.
const monochrome = `
  <path d="${taper(START, BOUNCE, 4, 24)}" fill="#fff"/>
  <path d="${taper(BOUNCE, BALL, 14, R * 1.3)}" fill="#fff"/>
  <rect x="330" y="${BOUNCE[1] + 14}" width="364" height="26" rx="13" fill="#fff"/>
  <circle cx="${BALL[0]}" cy="${BALL[1]}" r="${R}" fill="#fff"/>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${body}\n</svg>\n`;

// The flat icon (desktop, iOS, store, legacy launchers) enlarges the artwork,
// since it is not cropped by an adaptive mask.
const full = svg(`${backdrop}\n  <g transform="translate(512 512) scale(1.22) translate(-512 -540)">${foreground}\n  </g>`);

fs.writeFileSync(path.join(srcDir, 'icon.svg'), full);
fs.writeFileSync(path.join(srcDir, 'android-bg.svg'), svg(backdrop));
fs.writeFileSync(path.join(srcDir, 'android-fg.svg'), svg(foreground));
fs.writeFileSync(path.join(srcDir, 'android-monochrome.svg'), svg(monochrome));
fs.writeFileSync(path.join(srcDir, 'icons.json'), JSON.stringify({
  default: 'icon.svg',
  bg_color: BG,
  android_bg: 'android-bg.svg',
  android_fg: 'android-fg.svg',
  android_fg_scale: 100,
  android_monochrome: 'android-monochrome.svg',
}, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'public/icon.svg'), full);

execSync('npx tauri icon src-tauri/icons/source/icons.json', { cwd: root, stdio: 'inherit' });
// PNG fallback for PWA installs and iOS home-screen bookmarks.
fs.copyFileSync(path.join(root, 'src-tauri/icons/icon.png'), path.join(root, 'public/icon-512.png'));
