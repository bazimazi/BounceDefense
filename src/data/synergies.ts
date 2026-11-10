import { localize } from '../i18n/content';
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
    id: 'toxic_shrapnel', name: 'Toxic Shrapnel', icon: '🧪💥', tier: 'known',
    desc: 'Explosions coat everything they hit in 2 Poison stacks.',
    hint: 'Poison + Explosion',
    requires: (b) => b.tag('poison') >= 1 && b.tag('explosion') >= 1,
    behavior: 'toxic_shrapnel',
  },
  {
    id: 'corrosion', name: 'Corrosion', icon: '🧪🔨', tier: 'known',
    desc: 'Poison eats armor: enemies lose 1 armor for every 3 Poison stacks.',
    hint: 'Poison + Armor Breaker',
    requires: (b) => b.tag('poison') >= 1 && b.level('armor_breaker') >= 1,
    behavior: 'corrosion',
  },
  {
    id: 'venom_leech', name: 'Venom Leech', icon: '🧪🩸', tier: 'known',
    desc: 'Lifesteal is doubled against poisoned enemies.',
    hint: 'Poison + Vampiric',
    requires: (b) => b.tag('poison') >= 1 && b.level('vampiric') >= 1,
    behavior: 'venom_leech',
  },
  {
    id: 'snipers_nest', name: "Sniper's Nest", icon: '🔭🎯', tier: 'known',
    desc: 'Critical hits on enemies in the upper half deal +50% critical damage.',
    hint: 'Long Shot + Precision',
    requires: (b) => b.level('long_shot') >= 1 && b.level('precision') >= 1,
    behavior: 'snipers_nest',
  },
  {
    id: 'storm_front', name: 'Storm Front', icon: '🔊⚡', tier: 'known',
    desc: 'Thunderclap shockwaves have a 35% chance to arc chain lightning.',
    hint: 'Thunderclap + Chain',
    requires: (b) => b.level('thunderclap') >= 1 && b.tag('chain') >= 1,
    behavior: 'storm_front',
  },
  {
    id: 'implosion', name: 'Implosion', icon: '🌪️💥', tier: 'known',
    desc: 'Vortices detonate when they collapse.',
    hint: 'Vortex Core + Explosion',
    requires: (b) => b.level('vortex') >= 1 && b.tag('explosion') >= 1,
    behavior: 'implosion',
  },
  {
    id: 'perfect_storm', name: 'Perfect Storm', icon: '⛈️', tier: 'hidden',
    desc: 'Every wall bounce has a 20% chance to call chain lightning onto the nearest enemy.',
    hint: 'Lightning loves a long rally…',
    requires: (b) => b.tag('lightning') >= 3 && b.tag('ricochet') >= 3,
    behavior: 'perfect_storm',
  },
  {
    id: 'cold_blood', name: 'Cold Blood', icon: '🧊🩸', tier: 'hidden',
    desc: 'Freezing a bleeding enemy shatters its wounds: all Bleed stacks hit at once.',
    hint: 'Ice and blood, deeply invested…',
    requires: (b) => b.tag('ice') >= 2 && b.tag('bleed') >= 2,
    behavior: 'cold_blood',
  },
  {
    id: 'bounty_board', name: 'Bounty Board', icon: '📜💰', tier: 'hidden',
    desc: 'Elites drop triple coins and always leave a repair kit.',
    hint: 'Hunt the strong, and love their gold…',
    requires: (b) => b.level('bounty_hunter') >= 2 && b.level('greed') >= 1,
    behavior: 'bounty_board',
  },
  {
    id: 'last_line', name: 'Last Line', icon: '🧱🔨', tier: 'hidden',
    desc: 'Hits near your defense line knock enemies back three times as far.',
    hint: 'Stand firm at the line, with weight behind you…',
    requires: (b) => b.level('point_blank') >= 2 && b.tag('tank') >= 2,
    behavior: 'last_line',
  },
  {
    id: 'apocalypse', name: 'Apocalypse', icon: '☄️', tier: 'legendary',
    desc: 'Every 15th kill calls a meteor down on the densest crowd.',
    hint: 'Legendary: fire, poison and explosions, all three deeply.',
    requires: (b) => b.tag('fire') >= 3 && b.tag('poison') >= 3 && b.tag('explosion') >= 3,
    behavior: 'apocalypse',
  },
  {
    id: 'primal_chaos', name: 'Primal Chaos', icon: '🌈', tier: 'legendary',
    desc: 'Every hit applies one extra random element. Reactions deal double damage.',
    hint: 'Legendary: invest in all four elements.',
    requires: (b) => b.tag('fire') >= 2 && b.tag('ice') >= 2 && b.tag('lightning') >= 2 && b.tag('poison') >= 2,
    behavior: 'primal_chaos',
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
  {
    id: 'plague', name: 'Plague Ball', icon: '🧫', color: '#8dff5a',
    desc: 'Every hit adds 2 extra Poison stacks. Poisoned kills burst into toxic clouds. Poison stacks 8 higher.',
    recipe: [{ id: 'venom', level: 5 }, { id: 'contagion', level: 1 }],
    mods: [{ stat: 'poisonCap', add: 8 }, { stat: 'poisonChance', add: 0.3 }],
    behavior: 'evo_plague',
  },
  {
    id: 'singularity', name: 'Singularity', icon: '🕳️', color: '#b48cff',
    desc: 'The ball becomes a tiny black hole: it drags enemies in and crushes everything it passes.',
    recipe: [{ id: 'vortex', level: 3 }, { id: 'magnetism', level: 1 }],
    behavior: 'evo_singularity',
  },
  {
    id: 'thunderhead', name: 'Thunderhead', icon: '🌩️', color: '#9ec5ff',
    desc: 'Every wall bounce calls lightning down on the two enemies closest to your line.',
    recipe: [{ id: 'thunderclap', level: 3 }, { id: 'chain_lightning', level: 1 }],
    behavior: 'evo_thunderhead',
  },
  {
    id: 'minefield', name: 'Minefield', icon: '💣', color: '#ffb13b',
    desc: 'Every wall bounce drops a mine, you can hold twice as many, and blasts set off nearby mines.',
    recipe: [{ id: 'mine_layer', level: 3 }, { id: 'volatile', level: 1 }],
    behavior: 'evo_minefield',
  },
  {
    id: 'reaper', name: 'Grim Reaper', icon: '💀', color: '#d0c4ff',
    desc: 'Executes reach 10% higher. Every execution releases two soul sparks.',
    recipe: [{ id: 'executioner', level: 3 }, { id: 'lethal', level: 2 }],
    mods: [{ stat: 'execute', add: 0.1 }],
    behavior: 'evo_reaper',
  },
  {
    id: 'aegis', name: 'Aegis', icon: '🛡️', color: '#7ef0ff',
    desc: 'Kinetic Barrier recharges in 5 seconds and every block sends a shockwave along your line.',
    recipe: [{ id: 'barrier', level: 3 }, { id: 'fortify', level: 2 }],
    behavior: 'evo_aegis',
  },
  {
    id: 'prism', name: 'Prism Ball', icon: '🔮', color: '#ff9af0',
    desc: 'Critical hits split into three prismatic shards, each carrying a random element.',
    recipe: [{ id: 'refraction', level: 3 }, { id: 'precision', level: 3 }],
    behavior: 'evo_prism',
  },
];

