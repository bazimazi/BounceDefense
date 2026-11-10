/**
 * Procedural line and glyph icons. They render identically on every platform, unlike emoji,
 * and inherit `currentColor`, so one icon serves every theme and state.
 */
const STROKE: Record<string, string> = {
  play: 'M8 5.5v13l10.5-6.5L8 5.5Z',
  pause: 'M8 5v14M16 5v14',
  back: 'M15 5 8 12l7 7',
  forward: 'm9 5 7 7-7 7',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9.5h-13zM12 15v2.5',
  gear: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm7.4 3.5a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.2-1.3L14.4 3h-4l-.4 2.4a7.5 7.5 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z',
  armory: 'm12 2.5 8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3L12 2.5Zm0 5 4.3 2.4v4.2L12 16.5l-4.3-2.4V9.9L12 7.5Z',
  forge: 'M14.5 5.5a5.5 5.5 0 0 0-7.4 7.4L3.5 16.5a2.5 2.5 0 0 0 3.5 3.5l3.6-3.6a5.5 5.5 0 0 0 7.4-7.4l-3.3 3.3-3.5-3.5 3.3-3.3Z',
  battle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 3.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
  codex: 'M12 6.5C9 4.5 6 4.5 3 5.5v14c3-1 6-1 9 1 3-2 6-2 9-1v-14c-3-1-6-1-9 1Zm0 0v14',
  goals: 'M8 3.5h8v6a4 4 0 0 1-8 0v-6Zm0 2H3.5v2.5A4.5 4.5 0 0 0 8 12.5m8-7h4.5V8a4.5 4.5 0 0 1-4.5 4.5m-4 1v4.5m-4 2.5h8',
  talents: 'm12 2.5 2.6 6.9 6.9 2.6-6.9 2.6L12 21.5l-2.6-6.9L2.5 12l6.9-2.6L12 2.5Z',
  research: 'M9 3h6m-5 0v7l-5.6 8.6A1.5 1.5 0 0 0 5.6 21h12.8a1.5 1.5 0 0 0 1.2-2.4L14 10V3M7.3 15.5h9.4',
  workshop: 'M3.5 20.5h17M5.5 20.5V11l6.5-5 6.5 5v9.5M9.5 20.5v-6h5v6',
  daily: 'M7 3v4m10-4v4M3.5 9.5h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5v13.5h-17V6.5A1.5 1.5 0 0 1 5 5Zm3.5 8h2m3 0h2m-7 3.5h2',
  reroll: 'M19.5 8.5A8 8 0 0 0 5 7M4.5 15.5A8 8 0 0 0 19 17M19.5 3.5v5h-5M4.5 20.5v-5h5',
  banish: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM6 6l12 12',
  skip: 'M5.5 5.5 13 12l-7.5 6.5V5.5Zm8 0L21 12l-7.5 6.5',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  recall: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H10',
  bolt: 'M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6l1-8Z',
  heart: 'M12 20.5S3.5 15.3 3.5 9.2A4.7 4.7 0 0 1 12 6.5a4.7 4.7 0 0 1 8.5 2.7c0 6.1-8.5 11.3-8.5 11.3Z',
  skull: 'M12 3a7.5 7.5 0 0 0-4.5 13.5V20h9v-3.5A7.5 7.5 0 0 0 12 3Zm-3 8.5a1.5 1.5 0 1 0 0 .1m6-.1a1.5 1.5 0 1 0 0 .1M10.5 20v-2m3 2v-2',
  trophy: 'M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0V4Zm0 1.5H4V8a3.5 3.5 0 0 0 3.5 3.5m9-6H20V8a3.5 3.5 0 0 1-3.5 3.5M12 14v4m-4 2.5h8',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z',
  flag: 'M5.5 21V4m0 0h11l-2 4 2 4h-11',
  pin: 'M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11Zm0-13.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  pact: 'M12 3.5 4.5 7v5c0 4.5 3.2 7.6 7.5 8.5 4.3-.9 7.5-4 7.5-8.5V7L12 3.5Zm-3 8.5 2 2 4-4',
  info: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 11v5.5M12 7.5v.5',
  home: 'M3.5 11 12 4l8.5 7M6 9.5v10.5h12V9.5',
  sound: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5Zm11.5-1a5 5 0 0 1 0 7m2.5-10a8.5 8.5 0 0 1 0 13',
  vibrate: 'M8 3.5h8v17H8zM4.5 8v8M19.5 8v8M2 10v4m20-4v4',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z',
  aim: 'M12 3v4m0 10v4M3 12h4m10 0h4M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z',
  shake: 'M4 7.5 7 12l-3 4.5M20 7.5 17 12l3 4.5M9.5 6h5v12h-5z',
  number: 'M5 9h14M5 15h14M10 4.5 8 19.5m8-15-2 15',
  bug: 'M9 6.5a3 3 0 0 1 6 0M8 9.5h8v5a4 4 0 0 1-8 0v-5Zm-4 1h4m8 0h4M4 17h4m8 0h4M12 9.5v9',
  arrowUp: 'M12 19V5m-6 6 6-6 6 6',
  fire: 'M12 21.5a6.5 6.5 0 0 0 6.5-6.5c0-4-3-6-4-9.5-1.5 2-2 3.5-2 5-1-1-2-2.5-2-4.5C8 8.5 5.5 11 5.5 15a6.5 6.5 0 0 0 6.5 6.5Z',
  ball: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm-4 6a4 4 0 0 1 4-3',
};

