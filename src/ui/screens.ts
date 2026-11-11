import { formatNum, formatTime } from '../core/math';
import { dailySeed } from '../core/rng';
import { ARENAS, ARENA_MAP, DIFFICULTIES, EVENT_MAP, PACTS } from '../data/arenas';
import { CORES, CORE_MAP, PART_MAP, TRAILS } from '../data/balls';
import { ALL_BOSSES, BOSSES, BOSS_MAP, CODEX_ENEMIES } from '../data/enemies';
import {
  ACHIEVEMENTS, ALL_WORKSHOP, BLUEPRINTS, CHALLENGES, OVERDRIVE, OVERDRIVE_MAX, OVERDRIVE_PER_TIER, REFITS, REFIT_MASTERY_STEP, RESEARCH, WORKSHOP,
  WORKSHOP_MAP, masteryLevel, masteryRewards, rankLevel, rankRewards, type WorkshopDef,
} from '../data/meta';
import { ASCENSIONS, ASCENSION_REWARD, ASCENSION_TIER } from '../data/ascension';
import { CONTRACT_MAP } from '../data/contracts';
import { RELICS, RELIC_COLOR, RELIC_MAP } from '../data/relics';
import { EVOLUTIONS, EVOLUTION_MAP, REACTIONS, SYNERGIES, SYNERGY_MAP } from '../data/synergies';
import { UPGRADES, UPGRADE_MAP } from '../data/upgrades';
import { TALENTS, talentSpent } from '../data/talents';
import type { PartSlot, Rarity, Tag } from '../data/types';
import {
  buyPart, buyWorkshop, canResearch, canUnlockCore, contractBoard, contractText, coreRequirementMet, dailyRecord, describeUnlock, doResearch,
  isArenaUnlocked, isRelicUnlocked, maxDifficulty, nextGoals, overdriveOpen, partsForSlot, researchLock, rewardMultiplier, unlockCore, workshopCap, workshopCost, workshopLock,
  type Goal, type RunReport,
} from '../meta/progress';
import { defaultProfile } from '../meta/profile';
import { talentProgress } from '../meta/talents';
import type { DiscoveryCat, RunSummary } from '../meta/types';
import { createArenaSurface } from '../render/arena';
import { feedsEvolutions, previewSynergies, type Offer } from '../sim/offers';
import { STAT_FORMATS, statLabel, type StatKey } from '../sim/stats';
import { FIELD_TOP } from '../sim/types';
import type { World } from '../sim/world';
import type { Game } from '../game';
import { LANGUAGES, localizeDigits, t, type UiKey } from '../i18n';
import { amount, badge, iconButton, meter, orb, pips, richText, sectionTitle, segmented, statTile, wallet } from './components';
import { h } from './dom';
import { icon, type IconName } from './icons';
import { Navigation } from './navigation';
import { cancelWithin, enter, feedback, retire, revealItems, revealView, tabFeedback, type MotionDirection } from './motion';
import { newTalentState, talentPanel } from './talents';

const rarityLabel = (r: Rarity) => t(`rarity.${r}` as UiKey);
const tierLabel = (tier: 'known' | 'hidden' | 'legendary') => t(`tier.${tier}` as UiKey);
const tagLabel = (tag: Tag) => t(`tag.${tag}` as UiKey);
const discoveryLabel = (cat: DiscoveryCat) => t(`discovery.${cat}` as UiKey);
const elementName = (el: string) => t(`elementName.${el}` as UiKey);

/** "Striker Explosive": the distinguishing word of the core and impact, derived live so it follows the language. */
function presetLabel(preset: { core: string; impact: string }): string {
  const short = (name: string) => { const words = name.split(' '); return (t('loadout.presetWord') === 'last' ? words.at(-1) : words[0]) ?? ''; };
  return t('loadout.presetName', { core: short(CORE_MAP[preset.core]?.name ?? preset.core), impact: short(PART_MAP[preset.impact]?.name ?? '') }).trim();
}

export type HubTab = 'armory' | 'forge' | 'battle' | 'codex' | 'goals';
const HUB_TABS: HubTab[] = ['armory', 'forge', 'battle', 'codex', 'goals'];
type ForgeSegment = 'workshop' | 'research' | 'talents';
type WorkshopTab = 'classic' | 'blueprints' | 'refits' | 'overdrive';
type ResearchTab = 'core' | 'advanced' | 'apex';
const RESEARCH_TABS: ResearchTab[] = ['core', 'advanced', 'apex'];
const researchBranch = (r: { branch?: 'advanced' | 'apex' }): ResearchTab => r.branch ?? 'core';
const WORKSHOP_TABS: [WorkshopTab, WorkshopDef[]][] = [['classic', WORKSHOP], ['blueprints', BLUEPRINTS], ['refits', REFITS], ['overdrive', OVERDRIVE]];
type GoalSegment = 'next' | 'challenges' | 'badges' | 'mastery';
const DRAFT_ARM_MS = 420;

/** Arena floors are baked once and cropped into the Battle carousel: each card shows the real place. */
const arenaSurfaces = new Map<string, HTMLCanvasElement>();
function arenaThumb(id: string): HTMLCanvasElement {
  const canvas = h('canvas', { class: 'arena-thumb', width: 270, height: 150, 'aria-hidden': 'true' });
  try {
    let surface = arenaSurfaces.get(id);
    if (!surface) { surface = createArenaSurface(ARENA_MAP[id]); arenaSurfaces.set(id, surface); }
    canvas.getContext('2d')?.drawImage(surface, 0, 150, 540, 300, 0, 0, 270, 150);
  } catch { /* A missing 2D context only loses the preview image. */ }
  return canvas;
}

interface CodexEntry { id: string; known: boolean; name: string; glyph: Node | string; color?: string; lines: (string | Node)[]; hint: string }

/** Tab-like controls whose selection moves a pill, and the containers whose scroll survives a re-render. */
const SEGMENTS = '.segmented, .talent-tabs, .codex-tabs, .workshop-tabs, .research-tabs';
const SELECTED = '[aria-selected="true"], [aria-checked="true"], .on';
const SCROLLERS = '.scroll, .chip-scroller';
const segmentKind = (tabs: Element) => ['segmented', 'talent-tabs', 'codex-tabs', 'workshop-tabs', 'research-tabs'].find(c => tabs.classList.contains(c)) ?? '';
interface ViewSnapshot {
  scrolls: [number, number][];
  segments: Record<string, { index: number; rect?: DOMRect }>;
  tabbar?: DOMRect;
  body: string | null;
  wallet: string | null;
}

export class UI {
  readonly navigation = new Navigation();
  private root: HTMLElement;
  private hudEl: HTMLElement | null = null;
  private surgeBtn: HTMLButtonElement | null = null;
  private recallBtn: HTMLButtonElement | null = null;
  private compactTelemetry: HTMLElement | null = null;
  private hintEl: HTMLElement | null = null;
  private handEl: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private screenEl: HTMLElement | null = null;
  private setup = { arena: 'proving', difficulty: 0, pacts: new Set<string>(), ascension: 0 };
  private forgeSegment: ForgeSegment = 'workshop';
  private workshopTab: WorkshopTab = 'classic';
  private researchTab: ResearchTab = 'core';
  private goalSegment: GoalSegment = 'next';
  private codexTab = 'balls';
  private armoryIndex = -1;
  private talentState = newTalentState();
  private banishMode = false;
  private interactionKey: string | null = null;
  private rerollLockedUntil = 0;

