import { formatNum, formatTime } from '../core/math';
import { dailySeed } from '../core/rng';
import { ARENAS, ARENA_MAP, DIFFICULTIES, EVENT_MAP, PACTS } from '../data/arenas';
import { CORES, CORE_MAP, PART_MAP, TRAILS } from '../data/balls';
import { BOSSES, BOSS_MAP, CODEX_ENEMIES } from '../data/enemies';
import { ACHIEVEMENTS, CHALLENGES, RESEARCH, WORKSHOP, masteryLevel, masteryRewards } from '../data/meta';
import { EVOLUTIONS, EVOLUTION_MAP, REACTIONS, SYNERGIES, SYNERGY_MAP } from '../data/synergies';
import { UPGRADES, UPGRADE_MAP } from '../data/upgrades';
import type { PartSlot, Rarity, Tag } from '../data/types';
import {
  buyPart, buyWorkshop, canResearch, canUnlockCore, coreRequirementMet, describeUnlock, doResearch, isArenaUnlocked, maxDifficulty,
  nextGoals, partsForSlot, rewardMultiplier, unlockCore, workshopCost, type Goal, type RunReport,
} from '../meta/progress';
import { defaultProfile } from '../meta/profile';
import type { DiscoveryCat, RunSummary } from '../meta/types';
import { feedsEvolutions, previewSynergies, type Offer } from '../sim/offers';
import { STAT_FORMATS, statLabel, type StatKey } from '../sim/stats';
import { RECALL_COOLDOWN, type World } from '../sim/world';
import type { Game } from '../game';
import { LANGUAGES, t, type UiKey } from '../i18n';
import { bar, h } from './dom';
import { talentScreen } from './talents';
import { TALENTS, talentSpent } from '../data/talents';
import { talentProgress } from '../meta/talents';
import { createDeck, deckSections, type Deck, type DeckState } from './deck';
import { Navigation } from './navigation';
import { cancelWithin, enter, feedback, retire, revealItems, revealView, tabFeedback, type MotionDirection } from './motion';
import { homeIcon } from './home-icons';

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

export class UI {
  readonly navigation = new Navigation();
  private root: HTMLElement;
  private hudEl: HTMLElement | null = null;
  private surgeBtn: HTMLButtonElement | null = null;
  private recallBtn: HTMLButtonElement | null = null;
  private compactTelemetry: HTMLElement | null = null;
  private hintEl: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private screenEl: HTMLElement | null = null;
  private screenDeck: Deck | null = null;
  private overlayDeck: Deck | null = null;
  private deckStates = new Map<string, DeckState>();
  private setup = { arena: 'proving', difficulty: 0, pacts: new Set<string>() };
  private codexTab = 'balls';
  private banishMode = false;
  private interactionKey: string | null = null;

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

  private show(el: HTMLElement): void {
    this.closeOverlay();
    if (this.screenEl === el) return;
    const same = this.screenEl?.dataset.view === this.navigation.key;
    const oldTab = this.screenEl?.querySelector('.tabs .on');
    const oldIndex = oldTab ? [...oldTab.parentElement!.children].indexOf(oldTab) : -1;
    const oldTabRect = oldTab?.getBoundingClientRect();
    const tab = el.querySelector('.tabs .on');
    const index = tab ? [...tab.parentElement!.children].indexOf(tab) : -1;
    const tabChanged = index !== oldIndex;
    const interactionKey = this.interactionKey; this.interactionKey = null;
    const walletChanged = this.screenEl?.querySelector('.wallet')?.textContent !== el.querySelector('.wallet')?.textContent;
    if (!same) retire(this.screenEl, 'page', this.motionDirection);
    this.screenDeck?.dispose();
    cancelWithin(this.screenEl);
    this.screenEl?.remove();
    this.screenEl = el;
    el.dataset.view = this.navigation.key;
    this.root.append(el);
    this.screenDeck = this.prepareDeck(el, !same || tabChanged);
    if (same) {
      const content = el.querySelector<HTMLElement>('.deck-content, .talent-forest');
      if (content && tabChanged) enter(content, 'content', index > oldIndex ? 1 : -1);
      const tabs = el.querySelector<HTMLElement>('.tabs');
      if (tabs) tabFeedback(tabs, oldTabRect);
      // The deck mounts its visible cards on the next frame. Pulse the actual changed choice.
      requestAnimationFrame(() => {
        if (this.screenEl !== el) return;
        const target = interactionKey ? el.querySelector<HTMLElement>(`[data-motion-key="${CSS.escape(interactionKey)}"]`) : null;
        feedback(target ?? el.querySelector('.selected, .aim-option[aria-pressed="true"]'));
      });
      feedback(el.querySelector('.setup-footer'));
      if (walletChanged) feedback(el.querySelector('.wallet'));
    } else {
      enter(el, 'page', this.motionDirection);
      revealView(el);
    }
  }

  private showOverlay(el: HTMLElement, key: string): void {
    const same = this.overlay?.dataset.view === key;
    if (!same) retire(this.overlay, 'panel', 0);
    this.overlayDeck?.dispose();
    cancelWithin(this.overlay);
    this.overlay?.remove();
    this.overlay = el; el.dataset.view = key;
    this.root.append(el);
    this.overlayDeck = this.prepareDeck(el);
    const content = same ? el.querySelector<HTMLElement>('.deck-content') : el;
    if (content) enter(content, same ? 'content' : 'panel', 0);
    if (same) feedback(el.querySelector('.offer-actions'));
    else revealView(el);
  }

  private prepareDeck(el: HTMLElement, animateInitial = true): Deck | null {
    if (el.matches('.home, .talent-screen')) return null;
    const source = el.querySelector<HTMLElement>(':scope > .scroll, :scope > .offer-list');
    if (!source) return null;
    const title = el.querySelector('h2, .lvtitle, .result-title')?.textContent ?? t('common.menu');
    const key = `${title}:${el.querySelector('.tabs .on')?.textContent ?? ''}`;
    const state = this.deckStates.get(key) ?? { section: 0, page: 0 };
    this.deckStates.set(key, state);
    const deck = createDeck(deckSections(source), state, source.className.replace(/\bscroll\b|\bcol\b/g, '').trim(), animateInitial);
    source.replaceWith(deck.element);
    el.classList.add('paged-screen');
    return deck;
  }

  clearScreen(): void {
    retire(this.screenEl, 'page', this.motionDirection);
    cancelWithin(this.screenEl);
    this.screenDeck?.dispose(); this.screenDeck = null;
    this.screenEl?.remove();
    this.screenEl = null;
  }

  toast(text: string): void {
    const el = h('div', { class: 'toast' }, text);
    this.root.append(el);
    enter(el, 'notice', 0);
    setTimeout(() => { retire(el, 'notice', 0); cancelWithin(el); el.remove(); }, 1800);
  }

  private currency(): HTMLElement {
    const p = this.p;
    return h('div', { class: 'chips wallet', 'aria-label': t('common.currencies') },
      h('span', { class: 'chip coins', title: `${p.coins.toLocaleString()} ${t('common.coins')}` }, `🪙 ${formatNum(p.coins)}`),
      h('span', { class: 'chip cores', title: `${p.cores.toLocaleString()} ${t('common.cores')}` }, `💠 ${formatNum(p.cores)}`),
      h('span', { class: 'chip research', title: `${p.research.toLocaleString()} ${t('common.research')}` }, `🔬 ${formatNum(p.research)}`),
    );
  }

