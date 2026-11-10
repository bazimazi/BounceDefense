import type { Language } from '../i18n';
export interface Loadout {
  core: string;
  shell: string;
  impact: string;
  momentum: string;
  trail: string;
}

export interface Settings {
  /** UI language; `en` unless chosen, or detected from the device on first launch. */
  language: Language;
  sfx: number;
  music: number;
  shake: boolean;
  damageNumbers: boolean;
  aimMode: 'direct' | 'slingshot';
  debug: boolean;
  /** Short vibrations for hits taken, level-ups and big moments (devices with the Vibration API). */
  haptics: boolean;
  /** Mirrors Recall and Surge so the main action sits under the left thumb. */
  leftHanded: boolean;
  /** Softens full-screen flashes and the low-hull pulse. */
  reduceFlashes: boolean;
}

export interface LifetimeStats {
  runs: number;
  wins: number;
  kills: number;
  damage: number;
  bestCombo: number;
  maxWallChain: number;
  explosionKills: number;
  fireKills: number;
  lightningKills: number;
  frozen: number;
  bleedKills: number;
  healed: number;
  coinsEarned: number;
  evolutions: number;
  maxBallsInFlight: number;
  maxMomentumTier: number;
  elitesKilled: number;
  playTime: number;
  poisonKills: number;
  starfalls: number;
  goldenCaught: number;
  relicsFound: number;
  /** Highest Ascension level won. */
  maxAscension: number;
  contractsDone: number;
}

export type DiscoveryCat = 'enemies' | 'bosses' | 'synergies' | 'evolutions' | 'reactions' | 'upgrades' | 'arenas' | 'events' | 'relics';

export interface Profile {
  version: number;
  coins: number;
  cores: number;
  research: number;
  workshop: Record<string, number>;
  unlockedCores: string[];
  unlockedParts: string[];
  unlockedUpgrades: string[];
  researchNodes: string[];
  loadout: Loadout;
  presets: (Loadout & { name: string })[];
  mastery: Record<string, number>;
  /** Account-wide specialization, snapshotted when a run begins. */
  talents: Record<string, number>;
  discoveries: Record<DiscoveryCat, string[]>;
  achievements: string[];
  challenges: string[];
  cosmetics: string[];
  stats: LifetimeStats;
  /** arena id -> highest difficulty index cleared, -1 if never */
  cleared: Record<string, number>;
  bossKills: Record<string, number>;
  settings: Settings;
  tutorialDone: boolean;
  runsSinceUnlock: number;
  /** Daily Seed record for one UTC day: the first finished run claims a bonus. */
  daily: DailyRecord;
  /** Relics that can be found in runs, beyond the default set. */
  unlockedRelics: string[];
  /** Highest Ascension level open for play (0 until Abyss is won). */
  ascension: number;
  /** Pilot Rank experience: every run's Mastery XP also feeds it. */
  rankXp: number;
  contracts: ContractBoard;
}

export interface ContractBoard {
  /** `dailyKey()` the daily board was drawn for. */
  day: string;
  daily: ContractSlot[];
  /** ISO-like week key the weekly contract belongs to. */
  week: string;
  weekly: ContractSlot | null;
}

export interface ContractSlot {
  id: string;
  target: number;
  progress: number;
  done: boolean;
}

export interface DailyRecord {
  /** `dailyKey()` of the day this record describes; a new day starts fresh. */
  day: string;
  claimed: boolean;
  /** Most enemies destroyed in a Daily Seed run that day. */
  best: number;
  runs: number;
}

export interface RunSummary {
  powerShots?: number;
  starfalls?: number;
  recalls?: number;
  arena: string;
  difficulty: number;
  core: string;
  pacts: string[];
  seed: number;
  daily: boolean;
  victory: boolean;
  time: number;
  level: number;
  kills: number;
  eliteKills: number;
  bossesDefeated: string[];
  bossFightTimes: number[];
  bossNoDamage: boolean;
  damageDealt: number;
  damageTaken: number;
  healed: number;
  bestCombo: number;
  maxWallChain: number;
  maxBounceChain: number;
  maxBallsInFlight: number;
  maxBallsOwned: number;
  maxMomentumTier: number;
  fireKills: number;
  lightningKills: number;
  explosionKills: number;
  bleedKills: number;
  frozenCount: number;
  barrelsExploded: number;
  goldenCaught: number;
  coinsCollected: number;
  coresCollected: number;
  reactions: string[];
  synergies: string[];
  evolutions: string[];
  upgrades: { id: string; level: number }[];
  enemiesSeen: string[];
  eventsSeen: string[];
  buildName: string;
  buildStats: Record<string, number>;
  poisonKills?: number;
  relics?: string[];
  /** Seconds survived after continuing into Endless. */
  endlessTime?: number;
  ascension?: number;
}

export type Unlock =
  | { type: 'upgrade'; id: string }
  | { type: 'part'; id: string }
  | { type: 'core'; id: string }
  | { type: 'cosmetic'; id: string }
  | { type: 'flag'; id: string }
  | { type: 'coins'; amount: number }
  | { type: 'cores'; amount: number }
  | { type: 'research'; amount: number }
  | { type: 'relic'; id: string };
