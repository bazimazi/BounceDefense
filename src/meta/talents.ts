import { normalizeTalents, TALENT_MAP, TALENT_POINT_CAP, talentPointCost, talentRequirement, talentSpent, type TalentRanks } from '../data/talents';
import { CORES } from '../data/balls';
import type { Profile } from './types';

/** Free points every profile starts with. */
export const TALENT_STARTER_POINTS = 3;

/**
 * Points earned from Mastery XP across every core: the first twenty come quickly, every later one costs
 * a little more, so the deep tiers take many runs on the hard difficulties.
 */
export function talentProgress(p: Pick<Profile, 'mastery'>): { total: number; xp: number; next: number; need: number } {
  const xp = CORES.reduce((sum, c) => {
    const value = p.mastery[c.id];
    return sum + (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
  }, 0);
  let total = TALENT_STARTER_POINTS;
  let rem = xp;
  while (total < TALENT_POINT_CAP && rem >= talentPointCost(total + 1)) {
    rem -= talentPointCost(total + 1);
    total++;
  }
  const need = total >= TALENT_POINT_CAP ? 0 : talentPointCost(total + 1);
  return { total, xp, next: need ? need - rem : 0, need };
}

/** Hardest difficulty index won in any arena (-1 before the first win): deep talent tiers check it. */
export function talentWins(p: Pick<Profile, 'cleared'>): number {
  return Math.max(-1, ...Object.values(p.cleared ?? {}));
}

export function changeTalent(ranks: TalentRanks, id: string, delta: 1 | -1, budget: number, won = Infinity): TalentRanks | null {
  if (!Object.hasOwn(TALENT_MAP, id)) return null;
  const t = TALENT_MAP[id];
  const rank = (ranks[id] ?? 0) + delta;
  if (rank < 0 || rank > t.maxRank || (delta > 0 && (talentSpent(ranks) >= budget || talentRequirement(ranks, t, won)))) return null;
  const next = { ...ranks };
  if (rank) next[id] = rank;
  else delete next[id];
  // Refunding a prerequisite also refunds dependent nodes, so a respec cannot strand points.
  return normalizeTalents(next, budget, won);
}

export function applyTalents(p: Profile, ranks: TalentRanks): void {
  p.talents = normalizeTalents(ranks, talentProgress(p).total, talentWins(p));
}
