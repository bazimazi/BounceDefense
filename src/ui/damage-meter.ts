import { formatNum } from '../core/math';
import { CORES, PARTS } from '../data/balls';
import { WORKSHOP_MAP } from '../data/meta';
import { RELICS, RELIC_COLOR } from '../data/relics';
import { EVOLUTIONS, SYNERGIES } from '../data/synergies';
import { TALENTS } from '../data/talents';
import { UPGRADES, UPGRADE_MAP } from '../data/upgrades';
import type { Rarity } from '../data/types';
import { localizeDigits, t, type UiKey } from '../i18n';
import type { DamageSource } from '../sim/combat';
import type { World } from '../sim/world';
import { h } from './dom';

/**
 * The damage meter: who did the damage. Keys are what `World.damageBy` records, either a
 * behavior id (an upgrade, synergy, evolution, relic, core, part or talent dealt it) or a
 * damage type for everything the build's stats do on their own (crit hits, proc chains...).
 */
export interface SkillInfo {
  name: string;
  icon: string;
  color: string;
}

const SOURCES: Record<DamageSource | 'pylon', { icon: string; color: string }> = {
  ball: { icon: '⚪', color: '#7ef0d2' },
  chain: { icon: '⚡', color: '#5ee7ff' },
  explosion: { icon: '💥', color: '#ff9a3d' },
  burn: { icon: '🔥', color: '#ff7a2f' },
  bleed: { icon: '🩸', color: '#ff2a55' },
  poison: { icon: '🧪', color: '#8dff5a' },
  spark: { icon: '✨', color: '#d0c4ff' },
  shatter: { icon: '🧊', color: '#9fdcff' },
  barrel: { icon: '🛢️', color: '#ff8a3d' },
  surge: { icon: '🌟', color: '#ffe066' },
  beam: { icon: '🔆', color: '#ffffff' },
  enemyBlast: { icon: '💢', color: '#ff3b3b' },
  nova: { icon: '🌠', color: '#c3b1ff' },
  quake: { icon: '💫', color: '#b8c8ff' },
  meteor: { icon: '☄️', color: '#ff9a3d' },
  mine: { icon: '💣', color: '#ffb13b' },
  pylon: { icon: '🗼', color: '#ffe38a' },
};

const RARITY_COLOR: Record<Rarity, string> = { common: '#b9c4da', rare: '#4cc6ff', epic: '#c27dff', legendary: '#ffb21e' };

interface Named { name: string; icon?: string }
/** behavior id -> its owner. Names are read on use: they are localized getters. */
let owners: Map<string, { def: Named; color: string; icon?: string }> | null = null;

function ownerIndex() {
  if (owners) return owners;
  const m = new Map<string, { def: Named; color: string; icon?: string }>();
  const add = (behavior: string | undefined, def: Named, color: string, icon?: string) => {
    if (behavior && !m.has(behavior)) m.set(behavior, { def, color, icon });
  };
  for (const e of EVOLUTIONS) add(e.behavior, e, e.color);
  for (const s of SYNERGIES) add(s.behavior, s, '#7ef0d2');
  for (const u of UPGRADES) add(u.behavior, u, RARITY_COLOR[u.rarity]);
  for (const r of RELICS) add(r.behavior, r, RELIC_COLOR[r.rarity]);
  for (const c of CORES) add(c.behavior, c, c.color, '🔮');
  for (const p of PARTS) add(p.behavior, p, '#a9b7cf');
  for (const tl of TALENTS) add(tl.behavior, tl, '#7be0cb');
  owners = m;
  return m;
}

export function skillInfo(key: string): SkillInfo {
  if (key in SOURCES) {
    const s = SOURCES[key as keyof typeof SOURCES];
    return { name: t(`meter.src.${key}` as UiKey), icon: s.icon, color: s.color };
  }
  const owner = ownerIndex().get(key);
  if (owner) return { name: owner.def.name, icon: owner.icon ?? owner.def.icon ?? '◆', color: owner.color };
  const def: Named | undefined = UPGRADE_MAP[key] ?? WORKSHOP_MAP[key];
  if (def) return { name: def.name, icon: def.icon ?? '◆', color: UPGRADE_MAP[key] ? RARITY_COLOR[UPGRADE_MAP[key].rarity] : '#ff6b8b' };
  const pretty = key.replace(/^(evo|relic|talent|bp)_/, '').replace(/_/g, ' ');
  return { name: pretty.charAt(0).toUpperCase() + pretty.slice(1), icon: '◆', color: '#a9b7cf' };
}