export const EVOLUTION_MAP: Record<string, EvolutionDef> = Object.fromEntries(EVOLUTIONS.map((e) => [e.id, e]));

/** Elemental reactions: always active, discovered the first time they happen. */
export const REACTIONS: ReactionDef[] = [
  { id: 'steam_burst', name: 'Steam Burst', icon: '♨️', elements: ['fire', 'ice'], desc: 'Burning a chilled enemy erupts in scalding steam, damaging everything nearby.' },
  { id: 'overload', name: 'Overload', icon: '💢', elements: ['fire', 'lightning'], desc: 'Lightning striking a burning enemy detonates the flames.' },
  { id: 'supercharge', name: 'Supercharge', icon: '✴️', elements: ['ice', 'lightning'], desc: 'Lightning striking a frozen enemy fractures into extra arcs.' },
  { id: 'combustion', name: 'Combustion', icon: '🧨', elements: ['fire', 'poison'], desc: 'Fire ignites the toxin in a poisoned enemy: every stack erupts in one blast.' },
  { id: 'necrosis', name: 'Necrosis', icon: '🦴', elements: ['ice', 'poison'], desc: 'Freezing a poisoned enemy rots its armor away and doubles its Poison stacks.' },
  { id: 'neurotoxin', name: 'Neurotoxin', icon: '🧠', elements: ['lightning', 'poison'], desc: 'Lightning striking a poisoned enemy stuns it and carries its toxin down the chain.' },
];
export const REACTION_MAP: Record<string, ReactionDef> = Object.fromEntries(REACTIONS.map((r) => [r.id, r]));

localize('synergy', SYNERGIES, ['name', 'desc', 'hint']);
localize('evolution', EVOLUTIONS, ['name', 'desc']);
localize('reaction', REACTIONS, ['name', 'desc']);
