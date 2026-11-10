import { localize } from '../i18n/content';
import type { BossDef, EliteModDef, EnemyDef } from './types';

/** Enemies are designed around the ball: each one asks a different question of your build. */
export const ENEMIES: EnemyDef[] = [
  {
    id: 'grunt', name: 'Grunt', desc: 'Marches toward your defense line.', tip: 'Anything works. Great combo fodder.',
    hp: 18, speed: 20, radius: 16, armor: 0, damage: 5, xp: 1, coins: 1, threat: 1,
    shape: 'circle', color: '#ff5d73', material: 'flesh', ai: 'walker',
  },
  {
    id: 'runner', name: 'Runner', desc: 'Fast and fragile, weaving side to side.', tip: 'Magnetism and chains catch runners.',
    hp: 10, speed: 46, radius: 12, armor: 0, damage: 4, xp: 1, coins: 1, threat: 1,
    shape: 'triangle', color: '#ffb13b', material: 'flesh', ai: 'runner',
  },
  {
    id: 'brute', name: 'Brute', desc: 'Heavily armored. Weak hits barely scratch it.', tip: 'Use Heavy Impact, crits, Armor Breaker or burns (ignore armor).',
    hp: 70, speed: 15, radius: 24, armor: 4, damage: 14, xp: 4, coins: 3, threat: 4,
    shape: 'square', color: '#9a8cff', material: 'metal', ai: 'walker',
  },
  {
    id: 'shielder', name: 'Shielder', desc: 'A frontal shield deflects anything from below.', tip: 'Bank shots off the top wall hit its unprotected back. The shield cracks after 3 blocks.',
    hp: 34, speed: 20, radius: 18, armor: 0, damage: 7, xp: 2, coins: 2, threat: 2,
    shape: 'hex', color: '#4fd1ff', material: 'metal', ai: 'shielder',
  },
  {
    id: 'splitter', name: 'Splitter', desc: 'Breaks into two smaller enemies on death.', tip: 'Explosions and pierce clean up the pieces.',
    hp: 30, speed: 22, radius: 19, armor: 0, damage: 7, xp: 2, coins: 1, threat: 2,
    shape: 'diamond', color: '#7dff8a', material: 'flesh', ai: 'walker', splitsInto: { id: 'splitling', count: 2 },
  },
  {
    id: 'splitling', name: 'Splitling', desc: 'Fragment of a Splitter.', tip: '',
    hp: 10, speed: 34, radius: 11, armor: 0, damage: 3, xp: 1, coins: 0, threat: 0,
    shape: 'diamond', color: '#b4ffbd', material: 'flesh', ai: 'runner',
  },
  {
    id: 'healer', name: 'Mender', desc: 'Pulses healing into nearby enemies.', tip: 'Priority target. Kill it first or tanks become immortal.',
    hp: 30, speed: 13, radius: 16, armor: 0, damage: 5, xp: 3, coins: 2, threat: 3,
    shape: 'cross', color: '#6dffcf', material: 'energy', ai: 'healer',
  },
  {
    id: 'spawner', name: 'Hive', desc: 'Slow nest that births swarmlings.', tip: 'Burst it down early; it gets worse with time.',
    hp: 110, speed: 7, radius: 27, armor: 2, damage: 18, xp: 6, coins: 4, threat: 6,
    shape: 'ring', color: '#ff7ad9', material: 'flesh', ai: 'spawner',
  },
  {
    id: 'swarmling', name: 'Swarmling', desc: 'Tiny and quick.', tip: '',
    hp: 7, speed: 44, radius: 9, armor: 0, damage: 2, xp: 0, coins: 0, threat: 0,
    shape: 'circle', color: '#ffb3ec', material: 'flesh', ai: 'runner',
  },
  {
    id: 'magnet', name: 'Lodestone', desc: 'Pulls balls toward itself, bending your shots.', tip: 'Use the pull: aim past it and let it curve your ball into crowds.',
    hp: 38, speed: 16, radius: 17, armor: 2, damage: 7, xp: 3, coins: 2, threat: 3,
    shape: 'star', color: '#ff9950', material: 'metal', ai: 'magnet',
  },
  {
    id: 'bomber', name: 'Bomber', desc: 'Explodes on death, hurting nearby enemies. Devastating if it reaches you.', tip: 'Pop it inside a crowd for a free explosion.',
    hp: 22, speed: 30, radius: 15, armor: 0, damage: 18, xp: 2, coins: 2, threat: 3,
    shape: 'circle', color: '#ff3b3b', material: 'energy', ai: 'walker', deathBlast: { radius: 80, damage: 45 },
  },
  {
    id: 'reflector', name: 'Mirror', desc: 'Reflects direct hits, taking only 25% ball damage.', tip: 'Elements, chains and explosions hit it at full strength.',
    hp: 50, speed: 17, radius: 19, armor: 0, damage: 8, xp: 3, coins: 3, threat: 3,
    shape: 'mirror', color: '#e6f0ff', material: 'crystal', ai: 'walker', directMult: 0.25,
  },
  {
    id: 'teleporter', name: 'Blinker', desc: 'Blinks to a new position when threatened.', tip: 'Area damage and chains punish its blinks.',
    hp: 24, speed: 22, radius: 14, armor: 0, damage: 6, xp: 2, coins: 2, threat: 2,
    shape: 'star', color: '#c77dff', material: 'energy', ai: 'teleporter',
  },
  {
    id: 'warden', name: 'Chronowarden', desc: 'Projects a field that slows balls.', tip: 'Kill it from range with chains, or build speed.',
    hp: 44, speed: 12, radius: 18, armor: 3, damage: 7, xp: 4, coins: 3, threat: 4,
    shape: 'hourglass', color: '#ffe066', material: 'crystal', ai: 'warden',
  },
  {
    id: 'spitter', name: 'Spitter', desc: 'Stops mid-field and lobs acid at your defense line.', tip: 'Intercept its globs with your ball, or rush it before it settles.',
    hp: 26, speed: 18, radius: 16, armor: 0, damage: 6, xp: 3, coins: 2, threat: 3,
    shape: 'egg', color: '#a6ff4d', material: 'flesh', ai: 'spitter',
  },
  {
    id: 'phantom', name: 'Phantom', desc: 'Slips out of phase every few seconds. Balls pass straight through it.', tip: 'Time your shots for when it flickers back, or let burns and poison tick through.',
    hp: 28, speed: 24, radius: 15, armor: 0, damage: 6, xp: 2, coins: 2, threat: 2,
    shape: 'crescent', color: '#9be7ff', material: 'energy', ai: 'phantom',
  },
  {
    id: 'juggernaut', name: 'Juggernaut', desc: 'An armored ram that cannot be knocked back. Every few seconds it charges.', tip: 'Armor Breaker, burns and poison. Do not let it reach the line.',
    hp: 160, speed: 11, radius: 28, armor: 6, damage: 26, xp: 7, coins: 5, threat: 7,
    shape: 'pentagon', color: '#c0c8d8', material: 'metal', ai: 'charger',
  },
  {
    id: 'necromancer', name: 'Necromancer', desc: 'Raises fallen enemies around it as revenants.', tip: 'Kill it first, or every fight happens twice.',
    hp: 40, speed: 12, radius: 17, armor: 1, damage: 8, xp: 5, coins: 3, threat: 5,
    shape: 'skull', color: '#b48cff', material: 'energy', ai: 'necro',
  },
  {
    id: 'revenant', name: 'Revenant', desc: 'A risen husk.', tip: '',
    hp: 14, speed: 26, radius: 12, armor: 0, damage: 4, xp: 0, coins: 0, threat: 0,
    shape: 'skull', color: '#d6c8ff', material: 'energy', ai: 'walker',
  },
  {
    id: 'aegis', name: 'Aegis Drone', desc: 'Projects energy shields onto nearby enemies.', tip: 'Shields block statuses too. Pop the drone, then the crowd.',
    hp: 30, speed: 16, radius: 15, armor: 1, damage: 5, xp: 4, coins: 3, threat: 4,
    shape: 'gear', color: '#7af0ff', material: 'metal', ai: 'aegis',
  },
  {
    id: 'mite', name: 'Mite', desc: 'Tiny, fast and never alone.', tip: 'Explosions, chains and splits clear swarms.',
    hp: 8, speed: 40, radius: 9, armor: 0, damage: 2, xp: 1, coins: 0, threat: 0.5,
    shape: 'triangle', color: '#c8ff6b', material: 'flesh', ai: 'runner',
  },
  {
    id: 'frost_golem', name: 'Frost Golem', desc: 'A walking glacier. Cold cannot touch it.', tip: 'Immune to ice. Use fire, poison or raw impact.',
    hp: 90, speed: 13, radius: 25, armor: 3, damage: 16, xp: 6, coins: 4, threat: 5,
    shape: 'hex', color: '#bfe9ff', material: 'crystal', ai: 'walker', immune: ['ice'],
  },
  {
    id: 'magma_golem', name: 'Magma Golem', desc: 'Molten rock that drinks flame.', tip: 'Immune to fire. Freeze it or poison it.',
    hp: 90, speed: 13, radius: 25, armor: 3, damage: 16, xp: 6, coins: 4, threat: 5,
    shape: 'hex', color: '#ff7a3d', material: 'stone', ai: 'walker', immune: ['fire'],
  },
  {
    id: 'insulator', name: 'Insulator', desc: 'Grounded plating that swallows lightning.', tip: 'Immune to lightning. Chains skip over it.',
    hp: 50, speed: 17, radius: 18, armor: 2, damage: 8, xp: 3, coins: 2, threat: 3,
    shape: 'gear', color: '#ffe14a', material: 'metal', ai: 'walker', immune: ['lightning'],
  },
  {
    id: 'pulsar', name: 'Pulsar', desc: 'Throbs with energy, repelling balls that come close.', tip: 'Strike right after a pulse, or hit it from range with chains.',
    hp: 36, speed: 15, radius: 17, armor: 1, damage: 7, xp: 4, coins: 2, threat: 4,
    shape: 'spike', color: '#ff8af0', material: 'energy', ai: 'pulsar',
  },
  {
    id: 'brood_egg', name: 'Brood Egg', desc: 'Hatches into mites.', tip: '',
    hp: 22, speed: 6, radius: 13, armor: 0, damage: 3, xp: 1, coins: 0, threat: 0,
    shape: 'egg', color: '#e6ff9a', material: 'flesh', ai: 'egg',
  },
  {
    id: 'ward_pylon', name: 'Ward Pylon', desc: 'Shields the Architect while it stands.', tip: '',
    hp: 120, speed: 0, radius: 16, armor: 2, damage: 0, xp: 3, coins: 2, threat: 0,
    shape: 'diamond', color: '#9ad8ff', material: 'crystal', ai: 'pylon',
  },
  {
    id: 'golden', name: 'Golden Wisp', desc: 'Flees upward. Drops a fortune.', tip: 'Catch it before it escapes!',
    hp: 60, speed: 30, radius: 14, armor: 0, damage: 0, xp: 8, coins: 60, threat: 0,
    shape: 'diamond', color: '#ffd84a', material: 'crystal', ai: 'golden',
  },
  {
    id: 'minion', name: 'Construct', desc: 'Boss-summoned construct.', tip: '',
    hp: 30, speed: 26, radius: 14, armor: 1, damage: 4, xp: 1, coins: 1, threat: 0,
    shape: 'square', color: '#b0b8d0', material: 'stone', ai: 'walker',
  },
  // ---- bosses
  {
    id: 'boss_fortress', name: 'The Fortress', desc: 'A living citadel behind rotating shield walls.', tip: 'Thread your shots through the gaps, or ricochet in behind.',
    hp: 1800, speed: 0, radius: 46, armor: 4, damage: 40, xp: 60, coins: 150, threat: 0,
    shape: 'hex', color: '#8fa8ff', material: 'stone', ai: 'boss', boss: true,
  },
  {
    id: 'boss_magnetar', name: 'The Magnetar', desc: 'A collapsed star that bends every trajectory.', tip: 'Its pull curves your ball. Its pulse throws it away. Time your launches.',
    hp: 2300, speed: 0, radius: 42, armor: 3, damage: 40, xp: 70, coins: 180, threat: 0,
    shape: 'ring', color: '#ff9950', material: 'energy', ai: 'boss', boss: true,
  },
  {
    id: 'boss_hydra', name: 'The Hydra', desc: 'Cut off one head, two more take its place.', tip: 'Area damage and multi-ball shine as heads multiply.',
    hp: 1250, speed: 0, radius: 44, armor: 2, damage: 40, xp: 30, coins: 60, threat: 0,
    shape: 'diamond', color: '#5dffa0', material: 'flesh', ai: 'boss', boss: true,
  },
  {
    id: 'boss_broodmother', name: 'The Broodmother', desc: 'A bloated queen that seeds the arena with eggs and acid.', tip: 'Crack the eggs before they hatch; area damage keeps the brood in check.',
    hp: 2100, speed: 0, radius: 48, armor: 3, damage: 40, xp: 70, coins: 180, threat: 0,
    shape: 'egg', color: '#a6ff4d', material: 'flesh', ai: 'boss', boss: true, immune: ['poison'],
  },
  {
    id: 'boss_chronarch', name: 'The Chronarch', desc: 'A clockwork tyrant that stops time itself.', tip: 'Launch right after a time stop; stasis bubbles slow every ball inside.',
    hp: 2500, speed: 0, radius: 44, armor: 3, damage: 40, xp: 80, coins: 200, threat: 0,
    shape: 'gear', color: '#ffd27a', material: 'crystal', ai: 'boss', boss: true,
  },
  {
    id: 'boss_architect', name: 'The Architect', desc: 'Builds walls between you and itself, guarded by ward pylons.', tip: 'Destroy the pylons first: while one stands, the Architect shrugs off most damage.',
    hp: 2300, speed: 0, radius: 42, armor: 4, damage: 40, xp: 90, coins: 220, threat: 0,
    shape: 'pentagon', color: '#e8eef8', material: 'stone', ai: 'boss', boss: true,
  },
];