/** Every key the meter can show from a damage type (the rest are behavior ids). */
export const SOURCE_KEYS = Object.keys(SOURCES);

function row(key: string, value: number, total: number, top: number, cls: string): HTMLElement {
  const info = skillInfo(key);
  const pct = total > 0 ? value / total * 100 : 0;
  return h('div', { class: `dm-row ${cls}`, style: `--c:${info.color};--w:${top > 0 ? (value / top * 100).toFixed(1) : 0}%` },
    h('span', { class: 'dm-icon', 'aria-hidden': 'true' }, info.icon),
    h('span', { class: 'dm-name' }, info.name),
    h('b', { class: 'dm-value' }, formatNum(value)),
    h('span', { class: 'dm-pct' }, `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`));
}

/** The full breakdown: every skill, for the pause menu and the end-of-run report. */
export function damageReport(entries: [string, number][], time: number): HTMLElement {
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (!entries.length) return h('div', { class: 'damage-report empty' }, t('meter.none'));
  const top = entries[0][1];
  return h('div', { class: 'damage-report' },
    h('div', { class: 'dm-total' },
      h('span', {}, t('meter.total')), h('b', {}, formatNum(total)),
      h('span', {}, t('meter.dps')), h('b', {}, formatNum(time > 0 ? total / time : 0))),
    entries.map(([key, v]) => row(key, v, total, top, '')));
}

const LIVE_ROWS = 6;
/** Seconds of run time the live DPS readout averages over. */
const DPS_WINDOW = 5;

/** The live meter over the arena: the top skills, refreshed a few times a second. */
export class LiveDamageMeter {
  readonly el: HTMLElement;
  private readonly rows: HTMLElement;
  private readonly totalEl: HTMLElement;
  private readonly dpsEl: HTMLElement;
  private samples: { t: number; dmg: number }[] = [];
  private nextAt = 0;
  private world: World | null = null;
  private readonly titleEl = h('span', { class: 'dm-title' });
  private readonly dpsLabel = h('span', { class: 'dm-dps-label' });

  constructor() {
    this.totalEl = h('b', { class: 'dm-total-value' });
    this.dpsEl = h('b', { class: 'dm-dps-value' });
    this.rows = h('div', { class: 'dm-rows' });
    this.el = h('div', { class: 'damage-meter', 'aria-hidden': 'true' },
      h('div', { class: 'dm-head' }, this.titleEl, this.totalEl, this.dpsLabel, this.dpsEl),
      this.rows);
  }

  /** Re-reads labels and redraws now: the HUD is rebuilt after the language may have changed. */
  refresh(w: World | null): void {
    this.titleEl.textContent = t('meter.title');
    this.dpsLabel.textContent = t('meter.dps');
    if (w) this.update(w, true);
  }

  update(w: World, force = false): void {
    const now = w.time;
    if (w !== this.world) {
      this.world = w;
      this.samples = [];
      force = true;
    }
    if (!force && now < this.nextAt) return;
    this.nextAt = now + 0.25;
    const total = w.run.damageDealt;
    this.samples.push({ t: now, dmg: total });
    while (this.samples.length > 2 && this.samples[1].t <= now - DPS_WINDOW) this.samples.shift();
    const first = this.samples[0];
    const span = Math.max(1, now - first.t);
    const dps = now - first.t > 0.2 ? (total - first.dmg) / span : 0;
    this.totalEl.textContent = localizeDigits(formatNum(total));
    this.dpsEl.textContent = localizeDigits(formatNum(dps));
    const entries = w.damageReport().slice(0, LIVE_ROWS);
    const top = entries[0]?.[1] ?? 0;
    this.rows.replaceChildren(...(entries.length ? entries.map(([key, v]) => row(key, v, total, top, 'live')) : [h('div', { class: 'dm-empty' }, t('meter.none'))]));
  }
}
