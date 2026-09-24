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
];

export const ENEMY_MAP: Record<string, EnemyDef> = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));

/** Enemies shown in the codex (excludes internal fragments). */
export const CODEX_ENEMIES = ENEMIES.filter((e) => !e.boss && !['splitling', 'swarmling', 'minion'].includes(e.id));

export const ELITE_MODS: EliteModDef[] = [
  { id: 'swift', name: 'Swift', color: '#ffe14a', desc: 'Moves much faster.' },
  { id: 'armored', name: 'Armored', color: '#9a8cff', desc: '+5 armor.' },
  { id: 'regen', name: 'Regenerating', color: '#6dff9c', desc: 'Regenerates 4% HP per second.' },
  { id: 'volatile', name: 'Volatile', color: '#ff4a4a', desc: 'On death, fires bombs at your defense line. Intercept them!' },
  { id: 'shielded', name: 'Shielded', color: '#5ad7ff', desc: 'An energy shield absorbs damage and blocks status effects until broken.' },
  { id: 'vampiric', name: 'Vampiric', color: '#ff2a55', desc: 'Heals itself whenever a nearby enemy dies.' },
];
export const ELITE_MAP: Record<string, EliteModDef> = Object.fromEntries(ELITE_MODS.map((e) => [e.id, e]));

export const BOSSES: BossDef[] = [
  { id: 'fortress', name: 'The Fortress', title: 'Citadel of Walls', enemy: 'boss_fortress', desc: 'Rotating shields deflect your ball. Hit the core through the gaps.' },
  { id: 'magnetar', name: 'The Magnetar', title: 'Collapsed Star', enemy: 'boss_magnetar', desc: 'Gravity bends every shot; periodic pulses repel everything.' },
  { id: 'hydra', name: 'The Hydra', title: 'Endless Heads', enemy: 'boss_hydra', desc: 'Splits into more heads as it takes damage.' },
];
export const BOSS_MAP: Record<string, BossDef> = Object.fromEntries(BOSSES.map((b) => [b.id, b]));
