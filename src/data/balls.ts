import type { CoreDef, PartDef } from './types';

/** Ball cores: the "character" of a run. Each defines a playstyle, not just stats. */
export const CORES: CoreDef[] = [
  {
    id: 'striker', name: 'Striker Core', icon: '⚪', color: '#f4f6ff',
    desc: 'Balanced and precise. Rewards clean bank shots.',
    passive: 'Precision Engineering: +15% damage. Hits after a wall bounce gain +10% crit chance.',
    mods: [{ stat: 'bankCrit', add: 0.1 }, { stat: 'damage', mult: 0.15 }],
    startUpgrades: [],
    unlockCost: 0,
  },
  {
    id: 'pyro', name: 'Pyro Core', icon: '🔥', color: '#ff7a2f', element: 'fire',
    desc: 'Sets the arena ablaze. Burns ignore armor.',
    passive: 'Kindling: +20% burn chance. Burning enemies take +10% ball damage.',
    mods: [{ stat: 'burnChance', add: 0.2 }, { stat: 'damage', mult: -0.08 }],
    startUpgrades: ['ignite'],
    behavior: 'pyro_core',
    unlockCost: 3,
  },
  {
    id: 'tesla', name: 'Tesla Core', icon: '⚡', color: '#5ee7ff', element: 'lightning',
    desc: 'Fast and conductive. Lightning leaps between targets.',
    passive: 'Conductor: +20% chain chance, +1 jump, +8% speed.',
    mods: [{ stat: 'chainChance', add: 0.2 }, { stat: 'chainCount', add: 1 }, { stat: 'speed', mult: 0.08 }],
    startUpgrades: ['chain_lightning'],
    unlockCost: 3,
  },
  {
    id: 'cryo', name: 'Cryo Core', icon: '❄️', color: '#9fdcff', element: 'ice',
    desc: 'Heavy and cold. Freezes the battlefield, then shatters it.',
    passive: 'Deep Cold: +25% chill chance, +15% ball size. Frozen enemies take +25% more damage.',
    mods: [{ stat: 'chillChance', add: 0.25 }, { stat: 'radius', mult: 0.15 }, { stat: 'frozenVuln', add: 0.25 }, { stat: 'damage', mult: 0.1 }],
    startUpgrades: ['frostbite'],
    unlockCost: 5,
    unlockReq: { achievement: 'first_boss', text: 'Defeat any boss' },
  },
  {
    id: 'blood', name: 'Blood Core', icon: '🩸', color: '#ff2a55',
    desc: 'Drains life with every hit. Stronger when you are healthy.',
    passive: 'Thirst: +3% lifesteal and +20% bleed chance, but -20 max HP.',
    mods: [{ stat: 'lifesteal', add: 0.03 }, { stat: 'bleedChance', add: 0.2 }, { stat: 'maxHp', add: -20 }],
    startUpgrades: ['vampiric'],
    unlockCost: 6,
    unlockReq: { achievement: 'blood_bank', text: 'Heal 300 HP total' },
  },
  {
    id: 'void', name: 'Void Core', icon: '🌀', color: '#c77dff',
    desc: 'Bends space. Refuses to fall.',
    passive: 'Rift Phase: the first time each launch the ball would hit the floor, it phases to the top of the arena instead.',
    mods: [{ stat: 'magnetism', add: 0.8 }],
    startUpgrades: [],
    behavior: 'void_core',
    unlockCost: 8,
    unlockReq: { boss: 'magnetar', text: 'Defeat The Magnetar' },
  },
];
export const CORE_MAP: Record<string, CoreDef> = Object.fromEntries(CORES.map((c) => [c.id, c]));