  back(): boolean {
    return this.navigation.back();
  }

  private topbar(title: string): HTMLElement {
    return h('div', { class: 'topbar menu-topbar' },
      h('button', { class: 'ghost', 'aria-label': t('common.back'), onclick: () => { this.click(); this.back(); } }, t('common.backGlyph')),
      h('h2', {}, title),
      this.currency(),
    );
  }

  private goalList(goals: Goal[]): HTMLElement {
    return h('div', { class: 'col' }, goals.map((g) => h('div', { class: 'card goal' },
      h('div', { style: 'flex:1' },
        h('div', { class: 'gtext' }, g.text),
        h('div', { class: 'greward' }, `${t('common.rewardArrow')} ${g.reward}`),
        g.max > 1 ? bar(g.cur / g.max, 'gold') : null,
      ),
      g.max > 1 ? h('div', { class: 'small muted' }, `${Math.floor(g.cur)}/${g.max}`) : null,
    )));
  }

  // ------------------------------------------------------------------ home
  home(): void {
    this.navigation.reset(() => this.home());
    this.game.toMenu();
    const p = this.p;
    const coreDef = CORE_MAP[p.loadout.core];
    const nav = (icon: Parameters<typeof homeIcon>[0], label: string, description: string, color: string, fn: () => void, badge = false) =>
      h('button', { class: 'home-nav-tile', style: `--tile-color:${color}`, onclick: () => { this.click(); fn(); } },
        h('span', { class: 'home-nav-icon' }, homeIcon(icon)),
        h('span', { class: 'home-nav-copy' }, h('strong', {}, label), h('small', {}, description)),
        badge ? h('span', { class: 'home-nav-badge', title: t('home.upgradeAvailable'), 'aria-label': t('home.upgradeAvailable') }) : null,
      );
    const canAffordResearch = RESEARCH.some((r) => canResearch(p, r.id));
    const canAffordCore = CORES.some((c) => canUnlockCore(p, c.id));
    const mastery = masteryLevel(p.mastery[p.loadout.core] ?? 0);
    const available = talentProgress(p).total - talentSpent(p.talents);
    this.show(h('div', { class: `screen home ${p.tutorialDone ? '' : 'home-first-run'}`, style: `--core-color:${coreDef.color}` },
      h('div', { class: 'home-topline' },
        h('span', { class: 'eyebrow home-system' }, h('i', { 'aria-hidden': 'true' }), t('home.system')), this.currency()),
      h('div', { class: 'scroll home-content' },
        h('div', { class: 'hero' },
          h('div', { class: 'eyebrow hero-kicker' }, t('home.kicker')),
          h('h1', { class: 'title', lang: 'en', dir: 'ltr' }, t('home.title1'), h('br'), h('span', {}, t('home.title2'))),
          h('div', { class: 'reactor-art', 'aria-hidden': 'true' },
            h('div', { class: 'reactor-scene' },
              h('div', { class: 'reactor-halo' }),
              h('div', { class: 'reactor-crosshair' }),
              h('div', { class: 'orbit orbit-one' }), h('div', { class: 'orbit orbit-two' }),
              h('div', { class: 'orbit-plane plane-one' }, h('i')),
              h('div', { class: 'orbit-plane plane-two' }, h('i')),
              h('div', { class: 'reactor-ball' }),
              h('div', { class: 'signal-orbit' }, h('i'), h('i'), h('i')),
              h('div', { class: 'reactor-dust' }, h('i'), h('i'), h('i'), h('i'), h('i')),
            ),
            h('span', { class: 'reactor-coordinate coordinate-left' }, t(`element.${coreDef.element ?? 'kinetic'}` as UiKey), h('br'),
              t('home.coreCoordinate', { n: String(CORES.indexOf(coreDef) + 1).padStart(2, '0') })),
            h('span', { class: 'reactor-coordinate coordinate-right' }, t('home.resonance'), h('br'), t('home.stable')),
          ),
          h('div', { class: 'subtitle' }, t('home.subtitle')),
          h('div', { class: 'hero-description' }, t('home.description')),
        ),
        h('div', { class: 'col home-actions' },
          h('button', { class: 'primary big launch-button', onclick: () => { this.click(); p.tutorialDone ? this.runSetup() : this.game.startRun({ arena: 'proving', difficulty: 0, pacts: [] }); } },
            h('span', { class: 'launch-copy' }, h('strong', {}, p.tutorialDone ? t('home.play') : t('home.start')),
              h('small', {}, p.tutorialDone ? t('home.deploy') : t('home.firstContact'))),
            h('span', { class: 'launch-arrow', 'aria-hidden': 'true' }, t('home.launchArrow'))),
          h('div', { class: 'core-readout' }, h('span', { class: 'status-dot', style: `background:${coreDef.color}` }),
            t('home.equipped', { core: coreDef.name }), h('span', { class: 'spacer' }), h('span', { class: 'core-mastery' }, t('home.mastery'), h('b', {}, mastery.level))),
          p.tutorialDone ? h('div', { class: 'grid2 home-nav' },
            nav('daily', t('home.nav.daily'), t('home.nav.dailyDesc'), '#9ac9ff', () => this.dailyRun()),
            nav('talents', t('home.nav.talentsCount', { n: available }), t('home.nav.talentsDesc'), '#c8a5ff', () => this.talents(), available > 0),
            nav('loadout', t('home.nav.loadout'), t('home.nav.loadoutDesc'), '#91ead4', () => this.loadout(), canAffordCore),
            nav('workshop', t('home.nav.workshop'), t('home.nav.workshopDesc'), '#ffbe86', () => this.workshop()),
            nav('research', t('home.nav.research'), t('home.nav.researchDesc'), '#90dbe9', () => this.research(), canAffordResearch),
            nav('codex', t('home.nav.codex'), t('home.nav.codexDesc'), '#aaaef9', () => this.codex()),
            nav('goals', t('home.nav.goals'), t('home.nav.goalsDesc'), '#f4d784', () => this.goals()),
            nav('settings', t('home.nav.settings'), t('home.nav.settingsDesc'), '#a3b8cc', () => this.settings()),
          ) : [nav('talents', t('home.nav.talents'), t('home.nav.talentsFirstDesc'), '#c8a5ff', () => this.talents()), h('div', { class: 'first-run-guide' },
            h('div', {}, h('b', {}, '01'), h('span', {}, t('home.guide1'))),
            h('div', {}, h('b', {}, '02'), h('span', {}, t('home.guide2'))),
            h('div', {}, h('b', {}, '03'), h('span', {}, t('home.guide3'))),
          )],
          h('div', { class: 'home-stats', 'aria-label': t('home.stats') },
            h('div', {}, h('strong', {}, formatNum(p.stats.runs)), h('span', {}, t('home.runs'))),
            h('div', {}, h('strong', {}, formatNum(p.stats.wins)), h('span', {}, t('home.wins'))),
            h('div', {}, h('strong', {}, formatNum(p.stats.bestCombo)), h('span', {}, t('home.bestCombo'))),
          ),
        ),
      ),
    ));
  }

  private dailyRun(): void {
    const seed = dailySeed();
    const unlocked = ARENAS.filter((a) => isArenaUnlocked(this.p, a.id));
    const arena = unlocked[seed % unlocked.length].id;
    this.game.startRun({ arena, difficulty: Math.min(1, maxDifficulty(this.p)), pacts: [], seed, daily: true });
  }

