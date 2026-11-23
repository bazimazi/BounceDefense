import { localize } from '../i18n/content';
import { Rng } from '../core/rng';
import type { Modifier } from '../sim/stats';

/**
 * The Descent: an endless ladder below Eternity. Winning Eternity opens Depth 1; every depth is an
 * Eternity run (every apex boss) whose enemies grow `DESCENT.hp` tougher and hit `DESCENT.damage` harder
 * per depth, compounding, with Afflictions that change every five depths. Winning a depth opens the next
 * one. The ladder has no last step: the Aether it pays
 * buys Constellations, endless compounding lines, so each depth needs more runs than the one before.
 */
export const DESCENT = {
  /** Difficulty index every depth is played on (Eternity). */
  tier: 9,
  /** Enemy health multiplier per depth, compounding (in full from `rampEnd` seconds on). */
  hp: 1.15,
  /** Share of the depth's health multiplier (as an exponent) that ordinary enemies carry at the start of a run. */
  early: 0.75,
  /** Run time by which ordinary enemies carry the depth's full health multiplier. */
  rampEnd: 360,
  /** Boss health multiplier per depth, compounding: late builds snowball, so the bosses are where depths bite. */
  boss: 1.15,
  /** Damage reaching the line, per depth, compounding. */
  damage: 1.05,
  /** Coin reward multiplier gained per depth (linear: coins stop keeping up with Overdrive's prices). */
  coinsPerDepth: 0.06,
};

/** Ordinary enemy health multiplier at a depth (1 at depth 0), in full: see `descentHpAt` for the opening. */
export function descentHp(depth: number): number {
  return depth > 0 ? Math.pow(DESCENT.hp, depth) : 1;
}

/**
 * Ordinary enemy health at a depth and run time: the opening carries only part of the depth (a weak opening
 * build would otherwise decide deep runs on its own) and the rest arrives by `DESCENT.rampEnd`.
 */
export function descentHpAt(depth: number, time: number): number {
  return depth > 0 ? pressureAt(descentHp(depth), time) : 1;
}

/** A full health multiplier as ordinary enemies carry it at a run time: part of it in the opening, all of it by `rampEnd`. */
export function pressureAt(mult: number, time: number): number {
  if (mult === 1) return 1;
  const ramp = Math.max(0, Math.min(1, time / DESCENT.rampEnd));
  return Math.pow(mult, DESCENT.early + (1 - DESCENT.early) * ramp);
}

/** Boss health multiplier at a depth. */
export function descentBossHp(depth: number): number {
  return depth > 0 ? Math.pow(DESCENT.boss, depth) : 1;
}

/** Line damage multiplier at a depth. */
export function descentDamage(depth: number): number {
  return depth > 0 ? Math.pow(DESCENT.damage, depth) : 1;
}

/**
 * Aether per won depth: `base × growth^depth`. It grows more slowly than a depth's worth of Constellation
 * levels costs (about two levels of every line per depth at `STAR_GROWTH`), so each depth takes a few
 * percent more runs than the one before: a steady climb that never ends.
 */
export const AETHER = { base: 10, growth: 1.04 };

/** Aether a won depth pays (before Fortune); a lost run pays a share for each boss it felled. */
export function aetherFor(depth: number): number {
  return depth > 0 ? Math.round(AETHER.base * Math.pow(AETHER.growth, depth)) : 0;
}


export type AfflictionRule =
  | 'bulwark' | 'frenzy' | 'tyrant' | 'horde' | 'veiled' | 'sanguine' | 'grievous' | 'sapping' | 'withering' | 'bolster' | 'warband' | 'juggernaut';

export interface AfflictionDef {
  id: AfflictionRule;
  name: string;
  icon: string;
  desc: string;
}

/** What a depth can throw at a run on top of its numbers. Each is sized like one Ascension rule. */
export const AFFLICTIONS: AfflictionDef[] = [
  { id: 'bulwark', name: 'Bulwark', icon: '🛡️', desc: 'Every enemy except bosses gains +4 armor.' },
  { id: 'frenzy', name: 'Frenzy', icon: '💨', desc: 'Enemies move 12% faster.' },
  { id: 'tyrant', name: 'Tyrant', icon: '👑', desc: 'Bosses have 50% more health.' },
  { id: 'horde', name: 'Horde', icon: '🐜', desc: 'Squads arrive 20% more often.' },
  { id: 'veiled', name: 'Veiled', icon: '🎭', desc: 'Another 15% of ordinary enemies carry elite traits.' },
  { id: 'sanguine', name: 'Sanguine', icon: '🩸', desc: 'Every elite regenerates.' },
  { id: 'grievous', name: 'Grievous', icon: '🗡️', desc: 'Breaches hit the line 30% harder.' },
  { id: 'sapping', name: 'Sapping', icon: '🔋', desc: 'Surge charges 30% slower.' },
  { id: 'withering', name: 'Withering', icon: '🥀', desc: 'Healing and line regeneration are halved.' },
  { id: 'bolster', name: 'Bolster', icon: '💪', desc: 'When an enemy falls, enemies near it gain 8% health, up to five times.' },
  { id: 'warband', name: 'Warband', icon: '⚔️', desc: 'Elites carry an extra modifier.' },
  { id: 'juggernaut', name: 'Juggernaut', icon: '🦏', desc: 'Elites and the mini-boss have 60% more health.' },
];
export const AFFLICTION_MAP: Record<string, AfflictionDef> = Object.fromEntries(AFFLICTIONS.map((a) => [a.id, a]));

