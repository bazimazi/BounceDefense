import { localize } from '../i18n/content';
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
    hpMult: 1.15, spawnMult: 1.08,
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
      { id: 'magma_escort', members: [['magma_golem', 1], ['runner', 2]], formation: 'v', minTime: 220, weight: 2 },
    ]),
    events: ['blood_moon', 'overcharge', 'gravity_storm', 'jackpot'],
  },
  {
    id: 'rift', name: 'Void Rift', desc: 'Portals and gravity wells. Space itself is a weapon.',
    theme: { bg0: '#05030d', bg1: '#140a2a', grid: 'rgba(199,125,255,0.07)', wall: '#c77dff', accent: '#e0b3ff' },
    bossId: 'hydra',
    unlockReq: { boss: 'magnetar', text: 'Defeat The Magnetar' },
    hpMult: 1.25, spawnMult: 1.12,
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
  {
    id: 'blight', name: 'The Blight', desc: 'Toxic spore pods and a living floor. Poison rules here.',
    theme: { bg0: '#050d05', bg1: '#13240e', grid: 'rgba(166,255,77,0.07)', wall: '#8fdc4a', accent: '#c4ff7a' },
    bossId: 'broodmother',
    unlockReq: { boss: 'hydra', text: 'Defeat The Hydra' },
    hpMult: 1.32, spawnMult: 1.14,
    layouts: [
      [
        { kind: 'spore', x: 120, y: 380 }, { kind: 'spore', x: 420, y: 380 }, { kind: 'spore', x: 270, y: 560 },
        { kind: 'bumper', x: 270, y: 300, r: 18 },
        { kind: 'oil', x: 110, y: 600, r: 40 }, { kind: 'oil', x: 430, y: 600, r: 40 },
      ],
      [
        { kind: 'spore', x: 90, y: 320 }, { kind: 'spore', x: 450, y: 320 }, { kind: 'spore', x: 190, y: 520 }, { kind: 'spore', x: 350, y: 520 },
        { kind: 'deflector', ax: 0, ay: 560, bx: 46, by: 505 },
        { kind: 'deflector', ax: 540, ay: 560, bx: 494, by: 505 },
      ],
      [
        { kind: 'spore', x: 270, y: 420 },
        { kind: 'bumper', x: 150, y: 330, r: 18 }, { kind: 'bumper', x: 390, y: 330, r: 18 },
        { kind: 'well', x: 270, y: 560, r: 80, strength: 380 },
      ],
    ],
    squads: COMMON_SQUADS.concat([
      { id: 'spitters', members: [['spitter', 2], ['grunt', 2]], formation: 'line', minTime: 45, weight: 6 },
      { id: 'mite_swarm', members: [['mite', 6]], formation: 'scatter', minTime: 20, weight: 6 },
      { id: 'blight_hive', members: [['spawner', 1], ['mite', 3]], formation: 'cluster', minTime: 150, weight: 3 },
      { id: 'acid_battery', members: [['spitter', 3], ['healer', 1]], formation: 'v', minTime: 190, weight: 4 },
      { id: 'magma_walk', members: [['magma_golem', 1], ['grunt', 3]], formation: 'v', minTime: 170, weight: 3 },
    ]),
    events: ['toxic_rain', 'swarm_surge', 'blood_moon', 'overcharge'],
  },
  {
    id: 'spire', name: 'Chrono Spire', desc: 'Tesla pylons and booster pads in a tower where time runs thin.',
    theme: { bg0: '#0f0a03', bg1: '#2a1d08', grid: 'rgba(255,210,122,0.07)', wall: '#e0b25a', accent: '#ffd27a' },
    bossId: 'chronarch',
    unlockReq: { boss: 'broodmother', text: 'Defeat The Broodmother' },
    hpMult: 1.4, spawnMult: 1.16,
    layouts: [
      [
        { kind: 'pylon', x: 130, y: 360, r: 15 }, { kind: 'pylon', x: 410, y: 360, r: 15 },
        { kind: 'booster', x: 270, y: 520, r: 42 },
        { kind: 'bumper', x: 270, y: 300, r: 16 },
      ],
      [
        { kind: 'pylon', x: 270, y: 330, r: 17 },
        { kind: 'booster', x: 120, y: 560, r: 38 }, { kind: 'booster', x: 420, y: 560, r: 38 },
        { kind: 'deflector', ax: 0, ay: 176, bx: 64, by: 96 },
        { kind: 'deflector', ax: 540, ay: 176, bx: 476, by: 96 },
      ],
      [
        { kind: 'pylon', x: 150, y: 470, r: 14 }, { kind: 'pylon', x: 390, y: 470, r: 14 },
        { kind: 'portal', ax: 70, ay: 620, bx: 470, by: 230 },
        { kind: 'booster', x: 270, y: 380, r: 36 },
      ],
    ],
    squads: COMMON_SQUADS.concat([
      { id: 'phantoms', members: [['phantom', 3]], formation: 'scatter', minTime: 50, weight: 6 },
      { id: 'grounded', members: [['insulator', 2], ['runner', 3]], formation: 'v', minTime: 80, weight: 5 },
      { id: 'pulsars', members: [['pulsar', 1], ['grunt', 3]], formation: 'cluster', minTime: 110, weight: 5 },
      { id: 'ram', members: [['juggernaut', 1], ['phantom', 2]], formation: 'v', minTime: 170, weight: 4 },
      { id: 'cold_front', members: [['frost_golem', 1], ['spitter', 2]], formation: 'line', minTime: 200, weight: 3 },
    ]),
    events: ['time_warp', 'meteor_shower', 'double_bounce', 'gravity_storm'],
  },
  {
    id: 'citadel', name: 'The Citadel', desc: 'A fortress of walls, crates and wards. Every angle is contested.',
    theme: { bg0: '#05080f', bg1: '#141c2b', grid: 'rgba(232,238,248,0.06)', wall: '#b9c6dc', accent: '#e8eef8' },
    bossId: 'architect',
    unlockReq: { boss: 'chronarch', text: 'Defeat The Chronarch' },
    hpMult: 1.42, spawnMult: 1.17,
    layouts: [
      [
        { kind: 'crate', x: 90, y: 420, w: 60, h: 22 }, { kind: 'crate', x: 390, y: 420, w: 60, h: 22 },
        { kind: 'pylon', x: 270, y: 330, r: 15 },
        { kind: 'deflector', ax: 0, ay: 560, bx: 46, by: 505 },
        { kind: 'deflector', ax: 540, ay: 560, bx: 494, by: 505 },
      ],
      [
        { kind: 'bumper', x: 150, y: 360, r: 18 }, { kind: 'bumper', x: 390, y: 360, r: 18 },
        { kind: 'crate', x: 240, y: 500, w: 60, h: 22 },
        { kind: 'booster', x: 270, y: 620, r: 34 },
      ],
      [
        { kind: 'well', x: 270, y: 420, r: 95, strength: 440 },
        { kind: 'pylon', x: 110, y: 300, r: 14 }, { kind: 'pylon', x: 430, y: 300, r: 14 },
        { kind: 'crate', x: 70, y: 560, w: 50, h: 22 }, { kind: 'crate', x: 420, y: 560, w: 50, h: 22 },
      ],
    ],
    squads: COMMON_SQUADS.concat([
      { id: 'aegis_line', members: [['aegis', 1], ['grunt', 4]], formation: 'line', minTime: 60, weight: 6 },
      { id: 'raisers', members: [['necromancer', 1], ['runner', 3]], formation: 'v', minTime: 110, weight: 5 },
      { id: 'warded_rams', members: [['aegis', 1], ['juggernaut', 1]], formation: 'column', minTime: 180, weight: 4 },
      { id: 'golem_pair', members: [['frost_golem', 1], ['magma_golem', 1]], formation: 'line', minTime: 210, weight: 3 },
      { id: 'grave_guard', members: [['necromancer', 1], ['brute', 1], ['shielder', 2]], formation: 'v', minTime: 240, weight: 3, minDiff: 1 },
    ]),
    events: ['iron_tide', 'meteor_shower', 'blackout', 'ball_frenzy'],
  },
];