  // ------------------------------------------------------------------ run setup
  talents(): void {
    const view = talentScreen(this.p, () => { this.click(); this.game.save(); }, () => { this.click(); this.back(); });
    this.navigation.view('talents', () => this.show(view.element), {
      guard: {
        when: () => view.detailOpen || view.dirty,
        act: () => {
          if (view.detailOpen) view.closeDetail();
          else this.confirmAction(t('talents.discardTitle'), t('talents.discardMessage'), t('talents.discard'), () => {
            view.discard();
            this.navigation.dismiss(2);
          }, () => view.element.querySelector<HTMLButtonElement>('.topbar button')?.focus({ preventScroll: true }), t('talents.keepEditing'));
        },
      },
    });
    this.show(view.element);
  }

  runSetup(): void {
    this.navigation.view('setup', () => this.runSetup());
    const p = this.p;
    const s = this.setup;
    if (!isArenaUnlocked(p, s.arena)) s.arena = 'proving';
    s.difficulty = Math.min(s.difficulty, maxDifficulty(p));
    const pactsOn = this.game.flags().includes('pacts');
    if (!pactsOn) s.pacts.clear();
    const mult = rewardMultiplier({ difficulty: s.difficulty, pacts: [...s.pacts] });
    const rerender = () => { this.click(); this.runSetup(); };
    this.show(h('div', { class: 'screen' },
      this.topbar(t('setup.title')),
      h('div', { class: 'scroll' },
        h('div', { class: 'card setup-overview' }, h('div', { class: 'name' }, t('setup.talents', { spent: talentSpent(p.talents), total: talentProgress(p).total })),
          h('div', { class: 'desc' }, t('setup.talentsDesc')),
          h('button', { style: 'margin-top:8px', onclick: () => this.talents() }, t('setup.editTalents'))),
        h('h3', {}, t('setup.arena')),
        h('div', { class: 'col' }, ARENAS.map((a) => {
          const ok = isArenaUnlocked(p, a.id);
          const cleared = p.cleared[a.id] ?? -1;
          return h('div', {
            class: `card ${s.arena === a.id ? 'selected' : ''} ${ok ? '' : 'locked'}`,
            'data-motion-key': `arena:${a.id}`,
            style: `border-inline-start: 4px solid ${a.theme.accent}`,
            onclick: () => { if (ok) { s.arena = a.id; rerender(); } },
          },
          h('div', { class: 'row' }, h('div', { class: 'name', style: 'flex:1' }, ok ? a.name : t('common.lockedName', { name: a.name })),
            cleared >= 0 ? h('span', { class: 'chip', style: `color:${DIFFICULTIES[cleared].color}` }, `✓ ${DIFFICULTIES[cleared].name}`) : null),
          h('div', { class: 'desc' }, ok ? t('setup.boss', { desc: a.desc, name: BOSSES.find((b) => b.id === a.bossId)?.name ?? '' }) : a.unlockReq?.text ?? ''));
        })),
        h('h3', {}, t('setup.difficulty')),
        h('div', { class: 'difficulty-options' }, DIFFICULTIES.map((d, i) => {
          const ok = i <= maxDifficulty(p);
          return h('button', {
            disabled: !ok,
            'data-motion-key': `difficulty:${i}`,
            style: s.difficulty === i ? `background:${d.color};color:#0a0612` : `color:${d.color}`,
            onclick: () => { s.difficulty = i; rerender(); },
          }, ok ? d.name : t('common.lockedName', { name: d.name }));
        })),
        h('div', { class: 'small muted', style: 'margin-top:6px' }, `${DIFFICULTIES[s.difficulty].desc} ${DIFFICULTIES[s.difficulty].rules.join(' · ')}`),
        pactsOn ? [
          h('h3', {}, t('setup.pacts')),
          h('div', { class: 'grid2' }, PACTS.map((pc) => h('div', {
            class: `card ${s.pacts.has(pc.id) ? 'selected' : ''}`,
            'data-motion-key': `pact:${pc.id}`,
            onclick: () => { if (s.pacts.has(pc.id)) s.pacts.delete(pc.id); else s.pacts.add(pc.id); rerender(); },
          }, h('div', { class: 'name' }, `${pc.icon} ${pc.name}`), h('div', { class: 'desc' }, pc.desc), h('div', { class: 'small', style: 'color:var(--gold);margin-top:4px' }, t('setup.pactReward', { n: Math.round(pc.reward * 100) }))))),
        ] : h('div', { class: 'small muted', style: 'margin-top:14px' }, t('setup.pactsLocked')),
      ),
      h('div', { class: 'col setup-footer', style: 'margin-top:8px' },
        h('div', { class: 'center small', style: 'color:var(--gold)' }, t('setup.multiplier', { n: mult.toFixed(2) })),
        h('button', { class: 'primary big', onclick: () => { this.click(); this.game.startRun({ arena: s.arena, difficulty: s.difficulty, pacts: [...s.pacts] }); } }, t('setup.launch')),
      ),
    ));
  }

