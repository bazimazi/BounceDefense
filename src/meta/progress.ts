import { t } from '../i18n';
import { analytics } from '../core/analytics';
import { dailyKey, hashString, Rng } from '../core/rng';
import { ARENAS, ARENA_MAP, DIFFICULTIES, PACT_MAP } from '../data/arenas';
import { CORES, CORE_MAP, PARTS, PART_MAP, TRAILS } from '../data/balls';
import { BOSS_MAP, ENEMY_MAP } from '../data/enemies';
import {
  ACHIEVEMENTS, CATALYST_LEVELS, CHALLENGES, INDUSTRY_DISCOUNT, SIGNATURE_UPGRADE, apexKills, type ResearchDef, OVERDRIVE_MAX, OVERDRIVE_PER_TIER, REFIT_MASTERY_STEP, RESEARCH, RESEARCH_MAP, WORKSHOP_MAP, masteryLevel, masteryRewards,
  rankLevel, rankRewards,
} from '../data/meta';
import { ASCENSION_REWARD, ASCENSION_TIER, MAX_ASCENSION } from '../data/ascension';
import { CONTRACTS, CONTRACT_MAP, DAILY_CONTRACTS, DAILY_REWARDS, WEEKLY_REWARD } from '../data/contracts';
import { DEFAULT_UNLOCKED_RELICS, RELIC_MAP } from '../data/relics';
import { EVENT_MAP } from '../data/arenas';
import { EVOLUTION_MAP, REACTION_MAP, SYNERGY_MAP } from '../data/synergies';
import { DEFAULT_UNLOCKED_UPGRADES, UPGRADE_MAP } from '../data/upgrades';
import type { RunConfig } from '../sim/world';
import type { ContractSlot, DiscoveryCat, Profile, RunSummary, Unlock } from './types';
import { normalizeTalents } from '../data/talents';
import { talentProgress, talentWins } from './talents';

// ------------------------------------------------------------------ queries
export function researchFlags(p: Profile): string[] {
  const flags: string[] = [];
  for (const id of p.researchNodes) {
    for (const g of RESEARCH_MAP[id]?.grants ?? []) if (g.type === 'flag') flags.push(g.id);
  }
  return flags;
}

export function upgradePool(p: Profile): string[] {
  return [...new Set([...DEFAULT_UNLOCKED_UPGRADES, ...p.unlockedUpgrades])];
}

export function relicPool(p: Profile): string[] {
  return [...new Set([...DEFAULT_UNLOCKED_RELICS, ...p.unlockedRelics])];
}

export function isRelicUnlocked(p: Profile, id: string): boolean {
  return DEFAULT_UNLOCKED_RELICS.includes(id) || p.unlockedRelics.includes(id);
}

export function isArenaUnlocked(p: Profile, arenaId: string): boolean {
  const a = ARENA_MAP[arenaId];
  if (!a) return false;
  return !a.unlockReq || (p.bossKills[a.unlockReq.boss] ?? 0) > 0;
}

export function maxDifficulty(p: Profile): number {
  return Math.min(DIFFICULTIES.length - 1, bestCleared(p) + 1);
}

export function isPartUnlocked(p: Profile, id: string): boolean {
  const part = PART_MAP[id];
  return !!part && (!part.unlock || p.unlockedParts.includes(id));
}

export function coreRequirementMet(p: Profile, id: string): boolean {
  const c = CORE_MAP[id];
  if (!c?.unlockReq) return true;
  if (c.unlockReq.achievement) return p.achievements.includes(c.unlockReq.achievement);
  if (c.unlockReq.boss) return (p.bossKills[c.unlockReq.boss] ?? 0) > 0;
  return true;
}

export function canUnlockCore(p: Profile, id: string): boolean {
  const c = CORE_MAP[id];
  return !!c && !p.unlockedCores.includes(id) && coreRequirementMet(p, id) && p.cores >= c.unlockCost;
}

export function unlockCore(p: Profile, id: string): boolean {
  if (!canUnlockCore(p, id)) return false;
  p.cores -= CORE_MAP[id].unlockCost;
  p.unlockedCores.push(id);
  p.runsSinceUnlock = 0;
  analytics.emit('BallUnlocked', { id });
  return true;
}

