import type { EvolutionDef, ReactionDef, SynergyDef } from './types';

/**
 * Build-level synergies. They activate automatically when requirements are met
 * during a run, and are recorded as discoveries in the codex.
 */
export const SYNERGIES: SynergyDef[] = [
  {
    id: 'burning_explosion', name: 'Burning Explosion', icon: '🔥💥', tier: 'known',
    desc: 'Explosions set everything they touch on fire.',
    hint: 'Fire + Explosion',
    requires: (b) => b.tag('fire') >= 1 && b.tag('explosion') >= 1,
    behavior: 'burning_explosion',
  },
  {
    id: 'critical_mass', name: 'Critical Mass', icon: '🎯💥', tier: 'known',
    desc: 'Critical hits always explode.',
    hint: 'Critical + Explosion',
    requires: (b) => b.tag('crit') >= 2 && b.tag('explosion') >= 1,
    behavior: 'critical_mass',
  },
  {
    id: 'shatter', name: 'Shatter', icon: '🧊💥', tier: 'known',
    desc: 'Hitting a frozen enemy shatters it: triple damage and icy shards chill nearby foes.',
    hint: 'Ice + Heavy Impact',
    requires: (b) => b.tag('ice') >= 1 && b.level('heavy_impact') >= 1,
    behavior: 'shatter',
  },
  {
    id: 'superconductor', name: 'Superconductor', icon: '⚡❄️', tier: 'known',
    desc: 'Lightning always chills, and deals double damage to chilled enemies.',
    hint: 'Lightning + Ice',
    requires: (b) => b.tag('lightning') >= 1 && b.tag('ice') >= 1,
    behavior: 'superconductor',
  },
  {
    id: 'blood_harvest', name: 'Blood Harvest', icon: '🩸🌾', tier: 'known',
    desc: 'Double lifesteal against bleeding enemies. Bleeding kills heal 2 HP.',
    hint: 'Bleed + Vampiric',
    requires: (b) => b.tag('bleed') >= 1 && b.level('vampiric') >= 1,
    behavior: 'blood_harvest',
  },
  {
    id: 'kinetic_strike', name: 'Kinetic Strike', icon: '🚀💥', tier: 'known',
    desc: 'Damage scales with ball speed: +1% per 1% speed above base.',
    hint: 'High Velocity + Heavy Impact',
    requires: (b) => b.tag('kinetic') >= 3 && b.level('heavy_impact') >= 1,
    behavior: 'kinetic_strike',
  },
  {
    id: 'magnetic_chain', name: 'Magnetic Chain', icon: '🧲⚡', tier: 'known',
    desc: 'Chains jump +2 more times and drag struck enemies toward the ball.',
    hint: 'Magnetism + Chain',
    requires: (b) => b.level('magnetism') >= 1 && b.tag('chain') >= 1,
    mods: [{ stat: 'chainCount', add: 2 }],
    behavior: 'magnetic_chain',
  },
  {
    id: 'swarm_protocol', name: 'Swarm Protocol', icon: '🐝', tier: 'hidden',
    desc: 'Shards and clones inherit every elemental effect and deal +30% damage.',
    hint: 'Invest heavily in multiplying your balls…',
    requires: (b) => b.tag('swarm') >= 3,
    mods: [{ stat: 'shardPower', add: 0.3 }],
  },
  {
    id: 'ricochet_storm', name: 'Ricochet Storm', icon: '🌪️', tier: 'hidden',
    desc: 'Every 4th wall bounce fires a spark at the nearest enemy.',
    hint: 'Become a master of walls…',
    requires: (b) => b.tag('ricochet') >= 3,
    behavior: 'ricochet_storm',
  },
  {
    id: 'combo_reactor', name: 'Combo Reactor', icon: '☢️', tier: 'hidden',
    desc: 'While combo is 25+, every ball is at least Overcharged.',
    hint: 'Combos and momentum feed each other…',
    requires: (b) => b.tag('combo') >= 1 && b.tag('momentum') >= 1,
    behavior: 'combo_reactor',
  },
  {
    id: 'hemorrhage', name: 'Hemorrhage', icon: '🗡️🩸', tier: 'hidden',
    desc: 'Critical hits apply 3 Bleed stacks.',
    hint: 'Precise cuts run deep…',
    requires: (b) => b.tag('crit') >= 2 && b.tag('bleed') >= 1,
    behavior: 'hemorrhage',
  },
  {
    id: 'perpetual_motion', name: 'Perpetual Motion', icon: '♾️', tier: 'legendary',
    desc: 'The floor no longer resets momentum. Ball speed +15%.',
    hint: 'Legendary: master ricochet, momentum and speed together.',
    requires: (b) => b.level('ricochet') >= 4 && b.level('flywheel') >= 2 && b.level('velocity') >= 2,
    mods: [{ stat: 'speed', mult: 0.15 }],
    behavior: 'perpetual_motion',
  },
  {
    id: 'elemental_trinity', name: 'Elemental Trinity', icon: '🔺', tier: 'legendary',
    desc: 'Every hit has a 30% chance to apply Fire, Ice and Lightning at once.',
    hint: 'Legendary: deeply invest in all three elements.',
    requires: (b) => b.tag('fire') >= 3 && b.tag('ice') >= 3 && b.tag('lightning') >= 3,
    behavior: 'elemental_trinity',
  },
];

