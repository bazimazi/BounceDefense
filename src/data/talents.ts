import { t as i18n } from '../i18n';
import { localize } from '../i18n/content';
import type { Modifier } from '../sim/stats';
import { DIFFICULTIES } from './arenas';

export type TalentTree = 'kinetics' | 'conduit' | 'warden' | 'havoc';
export type TalentRanks = Record<string, number>;
export const TALENT_POINT_CAP = 100;
/** Mastery XP for each of the first twenty points; later points grow steadily dearer. */
export const TALENT_XP_PER_POINT = 500;
export const TALENT_EARLY_POINTS = 20;
/** Mastery XP needed to earn talent point `point` (the 4th point onwards; three are free). */
export const talentPointCost = (point: number): number =>
  point <= TALENT_EARLY_POINTS ? TALENT_XP_PER_POINT : 700 + 100 * (point - TALENT_EARLY_POINTS);
export const TALENT_TREES: { id: TalentTree; name: string; icon: string; color: string; desc: string }[] = [
  { id: 'kinetics', name: 'Kinetics', icon: '↗', color: '#ffbf69', desc: 'Master the angle. Turn ricochets into momentum.' },
  { id: 'conduit', name: 'Conduit', icon: '✧', color: '#c49bff', desc: 'Amplify the elements your run build unlocks.' },
  { id: 'warden', name: 'Warden', icon: '⬡', color: '#7be0cb', desc: 'Hold the line. Stay dangerous under pressure.' },
  { id: 'havoc', name: 'Havoc', icon: '✸', color: '#ff8a6b', desc: 'Blasts, swarms and sharp edges: make every hit spill over.' },
];

export interface TalentDef {
  id: string;
  tree: TalentTree;
  name: string;
  icon: string;
  tier: number;
  maxRank: number;
  /** Spend this many points in earlier tiers of this tree. */
  gate: number;
  requires?: string;
  /** Deep tiers also need a win on this difficulty index. */
  minWin?: number;
  /** Drawn as a round capstone node. */
  capstone?: boolean;
  desc: (rank: number) => string;
  mods?: (rank: number) => Modifier[];
  behavior?: string;
}