export const ENEMY_MAP: Record<string, EnemyDef> = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));

/** Enemies shown in the codex (excludes internal fragments). */
export const INTERNAL_ENEMIES = ['splitling', 'swarmling', 'minion', 'revenant', 'brood_egg', 'ward_pylon'];
export const CODEX_ENEMIES = ENEMIES.filter((e) => !e.boss && !INTERNAL_ENEMIES.includes(e.id));

export const ELITE_MODS: EliteModDef[] = [
  { id: 'swift', name: 'Swift', color: '#ffe14a', desc: 'Moves much faster.' },
  { id: 'armored', name: 'Armored', color: '#9a8cff', desc: '+5 armor.' },
  { id: 'regen', name: 'Regenerating', color: '#6dff9c', desc: 'Regenerates 4% HP per second.' },
  { id: 'volatile', name: 'Volatile', color: '#ff4a4a', desc: 'On death, fires bombs at your defense line. Intercept them!' },
  { id: 'shielded', name: 'Shielded', color: '#5ad7ff', desc: 'An energy shield absorbs damage and blocks status effects until broken.' },
  { id: 'vampiric', name: 'Vampiric', color: '#ff2a55', desc: 'Heals itself whenever a nearby enemy dies.' },
  { id: 'undying', name: 'Undying', color: '#d6c8ff', desc: 'Rises once more at 40% health after its first death.' },
  { id: 'phasing', name: 'Phasing', color: '#9be7ff', desc: 'Slips out of phase every few seconds; balls pass through it.' },
  { id: 'fission', name: 'Fission', color: '#7dff8a', desc: 'Splits into two smaller copies when it dies.' },
  { id: 'commander', name: 'Commander', color: '#ffb13b', desc: 'Nearby enemies march 30% faster.' },
];
export const ELITE_MAP: Record<string, EliteModDef> = Object.fromEntries(ELITE_MODS.map((e) => [e.id, e]));

