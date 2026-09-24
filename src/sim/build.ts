import { EVOLUTIONS, EVOLUTION_MAP, SYNERGIES, SYNERGY_MAP } from '../data/synergies';
import { UPGRADE_MAP } from '../data/upgrades';
import type { BuildView, Tag } from '../data/types';
import { computeStats, type Modifier, type Stats } from './stats';

/**
 * The run's build: which upgrades, synergies and evolutions are active, and the
 * resolved Stats. All sources of power are Modifiers or Behaviors, composed here.
 */
export class Build implements BuildView {
  readonly upgrades = new Map<string, number>();
  readonly synergies = new Set<string>();
  readonly evolutions = new Set<string>();
  /** behavior id -> power level */
  readonly behaviors = new Map<string, number>();
  private tags = new Map<Tag, number>();
  stats!: Stats;
  /** Upgrade order, used for the build summary. */
  readonly history: string[] = [];

  constructor(
    public core: string,
    /** Permanent modifiers: core, parts, workshop, pacts. */
    private baseMods: Modifier[],
    /** Permanent behaviors: core, parts. */
    private baseBehaviors: string[],
    /** Temporary modifiers (arena events etc.), may be mutated then recompute(). */
    public tempMods: Modifier[] = [],
  ) {
    this.recompute();
  }

  level(id: string): number {
    return this.upgrades.get(id) ?? 0;
  }

  tag(tag: Tag): number {
    return this.tags.get(tag) ?? 0;
  }

  hasEvolution(id: string): boolean {
    return this.evolutions.has(id);
  }

  has(behavior: string): boolean {
    return this.behaviors.has(behavior);
  }

  power(behavior: string): number {
    return this.behaviors.get(behavior) ?? 0;
  }

  /** Adds one level of an upgrade. Returns newly-activated synergy ids. */
  addUpgrade(id: string): string[] {
    const def = UPGRADE_MAP[id];
    if (!def) throw new Error(`Unknown upgrade ${id}`);
    const lvl = this.level(id);
    if (lvl >= def.maxLevel) return [];
    this.upgrades.set(id, lvl + 1);
    this.history.push(id);
    return this.recompute();
  }

  addEvolution(id: string): string[] {
    if (!EVOLUTION_MAP[id]) throw new Error(`Unknown evolution ${id}`);
    this.evolutions.add(id);
    return this.recompute();
  }

  eligibleEvolutions(): string[] {
    return EVOLUTIONS.filter((e) => !this.evolutions.has(e.id) && e.recipe.every((r) => this.level(r.id) >= r.level)).map((e) => e.id);
  }

  /** Evolutions where some but not all ingredients are in place (used to nudge offers). */
  eligibleEvolutionsPartial(): string[] {
    return EVOLUTIONS.filter((e) => {
      if (this.evolutions.has(e.id)) return false;
      const met = e.recipe.filter((r) => this.level(r.id) >= r.level).length;
      return met > 0 && met < e.recipe.length;
    }).map((e) => e.id);
  }

  /** Recomputes tags, synergies, behaviors and stats. Returns newly-activated synergies. */
  recompute(): string[] {
    this.tags.clear();
    for (const [id, lvl] of this.upgrades) {
      for (const t of UPGRADE_MAP[id].tags) this.tags.set(t, (this.tags.get(t) ?? 0) + lvl);
    }
    const fresh: string[] = [];
    for (const s of SYNERGIES) {
      if (!this.synergies.has(s.id) && s.requires(this)) {
        this.synergies.add(s.id);
        fresh.push(s.id);
      }
    }
    this.behaviors.clear();
    const mods: Modifier[] = [...this.baseMods];
    for (const b of this.baseBehaviors) this.behaviors.set(b, 1);
    for (const [id, lvl] of this.upgrades) {
      const def = UPGRADE_MAP[id];
      if (def.mods) mods.push(...def.mods(lvl));
      if (def.behavior) this.behaviors.set(def.behavior, lvl);
    }
    for (const id of this.synergies) {
      const s = SYNERGY_MAP[id];
      if (s.mods) mods.push(...s.mods);
      if (s.behavior) this.behaviors.set(s.behavior, 1);
    }
    for (const id of this.evolutions) {
      const e = EVOLUTION_MAP[id];
      if (e.mods) mods.push(...e.mods);
      this.behaviors.set(e.behavior, 1);
    }
    mods.push(...this.tempMods);
    this.stats = computeStats(mods);
    return fresh;
  }

  /** Dominant archetype tags, strongest first. */
  topTags(n = 2): Tag[] {
    const skip: Tag[] = ['element', 'utility', 'defense'];
    return [...this.tags.entries()]
      .filter(([t]) => !skip.includes(t))
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([t]) => t);
  }
}

const PREFIX: Partial<Record<Tag, string>> = {
  fire: 'Inferno', ice: 'Glacial', lightning: 'Tesla', vampire: 'Vampiric', bleed: 'Serrated', explosion: 'Demolition',
  swarm: 'Swarm', crit: 'Assassin', ricochet: 'Ricochet', kinetic: 'Kinetic', combo: 'Combo', tank: 'Bulwark',
  impact: 'Heavy', momentum: 'Perpetual', control: 'Gravity', chain: 'Chain',
};
const NOUN: Partial<Record<Tag, string>> = {
  vampire: 'Devourer', explosion: 'Barrage', swarm: 'Hive', crit: 'Executioner', lightning: 'Storm', fire: 'Furnace',
  ice: 'Glacier', ricochet: 'Pinball', kinetic: 'Railgun', combo: 'Reactor', tank: 'Bastion', impact: 'Hammer',
  chain: 'Conduit', bleed: 'Reaper', momentum: 'Engine', control: 'Singularity',
};

const EVO_TAG: Record<string, Tag> = {
  inferno: 'fire', tesla_storm: 'lightning', glacier: 'ice', blood_moon: 'vampire', hydra: 'swarm', railgun: 'kinetic',
};

export function buildName(build: Build): string {
  const evo = [...build.evolutions][0];
  const [a, b] = build.topTags(2);
  if (evo) {
    const e = EVOLUTION_MAP[evo];
    const own = EVO_TAG[evo];
    const other = build.topTags(3).find((t) => t !== own && PREFIX[t] && !e.name.includes(PREFIX[t]!));
    return other ? `${PREFIX[other]} ${e.name}` : e.name;
  }
  if (!a) return 'Plain Ball';
  if (!b) return `${PREFIX[a] ?? 'Bouncing'} Machine`;
  return `${PREFIX[a] ?? ''} ${NOUN[b] ?? 'Machine'}`.trim();
}
