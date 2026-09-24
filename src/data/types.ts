import type { Modifier } from '../sim/stats';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Element = 'fire' | 'ice' | 'lightning';
export type UpgradeCategory = 'offense' | 'physics' | 'multiply' | 'element' | 'defense' | 'utility';
export type Tag =
  | 'impact' | 'crit' | 'ricochet' | 'kinetic' | 'swarm' | 'fire' | 'ice' | 'lightning'
  | 'element' | 'explosion' | 'vampire' | 'bleed' | 'defense' | 'tank' | 'utility'
  | 'combo' | 'momentum' | 'control' | 'chain';

export interface UpgradeDef {
  id: string;
  name: string;
  icon: string;
  category: UpgradeCategory;
  rarity: Rarity;
  maxLevel: number;
  tags: Tag[];
  /** Text shown on the card when taking this level. */
  desc: (level: number) => string;
  /** Total modifiers granted at a given level. */
  mods?: (level: number) => Modifier[];
  /** Behavior granted (receives the level as its power). */
  behavior?: string;
  /** Requires a meta unlock (research/achievement/mastery) to enter the pool. */
  locked?: boolean;
  /** Only offered when this core is equipped. */
  core?: string;
  weight?: number;
}

/** Read-only view used by synergy/evolution predicates. */
export interface BuildView {
  level(id: string): number;
  tag(tag: Tag): number;
  hasEvolution(id: string): boolean;
  core: string;
}

export interface SynergyDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** Hint shown in the codex before discovery. */
  hint: string;
  tier: 'known' | 'hidden' | 'legendary';
  requires: (b: BuildView) => boolean;
  mods?: Modifier[];
  behavior?: string;
}

export interface EvolutionDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  recipe: { id: string; level: number }[];
  mods?: Modifier[];
  behavior: string;
  color: string;
}

export interface ReactionDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  elements: [Element, Element];
}

export type EnemyShape = 'circle' | 'triangle' | 'square' | 'hex' | 'diamond' | 'cross' | 'star' | 'ring' | 'mirror' | 'hourglass';
export type Material = 'flesh' | 'metal' | 'stone' | 'energy' | 'crystal';

export interface EnemyDef {
  id: string;
  name: string;
  desc: string;
  /** Counter-play hint shown in the codex. */
  tip: string;
  hp: number;
  speed: number;
  radius: number;
  armor: number;
  /** Damage dealt to the defense line on arrival. */
  damage: number;
  xp: number;
  coins: number;
  threat: number;
  shape: EnemyShape;
  color: string;
  material: Material;
  ai: 'walker' | 'runner' | 'shielder' | 'healer' | 'spawner' | 'magnet' | 'teleporter' | 'warden' | 'golden' | 'boss' | 'minion';
  /** Direct ball damage multiplier (reflector takes reduced direct hits). */
  directMult?: number;
  splitsInto?: { id: string; count: number };
  deathBlast?: { radius: number; damage: number };
  boss?: boolean;
}

export interface EliteModDef {
  id: string;
  name: string;
  color: string;
  desc: string;
}

export interface CoreDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  element?: Element;
  desc: string;
  passive: string;
  mods: Modifier[];
  startUpgrades: string[];
  behavior?: string;
  unlockCost: number; // Cores currency
  unlockReq?: { achievement?: string; boss?: string; text: string };
}

export type PartSlot = 'shell' | 'impact' | 'momentum';

export interface PartDef {
  id: string;
  slot: PartSlot;
  name: string;
  icon: string;
  desc: string;
  mods: Modifier[];
  behavior?: string;
  /** Unlocked by default when absent. */
  unlock?: { coins?: number; achievement?: string; text: string };
}

export interface SquadDef {
  id: string;
  members: [string, number][];
  formation: 'line' | 'cluster' | 'column' | 'v' | 'scatter';
  minTime: number;
  maxTime?: number;
  weight: number;
  /** Minimum difficulty index. */
  minDiff?: number;
}

export type ObstacleTemplate =
  | { kind: 'bumper'; x: number; y: number; r: number }
  | { kind: 'deflector'; ax: number; ay: number; bx: number; by: number }
  | { kind: 'barrel'; x: number; y: number }
  | { kind: 'oil'; x: number; y: number; r: number }
  | { kind: 'crate'; x: number; y: number; w: number; h: number }
  | { kind: 'portal'; ax: number; ay: number; bx: number; by: number }
  | { kind: 'well'; x: number; y: number; r: number; strength: number };

export interface ArenaDef {
  id: string;
  name: string;
  desc: string;
  theme: { bg0: string; bg1: string; grid: string; wall: string; accent: string };
  bossId: string;
  /** Layout variants; one is chosen (possibly mirrored/jittered) per run. */
  layouts: ObstacleTemplate[][];
  squads: SquadDef[];
  events: string[];
  unlockReq?: { boss: string; text: string };
}

export interface BossDef {
  id: string;
  name: string;
  title: string;
  desc: string;
  enemy: string;
}

export interface DifficultyDef {
  id: string;
  name: string;
  color: string;
  desc: string;
  hpMult: number;
  speedMult: number;
  spawnMult: number;
  eliteEvery: number;
  eliteModCount: number;
  bossHpMult: number;
  secondBoss: boolean;
  rewardMult: number;
  rules: string[];
}

export interface PactDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  reward: number; // added reward multiplier
  mods?: Modifier[];
  rule?: 'noHeal' | 'loneBall' | 'haste' | 'fortified' | 'fragile' | 'noReroll';
}

export interface ArenaEventDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  duration: number;
  color: string;
}
