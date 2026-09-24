import type { DiscoveryCat, Profile } from './types';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'bounce-defense-save';

export const DISCOVERY_CATS: DiscoveryCat[] = ['enemies', 'bosses', 'synergies', 'evolutions', 'reactions', 'upgrades', 'arenas', 'events'];

export function defaultProfile(): Profile {
  return {
    version: SAVE_VERSION,
    coins: 0,
    cores: 0,
    research: 0,
    workshop: {},
    unlockedCores: ['striker'],
    unlockedParts: [],
    unlockedUpgrades: [],
    researchNodes: [],
    loadout: { core: 'striker', shell: 'shell_std', impact: 'impact_std', momentum: 'mom_std', trail: 'classic' },
    presets: [],
    mastery: {},
    discoveries: { enemies: [], bosses: [], synergies: [], evolutions: [], reactions: [], upgrades: [], arenas: [], events: [] },
    achievements: [],
    challenges: [],
    cosmetics: ['classic'],
    stats: {
      runs: 0, wins: 0, kills: 0, damage: 0, bestCombo: 0, maxWallChain: 0, explosionKills: 0, fireKills: 0,
      lightningKills: 0, frozen: 0, bleedKills: 0, healed: 0, coinsEarned: 0, evolutions: 0, maxBallsInFlight: 0,
      maxMomentumTier: 0, elitesKilled: 0, playTime: 0,
    },
    cleared: {},
    bossKills: {},
    settings: { sfx: 0.8, music: 0.5, shake: true, damageNumbers: true, reducedFlashes: false, aimMode: 'direct', debug: false },
    tutorialDone: false,
    runsSinceUnlock: 0,
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep-merges saved data over defaults so new fields never break old saves. */
function mergeDefaults<T>(def: T, saved: unknown): T {
  if (Array.isArray(def)) return (Array.isArray(saved) ? saved : def) as T;
  if (isObj(def)) {
    const out: Record<string, unknown> = { ...def };
    if (isObj(saved)) {
      for (const k of Object.keys(saved)) {
        out[k] = k in def ? mergeDefaults((def as Record<string, unknown>)[k], saved[k]) : saved[k];
      }
    }
    return out as T;
  }
  if (saved === undefined || saved === null) return def;
  return (typeof saved === typeof def ? saved : def) as T;
}

/** Upgrades older saves to the current version. */
export function migrate(raw: unknown): Profile {
  const base = defaultProfile();
  if (!isObj(raw)) return base;
  const v = typeof raw.version === 'number' ? raw.version : 0;
  const data: Record<string, unknown> = { ...raw };
  if (v < 1) {
    // v0 (prototype) stored `gold` instead of `coins`
    if (typeof data.gold === 'number' && data.coins === undefined) data.coins = data.gold;
    delete data.gold;
  }
  if (v < 2) {
    // v1 had no trail in the loadout
    if (isObj(data.loadout) && !data.loadout.trail) data.loadout = { ...data.loadout, trail: 'classic' };
  }
  const p = mergeDefaults(base, data);
  p.version = SAVE_VERSION;
  if (!p.unlockedCores.includes('striker')) p.unlockedCores.unshift('striker');
  if (!p.cosmetics.includes('classic')) p.cosmetics.unshift('classic');
  return p;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadProfile(store: KeyValueStore | undefined): Profile {
  if (!store) return defaultProfile();
  try {
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return defaultProfile();
    return migrate(JSON.parse(raw));
  } catch {
    // Corrupted save: try the backup before giving up.
    try {
      const bak = store.getItem(SAVE_KEY + '-backup');
      if (bak) return migrate(JSON.parse(bak));
    } catch {
      /* ignore */
    }
    return defaultProfile();
  }
}

export function saveProfile(store: KeyValueStore | undefined, p: Profile): void {
  if (!store) return;
  try {
    const prev = store.getItem(SAVE_KEY);
    if (prev) store.setItem(SAVE_KEY + '-backup', prev);
    store.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {
    /* storage full / unavailable: progression stays in memory for this session */
  }
}

export function safeLocalStorage(): KeyValueStore | undefined {
  try {
    const s = globalThis.localStorage;
    s.setItem('__t', '1');
    s.removeItem('__t');
    return s;
  } catch {
    return undefined;
  }
}