export function buyPart(p: Profile, id: string): boolean {
  const part = PART_MAP[id];
  if (!part?.unlock?.coins || isPartUnlocked(p, id) || p.coins < part.unlock.coins) return false;
  p.coins -= part.unlock.coins;
  p.unlockedParts.push(id);
  analytics.emit('PartUnlocked', { id });
  return true;
}

/** Advanced and Apex research open with wins and apex kills, not only with points. */
export function researchGateMet(p: Profile, r: ResearchDef): boolean {
  if (r.gate?.win !== undefined && bestCleared(p) < r.gate.win) return false;
  if (r.gate?.apex && apexKills(p) <= 0) return false;
  return true;
}

/** Why a research node cannot be studied yet, apart from its price: a win, an apex kill or missing prerequisites. */
export type ResearchLock = { kind: 'win'; difficulty: number } | { kind: 'apex' } | { kind: 'requires'; ids: string[] };

export function researchLock(p: Profile, id: string): ResearchLock | null {
  const r = RESEARCH_MAP[id];
  if (!r || p.researchNodes.includes(id)) return null;
  if (r.gate?.win !== undefined && bestCleared(p) < r.gate.win) return { kind: 'win', difficulty: r.gate.win };
  if (r.gate?.apex && apexKills(p) <= 0) return { kind: 'apex' };
  const missing = r.requires.filter((x) => !p.researchNodes.includes(x));
  return missing.length ? { kind: 'requires', ids: missing } : null;
}

export function canResearch(p: Profile, id: string): boolean {
  const r = RESEARCH_MAP[id];
  return !!r && !p.researchNodes.includes(id) && researchLock(p, id) === null && p.research >= r.cost;
}

export function doResearch(p: Profile, id: string): string[] {
  if (!canResearch(p, id)) return [];
  const r = RESEARCH_MAP[id];
  p.research -= r.cost;
  p.researchNodes.push(id);
  analytics.emit('ResearchPurchased', { id });
  return r.grants.map((g) => applyUnlock(p, g)).filter(Boolean) as string[];
}

/** Highest difficulty index won in any arena, -1 before the first win. */
export function bestCleared(p: Profile): number {
  return Math.max(-1, ...Object.values(p.cleared));
}

/** Overdrive levels open on every line: OVERDRIVE_PER_TIER for each difficulty won, plus the Catalyst. */
export function overdriveOpen(p: Profile): number {
  return Math.min(OVERDRIVE_MAX, OVERDRIVE_PER_TIER * (bestCleared(p) + 1) + CATALYST_LEVELS * (p.workshop.bp_catalyst ?? 0));
}

/** Refit levels open for a core: one per REFIT_MASTERY_STEP Mastery levels, none while it is locked. */
export function refitOpen(p: Profile, core: string): number {
  if (!p.unlockedCores.includes(core)) return 0;
  return Math.ceil(masteryLevel(p.mastery[core] ?? 0).level / REFIT_MASTERY_STEP);
}

/** The level a Workshop line can be bought up to right now. */
export function workshopCap(p: Profile, id: string): number {
  const w = WORKSHOP_MAP[id];
  if (!w) return 0;
  if (w.overdrive) return Math.min(w.maxLevel, overdriveOpen(p));
  if (w.core) return Math.min(w.maxLevel, refitOpen(p, w.core));
  if (w.tiers) {
    if (w.needs && !(p.workshop[w.needs] ?? 0)) return 0;
    const won = bestCleared(p);
    let cap = 0;
    while (cap < w.maxLevel && w.tiers[cap] <= won) cap++;
    return cap;
  }
  return w.maxLevel;
}

/** Why the next level of a Workshop line cannot be bought yet, or null when nothing but coins stands in the way. */
export type WorkshopLock =
  | { kind: 'win'; difficulty: number }
  | { kind: 'needs'; id: string }
  | { kind: 'core'; core: string }
  | { kind: 'mastery'; core: string; level: number }
  | { kind: 'overdrive' };