/** Solid currency glyphs: legible at 14px and on gold or dark buttons alike. */
const FILLED: Record<string, string> = {
  coin: '<circle cx="12" cy="12" r="9.5" fill="#ffd451"/><circle cx="12" cy="12" r="9.5" fill="none" stroke="#a8650f" stroke-width="1.4"/><circle cx="12" cy="12" r="6.2" fill="none" stroke="#c98012" stroke-width="1.4"/><path d="M10.2 9.2h2.9a1.7 1.7 0 0 1 0 3.4h-2.4m0-3.4v5.6h3a1.6 1.6 0 0 0 0-3.2" fill="none" stroke="#8a4f06" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  gem: '<path d="M12 2.5 20.5 9 12 21.5 3.5 9 12 2.5Z" fill="#ff7ad9"/><path d="M12 2.5 20.5 9 12 21.5 3.5 9 12 2.5Z" fill="none" stroke="#9c2f80" stroke-width="1.2" stroke-linejoin="round"/><path d="M3.5 9h17M12 2.5 8.5 9 12 21.5 15.5 9 12 2.5" fill="none" stroke="#ffd2f2" stroke-width=".9" stroke-linejoin="round" opacity=".8"/>',
  flask: '<path d="M9.5 3h5v6.5l5.4 8.6a1.9 1.9 0 0 1-1.6 2.9H5.7a1.9 1.9 0 0 1-1.6-2.9L9.5 9.5V3Z" fill="#163a4a" stroke="#6de2ff" stroke-width="1.4" stroke-linejoin="round"/><path d="M6.3 15h11.4l2.2 3.1a1.9 1.9 0 0 1-1.6 2.9H5.7a1.9 1.9 0 0 1-1.6-2.9L6.3 15Z" fill="#6de2ff"/><path d="M8.5 3h7" stroke="#6de2ff" stroke-width="1.6" stroke-linecap="round"/>',
};

export type IconName = keyof typeof STROKE | keyof typeof FILLED;

const NS = 'http://www.w3.org/2000/svg';

export function icon(name: IconName, cls = ''): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `icon icon-${name} ${cls}`.trim());
  if (name in FILLED) {
    svg.innerHTML = FILLED[name];
    return svg;
  }
  for (const [k, v] of Object.entries({ fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) svg.setAttribute(k, v);
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', STROKE[name]);
  if (name === 'play' || name === 'bolt' || name === 'star') path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

export type Currency = 'coins' | 'cores' | 'research';
export const CURRENCY_ICON: Record<Currency, IconName> = { coins: 'coin', cores: 'gem', research: 'flask' };
