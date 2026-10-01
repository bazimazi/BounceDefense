import type { ArenaDef, ArenaEventDef, DifficultyDef, PactDef, SquadDef } from './types';

const COMMON_SQUADS: SquadDef[] = [
  { id: 'grunt_line', members: [['grunt', 3]], formation: 'line', minTime: 0, weight: 10 },
  { id: 'grunt_col', members: [['grunt', 4]], formation: 'column', minTime: 35, weight: 6 },
  { id: 'runners', members: [['runner', 3]], formation: 'scatter', minTime: 25, weight: 6 },
  { id: 'brute_escort', members: [['brute', 1], ['grunt', 2]], formation: 'v', minTime: 60, weight: 6 },
  { id: 'shield_wall', members: [['shielder', 3]], formation: 'line', minTime: 130, weight: 4 },
  { id: 'splitters', members: [['splitter', 2]], formation: 'scatter', minTime: 95, weight: 5 },
  { id: 'bombers', members: [['bomber', 2], ['grunt', 3]], formation: 'cluster', minTime: 120, weight: 5 },
  // composition-based threats: combinations, not just bigger numbers
  { id: 'mended_tanks', members: [['healer', 1], ['brute', 2]], formation: 'cluster', minTime: 160, weight: 5 },
  { id: 'shield_hive', members: [['spawner', 1], ['shielder', 2]], formation: 'v', minTime: 230, weight: 3, minDiff: 1 },
  { id: 'mirror_swarm', members: [['reflector', 1], ['runner', 4]], formation: 'scatter', minTime: 250, weight: 3 },
];

export const ARENAS: ArenaDef[] = [
  {
    id: 'proving', name: 'Proving Grounds', desc: 'Bumpers and bank walls. Learn the angles.',
    theme: { bg0: '#07111d', bg1: '#122b3b', grid: 'rgba(130,220,210,0.07)', wall: '#63bfb9', accent: '#9aeadb' },
    bossId: 'fortress',
    layouts: [
      [
        { kind: 'bumper', x: 135, y: 430, r: 22 },
        { kind: 'bumper', x: 405, y: 430, r: 22 },
        { kind: 'deflector', ax: 0, ay: 176, bx: 64, by: 96 },
        { kind: 'deflector', ax: 540, ay: 176, bx: 476, by: 96 },
      ],
      [
        { kind: 'bumper', x: 270, y: 400, r: 26 },
        { kind: 'deflector', ax: 0, ay: 560, bx: 46, by: 505 },
        { kind: 'deflector', ax: 540, ay: 560, bx: 494, by: 505 },
      ],
      [
        { kind: 'bumper', x: 170, y: 330, r: 18 },
        { kind: 'bumper', x: 370, y: 330, r: 18 },
        { kind: 'bumper', x: 270, y: 490, r: 18 },
      ],
    ],
    squads: COMMON_SQUADS.filter((s) => !['shield_hive', 'mirror_swarm'].includes(s.id)).concat([
      { id: 'healer_line', members: [['healer', 1], ['grunt', 4]], formation: 'line', minTime: 140, weight: 4 },
    ]),
    events: ['double_bounce', 'ball_frenzy', 'jackpot', 'overcharge'],
  },
  {
    id: 'foundry', name: 'The Foundry', desc: 'Explosive barrels, oil slicks and scrap. Fire builds thrive.',
    theme: { bg0: '#140a06', bg1: '#2a130b', grid: 'rgba(255,140,60,0.07)', wall: '#ff8a3d', accent: '#ffb86b' },
    bossId: 'magnetar',
    unlockReq: { boss: 'fortress', text: 'Defeat The Fortress' },
    layouts: [
      [
        { kind: 'barrel', x: 120, y: 370 }, { kind: 'barrel', x: 420, y: 370 }, { kind: 'barrel', x: 270, y: 540 },
        { kind: 'oil', x: 270, y: 300, r: 55 }, { kind: 'oil', x: 110, y: 560, r: 42 }, { kind: 'oil', x: 430, y: 560, r: 42 },
        { kind: 'crate', x: 240, y: 430, w: 60, h: 22 },
      ],
      [
        { kind: 'barrel', x: 90, y: 300 }, { kind: 'barrel', x: 450, y: 300 }, { kind: 'barrel', x: 190, y: 500 }, { kind: 'barrel', x: 350, y: 500 },
        { kind: 'oil', x: 270, y: 420, r: 70 },
        { kind: 'crate', x: 70, y: 430, w: 50, h: 22 }, { kind: 'crate', x: 420, y: 430, w: 50, h: 22 },
      ],
    ],
    squads: COMMON_SQUADS.concat([
      { id: 'magnet_bombs', members: [['magnet', 1], ['bomber', 3]], formation: 'cluster', minTime: 170, weight: 5 },
      { id: 'hive', members: [['spawner', 1]], formation: 'scatter', minTime: 140, weight: 3 },
    ]),
    events: ['blood_moon', 'overcharge', 'gravity_storm', 'jackpot'],
  },
  {
    id: 'rift', name: 'Void Rift', desc: 'Portals and gravity wells. Space itself is a weapon.',
    theme: { bg0: '#05030d', bg1: '#140a2a', grid: 'rgba(199,125,255,0.07)', wall: '#c77dff', accent: '#e0b3ff' },
    bossId: 'hydra',
    unlockReq: { boss: 'magnetar', text: 'Defeat The Magnetar' },
    layouts: [
      [
        { kind: 'portal', ax: 70, ay: 600, bx: 470, by: 210 },
        { kind: 'well', x: 270, y: 400, r: 110, strength: 520 },
        { kind: 'bumper', x: 110, y: 300, r: 16 }, { kind: 'bumper', x: 430, y: 470, r: 16 },
      ],
      [
        { kind: 'portal', ax: 470, ay: 600, bx: 70, by: 210 },
        { kind: 'well', x: 150, y: 360, r: 90, strength: 460 },
        { kind: 'well', x: 390, y: 360, r: 90, strength: 460 },
      ],
    ],
    squads: COMMON_SQUADS.concat([
      { id: 'blinkers', members: [['teleporter', 3]], formation: 'scatter', minTime: 60, weight: 6 },
      { id: 'warden_escort', members: [['warden', 1], ['grunt', 3]], formation: 'v', minTime: 120, weight: 4 },
      { id: 'lodestones', members: [['magnet', 2], ['runner', 3]], formation: 'scatter', minTime: 150, weight: 4 },
    ]),
    events: ['gravity_storm', 'blackout', 'ball_frenzy', 'double_bounce'],
  },
];