export function workshopLock(p: Profile, id: string): WorkshopLock | null {
  const w = WORKSHOP_MAP[id];
  const lvl = p.workshop[id] ?? 0;
  if (!w || lvl >= w.maxLevel || lvl < workshopCap(p, id)) return null;
  if (w.overdrive) return { kind: 'overdrive' };
  if (w.core) {
    if (!p.unlockedCores.includes(w.core)) return { kind: 'core', core: w.core };
    return { kind: 'mastery', core: w.core, level: lvl * REFIT_MASTERY_STEP + 1 };
  }
  if (w.needs && !(p.workshop[w.needs] ?? 0)) return { kind: 'needs', id: w.needs };
  if (w.tiers) return { kind: 'win', difficulty: w.tiers[lvl] };
  return null;
}

export function workshopCost(p: Profile, id: string): number | null {
  const w = WORKSHOP_MAP[id];
  const lvl = p.workshop[id] ?? 0;
  if (!w || lvl >= workshopCap(p, id)) return null;
  // Industrial Theory takes a share off every price, rounded to tidy tens.
  return p.researchNodes.includes('industrial_theory') ? Math.max(10, Math.round((w.cost(lvl) * (1 - INDUSTRY_DISCOUNT)) / 10) * 10) : w.cost(lvl);
}

export function buyWorkshop(p: Profile, id: string): boolean {
  const cost = workshopCost(p, id);
  if (cost === null || p.coins < cost) return false;
  p.coins -= cost;
  p.workshop[id] = (p.workshop[id] ?? 0) + 1;
  analytics.emit('WorkshopPurchased', { id, level: p.workshop[id] });
  return true;
}

/** Core Resonance's partner: the most-mastered other unlocked core. */
export function echoCore(p: Profile, core: string): string | undefined {
  let best: string | undefined;
  let xp = 0;
  for (const id of p.unlockedCores) {
    const v = p.mastery[id] ?? 0;
    if (id !== core && v > xp) { best = id; xp = v; }
  }
  return best;
}

export function runConfig(p: Profile, opts: { arena: string; difficulty: number; pacts: string[]; seed: number; daily?: boolean; ascension?: number }): RunConfig {
  const l = p.loadout;
  const flags = researchFlags(p);
  return {
    seed: opts.seed,
    arena: opts.arena,
    difficulty: opts.difficulty,
    core: p.unlockedCores.includes(l.core) ? l.core : 'striker',
    parts: [l.shell, l.impact, l.momentum].filter((id) => isPartUnlocked(p, id)),
    pacts: opts.pacts.filter((id) => PACT_MAP[id] && (!PACT_MAP[id].flag || flags.includes(PACT_MAP[id].flag!))),
    workshop: { ...p.workshop },
    talents: normalizeTalents(p.talents, talentProgress(p).total, talentWins(p)),
    pool: upgradePool(p),
    flags,
    trail: p.cosmetics.includes(l.trail) ? l.trail : 'classic',
    known: Object.fromEntries(Object.entries(p.discoveries).map(([k, v]) => [k, [...v]])),
    tutorial: !p.tutorialDone,
    daily: opts.daily,
    ascension: opts.difficulty >= ASCENSION_TIER ? Math.max(0, Math.min(p.ascension, Math.floor(opts.ascension ?? 0))) : 0,
    relicPool: relicPool(p),
    bossLore: Object.values(p.bossKills).filter((n) => n > 0).length,
    echoCore: echoCore(p, p.unlockedCores.includes(l.core) ? l.core : 'striker'),
  };
}

// ------------------------------------------------------------------ unlocks
export function describeUnlock(u: Unlock): string {
  switch (u.type) {
    case 'upgrade': return t('unlock.upgrade', { icon: UPGRADE_MAP[u.id]?.icon ?? '', name: UPGRADE_MAP[u.id]?.name ?? u.id });
    case 'part': return t('unlock.part', { icon: PART_MAP[u.id]?.icon ?? '', name: PART_MAP[u.id]?.name ?? u.id });
    case 'core': return t('unlock.core', { name: CORE_MAP[u.id]?.name ?? u.id });
    case 'cosmetic': return t('unlock.cosmetic', { name: TRAILS.find((x) => x.id === u.id)?.name ?? u.id });
    case 'flag': return t('unlock.flag', { id: u.id });
    case 'coins': return t('unlock.coins', { n: u.amount });
    case 'cores': return t('unlock.cores', { n: u.amount });
    case 'research': return t('unlock.research', { n: u.amount });
    case 'relic': return t('unlock.relic', { icon: RELIC_MAP[u.id]?.icon ?? '', name: RELIC_MAP[u.id]?.name ?? u.id });
  }
}