  // ------------------------------------------------------------------ loadout
  loadout(): void {
    this.navigation.view('loadout', () => this.loadout());
    const p = this.p;
    const l = p.loadout;
    const rerender = () => { this.click(); this.game.save(); this.loadout(); };
    const slot = (title: string, s: PartSlot) => [
      h('h3', {}, title),
      h('div', { class: 'grid2' }, partsForSlot(p, s).map(({ def, unlocked }) => {
        const selected = (l as unknown as Record<string, string>)[s] === def.id;
        const buyable = !unlocked && def.unlock?.coins;
        return h('div', {
          class: `card ${selected ? 'selected' : ''} ${unlocked ? '' : 'locked'}`,
          'data-motion-key': `part:${def.id}`,
          onclick: () => {
            if (unlocked) { (l as unknown as Record<string, string>)[s] = def.id; rerender(); }
            else if (buyable && buyPart(p, def.id)) { (l as unknown as Record<string, string>)[s] = def.id; this.toast(t('loadout.partUnlocked', { name: def.name })); rerender(); }
          },
        },
        h('div', { class: 'name' }, `${def.icon} ${def.name}`),
        h('div', { class: 'desc' }, def.desc),
        !unlocked ? h('div', { class: 'small', style: `margin-top:4px;color:${buyable && p.coins >= (def.unlock!.coins ?? 0) ? 'var(--gold)' : 'var(--muted)'}` }, t('common.lockedText', { text: def.unlock!.text })) : null);
      })),
    ];
    this.show(h('div', { class: 'screen' },
      this.topbar(t('loadout.title')),
      h('div', { class: 'scroll' },
        h('h3', {}, t('loadout.core')),
        h('div', { class: 'col' }, CORES.map((c) => {
          const owned = p.unlockedCores.includes(c.id);
          const m = masteryLevel(p.mastery[c.id] ?? 0);
          const reqOk = coreRequirementMet(p, c.id);
          return h('div', {
            class: `card ${l.core === c.id ? 'selected' : ''} ${owned ? '' : 'locked'}`,
            'data-motion-key': `core:${c.id}`,
            style: `border-inline-start:4px solid ${c.color}`,
            onclick: () => { if (owned) { l.core = c.id; rerender(); } },
          },
          h('div', { class: 'row' }, h('div', { class: 'icon' }, c.icon), h('div', { style: 'flex:1' },
            h('div', { class: 'name' }, c.name),
            h('div', { class: 'desc' }, c.desc))),
          h('div', { class: 'desc', style: 'color:#d8d5f5' }, c.passive),
          owned ? [h('div', { class: 'small muted', style: 'margin-top:6px' }, m.need ? t('loadout.mastery', { level: m.level, into: Math.floor(m.into), need: m.need }) : t('loadout.masteryMax', { level: m.level })), bar(m.need ? m.into / m.need : 1, 'pink')]
            : h('div', { class: 'row', style: 'margin-top:8px' },
              h('div', { class: 'small muted', style: 'flex:1' }, reqOk ? t('loadout.costs', { n: c.unlockCost }) : t('common.lockedText', { text: c.unlockReq?.text ?? '' })),
              h('button', {
                class: 'gold', disabled: !canUnlockCore(p, c.id),
                onclick: (e: MouseEvent) => { e.stopPropagation(); if (unlockCore(p, c.id)) { l.core = c.id; this.game.audio.play('synergy'); this.toast(t('loadout.coreUnlocked', { icon: c.icon, name: c.name })); rerender(); } },
              }, t('loadout.unlock', { n: c.unlockCost }))));
        })),
        slot(t('loadout.shell'), 'shell'),
        slot(t('loadout.impact'), 'impact'),
        slot(t('loadout.momentum'), 'momentum'),
        h('h3', {}, t('loadout.trail')),
        h('div', { class: 'row wrap trail-options' }, TRAILS.map((tr) => {
          const owned = p.cosmetics.includes(tr.id);
          return h('button', {
            disabled: !owned,
            'data-motion-key': `trail:${tr.id}`,
            style: `background:linear-gradient(90deg,${tr.colors[0]},${tr.colors[1]});color:#0a0612;${l.trail === tr.id ? 'outline:3px solid #fff' : ''}`,
            onclick: () => { l.trail = tr.id; rerender(); },
          }, owned ? tr.name : '🔒');
        })),
        h('h3', {}, t('loadout.presets')),
        h('div', { class: 'grid3 presets' }, [0, 1, 2].map((i) => {
          const pr = p.presets[i];
          return h('div', { class: 'card center', 'data-motion-key': `preset:${i}` },
            h('div', { class: 'small' }, pr ? `${CORE_MAP[pr.core]?.icon} ${presetLabel(pr)}` : t('loadout.slot', { n: i + 1 })),
            h('div', { class: 'row preset-actions', style: 'justify-content:center;margin-top:6px' },
              // The stored name is kept for older saves; the card shows a label derived from the parts.
              h('button', { class: 'small', onclick: () => { p.presets[i] = { ...l, name: presetLabel(l) }; this.toast(t('loadout.presetSaved')); rerender(); } }, t('common.save')),
              pr ? h('button', { class: 'small', onclick: () => { Object.assign(l, { core: pr.core, shell: pr.shell, impact: pr.impact, momentum: pr.momentum, trail: pr.trail }); rerender(); } }, t('common.load')) : null,
            ));
        })),
      ),
    ));
  }

  // ------------------------------------------------------------------ workshop
  workshop(): void {
    this.navigation.view('workshop', () => this.workshop());
    const p = this.p;
    this.show(h('div', { class: 'screen' },
      this.topbar(t('workshop.title')),
      h('div', { class: 'small muted', style: 'margin-bottom:8px' }, t('workshop.intro')),
      h('div', { class: 'scroll col' }, WORKSHOP.map((wd) => {
        const lvl = p.workshop[wd.id] ?? 0;
        const cost = workshopCost(p, wd.id);
        return h('div', { class: 'card row', 'data-motion-key': `workshop:${wd.id}` },
          h('div', { class: 'icon' }, wd.icon),
          h('div', { style: 'flex:1' },
            h('div', { class: 'name' }, `${wd.name} `, h('span', { class: 'small muted' }, `${lvl}/${wd.maxLevel}`)),
            h('div', { class: 'desc' }, lvl > 0 ? t('workshop.now', { text: wd.desc(lvl) }) : wd.desc(1)),
            cost !== null && lvl > 0 ? h('div', { class: 'desc' }, t('workshop.next', { text: wd.desc(lvl + 1) })) : null),
          cost === null ? h('span', { class: 'chip' }, t('common.max')) : h('button', {
            class: 'gold', disabled: p.coins < cost,
            onclick: () => { if (buyWorkshop(p, wd.id)) { this.game.audio.play('select'); this.game.save(); this.workshop(); } },
          }, h('span', { class: 'coin-badge', 'aria-hidden': 'true' }, '🪙'), formatNum(cost)));
      })),
    ));
  }

  // ------------------------------------------------------------------ research
  research(): void {
    this.navigation.view('research', () => this.research());
    const p = this.p;
    this.show(h('div', { class: 'screen' },
      this.topbar(t('research.title')),
      h('div', { class: 'small muted', style: 'margin-bottom:8px' }, t('research.intro')),
      h('div', { class: 'scroll col' }, RESEARCH.map((r) => {
        const done = p.researchNodes.includes(r.id);
        const reqOk = r.requires.every((x) => p.researchNodes.includes(x));
        return h('div', { class: `card row ${done ? 'selected' : ''} ${reqOk ? '' : 'locked'}`, 'data-motion-key': `research:${r.id}` },
          h('div', { class: 'icon' }, r.icon),
          h('div', { style: 'flex:1' },
            h('div', { class: 'name' }, r.name),
            h('div', { class: 'desc' }, r.desc),
            !reqOk ? h('div', { class: 'small muted' }, t('research.requires', { list: r.requires.map((x) => RESEARCH.find((y) => y.id === x)?.name).join(', ') })) : null),
          done ? h('span', { class: 'chip', style: 'color:var(--green)' }, '✓') : h('button', {
            disabled: !canResearch(p, r.id),
            onclick: () => {
              const got = doResearch(p, r.id);
              this.game.audio.play('synergy');
              this.toast(got[0] ?? t('research.done', { name: r.name }));
              this.game.save();
              this.research();
            },
          }, `🔬 ${r.cost}`));
      })),
    ));
  }