export const ARENA_MAP: Record<string, ArenaDef> = Object.fromEntries(ARENAS.map((a) => [a.id, a]));

export const DIFFICULTIES: DifficultyDef[] = [
  {
    id: 'normal', name: 'Normal', color: '#8fe3a0', desc: 'The intended first experience.',
    hpMult: 1, speedMult: 1, spawnMult: 1, eliteEvery: 150, eliteModCount: 1, bossHpMult: 1, secondBoss: false, rewardMult: 1,
    rules: [],
  },
  {
    id: 'veteran', name: 'Veteran', color: '#ffd166', desc: 'More elites, composition squads earlier.',
    hpMult: 1.25, speedMult: 1.08, spawnMult: 1.15, eliteEvery: 110, eliteModCount: 1, bossHpMult: 1.3, secondBoss: false, rewardMult: 1.4,
    rules: ['Elites appear more often', 'Advanced squads unlocked'],
  },
  {
    id: 'nightmare', name: 'Nightmare', color: '#ff7b54', desc: 'Two bosses. Elites carry two modifiers.',
    hpMult: 1.5, speedMult: 1.12, spawnMult: 1.3, eliteEvery: 90, eliteModCount: 2, bossHpMult: 1.5, secondBoss: true, rewardMult: 1.9,
    rules: ['A second boss arrives', 'Elites have 2 modifiers'],
  },
  {
    id: 'inferno', name: 'Inferno', color: '#ff3d3d', desc: 'Regular enemies may spawn with elite traits.',
    hpMult: 1.85, speedMult: 1.16, spawnMult: 1.45, eliteEvery: 75, eliteModCount: 2, bossHpMult: 1.8, secondBoss: true, rewardMult: 2.5,
    rules: ['A second boss arrives', '8% of enemies spawn with an elite trait'],
  },
  {
    id: 'abyss', name: 'Abyss', color: '#c77dff', desc: 'Everything at once. Arena events are always hostile.',
    hpMult: 2.3, speedMult: 1.2, spawnMult: 1.6, eliteEvery: 60, eliteModCount: 3, bossHpMult: 2.2, secondBoss: true, rewardMult: 3.2,
    rules: ['A second boss arrives', '15% of enemies spawn with an elite trait', 'Elites have 3 modifiers'],
  },
];

export const PACTS: PactDef[] = [
  { id: 'haste', name: 'Haste', icon: '💨', desc: '+40% enemy speed.', reward: 0.4, rule: 'haste' },
  { id: 'fortified', name: 'Fortified', icon: '🧱', desc: '+35% enemy health.', reward: 0.35, rule: 'fortified' },
  { id: 'fragile', name: 'Glass Heart', icon: '💔', desc: 'Half max HP.', reward: 0.5, mods: [{ stat: 'maxHp', mult: -0.5 }], rule: 'fragile' },
  { id: 'no_heal', name: 'Bloodless', icon: '🚫', desc: 'No healing of any kind.', reward: 0.3, rule: 'noHeal' },
  { id: 'lone_ball', name: 'Lone Ball', icon: '1️⃣', desc: 'You can never have more than one ball.', reward: 0.8, rule: 'loneBall' },
  { id: 'no_reroll', name: 'Fate Sealed', icon: '🔒', desc: 'No rerolls or banishes.', reward: 0.25, rule: 'noReroll' },
];
export const PACT_MAP: Record<string, PactDef> = Object.fromEntries(PACTS.map((p) => [p.id, p]));

export const ARENA_EVENTS: ArenaEventDef[] = [
  { id: 'double_bounce', name: 'Double Bounce', icon: '🔁', color: '#8fa8ff', duration: 22, desc: 'Every wall bounce counts twice and sparks damage.' },
  { id: 'ball_frenzy', name: 'Ball Frenzy', icon: '🎱', color: '#7dff8a', duration: 18, desc: 'Temporary balls rain into the arena!' },
  { id: 'jackpot', name: 'Jackpot', icon: '🎰', color: '#ffd84a', duration: 20, desc: 'Golden wisps swarm the arena. Catch them!' },
  { id: 'overcharge', name: 'Overcharge', icon: '⚡', color: '#5ee7ff', duration: 20, desc: 'Elemental chances doubled.' },
  { id: 'blood_moon', name: 'Blood Moon', icon: '🌕', color: '#ff2a55', duration: 25, desc: 'Enemies are stronger, but drop double rewards.' },
  { id: 'gravity_storm', name: 'Gravity Storm', icon: '🌀', color: '#c77dff', duration: 20, desc: 'Gravity shifts sideways every few seconds.' },
  { id: 'blackout', name: 'Blackout', icon: '🌑', color: '#6c6c9c', duration: 18, desc: 'Darkness falls. Only your balls and their effects give light. +50% XP.' },
];
export const EVENT_MAP: Record<string, ArenaEventDef> = Object.fromEntries(ARENA_EVENTS.map((e) => [e.id, e]));
