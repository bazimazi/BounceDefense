import type { EnemyDef, Material } from '../data/types';

export const W = 540;
export const H = 960;
export const FIELD_TOP = 96;
export const DEFENSE_Y = 790;
export const FLOOR_Y = 880;
export const LAUNCHER_X = 270;
export const LAUNCHER_Y = 850;
export const SIM_DT = 1 / 120;
export const MAX_BALLS_TOTAL = 64;
export const MAX_ENEMIES = 280;
export const TRAIL_LEN = 14;

export type BallKind = 'main' | 'shard' | 'clone' | 'frenzy';

export interface Ball {
  id: number;
  kind: BallKind;
  x: number;
  y: number;
  /** Unit direction. Balls move at constant speed: predictable, readable trajectories. */
  dx: number;
  dy: number;
  r: number;
  state: 'flight' | 'returning';
  returnT: number;
  rx: number;
  ry: number;
  wallBounces: number;
  bounceChain: number;
  momentum: number;
  floorBounces: number;
  pierceLeft: number;
  dmgMult: number;
  powered: boolean;
  /** Seconds to live for temporary balls; -1 for permanent. */
  life: number;
  recentId: number[];
  recentT: number[];
  trail: number[];
  boost: number;
  portalCd: number;
  phased: boolean;
  splitGen: number;
  hitCounter: number;
  arcTimer: number;
  firstHitDone: boolean;
  dead: boolean;
  /** Visual pulse on impact. */
  pulse: number;
}

export interface Status {
  burnDps: number;
  burnT: number;
  burnTick: number;
  chill: number;
  chillT: number;
  frozenT: number;
  bleed: number;
  bleedT: number;
  bleedDps: number;
  bleedTick: number;
  reactCd: number;
}

export interface Enemy {
  id: number;
  def: EnemyDef;
  x: number;
  y: number;
  r: number;
  _q: number;
  hp: number;
  maxHp: number;
  speed: number;
  armor: number;
  kx: number;
  ky: number;
  st: Status;
  elite: string[];
  shieldHp: number;
  flash: number;
  alive: boolean;
  spawnT: number;
  /** Per-AI scratch state. */
  t0: number;
  t1: number;
  phase: number;
  gen: number;
  boss: boolean;
  killedBy: string;
  dmgAcc: number;
  dmgAccT: number;
  dmgAccCrit: boolean;
  wobble: number;
}

export type PickupKind = 'xp' | 'coin' | 'core' | 'heal' | 'mystery';

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  t: number;
  alive: boolean;
  homing: boolean;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  alive: boolean;
  color: string;
}

export type ZoneKind = 'fire' | 'frost' | 'pulse';

export interface Zone {
  kind: ZoneKind;
  x: number;
  y: number;
  r: number;
  t: number;
  dur: number;
  dps: number;
  tick: number;
  alive: boolean;
}

export type Obstacle =
  | { kind: 'bumper'; x: number; y: number; r: number; flash: number }
  | { kind: 'deflector'; ax: number; ay: number; bx: number; by: number; flash: number }
  | { kind: 'barrel'; x: number; y: number; r: number; alive: boolean; respawn: number }
  | { kind: 'oil'; x: number; y: number; r: number; burning: number }
  | { kind: 'crate'; x: number; y: number; w: number; h: number; hp: number; alive: boolean; respawn: number; flash: number }
  | { kind: 'portal'; ax: number; ay: number; bx: number; by: number; r: number; spin: number }
  | { kind: 'well'; x: number; y: number; r: number; strength: number };

/** Line segment collider. `owner` lets bosses own dynamic segments. */
export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  kind: 'wall' | 'deflector' | 'shield';
  ref?: { flash: number };
}

/** Visual/audio events produced by the simulation; consumed by renderer and audio. */
export type Fx =
  | { t: 'starfall'; pts: number[] }
  | { t: 'hit'; x: number; y: number; crit: boolean; mat: Material; power: number; color: string }
  | { t: 'dmg'; x: number; y: number; v: number; crit: boolean; color: string }
  | { t: 'wall'; x: number; y: number; nx: number; ny: number; color: string }
  | { t: 'explosion'; x: number; y: number; r: number; color: string }
  | { t: 'lightning'; pts: number[]; color: string }
  | { t: 'kill'; x: number; y: number; r: number; color: string; big: boolean }
  | { t: 'burst'; x: number; y: number; color: string; n: number; speed: number; size?: number }
  | { t: 'ring'; x: number; y: number; r: number; color: string; dur?: number }
  | { t: 'beam'; x0: number; y0: number; x1: number; y1: number; color: string }
  | { t: 'banner'; text: string; sub?: string; color: string; big?: boolean }
  | { t: 'shake'; amt: number }
  | { t: 'flash'; color: string; a: number }
  | { t: 'sfx'; name: string; pitch?: number; vol?: number }
  | { t: 'hurt'; x: number; dmg: number }
  | { t: 'heal'; x: number; y: number; v: number }
  | { t: 'slowmo'; dur: number; scale: number }
  | { t: 'text'; x: number; y: number; text: string; color: string };