  // ------------------------------------------------------------------ codex
  codex(): void {
    this.navigation.view('codex', () => this.codex());
    const p = this.p;
    const d = p.discoveries;
    const tabs: [string, string, number, number][] = [
      ['balls', t('codex.balls'), p.unlockedCores.length, CORES.length],
      ['upgrades', t('codex.upgrades'), d.upgrades.length, UPGRADES.length],
      ['synergies', t('codex.synergies'), d.synergies.length, SYNERGIES.length],
      ['evolutions', t('codex.evolutions'), d.evolutions.length, EVOLUTIONS.length],
      ['reactions', t('codex.reactions'), d.reactions.length, REACTIONS.length],
      ['enemies', t('codex.enemies'), d.enemies.length, CODEX_ENEMIES.length],
      ['bosses', t('codex.bosses'), d.bosses.length, BOSSES.length],
      ['arenas', t('codex.arenas'), d.arenas.length, ARENAS.length],
    ];
    const total = tabs.reduce((a, tab) => a + tab[2], 0);
    const max = tabs.reduce((a, tab) => a + tab[3], 0);
    const unknown = (hint: string) => h('div', { class: 'card locked' }, h('div', { class: 'name' }, t('codex.unknown')), h('div', { class: 'desc' }, hint));
    let body: HTMLElement[] = [];
    switch (this.codexTab) {
      case 'balls':
        body = CORES.map((c) => p.unlockedCores.includes(c.id)
          ? h('div', { class: 'card' }, h('div', { class: 'name' }, `${c.icon} ${c.name}`), h('div', { class: 'desc' }, c.passive))
          : unknown(c.unlockReq?.text ?? t('codex.coresCost', { n: c.unlockCost })));
        break;
      case 'upgrades':
        body = UPGRADES.map((u) => d.upgrades.includes(u.id)
          ? h('div', { class: 'card' }, h('div', { class: 'name' }, `${u.icon} ${u.name} `, h('span', { class: 'tag' }, rarityLabel(u.rarity))), h('div', { class: 'desc' }, u.desc(1)), h('div', {}, u.tags.map((tag) => h('span', { class: 'tag' }, tagLabel(tag)))))
          : unknown(u.locked ? t('codex.lockedUpgrade') : t('codex.takeUpgrade')));
        break;
      case 'synergies':
        body = SYNERGIES.map((s) => d.synergies.includes(s.id)
          ? h('div', { class: 'card' }, h('div', { class: 'name' }, `${s.icon} ${s.name} `, h('span', { class: 'tag' }, tierLabel(s.tier))), h('div', { class: 'desc' }, s.desc), h('div', { class: 'small muted' }, s.hint))
          : unknown(s.tier === 'known' ? t('codex.hint', { hint: s.hint }) : s.hint));
        break;
      case 'evolutions':
        body = EVOLUTIONS.map((e) => {
          const known = d.evolutions.includes(e.id);
          const showRecipe = known || this.game.flags().includes('codex');
          const recipe = e.recipe.map((r) => r.level > 1 ? t('codex.recipeLevel', { name: UPGRADE_MAP[r.id].name, level: r.level }) : UPGRADE_MAP[r.id].name).join(' + ');
          return known || showRecipe
            ? h('div', { class: `card ${known ? '' : 'locked'}` }, h('div', { class: 'name' }, `${e.icon} ${known ? e.name : '???'}`), h('div', { class: 'desc' }, known ? e.desc : t('codex.notEvolved')), h('div', { class: 'small', style: 'color:var(--gold);margin-top:4px' }, recipe))
            : unknown(t('codex.evolutionHint'));
        });
        break;
      case 'reactions':
        body = REACTIONS.map((r) => d.reactions.includes(r.id)
          ? h('div', { class: 'card' }, h('div', { class: 'name' }, `${r.icon} ${r.name}`), h('div', { class: 'desc' }, r.desc))
          : unknown(t('codex.reactionHint', { a: elementName(r.elements[0]), b: elementName(r.elements[1]) })));
        break;
      case 'enemies':
        body = CODEX_ENEMIES.map((e) => d.enemies.includes(e.id)
          ? h('div', { class: 'card', style: `border-inline-start:4px solid ${e.color}` }, h('div', { class: 'name' }, e.name), h('div', { class: 'desc' }, e.desc), h('div', { class: 'small', style: 'color:var(--green);margin-top:4px' }, t('codex.tip', { tip: e.tip })))
          : unknown(t('codex.notEncountered')));
        break;
      case 'bosses':
        body = BOSSES.map((b) => d.bosses.includes(b.id)
          ? h('div', { class: 'card' }, h('div', { class: 'name' }, t('codex.bossTitle', { name: b.name, title: b.title })), h('div', { class: 'desc' }, b.desc), h('div', { class: 'small muted' }, t('codex.defeated', { n: p.bossKills[b.id] ?? 0 })))
          : unknown(t('codex.bossUnknown')));
        break;
      case 'arenas':
        body = ARENAS.map((a) => d.arenas.includes(a.id)
          ? h('div', { class: 'card', style: `border-inline-start:4px solid ${a.theme.accent}` }, h('div', { class: 'name' }, a.name), h('div', { class: 'desc' }, a.desc), h('div', { class: 'small muted' }, t('codex.events', { list: a.events.map((e) => EVENT_MAP[e].name).join(', ') })))
          : unknown(a.unlockReq?.text ?? ''));
        break;
    }
    this.show(h('div', { class: 'screen' },
      this.topbar(t('codex.title', { pct: Math.round((total / max) * 100) })),
      h('div', { class: 'tabs codex-tabs', role: 'tablist', 'aria-label': t('codex.categories') }, tabs.map(([id, label, n, m]) => h('button', {
        role: 'tab', 'aria-selected': String(this.codexTab === id), class: this.codexTab === id ? 'on' : '',
        'data-motion-key': `codex:${id}`,
        onclick: () => { this.codexTab = id; this.click(); this.codex(); },
      }, h('span', {}, label), h('small', {}, `${n}/${m}`)))),
      h('div', { class: 'scroll col' }, body),
    ));
  }

  // ------------------------------------------------------------------ goals
  goals(): void {
    this.navigation.view('goals', () => this.goals());
    const p = this.p;
    this.show(h('div', { class: 'screen' },
      this.topbar(t('goals.title')),
      h('div', { class: 'scroll' },
        h('h3', {}, t('goals.next')), this.goalList(nextGoals(p, 3)),
        h('h3', {}, t('goals.challenges', { n: p.challenges.length, max: CHALLENGES.length })),
        h('div', { class: 'col' }, CHALLENGES.map((c) => {
          const done = p.challenges.includes(c.id);
          return h('div', { class: `card ${done ? 'selected' : ''}` },
            h('div', { class: 'name' }, `${c.icon} ${c.name} ${done ? '✓' : ''}`),
            h('div', { class: 'desc' }, c.desc),
            h('div', { class: 'small', style: 'color:var(--gold);margin-top:3px' }, c.rewards.map(describeUnlock).join(', ')));
        })),
        h('h3', { 'data-tab-label': t('goals.badges') }, t('goals.achievements', { n: p.achievements.length, max: ACHIEVEMENTS.length })),
        h('div', { class: 'col' }, ACHIEVEMENTS.map((a) => {
          const done = p.achievements.includes(a.id);
          const [cur, max] = a.progress(p);
          return h('div', { class: `card ${done ? 'selected' : ''}` },
            h('div', { class: 'row' }, h('div', { class: 'name', style: 'flex:1' }, `${a.icon} ${a.name} ${done ? '✓' : ''}`), h('span', { class: 'small muted' }, `${Math.min(cur, max)}/${max}`)),
            h('div', { class: 'desc' }, a.desc),
            done ? null : bar(cur / max, 'gold'));
        })),
        h('h3', {}, t('goals.mastery')),
        h('div', { class: 'col' }, CORES.filter((c) => p.unlockedCores.includes(c.id)).map((c) => {
          const m = masteryLevel(p.mastery[c.id] ?? 0);
          const next = masteryRewards(c.id).find((r) => r.level === m.level + 1);
          return h('div', { class: 'card' },
            h('div', { class: 'name' }, t('goals.masteryLevel', { icon: c.icon, name: c.name, level: m.level })),
            next ? h('div', { class: 'desc' }, t('goals.nextReward', { text: next.text })) : h('div', { class: 'desc' }, t('goals.mastered')),
            bar(m.need ? m.into / m.need : 1, 'pink'));
        })),
      ),
    ));
  }

