import { localize } from '../i18n/content';
import type { Profile, RunSummary, Unlock } from '../meta/types';

/**
 * Contracts: three daily jobs and one weekly job, drawn from this pool by a date seed so every
 * player gets the same board. Progress accumulates over every run played that day (or week)
 * and pays out automatically when a target is reached.
 */
export interface ContractDef {
  id: string;
  icon: string;
  /** `{n}` is replaced by the target. */
  desc: string;
  /** Progress a run contributes. */
  value: (s: RunSummary) => number;
  /** `max`: best single run counts; `sum`: runs add up. */
  mode: 'sum' | 'max';
  daily: number;
  weekly: number;
  /**
   * How the target grows with the player (see `contractTarget`): `volume` with kills per run, `soft` with its
   * square root, `level` and `time` with typical level and run length, `skill` barely, `fixed` not at all.
   */
  scale: ContractScale;
  /** Only offered once the player can make progress on it. */
  available?: (p: Profile) => boolean;
}

export type ContractScale = 'volume' | 'soft' | 'level' | 'time' | 'skill' | 'fixed';

const unlockedArena = (id: string) => (p: Profile) => !!p.discoveries.arenas.includes(id);

export const CONTRACTS: ContractDef[] = [
  { id: 'kills', icon: '💥', desc: 'Destroy {n} enemies', value: (s) => s.kills, mode: 'sum', daily: 300, weekly: 2500, scale: 'volume' },
  { id: 'elites', icon: '🏹', desc: 'Kill {n} elites', value: (s) => s.eliteKills, mode: 'sum', daily: 6, weekly: 50, scale: 'volume' },
  { id: 'fire', icon: '🔥', desc: 'Kill {n} enemies with fire', value: (s) => s.fireKills, mode: 'sum', daily: 100, weekly: 800, scale: 'volume' },
  { id: 'lightning', icon: '⚡', desc: 'Kill {n} enemies with lightning', value: (s) => s.lightningKills, mode: 'sum', daily: 100, weekly: 800, scale: 'volume' },
  { id: 'explosions', icon: '💣', desc: 'Kill {n} enemies with explosions', value: (s) => s.explosionKills, mode: 'sum', daily: 70, weekly: 600, scale: 'volume' },
  { id: 'freeze', icon: '🧊', desc: 'Freeze {n} enemies', value: (s) => s.frozenCount, mode: 'sum', daily: 50, weekly: 400, scale: 'volume' },
  { id: 'poison', icon: '🧪', desc: 'Kill {n} enemies with poison', value: (s) => s.poisonKills ?? 0, mode: 'sum', daily: 70, weekly: 600, scale: 'volume',
    available: (p) => p.unlockedUpgrades.includes('venom') || p.unlockedCores.includes('venom') },
  { id: 'bleed', icon: '🩸', desc: 'Kill {n} enemies with bleed', value: (s) => s.bleedKills, mode: 'sum', daily: 50, weekly: 400, scale: 'volume',
    available: (p) => p.unlockedUpgrades.includes('serrated') || p.unlockedCores.includes('blood') },
  { id: 'combo', icon: '🔗', desc: 'Reach a {n} combo', value: (s) => s.bestCombo, mode: 'max', daily: 60, weekly: 150, scale: 'soft' },
  { id: 'rally', icon: '🔁', desc: 'Bounce {n} times off walls in one flight', value: (s) => s.maxWallChain, mode: 'max', daily: 18, weekly: 40, scale: 'skill' },
  { id: 'bosses', icon: '👑', desc: 'Bosses to defeat: {n}', value: (s) => s.bossesDefeated.length, mode: 'sum', daily: 1, weekly: 8, scale: 'soft' },
  { id: 'wins', icon: '🏆', desc: 'Runs to win: {n}', value: (s) => (s.victory ? 1 : 0), mode: 'sum', daily: 1, weekly: 5, scale: 'fixed' },
  { id: 'power', icon: '🎯', desc: 'Land {n} power shots', value: (s) => s.powerShots ?? 0, mode: 'sum', daily: 25, weekly: 200, scale: 'volume' },
  { id: 'starfall', icon: '🌠', desc: 'Call {n} Starfalls', value: (s) => s.starfalls ?? 0, mode: 'sum', daily: 3, weekly: 25, scale: 'time' },
  { id: 'golden', icon: '✨', desc: 'Catch {n} golden wisps', value: (s) => s.goldenCaught, mode: 'sum', daily: 2, weekly: 12, scale: 'fixed' },
  { id: 'level', icon: '⬆️', desc: 'Reach level {n} in a run', value: (s) => s.level, mode: 'max', daily: 18, weekly: 28, scale: 'level' },
  { id: 'survive', icon: '⏱️', desc: 'Survive {n} seconds in one run', value: (s) => Math.floor(s.time), mode: 'max', daily: 360, weekly: 700, scale: 'time' },
  { id: 'relics', icon: '🏺', desc: 'Find {n} relics', value: (s) => s.relics?.length ?? 0, mode: 'sum', daily: 2, weekly: 15, scale: 'soft' },
  { id: 'evolve', icon: '🧬', desc: 'Evolutions to reach: {n}', value: (s) => s.evolutions.length, mode: 'sum', daily: 1, weekly: 6, scale: 'fixed' },
  { id: 'barrels', icon: '🛢️', desc: 'Detonate {n} barrels', value: (s) => s.barrelsExploded, mode: 'sum', daily: 12, weekly: 90, scale: 'soft', available: unlockedArena('foundry') },
  { id: 'runs', icon: '🎮', desc: 'Runs to play: {n}', value: () => 1, mode: 'sum', daily: 3, weekly: 15, scale: 'fixed' },
];