export const ARENA_MAP: Record<string, ArenaDef> = Object.fromEntries(ARENAS.map((a) => [a.id, a]));

export const DIFFICULTIES: DifficultyDef[] = [
  {
    id: 'normal', name: 'Normal', color: '#8fe3a0', desc: 'The intended first experience.',
    hpMult: 1.25, speedMult: 1, spawnMult: 1.5, eliteEvery: 150, eliteModCount: 1, bossHpMult: 1, growth: 2.4, dmgMult: 1.15, bosses: 1, traitChance: 0, rewardMult: 1,
    rules: [],
  },
  {
    id: 'veteran', name: 'Veteran', color: '#ffd166', desc: 'Tougher squads for a confident pilot.',
    hpMult: 1.75, speedMult: 1.08, spawnMult: 1.8, eliteEvery: 110, eliteModCount: 1, bossHpMult: 1.3, growth: 3.4, dmgMult: 1.27, bosses: 1, traitChance: 0, rewardMult: 1.4,
    rules: ['Elites appear more often', 'Advanced squads unlocked', 'Enemies are tougher and hit harder'],
  },
  {
    id: 'nightmare', name: 'Nightmare', color: '#ff7b54', desc: 'A real test of your build.',
    hpMult: 2.1, speedMult: 1.12, spawnMult: 1.95, eliteEvery: 90, eliteModCount: 2, bossHpMult: 1.5, growth: 3.8, dmgMult: 1.44, bosses: 2, traitChance: 0, rewardMult: 1.9,
    rules: ['A second boss arrives', 'Elites have 2 modifiers', 'Enemies toughen faster and hit harder'],
  },
  {
    id: 'inferno', name: 'Inferno', color: '#ff3d3d', desc: 'Even ordinary enemies turn dangerous.',
    hpMult: 2.6, speedMult: 1.16, spawnMult: 2.18, eliteEvery: 75, eliteModCount: 2, bossHpMult: 2, growth: 5.2, dmgMult: 1.73, bosses: 2, traitChance: 0.08, rewardMult: 2.5,
    rules: ['A second boss arrives', '8% of enemies spawn with an elite trait', 'Enemies toughen faster and hit harder'],
  },
  {
    id: 'abyss', name: 'Abyss', color: '#c77dff', desc: 'Everything at once, and something worse at the end.',
    hpMult: 3.3, speedMult: 1.2, spawnMult: 2.4, eliteEvery: 60, eliteModCount: 3, bossHpMult: 3.6, growth: 7.2, dmgMult: 2.3, bosses: 2, apex: ['colossus'], traitChance: 0.15, hostileEvents: true, rewardMult: 3.2,
    rules: ['Two bosses, then the apex boss The Colossus', '15% of enemies spawn with an elite trait', 'Elites have 3 modifiers', 'Enemies toughen much faster and hit much harder', 'Arena events are always hostile'],
  },
  // Beyond Abyss: each tier is built to be lost until the Overdrive Workshop has caught up with it.
  {
    id: 'oblivion', name: 'Oblivion', color: '#8f9bff', desc: 'Where finished builds go to be tested again.',
    hpMult: 3.6, speedMult: 1.23, spawnMult: 2.55, eliteEvery: 55, eliteModCount: 3, bossHpMult: 9, growth: 8, lateHp: 2.5, dmgMult: 2.8, bosses: 2, apex: ['overmind'], traitChance: 0.2, hostileEvents: true, rewardMult: 4.2,
    rules: ['Two bosses, then the apex boss The Overmind', '20% of enemies spawn with an elite trait', 'Elites arrive every 55 seconds', 'Arena events are always hostile'],
  },
  {
    id: 'cataclysm', name: 'Cataclysm', color: '#ff5fa2', desc: 'The arena itself wants you gone.',
    hpMult: 3.9, speedMult: 1.26, spawnMult: 2.7, eliteEvery: 50, eliteModCount: 4, bossHpMult: 18, growth: 8.8, lateHp: 4, dmgMult: 3.3, bosses: 2, apex: ['twins'], traitChance: 0.25, hostileEvents: true, rewardMult: 5.4,
    rules: ['Two bosses, then the apex bosses The Twin Eclipse', '25% of enemies spawn with an elite trait', 'Elites have 4 modifiers', 'Arena events are always hostile'],
  },
  {
    id: 'singularity', name: 'Singularity', color: '#4de8ff', desc: 'All of it, pulled into one point.',
    hpMult: 4.2, speedMult: 1.29, spawnMult: 2.85, eliteEvery: 46, eliteModCount: 4, bossHpMult: 34, growth: 9.6, lateHp: 7, dmgMult: 3.9, bosses: 2, apex: ['sovereign'], traitChance: 0.3, hostileEvents: true, rewardMult: 6.8,
    rules: ['Two bosses, then the apex boss The Void Sovereign', '30% of enemies spawn with an elite trait', 'Elites have 4 modifiers', 'Arena events are always hostile'],
  },
  {
    id: 'pandemonium', name: 'Pandemonium', color: '#b6ff5c', desc: 'Two apex bosses. No rest between them.',
    hpMult: 4.5, speedMult: 1.32, spawnMult: 3, eliteEvery: 42, eliteModCount: 5, bossHpMult: 46, growth: 10.4, lateHp: 8, dmgMult: 4.6, bosses: 1, apex: ['twins', 'sovereign'], traitChance: 0.35, hostileEvents: true, rewardMult: 8.5,
    rules: ['One boss, then The Twin Eclipse and The Void Sovereign', '35% of enemies spawn with an elite trait', 'Elites have 5 modifiers', 'Arena events are always hostile'],
  },
  {
    id: 'eternity', name: 'Eternity', color: '#ffe9a8', desc: 'The last tier. Every apex boss is waiting.',
    hpMult: 4.8, speedMult: 1.35, spawnMult: 3.15, eliteEvery: 38, eliteModCount: 5, bossHpMult: 76, growth: 11.2, lateHp: 12, dmgMult: 5.4, bosses: 1, apex: ['colossus', 'overmind', 'sovereign'], traitChance: 0.4, hostileEvents: true, rewardMult: 10.5,
    rules: ['One boss, then The Colossus, The Overmind and The Void Sovereign', '40% of enemies spawn with an elite trait', 'Elites have 5 modifiers', 'Arena events are always hostile'],
  },
];