/** Applies an unlock. Returns a description, or null if it was already owned. */
export function applyUnlock(p: Profile, u: Unlock): string | null {
  switch (u.type) {
    case 'upgrade':
      if (p.unlockedUpgrades.includes(u.id) || DEFAULT_UNLOCKED_UPGRADES.includes(u.id)) return null;
      p.unlockedUpgrades.push(u.id);
      break;
    case 'part':
      if (p.unlockedParts.includes(u.id)) return null;
      p.unlockedParts.push(u.id);
      analytics.emit('PartUnlocked', { id: u.id });
      break;
    case 'core':
      if (p.unlockedCores.includes(u.id)) return null;
      p.unlockedCores.push(u.id);
      break;
    case 'cosmetic':
      if (p.cosmetics.includes(u.id)) {
        p.research += 1;
        return t('unlock.duplicateTrail');
      }
      p.cosmetics.push(u.id);
      break;
    case 'flag':
      return null;
    case 'coins': p.coins += u.amount; break;
    case 'cores': p.cores += u.amount; break;
    case 'research': p.research += u.amount; break;
    case 'relic':
      if (isRelicUnlocked(p, u.id) || !RELIC_MAP[u.id]) return null;
      p.unlockedRelics.push(u.id);
      break;
  }
  return describeUnlock(u);
}

// ------------------------------------------------------------------ rewards
export interface RunRewards {
  coins: number;
  cores: number;
  research: number;
  masteryXp: number;
}

export function rewardMultiplier(s: Pick<RunSummary, 'difficulty' | 'pacts'> & { ascension?: number }): number {
  const diff = DIFFICULTIES[s.difficulty] ?? DIFFICULTIES[0];
  const pact = s.pacts.reduce((a, id) => a + (PACT_MAP[id]?.reward ?? 0), 0);
  return diff.rewardMult * (1 + pact) * (1 + ASCENSION_REWARD * (s.ascension ?? 0));
}

/** Every run pays out, win or lose. Victories and harder settings pay more. */
export function computeRewards(s: RunSummary, newDiscoveries: number, flags: string[] = [], workshop: Record<string, number> = {}): RunRewards {
  // The War Chest blueprint pays on victories only; the Mentor Program speeds Mastery and Rank.
  // Midas Protocol pays on Abyss and above, win or lose.
  const midas = flags.includes('midas') && s.difficulty >= ASCENSION_TIER ? 1.15 : 1;
  const mult = rewardMultiplier(s) * (s.victory ? 1.3 * (1 + 0.1 * (workshop.bp_war_chest ?? 0)) : 1) * midas;
  const base = s.coinsCollected + s.kills * 0.5 + s.eliteKills * 8 + s.bossesDefeated.length * 120 + Math.floor(s.time / 6);
  const asc = s.ascension ?? 0;
  const study = (flags.includes('mastery') ? 1.15 : 1) * (1 + 0.1 * (workshop.bp_mentor ?? 0));
  return {
    coins: Math.round(base * mult),
    cores: s.coresCollected + (s.victory ? 1 + s.difficulty + Math.floor(asc / 2) + (flags.includes('salvage') ? 1 : 0) : 0),
    research: newDiscoveries + (s.victory ? 1 + (flags.includes('scholar') ? 1 + Math.floor(s.difficulty / 3) : 0) : 0),
    masteryXp: Math.round((s.kills * 0.6 + s.level * 10 + s.bossesDefeated.length * 80 + (s.victory ? 100 : 0)) * (1 + s.difficulty * 0.25 + asc * 0.05) * study),
  };
}

// ------------------------------------------------------------------ contracts
/** Week index (weeks start on Monday, UTC): the weekly contract's key. */
export function weekKey(date = new Date()): string {
  const day = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
  return `w${Math.floor((day - 4) / 7)}`;
}