// These are amplifiers, never upgrade levels, recipe ingredients, or proc unlocks.
export const TALENTS: TalentDef[] = [
  { id: 'bankcraft', tree: 'kinetics', name: 'Bankcraft', icon: '↗', tier: 0, maxRank: 3, gate: 0,
    desc: r => `+${r * 1.5}% hit damage per wall bounce (up to 10 bounces).`, mods: r => [{ stat: 'bounceDamage', add: r * 0.015 }] },
  { id: 'flow', tree: 'kinetics', name: 'Flow State', icon: '∞', tier: 0, maxRank: 3, gate: 0,
    desc: r => `Combo lasts ${(r * 0.2).toFixed(1)} seconds longer between hits.`, mods: r => [{ stat: 'comboWindow', add: r * 0.2 }] },
  { id: 'precision', tree: 'kinetics', name: 'Calculated Angle', icon: '⌖', tier: 1, maxRank: 2, gate: 3, requires: 'bankcraft',
    desc: r => `+${r * 4}% critical chance after a wall bounce.`, mods: r => [{ stat: 'bankCrit', add: r * 0.04 }] },
  { id: 'inertia', tree: 'kinetics', name: 'Inertia', icon: '»', tier: 1, maxRank: 2, gate: 3, requires: 'flow',
    desc: r => `Gain ${r * 10}% more momentum from enemy hits.`, mods: r => [{ stat: 'momentumGain', mult: r * 0.1 }] },
  { id: 'banked_power', capstone: true, tree: 'kinetics', name: 'Banked Power', icon: 'ϟ', tier: 2, maxRank: 1, gate: 8, requires: 'precision',
    desc: () => 'Main-ball wall bounces grant +4 Surge charge. Shared 2-second cooldown; inactive during Surge.', behavior: 'talent_banked_power' },
  { id: 'embers', tree: 'conduit', name: 'Deep Embers', icon: '♨', tier: 0, maxRank: 3, gate: 0,
    desc: r => `Burns you apply deal ${r * 8}% more damage. Requires a burn source.`, mods: r => [{ stat: 'burnPower', mult: r * 0.08 }] },
  { id: 'voltage', tree: 'conduit', name: 'High Voltage', icon: 'ϟ', tier: 0, maxRank: 3, gate: 0,
    desc: r => `Your chain lightning deals ${r * 6}% more damage. Requires a lightning source.`, mods: r => [{ stat: 'chainDamage', mult: r * 0.06 }] },
  { id: 'catalyst', tree: 'conduit', name: 'Catalyst', icon: '✦', tier: 1, maxRank: 2, gate: 3, requires: 'embers',
    desc: r => `+${r * 6}% elemental power for burns, bleeds and lightning. Grants no new effects.`, mods: r => [{ stat: 'elementPower', mult: r * 0.06 }] },
  { id: 'brittle', tree: 'conduit', name: 'Brittle Matrix', icon: '❄', tier: 1, maxRank: 2, gate: 3, requires: 'voltage',
    desc: r => `Frozen enemies take an additional ${r * 10}% damage. Requires a freeze source.`, mods: r => [{ stat: 'frozenVuln', add: r * 0.1 }] },
  { id: 'convergence', capstone: true, tree: 'conduit', name: 'Convergence', icon: '✺', tier: 2, maxRank: 1, gate: 8, requires: 'catalyst',
    desc: () => 'Direct ball hits deal +8% damage per active burn, chill/freeze and bleed on the target (max +24%). Secondary effects do not inherit this bonus.' },
  { id: 'hull', tree: 'warden', name: 'Reinforced Hull', icon: '⬡', tier: 0, maxRank: 3, gate: 0,
    desc: r => `+${r * 4}% maximum HP. Glass Heart still halves your total HP.`, mods: r => [{ stat: 'maxHp', mult: r * 0.04 }] },
  { id: 'plating', tree: 'warden', name: 'Layered Plating', icon: '▣', tier: 0, maxRank: 3, gate: 0,
    desc: r => `+${r} armor against damage to the defense line.`, mods: r => [{ stat: 'armor', add: r }] },
  { id: 'recovery', tree: 'warden', name: 'Field Repairs', icon: '+', tier: 1, maxRank: 2, gate: 3, requires: 'hull',
    desc: r => `Restore ${r * 0.3} HP per second. Disabled by Bloodless.`, mods: r => [{ stat: 'regen', add: r * 0.3 }] },
  { id: 'repulsion', tree: 'warden', name: 'Repulsor', icon: '⇈', tier: 1, maxRank: 2, gate: 3, requires: 'plating',
    desc: r => `+${r * 15}% knockback on direct hits against non-boss enemies.`, mods: r => [{ stat: 'knockback', mult: r * 0.15 }] },
  { id: 'last_bastion', capstone: true, tree: 'warden', name: 'Last Bastion', icon: '♜', tier: 2, maxRank: 1, gate: 8, requires: 'recovery',
    desc: () => 'While already at or below 35% HP, take 25% less damage after armor. Does not prevent lethal hits or restore HP.' },
  { id: 'blasting', tree: 'havoc', name: 'Blasting Caps', icon: '✸', tier: 0, maxRank: 3, gate: 0,
    desc: r => `Your explosions deal ${r * 6}% more damage. Requires an explosion source.`, mods: r => [{ stat: 'explosionDamage', mult: r * 0.06 }] },
  { id: 'keen', tree: 'havoc', name: 'Keen Edge', icon: '◆', tier: 0, maxRank: 3, gate: 0,
    desc: r => `+${r * 8}% critical damage.`, mods: r => [{ stat: 'critMult', add: r * 0.08 }] },
  { id: 'shrapnel', tree: 'havoc', name: 'Shrapnel', icon: '❋', tier: 1, maxRank: 2, gate: 3, requires: 'blasting',
    desc: r => `Your explosions reach ${r * 6}% wider.`, mods: r => [{ stat: 'area', mult: r * 0.06 }] },
  { id: 'swarmcraft', tree: 'havoc', name: 'Swarmcraft', icon: '⁂', tier: 1, maxRank: 2, gate: 3, requires: 'keen',
    desc: r => `Shards and clones deal ${r * 6}% more damage. Requires a shard or clone source.`, mods: r => [{ stat: 'shardPower', add: r * 0.06 }] },
  { id: 'cascade', capstone: true, tree: 'havoc', name: 'Cascade', icon: '✺', tier: 2, maxRank: 1, gate: 8, requires: 'shrapnel',
    desc: () => 'Every 25th kill sends a shockwave from the fallen enemy (110% damage). Shockwaves cannot trigger it.', behavior: 'talent_cascade' },
  // ---- Deep tiers: more points in the tree, and wins on Abyss (tier 3), Singularity (tier 4) and Eternity (tier 5).
  { id: 'ricochet_engine', tree: 'kinetics', name: 'Ricochet Engine', icon: '⟳', tier: 2, maxRank: 2, gate: 8, requires: 'inertia',
    desc: r => `Balls gain ${r * 3}% speed with every wall bounce until they reach the floor.`, mods: r => [{ stat: 'wallAccel', add: r * 0.03 }] },
  { id: 'long_shot', tree: 'kinetics', name: 'Long Shot', icon: '➶', tier: 3, maxRank: 3, gate: 11, requires: 'banked_power', minWin: 4,
    desc: r => `+${r * 6}% damage to enemies in the upper half of the arena.`, mods: r => [{ stat: 'farDamage', add: r * 0.06 }] },
  { id: 'momentum_core', tree: 'kinetics', name: 'Momentum Core', icon: '◎', tier: 3, maxRank: 3, gate: 11, requires: 'ricochet_engine', minWin: 4,
    desc: r => `Balls launch with ${r * 2} momentum and build it ${r * 5}% faster.`, mods: r => [{ stat: 'momentumStart', add: r * 2 }, { stat: 'momentumGain', mult: r * 0.05 }] },
  { id: 'hypervelocity', tree: 'kinetics', name: 'Hypervelocity', icon: '⇶', tier: 4, maxRank: 5, gate: 16, requires: 'long_shot', minWin: 7,
    desc: r => `+${r}% more hit damage per wall bounce (up to 10 bounces).`, mods: r => [{ stat: 'bounceDamage', add: r * 0.01 }] },
  { id: 'deadeye', tree: 'kinetics', name: 'Deadeye', icon: '✛', tier: 4, maxRank: 5, gate: 16, requires: 'momentum_core', minWin: 7,
    desc: r => `+${(r * 1.5).toFixed(1)}% critical chance and +${r * 4}% critical damage.`, mods: r => [{ stat: 'critChance', add: r * 0.015 }, { stat: 'critMult', add: r * 0.04 }] },
  { id: 'perpetual_motion', tree: 'kinetics', capstone: true, name: 'Perpetual Motion', icon: '∞', tier: 5, maxRank: 1, gate: 26, requires: 'hypervelocity', minWin: 9,
    desc: () => 'Every 5th wall bounce of a main ball throws off a shard at full power. Shards cannot trigger it.', behavior: 'talent_perpetual' },

  { id: 'overload_core', tree: 'conduit', name: 'Overload', icon: 'ϟ', tier: 2, maxRank: 2, gate: 8, requires: 'brittle',
    desc: r => `Your chain lightning jumps ${r} more time${r > 1 ? 's' : ''}. Requires a lightning source.`, mods: r => [{ stat: 'chainCount', add: r }] },
  { id: 'venom_lore', tree: 'conduit', name: 'Venom Lore', icon: '☣', tier: 3, maxRank: 3, gate: 11, requires: 'convergence', minWin: 4,
    desc: r => `Poison deals ${r * 8}% more damage and stacks ${r * 2} higher. Requires a poison source.`, mods: r => [{ stat: 'poisonPower', mult: r * 0.08 }, { stat: 'poisonCap', add: r * 2 }] },
  { id: 'permafrost', tree: 'conduit', name: 'Permafrost', icon: '❅', tier: 3, maxRank: 3, gate: 11, requires: 'overload_core', minWin: 4,
    desc: r => `Freezes last ${r * 15}% longer and frozen enemies take ${r * 5}% more damage. Requires a freeze source.`, mods: r => [{ stat: 'freezeDuration', mult: r * 0.15 }, { stat: 'frozenVuln', add: r * 0.05 }] },
  { id: 'supremacy', tree: 'conduit', name: 'Elemental Supremacy', icon: '✷', tier: 4, maxRank: 5, gate: 16, requires: 'venom_lore', minWin: 7,
    desc: r => `+${r * 5}% elemental power. Grants no new effects.`, mods: r => [{ stat: 'elementPower', mult: r * 0.05 }] },
  { id: 'hemorrhage', tree: 'conduit', name: 'Hemorrhage', icon: '♦', tier: 4, maxRank: 5, gate: 16, requires: 'permafrost', minWin: 7,
    desc: r => `Bleeding enemies take ${r * 4}% more hit damage, and bleeds stack ${r} higher. Requires a bleed source.`, mods: r => [{ stat: 'bleedVuln', add: r * 0.04 }, { stat: 'bleedCap', add: r }] },
  { id: 'elemental_storm', tree: 'conduit', capstone: true, name: 'Elemental Storm', icon: '❂', tier: 5, maxRank: 1, gate: 26, requires: 'supremacy', minWin: 9,
    desc: () => 'Enemies that die carrying two or more of burn, chill or freeze, bleed and poison burst for 120% damage (scaled by elemental power).', behavior: 'talent_storm' },

  { id: 'bulwark', tree: 'warden', name: 'Bulwark', icon: '⬢', tier: 2, maxRank: 2, gate: 8, requires: 'repulsion',
    desc: r => `The defense line takes ${r * 4}% less damage.`, mods: r => [{ stat: 'damageTaken', mult: -r * 0.04 }] },
  { id: 'fortitude', tree: 'warden', name: 'Fortitude', icon: '⛨', tier: 3, maxRank: 3, gate: 11, requires: 'last_bastion', minWin: 4,
    desc: r => `+${r * 5}% maximum HP.`, mods: r => [{ stat: 'maxHp', mult: r * 0.05 }] },
  { id: 'aegis_field', tree: 'warden', name: 'Aegis Field', icon: '◈', tier: 3, maxRank: 3, gate: 11, requires: 'bulwark', minWin: 4,
    desc: r => `+${r * 2} armor against damage to the defense line.`, mods: r => [{ stat: 'armor', add: r * 2 }] },
  { id: 'regenerator', tree: 'warden', name: 'Regenerator', icon: '✚', tier: 4, maxRank: 5, gate: 16, requires: 'fortitude', minWin: 7,
    desc: r => `All healing is ${r * 15}% stronger and the line restores ${(r * 0.1).toFixed(1)} HP per second. Disabled by Bloodless.`, mods: r => [{ stat: 'healMult', mult: r * 0.15 }, { stat: 'regen', add: r * 0.1 }] },
  { id: 'iron_will', tree: 'warden', name: 'Iron Will', icon: '▲', tier: 4, maxRank: 5, gate: 16, requires: 'aegis_field', minWin: 7,
    desc: r => `The defense line takes ${r * 2}% less damage.`, mods: r => [{ stat: 'damageTaken', mult: -r * 0.02 }] },
  { id: 'unbreakable', tree: 'warden', capstone: true, name: 'Unbreakable', icon: '♛', tier: 5, maxRank: 1, gate: 26, requires: 'regenerator', minWin: 9,
    desc: () => 'Once per run, a hit that would break the line leaves it at 1 HP instead, and the line ignores all damage for 4 seconds.' },

  { id: 'sunder', tree: 'havoc', name: 'Sunder', icon: '⚒', tier: 2, maxRank: 2, gate: 8, requires: 'swarmcraft',
    desc: r => `+${r * 6}% damage to elites and bosses.`, mods: r => [{ stat: 'eliteDamage', add: r * 0.06 }] },
  { id: 'demolisher', tree: 'havoc', name: 'Demolisher', icon: '✹', tier: 3, maxRank: 3, gate: 11, requires: 'cascade', minWin: 4,
    desc: r => `Your explosions deal ${r * 8}% more damage and reach ${r * 4}% wider. Requires an explosion source.`, mods: r => [{ stat: 'explosionDamage', mult: r * 0.08 }, { stat: 'area', mult: r * 0.04 }] },
  { id: 'bladestorm', tree: 'havoc', name: 'Bladestorm', icon: '✧', tier: 3, maxRank: 3, gate: 11, requires: 'sunder', minWin: 4,
    desc: r => `Shards and clones deal ${r * 5}% more damage. Requires a shard or clone source.`, mods: r => [{ stat: 'shardPower', add: r * 0.05 }] },
  { id: 'carnage', tree: 'havoc', name: 'Carnage', icon: '☠', tier: 4, maxRank: 5, gate: 16, requires: 'demolisher', minWin: 7,
    desc: r => `+${r * 3}% damage.`, mods: r => [{ stat: 'damage', mult: r * 0.03 }] },
  { id: 'critical_mass', tree: 'havoc', name: 'Critical Mass', icon: '✦', tier: 4, maxRank: 5, gate: 16, requires: 'bladestorm', minWin: 7,
    desc: r => `+${r}% critical chance and +${r * 5}% critical damage.`, mods: r => [{ stat: 'critChance', add: r * 0.01 }, { stat: 'critMult', add: r * 0.05 }] },
  { id: 'armageddon', tree: 'havoc', capstone: true, name: 'Armageddon', icon: '☄', tier: 5, maxRank: 1, gate: 26, requires: 'carnage', minWin: 9,
    desc: () => 'Every 15th kill calls a meteor down on the densest group of enemies (250% damage).', behavior: 'talent_armageddon' },
];
export const TALENT_MAP: Record<string, TalentDef> = Object.fromEntries(TALENTS.map(t => [t.id, t]));