// Rewards track measured difficulty (npm run balance): Lone Ball is the hardest pact (milestones sharpen
// the single ball instead of adding more), then Haste and Glass Heart.
export const PACTS: PactDef[] = [
  { id: 'haste', name: 'Haste', icon: '💨', desc: '+40% enemy speed.', reward: 0.5, rule: 'haste' },
  { id: 'fortified', name: 'Fortified', icon: '🧱', desc: '+35% enemy health.', reward: 0.35, rule: 'fortified' },
  { id: 'fragile', name: 'Glass Heart', icon: '💔', desc: 'Half max HP.', reward: 0.4, mods: [{ stat: 'maxHp', mult: -0.5 }], rule: 'fragile' },
  { id: 'no_heal', name: 'Bloodless', icon: '🚫', desc: 'No healing of any kind.', reward: 0.3, rule: 'noHeal' },
  { id: 'lone_ball', name: 'Lone Ball', icon: '1️⃣', desc: 'You can never have more than one ball. Ball milestones make it hit harder instead.', reward: 0.6, rule: 'loneBall' },
  { id: 'no_reroll', name: 'Fate Sealed', icon: '🔒', desc: 'No rerolls or banishes.', reward: 0.15, rule: 'noReroll' },
  { id: 'elite_surge', name: 'Elite Surge', icon: '👑', desc: 'Elites arrive twice as often.', reward: 0.35, rule: 'eliteSurge', flag: 'pacts2' },
  { id: 'ironclad', name: 'Ironclad', icon: '🛡️', desc: 'Every enemy gains +3 armor.', reward: 0.3, rule: 'ironclad', flag: 'pacts2' },
  { id: 'relicless', name: 'Relicless', icon: '🏺', desc: 'No relics can be found.', reward: 0.25, rule: 'noRelic', flag: 'pacts2' },
  { id: 'short_fuse', name: 'Short Fuse', icon: '🧨', desc: 'The first boss arrives 90 seconds sooner.', reward: 0.3, rule: 'shortFuse', flag: 'pacts2' },
];
export const PACT_MAP: Record<string, PactDef> = Object.fromEntries(PACTS.map((p) => [p.id, p]));

