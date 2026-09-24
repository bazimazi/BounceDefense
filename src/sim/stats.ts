/**
 * Every tunable number of a build lives here. Upgrades, parts, cores, synergies,
 * evolutions, workshop levels, pacts and temporary buffs all contribute
 * Modifiers; the combat engine only ever reads the resolved Stats.
 */
export const STAT_DEFAULTS = {
  // ---- offense
  damage: 13,
  critChance: 0.05,
  critMult: 2,
  armorPen: 0,
  execute: 0, // kill non-boss enemies below this HP fraction
  overkill: 0, // fraction of excess kill damage carried to a nearby enemy
  // ---- physics
  speed: 780,
  radius: 9,
  knockback: 26,
  pierce: 0, // enemies passed through per wall-touch
  bounceDamage: 0, // +damage fraction per wall bounce this flight (max 10 stacks)
  bankCrit: 0, // +crit chance for hits after at least one wall bounce
  floorBounces: 0, // safety-net bounces per launch
  magnetism: 0, // homing turn rate (rad/s)
  wallAccel: 0, // +speed fraction per wall bounce (resets at floor)
  // ---- multiplication
  maxBalls: 1,
  splitChance: 0,
  splitCount: 2,
  echoChance: 0, // chance a launch spawns a temporary clone
  shardPower: 0.45, // damage multiplier of shards/clones
  // ---- elemental
  burnChance: 0,
  burnPower: 0.45, // burn dps as a fraction of hit damage
  chillChance: 0,
  frozenVuln: 0.25, // bonus damage taken while frozen
  chainChance: 0,
  chainCount: 2,
  chainDamage: 0.55,
  bleedChance: 0,
  elementPower: 1,
  burnSpread: 0, // chance a burning enemy spreads burn on death
  // ---- explosion
  explosionChance: 0,
  explosionDamage: 0.7,
  area: 1,
  chainReaction: 0, // chance explosion kills explode again
  // ---- defense
  maxHp: 120,
  regen: 0,
  armor: 0,
  lifesteal: 0,
  barrier: 0, // hits absorbed by the defense barrier per recharge
  // ---- combo / momentum
  comboWindow: 1.8,
  comboPower: 1,
  momentumGain: 1,
  momentumStart: 0,
  // ---- utility
  xpGain: 1,
  coinGain: 1,
  pickupRadius: 26,
  luck: 0,
};

export type StatKey = keyof typeof STAT_DEFAULTS;
export type Stats = Record<StatKey, number>;

export interface Modifier {
  stat: StatKey;
  /** Flat addition applied before multipliers. */
  add?: number;
  /** Multiplicative factor, stacked multiplicatively: value *= (1 + mult). */
  mult?: number;
}

export function computeStats(mods: readonly Modifier[], base: Partial<Stats> = {}): Stats {
  const add: Partial<Record<StatKey, number>> = {};
  const mul: Partial<Record<StatKey, number>> = {};
  for (const m of mods) {
    if (m.add) add[m.stat] = (add[m.stat] ?? 0) + m.add;
    if (m.mult) mul[m.stat] = (mul[m.stat] ?? 1) * (1 + m.mult);
  }
  const out = {} as Stats;
  for (const k of Object.keys(STAT_DEFAULTS) as StatKey[]) {
    const b = base[k] ?? STAT_DEFAULTS[k];
    out[k] = (b + (add[k] ?? 0)) * (mul[k] ?? 1);
  }
  // sanity clamps
  out.critChance = Math.min(out.critChance, 1);
  out.maxBalls = Math.max(1, Math.floor(out.maxBalls));
  out.pierce = Math.floor(out.pierce);
  out.floorBounces = Math.floor(out.floorBounces);
  out.chainCount = Math.floor(out.chainCount);
  out.splitCount = Math.max(1, Math.floor(out.splitCount));
  out.radius = Math.max(4, Math.min(out.radius, 26));
  out.speed = Math.max(260, Math.min(out.speed, 1500));
  out.lifesteal = Math.min(out.lifesteal, 0.5);
  out.execute = Math.min(out.execute, 0.35);
  return out;
}

/** Human-facing stat labels for the build panel. */
export const STAT_LABELS: Partial<Record<StatKey, [string, (v: number) => string]>> = {
  damage: ['Damage', (v) => v.toFixed(1)],
  critChance: ['Crit Chance', (v) => `${Math.round(v * 100)}%`],
  critMult: ['Crit Damage', (v) => `x${v.toFixed(2)}`],
  speed: ['Speed', (v) => `${Math.round(v)}`],
  maxBalls: ['Balls', (v) => `${v}`],
  pierce: ['Pierce', (v) => `${v}`],
  burnChance: ['Burn', (v) => `${Math.round(v * 100)}%`],
  chillChance: ['Chill', (v) => `${Math.round(v * 100)}%`],
  chainChance: ['Chain', (v) => `${Math.round(v * 100)}%`],
  explosionChance: ['Explode', (v) => `${Math.round(v * 100)}%`],
  splitChance: ['Split', (v) => `${Math.round(v * 100)}%`],
  bleedChance: ['Bleed', (v) => `${Math.round(v * 100)}%`],
  lifesteal: ['Lifesteal', (v) => `${(v * 100).toFixed(1)}%`],
  maxHp: ['Max HP', (v) => `${Math.round(v)}`],
  armor: ['Armor', (v) => `${Math.round(v)}`],
};
