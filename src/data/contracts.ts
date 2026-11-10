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
  /** Only offered once the player can make progress on it. */
  available?: (p: Profile) => boolean;
}

const unlockedArena = (id: string) => (p: Profile) => !!p.discoveries.arenas.includes(id);

export const CONTRACTS: ContractDef[] = [
  { id: 'kills', icon: '💥', desc: 'Destroy {n} enemies', value: (s) => s.kills, mode: 'sum', daily: 300, weekly: 2500 },
  { id: 'elites', icon: '🏹', desc: 'Kill {n} elites', value: (s) => s.eliteKills, mode: 'sum', daily: 6, weekly: 50 },
  { id: 'fire', icon: '🔥', desc: 'Kill {n} enemies with fire', value: (s) => s.fireKills, mode: 'sum', daily: 100, weekly: 800 },
  { id: 'lightning', icon: '⚡', desc: 'Kill {n} enemies with lightning', value: (s) => s.lightningKills, mode: 'sum', daily: 100, weekly: 800 },
  { id: 'explosions', icon: '💣', desc: 'Kill {n} enemies with explosions', value: (s) => s.explosionKills, mode: 'sum', daily: 70, weekly: 600 },
  { id: 'freeze', icon: '🧊', desc: 'Freeze {n} enemies', value: (s) => s.frozenCount, mode: 'sum', daily: 50, weekly: 400 },
  { id: 'poison', icon: '🧪', desc: 'Kill {n} enemies with poison', value: (s) => s.poisonKills ?? 0, mode: 'sum', daily: 70, weekly: 600,
    available: (p) => p.unlockedUpgrades.includes('venom') || p.unlockedCores.includes('venom') },
  { id: 'bleed', icon: '🩸', desc: 'Kill {n} enemies with bleed', value: (s) => s.bleedKills, mode: 'sum', daily: 50, weekly: 400,
    available: (p) => p.unlockedUpgrades.includes('serrated') || p.unlockedCores.includes('blood') },
  { id: 'combo', icon: '🔗', desc: 'Reach a {n} combo', value: (s) => s.bestCombo, mode: 'max', daily: 60, weekly: 150 },
  { id: 'rally', icon: '🔁', desc: 'Bounce {n} times off walls in one flight', value: (s) => s.maxWallChain, mode: 'max', daily: 18, weekly: 40 },
  { id: 'bosses', icon: '👑', desc: 'Bosses to defeat: {n}', value: (s) => s.bossesDefeated.length, mode: 'sum', daily: 1, weekly: 8 },
  { id: 'wins', icon: '🏆', desc: 'Runs to win: {n}', value: (s) => (s.victory ? 1 : 0), mode: 'sum', daily: 1, weekly: 5 },
  { id: 'power', icon: '🎯', desc: 'Land {n} power shots', value: (s) => s.powerShots ?? 0, mode: 'sum', daily: 25, weekly: 200 },
  { id: 'starfall', icon: '🌠', desc: 'Call {n} Starfalls', value: (s) => s.starfalls ?? 0, mode: 'sum', daily: 3, weekly: 25 },
  { id: 'golden', icon: '✨', desc: 'Catch {n} golden wisps', value: (s) => s.goldenCaught, mode: 'sum', daily: 2, weekly: 12 },
  { id: 'level', icon: '⬆️', desc: 'Reach level {n} in a run', value: (s) => s.level, mode: 'max', daily: 18, weekly: 28 },
  { id: 'survive', icon: '⏱️', desc: 'Survive {n} seconds in one run', value: (s) => Math.floor(s.time), mode: 'max', daily: 360, weekly: 700 },
  { id: 'relics', icon: '🏺', desc: 'Find {n} relics', value: (s) => s.relics?.length ?? 0, mode: 'sum', daily: 2, weekly: 15 },
  { id: 'evolve', icon: '🧬', desc: 'Evolutions to reach: {n}', value: (s) => s.evolutions.length, mode: 'sum', daily: 1, weekly: 6 },
  { id: 'barrels', icon: '🛢️', desc: 'Detonate {n} barrels', value: (s) => s.barrelsExploded, mode: 'sum', daily: 12, weekly: 90, available: unlockedArena('foundry') },
  { id: 'runs', icon: '🎮', desc: 'Runs to play: {n}', value: () => 1, mode: 'sum', daily: 3, weekly: 15 },
];

export const CONTRACT_MAP: Record<string, ContractDef> = Object.fromEntries(CONTRACTS.map((c) => [c.id, c]));
export const DAILY_CONTRACTS = 3;

/** Rewards scale with the job: three dailies, then a weekly worth several days. */
export const DAILY_REWARDS: Unlock[][] = [
  [{ type: 'coins', amount: 250 }],
  [{ type: 'coins', amount: 200 }, { type: 'research', amount: 1 }],
  [{ type: 'coins', amount: 200 }, { type: 'cores', amount: 1 }],
];
export const WEEKLY_REWARD: Unlock[] = [{ type: 'coins', amount: 1200 }, { type: 'cores', amount: 4 }, { type: 'research', amount: 3 }];

localize('contract', CONTRACTS, ['desc']);
