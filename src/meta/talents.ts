import { normalizeTalents, TALENT_MAP, TALENT_POINT_CAP, TALENT_XP_PER_POINT, talentRequirement, talentSpent, type TalentRanks } from '../data/talents';
import { CORES } from '../data/balls';
import type { Profile } from './types';

export function talentProgress(p: Pick<Profile, 'mastery'>): { total: number; xp: number; next: number } {
  const xp = CORES.reduce((sum, c) => {
    const value = p.mastery[c.id];
    return sum + (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
  }, 0);
  const total = Math.min(TALENT_POINT_CAP, 3 + Math.floor(xp / TALENT_XP_PER_POINT));
  return { total, xp, next: total === TALENT_POINT_CAP ? 0 : TALENT_XP_PER_POINT - xp % TALENT_XP_PER_POINT };
}

export function changeTalent(ranks: TalentRanks, id: string, delta: 1 | -1, budget: number): TalentRanks | null {
  if (!Object.hasOwn(TALENT_MAP, id)) return null;
  const t = TALENT_MAP[id];
  const rank = (ranks[id] ?? 0) + delta;
  if (rank < 0 || rank > t.maxRank || (delta > 0 && (talentSpent(ranks) >= budget || talentRequirement(ranks, t)))) return null;
  const next = { ...ranks };
  if (rank) next[id] = rank;
  else delete next[id];
  // Refunding a prerequisite also refunds dependent nodes, so a respec cannot strand points.
  return normalizeTalents(next, budget);
}

export function applyTalents(p: Profile, ranks: TalentRanks): void {
  p.talents = normalizeTalents(ranks, talentProgress(p).total);
}
