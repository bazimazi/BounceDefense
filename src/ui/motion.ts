export type MotionKind = 'page' | 'panel' | 'content' | 'sheet' | 'item' | 'hud' | 'notice';
export type MotionDirection = -1 | 0 | 1;

const ease = 'cubic-bezier(.22, .8, .25, 1)';
const active = new Set<Animation>();
const byElement = new WeakMap<HTMLElement, Animation>();
const ghosts = new Set<HTMLElement>();
let layer: HTMLElement | null = null;

export function cancelWithin(el: HTMLElement | null): void {
  if (!el) return;
  for (const animation of [...active]) {
    const target = (animation.effect as KeyframeEffect | null)?.target;
    if (target && (target === el || el.contains(target))) animation.cancel();
  }
}

function play(el: HTMLElement, frames: Keyframe[], duration: number, id: string, delay = 0, done?: () => void): void {
  byElement.get(el)?.cancel();
  if (!el.isConnected) { done?.(); return; }
  const animation = el.animate(frames, { duration, delay, easing: ease, fill: 'backwards', id: `ui:${id}` });
  active.add(animation); byElement.set(el, animation);
  const clean = () => {
    active.delete(animation);
    if (byElement.get(el) === animation) byElement.delete(el);
    done?.();
  };
  animation.onfinish = clean;
  animation.oncancel = clean;
}

function baseTransform(el: HTMLElement): string {
  byElement.get(el)?.cancel();
  const transform = getComputedStyle(el).transform;
  return transform === 'none' ? '' : transform;
}

/** Preserve layout transforms. Page movement never scales the cards being paginated. */
export function enter(el: HTMLElement, kind: MotionKind = 'content', direction: MotionDirection = 1, delay = 0): void {
  if (!el.isConnected) return;
  const base = baseTransform(el), page = kind === 'page', flat = kind === 'hud';
  const x = page ? direction * 64 : kind === 'content' ? direction * 36 : 0;
  const y = kind === 'sheet' ? 44 : kind === 'panel' ? 30 : kind === 'notice' ? -14 : kind === 'item' ? 18 : kind === 'content' && !direction ? 12 : 0;
  const duration = page ? 360 : kind === 'sheet' || kind === 'panel' ? 320 : kind === 'item' ? 280 : 260;
  const settled = base || 'none';
  const opacity = Number(getComputedStyle(el).opacity);
  play(el, [
    { opacity: 0, transform: flat ? settled : `translate3d(${x}px, ${y}px, 0) ${base}` },
    { opacity, offset: .76, transform: flat ? settled : `translate3d(${-x * .05}px, ${-y * .08}px, 0) ${base}` },
    { opacity, transform: settled },
  ], duration, `${kind}-in:${direction}`, delay);
}

/** A short acknowledgment, rather than replaying a whole page for a local change. */
export function feedback(el: HTMLElement | null): void {
  if (!el || !el.isConnected) return;
  byElement.get(el)?.cancel();
  const style = getComputedStyle(el);
  if (style.visibility === 'hidden' || !el.offsetWidth || !el.offsetHeight) return;
  const color = style.getPropertyValue('--tree-color').trim() || style.getPropertyValue('--tile-color').trim() || style.getPropertyValue('--accent').trim();
  play(el, [
    { scale: '.96', boxShadow: style.boxShadow },
    { scale: '1.025', offset: .5, boxShadow: `0 0 0 1px ${color}, 0 0 18px color-mix(in srgb, ${color} 35%, transparent)` },
    { scale: '1', boxShadow: style.boxShadow },
  ], 300, 'feedback');
}