export const SYNERGY_MAP: Record<string, SynergyDef> = Object.fromEntries(SYNERGIES.map((s) => [s.id, s]));

/** Evolutions: a max-level upgrade + a catalyst turns the ball into a different weapon. */
export const EVOLUTIONS: EvolutionDef[] = [
  {
    id: 'inferno', name: 'Inferno Ball', icon: '☄️', color: '#ff6a2a',
    desc: 'Every hit erupts in a fiery blast. Leaves a trail of flame that burns enemies it crosses.',
    recipe: [{ id: 'ignite', level: 5 }, { id: 'volatile', level: 1 }],
    mods: [{ stat: 'burnChance', add: 0.5 }],
    behavior: 'evo_inferno',
  },
  {
    id: 'tesla_storm', name: 'Tesla Storm', icon: '🌩️', color: '#5ee7ff',
    desc: 'The ball becomes a storm core, arcing lightning to nearby enemies several times per second.',
    recipe: [{ id: 'chain_lightning', level: 5 }, { id: 'static_charge', level: 1 }],
    behavior: 'evo_tesla',
  },
  {
    id: 'glacier', name: 'Glacier', icon: '🏔️', color: '#9fdcff',
    desc: 'Wall bounces release a frost nova. Frozen enemies explode into ice shards when killed.',
    recipe: [{ id: 'frostbite', level: 5 }, { id: 'heavy_impact', level: 1 }],
    behavior: 'evo_glacier',
  },
  {
    id: 'blood_moon', name: 'Blood Moon', icon: '🌑', color: '#ff2a55',
    desc: 'Bleeding enemies burst on death, spreading bleed and healing you. Lifesteal cap doubles.',
    recipe: [{ id: 'vampiric', level: 5 }, { id: 'serrated', level: 1 }],
    mods: [{ stat: 'bleedChance', add: 0.3 }],
    behavior: 'evo_blood',
  },
  {
    id: 'hydra', name: 'Hydra Swarm', icon: '🐉', color: '#7dff8a',
    desc: 'The first hit of every flight splits the ball into three full-power heads.',
    recipe: [{ id: 'splitter', level: 4 }, { id: 'extra_ball', level: 2 }],
    mods: [{ stat: 'shardPower', add: 0.25 }],
    behavior: 'evo_hydra',
  },
  {
    id: 'railgun', name: 'Railgun', icon: '🔱', color: '#e2d3ff',
    desc: 'The ball pierces everything, leaves a searing beam, and deals +50% damage.',
    recipe: [{ id: 'velocity', level: 4 }, { id: 'piercing', level: 2 }],
    mods: [{ stat: 'pierce', add: 99 }, { stat: 'damage', mult: 0.5 }],
    behavior: 'evo_railgun',
  },
];

export const EVOLUTION_MAP: Record<string, EvolutionDef> = Object.fromEntries(EVOLUTIONS.map((e) => [e.id, e]));

/** Elemental reactions: always active, discovered the first time they happen. */
export const REACTIONS: ReactionDef[] = [
  { id: 'steam_burst', name: 'Steam Burst', icon: '♨️', elements: ['fire', 'ice'], desc: 'Burning a chilled enemy erupts in scalding steam, damaging everything nearby.' },
  { id: 'overload', name: 'Overload', icon: '💢', elements: ['fire', 'lightning'], desc: 'Lightning striking a burning enemy detonates the flames.' },
  { id: 'supercharge', name: 'Supercharge', icon: '✴️', elements: ['ice', 'lightning'], desc: 'Lightning striking a frozen enemy fractures into extra arcs.' },
];
export const REACTION_MAP: Record<string, ReactionDef> = Object.fromEntries(REACTIONS.map((r) => [r.id, r]));
