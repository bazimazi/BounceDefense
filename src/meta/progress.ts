import { analytics } from '../core/analytics';
import { ARENAS, ARENA_MAP, DIFFICULTIES, PACT_MAP } from '../data/arenas';
import { CORES, CORE_MAP, PARTS, PART_MAP, TRAILS } from '../data/balls';
import { BOSS_MAP, ENEMY_MAP } from '../data/enemies';
import {
  ACHIEVEMENTS, CHALLENGES, RESEARCH, RESEARCH_MAP, WORKSHOP_MAP, masteryLevel, masteryRewards,
} from '../data/meta';
import { EVENT_MAP } from '../data/arenas';
import { EVOLUTION_MAP, REACTION_MAP, SYNERGY_MAP } from '../data/synergies';
import { DEFAULT_UNLOCKED_UPGRADES, UPGRADE_MAP } from '../data/upgrades';
import type { RunConfig } from '../sim/world';
import type { DiscoveryCat, Profile, RunSummary, Unlock } from './types';
import { normalizeTalents } from '../data/talents';
import { talentProgress } from './talents';

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

export function isArenaUnlocked(p: Profile, arenaId: string): boolean {
  const a = ARENA_MAP[arenaId];
  if (!a) return false;
  return !a.unlockReq || (p.bossKills[a.unlockReq.boss] ?? 0) > 0;
}

export function maxDifficulty(p: Profile): number {
  const best = Math.max(-1, ...Object.values(p.cleared));
  return Math.min(DIFFICULTIES.length - 1, best + 1);
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

export function canResearch(p: Profile, id: string): boolean {
  const r = RESEARCH_MAP[id];
  return !!r && !p.researchNodes.includes(id) && r.requires.every((x) => p.researchNodes.includes(x)) && p.research >= r.cost;
}

export function doResearch(p: Profile, id: string): string[] {
  if (!canResearch(p, id)) return [];
  const r = RESEARCH_MAP[id];
  p.research -= r.cost;
  p.researchNodes.push(id);
  analytics.emit('ResearchPurchased', { id });
  return r.grants.map((g) => applyUnlock(p, g)).filter(Boolean) as string[];
}

export function workshopCost(p: Profile, id: string): number | null {
  const w = WORKSHOP_MAP[id];
  const lvl = p.workshop[id] ?? 0;
  if (!w || lvl >= w.maxLevel) return null;
  return w.cost(lvl);
}

export function buyWorkshop(p: Profile, id: string): boolean {
  const cost = workshopCost(p, id);
  if (cost === null || p.coins < cost) return false;
  p.coins -= cost;
  p.workshop[id] = (p.workshop[id] ?? 0) + 1;
  analytics.emit('WorkshopPurchased', { id, level: p.workshop[id] });
  return true;
}

export function runConfig(p: Profile, opts: { arena: string; difficulty: number; pacts: string[]; seed: number; daily?: boolean }): RunConfig {
  const l = p.loadout;
  return {
    seed: opts.seed,
    arena: opts.arena,
    difficulty: opts.difficulty,
    core: p.unlockedCores.includes(l.core) ? l.core : 'striker',
    parts: [l.shell, l.impact, l.momentum].filter((id) => isPartUnlocked(p, id)),
    pacts: opts.pacts.filter((id) => PACT_MAP[id]),
    workshop: { ...p.workshop },
    talents: normalizeTalents(p.talents, talentProgress(p).total),
    pool: upgradePool(p),
    flags: researchFlags(p),
    trail: p.cosmetics.includes(l.trail) ? l.trail : 'classic',
    known: Object.fromEntries(Object.entries(p.discoveries).map(([k, v]) => [k, [...v]])),
    tutorial: !p.tutorialDone,
    daily: opts.daily,
  };
}

// ------------------------------------------------------------------ unlocks
export function describeUnlock(u: Unlock): string {
  switch (u.type) {
    case 'upgrade': return `New upgrade: ${UPGRADE_MAP[u.id]?.icon ?? ''} ${UPGRADE_MAP[u.id]?.name ?? u.id}`;
    case 'part': return `New part: ${PART_MAP[u.id]?.icon ?? ''} ${PART_MAP[u.id]?.name ?? u.id}`;
    case 'core': return `New core: ${CORE_MAP[u.id]?.name ?? u.id}`;
    case 'cosmetic': return `New trail: ${TRAILS.find((t) => t.id === u.id)?.name ?? u.id}`;
    case 'flag': return `New ability: ${u.id}`;
    case 'coins': return `+${u.amount} Coins`;
    case 'cores': return `+${u.amount} Cores`;
    case 'research': return `+${u.amount} Research`;
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
        return '+1 Research (duplicate trail)';
      }
      p.cosmetics.push(u.id);
      break;
    case 'flag':
      return null;
    case 'coins': p.coins += u.amount; break;
    case 'cores': p.cores += u.amount; break;
    case 'research': p.research += u.amount; break;
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

export function rewardMultiplier(s: Pick<RunSummary, 'difficulty' | 'pacts'>): number {
  const diff = DIFFICULTIES[s.difficulty] ?? DIFFICULTIES[0];
  const pact = s.pacts.reduce((a, id) => a + (PACT_MAP[id]?.reward ?? 0), 0);
  return diff.rewardMult * (1 + pact);
}

/** Every run pays out, win or lose. Victories and harder settings pay more. */
export function computeRewards(s: RunSummary, newDiscoveries: number): RunRewards {
  const mult = rewardMultiplier(s) * (s.victory ? 1.3 : 1);
  const base = s.coinsCollected + s.kills * 0.5 + s.eliteKills * 8 + s.bossesDefeated.length * 120 + Math.floor(s.time / 6);
  return {
    coins: Math.round(base * mult),
    cores: s.coresCollected + (s.victory ? 1 + s.difficulty : 0),
    research: newDiscoveries + (s.victory ? 1 : 0),
    masteryXp: Math.round((s.kills * 0.6 + s.level * 10 + s.bossesDefeated.length * 80 + (s.victory ? 100 : 0)) * (1 + s.difficulty * 0.25)),
  };
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
      goals.push({ kind: 'core', text: `${c.unlockReq?.text} to reveal ${c.name}`, reward: `${c.icon} ${c.name}`, cur: 0, max: 1 });
    } else {
      goals.push({ kind: 'core', text: `Collect ${c.unlockCost} Cores`, reward: `Unlock ${c.icon} ${c.name}`, cur: Math.min(p.cores, c.unlockCost), max: c.unlockCost });
    }
  }
  for (const a of ARENAS) {
    if (!isArenaUnlocked(p, a.id) && a.unlockReq) goals.push({ kind: 'arena', text: a.unlockReq.text, reward: `New arena: ${a.name}`, cur: 0, max: 1 });
  }
  const core = p.loadout.core;
  const m = masteryLevel(p.mastery[core] ?? 0);
  const mr = masteryRewards(core).find((r) => r.level === m.level + 1);
  if (mr) goals.push({ kind: 'mastery', text: `${CORE_MAP[core].name} Mastery ${m.level + 1}`, reward: mr.text, cur: m.into, max: m.need });
  const affordable = RESEARCH.find((r) => canResearch(p, r.id));
  if (affordable) goals.push({ kind: 'research', text: `Research ${affordable.name} (you can afford it!)`, reward: affordable.desc, cur: 1, max: 1 });
  const d = maxDifficulty(p);
  if (d < DIFFICULTIES.length - 1) goals.push({ kind: 'diff', text: `Win a run on ${DIFFICULTIES[d].name}`, reward: `Unlock ${DIFFICULTIES[d + 1].name} difficulty`, cur: 0, max: 1 });

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
}