function drawContracts(p: Profile, key: string, n: number, weekly: boolean): ContractSlot[] {
  const rng = new Rng(hashString(`${weekly ? 'weekly' : 'daily'}:${key}`));
  const pool = CONTRACTS.filter((c) => !c.available || c.available(p));
  rng.shuffle(pool);
  return pool.slice(0, n).map((c) => ({ id: c.id, target: weekly ? c.weekly : c.daily, progress: 0, done: false }));
}

/** Today's board: three daily contracts and this week's contract, drawn fresh when the day or week turns. */
export function contractBoard(p: Profile, date = new Date()): Profile['contracts'] {
  const b = p.contracts;
  const day = dailyKey(date);
  const week = weekKey(date);
  if (b.day !== day || b.daily.length !== DAILY_CONTRACTS || b.daily.some((c) => !CONTRACT_MAP[c.id])) {
    b.day = day;
    b.daily = drawContracts(p, day, DAILY_CONTRACTS, false);
  }
  if (b.week !== week || !b.weekly || !CONTRACT_MAP[b.weekly.id]) {
    b.week = week;
    b.weekly = drawContracts(p, week, 1, true)[0] ?? null;
  }
  return b;
}

export function contractText(slot: ContractSlot): string {
  const def = CONTRACT_MAP[slot.id];
  return def ? def.desc.replace('{n}', String(slot.target)) : slot.id;
}

/** Adds a run to the board; returns the contracts it completed, rewards already applied. */
function progressContracts(p: Profile, s: RunSummary, date: Date, push: (u: Unlock) => void): string[] {
  const b = contractBoard(p, date);
  const done: string[] = [];
  const slots: [ContractSlot, Unlock[]][] = b.daily.map((c, i) => [c, DAILY_REWARDS[i] ?? DAILY_REWARDS[0]]);
  if (b.weekly) slots.push([b.weekly, WEEKLY_REWARD]);
  for (const [slot, rewards] of slots) {
    const def = CONTRACT_MAP[slot.id];
    if (!def || slot.done) continue;
    const v = Math.max(0, def.value(s));
    slot.progress = def.mode === 'max' ? Math.max(slot.progress, v) : slot.progress + v;
    if (slot.progress >= slot.target) {
      slot.done = true;
      slot.progress = slot.target;
      p.stats.contractsDone++;
      done.push(`${def.icon} ${contractText(slot)}`);
      rewards.forEach(push);
      analytics.emit('ContractCompleted', { id: slot.id, weekly: slot === b.weekly });
    }
  }
  return done;
}

/** The first finished Daily Seed run each day pays this coin multiplier and bonus Research. */
export const DAILY_COIN_BONUS = 1.5;
export const DAILY_RESEARCH_BONUS = 1;
/** A Daily Seed run must last this long (or be won) to claim the bonus, so quitting at once cannot farm it. */
export const DAILY_MIN_TIME = 90;

/** Today's Daily Seed record, reset when the UTC day has changed. */
export function dailyRecord(p: Profile, today = dailyKey()): Profile['daily'] {
  if (p.daily.day !== today) p.daily = { day: today, claimed: false, best: 0, runs: 0 };
  return p.daily;
}

// ------------------------------------------------------------------ discovery names
export function discoveryName(cat: DiscoveryCat, id: string): string {
  switch (cat) {
    case 'enemies': return ENEMY_MAP[id]?.name ?? id;
    case 'bosses': return BOSS_MAP[id]?.name ?? id;
    case 'synergies': return `${SYNERGY_MAP[id]?.icon ?? ''} ${SYNERGY_MAP[id]?.name ?? id}`;
    case 'evolutions': return `${EVOLUTION_MAP[id]?.icon ?? ''} ${EVOLUTION_MAP[id]?.name ?? id}`;
    case 'reactions': return `${REACTION_MAP[id]?.icon ?? ''} ${REACTION_MAP[id]?.name ?? id}`;
    case 'upgrades': return UPGRADE_MAP[id]?.name ?? id;
    case 'arenas': return ARENA_MAP[id]?.name ?? id;
    case 'events': return EVENT_MAP[id]?.name ?? id;
    case 'relics': return `${RELIC_MAP[id]?.icon ?? ''} ${RELIC_MAP[id]?.name ?? id}`;
  }
}

/** Categories that grant research when discovered for the first time. */
const RESEARCH_CATS: DiscoveryCat[] = ['synergies', 'evolutions', 'reactions', 'bosses'];

