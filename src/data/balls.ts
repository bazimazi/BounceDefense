import { localize } from '../i18n/content';
import type { CoreDef, PartDef } from './types';

/** Ball cores: the "character" of a run. Each defines a playstyle, not just stats. */
export const CORES: CoreDef[] = [
  {
    id: 'striker', name: 'Striker Core', icon: '⚪', color: '#f4f6ff',
    desc: 'Balanced and precise. Rewards clean bank shots.',
    passive: 'Precision Engineering: +25% damage. Hits after a wall bounce gain +15% crit chance.',
    mods: [{ stat: 'bankCrit', add: 0.15 }, { stat: 'damage', mult: 0.25 }],
    startUpgrades: [],
    unlockCost: 0,
  },
  {
    id: 'pyro', name: 'Pyro Core', icon: '🔥', color: '#ff7a2f', element: 'fire',
    desc: 'Sets the arena ablaze. Burns ignore armor.',
    passive: 'Kindling: +20% burn chance and +15% burn damage. Burning enemies take +25% ball damage.',
    mods: [{ stat: 'burnChance', add: 0.2 }, { stat: 'burnPower', mult: 0.15 }],
    startUpgrades: ['ignite'],
    behavior: 'pyro_core',
    unlockCost: 3,
  },
  {
    id: 'tesla', name: 'Tesla Core', icon: '⚡', color: '#5ee7ff', element: 'lightning',
    desc: 'Fast and conductive. Lightning leaps between targets.',
    passive: 'Conductor: +10% chain chance, +1 jump, +8% speed.',
    mods: [{ stat: 'chainChance', add: 0.1 }, { stat: 'chainCount', add: 1 }, { stat: 'speed', mult: 0.08 }],
    startUpgrades: ['chain_lightning'],
    unlockCost: 3,
  },
  {
    id: 'cryo', name: 'Cryo Core', icon: '❄️', color: '#9fdcff', element: 'ice',
    desc: 'Heavy and cold. Freezes the battlefield, then shatters it.',
    passive: 'Deep Cold: +25% chill chance, +15% ball size, +25% damage. Frozen enemies take +25% more damage.',
    mods: [{ stat: 'chillChance', add: 0.25 }, { stat: 'radius', mult: 0.15 }, { stat: 'frozenVuln', add: 0.25 }, { stat: 'damage', mult: 0.25 }],
    startUpgrades: ['frostbite'],
    unlockCost: 5,
    unlockReq: { achievement: 'first_boss', text: 'Defeat any boss' },
  },
  {
    id: 'blood', name: 'Blood Core', icon: '🩸', color: '#ff2a55',
    desc: 'Drains life with every hit. Trades hull for sustain.',
    passive: 'Thirst: +3% lifesteal and +20% bleed chance, but -20 max HP.',
    mods: [{ stat: 'lifesteal', add: 0.03 }, { stat: 'bleedChance', add: 0.2 }, { stat: 'maxHp', add: -20 }],
    startUpgrades: ['vampiric'],
    unlockCost: 6,
    unlockReq: { achievement: 'blood_bank', text: 'Heal 300 HP total' },
  },
  {
    id: 'void', name: 'Void Core', icon: '🌀', color: '#c77dff',
    desc: 'Bends space. Refuses to fall.',
    passive: 'Rift Phase: the first time each launch the ball would hit the floor, it phases to the top of the arena instead. -15% damage.',
    mods: [{ stat: 'magnetism', add: 0.3 }, { stat: 'damage', mult: -0.15 }],
    startUpgrades: [],
    behavior: 'void_core',
    unlockCost: 8,
    unlockReq: { boss: 'magnetar', text: 'Defeat The Magnetar' },
  },
  {
    id: 'venom', name: 'Venom Core', icon: '🧪', color: '#8dff5a', element: 'poison',
    desc: 'Patient and lethal. Every hit leaves something behind.',
    passive: 'Toxin: +30% poison chance and +25% poison damage. Poisoned enemies move 20% slower.',
    mods: [{ stat: 'poisonChance', add: 0.3 }, { stat: 'poisonPower', mult: 0.25 }],
    startUpgrades: ['venom'],
    behavior: 'venom_core',
    unlockCost: 6,
    unlockReq: { boss: 'hydra', text: 'Defeat The Hydra' },
  },
  {
    id: 'titan', name: 'Titan Core', icon: '🪨', color: '#d9a066',
    desc: 'Huge, slow and devastating. Every hit lands like a hammer.',
    passive: 'Colossus: +40% ball size, +22% damage, +40% knockback, −15% speed, +10 max HP.',
    mods: [{ stat: 'radius', mult: 0.4 }, { stat: 'damage', mult: 0.22 }, { stat: 'knockback', mult: 0.4 }, { stat: 'speed', mult: -0.15 }, { stat: 'maxHp', add: 10 }],
    startUpgrades: ['heavy_impact'],
    unlockCost: 6,
    unlockReq: { achievement: 'elite_hunter', text: 'Kill 25 elites' },
  },
  {
    id: 'gemini', name: 'Gemini Core', icon: '♊', color: '#ffc2f4',
    desc: 'Never flies alone. Two balls, one mind.',
    passive: 'Twin Star: every launch also fires a twin at 45% power. −15% damage.',
    mods: [{ stat: 'damage', mult: -0.15 }],
    startUpgrades: ['shard_forge'],
    behavior: 'gemini_core',
    unlockCost: 7,
    unlockReq: { achievement: 'swarm_protocol', text: 'Have 6 balls in flight at once' },
  },
  {
    id: 'chrono', name: 'Chrono Core', icon: '⌛', color: '#ffd27a',
    desc: 'Bends time around itself. The battlefield crawls while you think.',
    passive: 'Time Dilation: enemies near your balls move 40% slower. +0.4s combo window, Surge charges 20% faster.',
    mods: [{ stat: 'comboWindow', add: 0.4 }, { stat: 'surgeGain', mult: 0.2 }],
    startUpgrades: [],
    behavior: 'chrono_core',
    unlockCost: 9,
    unlockReq: { boss: 'chronarch', text: 'Defeat The Chronarch' },
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
  {
    id: 'shell_lead', slot: 'shell', name: 'Lead Shell', icon: '🔩', desc: '+12% damage, +40% knockback, −6% speed.',
    mods: [{ stat: 'damage', mult: 0.12 }, { stat: 'knockback', mult: 0.4 }, { stat: 'speed', mult: -0.06 }],
    unlock: { coins: 900, text: '900 coins' },
  },
  {
    id: 'shell_crystal', slot: 'shell', name: 'Crystal Shell', icon: '💎', desc: '+8% crit chance, −15 max HP.',
    mods: [{ stat: 'critChance', add: 0.08 }, { stat: 'maxHp', add: -15 }],
    unlock: { coins: 1100, text: '1,100 coins' },
  },
  {
    id: 'shell_toxic', slot: 'shell', name: 'Toxic Shell', icon: '🧪', desc: '+12% poison chance.',
    mods: [{ stat: 'poisonChance', add: 0.12 }],
    unlock: { achievement: 'toxicologist', text: 'Kill 300 enemies with poison' },
  },
  {
    id: 'shell_phase', slot: 'shell', name: 'Phase Shell', icon: '👻', desc: '+1 pierce, −8% damage.',
    mods: [{ stat: 'pierce', add: 1 }, { stat: 'damage', mult: -0.08 }],
    unlock: { achievement: 'veteran_pilot', text: 'Play 25 runs' },
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
  {
    id: 'impact_incendiary', slot: 'impact', name: 'Incendiary Impact', icon: '🔥', desc: '+10% burn chance.',
    mods: [{ stat: 'burnChance', add: 0.1 }],
    unlock: { coins: 800, text: '800 coins' },
  },
  {
    id: 'impact_cryo', slot: 'impact', name: 'Cryo Impact', icon: '❄️', desc: '+10% chill chance.',
    mods: [{ stat: 'chillChance', add: 0.1 }],
    unlock: { coins: 800, text: '800 coins' },
  },
  {
    id: 'impact_arc', slot: 'impact', name: 'Arc Impact', icon: '⚡', desc: '+10% chain chance.',
    mods: [{ stat: 'chainChance', add: 0.1 }],
    unlock: { coins: 800, text: '800 coins' },
  },
  {
    id: 'impact_gravity', slot: 'impact', name: 'Gravity Impact', icon: '🌑', desc: 'Hits pull nearby enemies toward the target.',
    mods: [],
    behavior: 'impact_gravity',
    unlock: { achievement: 'evolution_master', text: 'Evolve 10 times' },
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
  {
    id: 'mom_overdrive', slot: 'momentum', name: 'Overdrive Drive', icon: '🏎️', desc: '+10% speed, −25% momentum gain.',
    mods: [{ stat: 'speed', mult: 0.1 }, { stat: 'momentumGain', mult: -0.25 }],
    unlock: { coins: 1000, text: '1,000 coins' },
  },
  {
    id: 'mom_capacitor', slot: 'momentum', name: 'Capacitor Drive', icon: '🔋', desc: 'Surge charges 30% faster.',
    mods: [{ stat: 'surgeGain', mult: 0.3 }],
    unlock: { coins: 1200, text: '1,200 coins' },
  },
  {
    id: 'mom_gyro', slot: 'momentum', name: 'Gyro Drive', icon: '🪀', desc: '+1 floor bounce per launch, −10% damage.',
    mods: [{ stat: 'floorBounces', add: 1 }, { stat: 'damage', mult: -0.1 }],
    unlock: { achievement: 'ricochet_virtuoso', text: '40 wall bounces in one flight' },
  },
  {
    id: 'mom_resonant', slot: 'momentum', name: 'Resonant Drive', icon: '🎐', desc: 'Starfall deals +40% damage.',
    mods: [{ stat: 'starfallPower', mult: 0.4 }],
    unlock: { achievement: 'stargazer', text: 'Call 50 Starfalls' },
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
  { id: 'toxin', name: 'Toxin', colors: ['#e6ff9a', '#3aa000'] },
  { id: 'magma', name: 'Magma', colors: ['#ffe0a0', '#c43a00'] },
  { id: 'mirror', name: 'Mirror', colors: ['#ffffff', '#ffb3ff'] },
  { id: 'chrono', name: 'Clockwork', colors: ['#fff2c4', '#c98b1a'] },
  { id: 'frost', name: 'Frost', colors: ['#ffffff', '#6ad1ff'] },
  { id: 'storm', name: 'Storm', colors: ['#f0f8ff', '#3f6bff'] },
  { id: 'nebula', name: 'Nebula', colors: ['#ff9af0', '#4a2aff'] },
  { id: 'sunset', name: 'Sunset', colors: ['#ffd08a', '#ff3d7a'] },
  { id: 'abyssal', name: 'Abyssal', colors: ['#c77dff', '#1a0040'] },
  { id: 'celestial', name: 'Celestial', colors: ['#fffbe6', '#bca7ff'] },
  { id: 'ascendant', name: 'Ascendant', colors: ['#ffffff', '#ffd451'] },
];

localize('core', CORES, ['name', 'desc', 'passive', 'unlockReq.text']);
localize('part', PARTS, ['name', 'desc', 'unlock.text']);
localize('trail', TRAILS, ['name']);
