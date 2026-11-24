import { localize } from '../i18n/content';
import type { Modifier } from '../sim/stats';
import type { AfflictionRule } from './descent';

/**
 * The Rifts: ten handcrafted trials beyond Eternity, opened one after another. Each is an Eternity run
 * carrying a fixed Descent-depth worth of pressure (`power`), its own Risk Pacts and Afflictions, and ends
 * with its Rift Lords, apex bosses with a short Boss Fury. The first clear of each Rift grants a Sigil,
 * a permanent power that every later run carries; the last Rift is the summit of the game.
 */
export interface RiftDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** Pressure as a Descent depth: enemy and boss health and line damage (see `DESCENT`). */
  power: number;
  /** Risk Pacts the Rift imposes (their rules only: Rifts pay through Aether and Sigils, not the pact bonus). */
  pacts: string[];
  afflictions: AfflictionRule[];
  /** Apex bosses that close the run after the tier's regular boss. */
  lords: string[];
  /** Seconds before Boss Fury for the regular boss; Rift Lords get `FURY.apex` times as long. */
  fury: number;
  /** The Sigil the first clear grants. */
  sigil: string;
  /** First-clear Cores and Research. */
  cores: number;
  research: number;
}

export const RIFTS: RiftDef[] = [
  { id: 'frayed', name: 'The Frayed Rift', icon: '🌀', desc: 'Where Eternity starts to come apart. Enemies rush in faster and thicker.',
    power: 12, pacts: [], afflictions: ['frenzy', 'horde'], lords: ['colossus'], fury: 95, sigil: 'patience', cores: 40, research: 10 },
  { id: 'iron', name: 'The Iron Rift', icon: '🛡️', desc: 'Everything here is armored. Raw hits glance off.',
    power: 22, pacts: ['ironclad'], afflictions: ['bulwark', 'juggernaut'], lords: ['overmind'], fury: 95, sigil: 'breaking', cores: 50, research: 12 },
  { id: 'silent', name: 'The Silent Rift', icon: '🔇', desc: 'No Resonance, no rerolls, a slow Surge: only the build you draft.',
    power: 32, pacts: ['eclipse', 'no_reroll'], afflictions: ['sapping'], lords: ['twins'], fury: 90, sigil: 'insight', cores: 60, research: 14 },
  { id: 'lone', name: 'The Lone Star', icon: '⭐', desc: 'One ball against the dark. Make every flight count.',
    power: 44, pacts: ['lone_ball'], afflictions: ['tyrant'], lords: ['sovereign'], fury: 90, sigil: 'breadth', cores: 70, research: 16 },
  { id: 'bloodless', name: 'The Bloodless Rift', icon: '🩸', desc: 'Half a line, and nothing mends it.',
    power: 56, pacts: ['no_heal', 'fragile'], afflictions: ['grievous', 'withering'], lords: ['colossus', 'overmind'], fury: 85, sigil: 'bulwark', cores: 80, research: 18 },
  { id: 'kings', name: 'The Rift of Kings', icon: '👑', desc: 'Elites everywhere, and every one a warlord.',
    power: 70, pacts: ['warlords', 'elite_surge'], afflictions: ['warband', 'sanguine'], lords: ['twins', 'sovereign'], fury: 85, sigil: 'spoils', cores: 90, research: 20 },
  { id: 'teeming', name: 'The Teeming Rift', icon: '🐜', desc: 'An endless tide that grows stronger with every enemy that falls.',
    power: 85, pacts: ['tide', 'short_fuse'], afflictions: ['horde', 'bolster', 'veiled'], lords: ['overmind', 'twins'], fury: 80, sigil: 'plenty', cores: 100, research: 22 },
  { id: 'narrow', name: 'The Narrow Rift', icon: '🎴', desc: 'Fewer cards, no relics, no second chances at the draft.',
    power: 100, pacts: ['narrow_fate', 'relicless', 'no_reroll'], afflictions: ['juggernaut', 'tyrant'], lords: ['sovereign', 'colossus'], fury: 80, sigil: 'hoard', cores: 120, research: 25 },
  { id: 'shattered', name: 'The Shattered Rift', icon: '💔', desc: 'A brittle line against a fast, armored, swollen horde.',
    power: 108, pacts: ['fragile', 'haste', 'fortified'], afflictions: ['frenzy', 'grievous', 'bulwark'], lords: ['colossus', 'overmind', 'twins'], fury: 75, sigil: 'firmament', cores: 150, research: 30 },
  { id: 'heart', name: 'The Heart of the Void', icon: '🕳️', desc: 'The bottom of everything. Every apex boss, every curse, no mercy.',
    power: 130, pacts: ['eclipse', 'warlords', 'tide'], afflictions: ['frenzy', 'tyrant', 'sanguine', 'bolster', 'juggernaut', 'warband'], lords: ['colossus', 'overmind', 'twins', 'sovereign'], fury: 75, sigil: 'void', cores: 250, research: 50 },
];
export const RIFT_MAP: Record<string, RiftDef> = Object.fromEntries(RIFTS.map((r) => [r.id, r]));

