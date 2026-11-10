import { localize } from '../i18n/content';
import type { RelicDef, RelicRarity } from './types';

/**
 * Relics are found during a run: the mini-boss and every boss leave a relic cache, a pick of
 * three. Each is a strong, distinct twist on a build rather than another stat line, and the
 * collection grows across many runs (most locked relics unlock through Goals and Pilot Rank).
 */
export const RELICS: RelicDef[] = [
  // ---------------------------------------------------------------- common
  { id: 'lucky_coin', name: 'Lucky Coin', icon: '🪙', rarity: 'common', desc: '+8% crit chance. Better upgrade rarity.',
    mods: [{ stat: 'critChance', add: 0.08 }, { stat: 'luck', add: 1 }] },
  { id: 'iron_heart', name: 'Iron Heart', icon: '🫀', rarity: 'common', desc: '+50 max HP (healed). −8% ball speed.',
    mods: [{ stat: 'maxHp', add: 50 }, { stat: 'speed', mult: -0.08 }] },
  { id: 'war_drum', name: 'War Drum', icon: '🥁', rarity: 'common', desc: '+1% damage for every 8 combo (up to +35%).',
    behavior: 'relic_war_drum' },
  { id: 'scholars_tome', name: "Scholar's Tome", icon: '📖', rarity: 'common', desc: '+25% XP.',
    mods: [{ stat: 'xpGain', mult: 0.25 }] },
  { id: 'lodestone_charm', name: 'Lodestone Charm', icon: '🧲', rarity: 'common', desc: 'Balls collect pickups from much farther away. +10% XP.',
    mods: [{ stat: 'pickupRadius', mult: 1.5 }, { stat: 'xpGain', mult: 0.1 }] },
  { id: 'bulwark_plate', name: 'Bulwark Plate', icon: '🛡️', rarity: 'common', desc: '+3 armor on the line and +1 Kinetic Barrier charge.',
    mods: [{ stat: 'armor', add: 3 }, { stat: 'barrier', add: 1 }] },
  { id: 'prism_shard', name: 'Prism Shard', icon: '🔷', rarity: 'common', desc: '+7% burn, chill, chain, poison and bleed chance.',
    mods: [{ stat: 'burnChance', add: 0.07 }, { stat: 'chillChance', add: 0.07 }, { stat: 'chainChance', add: 0.07 }, { stat: 'poisonChance', add: 0.07 }, { stat: 'bleedChance', add: 0.07 }] },
  { id: 'gravity_charm', name: 'Gravity Charm', icon: '🌀', rarity: 'common', desc: 'Your balls curve gently toward enemies.',
    mods: [{ stat: 'magnetism', add: 2 }] },
  { id: 'golden_idol', name: 'Golden Idol', icon: '🗿', rarity: 'common', desc: '+50% coins.',
    mods: [{ stat: 'coinGain', mult: 0.5 }] },
  { id: 'hourglass', name: 'Hourglass', icon: '⏳', rarity: 'common', desc: 'Recall cooldown −4s. Surge lasts 1.5s longer.',
    mods: [{ stat: 'recallCooldown', add: -4 }, { stat: 'surgeDuration', add: 1.5 }] },
  { id: 'whetstone', name: 'Whetstone', icon: '🔪', rarity: 'common', desc: '+30% crit damage and +6% bleed chance.',
    mods: [{ stat: 'critMult', add: 0.3 }, { stat: 'bleedChance', add: 0.06 }] },
  { id: 'ember_heart', name: 'Ember Heart', icon: '♨️', rarity: 'common', desc: '+10% burn chance. Burns deal +25% damage.', locked: true,
    mods: [{ stat: 'burnChance', add: 0.1 }, { stat: 'burnPower', mult: 0.25 }] },
  { id: 'frost_crown', name: 'Frost Crown', icon: '👑', rarity: 'common', desc: '+10% chill chance. Freezes last 50% longer.', locked: true,
    mods: [{ stat: 'chillChance', add: 0.1 }, { stat: 'freezeDuration', mult: 0.5 }] },
  { id: 'venom_gland', name: 'Venom Gland', icon: '🧪', rarity: 'common', desc: '+12% poison chance. Poison deals +25% damage.', locked: true,
    mods: [{ stat: 'poisonChance', add: 0.12 }, { stat: 'poisonPower', mult: 0.25 }] },
  { id: 'storm_rod', name: 'Storm Rod', icon: '🪄', rarity: 'common', desc: '+12% chain chance and +1 jump.', locked: true,
    mods: [{ stat: 'chainChance', add: 0.12 }, { stat: 'chainCount', add: 1 }] },

  // ---------------------------------------------------------------- rare
  { id: 'phoenix_feather', name: 'Phoenix Feather', icon: '🪶', rarity: 'rare', inert: ['noHeal'],
    desc: 'Once per run, a lethal hit leaves you at 40% hull and blasts every enemy near the line.', behavior: 'relic_phoenix' },
  { id: 'soul_lantern', name: 'Soul Lantern', icon: '🏮', rarity: 'rare', locked: true,
    desc: 'Every 20 kills: +1% damage for the rest of the run (up to +40%).', behavior: 'relic_soul_lantern' },
  { id: 'giant_killer', name: 'Giant Killer', icon: '🗡️', rarity: 'rare', locked: true, desc: '+30% damage to elites and bosses.',
    mods: [{ stat: 'eliteDamage', add: 0.3 }] },
  { id: 'meteor_core', name: 'Meteor Core', icon: '☄️', rarity: 'rare', desc: 'Power shots explode on their first hit for triple damage.',
    behavior: 'relic_meteor' },
  { id: 'thorn_wall', name: 'Thorn Wall', icon: '🌵', rarity: 'rare', desc: 'Breaches send a shockwave along your line (250% damage).',
    behavior: 'relic_thorns' },
  { id: 'echo_bell', name: 'Echo Bell', icon: '🔔', rarity: 'rare', locked: true, desc: '+30% chance each launch fires a clone. Clones and shards +15% power.',
    mods: [{ stat: 'echoChance', add: 0.3 }, { stat: 'shardPower', add: 0.15 }] },
  { id: 'hydra_tooth', name: 'Hydra Tooth', icon: '🦷', rarity: 'rare', locked: true, desc: '+10% split chance. Shards +20% power.',
    mods: [{ stat: 'splitChance', add: 0.1 }, { stat: 'shardPower', add: 0.2 }] },
  { id: 'star_compass', name: 'Star Compass', icon: '🧭', rarity: 'rare', desc: 'Starfall deals +60% damage. Signals grant double Surge charge.',
    mods: [{ stat: 'starfallPower', mult: 0.6 }], behavior: 'relic_star_compass' },
  { id: 'overclock_chip', name: 'Overclock Chip', icon: '💾', rarity: 'rare', desc: '+15% ball speed. Surge charges 30% faster.',
    mods: [{ stat: 'speed', mult: 0.15 }, { stat: 'surgeGain', mult: 0.3 }] },
  { id: 'blood_chalice', name: 'Blood Chalice', icon: '🍷', rarity: 'rare', inert: ['noHeal'], desc: '+2% lifesteal. Kills repair a sliver of hull.',
    mods: [{ stat: 'lifesteal', add: 0.02 }], behavior: 'relic_chalice' },
  { id: 'headsmans_axe', name: "Headsman's Axe", icon: '🪓', rarity: 'rare', desc: 'Instantly kill non-boss enemies below 12% HP.',
    mods: [{ stat: 'execute', add: 0.12 }] },

  // ---------------------------------------------------------------- legendary
  { id: 'twin_engines', name: 'Twin Engines', icon: '⚙️', rarity: 'legendary', inert: ['loneBall'], desc: '+1 ball. −12% damage.',
    mods: [{ stat: 'maxBalls', add: 1 }, { stat: 'damage', mult: -0.12 }] },
  { id: 'cracked_core', name: 'Cracked Core', icon: '💔', rarity: 'legendary', cursed: true, desc: '+45% damage. Your line takes 25% more damage.',
    mods: [{ stat: 'damage', mult: 0.45 }, { stat: 'damageTaken', mult: 0.25 }] },
  { id: 'cursed_crown', name: 'Cursed Crown', icon: '👹', rarity: 'legendary', cursed: true, locked: true,
    desc: '+40% damage and +60% coins. New enemies have 25% more health.',
    mods: [{ stat: 'damage', mult: 0.4 }, { stat: 'coinGain', mult: 0.6 }], behavior: 'relic_cursed_crown' },
  { id: 'berserker_mask', name: 'Berserker Mask', icon: '👺', rarity: 'legendary', desc: '+1% damage for every 1% of hull you are missing.',
    behavior: 'relic_berserker' },
  { id: 'infinity_loop', name: 'Infinity Loop', icon: '♾️', rarity: 'legendary', locked: true, desc: 'The floor never resets momentum.',
    behavior: 'perpetual_motion' },
  { id: 'chaos_die', name: 'Chaos Die', icon: '🎲', rarity: 'legendary', locked: true, desc: '+2 rerolls now. Level-ups offer one extra card.',
    behavior: 'relic_chaos_die' },
];

export const RELIC_MAP: Record<string, RelicDef> = Object.fromEntries(RELICS.map((r) => [r.id, r]));
export const DEFAULT_UNLOCKED_RELICS = RELICS.filter((r) => !r.locked).map((r) => r.id);
export const RELIC_WEIGHT: Record<RelicRarity, number> = { common: 100, rare: 45, legendary: 14 };
export const RELIC_COLOR: Record<RelicRarity, string> = { common: '#8debdc', rare: '#7aa8ff', legendary: '#ffb300' };

localize('relic', RELICS, ['name', 'desc']);
