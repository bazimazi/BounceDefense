import { formatNum, formatTime } from '../core/math';
import { dailySeed } from '../core/rng';
import { ARENAS, ARENA_MAP, DIFFICULTIES, EVENT_MAP, PACTS } from '../data/arenas';
import { CORES, CORE_MAP, PART_MAP, TRAILS } from '../data/balls';
import { BOSSES, CODEX_ENEMIES } from '../data/enemies';
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

const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

export class UI {
  private root: HTMLElement;
  private hudEl: HTMLElement | null = null;
  private surgeBtn: HTMLButtonElement | null = null;
  private hintEl: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private screenEl: HTMLElement | null = null;
  private setup = { arena: 'proving', difficulty: 0, pacts: new Set<string>() };
  private codexTab = 'balls';
  private banishMode = false;

  constructor(root: HTMLElement, private game: Game) {
    this.root = root;
  }

  layout(rect: { x: number; y: number; w: number; h: number }): void {
    Object.assign(this.root.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
    this.root.style.setProperty('--s', String(rect.w / 540));
  }

  private get p() {
    return this.game.profile;
  }

  private click(): void {
    this.game.audio.play('click');
  }

  private show(el: HTMLElement): void {
    this.screenEl?.remove();
    this.screenEl = el;
    this.root.append(el);
  }

  clearScreen(): void {
    this.screenEl?.remove();
    this.screenEl = null;
  }

  toast(text: string): void {
    const t = h('div', { class: 'toast' }, text);
    this.root.append(t);
    setTimeout(() => t.remove(), 1800);
  }

  private currency(): HTMLElement {
    const p = this.p;
    return h('div', { class: 'chips' },
      h('span', { class: 'chip coins' }, `🪙 ${formatNum(p.coins)}`),
      h('span', { class: 'chip cores' }, `💠 ${p.cores}`),
      h('span', { class: 'chip research' }, `🔬 ${p.research}`),
    );
  }

  private topbar(title: string, back: () => void = () => this.home()): HTMLElement {
    return h('div', { class: 'topbar' },
      h('button', { class: 'ghost', onclick: () => { this.click(); back(); } }, '←'),
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
    this.game.toMenu();
    const p = this.p;
    const coreDef = CORE_MAP[p.loadout.core];
    const nav = (label: string, fn: () => void, badge?: boolean) =>
      h('button', { onclick: () => { this.click(); fn(); } }, label, badge ? h('span', { style: 'color:var(--gold)' }, ' ●') : null);
    const canAffordResearch = RESEARCH.some((r) => canResearch(p, r.id));
    const canAffordCore = CORES.some((c) => canUnlockCore(p, c.id));
    this.show(h('div', { class: 'screen home' },
      h('div', { class: 'home-topline' }, h('span', { class: 'eyebrow' }, 'BD / SYSTEM ONLINE'), this.currency()),
      h('div', { class: 'scroll home-content' },
        h('div', { class: 'hero' },
          h('div', { class: 'eyebrow hero-kicker' }, 'A RICOCHET ROGUELITE'),
          h('h1', { class: 'title' }, 'BOUNCE', h('br'), h('span', {}, 'DEFENSE')),
          h('div', { class: 'reactor-art', 'aria-hidden': 'true', style: `--core-color:${coreDef.color}` },
            h('div', { class: 'orbit orbit-one' }), h('div', { class: 'orbit orbit-two' }),
            h('div', { class: 'reactor-crosshair' }), h('div', { class: 'reactor-ball' }),
            h('span', { class: 'reactor-coordinate coordinate-left' }, 'KINETIC', h('br'), 'CORE / 01'),
            h('span', { class: 'reactor-coordinate coordinate-right' }, 'POWER', h('br'), '100%'),
          ),
          h('div', { class: 'subtitle' }, 'One ball. Endless possibilities.'),
          h('div', { class: 'hero-description' }, 'Find your angle. Break their lines. Build a chain reaction.'),
        ),
        h('div', { class: 'col' },
          h('button', { class: 'primary big launch-button', onclick: () => { this.click(); p.tutorialDone ? this.runSetup() : this.game.startRun({ arena: 'proving', difficulty: 0, pacts: [] }); } },
            h('span', {}, p.tutorialDone ? 'PLAY / DEPLOY CORE' : 'START / FIRST CONTACT'), h('span', { 'aria-hidden': 'true' }, '↗')),
          h('div', { class: 'core-readout' }, h('span', { class: 'status-dot', style: `background:${coreDef.color}` }),
            `${coreDef.name} equipped`, h('span', { class: 'spacer' }), `MASTERY ${masteryLevel(p.mastery[p.loadout.core] ?? 0).level}`),
          p.tutorialDone ? h('button', { onclick: () => { this.click(); this.dailyRun(); } }, '📅 Daily Seed') : null,
          p.tutorialDone ? h('div', { class: 'grid2 home-nav' },
            nav('⚙️ Loadout', () => this.loadout(), canAffordCore),
            nav('🔧 Workshop', () => this.workshop()),
            nav('🔬 Research', () => this.research(), canAffordResearch),
            nav('📖 Codex', () => this.codex()),
            nav('🏆 Goals', () => this.goals()),
            nav('🎚️ Settings', () => this.settings()),
          ) : h('div', { class: 'first-run-guide' },
            h('div', {}, h('b', {}, '01'), h('span', {}, 'DRAG TO AIM')),
            h('div', {}, h('b', {}, '02'), h('span', {}, 'RELEASE TO FIRE')),
            h('div', {}, h('b', {}, '03'), h('span', {}, 'EVOLVE YOUR CORE')),
          ),
          p.tutorialDone ? [h('h3', {}, 'Next goals'), this.goalList(nextGoals(p, 3))] : null,
          h('div', { class: 'small muted center', style: 'margin-top:14px' },
            `Runs ${p.stats.runs} · Wins ${p.stats.wins} · Best combo ${p.stats.bestCombo}`),
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
  runSetup(): void {
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
        h('h3', {}, 'Arena'),
        h('div', { class: 'col' }, ARENAS.map((a) => {
          const ok = isArenaUnlocked(p, a.id);
          const cleared = p.cleared[a.id] ?? -1;
          return h('div', {
            class: `card ${s.arena === a.id ? 'selected' : ''} ${ok ? '' : 'locked'}`,
            style: `border-left: 4px solid ${a.theme.accent}`,
            onclick: () => { if (ok) { s.arena = a.id; rerender(); } },
          },
          h('div', { class: 'row' }, h('div', { class: 'name', style: 'flex:1' }, ok ? a.name : `🔒 ${a.name}`),
            cleared >= 0 ? h('span', { class: 'chip', style: `color:${DIFFICULTIES[cleared].color}` }, `✓ ${DIFFICULTIES[cleared].name}`) : null),
          h('div', { class: 'desc' }, ok ? `${a.desc} Boss: ${BOSSES.find((b) => b.id === a.bossId)?.name}` : a.unlockReq?.text ?? ''));
        })),
        h('h3', {}, 'Difficulty'),
        h('div', { class: 'row wrap' }, DIFFICULTIES.map((d, i) => {
          const ok = i <= maxDifficulty(p);
          return h('button', {
            disabled: !ok,
            style: s.difficulty === i ? `background:${d.color};color:#0a0612` : `color:${d.color}`,
            onclick: () => { s.difficulty = i; rerender(); },
          }, ok ? d.name : `🔒 ${d.name}`);
        })),
        h('div', { class: 'small muted', style: 'margin-top:6px' }, `${DIFFICULTIES[s.difficulty].desc} ${DIFFICULTIES[s.difficulty].rules.join(' · ')}`),
        pactsOn ? [
          h('h3', {}, 'Risk Pacts'),
          h('div', { class: 'grid2' }, PACTS.map((pc) => h('div', {
            class: `card ${s.pacts.has(pc.id) ? 'selected' : ''}`,
            onclick: () => { if (s.pacts.has(pc.id)) s.pacts.delete(pc.id); else s.pacts.add(pc.id); rerender(); },
          }, h('div', { class: 'name' }, `${pc.icon} ${pc.name}`), h('div', { class: 'desc' }, pc.desc), h('div', { class: 'small', style: 'color:var(--gold);margin-top:4px' }, `+${Math.round(pc.reward * 100)}% rewards`)))),
        ] : h('div', { class: 'small muted', style: 'margin-top:14px' }, '🔒 Research "Risk Pacts" to make runs harder for greater rewards.'),
      ),
      h('div', { class: 'col', style: 'margin-top:8px' },
        h('div', { class: 'center small', style: 'color:var(--gold)' }, `Reward multiplier ×${mult.toFixed(2)}`),
        h('button', { class: 'primary big', onclick: () => { this.click(); this.game.startRun({ arena: s.arena, difficulty: s.difficulty, pacts: [...s.pacts] }); } }, '▶ LAUNCH'),
      ),
    ));
  }

  // ------------------------------------------------------------------ loadout
  loadout(): void {
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
        h('div', { class: 'row wrap' }, TRAILS.map((t) => {
          const owned = p.cosmetics.includes(t.id);
          return h('button', {
            disabled: !owned,
            style: `background:linear-gradient(90deg,${t.colors[0]},${t.colors[1]});color:#0a0612;${l.trail === t.id ? 'outline:3px solid #fff' : ''}`,
            onclick: () => { l.trail = t.id; rerender(); },
          }, owned ? t.name : '🔒');
        })),
        h('h3', {}, 'Build Presets'),
        h('div', { class: 'grid3' }, [0, 1, 2].map((i) => {
          const pr = p.presets[i];
          return h('div', { class: 'card center' },
            h('div', { class: 'small' }, pr ? `${CORE_MAP[pr.core]?.icon} ${pr.name}` : `Slot ${i + 1}`),
            h('div', { class: 'row', style: 'justify-content:center;margin-top:6px' },
              h('button', { class: 'small', onclick: () => { p.presets[i] = { ...l, name: `${CORE_MAP[l.core].name.split(' ')[0]} ${PART_MAP[l.impact]?.name.split(' ')[0] ?? ''}` }; this.toast('Preset saved'); rerender(); } }, 'Save'),
              pr ? h('button', { class: 'small', onclick: () => { Object.assign(l, { core: pr.core, shell: pr.shell, impact: pr.impact, momentum: pr.momentum, trail: pr.trail }); rerender(); } }, 'Load') : null,
            ));
        })),
      ),
    ));
  }

  // ------------------------------------------------------------------ workshop
  workshop(): void {
    const p = this.p;
    this.show(h('div', { class: 'screen' },
      this.topbar('Workshop'),
      h('div', { class: 'small muted', style: 'margin-bottom:8px' }, 'Small, capped permanent boosts. New mechanics come from Research, Mastery and Goals.'),
      h('div', { class: 'scroll col' }, WORKSHOP.map((wd) => {
        const lvl = p.workshop[wd.id] ?? 0;
        const cost = workshopCost(p, wd.id);
        return h('div', { class: 'card row' },
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
    const p = this.p;
    this.show(h('div', { class: 'screen' },
      this.topbar('Research'),
      h('div', { class: 'small muted', style: 'margin-bottom:8px' }, 'Earn 🔬 by discovering synergies, evolutions, reactions and bosses. Research widens your options.'),
      h('div', { class: 'scroll col' }, RESEARCH.map((r) => {
        const done = p.researchNodes.includes(r.id);
        const reqOk = r.requires.every((x) => p.researchNodes.includes(x));
        return h('div', { class: `card row ${done ? 'selected' : ''} ${reqOk ? '' : 'locked'}` },
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
      h('div', { class: 'tabs' }, tabs.map(([id, label, n, m]) => h('button', { class: this.codexTab === id ? 'on' : '', onclick: () => { this.codexTab = id; this.click(); this.codex(); } }, `${label} ${n}/${m}`))),
      h('div', { class: 'scroll col' }, body),
    ));
  }

  // ------------------------------------------------------------------ goals
  goals(): void {
    const p = this.p;
    this.show(h('div', { class: 'screen' },
      this.topbar('Goals'),
      h('div', { class: 'scroll' },
        h('h3', {}, `Challenges ${p.challenges.length}/${CHALLENGES.length}`),
        h('div', { class: 'col' }, CHALLENGES.map((c) => {
          const done = p.challenges.includes(c.id);
          return h('div', { class: `card ${done ? 'selected' : ''}` },
            h('div', { class: 'name' }, `${c.icon} ${c.name} ${done ? '✓' : ''}`),
            h('div', { class: 'desc' }, c.desc),
            h('div', { class: 'small', style: 'color:var(--gold);margin-top:3px' }, c.rewards.map((r) => (r.type === 'coins' || r.type === 'cores' || r.type === 'research') ? `+${r.amount} ${r.type}` : `${r.type}: ${r.id}`).join(', ')));
        })),
        h('h3', {}, `Achievements ${p.achievements.length}/${ACHIEVEMENTS.length}`),
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
  settings(onBack: () => void = () => this.home()): void {
    const s = this.p.settings;
    const apply = () => { this.game.applySettings(); this.game.save(); };
    const toggle = (label: string, key: 'shake' | 'damageNumbers' | 'reducedFlashes' | 'debug') =>
      h('label', { class: 'toggle' }, h('span', {}, label), h('input', { type: 'checkbox', checked: s[key], onchange: (e: Event) => { s[key] = (e.target as HTMLInputElement).checked; apply(); } }));
    const slider = (label: string, key: 'sfx' | 'music') =>
      h('div', { class: 'toggle', style: 'flex-direction:column;align-items:stretch' }, h('span', {}, label),
        h('input', { class: 'slider', type: 'range', min: 0, max: 1, step: 0.05, value: s[key], oninput: (e: Event) => { s[key] = Number((e.target as HTMLInputElement).value); apply(); } }));
    this.show(h('div', { class: 'screen solid' },
      this.topbar('Settings', onBack),
      h('div', { class: 'scroll' },
        slider('Sound effects', 'sfx'),
        slider('Music', 'music'),
        toggle('Screen shake', 'shake'),
        toggle('Damage numbers', 'damageNumbers'),
        toggle('Reduce flashes & motion', 'reducedFlashes'),
        h('div', { class: 'toggle' }, h('span', {}, 'Aim mode'),
          h('div', { class: 'row' }, (['direct', 'slingshot'] as const).map((m) => h('button', {
            style: s.aimMode === m ? 'background:var(--accent);color:#0a0612' : '',
            onclick: () => { s.aimMode = m; apply(); this.settings(onBack); },
          }, m === 'direct' ? 'Point' : 'Slingshot')))),
        toggle('Debug tools', 'debug'),
        h('div', { style: 'margin-top:24px' },
          h('button', {
            class: 'danger',
            onclick: () => {
              if (confirm('Erase ALL progress? This cannot be undone.')) {
                const settings = { ...s };
                Object.assign(this.p, defaultProfile(), { settings });
                this.game.save();
                this.home();
              }
            },
          }, 'Reset progress')),
        h('div', { class: 'small muted', style: 'margin-top:16px' }, 'Bounce Defense v0.1 — Desktop: drag with the mouse, Space = Surge, Esc = Pause.'),
      ),
    ));
  }

  // ------------------------------------------------------------------ in-run HUD
  hud(): void {
    this.clearScreen();
    this.hudEl?.remove();
    const pause = h('button', { class: 'hudbtn', style: 'right:10px;top:10px', onclick: () => { this.click(); this.game.pause(); } }, '❚❚');
    const surge = h('button', { class: 'surge', style: 'right:12px;bottom:12px', onclick: () => this.game.world?.activateSurge() }, h('span', {}, 'SURGE')) as HTMLButtonElement;
    this.surgeBtn = surge;
    this.hudEl = h('div', { style: 'position:absolute;inset:0;pointer-events:none' }, pause, surge);
    for (const c of [pause, surge]) c.style.pointerEvents = 'auto';
    this.root.append(this.hudEl);
  }

  hideHud(): void {
    this.hudEl?.remove();
    this.hudEl = null;
    this.hint(null);
  }

  updateHud(w: World): void {
    if (!this.surgeBtn) return;
    const frac = w.surge.charge / w.surge.max;
    this.surgeBtn.style.setProperty('--p', `${Math.round(frac * 100)}%`);
    const ready = w.canSurge();
    this.surgeBtn.classList.toggle('ready', ready);
    const label = this.surgeBtn.firstElementChild as HTMLElement;
    const text = w.surge.active > 0 ? 'ACTIVE' : ready ? 'SURGE!' : `${Math.floor(frac * 100)}%`;
    if (label.textContent !== text) label.textContent = text;
  }

  hint(text: string | null): void {
    if (!text) {
      this.hintEl?.remove();
      this.hintEl = null;
      return;
    }
    if (this.hintEl?.textContent === text) return;
    this.hintEl?.remove();
    this.hintEl = h('div', { class: 'hint', style: 'bottom:13%' }, text);
    this.root.append(this.hintEl);
  }

  private closeOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  // ------------------------------------------------------------------ level up
  levelUp(w: World): void {
    this.closeOverlay();
    const codex = w.flags.has('codex');
    const card = (o: Offer, i: number) => {
      const delay = `animation-delay:${i * 60}ms`;
      if (o.kind === 'evolution') {
        const e = EVOLUTION_MAP[o.id];
        return h('button', { class: 'offer evolution', style: delay, onclick: () => this.pick(w, o) },
          h('div', { class: 'oicon' }, e.icon),
          h('div', {}, h('div', { class: 'oname', style: `color:${e.color}` }, `EVOLVE: ${e.name}`), h('div', { class: 'odesc' }, e.desc)));
      }
      if (o.kind !== 'upgrade') {
        return h('button', { class: 'offer', style: delay, onclick: () => this.pick(w, o) },
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
        hints.push(h('div', { class: 'ohint', style: 'color:var(--legendary)' }, `🧬 ${e.name} ingredient${r.level > 1 ? ` (needs Lv ${r.level})` : ''}`));
      }
      return h('button', {
        class: `offer ${u.rarity} ${this.banishMode ? 'banish-mode' : ''}`, style: delay,
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
    this.overlay = h('div', { class: 'levelup' },
      h('div', { class: 'lvtitle' }, `LEVEL ${w.level - w.pendingLevels + 1}`),
      tutorial ? h('div', { class: 'center small', style: 'color:var(--gold)' }, 'Pick an upgrade. Most change HOW your ball behaves — look for combinations!') : null,
      h('div', { class: 'col' }, w.offers.map(card)),
      h('div', { class: 'row', style: 'justify-content:center;margin-top:6px' },
        h('button', { disabled: w.rerolls <= 0, onclick: () => { this.click(); w.reroll(); } }, `🎲 Reroll (${w.rerolls})`),
        w.banishes > 0 || w.flags.has('banish') ? h('button', {
          class: this.banishMode ? 'danger' : '', disabled: w.banishes <= 0,
          onclick: () => { this.click(); this.banishMode = !this.banishMode; this.levelUp(w); },
        }, this.banishMode ? 'Tap a card…' : `🚫 Banish (${w.banishes})`) : null,
        h('button', { class: 'ghost', onclick: () => this.pick(w, { kind: 'coins' }) }, 'Skip'),
      ),
    );
    this.root.append(this.overlay);
  }

  private pick(w: World, o: Offer): void {
    this.banishMode = false;
    this.game.audio.play('select');
    this.game.onOfferChosen(o);
    this.closeOverlay();
  }

  // ------------------------------------------------------------------ pause
  pauseMenu(w: World): void {
    this.closeOverlay();
    const st = w.build.stats;
    const keys: StatKey[] = ['damage', 'critChance', 'critMult', 'speed', 'maxBalls', 'pierce', 'burnChance', 'chillChance', 'chainChance', 'explosionChance', 'splitChance', 'bleedChance', 'lifesteal', 'maxHp', 'armor'];
    this.overlay = h('div', { class: 'levelup', style: 'justify-content:flex-start' },
      h('div', { class: 'lvtitle' }, 'PAUSED'),
      h('div', { class: 'scroll col' },
        h('div', { class: 'buildcard' },
          h('div', { class: 'small muted' }, 'CURRENT BUILD'),
          h('div', { class: 'buildname' }, this.game.buildName()),
          h('div', { class: 'statgrid' }, keys.filter((k) => st[k] > 0 && STAT_LABELS[k]).map((k) => h('div', {}, h('span', { class: 'muted' }, STAT_LABELS[k]![0]), h('b', {}, STAT_LABELS[k]![1](st[k])))))),
        h('h3', {}, 'Upgrades'),
        h('div', { class: 'row wrap' }, [...w.build.upgrades.entries()].map(([id, lv]) => h('span', { class: 'chip' }, `${UPGRADE_MAP[id].icon} ${UPGRADE_MAP[id].name} ${lv}`))),
        w.build.synergies.size ? [h('h3', {}, 'Synergies'), h('div', { class: 'col' }, [...w.build.synergies].map((id) => h('div', { class: 'card' }, h('div', { class: 'name' }, `${SYNERGY_MAP[id].icon} ${SYNERGY_MAP[id].name}`), h('div', { class: 'desc' }, SYNERGY_MAP[id].desc))))] : null,
        w.build.evolutions.size ? [h('h3', {}, 'Evolutions'), h('div', { class: 'col' }, [...w.build.evolutions].map((id) => h('div', { class: 'card' }, h('div', { class: 'name', style: `color:${EVOLUTION_MAP[id].color}` }, `${EVOLUTION_MAP[id].icon} ${EVOLUTION_MAP[id].name}`), h('div', { class: 'desc' }, EVOLUTION_MAP[id].desc))))] : null,
      ),
      h('div', { class: 'col' },
        h('button', { class: 'primary big', onclick: () => { this.click(); this.closeOverlay(); this.game.resume(); } }, '▶ Resume'),
        h('div', { class: 'row' },
          h('button', { style: 'flex:1', onclick: () => { this.click(); this.closeOverlay(); this.settings(() => { this.clearScreen(); this.pauseMenu(w); }); } }, 'Settings'),
          h('button', { class: 'danger', style: 'flex:1', onclick: () => { if (confirm('Abandon this run? You keep the rewards earned so far.')) { this.closeOverlay(); this.game.abandonRun(); } } }, 'Abandon'),
        ),
      ),
    );
    this.root.append(this.overlay);
  }

  // ------------------------------------------------------------------ victory choice
  victoryChoice(w: World): void {
    this.closeOverlay();
    this.overlay = h('div', { class: 'levelup' },
      h('div', { class: 'result-title win' }, 'VICTORY!'),
      h('div', { class: 'center muted' }, `${ARENA_MAP[w.arena.id].name} cleared on ${w.diff.name} in ${formatTime(w.time)}`),
      h('button', { class: 'primary big', onclick: () => { this.click(); this.closeOverlay(); this.game.finishRun(); } }, '🏆 Claim rewards'),
      h('button', { class: 'big', onclick: () => { this.click(); this.closeOverlay(); this.game.continueEndless(); } }, '♾️ Continue — Endless'),
      h('div', { class: 'center small muted' }, 'Endless: keep your build and see how long it survives. Rewards keep growing.'),
    );
    this.root.append(this.overlay);
  }

  // ------------------------------------------------------------------ post run
  postRun(s: RunSummary, r: RunReport): void {
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
          s.synergies.length ? h('div', { style: 'margin-top:8px' }, s.synergies.map((id) => h('span', { class: 'tag', style: 'color:#d59bff' }, `${SYNERGY_MAP[id].icon} ${SYNERGY_MAP[id].name}`))) : null,
          s.evolutions.length ? h('div', { style: 'margin-top:4px' }, s.evolutions.map((id) => h('span', { class: 'tag', style: `color:${EVOLUTION_MAP[id].color}` }, `${EVOLUTION_MAP[id].icon} ${EVOLUTION_MAP[id].name}`))) : null,
        ),
        h('div', { class: 'card', style: 'margin-top:8px' }, h('div', { class: 'statgrid' },
          stat('Enemies destroyed', formatNum(s.kills)), stat('Best combo', s.bestCombo),
          stat('Max bounce chain', s.maxBounceChain), stat('Damage dealt', formatNum(s.damageDealt)),
          stat('Bosses defeated', s.bossesDefeated.length), stat('Level', s.level),
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
        r.discoveries.some((d) => d.cat !== 'upgrades') ? [h('h3', {}, 'New discoveries'), h('div', { class: 'col' }, r.discoveries.filter((d) => d.cat !== 'upgrades').slice(0, 10).map((d) => h('div', { class: 'unlock', style: 'color:#d59bff' }, `✦ ${d.cat.slice(0, -1).replace('enemie', 'enemy')}: ${d.name}`)))] : null,
        unlockLines.length ? [h('h3', {}, 'Unlocked'), h('div', { class: 'col' }, unlockLines.map((u, i) => h('div', { class: 'unlock', style: `animation-delay:${i * 120}ms` }, u)))] : null,
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