export function applyRun(p: Profile, s: RunSummary, discoveries: { cat: DiscoveryCat; id: string }[]): RunReport {
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
  for (const b of s.bossesDefeated) {
    p.bossKills[b] = (p.bossKills[b] ?? 0) + 1;
    analytics.emit('BossDefeated', { id: b, fightTime: s.bossFightTimes[s.bossesDefeated.indexOf(b)] ?? 0 });
  }
  if (s.victory) {
    p.cleared[s.arena] = Math.max(p.cleared[s.arena] ?? -1, s.difficulty);
    analytics.emit('ArenaCompleted', { arena: s.arena, difficulty: s.difficulty });
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
  }

  // ---- currencies
  const rewards = computeRewards(s, researchFromDiscovery);
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
  if (newTalentPoints > 0) unlocks.push(`+${newTalentPoints} Talent point${newTalentPoints === 1 ? '' : 's'}! Spend them in Talents.`);
  const after = masteryLevel(p.mastery[s.core]);
  const masteryTexts: string[] = [];
  for (const r of masteryRewards(s.core)) {
    if (r.level > before.level && r.level <= after.level) {
      masteryTexts.push(`Lv ${r.level}: ${r.text}`);
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
  };
}

/** Parts available for a slot, with lock info, for the loadout UI. */
export function partsForSlot(p: Profile, slot: 'shell' | 'impact' | 'momentum') {
  return PARTS.filter((x) => x.slot === slot).map((x) => ({ def: x, unlocked: isPartUnlocked(p, x.id) }));
}