export const BOSSES: BossDef[] = [
  { id: 'fortress', name: 'The Fortress', title: 'Citadel of Walls', enemy: 'boss_fortress', desc: 'Rotating shields deflect your ball. Hit the core through the gaps.' },
  { id: 'magnetar', name: 'The Magnetar', title: 'Collapsed Star', enemy: 'boss_magnetar', desc: 'Gravity bends every shot; periodic pulses repel everything.' },
  { id: 'hydra', name: 'The Hydra', title: 'Endless Heads', enemy: 'boss_hydra', desc: 'Splits into more heads as it takes damage.' },
  { id: 'broodmother', name: 'The Broodmother', title: 'Queen of the Blight', enemy: 'boss_broodmother', desc: 'Lays eggs that hatch into mite swarms and spits acid at your line.' },
  { id: 'chronarch', name: 'The Chronarch', title: 'Lord of Hours', enemy: 'boss_chronarch', desc: 'Stops time to freeze your balls in mid-air and fills the arena with stasis bubbles.' },
  { id: 'architect', name: 'The Architect', title: 'Builder of Walls', enemy: 'boss_architect', desc: 'Raises walls to block your shots and hides behind ward pylons.' },
];
export const BOSS_MAP: Record<string, BossDef> = Object.fromEntries(BOSSES.map((b) => [b.id, b]));

localize('enemy', ENEMIES, ['name', 'desc', 'tip']);
localize('elite', ELITE_MODS, ['name', 'desc']);
localize('boss', BOSSES, ['name', 'title', 'desc']);
