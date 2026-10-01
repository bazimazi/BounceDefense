export interface Loadout {
  core: string;
  shell: string;
  impact: string;
  momentum: string;
  trail: string;
}

export interface Settings {
  sfx: number;
  music: number;
  shake: boolean;
  damageNumbers: boolean;
  reducedFlashes: boolean;
  aimMode: 'direct' | 'slingshot';
  debug: boolean;
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
}

export type DiscoveryCat = 'enemies' | 'bosses' | 'synergies' | 'evolutions' | 'reactions' | 'upgrades' | 'arenas' | 'events';

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
}

export interface RunSummary {
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
}

export type Unlock =
  | { type: 'upgrade'; id: string }
  | { type: 'part'; id: string }
  | { type: 'core'; id: string }
  | { type: 'cosmetic'; id: string }
  | { type: 'flag'; id: string }
  | { type: 'coins'; amount: number }
  | { type: 'cores'; amount: number }
  | { type: 'research'; amount: number };