/** A Rift by its 1-based number, or undefined. */
export function riftAt(n: number | undefined): RiftDef | undefined {
  return n && n >= 1 ? RIFTS[Math.floor(n) - 1] : undefined;
}

// ---------------------------------------------------------------- sigils
export interface SigilDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  mods?: Modifier[];
  /** Seconds added before Boss Fury. */
  fury?: number;
  /** Extra different upgrades a build may hold. */
  slots?: number;
  rerolls?: number;
  banishes?: number;
  /** Free upgrade choices at the start of every run. */
  picks?: number;
  /** Legendary relic choices at the start of every run. */
  relics?: number;
  /** Extra levels of Extra Ball. */
  balls?: number;
  /** Added to the per-level step of every compounding Constellation line. */
  starStep?: number;
  /** Aether multiplier bonus. */
  aether?: number;
}

export const SIGILS: SigilDef[] = [
  { id: 'patience', name: 'Sigil of Patience', icon: '⏳', desc: 'Boss Fury begins 15 seconds later.', fury: 15 },
  { id: 'breaking', name: 'Sigil of Breaking', icon: '🔨', desc: '+30% damage to elites and bosses. Hits ignore 5 armor.',
    mods: [{ stat: 'eliteDamage', add: 0.3 }, { stat: 'armorPen', add: 5 }] },
  { id: 'insight', name: 'Sigil of Insight', icon: '👁️', desc: '+2 rerolls and +1 banish every run.', rerolls: 2, banishes: 1 },
  { id: 'breadth', name: 'Sigil of Breadth', icon: '🧩', desc: 'A build can hold 11 different upgrades instead of 10.', slots: 1 },
  { id: 'bulwark', name: 'Sigil of the Bulwark', icon: '🏰', desc: '+30% max HP. 10% less damage taken on the line.',
    mods: [{ stat: 'maxHp', mult: 0.3 }, { stat: 'damageTaken', mult: -0.1 }] },
  { id: 'spoils', name: 'Sigil of Spoils', icon: '🎁', desc: 'Begin every run with one more free upgrade choice.', picks: 1 },
  { id: 'plenty', name: 'Sigil of Plenty', icon: '💰', desc: '+50% Aether and +25% coins.', aether: 0.5, mods: [{ stat: 'coinGain', mult: 0.25 }] },
  { id: 'hoard', name: 'Sigil of the Hoard', icon: '🏺', desc: 'Begin every run with a legendary relic choice.', relics: 1 },
  { id: 'firmament', name: 'Sigil of the Firmament', icon: '🌌', desc: 'Might, Bastion, Ward and Ruin each step 0.5% further per level.', starStep: 0.005 },
  { id: 'void', name: 'Sigil of the Void', icon: '🕳️', desc: 'Extra Ball can be taken once more. +25% damage.', balls: 1, mods: [{ stat: 'damage', mult: 0.25 }] },
];
export const SIGIL_MAP: Record<string, SigilDef> = Object.fromEntries(SIGILS.map((s) => [s.id, s]));

/** The Sigils a profile holds after clearing its first `cleared` Rifts. */
export function sigilsFor(cleared: number): string[] {
  return RIFTS.slice(0, Math.max(0, Math.min(RIFTS.length, Math.floor(cleared)))).map((r) => r.sigil);
}

/** Every Sigil effect added up. */
export function sigilTotals(ids: readonly string[] | undefined): Required<Omit<SigilDef, 'id' | 'name' | 'icon' | 'desc'>> {
  const out = { mods: [] as Modifier[], fury: 0, slots: 0, rerolls: 0, banishes: 0, picks: 0, relics: 0, balls: 0, starStep: 0, aether: 0 };
  for (const id of ids ?? []) {
    const s = SIGIL_MAP[id];
    if (!s) continue;
    if (s.mods) out.mods.push(...s.mods);
    out.fury += s.fury ?? 0;
    out.slots += s.slots ?? 0;
    out.rerolls += s.rerolls ?? 0;
    out.banishes += s.banishes ?? 0;
    out.picks += s.picks ?? 0;
    out.relics += s.relics ?? 0;
    out.balls += s.balls ?? 0;
    out.starStep += s.starStep ?? 0;
    out.aether += s.aether ?? 0;
  }
  return out;
}

localize('rift', RIFTS, ['name', 'desc']);
localize('sigil', SIGILS, ['name', 'desc']);
