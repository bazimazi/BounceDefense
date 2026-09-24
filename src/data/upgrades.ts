import type { UpgradeDef } from './types';

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Run upgrades. Most change behaviour rather than adding flat numbers; the
 * numeric ones exist to support an archetype (crit, ricochet, kinetic...).
 */
export const UPGRADES: UpgradeDef[] = [
  // ---------------------------------------------------------------- offense
  {
    id: 'heavy_impact', name: 'Heavy Impact', icon: '💥', category: 'offense', rarity: 'common', maxLevel: 5,
    tags: ['impact', 'kinetic'],
    desc: () => `+25% damage. Enemies hit are knocked back farther.`,
    mods: (l) => [{ stat: 'damage', mult: 0.25 * l }, { stat: 'knockback', add: 10 * l }],
  },
  {
    id: 'precision', name: 'Precision', icon: '🎯', category: 'offense', rarity: 'common', maxLevel: 5,
    tags: ['crit'],
    desc: () => `+7% critical hit chance.`,
    mods: (l) => [{ stat: 'critChance', add: 0.07 * l }],
  },
  {
    id: 'lethal', name: 'Lethal Edge', icon: '🗡️', category: 'offense', rarity: 'rare', maxLevel: 4,
    tags: ['crit'],
    desc: () => `+50% critical damage.`,
    mods: (l) => [{ stat: 'critMult', add: 0.5 * l }],
  },
  {
    id: 'armor_breaker', name: 'Armor Breaker', icon: '🔨', category: 'offense', rarity: 'common', maxLevel: 3,
    tags: ['impact'],
    desc: () => `Ignore 5 armor. Heavy enemies stop shrugging off hits.`,
    mods: (l) => [{ stat: 'armorPen', add: 5 * l }, { stat: 'damage', mult: 0.05 * l }],
  },
  {
    id: 'executioner', name: 'Executioner', icon: '⚰️', category: 'offense', rarity: 'rare', maxLevel: 3, locked: true,
    tags: ['crit'],
    desc: (l) => `Instantly kill non-boss enemies below ${[0, 10, 15, 20][l]}% HP.`,
    mods: (l) => [{ stat: 'execute', add: [0, 0.1, 0.15, 0.2][l] }],
  },
  {
    id: 'overkill', name: 'Overkill', icon: '🩻', category: 'offense', rarity: 'rare', maxLevel: 3, locked: true,
    tags: ['chain', 'impact'],
    desc: (l) => `Excess kill damage (${pct([0, 0.5, 0.75, 1][l])}) leaps to the nearest enemy.`,
    mods: (l) => [{ stat: 'overkill', add: [0, 0.5, 0.75, 1][l] }],
  },

  // ---------------------------------------------------------------- physics
  {
    id: 'ricochet', name: 'Rebound Rage', icon: '🔁', category: 'physics', rarity: 'common', maxLevel: 5,
    tags: ['ricochet'],
    desc: () => `+8% damage per wall bounce this flight (up to 10). Resets at the floor.`,
    mods: (l) => [{ stat: 'bounceDamage', add: 0.08 * l }],
  },
  {
    id: 'velocity', name: 'Overdrive', icon: '🚀', category: 'physics', rarity: 'common', maxLevel: 4,
    tags: ['kinetic'],
    desc: () => `+12% ball speed and +5% damage.`,
    mods: (l) => [{ stat: 'speed', mult: 0.12 * l }, { stat: 'damage', mult: 0.05 * l }],
  },
  {
    id: 'mass', name: 'Mass', icon: '⚫', category: 'physics', rarity: 'common', maxLevel: 3,
    tags: ['impact', 'tank'],
    desc: () => `+22% ball size, +12% damage, -4% speed.`,
    mods: (l) => [{ stat: 'radius', mult: 0.22 * l }, { stat: 'damage', mult: 0.12 * l }, { stat: 'speed', mult: -0.04 * l }],
  },
  {
    id: 'safety_net', name: 'Safety Net', icon: '🕸️', category: 'physics', rarity: 'rare', maxLevel: 3,
    tags: ['ricochet', 'defense'],
    desc: () => `The floor bounces your ball once more per launch. Momentum survives.`,
    mods: (l) => [{ stat: 'floorBounces', add: l }],
  },
  {
    id: 'bank_shot', name: 'Bank Shot', icon: '🎱', category: 'physics', rarity: 'common', maxLevel: 3, locked: true,
    tags: ['ricochet', 'crit'],
    desc: () => `+15% crit chance on hits after a wall bounce.`,
    mods: (l) => [{ stat: 'bankCrit', add: 0.15 * l }],
  },
  {
    id: 'piercing', name: 'Piercing', icon: '📌', category: 'physics', rarity: 'rare', maxLevel: 3,
    tags: ['kinetic'],
    desc: () => `Pass through +1 enemy before bouncing. Refreshes on walls.`,
    mods: (l) => [{ stat: 'pierce', add: l }],
  },
  {
    id: 'magnetism', name: 'Magnetism', icon: '🧲', category: 'physics', rarity: 'rare', maxLevel: 3,
    tags: ['control'],
    desc: () => `Your ball gently curves toward nearby enemies.`,
    mods: (l) => [{ stat: 'magnetism', add: 1.4 * l }],
  },
  {
    id: 'accelerant', name: 'Accelerant', icon: '⏩', category: 'physics', rarity: 'common', maxLevel: 3,
    tags: ['kinetic', 'ricochet'],
    desc: () => `Each wall bounce speeds the ball up 4% (until the floor).`,
    mods: (l) => [{ stat: 'wallAccel', add: 0.04 * l }],
  },

  // ---------------------------------------------------------------- multiplication
  {
    id: 'extra_ball', name: 'Extra Ball', icon: '➕', category: 'multiply', rarity: 'rare', maxLevel: 4,
    tags: ['swarm'],
    desc: () => `+1 ball. Hold to keep firing as balls return.`,
    mods: (l) => [{ stat: 'maxBalls', add: l }],
    weight: 1.8,
  },
  {
    id: 'splitter', name: 'Split Shot', icon: '✂️', category: 'multiply', rarity: 'rare', maxLevel: 4, locked: true,
    tags: ['swarm'],
    desc: () => `+10% chance on hit to split off shards (45% damage).`,
    mods: (l) => [{ stat: 'splitChance', add: 0.1 * l }],
  },
  {
    id: 'echo', name: 'Echo Launch', icon: '👥', category: 'multiply', rarity: 'rare', maxLevel: 3, locked: true,
    tags: ['swarm'],
    desc: () => `+30% chance each launch fires a temporary clone.`,
    mods: (l) => [{ stat: 'echoChance', add: 0.3 * l }],
  },
  {
    id: 'shard_forge', name: 'Shard Forge', icon: '🔷', category: 'multiply', rarity: 'common', maxLevel: 3,
    tags: ['swarm'],
    desc: () => `Shards and clones deal +20% damage; splits create +1 shard.`,
    mods: (l) => [{ stat: 'shardPower', add: 0.2 * l }, { stat: 'splitCount', add: l >= 2 ? 1 : 0 }],
  },

  // ---------------------------------------------------------------- elemental
  {
    id: 'ignite', name: 'Ignite', icon: '🔥', category: 'element', rarity: 'common', maxLevel: 5,
    tags: ['fire', 'element'],
    desc: () => `+20% chance to Burn (damage over time).`,
    mods: (l) => [{ stat: 'burnChance', add: 0.2 * l }],
  },
  {
    id: 'wildfire', name: 'Wildfire', icon: '🌋', category: 'element', rarity: 'rare', maxLevel: 3, locked: true,
    tags: ['fire'],
    desc: () => `Burning enemies spread fire on death (+33% chance) and burn 20% harder.`,
    mods: (l) => [{ stat: 'burnSpread', add: 0.34 * l }, { stat: 'burnPower', mult: 0.2 * l }],
  },
  {
    id: 'frostbite', name: 'Frostbite', icon: '❄️', category: 'element', rarity: 'common', maxLevel: 5, locked: true,
    tags: ['ice', 'element'],
    desc: () => `+20% chance to Chill. 3 Chill stacks Freeze the enemy solid.`,
    mods: (l) => [{ stat: 'chillChance', add: 0.2 * l }],
  },
  {
    id: 'permafrost', name: 'Permafrost', icon: '🧊', category: 'element', rarity: 'rare', maxLevel: 3, locked: true,
    tags: ['ice'],
    desc: () => `Frozen enemies take +30% more damage.`,
    mods: (l) => [{ stat: 'frozenVuln', add: 0.3 * l }],
  },
  {
    id: 'chain_lightning', name: 'Chain Lightning', icon: '⚡', category: 'element', rarity: 'common', maxLevel: 5,
    tags: ['lightning', 'element', 'chain'],
    desc: () => `+15% chance on hit to arc lightning between nearby enemies (+1 jump).`,
    mods: (l) => [{ stat: 'chainChance', add: 0.15 * l }, { stat: 'chainCount', add: l - 1 }],
  },
  {
    id: 'static_charge', name: 'Static Charge', icon: '🌩️', category: 'element', rarity: 'rare', maxLevel: 3,
    tags: ['lightning', 'chain'],
    desc: (l) => `Every ${[0, 8, 6, 4][l]}th hit releases guaranteed chain lightning.`,
    behavior: 'static_charge',
  },
  {
    id: 'attunement', name: 'Attunement', icon: '🔮', category: 'element', rarity: 'rare', maxLevel: 4, locked: true,
    tags: ['element'],
    desc: () => `Status effects deal +25% damage. +4% to every element chance.`,
    mods: (l) => [
      { stat: 'elementPower', mult: 0.25 * l },
      { stat: 'burnChance', add: 0.04 * l }, { stat: 'chillChance', add: 0.04 * l }, { stat: 'chainChance', add: 0.04 * l },
    ],
  },

  // ---------------------------------------------------------------- explosion
  {
    id: 'volatile', name: 'Volatile Core', icon: '💣', category: 'offense', rarity: 'common', maxLevel: 5,
    tags: ['explosion'],
    desc: () => `+12% chance that hits explode, damaging everything nearby.`,
    mods: (l) => [{ stat: 'explosionChance', add: 0.12 * l }],
  },
  {
    id: 'blast_radius', name: 'Blast Radius', icon: '🎆', category: 'offense', rarity: 'common', maxLevel: 3, locked: true,
    tags: ['explosion'],
    desc: () => `+20% area and +15% explosion damage.`,
    mods: (l) => [{ stat: 'area', mult: 0.2 * l }, { stat: 'explosionDamage', mult: 0.15 * l }],
  },
  {
    id: 'chain_reaction', name: 'Chain Reaction', icon: '🧨', category: 'offense', rarity: 'epic', maxLevel: 3, locked: true,
    tags: ['explosion', 'chain'],
    desc: () => `Enemies killed by explosions have +30% chance to explode too.`,
    mods: (l) => [{ stat: 'chainReaction', add: 0.3 * l }],
  },

  // ---------------------------------------------------------------- defense
  {
    id: 'vampiric', name: 'Vampiric', icon: '🩸', category: 'defense', rarity: 'common', maxLevel: 5,
    tags: ['vampire'],
    desc: () => `Heal for 2% of damage dealt.`,
    mods: (l) => [{ stat: 'lifesteal', add: 0.02 * l }],
  },
  {
    id: 'serrated', name: 'Serrated', icon: '🦷', category: 'offense', rarity: 'common', maxLevel: 4, locked: true,
    tags: ['bleed', 'vampire'],
    desc: () => `+20% chance to Bleed. Bleed stacks up to 10 times.`,
    mods: (l) => [{ stat: 'bleedChance', add: 0.2 * l }],
  },
  {
    id: 'fortify', name: 'Fortify', icon: '🛡️', category: 'defense', rarity: 'common', maxLevel: 4,
    tags: ['tank', 'defense'],
    desc: () => `+25 max HP (healed) and +1 armor on the defense line.`,
    mods: (l) => [{ stat: 'maxHp', add: 25 * l }, { stat: 'armor', add: l }],
  },
  {
    id: 'regen', name: 'Regeneration', icon: '💚', category: 'defense', rarity: 'common', maxLevel: 3,
    tags: ['defense'],
    desc: () => `Regenerate 0.8 HP per second.`,
    mods: (l) => [{ stat: 'regen', add: 0.8 * l }],
  },
  {
    id: 'barrier', name: 'Kinetic Barrier', icon: '🔰', category: 'defense', rarity: 'rare', maxLevel: 3,
    tags: ['defense', 'tank'],
    desc: () => `The defense line blocks +1 enemy. Recharges every 18s.`,
    mods: (l) => [{ stat: 'barrier', add: l }],
  },

  // ---------------------------------------------------------------- utility / combo
  {
    id: 'scholar', name: 'Scholar', icon: '📘', category: 'utility', rarity: 'common', maxLevel: 3,
    tags: ['utility'],
    desc: () => `+18% XP gained.`,
    mods: (l) => [{ stat: 'xpGain', mult: 0.18 * l }],
  },
  {
    id: 'greed', name: 'Greed', icon: '💰', category: 'utility', rarity: 'common', maxLevel: 3, locked: true,
    tags: ['utility'],
    desc: () => `+30% coins. Golden enemies appear more often.`,
    mods: (l) => [{ stat: 'coinGain', mult: 0.3 * l }],
  },
  {
    id: 'wide_net', name: 'Wide Net', icon: '🪤', category: 'utility', rarity: 'common', maxLevel: 2,
    tags: ['utility'],
    desc: () => `Balls collect pickups from 50% farther away.`,
    mods: (l) => [{ stat: 'pickupRadius', mult: 0.5 * l }],
  },
  {
    id: 'combo_engine', name: 'Combo Engine', icon: '🔗', category: 'utility', rarity: 'rare', maxLevel: 3, locked: true,
    tags: ['combo'],
    desc: () => `Combo lasts 0.5s longer and its damage bonus is 50% stronger.`,
    mods: (l) => [{ stat: 'comboWindow', add: 0.5 * l }, { stat: 'comboPower', add: 0.5 * l }],
  },
  {
    id: 'flywheel', name: 'Flywheel', icon: '🌀', category: 'physics', rarity: 'rare', maxLevel: 3,
    tags: ['momentum', 'kinetic'],
    desc: () => `Momentum builds 40% faster.`,
    mods: (l) => [{ stat: 'momentumGain', mult: 0.4 * l }],
  },
  {
    id: 'four_leaf', name: 'Four-Leaf', icon: '🍀', category: 'utility', rarity: 'rare', maxLevel: 3,
    tags: ['utility'],
    desc: () => `Better upgrade rarity and more rare events. (Not raw power.)`,
    mods: (l) => [{ stat: 'luck', add: l }],
  },

  // ---------------------------------------------------------------- core signatures (mastery unlocks)
  {
    id: 'thermal_core', name: 'Thermal Core', icon: '♨️', category: 'element', rarity: 'epic', maxLevel: 2, locked: true, core: 'pyro',
    tags: ['fire'],
    desc: () => `Burns deal +40% damage and can critically strike.`,
    mods: (l) => [{ stat: 'burnPower', mult: 0.4 * l }],
    behavior: 'burn_crit',
  },
  {
    id: 'arc_capacitor', name: 'Arc Capacitor', icon: '🔋', category: 'element', rarity: 'epic', maxLevel: 2, locked: true, core: 'tesla',
    tags: ['lightning', 'chain'],
    desc: () => `+2 chain jumps and +25% chain damage.`,
    mods: (l) => [{ stat: 'chainCount', add: 2 * l }, { stat: 'chainDamage', add: 0.25 * l }],
  },
  {
    id: 'kinetic_lens', name: 'Kinetic Lens', icon: '🔭', category: 'offense', rarity: 'epic', maxLevel: 2, locked: true, core: 'striker',
    tags: ['crit', 'ricochet'],
    desc: () => `+0.6 crit damage. Crits after 3+ wall bounces pierce.`,
    mods: (l) => [{ stat: 'critMult', add: 0.6 * l }],
    behavior: 'kinetic_lens',
  },
  {
    id: 'glacial_heart', name: 'Glacial Heart', icon: '💠', category: 'element', rarity: 'epic', maxLevel: 2, locked: true, core: 'cryo',
    tags: ['ice'],
    desc: () => `Freezing an enemy chills everything around it.`,
    behavior: 'glacial_heart',
  },
  {
    id: 'sanguine_pact', name: 'Sanguine Pact', icon: '🍷', category: 'defense', rarity: 'epic', maxLevel: 2, locked: true, core: 'blood',
    tags: ['vampire', 'bleed'],
    desc: () => `Deal +10% damage per missing 10% HP.`,
    behavior: 'sanguine',
  },
  {
    id: 'event_horizon', name: 'Event Horizon', icon: '🕳️', category: 'physics', rarity: 'epic', maxLevel: 2, locked: true, core: 'void',
    tags: ['control'],
    desc: () => `Rift phases also pull nearby enemies together.`,
    behavior: 'event_horizon',
  },
];

export const UPGRADE_MAP: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

/** Upgrades that begin unlocked but are behind research; kept here for clarity of the default pool. */
export const DEFAULT_UNLOCKED_UPGRADES = UPGRADES.filter((u) => !u.locked).map((u) => u.id);