/** Freeze a departing view outside #ui; it has no focus, input, IDs or live handlers. */
export function retire(el: HTMLElement | null, kind: MotionKind = 'content', direction: MotionDirection = 1): void {
  if (!el || !el.isConnected) return;
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height || getComputedStyle(el).visibility === 'hidden') return;
  if (!layer) {
    layer = document.createElement('div'); layer.className = 'ui-motion-layer';
    layer.setAttribute('aria-hidden', 'true'); layer.inert = true;
    (document.getElementById('app') ?? document.body).append(layer);
  }
  // Rapid navigation leaves at most three brief, noninteractive departure frames.
  while (ghosts.size >= 3) {
    const oldest = ghosts.values().next().value!;
    byElement.get(oldest)?.cancel(); oldest.remove(); ghosts.delete(oldest);
  }
  const clone = el.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
  for (const node of clone.querySelectorAll('[id]')) node.removeAttribute('id');
  clone.setAttribute('data-motion-ghost', ''); clone.setAttribute('aria-hidden', 'true'); clone.inert = true;
  Object.assign(clone.style, {
    position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, right: 'auto', bottom: 'auto',
    width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', transform: 'none',
    display: getComputedStyle(el).display, pointerEvents: 'none',
  });
  layer.append(clone); ghosts.add(clone);
  const x = kind === 'page' ? -direction * 44 : kind === 'content' ? -direction * 28 : 0;
  const y = kind === 'sheet' || kind === 'panel' ? 24 : kind === 'notice' ? -12 : 0;
  play(clone, [
    { opacity: getComputedStyle(el).opacity, transform: 'translate3d(0,0,0)' },
    { opacity: 0, transform: `translate3d(${x}px,${y}px,0)` },
  ], 220, `${kind}-out:${direction}`, 0, () => { clone.remove(); ghosts.delete(clone); });
}

export function revealItems(parent: HTMLElement, selector?: string): void {
  const items = selector ? [...parent.querySelectorAll(selector)] : [...parent.children];
  items.filter((el): el is HTMLElement => el instanceof HTMLElement && el.offsetWidth > 0 && el.offsetHeight > 0).slice(0, 10).forEach((el, index) => {
    enter(el, 'item', 0, index * 24);
  });
}

/** Staged entrances share the same timing on Home, menus, results and run overlays. */
export function revealView(el: HTMLElement): void {
  for (const header of el.querySelectorAll<HTMLElement>(':scope > .topbar, :scope > .home-topline, :scope > .lvtitle, :scope > .result-title')) enter(header, 'item', 0, 30);
  if (el.matches('.home')) {
    enter(el.querySelector<HTMLElement>('.hero')!, 'content', 0, 30);
    revealItems(el, '.launch-button, .core-readout, .home-nav-tile, .first-run-guide, .home-stats');
  }
  for (const tabs of el.querySelectorAll<HTMLElement>('.tabs, .deck-tabs, .talent-tabs')) {
    revealItems(tabs, 'button'); tabFeedback(tabs);
  }
  const tree = el.querySelector<HTMLElement>('.talent-tree.active');
  if (tree) revealItems(tree, '.talent-slot');
  revealItems(el, ':scope > button');
  for (const footer of el.querySelectorAll<HTMLElement>(':scope > .row, .setup-footer, .overlay-actions, .offer-actions, .talent-footer')) enter(footer, 'item', 0, 90);
}

/** A moving highlight makes category changes visible even when the controls stay in place. */
export function tabFeedback(tabs: HTMLElement, previous?: DOMRect): void {
  const selected = tabs.querySelector<HTMLElement>('button[aria-selected="true"], button[aria-pressed="true"], button.on');
  if (!selected || !selected.offsetWidth || !tabs.isConnected) return;
  let indicator = tabs.querySelector<HTMLElement>(':scope > .ui-tab-indicator');
  const from = previous ?? indicator?.getBoundingClientRect();
  if (!indicator) {
    indicator = document.createElement('span'); indicator.className = 'ui-tab-indicator';
    indicator.setAttribute('aria-hidden', 'true'); tabs.append(indicator);
  }
  byElement.get(indicator)?.cancel();
  Object.assign(indicator.style, {
    left: `${selected.offsetLeft}px`, top: `${selected.offsetTop}px`, width: `${selected.offsetWidth}px`, height: `${selected.offsetHeight}px`,
  });
  const color = getComputedStyle(selected).getPropertyValue('--tree-color');
  if (color) indicator.style.setProperty('--tree-color', color);
  else indicator.style.removeProperty('--tree-color');
  if (from) {
    const to = indicator.getBoundingClientRect();
    if (Math.abs(from.left - to.left) < .5 && Math.abs(from.top - to.top) < .5) return;
    play(indicator, [
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)`, opacity: .6 },
      { transform: 'translate(0,0)', opacity: 1 },
    ], 320, 'tab-travel');
  }
}
