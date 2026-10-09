import { formatNum, formatTime } from '../core/math';
import { dailySeed } from '../core/rng';
import { ARENAS, ARENA_MAP, DIFFICULTIES, EVENT_MAP, PACTS } from '../data/arenas';
import { CORES, CORE_MAP, PART_MAP, TRAILS } from '../data/balls';
import { BOSSES, BOSS_MAP, CODEX_ENEMIES } from '../data/enemies';
import { ACHIEVEMENTS, CHALLENGES, RESEARCH, WORKSHOP, masteryLevel, masteryRewards } from '../data/meta';
import { EVOLUTIONS, EVOLUTION_MAP, REACTIONS, SYNERGIES, SYNERGY_MAP } from '../data/synergies';
import { UPGRADES, UPGRADE_MAP } from '../data/upgrades';
import type { PartSlot } from '../data/types';
import {
  buyPart, buyWorkshop, canResearch, canUnlockCore, coreRequirementMet, doResearch, isArenaUnlocked, maxDifficulty,
  nextGoals, partsForSlot, rewardMultiplier, unlockCore, workshopCost, type Goal, type RunReport,
} from '../meta/progress';
import { defaultProfile } from '../meta/profile';
import type { RunSummary } from '../meta/types';
import { feedsEvolutions, previewSynergies, type Offer } from '../sim/offers';
import { STAT_LABELS, type StatKey } from '../sim/stats';
import type { World } from '../sim/world';
import type { Game } from '../game';
import { bar, h } from './dom';
import { talentScreen } from './talents';
import { TALENTS, talentSpent } from '../data/talents';
import { talentProgress } from '../meta/talents';
import { createDeck, deckSections, type Deck, type DeckState } from './deck';
import { Navigation } from './navigation';
import { cancelWithin, enter, feedback, retire, revealItems, revealView, tabFeedback, type MotionDirection } from './motion';
import { homeIcon } from './home-icons';