export const CONTRACT_MAP: Record<string, ContractDef> = Object.fromEntries(CONTRACTS.map((c) => [c.id, c]));
export const DAILY_CONTRACTS = 3;

/** Rewards scale with the job: three dailies, then a weekly worth several days (base values, tier 0). */
export const DAILY_REWARDS: Unlock[][] = [
  [{ type: 'coins', amount: 250 }],
  [{ type: 'coins', amount: 200 }, { type: 'research', amount: 1 }],
  [{ type: 'coins', amount: 200 }, { type: 'cores', amount: 1 }],
];
export const WEEKLY_REWARD: Unlock[] = [{ type: 'coins', amount: 1200 }, { type: 'cores', amount: 4 }, { type: 'research', amount: 3 }];

/**
 * Contracts grow with the player so they stay a challenge. The tier is the number of difficulties won
 * (0 to 10), fixed when a board is drawn. The tables follow a typical run at the hardest open tier
 * (npm run balance): kills per run, level reached and run length relative to a first Normal run, and
 * the coins a run pays (rewards stay worth about a fifth of a run).
 */
export const CONTRACT_TIER_MAX = 10;
const VOLUME = [1, 1.1, 1.5, 1.7, 2.2, 3, 3.5, 3.65, 3.8, 5.1, 5.4];
const LEVEL = [1, 1, 1.05, 1.2, 1.5, 2.1, 2.45, 2.5, 2.55, 3, 3.1];
const TIME = [1, 1, 1, 1.1, 1.2, 1.35, 1.4, 1.45, 1.45, 1.6, 1.6];
const COINS = [1, 1.2, 2.5, 4.5, 8, 20, 45, 65, 95, 150, 170];

const tierOf = (tier: number) => Math.max(0, Math.min(CONTRACT_TIER_MAX, Math.floor(tier) || 0));

/** Rounds a target to a tidy number: 1,234 -> 1,250. */
function tidy(n: number): number {
  if (n < 20) return Math.max(1, Math.round(n));
  const step = n < 100 ? 5 : n < 1000 ? 10 : 50;
  return Math.round(n / step) * step;
}

export function contractTarget(def: ContractDef, tier: number, weekly: boolean): number {
  const k = tierOf(tier);
  const base = weekly ? def.weekly : def.daily;
  const f = { volume: VOLUME[k], soft: Math.sqrt(VOLUME[k]), level: LEVEL[k], time: TIME[k], skill: Math.pow(VOLUME[k], 0.25), fixed: 1 }[def.scale];
  return tidy(base * f);
}

/** The easiest difficulty a run must be played on to count: one below the hardest won, from the second win on. */
export function contractMinDifficulty(tier: number): number {
  return Math.max(0, tierOf(tier) - 2);
}

/** A slot's rewards at its tier: coins follow the economy, Cores and Research grow slowly. */
export function contractRewards(slot: number | 'weekly', tier: number): Unlock[] {
  const k = tierOf(tier);
  const base = slot === 'weekly' ? WEEKLY_REWARD : DAILY_REWARDS[slot] ?? DAILY_REWARDS[0];
  return base.map((u): Unlock => {
    if (u.type === 'coins') return { type: 'coins', amount: tidy(u.amount * COINS[k]) };
    if (u.type === 'cores') return { type: 'cores', amount: u.amount + Math.floor(k / (slot === 'weekly' ? 2 : 4)) };
    if (u.type === 'research') return { type: 'research', amount: u.amount + Math.floor(k / (slot === 'weekly' ? 3 : 5)) };
    return u;
  });
}

localize('contract', CONTRACTS, ['desc']);