// ------------------------------------------------------------------ goals
export interface Goal {
  text: string;
  reward: string;
  cur: number;
  max: number;
}

export function nextGoals(p: Profile, n = 3): Goal[] {
  const goals: (Goal & { kind: string })[] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements.includes(a.id)) continue;
    const [cur, max] = a.progress(p);
    goals.push({ kind: 'ach', text: a.desc, reward: a.rewards.map(describeUnlock).join(', '), cur: Math.min(cur, max), max });
  }
  for (const c of CORES) {
    if (p.unlockedCores.includes(c.id)) continue;
    if (!coreRequirementMet(p, c.id)) {
      goals.push({ kind: 'core', text: t('goal.reveal', { req: c.unlockReq?.text ?? '', name: c.name }), reward: `${c.icon} ${c.name}`, cur: 0, max: 1 });
    } else if (p.cores >= c.unlockCost) {
      // Affordable already: point at the action instead of a finished "collect" bar.
      goals.push({ kind: 'core', text: t('goal.coreReady', { name: c.name }), reward: `${c.icon} ${c.passive}`, cur: 1, max: 1 });
    } else {
      goals.push({ kind: 'core', text: t('goal.collectCores', { n: c.unlockCost }), reward: t('goal.unlockCore', { icon: c.icon, name: c.name }), cur: Math.min(p.cores, c.unlockCost), max: c.unlockCost });
    }
  }
  for (const a of ARENAS) {
    if (!isArenaUnlocked(p, a.id) && a.unlockReq) goals.push({ kind: 'arena', text: a.unlockReq.text, reward: t('goal.newArena', { name: a.name }), cur: 0, max: 1 });
  }
  const core = p.loadout.core;
  const m = masteryLevel(p.mastery[core] ?? 0);
  const mr = masteryRewards(core).find((r) => r.level === m.level + 1);
  if (mr) goals.push({ kind: 'mastery', text: t('goal.mastery', { name: CORE_MAP[core].name, level: m.level + 1 }), reward: mr.text, cur: m.into, max: m.need });
  const affordable = RESEARCH.find((r) => canResearch(p, r.id));
  if (affordable) goals.push({ kind: 'research', text: t('goal.research', { name: affordable.name }), reward: affordable.desc, cur: 1, max: 1 });
  const d = maxDifficulty(p);
  if (d < DIFFICULTIES.length - 1) goals.push({ kind: 'diff', text: t('goal.winOn', { name: DIFFICULTIES[d].name }), reward: t('goal.unlockDifficulty', { name: DIFFICULTIES[d + 1].name }), cur: 0, max: 1 });
  else if (p.ascension < MAX_ASCENSION) {
    goals.push({ kind: 'asc', text: p.ascension ? t('goal.ascension', { n: p.ascension }) : t('goal.winOn', { name: DIFFICULTIES[d].name }), reward: t('goal.unlockAscension', { n: p.ascension + 1 }), cur: 0, max: 1 });
  }
  const board = p.tutorialDone ? contractBoard(p) : null;
  const open = board?.daily.find((c) => !c.done);
  if (open) goals.push({ kind: 'contract', text: contractText(open), reward: t('goal.contractReward'), cur: open.progress, max: open.target });

  // most-progressed first, but keep variety: one per kind before repeating
  goals.sort((a, b) => b.cur / Math.max(1, b.max) - a.cur / Math.max(1, a.max));
  const out: Goal[] = [];
  const kinds = new Set<string>();
  for (const g of goals) {
    if (out.length >= n) break;
    if (kinds.has(g.kind) && goals.some((o) => !kinds.has(o.kind))) continue;
    kinds.add(g.kind);
    out.push(g);
  }
  for (const g of goals) if (out.length < n && !out.includes(g)) out.push(g);
  return out;
}

// ------------------------------------------------------------------ applying a run
export interface RunReport {
  rewards: RunRewards;
  unlocks: string[];
  discoveries: { cat: DiscoveryCat; id: string; name: string }[];
  achievements: string[];
  challenges: string[];
  mastery: { core: string; before: number; after: number; into: number; need: number; rewards: string[] };
  goals: Goal[];
  arenaUnlocked: string | null;
  difficultyUnlocked: string | null;
  /** Daily Seed outcome: whether this run claimed today's bonus and set a new best. */
  daily: { bonus: boolean; best: number; newBest: boolean } | null;
  rank: { before: number; after: number; into: number; need: number };
  contracts: string[];
  ascensionUnlocked: number | null;
}

