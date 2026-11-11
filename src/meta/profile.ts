import { DEFAULT_LANGUAGE, isLanguage } from '../i18n';
import type { DiscoveryCat, Profile } from './types';
import { normalizeTalents } from '../data/talents';
import { MAX_ASCENSION } from '../data/ascension';
import { talentProgress, talentWins } from './talents';

export const SAVE_VERSION = 4;
export const SAVE_KEY = 'bounce-defense-save';

export const DISCOVERY_CATS: DiscoveryCat[] = ['enemies', 'bosses', 'synergies', 'evolutions', 'reactions', 'upgrades', 'arenas', 'events', 'relics'];

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
    talents: {},
    discoveries: { enemies: [], bosses: [], synergies: [], evolutions: [], reactions: [], upgrades: [], arenas: [], events: [], relics: [] },
    achievements: [],
    challenges: [],
    cosmetics: ['classic'],
    stats: {
      runs: 0, wins: 0, kills: 0, damage: 0, bestCombo: 0, maxWallChain: 0, explosionKills: 0, fireKills: 0,
      lightningKills: 0, frozen: 0, bleedKills: 0, healed: 0, coinsEarned: 0, evolutions: 0, maxBallsInFlight: 0,
      maxMomentumTier: 0, elitesKilled: 0, playTime: 0, poisonKills: 0, starfalls: 0, goldenCaught: 0, relicsFound: 0,
      maxAscension: 0, contractsDone: 0,
    },
    cleared: {},
    bossKills: {},
    settings: { language: DEFAULT_LANGUAGE, sfx: 0.8, music: 0.5, shake: true, damageNumbers: true, aimMode: 'direct', debug: false, haptics: true, leftHanded: false, reduceFlashes: false },
    tutorialDone: false,
    runsSinceUnlock: 0,
    daily: { day: '', claimed: false, best: 0, runs: 0 },
    unlockedRelics: [],
    ascension: 0,
    rankXp: 0,
    contracts: { day: '', daily: [], week: '', weekly: null },
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
  if (v < 4) {
    // v3 had no Pilot Rank: credit every Mastery XP already earned.
    if (typeof data.rankXp !== 'number' && isObj(data.mastery)) {
      data.rankXp = Object.values(data.mastery).reduce<number>((a, b) => a + (typeof b === 'number' ? b : 0), 0);
    }
  }
  const p = mergeDefaults(base, data);
  // Keep only supported settings when loading an older profile.
  for (const key of Object.keys(p.settings)) {
    if (!(key in base.settings)) Reflect.deleteProperty(p.settings, key);
  }
  if (!isLanguage(p.settings.language)) p.settings.language = DEFAULT_LANGUAGE;
  p.version = SAVE_VERSION;
  p.talents = normalizeTalents(p.talents, talentProgress(p).total, talentWins(p));
  if (!p.unlockedCores.includes('striker')) p.unlockedCores.unshift('striker');
  if (!p.cosmetics.includes('classic')) p.cosmetics.unshift('classic');
  p.ascension = Math.max(0, Math.min(MAX_ASCENSION, Math.floor(p.ascension) || 0));
  if (!Array.isArray(p.contracts.daily)) p.contracts.daily = [];
  return p;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** True when this store already holds a save, i.e. this is not the first launch. */
export function hasSave(store: KeyValueStore | undefined): boolean {
  try { return !!store?.getItem(SAVE_KEY); } catch { return false; }
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