  constructor(root: HTMLElement, private game: Game) {
    this.root = root;
    root.addEventListener('click', event => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest<HTMLElement>('button, [role="button"]');
      if (!control || control.matches(':disabled')) return;
      this.interactionKey = event.target.closest<HTMLElement>('[data-motion-key]')?.dataset.motionKey ?? null;
      queueMicrotask(() => {
        if (root.contains(control) && !control.getAnimations().some(animation => animation.id === 'ui:feedback')) feedback(control);
      });
    }, true);
  }

  layout(rect: { x: number; y: number; w: number; h: number }): void {
    Object.assign(this.root.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
    this.root.style.setProperty('--s', String(rect.w / 540));
    // Home fades the live arena into the page: where its field begins, and how far the canvas
    // sits inside the centered menu column (desktop and landscape letterbox it at the sides).
    this.root.style.setProperty('--field-top', `${Math.round(rect.y + FIELD_TOP * rect.w / 540)}px`);
    this.root.style.setProperty('--stage-inset', `${Math.max(0, Math.round(rect.x - Math.max(0, (innerWidth - (innerHeight <= 500 ? 820 : 560)) / 2)))}px`);
    this.root.toggleAttribute('data-compact-hud', rect.w < 300 && innerWidth > innerHeight);
    this.root.toggleAttribute('data-small-controls', rect.w < 360);
  }

  private get p() {
    return this.game.profile;
  }

  get arenaHudVisible(): boolean {
    return !this.screenEl && !this.overlay;
  }

  private click(): void {
    this.game.audio.play('click');
  }

  private get motionDirection(): MotionDirection {
    return this.navigation.direction === 'back' ? -1 : 1;
  }

  // ------------------------------------------------------------------ view plumbing
  /**
   * Everything a re-render must carry over, read while the old view is still attached and before
   * its animations are cancelled: a detached element measures as 0,0, and a cancelled indicator
   * jumps to its end. Indicators are measured where they are drawn, so a rapid second tap retargets
   * the pill from mid-flight instead of restarting it.
   */
  private snapshot(el: HTMLElement | null): ViewSnapshot {
    const selected = (tabs: Element) => [...tabs.children].findIndex(c => c.matches(SELECTED));
    const at = (tabs: Element | null | undefined) => {
      if (!tabs) return undefined;
      const indicator = tabs.querySelector<HTMLElement>(':scope > .ui-tab-indicator');
      return (indicator && indicator.offsetWidth ? indicator : tabs.children[selected(tabs)])?.getBoundingClientRect();
    };
    return {
      scrolls: el ? [...el.querySelectorAll<HTMLElement>(SCROLLERS)].map(s => [s.scrollTop, s.scrollLeft]) : [],
      segments: Object.fromEntries(el ? [...el.querySelectorAll<HTMLElement>(SEGMENTS)].map(tabs => [segmentKind(tabs), { index: selected(tabs), rect: at(tabs) }]) : []),
      tabbar: at(el?.querySelector('.tabbar')),
      body: el?.querySelector<HTMLElement>('[data-segment-body]')?.dataset.segmentBody ?? null,
      wallet: el?.querySelector('.wallet')?.textContent ?? null,
    };
  }

  private restoreScroll(el: HTMLElement, snap: ViewSnapshot, keepBody: boolean): void {
    el.querySelectorAll<HTMLElement>(SCROLLERS).forEach((s, i) => {
      const [top, left] = snap.scrolls[i] ?? [0, 0];
      // A new segment starts at its top; rails and the rest of the page keep their place.
      if (top && (keepBody || !s.hasAttribute('data-segment-body'))) s.scrollTop = top;
      if (left) s.scrollLeft = left;
    });
    // A chosen chip at the edge of a sideways rail is brought fully into view.
    for (const rail of el.querySelectorAll<HTMLElement>('.chip-scroller')) {
      const chip = rail.querySelector<HTMLElement>(SELECTED);
      if (!chip) continue;
      const r = rail.getBoundingClientRect(), c = chip.getBoundingClientRect();
      if (c.left < r.left) rail.scrollLeft -= r.left - c.left + 16;
      else if (c.right > r.right) rail.scrollLeft += c.right - r.right + 16;
    }
  }

  /** A local change re-renders in place: keep the scroll position and acknowledge the touched control. */
  private settle(snap: ViewSnapshot, el: HTMLElement, interactionKey: string | null): void {
    const body = el.querySelector<HTMLElement>('[data-segment-body]');
    const segmentChanged = !!body && snap.body !== null && body.dataset.segmentBody !== snap.body;
    this.restoreScroll(el, snap, !segmentChanged);
    for (const tabs of el.querySelectorAll<HTMLElement>(SEGMENTS)) {
      const before = snap.segments[segmentKind(tabs)];
      tabFeedback(tabs, before?.rect);
      const index = [...tabs.children].findIndex(c => c.matches(SELECTED));
      if (!before || before.index < 0 || index < 0 || index === before.index) continue;
      // Each control slides the content it switches: a page segment its body, the talent tabs their tree.
      const target = tabs.dataset.body ? el.querySelector<HTMLElement>(tabs.dataset.body) : segmentChanged ? body : null;
      if (target) enter(target, 'content', index > before.index ? 1 : -1);
    }
    // The sliding pill is a segment's acknowledgement; a second pulse ring would compete with it.
    const target = interactionKey ? el.querySelector<HTMLElement>(`[data-motion-key="${CSS.escape(interactionKey)}"]`) : null;
    if (target && !target.closest(SEGMENTS)) requestAnimationFrame(() => { if (target.isConnected) feedback(target); });
    if (snap.wallet !== null && snap.wallet !== el.querySelector('.wallet')?.textContent) feedback(el.querySelector('.wallet'));
  }

  private show(el: HTMLElement): void {
    this.closeOverlay();
    if (this.screenEl === el) return;
    const old = this.screenEl;
    const same = !!old && old.dataset.view === this.navigation.key;
    const interactionKey = this.interactionKey; this.interactionKey = null;
    const snap = this.snapshot(same ? old : null);
    if (!same) retire(old, 'page', this.motionDirection);
    cancelWithin(old);
    old?.remove();
    this.screenEl = el;
    el.dataset.view = this.navigation.key;
    this.root.append(el);
    if (same) this.settle(snap, el, interactionKey);
    else {
      enter(el, 'page', this.motionDirection);
      revealView(el);
    }
  }

  /**
   * The hub chrome (wallet, tab bar) stays put; only the page body changes. The outgoing page is
   * removed at once rather than cross-faded: two half-transparent pages over each other read as a
   * glitch. The incoming page slides in from the side of the tab that was tapped.
   */
  private renderHub(tab: HubTab, page: HTMLElement): void {
    const old = this.screenEl;
    const oldTab = old?.classList.contains('hub') && old.isConnected ? old.dataset.tab as HubTab : null;
    const shell = this.hubShell(tab, page);
    if (!oldTab || !old) { this.show(shell); return; }
    this.closeOverlay();
    const interactionKey = this.interactionKey; this.interactionKey = null;
    const same = oldTab === tab;
    const snap = this.snapshot(old);
    const direction: MotionDirection = HUB_TABS.indexOf(tab) > HUB_TABS.indexOf(oldTab) ? 1 : -1;
    cancelWithin(old);
    old.remove();
    this.screenEl = shell;
    shell.dataset.view = this.navigation.key;
    this.root.append(shell);
    const tabbar = shell.querySelector<HTMLElement>('.tabbar');
    if (tabbar) tabFeedback(tabbar, snap.tabbar);
    if (same) this.settle(snap, shell, interactionKey);
    else {
      enter(shell.querySelector<HTMLElement>('.hub-page')!, 'content', direction);
      for (const tabs of shell.querySelectorAll<HTMLElement>(SEGMENTS)) tabFeedback(tabs);
    }
  }

  private hubShell(tab: HubTab, page: HTMLElement): HTMLElement {
    const p = this.p;
    const first = !p.tutorialDone;
    // Battle carries the big logo, so its header is only the wallet and Settings.
    const title = tab === 'battle' ? null : t(`tab.${tab}` as UiKey);
    const badges = this.badges();
    return h('div', { class: `screen hub hub-${tab}`, 'data-tab': tab },
      h('header', { class: 'hub-top' },
        title ? h('h2', { class: 'hub-title' }, title) : null,
        first ? null : wallet(p),
        iconButton('gear', t('common.settings'), () => { this.click(); this.settings(); }, 'settings-btn')),
      h('main', { class: 'hub-page' }, page),
      first ? null : h('nav', { class: 'tabbar', role: 'tablist', 'aria-label': t('tab.label') }, HUB_TABS.map(id =>
        h('button', {
          role: 'tab', class: `tab tab-${id}`, 'aria-selected': String(id === tab), 'data-tab': id,
          onclick: () => { if (id !== tab) { this.click(); this.openTab(id); } },
        },
        h('span', { class: 'tab-icon' }, icon(id as IconName), badge(badges[id])),
        h('span', { class: 'tab-label' }, t(`tab.${id}` as UiKey))))),
    );
  }

  /** Red dots mean "something here can be done now", never just "something is new". */
  private badges(): Record<HubTab, number | boolean> {
    const p = this.p;
    const coreReady = CORES.some(c => canUnlockCore(p, c.id));
    const partReady = (['shell', 'impact', 'momentum'] as PartSlot[]).some(s => partsForSlot(p, s).some(x => !x.unlocked && x.def.unlock?.coins && p.coins >= x.def.unlock.coins));
    const talentPoints = talentProgress(p).total - talentSpent(p.talents);
    return {
      armory: coreReady || partReady,
      forge: this.workshopReady() || RESEARCH.some(r => canResearch(p, r.id)) || talentPoints > 0,
      battle: false,
      codex: false,
      goals: false,
    };
  }

  private workshopReady(list: WorkshopDef[] = ALL_WORKSHOP): boolean {
    return list.some(wd => { const c = workshopCost(this.p, wd.id); return c !== null && this.p.coins >= c; });
  }

  private openTab(tab: HubTab): void {
    if (tab === 'battle') {
      if (this.navigation.key !== 'home') this.navigation.back();
      else this.home();
      return;
    }
    const restore = () => this.renderTab(tab);
    if ((HUB_TABS as string[]).includes(this.navigation.key) && this.navigation.key !== 'home') this.navigation.replace(tab, restore);
    else this.navigation.view(tab, restore);
    this.renderTab(tab);
  }

  private renderTab(tab: HubTab): void {
    if (tab === 'battle') { this.home(); return; }
    const page = tab === 'armory' ? this.armoryPage() : tab === 'forge' ? this.forgePage() : tab === 'codex' ? this.codexPage() : this.goalsPage();
    this.renderHub(tab, page);
  }

  private rerender(): void {
    const key = this.navigation.key;
    if (key === 'home') this.home();
    else if ((HUB_TABS as string[]).includes(key)) this.renderTab(key as HubTab);
  }

  clearScreen(): void {
    retire(this.screenEl, 'page', this.motionDirection);
    cancelWithin(this.screenEl);
    this.screenEl?.remove();
    this.screenEl = null;
  }

  toast(text: string, glyph: IconName = 'check'): void {
    const el = h('div', { class: 'toast', role: 'status' }, icon(glyph), h('span', {}, text));
    this.root.append(el);
    enter(el, 'notice', 0);
    setTimeout(() => { retire(el, 'notice', 0); cancelWithin(el); el.remove(); }, 1900);
  }

  back(): boolean {
    return this.navigation.back();
  }

  private topbar(title: string, showWallet = true): HTMLElement {
    return h('div', { class: 'topbar menu-topbar' },
      iconButton('back', t('common.back'), () => { this.click(); this.back(); }, 'back-btn'),
      h('h2', {}, title),
      showWallet ? wallet(this.p) : null,
    );
  }

  private goalCard(g: Goal, onclick?: () => void): HTMLElement {
    return h(onclick ? 'button' : 'div', { class: 'goal-card', onclick },
      h('span', { class: 'goal-icon' }, icon('flag')),
      h('span', { class: 'goal-copy' },
        h('span', { class: 'goal-text' }, g.text),
        g.max > 1 ? meter(g.cur / g.max, 'gold thin') : null,
        h('span', { class: 'goal-reward' }, icon('star'), g.reward)),
      g.max > 1 ? h('span', { class: 'goal-count' }, `${Math.floor(Math.min(g.cur, g.max))}/${g.max}`) : null);
  }

  // ------------------------------------------------------------------ sheets & dialogs
  /** Bottom sheets keep the page underneath in view and close with Back, the scrim or ×. */
  private openSheet(key: string, title: string, build: () => (Node | null)[], cls = '', footer?: () => (Node | null)[]): void {
    const render = () => {
      const close = () => { this.click(); this.navigation.dismiss(); };
      const el = h('div', { class: `levelup sheet-layer ${cls}`.trim(), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'sheet-scrim', onclick: close }),
        h('div', { class: 'sheet' },
          h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
          h('div', { class: 'sheet-head' }, h('h3', {}, title), iconButton('close', t('common.close'), close, 'sheet-close')),
          h('div', { class: 'sheet-body scroll' }, build()),
          footer ? h('div', { class: 'sheet-foot' }, footer()) : null));
      this.showOverlay(el, `sheet:${key}`);
    };
    this.navigation.view(`sheet:${key}`, render);
    render();
  }

  private confirmAction(title: string, message: string, label: string, proceed: () => void, cancel: () => void, cancelLabel = t('pause.keepPlaying'), relevant = () => true): void {
    const world = this.game.world;
    this.navigation.view(`confirm:${title}`, () => this.confirmAction(title, message, label, proceed, cancel, cancelLabel, relevant), {
      cancel, valid: () => (!world || this.game.world === world) && relevant(),
    });
    const back = h('button', { onclick: () => this.navigation.dismiss() }, cancelLabel);
    const confirm = h('button', { class: 'danger', onclick: () => { this.closeOverlay(); proceed(); } }, label);
    const overlay = h('div', { class: 'levelup confirm-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal' },
        h('div', { class: 'modal-icon' }, icon('info')),
        h('div', { class: 'lvtitle' }, title), h('p', {}, message),
        h('div', { class: 'row modal-actions' }, back, confirm)));
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === back ? confirm : back).focus(); }
    });
    this.showOverlay(overlay, `confirm:${title}`); back.focus({ preventScroll: true });
  }

  private showOverlay(el: HTMLElement, key: string): void {
    const same = this.overlay?.dataset.view === key;
    if (!same) retire(this.overlay, 'panel', 0);
    cancelWithin(this.overlay);
    this.overlay?.remove();
    this.overlay = el; el.dataset.view = key;
    this.root.append(el);
    if (same) return;
    const panel = el.querySelector<HTMLElement>('.sheet, .modal') ?? el;
    enter(panel, panel === el ? 'panel' : 'sheet', 0);
    revealView(el);
  }

  private closeOverlay(): void {
    retire(this.overlay, 'panel', 0);
    cancelWithin(this.overlay);
    this.overlay?.remove();
    this.overlay = null;
  }

  // ------------------------------------------------------------------ battle (home)
  home(): void {
    this.navigation.reset(() => this.home());
    this.game.toMenu();
    this.renderHub('battle', this.battlePage());
  }

  /** Kept for callers of the former Run Setup page: the Battle tab now holds every launch choice. */
  runSetup(): void {
    this.home();
  }

  /**
   * Home is a lobby: the live arena and the logo above, then one decision and one action. Run
   * options live behind the run card in a sheet, so the page never stacks more than two controls
   * above the tab bar.
   */
  private battlePage(): HTMLElement {
    const p = this.p;
    const s = this.setup;
    const first = !p.tutorialDone;
    const choice = this.setupChoices();
    if (!ARENA_MAP[s.arena]) s.arena = 'proving';
    s.difficulty = Math.min(s.difficulty, maxDifficulty(p));
    s.ascension = Math.max(0, Math.min(s.ascension, p.ascension));
    if (!choice.pacts) s.pacts.clear();
    for (const id of [...s.pacts]) if (!this.pactAvailable(id)) s.pacts.delete(id);
    if (!choice.arena) s.arena = ARENAS.find(a => isArenaUnlocked(p, a.id))?.id ?? 'proving';
    this.game.previewArena(first ? 'proving' : s.arena);
    // English splits the logo over two lines; a one-word brand (Persian "توپاد") leaves the second empty.
    const title2 = t('home.title2');
    const goal = first ? undefined : nextGoals(p, 1)[0];
    const stage = h('div', { class: 'battle-stage' },
      h('h1', { class: 'title logo' }, t('home.title1'), title2 ? h('span', {}, title2) : null),
      first ? h('p', { class: 'tagline' }, t('home.subtitle')) : null,
      goal ? this.goalChip(goal) : null);
    // First visit: the logo and one button. The run itself teaches aiming with a guide hand.
    if (first) return h('div', { class: 'battle first-run' }, stage, h('div', { class: 'battle-panel' }, this.playButton({ arena: 'proving', difficulty: 0, pacts: [] })));

    // Every choice appears only once it is a real choice: a second arena, a second difficulty
    // (after the first clear, which also opens the Daily Seed) or researched pacts.
    const configurable = choice.arena || choice.difficulty || choice.pacts;
    const daily = dailyRecord(p);
    return h('div', { class: `battle ${configurable ? '' : 'lean'}` }, stage,
      h('div', { class: 'battle-panel reveal' },
        configurable ? this.runCard(choice.arena) : null,
        h('div', { class: 'play-row' },
          choice.difficulty ? h('button', { class: 'daily-btn', 'aria-label': t('home.nav.daily'), title: t('home.nav.daily'), onclick: () => { this.click(); this.dailyRun(); } },
            icon('daily'), h('span', {}, t('home.dailyShort')), badge(!daily.claimed)) : null,
          this.playButton(this.runOptions(), isArenaUnlocked(p, s.arena)))));
  }

  /** The current setup as run options; Ascension only rides along on Abyss and above. */
  private runOptions(): { arena: string; difficulty: number; pacts: string[]; ascension: number } {
    const s = this.setup;
    return { arena: s.arena, difficulty: s.difficulty, pacts: [...s.pacts], ascension: s.difficulty >= ASCENSION_TIER ? s.ascension : 0 };
  }

  private pactAvailable(id: string): boolean {
    const pc = PACTS.find(x => x.id === id);
    return !!pc && (!pc.flag || this.game.flags().includes(pc.flag));
  }

  private setupChoices(): { arena: boolean; difficulty: boolean; pacts: boolean } {
    const p = this.p;
    return {
      arena: ARENAS.filter(a => isArenaUnlocked(p, a.id)).length > 1,
      difficulty: maxDifficulty(p) > 0,
      pacts: this.game.flags().includes('pacts'),
    };
  }

  private playButton(config: { arena: string; difficulty: number; pacts: string[]; ascension?: number }, enabled = true): HTMLButtonElement {
    return h('button', {
      class: 'primary big launch-button play-btn', disabled: !enabled,
      onclick: () => { this.click(); this.game.startRun(config); },
    }, icon(enabled ? 'play' : 'lock'), h('strong', {}, t('home.play')));
  }

  /** The next goal, one line under the logo; its bottom edge fills as it nears completion. */
  private goalChip(goal: Goal): HTMLElement {
    const progress = goal.max > 1 ? Math.max(0, Math.min(1, goal.cur / goal.max)) : 0;
    return h('button', {
      class: 'goal-chip', style: `--p:${progress.toFixed(3)}`, 'aria-label': `${t('home.nextGoal')}: ${goal.text}`,
      onclick: () => { this.click(); this.goalSegment = 'next'; this.openTab('goals'); },
    }, icon('flag'), h('span', { class: 'goal-chip-text' }, goal.text), icon('forward', 'chev'));
  }

  private moveArena(d: number): void {
    const s = this.setup;
    const index = Math.max(0, ARENAS.findIndex(a => a.id === s.arena));
    s.arena = ARENAS[(index + d + ARENAS.length) % ARENAS.length].id;
    this.click();
    this.game.previewArena(s.arena);
  }

  /** The current setup in one line; it opens the Run setup sheet, and swipes through arenas. */
  private runCard(arenaChoice: boolean): HTMLElement {
    const p = this.p;
    const s = this.setup;
    const arena = ARENA_MAP[s.arena];
    const unlocked = isArenaUnlocked(p, arena.id);
    const difficulty = DIFFICULTIES[s.difficulty];
    const opts = this.runOptions();
    const mult = rewardMultiplier(opts);
    const diffName = opts.ascension ? t('home.ascensionTag', { difficulty: difficulty.name, n: opts.ascension }) : difficulty.name;
    const card = h('button', {
      class: `run-card ${unlocked ? '' : 'locked'}`, style: `--accent:${arena.theme.accent}`, 'data-motion-key': `arena:${arena.id}`,
      onclick: () => { this.click(); this.runSheet(); },
    },
    h('span', { class: 'run-emblem', 'aria-hidden': 'true' }, icon(unlocked ? 'pin' : 'lock')),
    h('span', { class: 'run-copy' },
      h('b', {}, arena.name),
      h('small', {}, unlocked
        ? [h('i', { class: 'dot', style: `background:${difficulty.color}` }), mult !== 1 ? t('home.playReward', { difficulty: diffName, n: mult.toFixed(2) }) : diffName]
        : arena.unlockReq?.text ?? '')),
    s.pacts.size ? h('span', { class: 'run-pacts', title: t('home.pactsOn', { n: s.pacts.size }) }, icon('pact'), h('b', {}, String(s.pacts.size))) : null,
    icon('forward', 'chev'));
    if (arenaChoice) this.swipe(card, d => { this.moveArena(d); this.home(); });
    return card;
  }

  private swipe(el: HTMLElement, move: (d: number) => void): void {
    let start: { x: number; y: number } | null = null;
    let swiped = 0;
    el.addEventListener('pointerdown', e => { start = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointercancel', () => { start = null; });
    el.addEventListener('pointerup', e => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y; start = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        swiped = performance.now();
        move((dx < 0 ? 1 : -1) * (document.dir === 'rtl' ? -1 : 1));
      }
    });
    // A swipe on a tappable card is not also a tap.
    el.addEventListener('click', e => { if (performance.now() - swiped < 400) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  }

  /** Arena, difficulty and pacts in one sheet, with Play at hand once the run is set. */
  runSheet(): void {
    const title = t('home.setup');
    const build = () => this.runSheetBody();
    const footer = () => {
      const s = this.setup;
      const opts = this.runOptions();
      const mult = rewardMultiplier(opts);
      return [
        mult !== 1 ? h('div', { class: 'run-total' }, icon('star'), t('setup.multiplier', { n: mult.toFixed(2) })) : null,
        this.playButton(opts, isArenaUnlocked(this.p, s.arena)),
      ];
    };
    this.runSheetRender = () => this.openSheetInPlace('run', title, build, footer);
    this.openSheet('run', title, build, 'run-sheet', footer);
  }

  private runSheetRender: (() => void) | null = null;

  private runSheetBody(): (Node | null)[] {
    const p = this.p;
    const s = this.setup;
    const choice = this.setupChoices();
    const update = () => this.runSheetRender?.();
    const arena = ARENA_MAP[s.arena];
    const index = ARENAS.indexOf(arena);
    const unlocked = isArenaUnlocked(p, arena.id);
    const cleared = p.cleared[arena.id] ?? -1;
    const boss = BOSSES.find(b => b.id === arena.bossId);
    const card = h('div', { class: `arena-card ${unlocked ? '' : 'locked'}`, style: `--accent:${arena.theme.accent}`, 'data-motion-key': `arena:${arena.id}` },
      arenaThumb(arena.id),
      h('div', { class: 'arena-info' },
        h('div', { class: 'arena-eyebrow' }, t('home.arenaN', { n: index + 1, total: ARENAS.length })),
        h('div', { class: 'arena-name' }, unlocked ? arena.name : t('common.lockedName', { name: arena.name })),
        h('div', { class: 'arena-meta' }, unlocked ? [icon('skull'), boss?.name ?? ''] : [icon('lock'), arena.unlockReq?.text ?? '']),
        cleared >= 0 ? h('span', { class: 'arena-cleared', style: `--c:${DIFFICULTIES[cleared].color}` }, icon('check'), DIFFICULTIES[cleared].name) : null));
    const move = (d: number) => { this.moveArena(d); update(); };
    if (choice.arena) this.swipe(card, move);
    const difficulty = DIFFICULTIES[s.difficulty];
    return [
      sectionTitle(t('setup.arena')),
      choice.arena ? h('div', { class: 'arena-carousel' },
        iconButton('back', t('home.prevArena'), () => move(-1), 'carousel-btn'),
        card,
        iconButton('forward', t('home.nextArena'), () => move(1), 'carousel-btn')) : card,
      ...(choice.difficulty ? [
        sectionTitle(t('setup.difficulty')),
        // Unlocked tiers plus the next one as a visible goal; later tiers stay out of the way.
        h('div', { class: 'difficulty-options', role: 'radiogroup', 'aria-label': t('setup.difficulty') }, DIFFICULTIES.slice(0, maxDifficulty(p) + 2).map((d, i) => {
          const ok = i <= maxDifficulty(p);
          return h('button', {
            role: 'radio', 'aria-checked': String(s.difficulty === i), disabled: !ok, class: s.difficulty === i ? 'on' : '',
            'data-motion-key': `difficulty:${i}`, style: `--c:${d.color}`,
            onclick: () => { if (s.difficulty === i) return; s.difficulty = i; this.click(); update(); },
          }, ok ? null : icon('lock'), h('span', {}, d.name));
        })),
        h('p', { class: 'difficulty-info' }, h('span', { class: 'dot', style: `background:${difficulty.color}` }), difficulty.desc),
        // Apex tiers name the bosses waiting at the end of the run.
        difficulty.apex?.length ? h('p', { class: 'difficulty-info difficulty-apex' }, icon('skull'), difficulty.rules[0]) : null,
        ...(s.difficulty >= ASCENSION_TIER ? this.ascensionPicker(update) : []),
      ] : []),
      ...(choice.pacts ? [
        sectionTitle(t('setup.pacts')),
        h('p', { class: 'sheet-intro' }, t('home.pactsIntro')),
        h('div', { class: 'pact-list' }, PACTS.filter(pc => this.pactAvailable(pc.id)).map(pc => h('button', {
          class: `pact-row ${s.pacts.has(pc.id) ? 'on' : ''}`, role: 'switch', 'aria-checked': String(s.pacts.has(pc.id)),
          'data-motion-key': `pact:${pc.id}`,
          onclick: () => { if (s.pacts.has(pc.id)) s.pacts.delete(pc.id); else s.pacts.add(pc.id); this.click(); update(); },
        },
        h('span', { class: 'pact-icon' }, pc.icon),
        h('span', { class: 'pact-copy' }, h('b', {}, pc.name), h('small', {}, pc.desc)),
        h('span', { class: 'pact-reward' }, t('setup.pactReward', { n: Math.round(pc.reward * 100) })),
        h('span', { class: 'check' }, icon('check'))))),
      ] : []),
    ];
  }

  /** Abyss and every tier above it carry the Ascension ladder: a stepper and the rules it adds. */
  private ascensionPicker(update: () => void): (Node | null)[] {
    const p = this.p;
    const s = this.setup;
    if (p.ascension <= 0) return [h('p', { class: 'sheet-intro ascension-hint' }, icon('lock'), t('setup.ascensionHint'))];
    const set = (n: number) => { const v = Math.max(0, Math.min(p.ascension, n)); if (v === s.ascension) return; s.ascension = v; this.click(); update(); };
    const rules = ASCENSIONS.filter(a => a.level <= s.ascension);
    return [
      sectionTitle(t('setup.ascension')),
      h('div', { class: 'ascension-stepper', 'data-motion-key': 'ascension' },
        iconButton('back', t('setup.ascensionMinus'), () => set(s.ascension - 1), 'carousel-btn'),
        h('div', { class: 'ascension-value' },
          h('b', {}, s.ascension ? t('setup.ascensionLevel', { n: s.ascension }) : t('setup.ascensionOff')),
          s.ascension ? h('small', {}, t('setup.pactReward', { n: Math.round(ASCENSION_REWARD * s.ascension * 100) })) : null),
        iconButton('forward', t('setup.ascensionPlus'), () => set(s.ascension + 1), 'carousel-btn')),
      rules.length ? h('details', { class: 'ascension-rules' },
        h('summary', {}, t('setup.ascensionRules'), h('b', {}, String(rules.length))),
        h('ol', {}, rules.map(a => h('li', {}, a.desc)))) : null,
    ];
  }

  /** Re-render an open sheet's contents without a new history entry. */
  private openSheetInPlace(key: string, title: string, build: () => (Node | null)[], footer?: () => (Node | null)[]): void {
    if (this.overlay?.dataset.view !== `sheet:${key}`) return;
    const body = this.overlay.querySelector<HTMLElement>('.sheet-body');
    if (!body) return;
    const top = body.scrollTop;
    const interactionKey = this.interactionKey; this.interactionKey = null;
    body.replaceChildren(...build().filter((x): x is Node => !!x));
    body.scrollTop = top;
    const foot = this.overlay.querySelector<HTMLElement>('.sheet-foot');
    if (foot && footer) foot.replaceChildren(...footer().filter((x): x is Node => !!x));
    this.overlay.setAttribute('aria-label', title);
    const target = interactionKey ? this.overlay.querySelector<HTMLElement>(`[data-motion-key="${CSS.escape(interactionKey)}"]`) : null;
    if (target) feedback(target);
  }

  private dailyRun(): void {
    const seed = dailySeed();
    const unlocked = ARENAS.filter((a) => isArenaUnlocked(this.p, a.id));
    const arena = unlocked[seed % unlocked.length].id;
    this.game.startRun({ arena, difficulty: Math.min(1, maxDifficulty(this.p)), pacts: [], seed, daily: true });
  }

  // ------------------------------------------------------------------ armory
  loadout(): void {
    this.armoryIndex = -1;
    this.openTab('armory');
  }

  private armoryPage(): HTMLElement {
    const p = this.p;
    const l = p.loadout;
    const n = CORES.length;
    const index = this.armoryIndex >= 0 ? this.armoryIndex : Math.max(0, CORES.findIndex(c => c.id === l.core));
    const c = CORES[index];
    const owned = p.unlockedCores.includes(c.id);
    const reqOk = coreRequirementMet(p, c.id);
    const m = masteryLevel(p.mastery[c.id] ?? 0);
    const save = () => { this.game.save(); this.rerender(); };
    const move = (d: number) => {
      this.armoryIndex = (index + d + n) % n;
      const next = CORES[this.armoryIndex];
      if (p.unlockedCores.includes(next.id)) l.core = next.id;
      this.click(); save();
    };
    const stage = h('div', { class: 'core-stage', 'data-motion-key': `core:${c.id}` },
      iconButton('back', t('loadout.prevCore'), () => move(-1), 'carousel-btn'),
      h('div', { class: 'core-orb-wrap' }, orb(c.color, `core-orb ${owned ? '' : 'locked'}`), owned ? null : h('span', { class: 'orb-lock' }, icon('lock'))),
      iconButton('forward', t('loadout.nextCore'), () => move(1), 'carousel-btn'));
    this.swipe(stage, move);
    const slotRow = (slot: PartSlot) => {
      const part = PART_MAP[(l as unknown as Record<string, string>)[slot]];
      const ready = partsForSlot(p, slot).some(x => !x.unlocked && x.def.unlock?.coins && p.coins >= x.def.unlock.coins);
      return h('button', { class: 'slot-row', 'data-motion-key': `slot:${slot}`, onclick: () => { this.click(); this.partSheet(slot); } },
        h('span', { class: 'slot-icon' }, part?.icon ?? '◌'),
        h('span', { class: 'slot-copy' }, h('small', {}, t(`loadout.${slot}` as UiKey)), h('b', {}, part?.name ?? '—'), part ? h('span', { class: 'slot-desc' }, part.desc) : null),
        badge(ready), icon('forward', 'chev'));
    };
    const trail = TRAILS.find(tr => tr.id === l.trail) ?? TRAILS[0];
    return h('div', { class: 'armory scroll' },
      h('section', { class: 'core-showcase', style: `--core:${c.color}` },
        stage,
        h('div', { class: 'carousel-dots', 'aria-hidden': 'true' }, CORES.map((x, i) => h('i', { class: `${i === index ? 'on' : ''} ${p.unlockedCores.includes(x.id) ? '' : 'locked'}` }))),
        h('div', { class: 'core-title' }, h('h2', {}, c.name), owned && l.core === c.id ? h('span', { class: 'chip equipped' }, icon('check'), t('loadout.equipped')) : null),
        h('p', { class: 'core-desc' }, c.desc),
        h('div', { class: 'core-passive' }, icon('star'), richText(c.passive)),
        owned
          ? h('div', { class: 'core-mastery-row' },
            h('div', { class: 'row' }, h('b', {}, t('loadout.masteryLabel', { level: m.level })), h('span', { class: 'spacer' }), h('small', {}, m.need ? `${Math.floor(m.into)}/${m.need}` : t('common.max'))),
            meter(m.need ? m.into / m.need : 1, 'pink'))
          : h('div', { class: 'core-unlock' },
            h('small', {}, reqOk ? t('loadout.costs', { n: c.unlockCost }) : t('common.lockedText', { text: c.unlockReq?.text ?? '' })),
            h('button', {
              class: 'gold', disabled: !canUnlockCore(p, c.id),
              onclick: () => { if (unlockCore(p, c.id)) { l.core = c.id; this.game.audio.play('synergy'); this.toast(t('loadout.coreUnlocked', { icon: c.icon, name: c.name }), 'star'); save(); } },
            }, t('loadout.unlockShort'), amount('cores', c.unlockCost)))),
      sectionTitle(t('loadout.parts')),
      h('div', { class: 'slot-list reveal' },
        slotRow('shell'), slotRow('impact'), slotRow('momentum'),
        h('button', { class: 'slot-row', 'data-motion-key': 'slot:trail', onclick: () => { this.click(); this.trailSheet(); } },
          h('span', { class: 'slot-icon trail-swatch', style: `background:linear-gradient(135deg,${trail.colors[0]},${trail.colors[1]})` }),
          h('span', { class: 'slot-copy' }, h('small', {}, t('loadout.trail')), h('b', {}, trail.name)),
          icon('forward', 'chev'))),
      sectionTitle(t('loadout.presets')),
      h('div', { class: 'preset-row presets' }, [0, 1, 2].map(i => {
        const pr = p.presets[i];
        return h('div', { class: 'preset-card', 'data-motion-key': `preset:${i}` },
          h('div', { class: 'preset-name' }, pr ? [orb(CORE_MAP[pr.core]?.color ?? '#fff', 'tiny'), presetLabel(pr)] : t('loadout.slot', { n: i + 1 })),
          h('div', { class: 'preset-actions' },
            // The stored name is kept for older saves; the card shows a label derived from the parts.
            h('button', { class: 'small-btn', onclick: () => { p.presets[i] = { ...l, name: presetLabel(l) }; this.toast(t('loadout.presetSaved')); save(); } }, t('common.save')),
            pr ? h('button', { class: 'small-btn', onclick: () => { Object.assign(l, { core: pr.core, shell: pr.shell, impact: pr.impact, momentum: pr.momentum, trail: pr.trail }); this.armoryIndex = -1; save(); } }, t('common.load')) : null));
      })));
  }

  private partSheet(slot: PartSlot): void {
    const p = this.p;
    const l = p.loadout as unknown as Record<string, string>;
    const choose = (id: string) => { l[slot] = id; this.game.save(); this.navigation.dismiss(); };
    this.openSheet(`part:${slot}`, t(`loadout.${slot}` as UiKey), () => partsForSlot(p, slot).map(({ def, unlocked }) => {
      const selected = l[slot] === def.id;
      const cost = def.unlock?.coins;
      const affordable = !!cost && p.coins >= cost;
      return h('button', {
        class: `option-row ${selected ? 'selected' : ''} ${unlocked ? '' : 'locked'}`, 'data-motion-key': `part:${def.id}`,
        disabled: !unlocked && !affordable,
        onclick: () => {
          if (unlocked) { this.click(); choose(def.id); }
          else if (cost && buyPart(p, def.id)) { this.game.audio.play('select'); this.toast(t('loadout.partUnlocked', { name: def.name })); choose(def.id); }
        },
      },
      h('span', { class: 'option-icon' }, def.icon),
      h('span', { class: 'option-copy' }, h('b', {}, def.name), h('small', {}, richText(def.desc)),
        !unlocked ? h('small', { class: 'option-lock' }, icon('lock'), def.unlock!.text) : null),
      selected ? h('span', { class: 'option-state' }, icon('check')) : !unlocked && cost ? h('span', { class: `option-price ${affordable ? 'ok' : ''}` }, amount('coins', cost)) : null);
    }));
  }

  private trailSheet(): void {
    const p = this.p;
    this.openSheet('trail', t('loadout.trail'), () => [h('div', { class: 'trail-grid' }, TRAILS.map(tr => {
      const owned = p.cosmetics.includes(tr.id);
      return h('button', {
        class: `trail-option ${p.loadout.trail === tr.id ? 'selected' : ''}`, disabled: !owned, 'data-motion-key': `trail:${tr.id}`,
        onclick: () => { p.loadout.trail = tr.id; this.click(); this.game.save(); this.navigation.dismiss(); },
      }, h('span', { class: 'trail-swatch', style: `background:linear-gradient(90deg,${tr.colors[0]},${tr.colors[1]})` }), h('b', {}, owned ? tr.name : t('loadout.lockedTrail')), owned ? null : icon('lock'));
    }))]);
  }

  // ------------------------------------------------------------------ forge
  workshop(): void { this.forgeSegment = 'workshop'; this.openTab('forge'); }
  research(): void { this.forgeSegment = 'research'; this.openTab('forge'); }
  talents(): void { this.forgeSegment = 'talents'; this.openTab('forge'); }

  private forgePage(): HTMLElement {
    const p = this.p;
    const available = talentProgress(p).total - talentSpent(p.talents);
    const choose = (id: string) => { this.forgeSegment = id as ForgeSegment; this.click(); this.renderTab('forge'); };
    const body = this.forgeSegment === 'workshop' ? this.workshopBody() : this.forgeSegment === 'research' ? this.researchBody() : this.talentBody();
    return h('div', { class: 'forge' },
      segmented([
        { id: 'workshop', label: t('home.nav.workshop'), dot: this.workshopReady() },
        { id: 'research', label: t('home.nav.research'), dot: RESEARCH.some(r => canResearch(p, r.id)) },
        { id: 'talents', label: t('home.nav.talents'), count: available > 0 ? String(available) : undefined },
      ], this.forgeSegment, choose, t('tab.forge')),
      this.forgeSegment === 'workshop' ? this.workshopTabs() : this.forgeSegment === 'research' ? this.researchTabs() : null,
      h('div', {
        class: 'scroll forge-body',
        'data-segment-body': this.forgeSegment === 'workshop' ? `workshop:${this.workshopTab}` : this.forgeSegment === 'research' ? `research:${this.researchTab}` : this.forgeSegment,
      }, body));
  }

  /** Three Research branches: the founding tree, then the Advanced and Apex branches that wins open. */
  private researchTabs(): HTMLElement {
    const p = this.p;
    return h('div', { class: 'tabs research-tabs chip-scroller', role: 'tablist', 'aria-label': t('research.tabs') }, RESEARCH_TABS.map((id) => {
      const list = RESEARCH.filter((r) => researchBranch(r) === id);
      const done = list.filter((r) => p.researchNodes.includes(r.id)).length;
      return h('button', {
        role: 'tab', 'aria-selected': String(this.researchTab === id), class: this.researchTab === id ? 'on' : '', 'data-motion-key': `research-tab:${id}`,
        onclick: () => { if (this.researchTab === id) return; this.researchTab = id; this.click(); this.renderTab('forge'); },
      }, h('span', {}, t(`research.tab.${id}` as UiKey)), h('small', {}, `${done}/${list.length}`),
      list.some((r) => canResearch(p, r.id)) ? h('span', { class: 'badge dot', 'aria-hidden': 'true' }) : null);
    }));
  }

  /** Four Workshop sections, from the first coins to the endgame: each chip shows levels bought and a dot when one is affordable. */
  private workshopTabs(): HTMLElement {
    const p = this.p;
    return h('div', { class: 'tabs workshop-tabs chip-scroller', role: 'tablist', 'aria-label': t('workshop.tabs') }, WORKSHOP_TABS.map(([id, list]) => {
      const bought = list.reduce((a, wd) => a + Math.min(wd.maxLevel, p.workshop[wd.id] ?? 0), 0);
      const total = list.reduce((a, wd) => a + wd.maxLevel, 0);
      return h('button', {
        role: 'tab', 'aria-selected': String(this.workshopTab === id), class: this.workshopTab === id ? 'on' : '', 'data-motion-key': `workshop-tab:${id}`,
        onclick: () => { if (this.workshopTab === id) return; this.workshopTab = id; this.click(); this.renderTab('forge'); },
      }, h('span', {}, t(`workshop.tab.${id}` as UiKey)), h('small', {}, `${bought}/${total}`),
      this.workshopReady(list) ? h('span', { class: 'badge dot', 'aria-hidden': 'true' }) : null);
    }));
  }

  private workshopBody(): HTMLElement[] {
    const p = this.p;
    const open = overdriveOpen(p);
    const next = maxDifficulty(p);
    // What raises the Overdrive cap next: the first win, then a win on the next tier up.
    const hint = open >= OVERDRIVE_MAX ? '' : open === 0
      ? t('workshop.overdriveFirst', { n: OVERDRIVE_PER_TIER })
      : t('workshop.overdriveNext', { name: DIFFICULTIES[next].name, n: OVERDRIVE_PER_TIER });
    const bought = ALL_WORKSHOP.reduce((a, wd) => a + Math.min(wd.maxLevel, p.workshop[wd.id] ?? 0), 0);
    const total = ALL_WORKSHOP.reduce((a, wd) => a + wd.maxLevel, 0);
    const completion = h('div', { class: 'workshop-completion' },
      h('div', {}, h('b', {}, t('workshop.completion', { pct: Math.floor((bought / total) * 100) })), h('small', {}, t('workshop.completionSub', { n: bought, max: total }))),
      meter(bought / total, 'workshop-meter'));
    const rows = (list: WorkshopDef[]) => h('div', { class: 'shop-list reveal' }, list.map((wd) => this.workshopRow(wd, hint)));
    switch (this.workshopTab) {
      case 'blueprints':
        return [completion, h('p', { class: 'page-intro' }, t('workshop.blueprintsIntro')), rows(BLUEPRINTS)];
      case 'refits': {
        // Cores in play first: a locked core's refit waits at the bottom.
        const sorted = [...REFITS].sort((a, b) => Number(p.unlockedCores.includes(b.core!)) - Number(p.unlockedCores.includes(a.core!)));
        return [completion, h('p', { class: 'page-intro' }, t('workshop.refitsIntro', { n: REFIT_MASTERY_STEP })), rows(sorted)];
      }
      case 'overdrive':
        return [
          completion,
          h('p', { class: 'page-intro overdrive-intro' }, t('workshop.overdriveIntro', { n: OVERDRIVE_PER_TIER })),
          h('div', { class: 'overdrive-status' },
            h('b', {}, t('workshop.overdriveOpen', { open, max: OVERDRIVE_MAX })),
            meter(open / OVERDRIVE_MAX, 'overdrive-meter'),
            hint ? h('small', {}, icon('lock'), hint) : null),
          rows(OVERDRIVE),
        ];
      default:
        return [completion, h('p', { class: 'page-intro' }, t('workshop.intro')), rows(WORKSHOP)];
    }
  }

  /** Why a Workshop line's next level is closed, in words. */
  private workshopLockText(wd: WorkshopDef, hint: string): string | null {
    const lock = workshopLock(this.p, wd.id);
    if (!lock) return null;
    switch (lock.kind) {
      case 'overdrive': return t('workshop.overdriveCapped', { hint });
      case 'win': return t('workshop.lockWin', { name: DIFFICULTIES[lock.difficulty]?.name ?? '' });
      case 'needs': return t('workshop.lockNeeds', { name: WORKSHOP_MAP[lock.id]?.name ?? lock.id });
      case 'core': return t('workshop.lockCore', { name: CORE_MAP[lock.core]?.name ?? lock.core });
      case 'mastery': return t('workshop.lockMastery', { name: CORE_MAP[lock.core]?.name ?? lock.core, level: lock.level });
    }
  }

  private workshopRow(wd: WorkshopDef, hint: string): HTMLElement {
    const p = this.p;
    const lvl = p.workshop[wd.id] ?? 0;
    const cost = workshopCost(p, wd.id);
    const affordable = cost !== null && p.coins >= cost;
    const maxed = lvl >= wd.maxLevel;
    const lock = maxed ? null : this.workshopLockText(wd, hint);
    // Long lines show a level counter instead of a row of pips.
    const level = wd.maxLevel > 5
      ? h('span', { class: 'chip level-chip', 'aria-label': t('common.levelOf', { level: lvl, max: wd.maxLevel }) }, t('workshop.level', { level: lvl, max: workshopCap(p, wd.id) }))
      : pips(lvl, wd.maxLevel, cost !== null);
    return h('div', { class: `shop-row ${affordable ? 'affordable' : ''} ${maxed ? 'maxed' : ''} ${lock && lvl === 0 ? 'locked' : ''}`, 'data-motion-key': `workshop:${wd.id}` },
      h('span', { class: 'shop-icon' }, wd.icon),
      h('div', { class: 'shop-copy' },
        h('div', { class: 'shop-name' }, h('b', {}, wd.name), level),
        h('div', { class: 'shop-desc' }, richText(lvl > 0 ? t('workshop.now', { text: wd.desc(lvl) }) : wd.desc(1))),
        !maxed && lvl > 0 ? h('div', { class: 'shop-next' }, richText(t('workshop.next', { text: wd.desc(lvl + 1) }))) : null,
        lock ? h('div', { class: 'shop-req' }, icon('lock'), lock) : null),
      cost === null
        ? (maxed ? h('span', { class: 'chip max-chip' }, t('common.max')) : h('span', { class: 'chip max-chip' }, icon('lock')))
        : h('button', {
          class: 'gold buy-btn', disabled: !affordable, 'aria-label': t('workshop.buy', { name: wd.name, n: cost }),
          onclick: () => { if (buyWorkshop(p, wd.id)) { this.game.audio.play('select'); this.game.save(); this.renderTab('forge'); } },
        }, icon('coin'), h('b', {}, formatNum(cost))));
  }

  private researchBody(): HTMLElement[] {
    const p = this.p;
    const name = (id: string) => RESEARCH.find((y) => y.id === id)?.name ?? id;
    // Open first, then closed, then studied.
    const state = (id: string) => p.researchNodes.includes(id) ? 2 : researchLock(p, id) ? 1 : 0;
    const list = RESEARCH.filter((r) => researchBranch(r) === this.researchTab);
    const sorted = [...list].sort((a, b) => state(a.id) - state(b.id));
    const done = RESEARCH.filter((r) => p.researchNodes.includes(r.id)).length;
    const spent = RESEARCH.filter((r) => p.researchNodes.includes(r.id)).reduce((a, r) => a + r.cost, 0);
    const total = RESEARCH.reduce((a, r) => a + r.cost, 0);
    const lockText = (id: string): string | null => {
      const lock = researchLock(p, id);
      if (!lock) return null;
      if (lock.kind === 'win') return t('research.lockWin', { name: DIFFICULTIES[lock.difficulty]?.name ?? '' });
      if (lock.kind === 'apex') return t('research.lockApex');
      return lock.ids.length > 3 ? t('research.requiresMany', { n: lock.ids.length }) : t('research.requires', { list: lock.ids.map(name).join(', ') });
    };
    const intro = this.researchTab === 'core' ? t('research.intro') : t(this.researchTab === 'advanced' ? 'research.advancedIntro' : 'research.apexIntro');
    return [
      h('div', { class: 'workshop-completion' },
        h('div', {}, h('b', {}, t('research.completion', { pct: Math.floor((spent / total) * 100) })), h('small', {}, t('research.completionSub', { n: done, max: RESEARCH.length }))),
        meter(spent / total, 'research-meter')),
      h('p', { class: 'page-intro' }, h('span', { class: 'intro-amount' }, amount('research', p.research)), intro),
      h('div', { class: 'shop-list reveal' }, sorted.map((r) => {
        const studied = p.researchNodes.includes(r.id);
        const lock = studied ? null : lockText(r.id);
        return h('div', { class: `shop-row research-row ${studied ? 'done' : ''} ${lock ? 'locked' : ''} ${canResearch(p, r.id) ? 'affordable' : ''} ${r.branch ?? ''}`, 'data-motion-key': `research:${r.id}` },
          h('span', { class: 'shop-icon' }, r.icon),
          h('div', { class: 'shop-copy' },
            h('div', { class: 'shop-name' }, h('b', {}, r.name)),
            h('div', { class: 'shop-desc' }, richText(r.desc)),
            lock ? h('div', { class: 'shop-req' }, icon('lock'), lock) : null),
          studied ? h('span', { class: 'chip done-chip' }, icon('check')) : h('button', {
            class: 'buy-btn research-btn', disabled: !canResearch(p, r.id), 'aria-label': t('research.buy', { name: r.name, n: r.cost }),
            onclick: () => {
              const got = doResearch(p, r.id);
              this.game.audio.play('synergy');
              this.toast(got[0] ?? t('research.done', { name: r.name }), 'research');
              this.game.save();
              this.renderTab('forge');
            },
          }, icon('flask'), h('b', {}, String(r.cost))));
      })),
    ];
  }

  private talentBody(): HTMLElement[] {
    return [talentPanel(this.p, this.talentState, (sound) => {
      this.game.audio.play(sound === 'learn' ? 'select' : 'click');
      this.game.save();
      this.renderTab('forge');
    })];
  }

  // ------------------------------------------------------------------ codex
  codex(): void { this.openTab('codex'); }

  private codexEntries(): CodexEntry[] {
    const p = this.p;
    const d = p.discoveries;
    const flag = this.game.flags().includes('codex');
    switch (this.codexTab) {
      case 'balls': return CORES.map(c => ({ id: c.id, known: p.unlockedCores.includes(c.id), name: c.name, glyph: orb(c.color, 'tiny'), color: c.color, lines: [c.desc, richText(c.passive)], hint: c.unlockReq?.text ?? t('codex.coresCost', { n: c.unlockCost }) }));
      case 'upgrades': return UPGRADES.map(u => ({ id: u.id, known: d.upgrades.includes(u.id), name: u.name, glyph: u.icon, color: `var(--${u.rarity})`, lines: [richText(u.desc(1)), `${rarityLabel(u.rarity)} · ${u.tags.map(tagLabel).join(' · ')}`], hint: u.locked ? t('codex.lockedUpgrade') : t('codex.takeUpgrade') }));
      case 'synergies': return SYNERGIES.map(s => ({ id: s.id, known: d.synergies.includes(s.id), name: s.name, glyph: s.icon, lines: [tierLabel(s.tier), richText(s.desc), s.hint], hint: s.tier === 'known' ? t('codex.hint', { hint: s.hint }) : s.hint }));
      case 'evolutions': return EVOLUTIONS.map(e => {
        const recipe = e.recipe.map((r) => r.level > 1 ? t('codex.recipeLevel', { name: UPGRADE_MAP[r.id].name, level: r.level }) : UPGRADE_MAP[r.id].name).join(' + ');
        const known = d.evolutions.includes(e.id);
        return { id: e.id, known, name: e.name, glyph: e.icon, color: e.color, lines: [richText(e.desc), recipe], hint: flag ? `${t('codex.notEvolved')} ${recipe}` : t('codex.evolutionHint') };
      });
      case 'reactions': return REACTIONS.map(r => ({ id: r.id, known: d.reactions.includes(r.id), name: r.name, glyph: r.icon, lines: [richText(r.desc)], hint: t('codex.reactionHint', { a: elementName(r.elements[0]), b: elementName(r.elements[1]) }) }));
      case 'enemies': return CODEX_ENEMIES.map(e => ({ id: e.id, known: d.enemies.includes(e.id), name: e.name, glyph: orb(e.color, 'tiny enemy'), color: e.color, lines: [e.desc, t('codex.tip', { tip: e.tip })], hint: t('codex.notEncountered') }));
      case 'relics': return RELICS.map(r => ({
        id: r.id, known: !!d.relics?.includes(r.id), name: r.name, glyph: r.icon, color: r.cursed ? '#ff5d73' : RELIC_COLOR[r.rarity],
        lines: [richText(r.desc), `${t(`relic.${r.rarity}` as UiKey)}${r.cursed ? ` · ${t('relic.cursed')}` : ''}`],
        hint: isRelicUnlocked(p, r.id) ? t('codex.relicFind') : t('codex.relicLocked'),
      }));
      case 'bosses': return ALL_BOSSES.map(b => ({ id: b.id, known: d.bosses.includes(b.id), name: b.name, glyph: icon('skull'), color: b.apex ? '#ff3b9a' : '#ff5d73', lines: [b.apex ? `${t('codex.apex')} · ${b.title}` : b.title, b.desc, t('codex.defeated', { n: p.bossKills[b.id] ?? 0 })], hint: t('codex.bossUnknown') }));
      default: return ARENAS.map(a => ({ id: a.id, known: d.arenas.includes(a.id), name: a.name, glyph: icon('flag'), color: a.theme.accent, lines: [a.desc, t('codex.events', { list: a.events.map((e) => EVENT_MAP[e].name).join(', ') })], hint: a.unlockReq?.text ?? '' }));
    }
  }

  private codexPage(): HTMLElement {
    const p = this.p;
    const d = p.discoveries;
    const tabs: [string, string, number, number][] = [
      ['balls', t('codex.balls'), p.unlockedCores.length, CORES.length],
      ['upgrades', t('codex.upgrades'), d.upgrades.length, UPGRADES.length],
      ['synergies', t('codex.synergies'), d.synergies.length, SYNERGIES.length],
      ['evolutions', t('codex.evolutions'), d.evolutions.length, EVOLUTIONS.length],
      ['reactions', t('codex.reactions'), d.reactions.length, REACTIONS.length],
      ['relics', t('codex.relics'), d.relics?.length ?? 0, RELICS.length],
      ['enemies', t('codex.enemies'), d.enemies.length, CODEX_ENEMIES.length],
      ['bosses', t('codex.bosses'), d.bosses.length, ALL_BOSSES.length],
      ['arenas', t('codex.arenas'), d.arenas.length, ARENAS.length],
    ];
    const total = tabs.reduce((a, tab) => a + Math.min(tab[2], tab[3]), 0);
    const max = tabs.reduce((a, tab) => a + tab[3], 0);
    const pct = Math.round((total / max) * 100);
    // Discoveries lead each category so the first rows show what the player has found.
    const entries = this.codexEntries().sort((a, b) => Number(b.known) - Number(a.known));
    return h('div', { class: 'codex' },
      h('div', { class: 'codex-head' },
        h('div', { class: 'ring', style: `--p:${pct}`, role: 'img', 'aria-label': t('codex.title', { pct }) }, h('b', {}, `${pct}%`)),
        h('div', { class: 'codex-head-copy' }, h('b', {}, t('codex.completion')), h('small', {}, t('codex.found', { n: total, max })))),
      h('div', { class: 'tabs codex-tabs chip-scroller', role: 'tablist', 'aria-label': t('codex.categories') }, tabs.map(([id, label, n, m]) => h('button', {
        role: 'tab', 'aria-selected': String(this.codexTab === id), class: this.codexTab === id ? 'on' : '',
        'data-motion-key': `codex:${id}`,
        onclick: () => { if (this.codexTab === id) return; this.codexTab = id; this.click(); this.renderTab('codex'); },
      }, h('span', {}, label), h('small', {}, `${Math.min(n, m)}/${m}`)))),
      h('div', { class: 'scroll codex-body', 'data-segment-body': this.codexTab },
        h('div', { class: 'codex-grid reveal' }, entries.map(e => h('button', {
          class: `codex-tile ${e.known ? '' : 'unknown'}`, style: e.color ? `--c:${e.color}` : '', 'data-motion-key': `codex-entry:${e.id}`,
          onclick: () => { this.click(); this.codexSheet(e); },
        }, h('span', { class: 'codex-glyph' }, e.known ? e.glyph : '?'), h('span', { class: 'codex-name' }, e.known ? e.name : t('codex.unknownShort')))))));
  }

  private codexSheet(e: CodexEntry): void {
    this.openSheet(`codex:${e.id}`, e.known ? e.name : t('codex.unknownShort'), () => [
      h('div', { class: 'codex-detail', style: e.color ? `--c:${e.color}` : '' },
        h('span', { class: 'codex-glyph big' }, e.known ? e.glyph instanceof Node ? e.glyph.cloneNode(true) : e.glyph : '?'),
        e.known ? h('div', { class: 'codex-lines' }, e.lines.map(line => h('p', {}, line instanceof Node ? line.cloneNode(true) : line)))
          : h('div', { class: 'codex-lines' }, h('p', { class: 'muted' }, e.hint))),
    ]);
  }

  // ------------------------------------------------------------------ goals
  goals(): void { this.openTab('goals'); }

  private goalsPage(): HTMLElement {
    const p = this.p;
    const choose = (id: string) => { this.goalSegment = id as GoalSegment; this.click(); this.renderTab('goals'); };
    let body: HTMLElement[];
    switch (this.goalSegment) {
      case 'challenges':
        body = [h('div', { class: 'achievement-list reveal' }, CHALLENGES.map((c) => {
          const done = p.challenges.includes(c.id);
          return h('div', { class: `achievement ${done ? 'done' : ''}` },
            h('span', { class: 'achievement-icon' }, c.icon),
            h('div', { class: 'achievement-copy' }, h('b', {}, c.name), h('small', {}, c.desc),
              h('span', { class: 'achievement-reward' }, icon('star'), c.rewards.map(describeUnlock).join(', '))),
            done ? h('span', { class: 'done-mark' }, icon('check')) : null);
        }))];
        break;
      case 'badges':
        body = [h('div', { class: 'achievement-list reveal' }, ACHIEVEMENTS.map((a) => {
          const done = p.achievements.includes(a.id);
          const [cur, max] = a.progress(p);
          return h('div', { class: `achievement ${done ? 'done' : ''}` },
            h('span', { class: 'achievement-icon' }, a.icon),
            h('div', { class: 'achievement-copy' }, h('b', {}, a.name), h('small', {}, a.desc),
              done ? null : h('div', { class: 'achievement-progress' }, meter(cur / max, 'gold thin'), h('small', {}, `${formatNum(Math.min(cur, max))}/${formatNum(max)}`))),
            done ? h('span', { class: 'done-mark' }, icon('check')) : null);
        }))];
        break;
      case 'mastery':
        body = [h('div', { class: 'achievement-list reveal' }, CORES.filter((c) => p.unlockedCores.includes(c.id)).map((c) => {
          const m = masteryLevel(p.mastery[c.id] ?? 0);
          const next = masteryRewards(c.id).find((r) => r.level === m.level + 1);
          return h('div', { class: 'achievement mastery-row' },
            orb(c.color, 'small'),
            h('div', { class: 'achievement-copy' }, h('b', {}, t('goals.masteryLevel', { icon: '', name: c.name, level: m.level }).trim()),
              h('small', {}, next ? t('goals.nextReward', { text: next.text }) : t('goals.mastered')),
              meter(m.need ? m.into / m.need : 1, 'pink thin')));
        }))];
        break;
      default:
        body = [this.rankCard(), ...this.contractCards(), h('div', { class: 'goal-list reveal' }, nextGoals(p, 5).map(g => this.goalCard(g))),
          h('div', { class: 'lifetime reveal' },
            statTile(t('home.runs'), formatNum(p.stats.runs)), statTile(t('home.wins'), formatNum(p.stats.wins)),
            statTile(t('home.bestCombo'), formatNum(p.stats.bestCombo)), statTile(t('goals.kills'), formatNum(p.stats.kills)))];
    }
    return h('div', { class: 'goals' },
      segmented([
        { id: 'next', label: t('goals.nextShort') },
        { id: 'challenges', label: t('goals.challengesShort'), count: `${p.challenges.length}/${CHALLENGES.length}` },
        { id: 'badges', label: t('goals.badges'), count: `${p.achievements.length}/${ACHIEVEMENTS.length}` },
        { id: 'mastery', label: t('goals.mastery') },
      ], this.goalSegment, choose, t('tab.goals')),
      h('div', { class: 'scroll goals-body', 'data-segment-body': this.goalSegment }, body));
  }

  /** Pilot Rank: the account-wide bar every run fills, with the next reward in sight. */
  private rankCard(): HTMLElement {
    const r = rankLevel(this.p.rankXp);
    const next = r.need ? rankRewards(r.level + 1).map(describeUnlock).join(', ') : '';
    return h('div', { class: 'rank-card reveal' },
      h('span', { class: 'rank-badge' }, h('b', {}, String(r.level))),
      h('div', { class: 'rank-copy' },
        h('div', { class: 'row' }, h('b', {}, t('goals.rank', { n: r.level })), h('span', { class: 'spacer' }), h('small', {}, r.need ? `${formatNum(Math.floor(r.into))}/${formatNum(r.need)}` : t('common.max'))),
        meter(r.need ? r.into / r.need : 1, 'gold thin'),
        h('small', { class: 'rank-next' }, r.need ? t('goals.rankNext', { text: next }) : t('goals.rankMax'))));
  }

  /** Today's three contracts and the weekly one; they pay out automatically when finished. */
  private contractCards(): HTMLElement[] {
    const p = this.p;
    if (!p.tutorialDone) return [];
    const board = contractBoard(p);
    const row = (slot: (typeof board.daily)[number]) => {
      const def = CONTRACT_MAP[slot.id];
      return h('div', { class: `contract-row ${slot.done ? 'done' : ''}` },
        h('span', { class: 'contract-icon' }, def?.icon ?? '•'),
        h('div', { class: 'contract-copy' },
          h('b', {}, contractText(slot)),
          slot.done ? null : meter(slot.progress / Math.max(1, slot.target), 'gold thin')),
        slot.done ? h('span', { class: 'done-mark' }, icon('check')) : h('small', { class: 'contract-count' }, `${formatNum(Math.floor(slot.progress))}/${formatNum(slot.target)}`));
    };
    return [
      sectionTitle(t('goals.contracts')),
      h('div', { class: 'contract-list reveal' }, board.daily.map(row)),
      ...(board.weekly ? [sectionTitle(t('goals.weekly')), h('div', { class: 'contract-list weekly reveal' }, row(board.weekly))] : []),
    ];
  }

  // ------------------------------------------------------------------ settings
  settings(): void {
    const world = this.game.world;
    this.navigation.view('settings', () => this.settings(), { valid: () => !world || this.game.world === world });
    const s = this.p.settings;
    const apply = () => { this.game.applySettings(); this.game.save(); };
    const switchState = (on: boolean) => (on ? t('settings.on') : t('settings.off'));
    type ToggleKey = 'shake' | 'damageNumbers' | 'debug' | 'haptics' | 'leftHanded' | 'reduceFlashes';
    const toggle = (glyph: IconName, label: string, desc: string, key: ToggleKey) =>
      h('button', {
        type: 'button', class: 'setting-switch', role: 'switch', 'aria-label': label, 'aria-checked': String(s[key]), 'data-setting': key,
        onclick: (e: MouseEvent) => {
          this.click(); s[key] = !s[key]; apply();
          const button = e.currentTarget as HTMLButtonElement;
          button.setAttribute('aria-checked', String(s[key]));
          button.querySelector('.switch-state')!.textContent = switchState(s[key]);
          if (key === 'haptics' && s.haptics) this.game.haptic('select');
          feedback(button);
        },
      },
      h('span', { class: 'setting-icon' }, icon(glyph)),
      h('span', { class: 'setting-copy' }, h('span', { class: 'setting-name' }, label), h('small', { class: 'setting-desc' }, desc)),
      h('span', { class: 'switch-rail', 'aria-hidden': 'true' }, h('span', { class: 'switch-state' }, switchState(s[key])), h('span', { class: 'switch-knob' })));
    const slider = (label: string, key: 'sfx' | 'music') => {
      const percent = Math.round(s[key] * 100), id = `setting-${key}`;
      const readout = h('output', { class: 'setting-value', for: id }, `${percent}%`);
      return h('div', { class: 'setting-volume' },
        h('div', { class: 'setting-volume-head' }, h('label', { for: id, class: 'setting-name' }, label), readout),
        h('input', {
          id, class: 'setting-range', type: 'range', min: 0, max: 100, step: 5, value: percent,
          'aria-valuetext': `${percent}%`, style: `--volume:${percent}%`,
          oninput: (e: Event) => {
            const input = e.target as HTMLInputElement, value = Number(input.value);
            s[key] = value / 100; readout.textContent = localizeDigits(`${value}%`);
            input.style.setProperty('--volume', `${value}%`); input.setAttribute('aria-valuetext', localizeDigits(`${value}%`)); apply();
          },
        }));
    };
    const section = (title: string, ...controls: (HTMLElement | null)[]) =>
      h('section', { class: 'settings-section', 'aria-label': title }, h('h3', { class: 'settings-heading' }, title), ...controls);
    // Each option shows its native name (in its own script and direction) plus the name in the
    // current language, so a player can always find their way back.
    const languages = h('div', { class: 'aim-modes language-options', role: 'group', 'aria-label': t('settings.language') },
      LANGUAGES.map((lang) => {
        const translated = t(`lang.${lang.id}` as UiKey);
        return h('button', {
          type: 'button', class: 'aim-option language-option', 'data-language': lang.id, 'aria-label': `${lang.name}${translated !== lang.name ? ` (${translated})` : ''}`,
          'aria-pressed': String(s.language === lang.id),
          onclick: () => {
            if (s.language === lang.id) return;
            this.click(); s.language = lang.id; apply();
            // Rebuild this screen in the new language; the page underneath re-renders on return.
            this.settings();
          },
        },
        h('span', { class: 'aim-check', 'aria-hidden': 'true' }, icon('check')),
        h('span', { class: 'setting-name', lang: lang.id, dir: lang.dir }, lang.name),
        translated !== lang.name ? h('small', { class: 'setting-desc' }, translated) : null);
      }));
    const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;
    this.show(h('div', { class: 'screen solid settings-screen' },
      this.topbar(t('settings.title'), false),
      h('div', { class: 'scroll settings-content' },
        section(t('settings.language'), languages),
        section(t('settings.audio'), h('div', { class: 'settings-audio' }, slider(t('settings.sfx'), 'sfx'), slider(t('settings.music'), 'music'))),
        section(t('settings.aim'), h('div', { class: 'aim-modes', role: 'group', 'aria-label': t('settings.aim') },
          (['direct', 'slingshot'] as const).map((m) => h('button', {
            type: 'button', class: 'aim-option', 'data-mode': m, 'aria-pressed': String(s.aimMode === m),
            onclick: (e: MouseEvent) => {
              if (s.aimMode === m) return;
              this.click(); s.aimMode = m; apply();
              for (const button of (e.currentTarget as HTMLElement).parentElement!.querySelectorAll<HTMLButtonElement>('button'))
                button.setAttribute('aria-pressed', String(button.dataset.mode === m));
              feedback(e.currentTarget as HTMLElement);
            },
          },
          h('span', { class: 'aim-icon', 'aria-hidden': 'true' }, icon(m === 'direct' ? 'aim' : 'recall')),
          h('span', { class: 'aim-check', 'aria-hidden': 'true' }, icon('check')),
          h('span', { class: 'setting-name' }, m === 'direct' ? t('settings.aimDirect') : t('settings.aimSlingshot')),
          h('small', { class: 'setting-desc' }, m === 'direct' ? t('settings.aimDirectDesc') : t('settings.aimSlingshotDesc'))))),
          toggle('armory', t('settings.leftHanded'), t('settings.leftHandedDesc'), 'leftHanded')),
        section(t('settings.combat'),
          toggle('shake', t('settings.shake'), t('settings.shakeDesc'), 'shake'),
          toggle('number', t('settings.damageNumbers'), t('settings.damageNumbersDesc'), 'damageNumbers'),
          toggle('eye', t('settings.reduceFlashes'), t('settings.reduceFlashesDesc'), 'reduceFlashes'),
          canVibrate ? toggle('vibrate', t('settings.haptics'), t('settings.hapticsDesc'), 'haptics') : null),
        section(t('settings.system'), toggle('bug', t('settings.debug'), t('settings.debugDesc'), 'debug')),
        h('div', { class: 'settings-footer' },
          h('button', {
            class: 'danger',
            onclick: () => {
              this.confirmAction(t('settings.resetTitle'), t('settings.resetMessage'), t('settings.erase'), () => {
                const settings = { ...s };
                Object.assign(this.p, defaultProfile(), { settings });
                this.talentState = newTalentState();
                this.armoryIndex = -1;
                this.game.save();
                this.home();
              }, () => this.root.querySelector<HTMLButtonElement>('.settings-footer button')?.focus({ preventScroll: true }), t('common.cancel'));
            },
          }, t('settings.reset'))),
        h('div', { class: 'settings-help' }, t('settings.help')),
      ),
    ));
  }

  // ------------------------------------------------------------------ in-run HUD
  beginRun(w: World): void {
    const options = {
      valid: () => this.game.world === w,
      guard: {
        when: () => this.game.world === w,
        // Banish targeting is a sub-mode of the upgrade choice: Back leaves it before pausing.
        act: () => {
          if (this.banishMode && w.state === 'levelup' && this.overlay?.dataset.view === 'upgrade') {
            this.banishMode = false;
            this.click();
            this.levelUp(w);
          } else this.game.pause();
        },
      },
    };
    // Keep two guarded entries even for First Contact/Daily, which start from Home.
    // Two queued browser Back presses must stay in this document until popstate runs.
    this.navigation.view('run-boundary', () => this.game.resume(), options);
    this.navigation.view('run', () => this.game.resume(), options);
    this.hud();
  }

  hud(): void {
    this.closeOverlay();
    this.clearScreen();
    cancelWithin(this.hudEl); this.hudEl?.remove();
    this.root.toggleAttribute('data-left-handed', this.p.settings.leftHanded);
    const pause = h('button', { class: 'hudbtn pause-btn', 'aria-label': t('hud.pause'), onclick: () => { this.click(); this.game.pause(); } }, icon('pause'));
    const surge = h('button', { class: 'surge', 'aria-label': t('hud.surge'), title: t('hud.surgeTitle'), onclick: () => this.game.world?.activateSurge() },
      h('span', { class: 'surge-face' }, icon('bolt'), h('b', { class: 'surge-text' }, t('hud.surgeLabel')))) as HTMLButtonElement;
    const recall = h('button', { class: 'recall', 'aria-label': t('hud.recall'), title: t('hud.recallTitle'), onclick: () => this.game.world?.activateRecall() },
      h('span', { class: 'recall-icon', 'aria-hidden': 'true' }, icon('recall')), h('span', { class: 'recall-label' }, t('hud.recallLabel')), h('small', {}, t('hud.ready'))) as HTMLButtonElement;
    this.surgeBtn = surge;
    this.recallBtn = recall;
    const telemetry = h('div', { class: 'compact-telemetry' },
      h('div', { class: 'compact-main' },
        h('div', {}, h('small', {}, t('hud.hull')), h('b', { class: 'compact-hull' })),
        h('div', {}, h('small', {}, t('hud.run')), h('b', { class: 'compact-run' })),
        h('div', {}, h('small', {}, t('hud.combo')), h('b', { class: 'compact-combo' })),
        h('div', {}, h('small', {}, t('hud.resonance')), h('b', { class: 'compact-signal' }))),
      h('div', { class: 'compact-details' },
        h('div', {}, h('small', {}, t('hud.runDetails')), h('b', { class: 'compact-level' })),
        h('div', {}, h('small', {}, t('hud.event')), h('b', { class: 'compact-event' })),
        h('div', {}, h('small', {}, t('hud.boss')), h('b', { class: 'compact-boss' })),
        h('div', {}, h('small', {}, t('hud.nextUpgrade')), h('div', { class: 'compact-xp' }, h('span')))));
    this.compactTelemetry = telemetry;
    this.hudEl = h('div', { class: 'game-hud' }, pause, surge, recall, telemetry);
    this.root.append(this.hudEl);
    enter(this.hudEl, 'hud', 0);
    revealItems(this.hudEl);
  }

  hideHud(): void {
    retire(this.hudEl, 'hud', 0);
    cancelWithin(this.hudEl);
    this.hudEl?.remove();
    this.hudEl = null;
    this.surgeBtn = null;
    this.recallBtn = null;
    this.compactTelemetry = null;
    this.hint(null);
    this.guideHand(false);
  }

  updateHud(w: World): void {
    if (!this.surgeBtn) return;
    const frac = w.surge.charge / w.surge.max;
    this.surgeBtn.style.setProperty('--p', `${Math.round(frac * 100)}%`);
    const ready = w.canSurge();
    const wasReady = this.surgeBtn.classList.contains('ready');
    this.surgeBtn.disabled = !ready || !this.game.controlsEnabled;
    this.surgeBtn.classList.toggle('ready', ready);
    this.surgeBtn.classList.toggle('active', w.surge.active > 0);
    if (ready !== wasReady && ready) { feedback(this.surgeBtn); this.game.haptic('ready'); }
    const label = this.surgeBtn.querySelector('.surge-text')!;
    const text = localizeDigits(w.surge.active > 0 ? t('hud.surgeActive') : ready ? t('hud.surgeReady') : `${Math.floor(frac * 100)}%`);
    if (label.textContent !== text) label.textContent = text;
    if (this.recallBtn) {
      this.recallBtn.disabled = !w.canRecall() || !this.game.controlsEnabled;
      this.recallBtn.style.setProperty('--recall-p', `${(1 - w.recallCooldown / w.build.stats.recallCooldown) * 100}%`);
      const small = this.recallBtn.querySelector('small')!;
      const status = localizeDigits(w.recallCooldown > 0 ? t('hud.seconds', { n: Math.ceil(w.recallCooldown) }) : w.canRecall() ? t('hud.ready') : t('hud.noBalls'));
      if (small.textContent !== status) small.textContent = status;
    }
    if (this.compactTelemetry && this.root.hasAttribute('data-compact-hud')) {
      const signal = w.resonance.overdrive > 0 ? t('hud.overdrive', { n: Math.ceil(w.resonance.overdrive) }) :
        w.resonance.nodes.length ? t('hud.circuit', { lit: w.resonance.lit, n: Math.ceil(w.resonance.remaining) }) : t('hud.in', { n: Math.max(0, Math.ceil(w.resonance.cooldown)) });
      const bosses = w.enemies.filter(e => e.alive && e.boss);
      const bossHp = bosses.reduce((sum, e) => sum + e.hp, 0), bossMax = bosses.reduce((sum, e) => sum + e.maxHp, 0);
      const labels: Record<string, string> = {
        hull: `${formatNum(Math.ceil(w.hp))} / ${formatNum(w.maxHp)}`,
        run: formatTime(w.time),
        combo: `${formatNum(w.combo.count)}×`, signal,
        level: t('hud.level', { level: w.level, kills: formatNum(w.run.kills) }),
        event: w.event ? t('hud.eventTimer', { name: EVENT_MAP[w.event.id].name, n: Math.ceil(w.event.dur - w.event.t) }) : t('hud.clear'),
        boss: w.director.bossActive ? t('hud.bossHp', { name: BOSS_MAP[w.director.bossId]?.name ?? t('hud.boss'), pct: Math.ceil(bossHp / (bossMax || 1) * 100) }) :
          t('hud.bossIn', { time: formatTime(Math.max(0, w.director.bossTime - w.time)) }),
      };
      for (const [key, raw] of Object.entries(labels)) {
        const el = this.compactTelemetry.querySelector(`.compact-${key}`)!, value = localizeDigits(raw);
        if (el.textContent !== value) el.textContent = value;
      }
      const xp = this.compactTelemetry.querySelector('.compact-xp > span') as HTMLElement;
      xp.style.width = `${Math.min(100, w.xp / w.xpNext * 100)}%`;
    }
  }

  hint(text: string | null): void {
    if (!text) {
      retire(this.hintEl, 'notice', 0);
      cancelWithin(this.hintEl);
      this.hintEl?.remove();
      this.hintEl = null;
      return;
    }
    if (this.hintEl?.textContent === localizeDigits(text)) return;
    retire(this.hintEl, 'notice', 0);
    cancelWithin(this.hintEl);
    this.hintEl?.remove();
    this.hintEl = h('div', { class: 'hint', role: 'status' }, icon('info'), h('span', {}, text));
    this.root.append(this.hintEl);
    enter(this.hintEl, 'notice', 0);
  }

  /** First Contact shows a ghost hand dragging from the launcher until the first shot. */
  guideHand(show: boolean, slingshot = false): void {
    if (!show) { this.handEl?.remove(); this.handEl = null; return; }
    if (this.handEl?.dataset.mode === (slingshot ? 'slingshot' : 'direct')) return;
    this.handEl?.remove();
    this.handEl = h('div', { class: `guide-hand ${slingshot ? 'slingshot' : ''}`, 'aria-hidden': 'true', 'data-mode': slingshot ? 'slingshot' : 'direct' },
      h('span', { class: 'guide-trail' }), h('span', { class: 'guide-finger' }));
    this.root.append(this.handEl);
  }

  // ------------------------------------------------------------------ level up
  private buildStrip(w: World, cls = ''): HTMLElement {
    const entries = [...w.build.upgrades.entries()];
    return h('div', { class: `build-strip ${cls}`.trim(), 'aria-label': t('pause.upgrades') },
      entries.length ? entries.map(([id, lv]) => h('span', { class: `build-chip ${UPGRADE_MAP[id].rarity}`, title: `${UPGRADE_MAP[id].name} ${lv}` },
        h('span', { class: 'build-chip-icon' }, UPGRADE_MAP[id].icon), h('b', {}, String(lv))))
        : h('span', { class: 'build-empty' }, t('levelup.emptyBuild')),
      [...w.build.evolutions].map(id => h('span', { class: 'build-chip evolution', title: EVOLUTION_MAP[id].name }, h('span', { class: 'build-chip-icon' }, EVOLUTION_MAP[id].icon))),
      w.build.relics.map(id => h('span', { class: `build-chip relic ${RELIC_MAP[id].rarity}`, title: RELIC_MAP[id].name }, h('span', { class: 'build-chip-icon' }, RELIC_MAP[id].icon))));
  }

  /** A relic cache: pick one of three relics (no rerolls), or take coins instead. */
  private relicDraft(w: World): void {
    const fresh = this.overlay?.dataset.view !== 'relic';
    const card = (o: Offer, i: number) => {
      if (o.kind !== 'relic') return null;
      const r = RELIC_MAP[o.id];
      const color = r.cursed ? '#ff5d73' : RELIC_COLOR[r.rarity];
      return h('button', { class: `offer relic-offer ${r.rarity} ${r.cursed ? 'cursed' : ''}`, style: `--i:${i};--c:${color}`, onclick: () => this.pick(w, o, overlay) },
        h('span', { class: 'offer-gem', 'aria-hidden': 'true' }),
        h('span', { class: 'oicon' }, r.icon),
        h('span', { class: 'obody' },
          h('span', { class: 'okicker', style: `color:${color}` }, `${t(`relic.${r.rarity}` as UiKey)}${r.cursed ? ` · ${t('relic.cursed')}` : ''}`),
          h('span', { class: 'oname' }, r.name),
          h('span', { class: 'odesc' }, richText(r.desc))));
    };
    const peek = h('button', { class: 'draft-action peek-btn', 'aria-label': t('levelup.peek'), title: t('levelup.peek') }, icon('eye'), h('span', {}, t('levelup.peekShort')));
    const hold = (on: boolean) => overlay.classList.toggle('peeking', on);
    peek.addEventListener('pointerdown', (e) => { e.preventDefault(); hold(true); });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) peek.addEventListener(type, () => hold(false));
    const skip = h('button', { class: 'draft-action ghost', 'aria-label': t('relic.skipLabel'), title: t('relic.skipLabel'), onclick: () => this.pick(w, { kind: 'coins' }, overlay) },
      icon('coin'), h('span', {}, t('relic.skip')));
    const overlay: HTMLElement = h('div', { class: 'levelup draft relic-draft', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('relic.kicker') },
      h('div', { class: 'draft-head' },
        h('div', { class: 'draft-kicker' }, icon('star'), t('relic.kicker'), w.build.relics.length ? h('span', { class: 'draft-queue' }, t('relic.owned', { n: w.build.relics.length })) : null),
        h('div', { class: 'lvtitle' }, t('relic.title')),
        this.buildStrip(w)),
      h('div', { class: 'col offer-list' }, w.offers.map(card)),
      h('div', { class: 'offer-actions' }, peek, skip));
    if (fresh) {
      overlay.setAttribute('data-arming', '');
      setTimeout(() => overlay.removeAttribute('data-arming'), DRAFT_ARM_MS);
      this.dealSound(w);
      this.game.haptic('levelup');
    }
    this.showOverlay(overlay, 'relic');
  }

  levelUp(w: World): void {
    if (w.draft === 'relic') { this.relicDraft(w); return; }
    const codex = w.flags.has('codex');
    const fresh = this.overlay?.dataset.view !== 'upgrade';
    const card = (o: Offer, i: number) => {
      const style = `--i:${i}`;
      if (o.kind === 'evolution') {
        const e = EVOLUTION_MAP[o.id];
        return h('button', { class: 'offer evolution legendary', style: `${style};--c:${e.color}`, disabled: this.banishMode, onclick: () => this.pick(w, o, overlay) },
          h('span', { class: 'offer-gem', 'aria-hidden': 'true' }),
          h('span', { class: 'oicon' }, e.icon),
          h('span', { class: 'obody' },
            h('span', { class: 'okicker' }, t('levelup.evolutionKicker')),
            h('span', { class: 'oname', style: `color:${e.color}` }, t('levelup.evolve', { name: e.name })),
            h('span', { class: 'odesc' }, richText(e.desc))));
      }
      if (o.kind !== 'upgrade') {
        return h('button', { class: 'offer utility', style, disabled: this.banishMode, onclick: () => this.pick(w, o, overlay) },
          h('span', { class: 'offer-gem', 'aria-hidden': 'true' }),
          h('span', { class: 'oicon' }, o.kind === 'heal' ? icon('heart') : icon('coin')),
          h('span', { class: 'obody' }, h('span', { class: 'oname' }, o.kind === 'heal' ? t('levelup.repair') : t('levelup.salvage')),
            h('span', { class: 'odesc' }, richText(o.kind === 'heal' ? t('levelup.repairDesc') : t('levelup.salvageDesc')))));
      }
      const u = UPGRADE_MAP[o.id];
      const syn = previewSynergies(w.build, o.id);
      const feeds = feedsEvolutions(o.id);
      const hints: HTMLElement[] = [];
      for (const s of syn) {
        const sd = SYNERGY_MAP[s];
        const known = w.seen.synergies.has(s) || sd.tier === 'known';
        hints.push(h('span', { class: 'ohint synergy' }, known ? t('levelup.activates', { icon: sd.icon, name: sd.name }) : t('levelup.hidden')));
      }
      if (codex) for (const f of feeds) {
        const e = EVOLUTION_MAP[f];
        const r = e.recipe.find((x) => x.id === o.id)!;
        const need = w.build.recipeLevel(r.level);
        hints.push(h('span', { class: 'ohint evolution-hint' }, `${t('levelup.ingredient', { name: e.name })}${need > 1 ? t('levelup.needsLevel', { n: need }) : ''}`));
      }
      const max = w.build.maxLevel(o.id);
      return h('button', {
        class: `offer ${u.rarity} ${this.banishMode ? 'banish-mode' : ''} ${hints.length ? 'has-hint' : ''}`, style,
        onclick: () => {
          if (this.banishMode) {
            this.banishMode = false;
            this.game.audio.play('shieldbreak');
            w.banish(o.id);
          } else this.pick(w, o, overlay);
        },
      },
      h('span', { class: 'offer-gem', 'aria-hidden': 'true' }),
      h('span', { class: 'oicon' }, u.icon),
      h('span', { class: 'obody' },
        h('span', { class: 'ohead' }, h('span', { class: 'oname' }, u.name),
          o.level === 1 ? h('span', { class: 'olv new' }, t('levelup.new')) : h('span', { class: 'olv', 'aria-label': t('levelup.level', { level: o.level, max }) }, pips(o.level - 1, max, true))),
        h('span', { class: 'odesc' }, richText(u.desc(o.level))),
        hints.length ? h('span', { class: 'ohints' }, hints) : null,
        h('span', { class: 'otags' }, t('levelup.tags', { rarity: rarityLabel(u.rarity), tags: u.tags.map(tagLabel).join(' · ') }))));
    };
    const tutorial = w.cfg.tutorial && w.levelUps === 0;
    const queued = Math.max(0, w.pendingLevels - 1);
    const reroll = h('button', {
      class: 'draft-action', disabled: w.rerolls <= 0,
      onclick: () => {
        if (performance.now() < this.rerollLockedUntil) return;
        this.rerollLockedUntil = performance.now() + 350;
        this.click(); if (w.reroll()) this.dealSound(w);
      },
    }, icon('reroll'), h('span', {}, t('levelup.rerollShort')), h('b', {}, String(w.rerolls)));
    const banish = w.banishes > 0 || w.flags.has('banish') ? h('button', {
      class: `draft-action ${this.banishMode ? 'danger' : ''}`, disabled: w.banishes <= 0,
      onclick: () => { this.click(); this.banishMode = !this.banishMode; this.levelUp(w); },
    }, icon('banish'), h('span', {}, this.banishMode ? t('levelup.tapCard') : t('levelup.banishShort')), this.banishMode ? null : h('b', {}, String(w.banishes))) : null;
    const peek = h('button', { class: 'draft-action peek-btn', 'aria-label': t('levelup.peek'), title: t('levelup.peek') }, icon('eye'), h('span', {}, t('levelup.peekShort')));
    const hold = (on: boolean) => overlay.classList.toggle('peeking', on);
    peek.addEventListener('pointerdown', (e) => { e.preventDefault(); hold(true); });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) peek.addEventListener(type, () => hold(false));
    peek.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); hold(true); } });
    peek.addEventListener('keyup', () => hold(false));
    const skip = h('button', { class: 'draft-action ghost', 'aria-label': t('levelup.skipLabel'), title: t('levelup.skipLabel'), onclick: () => this.pick(w, { kind: 'coins' }, overlay) },
      icon('skip'), h('span', {}, t('levelup.skip')));
    const overlay: HTMLElement = h('div', { class: `levelup draft ${this.banishMode ? 'banishing' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': t('levelup.kicker') },
      h('div', { class: 'draft-head' },
        h('div', { class: 'draft-kicker' }, icon('arrowUp'), t('levelup.kicker'), queued ? h('span', { class: 'draft-queue' }, t('levelup.queue', { n: queued })) : null),
        h('div', { class: 'lvtitle' }, t('levelup.title', { n: w.level - w.pendingLevels + 1 })),
        this.buildStrip(w)),
      tutorial ? h('div', { class: 'draft-tip' }, icon('info'), t('levelup.tutorial')) : null,
      h('div', { class: 'col offer-list' }, w.offers.map(card)),
      h('div', { class: 'offer-actions' }, reroll, banish, peek, skip),
    );
    if (fresh) {
      // A tap meant for the board must not pick a card the instant the draft opens.
      overlay.setAttribute('data-arming', '');
      setTimeout(() => overlay.removeAttribute('data-arming'), DRAFT_ARM_MS);
      this.dealSound(w);
      this.game.haptic('levelup');
    }
    this.showOverlay(overlay, 'upgrade');
  }

  /** Cards land one after another with a rising pitch; a legendary or evolution adds a chime. */
  private dealSound(w: World): void {
    w.offers.forEach((o, i) => setTimeout(() => this.game.audio.play('pickup', 1 + i * 0.14, 0.7), 70 + i * 90));
    if (w.offers.some(o => o.kind === 'evolution' || (o.kind === 'upgrade' && ['epic', 'legendary'].includes(UPGRADE_MAP[o.id].rarity))))
      setTimeout(() => this.game.audio.play('synergy', 1.2, 0.5), 340);
  }

  private pick(w: World, o: Offer, overlay?: HTMLElement): void {
    if (overlay?.hasAttribute('data-arming')) return;
    this.banishMode = false;
    this.game.audio.play('select');
    this.closeOverlay();
    this.game.onOfferChosen(o);
  }

  // ------------------------------------------------------------------ pause
  pauseMenu(w: World): void {
    this.navigation.view('pause', () => {
      this.clearScreen();
      this.game.pause();
    }, { valid: () => this.game.world === w });
    // Balls include milestone balls, which are not an upgrade stat.
    const st = { ...w.build.stats, maxBalls: w.maxBallsAllowed() };
    const keys: StatKey[] = ['damage', 'critChance', 'critMult', 'speed', 'maxBalls', 'pierce', 'burnChance', 'chillChance', 'chainChance', 'explosionChance', 'splitChance', 'bleedChance', 'lifesteal', 'maxHp', 'armor'];
    const core = CORE_MAP[w.cfg.core];
    const guide = (title: string, text: string) => h('div', { class: 'combat-guide' }, h('b', {}, title), h('p', {}, text));
    const overlay = h('div', { class: 'levelup pause-overlay' },
      h('div', { class: 'pause-head' },
        h('div', { class: 'lvtitle' }, t('pause.title')),
        h('div', { class: 'pause-run' }, t('pause.runLine', { arena: w.arena.name, difficulty: w.asc.size ? t('home.ascensionTag', { difficulty: w.diff.name, n: w.asc.size }) : w.diff.name, time: formatTime(w.time), level: w.level, kills: formatNum(w.run.kills) }))),
      h('div', { class: 'scroll pause-body' },
        h('div', { class: 'buildcard', style: `--core:${core.color}` },
          h('div', { class: 'buildcard-head' }, orb(core.color, 'small'), h('div', {}, h('small', {}, t('pause.currentBuild')), h('div', { class: 'buildname' }, this.game.buildName()))),
          this.buildStrip(w, 'wrap'),
          [...w.build.synergies].length || w.build.evolutions.size ? h('div', { class: 'build-tags' },
            [...w.build.evolutions].map(id => h('span', { class: 'tag evo', style: `--c:${EVOLUTION_MAP[id].color}`, title: EVOLUTION_MAP[id].desc }, `${EVOLUTION_MAP[id].icon} ${EVOLUTION_MAP[id].name}`)),
            [...w.build.synergies].map(id => h('span', { class: 'tag syn', title: SYNERGY_MAP[id].desc }, `${SYNERGY_MAP[id].icon} ${SYNERGY_MAP[id].name}`))) : null,
          w.build.relics.length ? h('div', { class: 'build-tags relics-line' }, w.build.relics.map(id =>
            h('span', { class: `tag relic ${RELIC_MAP[id].cursed ? 'cursed' : ''}`, style: `--c:${RELIC_COLOR[RELIC_MAP[id].rarity]}`, title: RELIC_MAP[id].desc }, `${RELIC_MAP[id].icon} ${RELIC_MAP[id].name}`))) : null),
        h('div', { class: 'stat-grid' }, keys.filter((k) => st[k] > 0 && STAT_FORMATS[k]).map((k) => statTile(statLabel(k), STAT_FORMATS[k]!(st[k])))),
        talentSpent(w.talents) ? h('div', { class: 'build-tags talents-line' }, TALENTS.filter(tl => w.talents[tl.id]).map(tl =>
          h('span', { class: 'tag', title: tl.desc(w.talents[tl.id]) }, t('pause.talentChip', { icon: tl.icon, name: tl.name, rank: w.talents[tl.id], max: tl.maxRank })))) : null,
        h('details', { class: 'manual' },
          h('summary', {}, icon('info'), t('pause.manual')),
          guide(t('pause.powerShot'), t('pause.powerShotDesc')),
          guide(t('pause.resonance'), t('pause.resonanceDesc')),
          guide(t('pause.recallSurge'), t('pause.recallSurgeDesc')))),
      h('div', { class: 'col overlay-actions' },
        h('button', { class: 'primary big', onclick: () => { this.click(); this.navigation.dismiss(); } }, icon('play'), t('pause.resume')),
        h('div', { class: 'row' },
          h('button', { style: 'flex:1', onclick: () => { this.click(); this.settings(); } }, icon('gear'), t('pause.settings')),
          // Returning to the Pause entry already re-renders the menu; cancelling only restores focus.
          h('button', { class: 'danger', style: 'flex:1', onclick: () => this.confirmAction(t('pause.endTitle'), t('pause.endMessage'), t('pause.endRun'), () => this.game.abandonRun(),
            () => this.root.querySelector<HTMLButtonElement>('.pause-overlay .overlay-actions .danger')?.focus({ preventScroll: true })) }, icon('flag'), t('pause.abandon')),
        ),
      ),
    );
    this.showOverlay(overlay, 'pause');
  }

  // ------------------------------------------------------------------ victory choice
  victoryChoice(w: World): void {
    const overlay = h('div', { class: 'levelup victory-overlay' },
      h('div', { class: 'victory-burst', 'aria-hidden': 'true' }, icon('trophy')),
      h('div', { class: 'result-title win' }, t('victory.title')),
      h('div', { class: 'results-sub' }, t('victory.cleared', { arena: ARENA_MAP[w.arena.id].name, difficulty: w.diff.name, time: formatTime(w.time) })),
      h('div', { class: 'col victory-actions' },
        h('button', { class: 'primary big', onclick: () => { this.click(); this.closeOverlay(); this.game.finishRun(); } }, icon('trophy'), t('victory.claim')),
        h('button', { class: 'big endless-btn', onclick: () => { this.click(); this.closeOverlay(); this.game.continueEndless(); } }, icon('fire'), t('victory.endless')),
        h('div', { class: 'victory-note' }, t('victory.endlessDesc'))),
    );
    this.showOverlay(overlay, 'victory');
  }

  // ------------------------------------------------------------------ post run
  postRun(s: RunSummary, r: RunReport, abandoned = false, best: { combo: number; chain: number } | null = null): void {
    this.navigation.reset(() => this.home(), { key: 'results', restore: () => this.postRun(s, r, abandoned, best) });
    this.hideHud();
    this.closeOverlay();
    const bs = s.buildStats;
    const core = CORE_MAP[s.core];
    const unlockLines: [IconName, string][] = [
      ...r.unlocks.map((u): [IconName, string] => ['star', u]),
      ...r.achievements.map((a): [IconName, string] => ['trophy', t('results.achievementShort', { name: a })]),
      ...r.challenges.map((c): [IconName, string] => ['flag', t('results.challengeShort', { name: c })]),
      ...(r.arenaUnlocked ? [['battle', t('results.newArenaShort', { name: r.arenaUnlocked })] as [IconName, string]] : []),
      ...(r.difficultyUnlocked ? [['fire', t('results.newDifficultyShort', { name: r.difficultyUnlocked })] as [IconName, string]] : []),
      ...(r.ascensionUnlocked ? [['fire', t('results.ascensionShort', { n: r.ascensionUnlocked })] as [IconName, string]] : []),
      ...r.contracts.map((c): [IconName, string] => ['daily', t('results.contractShort', { name: c })]),
      ...(r.daily?.bonus ? [['daily', t('results.dailyBonusShort')] as [IconName, string]] : []),
      ...(r.daily?.newBest ? [['daily', t('results.dailyBestShort', { n: formatNum(r.daily.best) })] as [IconName, string]] : []),
      ...r.mastery.rewards.map((text): [IconName, string] => ['star', text]),
    ];
    const outcome = s.victory ? 'win' : abandoned ? 'ended' : 'lose';
    const reward = (currency: 'coins' | 'cores' | 'research', n: number) => h('div', { class: `reward-tile ${currency}` },
      icon(currency === 'coins' ? 'coin' : currency === 'cores' ? 'gem' : 'flask'),
      h('b', { 'data-count': String(n) }, `+${formatNum(n)}`), h('span', {}, t(`common.${currency}`)));
    const leveled = r.mastery.after > r.mastery.before;
    const masteryFrac = r.mastery.need ? r.mastery.into / r.mastery.need : 1;
    const screen = h('div', { class: `screen solid results ${outcome}` },
      h('div', { class: 'results-head' },
        h('div', { class: 'results-emblem', 'aria-hidden': 'true' }, icon(s.victory ? 'trophy' : abandoned ? 'flag' : 'skull')),
        h('div', { class: `result-title ${outcome}` }, s.victory ? t('results.complete') : abandoned ? t('results.ended') : t('results.defeated')),
        h('div', { class: 'results-sub' }, `${t('results.summary', { arena: ARENA_MAP[s.arena].name, difficulty: DIFFICULTIES[s.difficulty].name, time: formatTime(s.time) })}${s.ascension ? t('results.ascensionTag', { n: s.ascension }) : ''}${s.daily ? t('results.daily') : ''}`)),
      h('div', { class: 'scroll results-body' },
        h('div', { class: 'reward-row reveal' },
          reward('coins', r.rewards.coins),
          r.rewards.cores ? reward('cores', r.rewards.cores) : null,
          r.rewards.research ? reward('research', r.rewards.research) : null),
        h('div', { class: `mastery-card ${leveled ? 'leveled' : ''}`, style: `--core:${core.color}` },
          orb(core.color, 'small'),
          h('div', { class: 'mastery-copy' },
            h('div', { class: 'row' }, h('b', {}, t('results.masteryShort', { name: core.name, level: r.mastery.after })), leveled ? h('span', { class: 'level-up-tag' }, icon('arrowUp'), t('results.levelUp')) : null),
            h('div', { class: 'meter pink', role: 'presentation' }, h('i', { style: 'width:0%', 'data-to': String(masteryFrac * 100) })))),
        h('div', { class: `mastery-card rank-line ${r.rank.after > r.rank.before ? 'leveled' : ''}` },
          h('span', { class: 'rank-badge small' }, h('b', {}, String(r.rank.after))),
          h('div', { class: 'mastery-copy' },
            h('div', { class: 'row' }, h('b', {}, t('results.rankShort', { n: r.rank.after })), r.rank.after > r.rank.before ? h('span', { class: 'level-up-tag' }, icon('arrowUp'), t('results.levelUp')) : null),
            h('div', { class: 'meter gold', role: 'presentation' }, h('i', { style: 'width:0%', 'data-to': String(r.rank.need ? r.rank.into / r.rank.need * 100 : 100) })))),
        unlockLines.length ? h('div', { class: 'unlock-list reveal' }, unlockLines.map(([glyph, text]) => h('div', { class: 'unlock-card' }, h('span', { class: 'unlock-icon' }, icon(glyph)), h('span', {}, text)))) : null,
        h('div', { class: 'stat-grid reveal' },
          statTile(t('results.kills'), formatNum(s.kills)),
          statTile(t('results.bestCombo'), formatNum(s.bestCombo), !!best && s.bestCombo > best.combo && best.combo > 0),
          statTile(t('results.damageDealt'), formatNum(s.damageDealt)),
          statTile(t('results.level'), s.level),
          statTile(t('results.bounceChain'), s.maxBounceChain, !!best && s.maxWallChain > best.chain && best.chain > 0),
          statTile(t('results.bosses'), s.bossesDefeated.length),
          statTile(t('results.powerShots'), s.powerShots ?? 0),
          statTile(t('results.starfalls'), s.starfalls ?? 0),
          statTile(t('results.recalls'), s.recalls ?? 0)),
        h('div', { class: 'buildcard', style: `--core:${core.color}` },
          h('div', { class: 'buildcard-head' }, orb(core.color, 'small'), h('div', {}, h('small', {}, t('results.yourBuild')), h('div', { class: 'buildname' }, s.buildName))),
          h('div', { class: 'build-strip wrap' }, s.upgrades.map(u => UPGRADE_MAP[u.id] ? h('span', { class: `build-chip ${UPGRADE_MAP[u.id].rarity}`, title: UPGRADE_MAP[u.id].name }, h('span', { class: 'build-chip-icon' }, UPGRADE_MAP[u.id].icon), h('b', {}, String(u.level))) : null),
            (s.relics ?? []).map(id => RELIC_MAP[id] ? h('span', { class: `build-chip relic ${RELIC_MAP[id].rarity}`, title: RELIC_MAP[id].name }, h('span', { class: 'build-chip-icon' }, RELIC_MAP[id].icon)) : null)),
          h('div', { class: 'statgrid' },
            ...[[t('results.damage'), bs.damage.toFixed(0)], [t('results.crit'), `${Math.round(bs.critChance * 100)}%`], [t('results.speed'), Math.round(bs.speed)], [t('results.balls'), bs.balls],
              ...(bs.chain ? [[t('results.chain'), bs.chain]] : []), ...(bs.lifesteal ? [[t('results.lifesteal'), `${(bs.lifesteal * 100).toFixed(1)}%`]] : [])]
              .map(([k, v]) => h('div', {}, h('span', {}, String(k)), h('b', {}, String(v))))),
          s.synergies.length || s.evolutions.length ? h('div', { class: 'build-tags' },
            s.evolutions.map(id => h('span', { class: 'tag evo', style: `--c:${EVOLUTION_MAP[id].color}` }, `${EVOLUTION_MAP[id].icon} ${EVOLUTION_MAP[id].name}`)),
            s.synergies.map(id => h('span', { class: 'tag syn' }, `${SYNERGY_MAP[id].icon} ${SYNERGY_MAP[id].name}`))) : null),
        r.discoveries.some((d) => d.cat !== 'upgrades') ? [sectionTitle(t('results.discoveries')), h('div', { class: 'build-tags discoveries' },
          r.discoveries.filter((d) => d.cat !== 'upgrades').slice(0, 10).map((d) => h('span', { class: 'tag syn' }, t('results.discovery', { cat: discoveryLabel(d.cat), name: d.name }))))] : null,
        r.goals.length ? [sectionTitle(t('results.nextGoals')), h('div', { class: 'goal-list' }, r.goals.slice(0, 2).map(g => this.goalCard(g)))] : null,
      ),
      h('div', { class: 'results-actions' },
        h('button', { class: 'home-btn', onclick: () => { this.click(); this.home(); } }, icon('home'), t('results.home')),
        h('button', { class: 'primary big', onclick: () => { this.click(); this.game.replay(); } }, icon('play'), t('results.playAgain'))),
    );
    this.show(screen);
    this.celebrate(screen, s.victory);
  }

  /** Rewards roll up with rising ticks and the mastery bar fills: the payoff is felt, not just read. */
  private celebrate(screen: HTMLElement, victory: boolean): void {
    const counters = [...screen.querySelectorAll<HTMLElement>('.reward-tile b[data-count]')];
    const start = performance.now() + 250, dur = 900;
    let ticks = 0;
    const step = (now: number) => {
      if (!screen.isConnected) return;
      const k = Math.max(0, Math.min(1, (now - start) / dur));
      const e = 1 - Math.pow(1 - k, 3);
      for (const c of counters) c.textContent = localizeDigits(`+${formatNum(Math.round(Number(c.dataset.count) * e))}`);
      const due = Math.floor(k * 8);
      if (k > 0 && due > ticks && counters.length) { ticks = due; this.game.audio.play('coin', 1 + ticks * 0.06, 0.45); }
      if (k < 1) requestAnimationFrame(step);
      else for (const c of counters) feedback(c.closest<HTMLElement>('.reward-tile'));
    };
    requestAnimationFrame(step);
    setTimeout(() => {
      for (const bar of screen.querySelectorAll<HTMLElement>('.mastery-card .meter > i')) bar.style.width = `${bar.dataset.to}%`;
    }, 450);
    if (victory) this.game.haptic('victory');
  }
}