const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

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
    const title = el.querySelector('h2, .lvtitle, .result-title')?.textContent ?? 'Menu';
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
    const t = h('div', { class: 'toast' }, text);
    this.root.append(t);
    enter(t, 'notice', 0);
    setTimeout(() => { retire(t, 'notice', 0); cancelWithin(t); t.remove(); }, 1800);
  }

  private currency(): HTMLElement {
    const p = this.p;
    return h('div', { class: 'chips wallet', 'aria-label': 'Currencies' },
      h('span', { class: 'chip coins', title: `${p.coins.toLocaleString()} Coins` }, `🪙 ${formatNum(p.coins)}`),
      h('span', { class: 'chip cores', title: `${p.cores.toLocaleString()} Cores` }, `💠 ${formatNum(p.cores)}`),
      h('span', { class: 'chip research', title: `${p.research.toLocaleString()} Research` }, `🔬 ${formatNum(p.research)}`),
    );
  }

  back(): boolean {
    return this.navigation.back();
  }

  private topbar(title: string): HTMLElement {
    return h('div', { class: 'topbar menu-topbar' },
      h('button', { class: 'ghost', 'aria-label': 'Back', onclick: () => { this.click(); this.back(); } }, '←'),
      h('h2', {}, title),
      this.currency(),
    );
  }

  private goalList(goals: Goal[]): HTMLElement {
    return h('div', { class: 'col' }, goals.map((g) => h('div', { class: 'card goal' },
      h('div', { style: 'flex:1' },
        h('div', { class: 'gtext' }, g.text),
        h('div', { class: 'greward' }, `→ ${g.reward}`),
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
        badge ? h('span', { class: 'home-nav-badge', title: 'Upgrade available', 'aria-label': 'Upgrade available' }) : null,
      );
    const canAffordResearch = RESEARCH.some((r) => canResearch(p, r.id));
    const canAffordCore = CORES.some((c) => canUnlockCore(p, c.id));
    const mastery = masteryLevel(p.mastery[p.loadout.core] ?? 0);
    this.show(h('div', { class: `screen home ${p.tutorialDone ? '' : 'home-first-run'}`, style: `--core-color:${coreDef.color}` },
      h('div', { class: 'home-topline' },
        h('span', { class: 'eyebrow home-system' }, h('i', { 'aria-hidden': 'true' }), 'BD / RESONANCE ONLINE'), this.currency()),
      h('div', { class: 'scroll home-content' },
        h('div', { class: 'hero' },
          h('div', { class: 'eyebrow hero-kicker' }, 'PINBALL MEETS COSMIC CHAOS'),
          h('h1', { class: 'title' }, 'BOUNCE', h('br'), h('span', {}, 'DEFENSE')),
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
            h('span', { class: 'reactor-coordinate coordinate-left' }, (coreDef.element ?? 'kinetic').toUpperCase(), h('br'),
              `CORE / ${String(CORES.indexOf(coreDef) + 1).padStart(2, '0')}`),
            h('span', { class: 'reactor-coordinate coordinate-right' }, 'RESONANCE', h('br'), 'STABLE'),
          ),
          h('div', { class: 'subtitle' }, 'Find your orbit. Bring down the stars.'),
          h('div', { class: 'hero-description' }, 'Time your shot. Link the signals. Unleash a starfall.'),
        ),
        h('div', { class: 'col home-actions' },
          h('button', { class: 'primary big launch-button', onclick: () => { this.click(); p.tutorialDone ? this.runSetup() : this.game.startRun({ arena: 'proving', difficulty: 0, pacts: [] }); } },
            h('span', { class: 'launch-copy' }, h('strong', {}, p.tutorialDone ? 'PLAY' : 'START'),
              h('small', {}, p.tutorialDone ? 'DEPLOY YOUR CORE' : 'FIRST CONTACT')),
            h('span', { class: 'launch-arrow', 'aria-hidden': 'true' }, '↗')),
          h('div', { class: 'core-readout' }, h('span', { class: 'status-dot', style: `background:${coreDef.color}` }),
            `${coreDef.name} equipped`, h('span', { class: 'spacer' }), h('span', { class: 'core-mastery' }, 'MASTERY ', h('b', {}, mastery.level))),
          p.tutorialDone ? h('div', { class: 'grid2 home-nav' },
            nav('daily', 'Daily Seed', 'A new orbit every day', '#9ac9ff', () => this.dailyRun()),
            nav('talents', `Talents · ${talentProgress(p).total - talentSpent(p.talents)}`, 'Find your edge', '#c8a5ff', () => this.talents(), talentProgress(p).total > talentSpent(p.talents)),
            nav('loadout', 'Loadout', 'Shape your playstyle', '#91ead4', () => this.loadout(), canAffordCore),
            nav('workshop', 'Workshop', 'Build lasting power', '#ffbe86', () => this.workshop()),
            nav('research', 'Research', 'Unlock possibilities', '#90dbe9', () => this.research(), canAffordResearch),
            nav('codex', 'Codex', 'Explore the unknown', '#aaaef9', () => this.codex()),
            nav('goals', 'Goals', 'Chase the next milestone', '#f4d784', () => this.goals()),
            nav('settings', 'Settings', 'Tune your experience', '#a3b8cc', () => this.settings()),
          ) : [nav('talents', 'Talents', 'Discover your playstyle', '#c8a5ff', () => this.talents()), h('div', { class: 'first-run-guide' },
            h('div', {}, h('b', {}, '01'), h('span', {}, 'DRAG TO AIM')),
            h('div', {}, h('b', {}, '02'), h('span', {}, 'RELEASE TO FIRE')),
            h('div', {}, h('b', {}, '03'), h('span', {}, 'LINK THE SIGNALS')),
          )],
          h('div', { class: 'home-stats', 'aria-label': 'Lifetime stats' },
            h('div', {}, h('strong', {}, formatNum(p.stats.runs)), h('span', {}, 'RUNS')),
            h('div', {}, h('strong', {}, formatNum(p.stats.wins)), h('span', {}, 'WINS')),
            h('div', {}, h('strong', {}, formatNum(p.stats.bestCombo)), h('span', {}, 'BEST COMBO')),
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
          else this.confirmAction('Discard talent changes?', 'Your saved talents are kept. Apply your changes to use them in your next run.', 'Discard changes', () => {
            view.discard();
            this.navigation.dismiss(2);
          }, () => view.element.querySelector<HTMLButtonElement>('.topbar button')?.focus({ preventScroll: true }), 'Keep editing');
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
      this.topbar('New Run'),
      h('div', { class: 'scroll' },
        h('div', { class: 'card setup-overview' }, h('div', { class: 'name' }, `✦ Talents · ${talentSpent(p.talents)}/${talentProgress(p).total} allocated`),
          h('div', { class: 'desc' }, 'Your saved specialization will apply to this run.'),
          h('button', { style: 'margin-top:8px', onclick: () => this.talents() }, 'Edit talents')),
        h('h3', {}, 'Arena'),
        h('div', { class: 'col' }, ARENAS.map((a) => {
          const ok = isArenaUnlocked(p, a.id);
          const cleared = p.cleared[a.id] ?? -1;
          return h('div', {
            class: `card ${s.arena === a.id ? 'selected' : ''} ${ok ? '' : 'locked'}`,
            'data-motion-key': `arena:${a.id}`,
            style: `border-left: 4px solid ${a.theme.accent}`,
            onclick: () => { if (ok) { s.arena = a.id; rerender(); } },
          },
          h('div', { class: 'row' }, h('div', { class: 'name', style: 'flex:1' }, ok ? a.name : `🔒 ${a.name}`),
            cleared >= 0 ? h('span', { class: 'chip', style: `color:${DIFFICULTIES[cleared].color}` }, `✓ ${DIFFICULTIES[cleared].name}`) : null),
          h('div', { class: 'desc' }, ok ? `${a.desc} Boss: ${BOSSES.find((b) => b.id === a.bossId)?.name}` : a.unlockReq?.text ?? ''));
        })),
        h('h3', {}, 'Difficulty'),
        h('div', { class: 'difficulty-options' }, DIFFICULTIES.map((d, i) => {
          const ok = i <= maxDifficulty(p);
          return h('button', {
            disabled: !ok,
            'data-motion-key': `difficulty:${i}`,
            style: s.difficulty === i ? `background:${d.color};color:#0a0612` : `color:${d.color}`,
            onclick: () => { s.difficulty = i; rerender(); },
          }, ok ? d.name : `🔒 ${d.name}`);
        })),
        h('div', { class: 'small muted', style: 'margin-top:6px' }, `${DIFFICULTIES[s.difficulty].desc} ${DIFFICULTIES[s.difficulty].rules.join(' · ')}`),
        pactsOn ? [
          h('h3', {}, 'Risk Pacts'),
          h('div', { class: 'grid2' }, PACTS.map((pc) => h('div', {
            class: `card ${s.pacts.has(pc.id) ? 'selected' : ''}`,
            'data-motion-key': `pact:${pc.id}`,
            onclick: () => { if (s.pacts.has(pc.id)) s.pacts.delete(pc.id); else s.pacts.add(pc.id); rerender(); },
          }, h('div', { class: 'name' }, `${pc.icon} ${pc.name}`), h('div', { class: 'desc' }, pc.desc), h('div', { class: 'small', style: 'color:var(--gold);margin-top:4px' }, `+${Math.round(pc.reward * 100)}% rewards`)))),
        ] : h('div', { class: 'small muted', style: 'margin-top:14px' }, '🔒 Research "Risk Pacts" to make runs harder for greater rewards.'),
      ),
      h('div', { class: 'col setup-footer', style: 'margin-top:8px' },
        h('div', { class: 'center small', style: 'color:var(--gold)' }, `Reward multiplier ×${mult.toFixed(2)}`),
        h('button', { class: 'primary big', onclick: () => { this.click(); this.game.startRun({ arena: s.arena, difficulty: s.difficulty, pacts: [...s.pacts] }); } }, '▶ LAUNCH'),
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
            else if (buyable && buyPart(p, def.id)) { (l as unknown as Record<string, string>)[s] = def.id; this.toast(`Unlocked ${def.name}!`); rerender(); }
          },
        },
        h('div', { class: 'name' }, `${def.icon} ${def.name}`),
        h('div', { class: 'desc' }, def.desc),
        !unlocked ? h('div', { class: 'small', style: `margin-top:4px;color:${buyable && p.coins >= (def.unlock!.coins ?? 0) ? 'var(--gold)' : 'var(--muted)'}` }, `🔒 ${def.unlock!.text}`) : null);
      })),
    ];
    this.show(h('div', { class: 'screen' },
      this.topbar('Loadout'),
      h('div', { class: 'scroll' },
        h('h3', {}, 'Core'),
        h('div', { class: 'col' }, CORES.map((c) => {
          const owned = p.unlockedCores.includes(c.id);
          const m = masteryLevel(p.mastery[c.id] ?? 0);
          const reqOk = coreRequirementMet(p, c.id);
          return h('div', {
            class: `card ${l.core === c.id ? 'selected' : ''} ${owned ? '' : 'locked'}`,
            'data-motion-key': `core:${c.id}`,
            style: `border-left:4px solid ${c.color}`,
            onclick: () => { if (owned) { l.core = c.id; rerender(); } },
          },
          h('div', { class: 'row' }, h('div', { class: 'icon' }, c.icon), h('div', { style: 'flex:1' },
            h('div', { class: 'name' }, c.name),
            h('div', { class: 'desc' }, c.desc))),
          h('div', { class: 'desc', style: 'color:#d8d5f5' }, c.passive),
          owned ? [h('div', { class: 'small muted', style: 'margin-top:6px' }, `Mastery ${m.level}${m.need ? ` · ${Math.floor(m.into)}/${m.need}` : ' · MAX'}`), bar(m.need ? m.into / m.need : 1, 'pink')]
            : h('div', { class: 'row', style: 'margin-top:8px' },
              h('div', { class: 'small muted', style: 'flex:1' }, reqOk ? `Costs ${c.unlockCost} 💠 Cores` : `🔒 ${c.unlockReq?.text}`),
              h('button', {
                class: 'gold', disabled: !canUnlockCore(p, c.id),
                onclick: (e: MouseEvent) => { e.stopPropagation(); if (unlockCore(p, c.id)) { l.core = c.id; this.game.audio.play('synergy'); this.toast(`${c.icon} ${c.name} unlocked!`); rerender(); } },
              }, `Unlock ${c.unlockCost} 💠`)));
        })),
        slot('Shell', 'shell'),
        slot('Impact', 'impact'),
        slot('Momentum', 'momentum'),
        h('h3', {}, 'Trail'),
        h('div', { class: 'row wrap trail-options' }, TRAILS.map((t) => {
          const owned = p.cosmetics.includes(t.id);
          return h('button', {
            disabled: !owned,
            'data-motion-key': `trail:${t.id}`,
            style: `background:linear-gradient(90deg,${t.colors[0]},${t.colors[1]});color:#0a0612;${l.trail === t.id ? 'outline:3px solid #fff' : ''}`,
            onclick: () => { l.trail = t.id; rerender(); },
          }, owned ? t.name : '🔒');
        })),
        h('h3', {}, 'Build Presets'),
        h('div', { class: 'grid3 presets' }, [0, 1, 2].map((i) => {
          const pr = p.presets[i];
          return h('div', { class: 'card center', 'data-motion-key': `preset:${i}` },
            h('div', { class: 'small' }, pr ? `${CORE_MAP[pr.core]?.icon} ${pr.name}` : `Slot ${i + 1}`),
            h('div', { class: 'row preset-actions', style: 'justify-content:center;margin-top:6px' },
              h('button', { class: 'small', onclick: () => { p.presets[i] = { ...l, name: `${CORE_MAP[l.core].name.split(' ')[0]} ${PART_MAP[l.impact]?.name.split(' ')[0] ?? ''}` }; this.toast('Preset saved'); rerender(); } }, 'Save'),
              pr ? h('button', { class: 'small', onclick: () => { Object.assign(l, { core: pr.core, shell: pr.shell, impact: pr.impact, momentum: pr.momentum, trail: pr.trail }); rerender(); } }, 'Load') : null,
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
      this.topbar('Workshop'),
      h('div', { class: 'small muted', style: 'margin-bottom:8px' }, 'Small, capped permanent boosts. New mechanics come from Research, Mastery and Goals.'),
      h('div', { class: 'scroll col' }, WORKSHOP.map((wd) => {
        const lvl = p.workshop[wd.id] ?? 0;
        const cost = workshopCost(p, wd.id);
        return h('div', { class: 'card row', 'data-motion-key': `workshop:${wd.id}` },
          h('div', { class: 'icon' }, wd.icon),
          h('div', { style: 'flex:1' },
            h('div', { class: 'name' }, `${wd.name} `, h('span', { class: 'small muted' }, `${lvl}/${wd.maxLevel}`)),
            h('div', { class: 'desc' }, lvl > 0 ? `Now: ${wd.desc(lvl)}` : wd.desc(1)),
            cost !== null && lvl > 0 ? h('div', { class: 'desc' }, `Next: ${wd.desc(lvl + 1)}`) : null),
          cost === null ? h('span', { class: 'chip' }, 'MAX') : h('button', {
            class: 'gold', disabled: p.coins < cost,
            onclick: () => { if (buyWorkshop(p, wd.id)) { this.game.audio.play('select'); this.game.save(); this.workshop(); } },
          }, `🪙 ${formatNum(cost)}`));
      })),
    ));
  }

  // ------------------------------------------------------------------ research
  research(): void {
    this.navigation.view('research', () => this.research());
    const p = this.p;
    this.show(h('div', { class: 'screen' },
      this.topbar('Research'),
      h('div', { class: 'small muted', style: 'margin-bottom:8px' }, 'Earn 🔬 by discovering synergies, evolutions, reactions and bosses. Research widens your options.'),
      h('div', { class: 'scroll col' }, RESEARCH.map((r) => {
        const done = p.researchNodes.includes(r.id);
        const reqOk = r.requires.every((x) => p.researchNodes.includes(x));
        return h('div', { class: `card row ${done ? 'selected' : ''} ${reqOk ? '' : 'locked'}`, 'data-motion-key': `research:${r.id}` },
          h('div', { class: 'icon' }, r.icon),
          h('div', { style: 'flex:1' },
            h('div', { class: 'name' }, r.name),
            h('div', { class: 'desc' }, r.desc),
            !reqOk ? h('div', { class: 'small muted' }, `Requires: ${r.requires.map((x) => RESEARCH.find((y) => y.id === x)?.name).join(', ')}`) : null),
          done ? h('span', { class: 'chip', style: 'color:var(--green)' }, '✓') : h('button', {
            disabled: !canResearch(p, r.id),
            onclick: () => {
              const got = doResearch(p, r.id);
              this.game.audio.play('synergy');
              this.toast(got[0] ?? `${r.name} researched!`);
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
      ['balls', 'Balls', p.unlockedCores.length, CORES.length],
      ['upgrades', 'Upgrades', d.upgrades.length, UPGRADES.length],
      ['synergies', 'Synergies', d.synergies.length, SYNERGIES.length],
      ['evolutions', 'Evolutions', d.evolutions.length, EVOLUTIONS.length],
      ['reactions', 'Reactions', d.reactions.length, REACTIONS.length],
      ['enemies', 'Enemies', d.enemies.length, CODEX_ENEMIES.length],
      ['bosses', 'Bosses', d.bosses.length, BOSSES.length],
      ['arenas', 'Arenas', d.arenas.length, ARENAS.length],
    ];
    const total = tabs.reduce((a, t) => a + t[2], 0);
    const max = tabs.reduce((a, t) => a + t[3], 0);
    const unknown = (hint: string) => h('div', { class: 'card locked' }, h('div', { class: 'name' }, '❔ ???'), h('div', { class: 'desc' }, hint));
    let body: HTMLElement[] = [];
    switch (this.codexTab) {
      case 'balls':
        body = CORES.map((c) => p.unlockedCores.includes(c.id)
          ? h('div', { class: 'card' }, h('div', { class: 'name' }, `${c.icon} ${c.name}`), h('div', { class: 'desc' }, c.passive))
          : unknown(c.unlockReq?.text ?? `${c.unlockCost} Cores`));
        break;
      case 'upgrades':
        body = UPGRADES.map((u) => d.upgrades.includes(u.id)
          ? h('div', { class: 'card' }, h('div', { class: 'name' }, `${u.icon} ${u.name} `, h('span', { class: 'tag' }, RARITY_LABEL[u.rarity])), h('div', { class: 'desc' }, u.desc(1)), h('div', {}, u.tags.map((t) => h('span', { class: 'tag' }, t))))
          : unknown(u.locked ? 'Unlocked through Research, Goals or Mastery.' : 'Take it during a run to record it.'));
        break;
      case 'synergies':
        body = SYNERGIES.map((s) => d.synergies.includes(s.id)
          ? h('div', { class: 'card' }, h('div', { class: 'name' }, `${s.icon} ${s.name} `, h('span', { class: 'tag' }, s.tier)), h('div', { class: 'desc' }, s.desc), h('div', { class: 'small muted' }, s.hint))
          : unknown(s.tier === 'known' ? `Hint: ${s.hint}` : s.hint));
        break;
      case 'evolutions':
        body = EVOLUTIONS.map((e) => {
          const known = d.evolutions.includes(e.id);
          const showRecipe = known || this.game.flags().includes('codex');
          const recipe = e.recipe.map((r) => `${UPGRADE_MAP[r.id].name}${r.level > 1 ? ` Lv${r.level}` : ''}`).join(' + ');
          return known || showRecipe
            ? h('div', { class: `card ${known ? '' : 'locked'}` }, h('div', { class: 'name' }, `${e.icon} ${known ? e.name : '???'}`), h('div', { class: 'desc' }, known ? e.desc : 'Not yet evolved.'), h('div', { class: 'small', style: 'color:var(--gold);margin-top:4px' }, recipe))
            : unknown('Max out an upgrade and find its catalyst. (Research "Evolution Codex" to reveal recipes.)');
        });
        break;
      case 'reactions':
        body = REACTIONS.map((r) => d.reactions.includes(r.id)
          ? h('div', { class: 'card' }, h('div', { class: 'name' }, `${r.icon} ${r.name}`), h('div', { class: 'desc' }, r.desc))
          : unknown(`Combine ${r.elements[0]} and ${r.elements[1]} on the same enemy…`));
        break;
      case 'enemies':
        body = CODEX_ENEMIES.map((e) => d.enemies.includes(e.id)
          ? h('div', { class: 'card', style: `border-left:4px solid ${e.color}` }, h('div', { class: 'name' }, e.name), h('div', { class: 'desc' }, e.desc), h('div', { class: 'small', style: 'color:var(--green);margin-top:4px' }, `Tip: ${e.tip}`))
          : unknown('Not yet encountered.'));
        break;
      case 'bosses':
        body = BOSSES.map((b) => d.bosses.includes(b.id)
          ? h('div', { class: 'card' }, h('div', { class: 'name' }, `${b.name} — ${b.title}`), h('div', { class: 'desc' }, b.desc), h('div', { class: 'small muted' }, `Defeated ×${p.bossKills[b.id] ?? 0}`))
          : unknown('A great threat awaits.'));
        break;
      case 'arenas':
        body = ARENAS.map((a) => d.arenas.includes(a.id)
          ? h('div', { class: 'card', style: `border-left:4px solid ${a.theme.accent}` }, h('div', { class: 'name' }, a.name), h('div', { class: 'desc' }, a.desc), h('div', { class: 'small muted' }, `Events: ${a.events.map((e) => EVENT_MAP[e].name).join(', ')}`))
          : unknown(a.unlockReq?.text ?? ''));
        break;
    }
    this.show(h('div', { class: 'screen' },
      this.topbar(`Codex ${Math.round((total / max) * 100)}%`),
      h('div', { class: 'tabs codex-tabs', role: 'tablist', 'aria-label': 'Codex categories' }, tabs.map(([id, label, n, m]) => h('button', {
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
      this.topbar('Goals'),
      h('div', { class: 'scroll' },
        h('h3', {}, 'Next goals'), this.goalList(nextGoals(p, 3)),
        h('h3', {}, `Challenges ${p.challenges.length}/${CHALLENGES.length}`),
        h('div', { class: 'col' }, CHALLENGES.map((c) => {
          const done = p.challenges.includes(c.id);
          return h('div', { class: `card ${done ? 'selected' : ''}` },
            h('div', { class: 'name' }, `${c.icon} ${c.name} ${done ? '✓' : ''}`),
            h('div', { class: 'desc' }, c.desc),
            h('div', { class: 'small', style: 'color:var(--gold);margin-top:3px' }, c.rewards.map((r) => (r.type === 'coins' || r.type === 'cores' || r.type === 'research') ? `+${r.amount} ${r.type}` : `${r.type}: ${r.id}`).join(', ')));
        })),
        h('h3', { 'data-tab-label': 'Badges' }, `Achievements ${p.achievements.length}/${ACHIEVEMENTS.length}`),
        h('div', { class: 'col' }, ACHIEVEMENTS.map((a) => {
          const done = p.achievements.includes(a.id);
          const [cur, max] = a.progress(p);
          return h('div', { class: `card ${done ? 'selected' : ''}` },
            h('div', { class: 'row' }, h('div', { class: 'name', style: 'flex:1' }, `${a.icon} ${a.name} ${done ? '✓' : ''}`), h('span', { class: 'small muted' }, `${Math.min(cur, max)}/${max}`)),
            h('div', { class: 'desc' }, a.desc),
            done ? null : bar(cur / max, 'gold'));
        })),
        h('h3', {}, 'Mastery'),
        h('div', { class: 'col' }, CORES.filter((c) => p.unlockedCores.includes(c.id)).map((c) => {
          const m = masteryLevel(p.mastery[c.id] ?? 0);
          const next = masteryRewards(c.id).find((r) => r.level === m.level + 1);
          return h('div', { class: 'card' },
            h('div', { class: 'name' }, `${c.icon} ${c.name} — Lv ${m.level}`),
            next ? h('div', { class: 'desc' }, `Next: ${next.text}`) : h('div', { class: 'desc' }, 'Mastered!'),
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
    const toggle = (label: string, desc: string, key: 'shake' | 'damageNumbers' | 'debug') =>
      h('button', {
        type: 'button', class: 'setting-switch', role: 'switch', 'aria-label': label, 'aria-checked': String(s[key]), 'data-setting': key,
        onclick: (e: MouseEvent) => {
          this.click(); s[key] = !s[key]; apply();
          const button = e.currentTarget as HTMLButtonElement;
          button.setAttribute('aria-checked', String(s[key]));
          button.querySelector('.switch-state')!.textContent = s[key] ? 'ON' : 'OFF';
          feedback(button);
        },
      },
      h('span', { class: 'setting-copy' }, h('span', { class: 'setting-name' }, label), h('small', { class: 'setting-desc' }, desc)),
      h('span', { class: 'switch-rail', 'aria-hidden': 'true' }, h('span', { class: 'switch-state' }, s[key] ? 'ON' : 'OFF'), h('span', { class: 'switch-knob' })));
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
    this.show(h('div', { class: 'screen solid settings-screen' },
      this.topbar('Settings'),
      h('div', { class: 'scroll settings-content' },
        section('Audio', h('div', { class: 'settings-audio' }, slider('Sound effects', 'sfx'), slider('Music', 'music'))),
        section('Combat feedback',
          toggle('Screen shake', 'Camera kick on heavy impacts.', 'shake'),
          toggle('Damage numbers', 'See the damage from every hit.', 'damageNumbers')),
        section('Aim mode', h('div', { class: 'aim-modes', role: 'group', 'aria-label': 'Aim mode' },
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
          h('span', { class: 'setting-name' }, m === 'direct' ? 'Point' : 'Slingshot'),
          h('small', { class: 'setting-desc' }, m === 'direct' ? 'Aim toward your target' : 'Pull back, then release'))))),
        section('System', toggle('Debug tools', 'Show diagnostics during a run.', 'debug')),
        h('div', { class: 'settings-footer' },
          h('button', {
            class: 'danger',
            onclick: () => {
              this.confirmAction('Reset progress?', 'Erase all unlocks, currency, talents and run history? This cannot be undone. Your settings are kept.', 'Erase progress', () => {
                const settings = { ...s };
                Object.assign(this.p, defaultProfile(), { settings });
                this.deckStates.clear();
                this.game.save();
                this.home();
              }, () => this.root.querySelector<HTMLButtonElement>('.settings-footer button')?.focus({ preventScroll: true }));
            },
          }, 'Reset progress')),
        h('div', { class: 'settings-help' }, 'Drag to aim. Release to launch. Use Recall and Surge during a run.'),
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
    const pause = h('button', { class: 'hudbtn', 'aria-label': 'Pause game', style: 'right:10px;top:10px', onclick: () => { this.click(); this.game.pause(); } }, '❚❚');
    const surge = h('button', { class: 'surge', 'aria-label': 'Surge (Space)', title: 'Surge / Space', style: 'right:12px;bottom:12px', onclick: () => this.game.world?.activateSurge() }, h('span', {}, 'SURGE')) as HTMLButtonElement;
    const recall = h('button', { class: 'recall', 'aria-label': 'Recall balls (R)', title: 'Recall / R / 10s cooldown', onclick: () => this.game.world?.activateRecall() },
      h('span', { class: 'recall-icon', 'aria-hidden': 'true' }, '↶'), h('span', { class: 'recall-label' }, 'RECALL'), h('small', {}, 'R / READY')) as HTMLButtonElement;
    this.surgeBtn = surge;
    this.recallBtn = recall;
    const telemetry = h('div', { class: 'compact-telemetry' },
      h('div', { class: 'compact-main' },
        h('div', {}, h('small', {}, 'HULL'), h('b', { class: 'compact-hull' })),
        h('div', {}, h('small', {}, 'RUN'), h('b', { class: 'compact-run' })),
        h('div', {}, h('small', {}, 'COMBO'), h('b', { class: 'compact-combo' })),
        h('div', {}, h('small', {}, 'RESONANCE'), h('b', { class: 'compact-signal' }))),
      h('div', { class: 'compact-details' },
        h('div', {}, h('small', {}, 'RUN DETAILS'), h('b', { class: 'compact-level' })),
        h('div', {}, h('small', {}, 'EVENT'), h('b', { class: 'compact-event' })),
        h('div', {}, h('small', {}, 'BOSS'), h('b', { class: 'compact-boss' })),
        h('div', {}, h('small', {}, 'NEXT UPGRADE'), h('div', { class: 'compact-xp' }, h('span')))));
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
    const text = w.surge.active > 0 ? 'ACTIVE' : ready ? 'SURGE!' : `${Math.floor(frac * 100)}%`;
    if (label.textContent !== text) label.textContent = text;
    if (this.recallBtn) {
      this.recallBtn.disabled = !w.canRecall() || !this.game.controlsEnabled;
      this.recallBtn.style.setProperty('--recall-p', `${(1 - w.recallCooldown / 10) * 100}%`);
      const small = this.recallBtn.querySelector('small')!;
      const status = w.recallCooldown > 0 ? `${Math.ceil(w.recallCooldown)}s` : w.canRecall() ? 'R / READY' : 'R / NO BALLS';
      if (small.textContent !== status) small.textContent = status;
    }
    if (this.compactTelemetry && this.root.hasAttribute('data-compact-hud')) {
      const signal = w.resonance.overdrive > 0 ? `OVERDRIVE ${Math.ceil(w.resonance.overdrive)}s` :
        w.resonance.nodes.length ? `${w.resonance.lit}/3 · ${Math.ceil(w.resonance.remaining)}s` : `IN ${Math.max(0, Math.ceil(w.resonance.cooldown))}s`;
      const bosses = w.enemies.filter(e => e.alive && e.boss);
      const bossHp = bosses.reduce((sum, e) => sum + e.hp, 0), bossMax = bosses.reduce((sum, e) => sum + e.maxHp, 0);
      const labels: Record<string, string> = {
        hull: `${formatNum(Math.ceil(w.hp))} / ${formatNum(w.maxHp)}`,
        run: formatTime(w.time),
        combo: `${formatNum(w.combo.count)}×`, signal,
        level: `LV ${w.level} / ${formatNum(w.run.kills)} KILLS`,
        event: w.event ? `${EVENT_MAP[w.event.id].name} · ${Math.ceil(w.event.dur - w.event.t)}s` : 'CLEAR',
        boss: w.director.bossActive ? `${BOSS_MAP[w.director.bossId]?.name ?? 'BOSS'} · ${Math.ceil(bossHp / (bossMax || 1) * 100)}%` :
          `IN ${formatTime(Math.max(0, w.director.bossTime - w.time))}`,
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

  private confirmAction(title: string, message: string, label: string, proceed: () => void, cancel: () => void, cancelLabel = 'Keep playing'): void {
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
        return h('button', { class: 'offer evolution', onclick: () => this.pick(w, o) },
          h('div', { class: 'oicon' }, e.icon),
          h('div', {}, h('div', { class: 'oname', style: `color:${e.color}` }, `EVOLVE: ${e.name}`), h('div', { class: 'odesc' }, e.desc)));
      }
      if (o.kind !== 'upgrade') {
        return h('button', { class: 'offer', onclick: () => this.pick(w, o) },
          h('div', { class: 'oicon' }, o.kind === 'heal' ? '💚' : '🪙'),
          h('div', {}, h('div', { class: 'oname' }, o.kind === 'heal' ? 'Repair' : 'Salvage'), h('div', { class: 'odesc' }, o.kind === 'heal' ? 'Restore 30% HP.' : '+25 coins.')));
      }
      const u = UPGRADE_MAP[o.id];
      const syn = previewSynergies(w.build, o.id);
      const feeds = feedsEvolutions(o.id);
      const hints: HTMLElement[] = [];
      for (const s of syn) {
        const sd = SYNERGY_MAP[s];
        const known = w.seen.synergies.has(s) || sd.tier === 'known';
        hints.push(h('div', { class: 'ohint', style: 'color:#d59bff' }, known ? `✦ Activates ${sd.icon} ${sd.name}` : '✦ Something stirs… (hidden synergy)'));
      }
      if (codex) for (const f of feeds) {
        const e = EVOLUTION_MAP[f];
        const r = e.recipe.find((x) => x.id === o.id)!;
        hints.push(h('div', { class: 'ohint', style: 'color:var(--legendary)' }, `🧬 ${e.name} ingredient${r.level > 1 ? ` (needs Lv\u00a0${r.level})` : ''}`));
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
        h('div', {}, h('span', { class: 'oname' }, u.name), h('span', { class: 'olv', style: o.level === 1 ? 'background:var(--green);color:#0a0612' : '' }, o.level === 1 ? 'NEW' : `Lv ${o.level}/${u.maxLevel}`)),
        h('div', { class: 'odesc' }, u.desc(o.level)),
        h('div', { class: 'otags' }, `${RARITY_LABEL[u.rarity]} · ${u.tags.join(' · ')}`),
        hints));
    };
    const tutorial = w.cfg.tutorial && w.levelUps === 0;
    const overlay = h('div', { class: 'levelup' },
      h('div', { class: 'lvtitle' }, `LEVEL ${w.level - w.pendingLevels + 1}`),
      tutorial ? h('div', { class: 'center small', style: 'color:var(--gold)' }, 'Pick an upgrade. Most change HOW your ball behaves — look for combinations!') : null,
      h('div', { class: 'col offer-list' }, w.offers.map(card)),
      h('div', { class: 'row offer-actions', style: 'justify-content:center;margin-top:6px' },
        h('button', { disabled: w.rerolls <= 0, onclick: () => { this.click(); w.reroll(); } }, `🎲 Reroll (${w.rerolls})`),
        w.banishes > 0 || w.flags.has('banish') ? h('button', {
          class: this.banishMode ? 'danger' : '', disabled: w.banishes <= 0,
          onclick: () => { this.click(); this.banishMode = !this.banishMode; this.levelUp(w); },
        }, this.banishMode ? 'Tap a card…' : `🚫 Banish (${w.banishes})`) : null,
        h('button', { class: 'ghost', onclick: () => this.pick(w, { kind: 'coins' }) }, 'Skip'),
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
      h('div', { class: 'lvtitle' }, 'PAUSED'),
      h('div', { class: 'scroll col' },
        h('h3', {}, 'Flight manual'),
        h('div', { class: 'combat-guide' }, h('b', {}, 'POWER SHOT'), h('p', {}, 'Release while the dial is gold for +45% damage and starting momentum.')),
        h('div', { class: 'combat-guide' }, h('b', {}, 'RESONANCE'), h('p', {}, 'Hit all three signals before time runs out. Starfall strikes five threats, clears projectiles, and gives 7 seconds of overdrive.')),
        h('div', { class: 'combat-guide' }, h('b', {}, 'RECALL & SURGE'), h('p', {}, 'Recall brings your main balls home to choose a new angle; 10 second cooldown. Surge supercharges your balls.')),
        h('h3', {}, 'Build'),
        h('div', { class: 'buildcard' },
          h('div', { class: 'small muted' }, 'CURRENT BUILD'),
          h('div', { class: 'buildname' }, this.game.buildName()),
          h('div', { class: 'statgrid' }, keys.filter((k) => st[k] > 0 && STAT_LABELS[k]).map((k) => h('div', {}, h('span', { class: 'muted' }, STAT_LABELS[k]![0]), h('b', {}, STAT_LABELS[k]![1](st[k])))))),
        h('h3', {}, 'Talents'),
        h('div', { class: 'row wrap' }, talentSpent(w.talents) ? TALENTS.filter(t => w.talents[t.id]).map(t =>
          h('span', { class: 'chip', title: t.desc(w.talents[t.id]) }, `${t.icon} ${t.name} ${w.talents[t.id]}/${t.maxRank}`)) : h('span', { class: 'small muted' }, 'No talents allocated for this run.')),
        h('h3', {}, 'Upgrades'),
        h('div', { class: 'row wrap' }, [...w.build.upgrades.entries()].map(([id, lv]) => h('span', { class: 'chip' }, `${UPGRADE_MAP[id].icon} ${UPGRADE_MAP[id].name} ${lv}`))),
        w.build.synergies.size ? [h('h3', {}, 'Synergies'), h('div', { class: 'col' }, [...w.build.synergies].map((id) => h('div', { class: 'card' }, h('div', { class: 'name' }, `${SYNERGY_MAP[id].icon} ${SYNERGY_MAP[id].name}`), h('div', { class: 'desc' }, SYNERGY_MAP[id].desc))))] : null,
        w.build.evolutions.size ? [h('h3', {}, 'Evolutions'), h('div', { class: 'col' }, [...w.build.evolutions].map((id) => h('div', { class: 'card' }, h('div', { class: 'name', style: `color:${EVOLUTION_MAP[id].color}` }, `${EVOLUTION_MAP[id].icon} ${EVOLUTION_MAP[id].name}`), h('div', { class: 'desc' }, EVOLUTION_MAP[id].desc))))] : null,
      ),
      h('div', { class: 'col overlay-actions' },
        h('button', { class: 'primary big', onclick: () => { this.click(); this.navigation.dismiss(); } }, '▶ Resume'),
        h('div', { class: 'row' },
          h('button', { style: 'flex:1', onclick: () => { this.click(); this.settings(); } }, 'Settings'),
          h('button', { class: 'danger', style: 'flex:1', onclick: () => this.confirmAction('End this run?', 'You keep the rewards earned so far. Your current build will be retired.', 'End run', () => this.game.abandonRun(), () => this.pauseMenu(w)) }, 'Abandon'),
        ),
      ),
    );
    this.showOverlay(overlay, 'pause');
  }

  // ------------------------------------------------------------------ victory choice
  victoryChoice(w: World): void {
    const overlay = h('div', { class: 'levelup' },
      h('div', { class: 'result-title win' }, 'VICTORY!'),
      h('div', { class: 'center muted' }, `${ARENA_MAP[w.arena.id].name} cleared on ${w.diff.name} in ${formatTime(w.time)}`),
      h('button', { class: 'primary big', onclick: () => { this.click(); this.closeOverlay(); this.game.finishRun(); } }, '🏆 Claim rewards'),
      h('button', { class: 'big', onclick: () => { this.click(); this.closeOverlay(); this.game.continueEndless(); } }, '♾️ Continue — Endless'),
      h('div', { class: 'center small muted' }, 'Endless: keep your build and see how long it survives. Rewards keep growing.'),
    );
    this.showOverlay(overlay, 'victory');
  }

  // ------------------------------------------------------------------ post run
  postRun(s: RunSummary, r: RunReport): void {
    this.navigation.reset(() => this.home(), { key: 'results', restore: () => this.postRun(s, r) });
    this.hideHud();
    this.closeOverlay();
    const bs = s.buildStats;
    const stat = (k: string, v: string | number) => h('div', {}, h('span', { class: 'muted' }, k), h('b', {}, String(v)));
    const core = CORE_MAP[s.core];
    const unlockLines = [
      ...r.unlocks.map((u) => `🔓 ${u}`),
      ...r.achievements.map((a) => `🏅 Achievement: ${a}`),
      ...r.challenges.map((c) => `🎯 Challenge: ${c}`),
      ...(r.arenaUnlocked ? [`🗺️ New arena: ${r.arenaUnlocked}`] : []),
      ...(r.difficultyUnlocked ? [`🔥 New difficulty: ${r.difficultyUnlocked}`] : []),
    ];
    this.show(h('div', { class: 'screen solid' },
      h('div', { class: `result-title ${s.victory ? 'win' : 'lose'}` }, s.victory ? 'RUN COMPLETE' : 'DEFEATED'),
      h('div', { class: 'center small muted' }, `${ARENA_MAP[s.arena].name} · ${DIFFICULTIES[s.difficulty].name} · ${formatTime(s.time)}${s.daily ? ' · Daily' : ''}`),
      h('div', { class: 'scroll', style: 'margin-top:10px' },
        h('div', { class: 'buildcard' },
          h('div', { class: 'small muted' }, 'YOUR BUILD'),
          h('div', { class: 'buildname' }, `${core.icon} ${s.buildName.toUpperCase()}`),
          h('div', { class: 'statgrid' },
            stat('Damage', bs.damage.toFixed(0)), stat('Crit', `${Math.round(bs.critChance * 100)}%`),
            stat('Speed', Math.round(bs.speed)), stat('Balls', bs.balls),
            bs.chain ? stat('Chain', bs.chain) : null, bs.lifesteal ? stat('Lifesteal', `${(bs.lifesteal * 100).toFixed(1)}%`) : null),
        ),
        h('div', { class: 'card', style: 'margin-top:8px' }, h('div', { class: 'statgrid' },
          stat('Enemies destroyed', formatNum(s.kills)), stat('Best combo', s.bestCombo),
          stat('Max bounce chain', s.maxBounceChain), stat('Damage dealt', formatNum(s.damageDealt)),
          stat('Bosses defeated', s.bossesDefeated.length), stat('Level', s.level),
          stat('Power shots', s.powerShots ?? 0), stat('Starfalls', s.starfalls ?? 0), stat('Tactical recalls', s.recalls ?? 0),
        )),
        h('h3', {}, 'Rewards'),
        h('div', { class: 'row wrap', style: 'gap:14px' },
          h('div', { class: 'reward', style: 'color:var(--gold)' }, `+${formatNum(r.rewards.coins)} 🪙`),
          r.rewards.cores ? h('div', { class: 'reward', style: 'color:var(--pink)' }, `+${r.rewards.cores} 💠`) : null,
          r.rewards.research ? h('div', { class: 'reward', style: 'color:#6de2ff' }, `+${r.rewards.research} 🔬`) : null,
        ),
        h('div', { class: 'card', style: 'margin-top:8px' },
          h('div', { class: 'name' }, `${core.icon} ${core.name} Mastery ${r.mastery.after}${r.mastery.after > r.mastery.before ? ' ⬆' : ''}`),
          bar(r.mastery.need ? r.mastery.into / r.mastery.need : 1, 'pink'),
          r.mastery.rewards.map((t) => h('div', { class: 'unlock' }, `⭐ ${t}`))),
        s.synergies.length ? [h('h3', {}, 'Synergies'), h('div', { class: 'col' }, s.synergies.map(id =>
          h('div', { class: 'card' }, h('div', { class: 'name' }, `${SYNERGY_MAP[id].icon} ${SYNERGY_MAP[id].name}`), h('div', { class: 'desc' }, SYNERGY_MAP[id].desc))))] : null,
        s.evolutions.length ? [h('h3', {}, 'Evolutions'), h('div', { class: 'col' }, s.evolutions.map(id =>
          h('div', { class: 'card' }, h('div', { class: 'name', style: `color:${EVOLUTION_MAP[id].color}` }, `${EVOLUTION_MAP[id].icon} ${EVOLUTION_MAP[id].name}`), h('div', { class: 'desc' }, EVOLUTION_MAP[id].desc))))] : null,
        r.discoveries.some((d) => d.cat !== 'upgrades') ? [h('h3', {}, 'New discoveries'), h('div', { class: 'col' }, r.discoveries.filter((d) => d.cat !== 'upgrades').slice(0, 10).map((d) => h('div', { class: 'unlock', style: 'color:#d59bff' }, `✦ ${d.cat.slice(0, -1).replace('enemie', 'enemy')}: ${d.name}`)))] : null,
        unlockLines.length ? [h('h3', {}, 'Unlocked'), h('div', { class: 'col' }, unlockLines.map(u => h('div', { class: 'unlock' }, u)))] : null,
        h('h3', {}, 'Next goals'),
        this.goalList(r.goals),
      ),
      h('div', { class: 'row', style: 'margin-top:8px' },
        h('button', { style: 'flex:1', onclick: () => { this.click(); this.home(); } }, 'Home'),
        h('button', { class: 'primary', style: 'flex:2', onclick: () => { this.click(); this.runSetup(); } }, '▶ One more run'),
      ),
    ));
  }
}
