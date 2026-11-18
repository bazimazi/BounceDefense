import { localize } from '../i18n/content';
import type { Modifier } from '../sim/stats';

/**
 * Core Awakening: the long-term use for Cores once every core is unlocked. Each core has five
 * ranks bought with Cores; a rank opens every six Mastery levels of that core and only applies to
 * runs with it. Four ranks are shared steps, and the fifth awakens a perk of the core's own.
 */
export const AWAKEN_MAX = 5;
/** Cores price of each rank. */
export const AWAKEN_COST = [10, 20, 35, 55, 80];
/** Mastery level of the core that opens each rank. */
export const AWAKEN_MASTERY = [6, 12, 18, 24, 30];
/** Rerolls granted by the third rank. */
export const AWAKEN_REROLL_RANK = 3;

export interface AwakenStep {
  /** Rank number, 1 to 4: the shared steps every core climbs. */
  id: string;
  desc: string;
  mods: Modifier[];
}

/** Ranks 1 to 4, the same for every core. */
export const AWAKEN_STEPS: AwakenStep[] = [
  { id: 'a1', desc: '+6% damage.', mods: [{ stat: 'damage', mult: 0.06 }] },
  { id: 'a2', desc: '+10% maximum HP.', mods: [{ stat: 'maxHp', mult: 0.1 }] },
  { id: 'a3', desc: '+10% XP and +1 reroll every run.', mods: [{ stat: 'xpGain', mult: 0.1 }] },
  { id: 'a4', desc: '+10% damage to elites and bosses.', mods: [{ stat: 'eliteDamage', add: 0.1 }] },
];

export interface AwakenPerk {
  /** The core this perk belongs to. */
  id: string;
  name: string;
  desc: string;
  mods: Modifier[];
}

/** Rank 5: each core's awakened form sharpens what it already does best. */
export const AWAKEN_PERKS: AwakenPerk[] = [
  { id: 'striker', name: 'True Aim', desc: '+10% crit chance after a wall bounce and +20% critical damage.', mods: [{ stat: 'bankCrit', add: 0.1 }, { stat: 'critMult', add: 0.2 }] },
  { id: 'pyro', name: 'Wildfire Heart', desc: '+10% burn chance and +25% burn damage.', mods: [{ stat: 'burnChance', add: 0.1 }, { stat: 'burnPower', mult: 0.25 }] },
  { id: 'tesla', name: 'Living Current', desc: '+1 chain jump and +15% chain damage.', mods: [{ stat: 'chainCount', add: 1 }, { stat: 'chainDamage', mult: 0.15 }] },
  { id: 'cryo', name: 'Absolute Zero', desc: 'Freezes last 25% longer and frozen enemies take +15% more damage.', mods: [{ stat: 'freezeDuration', mult: 0.25 }, { stat: 'frozenVuln', add: 0.15 }] },
  { id: 'blood', name: 'Crimson Tide', desc: 'Bleeds deal 25% more damage, with +20 max HP paying back the core\'s hull cost.', mods: [{ stat: 'bleedPower', mult: 0.25 }, { stat: 'maxHp', add: 20 }] },
  { id: 'void', name: 'Event Horizon', desc: 'The core\'s damage cost is gone (+18% damage) and homing grows 15% stronger.', mods: [{ stat: 'damage', mult: 0.18 }, { stat: 'magnetism', add: 0.045 }] },
  { id: 'venom', name: 'Blight Bloom', desc: 'Poison stacks 3 higher and deals 20% more damage.', mods: [{ stat: 'poisonCap', add: 3 }, { stat: 'poisonPower', mult: 0.2 }] },
  { id: 'titan', name: 'Unstoppable', desc: 'The core\'s speed cost is gone (+18% ball speed), with +25% knockback.', mods: [{ stat: 'speed', mult: 0.18 }, { stat: 'knockback', mult: 0.25 }] },
  { id: 'gemini', name: 'Binary Star', desc: 'Twins, shards and clones hit 15% harder, and the core\'s damage cost is gone (+11% damage).', mods: [{ stat: 'shardPower', add: 0.15 }, { stat: 'damage', mult: 0.11 }] },
  { id: 'blast', name: 'Supernova', desc: '+10% explosion chance and +25% explosion damage.', mods: [{ stat: 'explosionChance', add: 0.1 }, { stat: 'explosionDamage', mult: 0.25 }] },
  { id: 'chrono', name: 'Timeless', desc: 'Surge lasts 1.5 seconds longer and charges 15% faster.', mods: [{ stat: 'surgeDuration', add: 1.5 }, { stat: 'surgeGain', mult: 0.15 }] },
];
export const AWAKEN_PERK_MAP: Record<string, AwakenPerk> = Object.fromEntries(AWAKEN_PERKS.map((x) => [x.id, x]));

/** Every modifier a core gains at this Awakening rank. */
export function awakenModifiers(core: string, rank: number): Modifier[] {
  const r = Math.max(0, Math.min(AWAKEN_MAX, Math.floor(rank) || 0));
  const mods = AWAKEN_STEPS.slice(0, Math.min(4, r)).flatMap((s) => s.mods);
  if (r >= AWAKEN_MAX && AWAKEN_PERK_MAP[core]) mods.push(...AWAKEN_PERK_MAP[core].mods);
  return mods;
}

/** What one rank does, in words: a shared step or the core's own perk. */
export function awakenRankText(core: string, rank: number): string {
  if (rank >= AWAKEN_MAX) {
    const perk = AWAKEN_PERK_MAP[core];
    return perk ? `${perk.name}: ${perk.desc}` : '';
  }
  return AWAKEN_STEPS[rank - 1]?.desc ?? '';
}

localize('awakenStep', AWAKEN_STEPS, ['desc']);
localize('awakenPerk', AWAKEN_PERKS, ['name', 'desc']);