  // ------------------------------------------------------------------ settings
  settings(): void {
    const world = this.game.world;
    this.navigation.view('settings', () => this.settings(), { valid: () => !world || this.game.world === world });
    const s = this.p.settings;
    const apply = () => { this.game.applySettings(); this.game.save(); };
    const switchState = (on: boolean) => (on ? t('settings.on') : t('settings.off'));
    const toggle = (label: string, desc: string, key: 'shake' | 'damageNumbers' | 'debug') =>
      h('button', {
        type: 'button', class: 'setting-switch', role: 'switch', 'aria-label': label, 'aria-checked': String(s[key]), 'data-setting': key,
        onclick: (e: MouseEvent) => {
          this.click(); s[key] = !s[key]; apply();
          const button = e.currentTarget as HTMLButtonElement;
          button.setAttribute('aria-checked', String(s[key]));
          button.querySelector('.switch-state')!.textContent = switchState(s[key]);
          feedback(button);
        },
      },
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
            s[key] = value / 100; readout.textContent = `${value}%`;
            input.style.setProperty('--volume', `${value}%`); input.setAttribute('aria-valuetext', `${value}%`); apply();
            feedback(readout);
          },
        }));
    };
    const section = (title: string, ...controls: HTMLElement[]) =>
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
            // Rebuild this screen in the new language; the pause menu or Home underneath re-renders on return.
            this.settings();
          },
        },
        h('span', { class: 'aim-check', 'aria-hidden': 'true' }, '✓'),
        h('span', { class: 'setting-name', lang: lang.id, dir: lang.dir }, lang.name),
        translated !== lang.name ? h('small', { class: 'setting-desc' }, translated) : null);
      }));
    this.show(h('div', { class: 'screen solid settings-screen' },
      this.topbar(t('settings.title')),
      h('div', { class: 'scroll settings-content' },
        section(t('settings.language'), languages),
        section(t('settings.audio'), h('div', { class: 'settings-audio' }, slider(t('settings.sfx'), 'sfx'), slider(t('settings.music'), 'music'))),
        section(t('settings.combat'),
          toggle(t('settings.shake'), t('settings.shakeDesc'), 'shake'),
          toggle(t('settings.damageNumbers'), t('settings.damageNumbersDesc'), 'damageNumbers')),
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
          h('span', { class: 'aim-icon', 'aria-hidden': 'true' }, m === 'direct' ? '↗' : '↶'),
          h('span', { class: 'aim-check', 'aria-hidden': 'true' }, '✓'),
          h('span', { class: 'setting-name' }, m === 'direct' ? t('settings.aimDirect') : t('settings.aimSlingshot')),
          h('small', { class: 'setting-desc' }, m === 'direct' ? t('settings.aimDirectDesc') : t('settings.aimSlingshotDesc')))))),
        section(t('settings.system'), toggle(t('settings.debug'), t('settings.debugDesc'), 'debug')),
        h('div', { class: 'settings-footer' },
          h('button', {
            class: 'danger',
            onclick: () => {
              this.confirmAction(t('settings.resetTitle'), t('settings.resetMessage'), t('settings.erase'), () => {
                const settings = { ...s };
                Object.assign(this.p, defaultProfile(), { settings });
                this.deckStates.clear();
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
      guard: { when: () => this.game.world === w, act: () => this.game.pause() },
    };
    // Keep two guarded entries even for First Contact/Daily, which skip Setup.
    // Two queued browser Back presses must stay in this document until popstate runs.
    this.navigation.view('run-boundary', () => this.game.resume(), options);
    this.navigation.view('run', () => this.game.resume(), options);
    this.hud();
  }

  hud(): void {
    this.closeOverlay();
    this.clearScreen();
    cancelWithin(this.hudEl); this.hudEl?.remove();
    const pause = h('button', { class: 'hudbtn', 'aria-label': t('hud.pause'), style: 'right:10px;top:10px', onclick: () => { this.click(); this.game.pause(); } }, '❚❚');
    const surge = h('button', { class: 'surge', 'aria-label': t('hud.surge'), title: t('hud.surgeTitle'), style: 'right:12px;bottom:12px', onclick: () => this.game.world?.activateSurge() }, h('span', {}, t('hud.surgeLabel'))) as HTMLButtonElement;
    const recall = h('button', { class: 'recall', 'aria-label': t('hud.recall'), title: t('hud.recallTitle'), onclick: () => this.game.world?.activateRecall() },
      h('span', { class: 'recall-icon', 'aria-hidden': 'true' }, '↶'), h('span', { class: 'recall-label' }, t('hud.recallLabel')), h('small', {}, t('hud.ready'))) as HTMLButtonElement;
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
  }

  updateHud(w: World): void {
    if (!this.surgeBtn) return;
    const frac = w.surge.charge / w.surge.max;
    this.surgeBtn.style.setProperty('--p', `${Math.round(frac * 100)}%`);
    const ready = w.canSurge();
    const wasReady = this.surgeBtn.classList.contains('ready');
    this.surgeBtn.disabled = !ready || !this.game.controlsEnabled;
    this.surgeBtn.classList.toggle('ready', ready);
    if (ready !== wasReady && ready) feedback(this.surgeBtn);
    const label = this.surgeBtn.firstElementChild as HTMLElement;
    const text = w.surge.active > 0 ? t('hud.surgeActive') : ready ? t('hud.surgeReady') : `${Math.floor(frac * 100)}%`;
    if (label.textContent !== text) label.textContent = text;
    if (this.recallBtn) {
      this.recallBtn.disabled = !w.canRecall() || !this.game.controlsEnabled;
      this.recallBtn.style.setProperty('--recall-p', `${(1 - w.recallCooldown / RECALL_COOLDOWN) * 100}%`);
      const small = this.recallBtn.querySelector('small')!;
      const status = w.recallCooldown > 0 ? t('hud.seconds', { n: Math.ceil(w.recallCooldown) }) : w.canRecall() ? t('hud.ready') : t('hud.noBalls');
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
      for (const [key, value] of Object.entries(labels)) {
        const el = this.compactTelemetry.querySelector(`.compact-${key}`)!;
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
    if (this.hintEl?.textContent === text) return;
    retire(this.hintEl, 'notice', 0);
    cancelWithin(this.hintEl);
    this.hintEl?.remove();
    this.hintEl = h('div', { class: 'hint', style: 'bottom:13%' }, text);
    this.root.append(this.hintEl);
    enter(this.hintEl, 'notice', 0);
  }

  private closeOverlay(): void {
    retire(this.overlay, 'panel', 0);
    cancelWithin(this.overlay);
    this.overlayDeck?.dispose(); this.overlayDeck = null;
    this.overlay?.remove();
    this.overlay = null;
  }

  private confirmAction(title: string, message: string, label: string, proceed: () => void, cancel: () => void, cancelLabel = t('pause.keepPlaying')): void {
    const world = this.game.world;
    this.navigation.view(`confirm:${title}`, () => this.confirmAction(title, message, label, proceed, cancel, cancelLabel), {
      cancel, valid: () => !world || this.game.world === world,
    });
    const back = h('button', { onclick: () => this.navigation.dismiss() }, cancelLabel);
    const confirm = h('button', { class: 'danger', onclick: () => { this.closeOverlay(); proceed(); } }, label);
    const overlay = h('div', { class: 'levelup confirm-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'lvtitle' }, title), h('p', { class: 'center' }, message),
      h('div', { class: 'row' }, back, confirm));
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === back ? confirm : back).focus(); }
    });
    this.showOverlay(overlay, `confirm:${title}`); back.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ level up
  levelUp(w: World): void {
    const codex = w.flags.has('codex');
    const card = (o: Offer) => {
      if (o.kind === 'evolution') {
        const e = EVOLUTION_MAP[o.id];
        return h('button', { class: 'offer evolution', disabled: this.banishMode, onclick: () => this.pick(w, o) },
          h('div', { class: 'oicon' }, e.icon),
          h('div', {}, h('div', { class: 'oname', style: `color:${e.color}` }, t('levelup.evolve', { name: e.name })), h('div', { class: 'odesc' }, e.desc)));
      }
      if (o.kind !== 'upgrade') {
        return h('button', { class: 'offer', disabled: this.banishMode, onclick: () => this.pick(w, o) },
          h('div', { class: 'oicon' }, o.kind === 'heal' ? '💚' : '🪙'),
          h('div', {}, h('div', { class: 'oname' }, o.kind === 'heal' ? t('levelup.repair') : t('levelup.salvage')), h('div', { class: 'odesc' }, o.kind === 'heal' ? t('levelup.repairDesc') : t('levelup.salvageDesc'))));
      }
      const u = UPGRADE_MAP[o.id];
      const syn = previewSynergies(w.build, o.id);
      const feeds = feedsEvolutions(o.id);
      const hints: HTMLElement[] = [];
      for (const s of syn) {
        const sd = SYNERGY_MAP[s];
        const known = w.seen.synergies.has(s) || sd.tier === 'known';
        hints.push(h('div', { class: 'ohint', style: 'color:#d59bff' }, known ? t('levelup.activates', { icon: sd.icon, name: sd.name }) : t('levelup.hidden')));
      }
      if (codex) for (const f of feeds) {
        const e = EVOLUTION_MAP[f];
        const r = e.recipe.find((x) => x.id === o.id)!;
        hints.push(h('div', { class: 'ohint', style: 'color:var(--legendary)' }, `${t('levelup.ingredient', { name: e.name })}${r.level > 1 ? t('levelup.needsLevel', { n: r.level }) : ''}`));
      }
      return h('button', {
        class: `offer ${u.rarity} ${this.banishMode ? 'banish-mode' : ''}`,
        onclick: () => {
          if (this.banishMode) {
            this.banishMode = false;
            this.game.audio.play('shieldbreak');
            w.banish(o.id);
          } else this.pick(w, o);
        },
      },
      h('div', { class: 'oicon' }, u.icon),
      h('div', { style: 'flex:1' },
        h('div', {}, h('span', { class: 'oname' }, u.name), h('span', { class: 'olv', style: o.level === 1 ? 'background:var(--green);color:#0a0612' : '' }, o.level === 1 ? t('levelup.new') : t('levelup.level', { level: o.level, max: u.maxLevel }))),
        h('div', { class: 'odesc' }, u.desc(o.level)),
        h('div', { class: 'otags' }, t('levelup.tags', { rarity: rarityLabel(u.rarity), tags: u.tags.map(tagLabel).join(' · ') })),
        hints));
    };
    const tutorial = w.cfg.tutorial && w.levelUps === 0;
    const overlay = h('div', { class: 'levelup' },
      h('div', { class: 'lvtitle' }, t('levelup.title', { n: w.level - w.pendingLevels + 1 })),
      tutorial ? h('div', { class: 'center small', style: 'color:var(--gold)' }, t('levelup.tutorial')) : null,
      h('div', { class: 'col offer-list' }, w.offers.map(card)),
      h('div', { class: 'row offer-actions', style: 'justify-content:center;margin-top:6px' },
        h('button', { disabled: w.rerolls <= 0, onclick: () => { this.click(); w.reroll(); } }, t('levelup.reroll', { n: w.rerolls })),
        w.banishes > 0 || w.flags.has('banish') ? h('button', {
          class: this.banishMode ? 'danger' : '', disabled: w.banishes <= 0,
          onclick: () => { this.click(); this.banishMode = !this.banishMode; this.levelUp(w); },
        }, this.banishMode ? t('levelup.tapCard') : t('levelup.banish', { n: w.banishes })) : null,
        h('button', { class: 'ghost', 'aria-label': t('levelup.skipLabel'), title: t('levelup.skipLabel'), onclick: () => this.pick(w, { kind: 'coins' }) }, t('levelup.skip')),
      ),
    );
    this.showOverlay(overlay, 'upgrade');
  }

  private pick(w: World, o: Offer): void {
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
    const st = w.build.stats;
    const keys: StatKey[] = ['damage', 'critChance', 'critMult', 'speed', 'maxBalls', 'pierce', 'burnChance', 'chillChance', 'chainChance', 'explosionChance', 'splitChance', 'bleedChance', 'lifesteal', 'maxHp', 'armor'];
    const overlay = h('div', { class: 'levelup pause-overlay', style: 'justify-content:flex-start' },
      h('div', { class: 'lvtitle' }, t('pause.title')),
      h('div', { class: 'scroll col' },
        h('h3', {}, t('pause.manual')),
        h('div', { class: 'combat-guide' }, h('b', {}, t('pause.powerShot')), h('p', {}, t('pause.powerShotDesc'))),
        h('div', { class: 'combat-guide' }, h('b', {}, t('pause.resonance')), h('p', {}, t('pause.resonanceDesc'))),
        h('div', { class: 'combat-guide' }, h('b', {}, t('pause.recallSurge')), h('p', {}, t('pause.recallSurgeDesc'))),
        h('h3', {}, t('pause.build')),
        h('div', { class: 'buildcard' },
          h('div', { class: 'small muted' }, t('pause.currentBuild')),
          h('div', { class: 'buildname' }, this.game.buildName()),
          h('div', { class: 'statgrid' }, keys.filter((k) => st[k] > 0 && STAT_FORMATS[k]).map((k) => h('div', {}, h('span', { class: 'muted' }, statLabel(k)), h('b', {}, STAT_FORMATS[k]!(st[k])))))),
        h('h3', {}, t('pause.talents')),
        h('div', { class: 'row wrap' }, talentSpent(w.talents) ? TALENTS.filter(tl => w.talents[tl.id]).map(tl =>
          h('span', { class: 'chip', title: tl.desc(w.talents[tl.id]) }, t('pause.talentChip', { icon: tl.icon, name: tl.name, rank: w.talents[tl.id], max: tl.maxRank }))) : h('span', { class: 'small muted' }, t('pause.noTalents'))),
        h('h3', {}, t('pause.upgrades')),
        h('div', { class: 'row wrap' }, [...w.build.upgrades.entries()].map(([id, lv]) => h('span', { class: 'chip' }, `${UPGRADE_MAP[id].icon} ${UPGRADE_MAP[id].name} ${lv}`))),
        w.build.synergies.size ? [h('h3', {}, t('pause.synergies')), h('div', { class: 'col' }, [...w.build.synergies].map((id) => h('div', { class: 'card' }, h('div', { class: 'name' }, `${SYNERGY_MAP[id].icon} ${SYNERGY_MAP[id].name}`), h('div', { class: 'desc' }, SYNERGY_MAP[id].desc))))] : null,
        w.build.evolutions.size ? [h('h3', {}, t('pause.evolutions')), h('div', { class: 'col' }, [...w.build.evolutions].map((id) => h('div', { class: 'card' }, h('div', { class: 'name', style: `color:${EVOLUTION_MAP[id].color}` }, `${EVOLUTION_MAP[id].icon} ${EVOLUTION_MAP[id].name}`), h('div', { class: 'desc' }, EVOLUTION_MAP[id].desc))))] : null,
      ),
      h('div', { class: 'col overlay-actions' },
        h('button', { class: 'primary big', onclick: () => { this.click(); this.navigation.dismiss(); } }, t('pause.resume')),
        h('div', { class: 'row' },
          h('button', { style: 'flex:1', onclick: () => { this.click(); this.settings(); } }, t('pause.settings')),
          h('button', { class: 'danger', style: 'flex:1', onclick: () => this.confirmAction(t('pause.endTitle'), t('pause.endMessage'), t('pause.endRun'), () => this.game.abandonRun(), () => this.pauseMenu(w)) }, t('pause.abandon')),
        ),
      ),
    );
    this.showOverlay(overlay, 'pause');
  }

  // ------------------------------------------------------------------ victory choice
  victoryChoice(w: World): void {
    const overlay = h('div', { class: 'levelup' },
      h('div', { class: 'result-title win' }, t('victory.title')),
      h('div', { class: 'center muted' }, t('victory.cleared', { arena: ARENA_MAP[w.arena.id].name, difficulty: w.diff.name, time: formatTime(w.time) })),
      h('button', { class: 'primary big', onclick: () => { this.click(); this.closeOverlay(); this.game.finishRun(); } }, t('victory.claim')),
      h('button', { class: 'big', onclick: () => { this.click(); this.closeOverlay(); this.game.continueEndless(); } }, t('victory.endless')),
      h('div', { class: 'center small muted' }, t('victory.endlessDesc')),
    );
    this.showOverlay(overlay, 'victory');
  }

  // ------------------------------------------------------------------ post run
  postRun(s: RunSummary, r: RunReport, abandoned = false): void {
    this.navigation.reset(() => this.home(), { key: 'results', restore: () => this.postRun(s, r, abandoned) });
    this.hideHud();
    this.closeOverlay();
    const bs = s.buildStats;
    const stat = (k: string, v: string | number) => h('div', {}, h('span', { class: 'muted' }, k), h('b', {}, String(v)));
    const core = CORE_MAP[s.core];
    const unlockLines = [
      ...r.unlocks.map((u) => t('results.unlock', { text: u })),
      ...r.achievements.map((a) => t('results.achievement', { name: a })),
      ...r.challenges.map((c) => t('results.challenge', { name: c })),
      ...(r.arenaUnlocked ? [t('results.newArena', { name: r.arenaUnlocked })] : []),
      ...(r.difficultyUnlocked ? [t('results.newDifficulty', { name: r.difficultyUnlocked })] : []),
    ];
    this.show(h('div', { class: 'screen solid' },
      h('div', { class: `result-title ${s.victory ? 'win' : 'lose'}` }, s.victory ? t('results.complete') : abandoned ? t('results.ended') : t('results.defeated')),
      h('div', { class: 'center small muted' }, `${t('results.summary', { arena: ARENA_MAP[s.arena].name, difficulty: DIFFICULTIES[s.difficulty].name, time: formatTime(s.time) })}${s.daily ? t('results.daily') : ''}`),
      h('div', { class: 'scroll', style: 'margin-top:10px' },
        h('div', { class: 'buildcard' },
          h('div', { class: 'small muted' }, t('results.yourBuild')),
          h('div', { class: 'buildname' }, `${core.icon} ${s.buildName.toUpperCase()}`),
          h('div', { class: 'statgrid' },
            stat(t('results.damage'), bs.damage.toFixed(0)), stat(t('results.crit'), `${Math.round(bs.critChance * 100)}%`),
            stat(t('results.speed'), Math.round(bs.speed)), stat(t('results.balls'), bs.balls),
            bs.chain ? stat(t('results.chain'), bs.chain) : null, bs.lifesteal ? stat(t('results.lifesteal'), `${(bs.lifesteal * 100).toFixed(1)}%`) : null),
        ),
        h('div', { class: 'card', style: 'margin-top:8px' }, h('div', { class: 'statgrid' },
          stat(t('results.kills'), formatNum(s.kills)), stat(t('results.bestCombo'), s.bestCombo),
          stat(t('results.bounceChain'), s.maxBounceChain), stat(t('results.damageDealt'), formatNum(s.damageDealt)),
          stat(t('results.bosses'), s.bossesDefeated.length), stat(t('results.level'), s.level),
          stat(t('results.powerShots'), s.powerShots ?? 0), stat(t('results.starfalls'), s.starfalls ?? 0), stat(t('results.recalls'), s.recalls ?? 0),
        )),
        h('h3', {}, t('results.rewards')),
        h('div', { class: 'row wrap', style: 'gap:14px' },
          h('div', { class: 'reward', style: 'color:var(--gold)' }, `+${formatNum(r.rewards.coins)} 🪙`),
          r.rewards.cores ? h('div', { class: 'reward', style: 'color:var(--pink)' }, `+${r.rewards.cores} 💠`) : null,
          r.rewards.research ? h('div', { class: 'reward', style: 'color:#6de2ff' }, `+${r.rewards.research} 🔬`) : null,
        ),
        h('div', { class: 'card', style: 'margin-top:8px' },
          h('div', { class: 'name' }, `${t('results.mastery', { icon: core.icon, name: core.name, level: r.mastery.after })}${r.mastery.after > r.mastery.before ? ' ⬆' : ''}`),
          bar(r.mastery.need ? r.mastery.into / r.mastery.need : 1, 'pink'),
          r.mastery.rewards.map((text) => h('div', { class: 'unlock' }, `⭐ ${text}`))),
        s.synergies.length ? [h('h3', {}, t('results.synergies')), h('div', { class: 'col' }, s.synergies.map(id =>
          h('div', { class: 'card' }, h('div', { class: 'name' }, `${SYNERGY_MAP[id].icon} ${SYNERGY_MAP[id].name}`), h('div', { class: 'desc' }, SYNERGY_MAP[id].desc))))] : null,
        s.evolutions.length ? [h('h3', {}, t('results.evolutions')), h('div', { class: 'col' }, s.evolutions.map(id =>
          h('div', { class: 'card' }, h('div', { class: 'name', style: `color:${EVOLUTION_MAP[id].color}` }, `${EVOLUTION_MAP[id].icon} ${EVOLUTION_MAP[id].name}`), h('div', { class: 'desc' }, EVOLUTION_MAP[id].desc))))] : null,
        r.discoveries.some((d) => d.cat !== 'upgrades') ? [h('h3', {}, t('results.discoveries')), h('div', { class: 'col' }, r.discoveries.filter((d) => d.cat !== 'upgrades').slice(0, 10).map((d) => h('div', { class: 'unlock', style: 'color:#d59bff' }, t('results.discovery', { cat: discoveryLabel(d.cat), name: d.name }))))] : null,
        unlockLines.length ? [h('h3', {}, t('results.unlocked')), h('div', { class: 'col' }, unlockLines.map(u => h('div', { class: 'unlock' }, u)))] : null,
        h('h3', {}, t('results.nextGoals')),
        this.goalList(r.goals),
      ),
      h('div', { class: 'row', style: 'margin-top:8px' },
        h('button', { style: 'flex:1', onclick: () => { this.click(); this.home(); } }, t('results.home')),
        h('button', { class: 'primary', style: 'flex:2', onclick: () => { this.click(); this.runSetup(); } }, t('results.oneMore')),
      ),
    ));
  }
}