/** Afflictions at a depth: none at depths 1-2, one more every five depths, at most six. */
export function afflictionCount(depth: number): number {
  return Math.max(0, Math.min(6, Math.floor((depth + 2) / 5)));
}

/**
 * The Afflictions of a depth. They are fixed per band of five depths (the same for every player, so a
 * depth can be studied before it is tried) and drawn afresh each band, so the ladder never settles into one set.
 */
export function descentAfflictions(depth: number): AfflictionRule[] {
  const n = afflictionCount(depth);
  if (n <= 0) return [];
  const band = Math.floor((depth + 2) / 5);
  const ids = AFFLICTIONS.map((a) => a.id);
  new Rng(0x5eed + band * 7919).shuffle(ids);
  return ids.slice(0, n);
}

// ---------------------------------------------------------------- constellations
export type StarCurrency = 'aether' | 'cores' | 'research';

export interface StarDef {
  id: string;
  name: string;
  icon: string;
  currency: StarCurrency;
  desc: (level: number) => string;
  cost: (level: number) => number;
  mods: (level: number) => Modifier[];
  /** What one level does, shown beside the level: `×1.03`, `+4%`. */
  step: string;
}

const pct = (v: number) => {
  const p = v * 100;
  return p >= 1000 ? Math.round(p).toLocaleString('en-US') : p >= 100 ? Math.round(p).toString() : (Math.round(p * 10) / 10).toString();
};
const curve = (base: number, growth: number) => (lvl: number) => Math.max(1, Math.round(base * Math.pow(growth, lvl)));
/** Compounding factor of a star line at a level. */
export const compound = (per: number, level: number): number => Math.pow(1 + per, level);

/** Price growth per level of every compounding line (Fortune grows faster). */
export const STAR_GROWTH = 1.085;

/** Per-level step of each compounding line. */
export const STAR_STEP = { might: 0.03, bastion: 0.03, ward: 0.022, ruin: 0.03, fortune: 0.04 };

/**
 * Constellations: endless lines bought after the first Descent win. Might, Bastion and Ward compound
 * (every level multiplies what the line already gives), Ruin compounds damage to elites and bosses and
 * is bought with Cores, and Fortune adds Aether and is bought with Research, so every currency keeps a use.
 */
export const STARS: StarDef[] = [
  { id: 'might', name: 'Might', icon: '✴️', currency: 'aether',
    desc: (l) => `+${pct(compound(STAR_STEP.might, l) - 1)}% damage`,
    cost: curve(10, STAR_GROWTH), mods: (l) => [{ stat: 'damage', mult: compound(STAR_STEP.might, l) - 1 }], step: `×${1 + STAR_STEP.might}` },
  { id: 'bastion', name: 'Bastion', icon: '🏰', currency: 'aether',
    desc: (l) => `+${pct(compound(STAR_STEP.bastion, l) - 1)}% max HP`,
    cost: curve(8, STAR_GROWTH), mods: (l) => [{ stat: 'maxHp', mult: compound(STAR_STEP.bastion, l) - 1 }], step: `×${1 + STAR_STEP.bastion}` },
  { id: 'ward', name: 'Ward', icon: '🌀', currency: 'aether',
    desc: (l) => `−${pct(1 - Math.pow(1 - STAR_STEP.ward, l))}% damage taken on the line`,
    cost: curve(8, STAR_GROWTH), mods: (l) => [{ stat: 'damageTaken', mult: Math.pow(1 - STAR_STEP.ward, l) - 1 }], step: `×${1 - STAR_STEP.ward}` },
  { id: 'ruin', name: 'Ruin', icon: '☄️', currency: 'cores',
    desc: (l) => `+${pct(compound(STAR_STEP.ruin, l) - 1)}% damage to elites and bosses`,
    cost: curve(25, 1.07), mods: (l) => [{ stat: 'ruin', mult: compound(STAR_STEP.ruin, l) - 1 }], step: `×${1 + STAR_STEP.ruin}` },
  { id: 'fortune', name: 'Fortune', icon: '🌠', currency: 'research',
    desc: (l) => `+${pct(l * STAR_STEP.fortune)}% Aether from every run`,
    cost: curve(8, 1.12), mods: () => [], step: `+${STAR_STEP.fortune * 100}%` },
];
export const STAR_MAP: Record<string, StarDef> = Object.fromEntries(STARS.map((s) => [s.id, s]));

/** Every modifier the profile's Constellations add to a run. */
export function starModifiers(stars: Record<string, number> | undefined): Modifier[] {
  const out: Modifier[] = [];
  for (const s of STARS) {
    const l = Math.max(0, Math.floor(stars?.[s.id] ?? 0));
    if (l > 0) out.push(...s.mods(l));
  }
  return out;
}

/** Aether multiplier from Fortune. */
export function fortuneMult(stars: Record<string, number> | undefined): number {
  return 1 + STAR_STEP.fortune * Math.max(0, Math.floor(stars?.fortune ?? 0));
}

/** Depth records that pay a reward the first time they are cleared. */
export const DEPTH_MILESTONES: { depth: number; cores: number; research: number; trail?: string }[] = [
  { depth: 5, cores: 20, research: 5 },
  { depth: 10, cores: 40, research: 10, trail: 'fathom' },
  { depth: 20, cores: 80, research: 20 },
  { depth: 30, cores: 120, research: 30, trail: 'starborn' },
  { depth: 50, cores: 200, research: 50, trail: 'infinite' },
  { depth: 75, cores: 300, research: 75 },
  { depth: 100, cores: 500, research: 100 },
];

localize('affliction', AFFLICTIONS, ['name', 'desc']);
localize('star', STARS, ['name', 'desc']);
