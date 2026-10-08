import { h } from './dom';
import { cancelWithin, enter, feedback, retire, revealItems, tabFeedback, type MotionDirection } from './motion';

export type DeckState = { section: number; page: number };
export type DeckSection = { name: string; label?: string; items: HTMLElement[] };
export type Deck = { element: HTMLElement; dispose: () => void };

/** Bounded card pages: every item stays reachable without a document-length scroll. */
export function createDeck(sections: DeckSection[], state: DeckState, className = '', animateInitial = true): Deck {
  if (!sections.length) sections = [{ name: 'Overview', items: [] }];
  const root = h('div', { class: `deck ${className}` });
  const tabs = h('div', { class: 'deck-tabs', role: 'tablist', 'aria-label': 'Categories', style: `--tab-count:${sections.length};--tab-cols:${Math.min(4, sections.length)}` });
  const content = h('div', { class: 'deck-content', role: 'tabpanel', tabindex: 0 });
  const measure = h('div', { class: 'deck-measure col', 'aria-hidden': 'true' });
  const list = h('div', { class: 'deck-list col' });
  content.append(measure, list);
  let pages: HTMLElement[][] = [], scheduled = 0, dead = false, suppressClickUntil = 0;
  let revealed = false, pendingDirection: MotionDirection | null = null;
  let lastSize = '';
  const previous = h('button', { class: 'deck-prev', 'aria-label': 'Previous page', onclick: () => move(-1) }, '‹');
  const next = h('button', { class: 'deck-next', 'aria-label': 'Next page', onclick: () => move(1) }, '›');
  const counter = h('span', { class: 'deck-count', 'aria-live': 'polite' });
  const pager = h('div', { class: 'deck-pager' }, previous, counter, next);
  root.append(...(sections.length > 1 ? [tabs] : []), content, pager);

  function showPage(direction: MotionDirection | null = null) {
    state.page = Math.max(0, Math.min(state.page, pages.length - 1));
    const focused = document.activeElement;
    cancelWithin(list);
    measure.append(...list.children);
    list.replaceChildren(...(pages[state.page] ?? []));
    previous.disabled = state.page === 0;
    next.disabled = state.page >= pages.length - 1;
    counter.textContent = `${sections[state.section].name} · ${state.page + 1} / ${Math.max(1, pages.length)}`;
    content.setAttribute('aria-label', `${sections[state.section].name}, page ${state.page + 1} of ${pages.length}`);
    root.dataset.page = String(state.page);
    root.dataset.pages = String(pages.length);
    root.dataset.section = String(state.section);
    if (focused instanceof HTMLElement && list.contains(focused)) focused.focus({ preventScroll: true });
    if ((!revealed && animateInitial) || direction !== null) {
      if (revealed) enter(list, 'content', direction ?? 0);
      revealItems(list);
      feedback(counter);
    }
    revealed = true;
  }
  function move(delta: number) {
    const page = state.page + delta;
    if (page < 0 || page >= pages.length) return;
    retire(list, 'content', delta > 0 ? 1 : -1);
    state.page = page; showPage(delta > 0 ? 1 : -1);
  }
  function layout() {
    if (dead || !root.isConnected || content.clientHeight < 1) return;
    const size = `${content.clientWidth}:${content.clientHeight}`;
    if (revealed && pendingDirection === null && size === lastSize) return;
    lastSize = size;
    const items = sections[state.section].items;
    // Measuring the real fonts/card widths also accommodates WebKit and rotation.
    measure.replaceChildren(...items);
    list.replaceChildren();
    pages = []; let page: HTMLElement[] = [], used = 0;
    const available = content.clientHeight - 4;
    for (const item of items) {
      item.classList.remove('deck-tall');
      const style = getComputedStyle(item);
      // Animation transforms must never change how many cards fit on a page.
      const height = Math.ceil(parseFloat(style.height) || item.offsetHeight) + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
      if (page.length && used + 8 + height > available) { pages.push(page); page = []; used = 0; }
      if (height > available) item.classList.add('deck-tall');
      page.push(item); used += height + (page.length > 1 ? 8 : 0);
    }
    if (page.length) pages.push(page);
    if (!pages.length) pages.push([h('div', { class: 'card muted' }, 'Nothing here yet. Keep playing to discover more.')]);
    const direction = pendingDirection;
    showPage(direction); pendingDirection = null;
    if (direction === null) tabFeedback(tabs);
  }
  function schedule() {
    cancelAnimationFrame(scheduled); scheduled = requestAnimationFrame(layout);
  }
  sections.forEach((section, index) => {
    tabs.append(h('button', { role: 'tab', 'aria-label': section.name, title: section.name, 'aria-selected': String(index === state.section), onclick: () => select(index) }, section.label ?? section.name));
  });
  function select(index: number) {
    if (index === state.section) return;
    const previousTab = (tabs.children[state.section] as HTMLElement).getBoundingClientRect();
    pendingDirection = index > state.section ? 1 : -1;
    retire(list, 'content', pendingDirection);
    state.section = index; state.page = 0;
    [...tabs.children].forEach((button, i) => button.setAttribute('aria-selected', String(i === index)));
    feedback(tabs.children[index] as HTMLElement);
    tabFeedback(tabs, previousTab);
    schedule();
  }
  tabs.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const index = e.key === 'Home' ? 0 : e.key === 'End' ? sections.length - 1 : (state.section + (e.key === 'ArrowRight' ? 1 : -1) + sections.length) % sections.length;
    select(index); (tabs.children[index] as HTMLElement).focus();
  });
  content.addEventListener('keydown', e => {
    if (e.target !== content || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault(); move(e.key === 'ArrowRight' ? 1 : -1);
  });
  let touch: { x: number; y: number } | null = null;
  content.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') touch = { x: e.clientX, y: e.clientY }; });
  content.addEventListener('pointerup', e => {
    if (!touch) return;
    const dx = e.clientX - touch.x, dy = e.clientY - touch.y; touch = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      suppressClickUntil = performance.now() + 350; move(dx < 0 ? 1 : -1);
    }
  });
  content.addEventListener('pointercancel', () => { touch = null; });
  content.addEventListener('click', e => {
    if (performance.now() < suppressClickUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  state.section = Math.max(0, Math.min(state.section, sections.length - 1));
  [...tabs.children].forEach((button, i) => button.setAttribute('aria-selected', String(i === state.section)));
  const observer = new ResizeObserver(schedule); observer.observe(content); schedule();
  return { element: root, dispose: () => { dead = true; observer.disconnect(); cancelAnimationFrame(scheduled); cancelWithin(root); } };
}

/** Turn headings into categories and lists into individual cards. Preserve their event handlers. */
export function deckSections(source: HTMLElement): DeckSection[] {
  const sections: DeckSection[] = [];
  let current: DeckSection = { name: 'Overview', items: [] };
  const add = (node: HTMLElement) => {
    if (node.matches('.col, .grid2, .settings-audio')) current.items.push(...Array.from(node.children) as HTMLElement[]);
    else if (node.matches('.row.wrap') && [...node.children].every(child => child.matches('.chip, .tag'))) current.items.push(...Array.from(node.children) as HTMLElement[]);
    else current.items.push(node);
  };
  for (const node of Array.from(source.children) as HTMLElement[]) {
    if (node.tagName === 'H3' || node.matches('.settings-section')) {
      if (current.items.length) sections.push(current);
      const heading = node.matches('.settings-section') ? node.querySelector('h3')! : node;
      current = { name: heading.textContent!.replace(/\s+\d+\/\d+$/, '').trim(), label: heading.dataset.tabLabel, items: [] };
      if (node.matches('.settings-section')) for (const child of Array.from(node.children) as HTMLElement[]) if (child !== heading) add(child);
    } else add(node);
  }
  if (current.items.length) sections.push(current);
  // A full build's stats become short, readable cards rather than an oversized table.
  for (const section of sections) section.items = section.items.flatMap(item => {
    const grid = item.querySelector('.statgrid');
    if (!grid || grid.children.length <= 4) return [item];
    const rows = Array.from(grid.children);
    return Array.from({ length: Math.ceil(rows.length / 4) }, (_, page) => {
      const card = item.cloneNode(true) as HTMLElement;
      card.querySelector('.statgrid')!.replaceChildren(...rows.slice(page * 4, page * 4 + 4).map(row => row.cloneNode(true)));
      return card;
    });
  });
  return sections;
}