export const PARTS: PartDef[] = [
  // shells
  { id: 'shell_std', slot: 'shell', name: 'Standard Shell', icon: '⚪', desc: 'No modifications.', mods: [] },
  {
    id: 'shell_titan', slot: 'shell', name: 'Titan Shell', icon: '🪨', desc: '+30% size, +15% damage, -10% speed.',
    mods: [{ stat: 'radius', mult: 0.3 }, { stat: 'damage', mult: 0.15 }, { stat: 'speed', mult: -0.1 }],
    unlock: { achievement: 'first_hundred', text: 'Kill 100 enemies' },
  },
  {
    id: 'shell_aero', slot: 'shell', name: 'Aero Shell', icon: '🪶', desc: '+14% speed, -12% size.',
    mods: [{ stat: 'speed', mult: 0.14 }, { stat: 'radius', mult: -0.12 }],
    unlock: { coins: 400, text: '400 coins' },
  },
  {
    id: 'shell_vamp', slot: 'shell', name: 'Vampiric Shell', icon: '🦇', desc: '+2% lifesteal, -10 max HP.',
    mods: [{ stat: 'lifesteal', add: 0.02 }, { stat: 'maxHp', add: -10 }],
    unlock: { coins: 600, text: '600 coins' },
  },
  {
    id: 'shell_spiked', slot: 'shell', name: 'Spiked Shell', icon: '🌵', desc: '+15% bleed chance, +8% damage.',
    mods: [{ stat: 'bleedChance', add: 0.15 }, { stat: 'damage', mult: 0.08 }],
    unlock: { achievement: 'blood_bank', text: 'Heal 300 HP total' },
  },
  // impacts
  { id: 'impact_std', slot: 'impact', name: 'Standard Impact', icon: '⚪', desc: 'No modifications.', mods: [] },
  {
    id: 'impact_explosive', slot: 'impact', name: 'Explosive Impact', icon: '💥', desc: '+8% explosion chance.',
    mods: [{ stat: 'explosionChance', add: 0.08 }],
    unlock: { coins: 500, text: '500 coins' },
  },
  {
    id: 'impact_split', slot: 'impact', name: 'Splitting Impact', icon: '✂️', desc: '+8% split chance.',
    mods: [{ stat: 'splitChance', add: 0.08 }],
    unlock: { achievement: 'swarm_protocol', text: 'Have 6 balls in flight at once' },
  },
  {
    id: 'impact_pierce', slot: 'impact', name: 'Piercing Impact', icon: '📌', desc: '+1 pierce, -10% damage.',
    mods: [{ stat: 'pierce', add: 1 }, { stat: 'damage', mult: -0.1 }],
    unlock: { coins: 700, text: '700 coins' },
  },
  {
    id: 'impact_concussive', slot: 'impact', name: 'Concussive Impact', icon: '🔔', desc: 'Double knockback. +3 armor pierce.',
    mods: [{ stat: 'knockback', mult: 1 }, { stat: 'armorPen', add: 3 }],
    unlock: { achievement: 'demolition', text: 'Get 50 explosion kills' },
  },
  // momentum
  { id: 'mom_std', slot: 'momentum', name: 'Standard Drive', icon: '⚪', desc: 'No modifications.', mods: [] },
  {
    id: 'mom_flywheel', slot: 'momentum', name: 'Flywheel Drive', icon: '🌀', desc: 'Momentum builds 50% faster.',
    mods: [{ stat: 'momentumGain', mult: 0.5 }],
    unlock: { achievement: 'hyperball', text: 'Reach Hyper momentum' },
  },
  {
    id: 'mom_accel', slot: 'momentum', name: 'Accelerator', icon: '⏩', desc: '+5% speed per wall bounce until the floor.',
    mods: [{ stat: 'wallAccel', add: 0.05 }],
    unlock: { achievement: 'ricochet_adept', text: '25 wall bounces in one flight' },
  },
  {
    id: 'mom_stabilizer', slot: 'momentum', name: 'Stabilizer', icon: '⚓', desc: 'The floor drops momentum one tier instead of resetting it.',
    mods: [],
    behavior: 'stabilizer',
    unlock: { achievement: 'unstable', text: 'Reach Unstable momentum' },
  },
];
export const PART_MAP: Record<string, PartDef> = Object.fromEntries(PARTS.map((p) => [p.id, p]));

export const TRAILS = [
  { id: 'classic', name: 'Classic', colors: ['#ffffff', '#8fa8ff'] },
  { id: 'ember', name: 'Ember', colors: ['#ffd27a', '#ff4a1a'] },
  { id: 'aurora', name: 'Aurora', colors: ['#7dff8a', '#5ee7ff'] },
  { id: 'crimson', name: 'Crimson', colors: ['#ff8aa0', '#b0002a'] },
  { id: 'void', name: 'Void', colors: ['#e0b3ff', '#4a1a8a'] },
  { id: 'gold', name: 'Gilded', colors: ['#fff3b0', '#ffb300'] },
  { id: 'prism', name: 'Prism', colors: ['#ff6ad5', '#5ee7ff'] },
];
