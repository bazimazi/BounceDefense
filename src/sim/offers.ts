import { EVOLUTIONS, EVOLUTION_MAP, SYNERGIES } from '../data/synergies';
import { UPGRADES, UPGRADE_MAP } from '../data/upgrades';
import type { BuildView, Rarity } from '../data/types';
import type { Rng } from '../core/rng';
import type { Build } from './build';

export type Offer =
  | { kind: 'upgrade'; id: string; level: number }
  | { kind: 'evolution'; id: string }
  | { kind: 'heal' }
  | { kind: 'coins' };

export interface OfferContext {
  build: Build;
  rng: Rng;
  /** Upgrades unlocked for this profile (pool). */
  pool: ReadonlySet<string>;
  banished: ReadonlySet<string>;
  count: number;
  /** 0-based index of this level-up in the run. */
  levelIndex: number;
}

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 100, rare: 48, epic: 18, legendary: 6 };
const RARITY_TIER: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
export const MAX_DISTINCT_UPGRADES = 10;

export function isOfferable(id: string, ctx: OfferContext): boolean {
  const def = UPGRADE_MAP[id];
  if (!def) return false;
  if (ctx.banished.has(id)) return false;
  if (def.core && def.core !== ctx.build.core) return false;
  const lvl = ctx.build.level(id);
  if (lvl >= def.maxLevel) return false;
  if (lvl === 0) {
    if (!ctx.pool.has(id)) return false;
    if (ctx.build.upgrades.size >= MAX_DISTINCT_UPGRADES) return false;
  }
  return true;
}

export function upgradeWeight(id: string, ctx: OfferContext): number {
  const def = UPGRADE_MAP[id];
  const b = ctx.build;
  let w = RARITY_WEIGHT[def.rarity] * (def.weight ?? 1);
  // Luck improves rarity odds, it never adds raw power.
  w *= 1 + b.stats.luck * 0.3 * RARITY_TIER[def.rarity];
  // Build-aware offers: favour what the player is already investing in.
  if (b.level(id) > 0) w *= 1.6;
  let affinity = 0;
  for (const t of def.tags) affinity += Math.min(b.tag(t), 4);
  w *= 1 + Math.min(affinity * 0.08, 1);
  // Evolution catalysts become more likely when the main ingredient is maxed.
  for (const evoId of b.eligibleEvolutionsPartial()) {
    if (EVOLUTION_MAP[evoId].recipe.some((r) => r.id === id)) w *= 2;
  }
  // First picks: teach the fun stuff first.
  if (ctx.levelIndex < 2) {
    if (def.category === 'utility' || def.category === 'defense') w *= 0.15;
    if (def.category === 'element' || def.category === 'offense') w *= 1.6;
  }
  return w;
}

/** Synergies that taking one more level of `id` would activate (for card hints). */
export function previewSynergies(build: Build, id: string): string[] {
  const def = UPGRADE_MAP[id];
  if (!def) return [];
  const view: BuildView = {
    core: build.core,
    level: (x) => build.level(x) + (x === id ? 1 : 0),
    tag: (t) => build.tag(t) + (def.tags.includes(t) ? 1 : 0),
    hasEvolution: (x) => build.hasEvolution(x),
  };
  return SYNERGIES.filter((s) => !build.synergies.has(s.id) && s.requires(view)).map((s) => s.id);
}

/** Evolutions this upgrade is an ingredient of. */
export function feedsEvolutions(id: string): string[] {
  return EVOLUTIONS.filter((e) => e.recipe.some((r) => r.id === id)).map((e) => e.id);
}

export function makeOffers(ctx: OfferContext): Offer[] {
  const out: Offer[] = [];
  for (const evo of ctx.build.eligibleEvolutions()) {
    if (out.length < ctx.count) out.push({ kind: 'evolution', id: evo });
  }
  const candidates = UPGRADES.map((u) => u.id).filter((id) => isOfferable(id, ctx));
  while (out.length < ctx.count && candidates.length > 0) {
    const pick = ctx.rng.weighted(candidates, (id) => upgradeWeight(id, ctx));
    if (!pick) break;
    candidates.splice(candidates.indexOf(pick), 1);
    out.push({ kind: 'upgrade', id: pick, level: ctx.build.level(pick) + 1 });
  }
  if (out.length === 0) out.push({ kind: 'heal' }, { kind: 'coins' });
  return out;
}
