import { formatNum } from '../core/math';
import { localizeDigits, t } from '../i18n';
import { h } from './dom';
import { CURRENCY_ICON, icon, type Currency, type IconName } from './icons';

/** An amount with its currency glyph: `[coin] 1.2K`. */
export function amount(currency: Currency, n: number, cls = ''): HTMLElement {
  return h('span', { class: `amount amount-${currency} ${cls}`.trim() }, icon(CURRENCY_ICON[currency]), h('b', {}, formatNum(n)));
}

export function wallet(p: { coins: number; cores: number; research: number }): HTMLElement {
  const pill = (currency: Currency, n: number) => h('span', {
    class: `chip wallet-pill ${currency}`, title: `${n.toLocaleString()} ${t(`common.${currency}`)}`,
  }, icon(CURRENCY_ICON[currency]), h('b', {}, formatNum(n)));
  // Cores and Research join the wallet once earned; a row of unexplained zeros only adds noise.
  return h('div', { class: 'chips wallet', 'aria-label': t('common.currencies') },
    pill('coins', p.coins), p.cores > 0 ? pill('cores', p.cores) : null, p.research > 0 ? pill('research', p.research) : null);
}

/** Level pips: filled for owned ranks, an outlined "next" pip when one is on offer. */
export function pips(level: number, max: number, next = false): HTMLElement {
  const el = h('span', { class: 'pips', 'aria-label': t('common.levelOf', { level, max }) });
  for (let i = 0; i < max; i++) el.append(h('i', { class: i < level ? 'on' : next && i === level ? 'next' : '' }));
  return el;
}

export function meter(frac: number, cls = ''): HTMLElement {
  const pct = Math.max(0, Math.min(1, frac)) * 100;
  return h('div', { class: `meter ${cls}`.trim(), role: 'presentation' }, h('i', { style: `width:${pct}%` }));
}

export function badge(n: number | boolean): HTMLElement | null {
  if (!n) return null;
  return h('span', { class: `badge ${n === true ? 'dot' : ''}`.trim(), 'aria-hidden': 'true' }, n === true ? '' : n > 9 ? '9+' : String(n));
}

export function iconButton(name: IconName, label: string, onclick: (e: MouseEvent) => void, cls = ''): HTMLButtonElement {
  return h('button', { class: `icon-btn ${cls}`.trim(), 'aria-label': label, title: label, onclick }, icon(name));
}

/** A glossy sphere tinted by a core's color: the ball, as the player will see it. */
export function orb(color: string, cls = ''): HTMLElement {
  return h('span', { class: `orb ${cls}`.trim(), style: `--orb:${color}`, 'aria-hidden': 'true' });
}

/** Numbers in effect text carry the information; they are set bold so a card scans at a glance. */
export function richText(text: string): HTMLElement {
  const el = h('span', { class: 'rich' });
  // A space belongs to the number only before its percent sign: a trailing one would sit inside
  // the left-to-right number and, in Persian, end up on the wrong side of it.
  const re = /([+\-−×]?\d+(?:[.,]\d+)?(?:\s?[%٪])?|×\s?\d+(?:\.\d+)?)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) el.append(localizeDigits(text.slice(last, i)));
    el.append(h('b', { class: 'num' }, m[0]));
    last = i + m[0].length;
  }
  if (last < text.length) el.append(localizeDigits(text.slice(last)));
  return el;
}

export function sectionTitle(text: string, aside?: Node | string | null): HTMLElement {
  return h('div', { class: 'section-title' }, h('h3', {}, text), aside ? h('span', { class: 'section-aside' }, aside) : null);
}

export interface Segment { id: string; label: string; count?: string; dot?: boolean }

/** A segmented control: the selected pill slides between choices. */
export function segmented(items: Segment[], selected: string, choose: (id: string) => void, label: string): HTMLElement {
  return h('div', { class: 'segmented tabs', role: 'tablist', 'aria-label': label, style: `--n:${items.length}` },
    items.map((s) => h('button', {
      role: 'tab', 'aria-selected': String(s.id === selected), class: s.id === selected ? 'on' : '', 'data-motion-key': `segment:${s.id}`,
      onclick: () => { if (s.id !== selected) choose(s.id); },
    }, h('span', { class: 'seg-label' }, s.label), s.count ? h('small', {}, s.count) : null, s.dot ? h('span', { class: 'badge dot', 'aria-hidden': 'true' }) : null)));
}

/** Tiny stat tile used on Results and Pause. */
export function statTile(label: string, value: string | number, best = false): HTMLElement {
  return h('div', { class: `stat-tile ${best ? 'best' : ''}`.trim() },
    h('b', {}, String(value)), h('span', {}, label), best ? h('i', { class: 'best-tag' }, t('results.newBest')) : null);
}
