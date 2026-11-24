/**
 * A deliberate drafter: how a player who knows the game picks cards. It commits to the evolutions its
 * pool can reach (preferring the core's own element), finishes recipes instead of spreading levels,
 * values extra balls and its signature, keeps the ten upgrade slots for things that matter, and spends
 * rerolls and banishes when a draft has nothing for the plan. The plain bot (`botChoose` 'focused')
 * picks owned cards 70% of the time and otherwise at random; tuning against both brackets real players.
 */
import type { Rng } from '../src/core/rng';
import { SIGNATURE_UPGRADE } from '../src/data/meta';
import { RELIC_MAP } from '../src/data/relics';
import { EVOLUTIONS } from '../src/data/synergies';
import { UPGRADE_MAP } from '../src/data/upgrades';
import { MAX_DISTINCT_UPGRADES, type Offer } from '../src/sim/offers';
import type { World } from '../src/sim/world';

/** The element each core leans on: its evolutions come first. */
const CORE_EVOS: Record<string, string[]> = {
  striker: ['railgun', 'prism', 'reaper'], pyro: ['inferno'], tesla: ['tesla_storm', 'thunderhead'], cryo: ['glacier'],
  blood: ['blood_moon'], void: ['singularity'], venom: ['plague'], titan: ['railgun'], gemini: ['hydra'], chrono: ['tesla_storm', 'railgun'],
  blast: ['minefield', 'inferno'],
};
const RARITY: Record<string, number> = { common: 0, rare: 18, epic: 40, legendary: 70 };
const RELIC_RARITY: Record<string, number> = { common: 10, rare: 40, legendary: 90 };

/** Evolutions the run is working toward: reachable from the pool, the core's own first, at most two. */
function plan(w: World): string[] {
  const pool = new Set(w.pool);
  const reachable = EVOLUTIONS.filter((e) => !w.build.hasEvolution(e.id) && e.recipe.every((r) => pool.has(r.id) || w.build.level(r.id) > 0));
  const score = (id: string) => {
    const e = EVOLUTIONS.find((x) => x.id === id)!;
    const owned = e.recipe.reduce((a, r) => a + Math.min(r.level, w.build.level(r.id)) / r.level, 0);
    return (CORE_EVOS[w.build.core]?.includes(id) ? 2 : 0) + owned * 1.5;
  };
  return reachable.map((e) => e.id).sort((a, b) => score(b) - score(a)).slice(0, 2);
}

function value(w: World, o: Offer, goals: string[]): number {
  if (o.kind === 'evolution') return 1000;
  if (o.kind === 'heal') return w.hp < w.maxHp * 0.45 ? 120 : 5;
  if (o.kind === 'coins') return 1;
  if (o.kind === 'relic') {
    const r = RELIC_MAP[o.id];
    return (RELIC_RARITY[r?.rarity ?? 'common'] ?? 10) - (r?.cursed ? 15 : 0);
  }
  const def = UPGRADE_MAP[o.id];
  const lvl = w.build.level(o.id);
  let v = RARITY[def.rarity] ?? 0;
  for (const id of goals) {
    const need = EVOLUTIONS.find((e) => e.id === id)!.recipe.find((r) => r.id === o.id);
    if (need && lvl < need.level) v += 90;
  }
  if (o.id === 'extra_ball') v += 70;
  if (o.id === SIGNATURE_UPGRADE[w.build.core]) v += 80;
  if (lvl > 0) v += 25 + 4 * lvl;
  else {
    // A new card spends one of the ten slots: only worth it early, or when it feeds the plan.
    const free = MAX_DISTINCT_UPGRADES - w.build.upgrades.size;
    if (free <= 3 && v < 90) v -= 40;
  }
  if (def.category === 'offense' || def.category === 'element') v += 15;
  if (def.category === 'utility') v -= 10;
  if (def.category === 'defense') v += w.hp < w.maxHp * 0.5 ? 25 : -5;
  return v;
}

export function smartChoose(w: World, rng: Rng): Offer {
  const goals = plan(w);
  for (let guard = 0; guard < 8; guard++) {
    const scored = w.offers.map((o) => ({ o, v: value(w, o, goals) + rng.range(0, 6) })).sort((a, b) => b.v - a.v);
    const best = scored[0];
    if (w.draft === 'upgrade' && best.v < 60) {
      // Banish the worst new card the plan does not need, then reroll a weak draft.
      const worst = scored[scored.length - 1];
      if (w.banishes > 0 && worst.o.kind === 'upgrade' && w.build.level(worst.o.id) === 0 && worst.v < 20 && w.banish(worst.o.id)) continue;
      if (w.rerolls > 0 && w.reroll()) continue;
    }
    return best.o;
  }
  return w.offers[0];
}