export function talentSpent(ranks: TalentRanks, tree?: TalentTree): number {
  return TALENTS.reduce((sum, t) => sum + (!tree || t.tree === tree ? ranks[t.id] ?? 0 : 0), 0);
}

/** Why a talent cannot take a rank yet, or null. `won` is the hardest difficulty index won (deep tiers need wins). */
export function talentRequirement(ranks: TalentRanks, t: TalentDef, won = Infinity): string | null {
  const lower = TALENTS.filter(n => n.tree === t.tree && n.tier < t.tier).reduce((sum, n) => sum + (ranks[n.id] ?? 0), 0);
  if (t.minWin !== undefined && won < t.minWin) return i18n('talents.requiresWin', { name: DIFFICULTIES[t.minWin]?.name ?? '' });
  if (t.requires && (ranks[t.requires] ?? 0) < TALENT_MAP[t.requires].maxRank) return i18n('talents.requiresMax', { name: TALENT_MAP[t.requires].name });
  if (lower < t.gate) return i18n('talents.requiresPoints', { gate: t.gate, lower });
  return null;
}

/** Accept only known integer ranks with satisfied prerequisites and a bounded budget. */
export function normalizeTalents(raw: unknown, budget = TALENT_POINT_CAP, won = Infinity): TalentRanks {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const out: TalentRanks = {};
  let remaining = Number.isFinite(budget) ? Math.max(0, Math.min(TALENT_POINT_CAP, Math.floor(budget))) : 0;
  for (const t of TALENTS) {
    const value = source[t.id];
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || talentRequirement(out, t, won)) continue;
    const rank = Math.min(t.maxRank, value, remaining);
    if (rank > 0) out[t.id] = rank;
    remaining -= rank;
  }
  return out;
}

export function talentModifiers(ranks: TalentRanks): Modifier[] {
  return TALENTS.flatMap(t => ranks[t.id] && t.mods ? t.mods(ranks[t.id]) : []);
}

localize('talentTree', TALENT_TREES, ['name', 'desc']);
localize('talent', TALENTS, ['name', 'desc']);