export function applyRun(p: Profile, s: RunSummary, discoveries: { cat: DiscoveryCat; id: string }[], today = dailyKey(), now = new Date()): RunReport {
  const arenasBefore = ARENAS.filter((a) => isArenaUnlocked(p, a.id)).map((a) => a.id);
  const diffBefore = maxDifficulty(p);
  const st = p.stats;

  // ---- lifetime stats
  st.runs++;
  if (s.victory) st.wins++;
  st.kills += s.kills;
  st.damage += s.damageDealt;
  st.bestCombo = Math.max(st.bestCombo, s.bestCombo);
  st.maxWallChain = Math.max(st.maxWallChain, s.maxWallChain);
  st.explosionKills += s.explosionKills;
  st.fireKills += s.fireKills;
  st.lightningKills += s.lightningKills;
  st.frozen += s.frozenCount;
  st.bleedKills += s.bleedKills;
  st.healed += s.healed;
  st.evolutions += s.evolutions.length;
  st.maxBallsInFlight = Math.max(st.maxBallsInFlight, s.maxBallsInFlight);
  st.maxMomentumTier = Math.max(st.maxMomentumTier, s.maxMomentumTier);
  st.elitesKilled += s.eliteKills;
  st.playTime += s.time;
  st.poisonKills += s.poisonKills ?? 0;
  st.starfalls += s.starfalls ?? 0;
  st.goldenCaught += s.goldenCaught;
  st.relicsFound += s.relics?.length ?? 0;
  s.bossesDefeated.forEach((b, i) => {
    p.bossKills[b] = (p.bossKills[b] ?? 0) + 1;
    analytics.emit('BossDefeated', { id: b, fightTime: s.bossFightTimes[i] ?? 0 });
  });
  let ascensionUnlocked: number | null = null;
  if (s.victory) {
    p.cleared[s.arena] = Math.max(p.cleared[s.arena] ?? -1, s.difficulty);
    analytics.emit('ArenaCompleted', { arena: s.arena, difficulty: s.difficulty });
    // Abyss opens Ascension 1; winning at the highest open level (Abyss or harder) opens the next.
    if (s.difficulty >= ASCENSION_TIER) {
      const asc = s.ascension ?? 0;
      st.maxAscension = Math.max(st.maxAscension, asc);
      if (asc >= p.ascension && p.ascension < MAX_ASCENSION) {
        p.ascension = Math.min(MAX_ASCENSION, asc + 1);
        ascensionUnlocked = p.ascension;
        analytics.emit('AscensionUnlocked', { level: p.ascension });
      }
    }
  }
  p.tutorialDone = true;
  p.runsSinceUnlock++;

  // ---- discoveries
  const found: RunReport['discoveries'] = [];
  let researchFromDiscovery = 0;
  for (const d of discoveries) {
    const list = p.discoveries[d.cat];
    if (list.includes(d.id)) continue;
    list.push(d.id);
    found.push({ ...d, name: discoveryName(d.cat, d.id) });
    if (RESEARCH_CATS.includes(d.cat)) researchFromDiscovery++;
    if (d.cat === 'synergies') analytics.emit('SynergyDiscovered', { id: d.id });
    if (d.cat === 'evolutions') analytics.emit('EvolutionUnlocked', { id: d.id, runTime: s.time });
    if (d.cat === 'relics') analytics.emit('RelicFound', { id: d.id, runTime: s.time });
  }

  // ---- currencies
  const rewards = computeRewards(s, researchFromDiscovery, researchFlags(p), p.workshop);
  let daily: RunReport['daily'] = null;
  if (s.daily) {
    const rec = dailyRecord(p, today);
    const bonus = !rec.claimed && (s.victory || s.time >= DAILY_MIN_TIME);
    if (bonus) {
      rec.claimed = true;
      rewards.coins = Math.round(rewards.coins * DAILY_COIN_BONUS);
      rewards.research += DAILY_RESEARCH_BONUS;
    }
    const newBest = s.kills > rec.best;
    rec.best = Math.max(rec.best, s.kills);
    rec.runs++;
    daily = { bonus, best: rec.best, newBest };
  }
  p.coins += rewards.coins;
  p.cores += rewards.cores;
  p.research += rewards.research;
  st.coinsEarned += rewards.coins;

  const unlocks: string[] = [];
  const push = (u: Unlock) => {
    const d = applyUnlock(p, u);
    if (d) unlocks.push(d);
  };

  // ---- mastery
  const before = masteryLevel(p.mastery[s.core] ?? 0);
  const talentPointsBefore = talentProgress(p).total;
  p.mastery[s.core] = (p.mastery[s.core] ?? 0) + rewards.masteryXp;
  const newTalentPoints = talentProgress(p).total - talentPointsBefore;
  if (newTalentPoints > 0) unlocks.push(t('report.talentPoints', { n: newTalentPoints }));
  // Pilot Rank rides on the same XP, across every core.
  const rankBefore = rankLevel(p.rankXp);
  p.rankXp += rewards.masteryXp;
  const rankAfter = rankLevel(p.rankXp);
  for (let r = rankBefore.level + 1; r <= rankAfter.level; r++) {
    unlocks.push(t('report.rank', { n: r }));
    rankRewards(r).forEach(push);
    analytics.emit('RankUp', { rank: r });
  }
  const contracts = progressContracts(p, s, now, push);
  const after = masteryLevel(p.mastery[s.core]);
  const masteryTexts: string[] = [];
  for (const r of masteryRewards(s.core)) {
    if (r.level > before.level && r.level <= after.level) {
      masteryTexts.push(t('report.masteryLevel', { level: r.level, text: r.text }));
      r.unlocks.forEach(push);
      analytics.emit('MasteryLevelUp', { core: s.core, level: r.level });
    }
  }

  // ---- achievements & challenges
  const achievements: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements.includes(a.id)) continue;
    const [cur, max] = a.progress(p);
    if (cur >= max) {
      p.achievements.push(a.id);
      achievements.push(`${a.icon} ${a.name}`);
      a.rewards.forEach(push);
      analytics.emit('AchievementUnlocked', { id: a.id });
    }
  }
  const challenges: string[] = [];
  for (const c of CHALLENGES) {
    if (p.challenges.includes(c.id) || !c.check(s)) continue;
    p.challenges.push(c.id);
    challenges.push(`${c.icon} ${c.name}`);
    c.rewards.forEach(push);
    analytics.emit('ChallengeCompleted', { id: c.id });
  }
  // achievements can cascade from challenge rewards (e.g. cores) — one more pass
  for (const a of ACHIEVEMENTS) {
    if (p.achievements.includes(a.id)) continue;
    const [cur, max] = a.progress(p);
    if (cur >= max) {
      p.achievements.push(a.id);
      achievements.push(`${a.icon} ${a.name}`);
      a.rewards.forEach(push);
      analytics.emit('AchievementUnlocked', { id: a.id });
    }
  }

  const arenaUnlocked = ARENAS.find((a) => !arenasBefore.includes(a.id) && isArenaUnlocked(p, a.id))?.name ?? null;
  const diffAfter = maxDifficulty(p);
  if (unlocks.length) p.runsSinceUnlock = 0;

  return {
    rewards,
    unlocks,
    discoveries: found,
    achievements,
    challenges,
    mastery: { core: s.core, before: before.level, after: after.level, into: after.into, need: after.need, rewards: masteryTexts },
    goals: nextGoals(p, 3),
    arenaUnlocked,
    difficultyUnlocked: diffAfter > diffBefore ? DIFFICULTIES[diffAfter].name : null,
    daily,
    rank: { before: rankBefore.level, after: rankAfter.level, into: rankAfter.into, need: rankAfter.need },
    contracts,
    ascensionUnlocked,
  };
}

/** Parts available for a slot, with lock info, for the loadout UI. */
export function partsForSlot(p: Profile, slot: 'shell' | 'impact' | 'momentum') {
  return PARTS.filter((x) => x.slot === slot).map((x) => ({ def: x, unlocked: isPartUnlocked(p, x.id) }));
}