export const ARENA_EVENTS: ArenaEventDef[] = [
  { id: 'double_bounce', name: 'Double Bounce', icon: '🔁', color: '#8fa8ff', duration: 22, desc: 'Every wall bounce counts twice and sparks damage.' },
  { id: 'ball_frenzy', name: 'Ball Frenzy', icon: '🎱', color: '#7dff8a', duration: 18, desc: 'Temporary balls rain into the arena!' },
  { id: 'jackpot', name: 'Jackpot', icon: '🎰', color: '#ffd84a', duration: 20, desc: 'Golden wisps swarm the arena. Catch them!' },
  { id: 'overcharge', name: 'Overcharge', icon: '⚡', color: '#5ee7ff', duration: 20, desc: 'Elemental chances doubled.' },
  { id: 'blood_moon', name: 'Blood Moon', icon: '🌕', color: '#ff2a55', duration: 25, desc: 'Enemies are stronger, but drop double rewards.', hostile: true },
  { id: 'gravity_storm', name: 'Gravity Storm', icon: '🌀', color: '#c77dff', duration: 20, desc: 'Gravity shifts sideways every few seconds.', hostile: true },
  { id: 'blackout', name: 'Blackout', icon: '🌑', color: '#6c6c9c', duration: 18, desc: 'Darkness falls. Only your balls and their effects give light. +50% XP.', hostile: true },
  { id: 'toxic_rain', name: 'Toxic Rain', icon: '☔', color: '#a6ff4d', duration: 20, desc: 'Acid clouds drift down and poison every enemy they touch.' },
  { id: 'time_warp', name: 'Time Warp', icon: '⏳', color: '#ffd27a', duration: 18, desc: 'Enemies slow to a crawl while your balls fly 20% faster.' },
  { id: 'meteor_shower', name: 'Meteor Shower', icon: '☄️', color: '#ff9a3d', duration: 16, desc: 'Meteors rain down on the thickest crowds.' },
  { id: 'swarm_surge', name: 'Swarm Surge', icon: '🦟', color: '#c8ff6b', duration: 20, desc: 'Mite swarms pour into the arena. +50% XP.', hostile: true },
  { id: 'iron_tide', name: 'Iron Tide', icon: '⚙️', color: '#9aa6c8', duration: 22, desc: 'New enemies arrive armored and shielded, but drop double coins.', hostile: true },
];
export const HOSTILE_EVENTS: string[] = ARENA_EVENTS.filter((e) => e.hostile).map((e) => e.id);
export const EVENT_MAP: Record<string, ArenaEventDef> = Object.fromEntries(ARENA_EVENTS.map((e) => [e.id, e]));

localize('arena', ARENAS, ['name', 'desc', 'unlockReq.text']);
localize('difficulty', DIFFICULTIES, ['name', 'desc', 'rules']);
localize('pact', PACTS, ['name', 'desc']);
localize('event', ARENA_EVENTS, ['name', 'desc']);
