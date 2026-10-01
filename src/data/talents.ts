import type { Modifier } from '../sim/stats';

export type TalentTree = 'kinetics' | 'conduit' | 'warden';
export type TalentRanks = Record<string, number>;
export const TALENT_POINT_CAP = 15;
export const TALENT_XP_PER_POINT = 500;
export const TALENT_TREES: { id: TalentTree; name: string; icon: string; color: string; desc: string }[] = [
  { id: 'kinetics', name: 'Kinetics', icon: '↗', color: '#ffbf69', desc: 'Master the angle. Turn ricochets into momentum.' },
  { id: 'conduit', name: 'Conduit', icon: '✧', color: '#c49bff', desc: 'Amplify the elements your run build unlocks.' },
  { id: 'warden', name: 'Warden', icon: '⬡', color: '#7be0cb', desc: 'Hold the line. Stay dangerous under pressure.' },
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
  { id: 'banked_power', tree: 'kinetics', name: 'Banked Power', icon: 'ϟ', tier: 2, maxRank: 1, gate: 8, requires: 'precision',
    desc: () => 'Main-ball wall bounces grant +4 Surge charge. Shared 2-second cooldown; inactive during Surge.', behavior: 'talent_banked_power' },
  { id: 'embers', tree: 'conduit', name: 'Deep Embers', icon: '♨', tier: 0, maxRank: 3, gate: 0,
    desc: r => `Burns you apply deal ${r * 8}% more damage. Requires a burn source.`, mods: r => [{ stat: 'burnPower', mult: r * 0.08 }] },
  { id: 'voltage', tree: 'conduit', name: 'High Voltage', icon: 'ϟ', tier: 0, maxRank: 3, gate: 0,
    desc: r => `Your chain lightning deals ${r * 6}% more damage. Requires a lightning source.`, mods: r => [{ stat: 'chainDamage', mult: r * 0.06 }] },
  { id: 'catalyst', tree: 'conduit', name: 'Catalyst', icon: '✦', tier: 1, maxRank: 2, gate: 3, requires: 'embers',
    desc: r => `+${r * 6}% elemental power for burns, bleeds and lightning. Grants no new effects.`, mods: r => [{ stat: 'elementPower', mult: r * 0.06 }] },
  { id: 'brittle', tree: 'conduit', name: 'Brittle Matrix', icon: '❄', tier: 1, maxRank: 2, gate: 3, requires: 'voltage',
    desc: r => `Frozen enemies take an additional ${r * 10}% damage. Requires a freeze source.`, mods: r => [{ stat: 'frozenVuln', add: r * 0.1 }] },
  { id: 'convergence', tree: 'conduit', name: 'Convergence', icon: '✺', tier: 2, maxRank: 1, gate: 8, requires: 'catalyst',
    desc: () => 'Direct ball hits deal +8% damage per active burn, chill/freeze and bleed on the target (max +24%). Secondary effects do not inherit this bonus.' },
  { id: 'hull', tree: 'warden', name: 'Reinforced Hull', icon: '⬡', tier: 0, maxRank: 3, gate: 0,
    desc: r => `+${r * 4}% maximum HP. Glass Heart still halves your total HP.`, mods: r => [{ stat: 'maxHp', mult: r * 0.04 }] },
  { id: 'plating', tree: 'warden', name: 'Layered Plating', icon: '▣', tier: 0, maxRank: 3, gate: 0,
    desc: r => `+${r} armor against damage to the defense line.`, mods: r => [{ stat: 'armor', add: r }] },
  { id: 'recovery', tree: 'warden', name: 'Field Repairs', icon: '+', tier: 1, maxRank: 2, gate: 3, requires: 'hull',
    desc: r => `Restore ${r * 0.3} HP per second. Disabled by Bloodless.`, mods: r => [{ stat: 'regen', add: r * 0.3 }] },
  { id: 'repulsion', tree: 'warden', name: 'Repulsor', icon: '⇈', tier: 1, maxRank: 2, gate: 3, requires: 'plating',
    desc: r => `+${r * 15}% knockback on direct hits against non-boss enemies.`, mods: r => [{ stat: 'knockback', mult: r * 0.15 }] },
  { id: 'last_bastion', tree: 'warden', name: 'Last Bastion', icon: '♜', tier: 2, maxRank: 1, gate: 8, requires: 'recovery',
    desc: () => 'While already at or below 35% HP, take 25% less damage after armor. Does not prevent lethal hits or restore HP.' },
];
export const TALENT_MAP: Record<string, TalentDef> = Object.fromEntries(TALENTS.map(t => [t.id, t]));

export function talentSpent(ranks: TalentRanks, tree?: TalentTree): number {
  return TALENTS.reduce((sum, t) => sum + (!tree || t.tree === tree ? ranks[t.id] ?? 0 : 0), 0);
}

export function talentRequirement(ranks: TalentRanks, t: TalentDef): string | null {
  const lower = TALENTS.filter(n => n.tree === t.tree && n.tier < t.tier).reduce((sum, n) => sum + (ranks[n.id] ?? 0), 0);
  if (t.requires && (ranks[t.requires] ?? 0) < TALENT_MAP[t.requires].maxRank) return `Requires ${TALENT_MAP[t.requires].name} at max rank`;
  if (lower < t.gate) return `Requires ${t.gate} points in earlier tiers (${lower}/${t.gate})`;
  return null;
}

/** Accept only known integer ranks with satisfied prerequisites and a bounded budget. */
export function normalizeTalents(raw: unknown, budget = TALENT_POINT_CAP): TalentRanks {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const out: TalentRanks = {};
  let remaining = Number.isFinite(budget) ? Math.max(0, Math.min(TALENT_POINT_CAP, Math.floor(budget))) : 0;
  for (const t of TALENTS) {
    const value = source[t.id];
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || talentRequirement(out, t)) continue;
    const rank = Math.min(t.maxRank, value, remaining);
    if (rank > 0) out[t.id] = rank;
    remaining -= rank;
  }
  return out;
}

export function talentModifiers(ranks: TalentRanks): Modifier[] {
  return TALENTS.flatMap(t => ranks[t.id] && t.mods ? t.mods(ranks[t.id]) : []);
}
