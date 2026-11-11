import { t, type UiKey } from '../i18n';
import { EventBus } from '../core/events';
import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { SpatialHash } from '../core/spatial';
import { ARENA_MAP, DIFFICULTIES, EVENT_MAP, PACT_MAP } from '../data/arenas';
import { CORE_MAP, PART_MAP, TRAILS } from '../data/balls';
import { ENEMY_MAP, INTERNAL_ENEMIES } from '../data/enemies';
import { ASCENSION_TIER, MAX_ASCENSION, ascensionRules, type AscensionRule } from '../data/ascension';
import { DEFAULT_UNLOCKED_RELICS, RELICS, RELIC_MAP, RELIC_WEIGHT } from '../data/relics';
import { MAX_DRAFT_CARDS, SECOND_WIND, SENTINEL_INTERVAL, SIGNATURE_UPGRADE, WORKSHOP_MAP } from '../data/meta';
import { normalizeTalents, TALENTS, talentModifiers, type TalentRanks } from '../data/talents';
import { EVOLUTION_MAP, SYNERGY_MAP } from '../data/synergies';
import { UPGRADE_MAP } from '../data/upgrades';
import type { ArenaDef, DifficultyDef, EnemyDef } from '../data/types';
import type { DiscoveryCat, RunSummary } from '../meta/types';
import { BEHAVIORS, type Behavior } from './behaviors';
import { Build, buildName } from './build';
import { applyChill, applyPoison, chainLightning, damageEnemy, densest, explode, meteor, nearestEnemy, sparkNearest } from './combat';
import { Director } from './director';
import { updateEnemy } from './enemies';
import { makeOffers, type Offer } from './offers';
import { stepBall } from './physics';
import { ResonanceCircuit } from './resonance';
import type { Modifier } from './stats';
import {
  DEFENSE_Y, FIELD_TOP, H, LAUNCHER_X, LAUNCHER_Y, MAX_BALLS_TOTAL, MAX_ENEMIES, W,
  type Ball, type BallKind, type Enemy, type Fx, type Obstacle, type Pickup, type PickupKind, type Projectile,
  type Segment, type Zone,
} from './types';

export interface RunConfig {
  seed: number;
  arena: string;
  difficulty: number;
  core: string;
  parts: string[];
  pacts: string[];
  workshop: Record<string, number>;
  talents?: TalentRanks;
  /** Unlocked upgrade pool. */
  pool: string[];
  /** Research flags (reroll1, banish, fourth_card, codex, bounty, scope...). */
  flags: string[];
  trail: string;
  /** Already-known discoveries, so the sim knows what's "new". */
  known: Partial<Record<DiscoveryCat, string[]>>;
  tutorial?: boolean;
  daily?: boolean;
  /** Ascension level (only meaningful on Abyss). */
  ascension?: number;
  /** Relics this profile can find (defaults to the starting set). */
  relicPool?: string[];
  /** Different bosses this profile has defeated (Combat Archive). */
  bossLore?: number;
  /** Core Resonance's partner core: half its passive stats join the run. */
  echoCore?: string;
}

/** Where the Sentinel drones hover above the line. */
export const SENTINEL_POS: [number, number][] = [[118, DEFENSE_Y - 26], [422, DEFENSE_Y - 26]];

export interface WorldEvents {
  levelUp: { offers: Offer[] };
  synergy: { id: string; isNew: boolean };
  evolution: { id: string };
  discovery: { cat: DiscoveryCat; id: string };
  bossSpawn: { id: string };
  bossDefeated: { id: string };
  eventStart: { id: string };
  over: { victory: boolean };
  combo: { n: number };
  momentum: { tier: number };
}

export const MOMENTUM_TIERS = [0, 5, 12, 25, 45];
/** Localized momentum tier name. */
export const momentumName = (tier: number): string => t(`momentum.${tier}` as UiKey);
export const MOMENTUM_COLORS = ['#ffffff', '#7ad7ff', '#ffe066', '#ff7ad9', '#ff3b3b'];
export const TIER_DMG = [1, 1.15, 1.35, 1.7, 2.0];
export const TIER_CRIT = [0, 0, 0.05, 0.1, 0.12];
export const TIER_SPEED = [1, 1, 1.05, 1.15, 1.2];
export const COMBO_MILESTONES = [10, 25, 50, 100, 150, 200, 300];
export const POWER_START = 0.55;
export const POWER_END = 0.95;
/** Default Tactical Recall cooldown; builds change it through the `recallCooldown` stat. */
export const RECALL_COOLDOWN = 10;
/** A tier's `lateHp` ramps in from this run time over LATE_HP_RAMP seconds. */
export const LATE_HP_START = 60;
export const LATE_HP_RAMP = 360;
/** Seconds for Kinetic Barrier charges to refill after one is spent. */
export const BARRIER_RECHARGE = 12;
/**
 * Levels that add a ball on their own. Multi-ball is a core verb (hold to stream), so every run
 * grows into it; Extra Ball is one upgrade among many instead of a pick no build can skip.
 */
export const BALL_MILESTONES = [4, 11];
/** Under Lone Ball each milestone sharpens the single ball instead (damage multiplier per milestone). */
export const LONE_FOCUS = 0.9;

export function momentumTier(m: number): number {
  let t = 0;
  for (let i = 0; i < MOMENTUM_TIERS.length; i++) if (m >= MOMENTUM_TIERS[i]) t = i;
  return t;
}

/** XP needed to advance from `level` to `level + 1`. */
export function xpForLevel(level: number): number {
  const k = level - 1;
  return Math.floor(4 + k * 2 + Math.pow(k, 1.4) * 0.62);
}

interface Counters {
  kills: number;
  eliteKills: number;
  damageDealt: number;
  damageTaken: number;
  healed: number;
  bestCombo: number;
  maxWallChain: number;
  maxBounceChain: number;
  maxBallsInFlight: number;
  maxBallsOwned: number;
  maxMomentumTier: number;
  fireKills: number;
  lightningKills: number;
  explosionKills: number;
  bleedKills: number;
  frozenCount: number;
  barrelsExploded: number;
  goldenCaught: number;
  coinsCollected: number;
  coresCollected: number;
  bossesDefeated: string[];
  bossFightTimes: number[];
  bossNoDamage: boolean;
  poisonKills: number;
}

export class World {
  readonly cfg: RunConfig;
  readonly rng: Rng;
  readonly arena: ArenaDef;
  readonly diff: DifficultyDef;
  readonly bus = new EventBus<WorldEvents>();
  readonly build: Build;
  readonly talents: Readonly<TalentRanks>;
  talentBankReadyAt = 0;
  readonly director: Director;
  readonly resonance: ResonanceCircuit;
  readonly grid = new SpatialHash<Enemy>(W, H, 64);

  time = 0;
  state: 'playing' | 'levelup' | 'over' = 'playing';
  /** What the open draft offers: upgrades on level-up, relics from a cache. */
  draft: 'upgrade' | 'relic' = 'upgrade';
  /** Relic caches waiting to be opened. */
  pendingRelics = 0;
  /** Ascension rules in force for this run. */
  readonly asc: Set<AscensionRule>;
  /** Pact rules in force for this run. */
  readonly pacts: Set<string>;
  /** Seconds of the Chronarch's time stop left. */
  timeStop = 0;
  /** Recent deaths a Necromancer can raise. */
  graves: { x: number; y: number }[] = [];
  /** Commander elites on the field (rebuilt each step). */
  commanders: Enemy[] = [];
  vortexCounter = 0;
  lanternStacks = 0;
  phoenixUsed = false;
  /** The Second Wind blueprint has already held the line this run. */
  secondWindUsed = false;
  /** Unbreakable (talent capstone) has already held the line this run; the line ignores damage until this time. */
  unbreakableUsed = false;
  invulnUntil = -1;
  /** Cryostasis Failsafe has already frozen the field this run. */
  cryostasisUsed = false;
  /** The Surge now running is Aftershock's echo, which never echoes again. */
  aftershockLive = false;
  /** Seconds until the Sentinel drones fire. */
  sentinelT = 2;
  /** Rarity floor of each pending relic cache (0 any, 1 rare or better, 2 legendary). */
  relicFloors: number[] = [];
  /** Relic Attunement has already lifted a cache this run. */
  attuned = false;
  /** Seconds survived since Endless began. */
  endlessTime = 0;
  private xpScale = 1;
  victory = false;
  endTimer = -1;

  balls: Ball[] = [];
  enemies: Enemy[] = [];
  pickups: Pickup[] = [];
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  obstacles: Obstacle[] = [];
  segments: Segment[] = [];
  dynSegments: Segment[] = [];
  /** Enemies that exert fields on balls (magnets, wardens, magnetar); rebuilt each step. */
  fieldEnemies: Enemy[] = [];
  /** Momentum carried over by Stabilizer / Perpetual Motion for the next launch. */
  savedMomentum: number[] = [];
  fx: Fx[] = [];

  hp = 100;
  maxHp = 100;
  level = 1;
  xp = 0;
  xpNext = xpForLevel(1);
  pendingLevels = 0;
  levelUps = 0;
  offers: Offer[] = [];
  rerolls = 0;
  banishes = 0;
  banished = new Set<string>();
  /** Balls granted by `BALL_MILESTONES` so far. */
  milestoneBalls = 0;
  /** Milestone announcements held back while an upgrade choice covers the arena. */
  private milestoneNews: (() => void)[] = [];
  pool: Set<string>;
  flags: Set<string>;

  hand = 1;
  launchQueue = 0;
  launchTimer = 0;
  powerQueue = 0;
  recallCooldown = 0;
  powerShots = 0;
  recalls = 0;
  aim = { active: false, dx: 0, dy: -1, holdTime: 0, streamed: false };

  combo = { count: 0, timer: 0, lastId: -1, same: 0, nextMilestone: 0 };
  surge = { charge: 0, max: 140, active: 0 };
  barrier = { charges: 0, timer: 0 };
  healBudget = 10;
  buffs: { id: string; t: number; mods: Modifier[] }[] = [];
  event: { id: string; t: number; dur: number; timer: number; dir: number } | null = null;
  bossStart = 0;
  nextId = 1;
  explosionsThisStep = 0;
  staticCounter = 0;
  bh: [Behavior, number][] = [];
  noHeal: boolean;
  loneBall: boolean;
  enemySpeedMult: number;
  enemyHpMult: number;
  trailColors: string[];
  run: Counters = {
    kills: 0, eliteKills: 0, damageDealt: 0, damageTaken: 0, healed: 0, bestCombo: 0, maxWallChain: 0, maxBounceChain: 0,
    maxBallsInFlight: 0, maxBallsOwned: 1, maxMomentumTier: 0, fireKills: 0, lightningKills: 0, explosionKills: 0,
    bleedKills: 0, frozenCount: 0, barrelsExploded: 0, goldenCaught: 0, coinsCollected: 0, coresCollected: 0,
    bossesDefeated: [], bossFightTimes: [], bossNoDamage: true, poisonKills: 0,
  };
  /** Discoveries made during this run (new to the profile). */
  newDiscoveries: { cat: DiscoveryCat; id: string }[] = [];
  seen: Record<DiscoveryCat, Set<string>>;
  reactionsRun = new Set<string>();
  eventsSeen: string[] = [];
  enemiesSeen = new Set<string>();
  /** Scratch arrays to avoid allocations in hot loops. */
  readonly q: Enemy[] = [];
  readonly q2: Enemy[] = [];

  constructor(cfg: RunConfig) {
    this.talents = Object.freeze(normalizeTalents(cfg.talents));
    this.cfg = { ...cfg, talents: { ...this.talents } };
    this.rng = new Rng(cfg.seed);
    this.arena = ARENA_MAP[cfg.arena] ?? ARENA_MAP.proving;
    this.diff = DIFFICULTIES[clamp(cfg.difficulty, 0, DIFFICULTIES.length - 1)];
    this.pool = new Set(cfg.pool);
    this.flags = new Set(cfg.flags);
    const pacts = cfg.pacts.map((p) => PACT_MAP[p]).filter(Boolean);
    this.pacts = new Set(pacts.map((p) => p.rule ?? p.id));
    // Ascension only applies on the hardest tier.
    this.asc = ascensionRules(DIFFICULTIES.indexOf(this.diff) >= ASCENSION_TIER ? clamp(Math.floor(cfg.ascension ?? 0), 0, MAX_ASCENSION) : 0);
    const asc = this.asc;
    this.noHeal = pacts.some((p) => p.rule === 'noHeal');
    this.loneBall = pacts.some((p) => p.rule === 'loneBall');
    this.enemySpeedMult = this.diff.speedMult * (pacts.some((p) => p.rule === 'haste') ? 1.4 : 1) * (asc.has('speed8') ? 1.08 : 1);
    this.enemyHpMult = this.diff.hpMult * (this.arena.hpMult ?? 1) * (pacts.some((p) => p.rule === 'fortified') ? 1.35 : 1) *
      (asc.has('hp10') ? 1.1 : 1) * (asc.has('hp15') ? 1.15 : 1) * (asc.has('hp20') ? 1.2 : 1);
    const noReroll = pacts.some((p) => p.rule === 'noReroll');
    const ws = (id: string) => cfg.workshop[id] ?? 0;
    this.rerolls = noReroll ? 0 : Math.max(0, 1 + (this.flags.has('reroll1') ? 1 : 0) + (this.flags.has('reroll2') ? 1 : 0) + (this.flags.has('reroll3') ? 1 : 0) + ws('bp_draft') - (asc.has('reroll') ? 1 : 0));
    this.banishes = noReroll ? 0 : (this.flags.has('banish') ? 2 + (this.flags.has('banish2') ? 1 : 0) : 0) + ws('bp_exile');
    this.xpScale = asc.has('xp10') ? 1.1 : 1;
    this.xpNext = Math.ceil(xpForLevel(1) * this.xpScale);
    this.trailColors = (TRAILS.find((t) => t.id === cfg.trail) ?? TRAILS[0]).colors;
    this.seen = {
      enemies: new Set(cfg.known.enemies), bosses: new Set(cfg.known.bosses), synergies: new Set(cfg.known.synergies),
      evolutions: new Set(cfg.known.evolutions), reactions: new Set(cfg.known.reactions), upgrades: new Set(cfg.known.upgrades),
      arenas: new Set(cfg.known.arenas), events: new Set(cfg.known.events), relics: new Set(cfg.known.relics),
    };

    // ---- build: core + parts + workshop + pacts + talents
    const core = CORE_MAP[cfg.core] ?? CORE_MAP.striker;
    const mods: Modifier[] = [...core.mods];
    const behaviors: string[] = core.behavior ? [core.behavior] : [];
    for (const pid of cfg.parts) {
      const p = PART_MAP[pid];
      if (!p) continue;
      mods.push(...p.mods);
      if (p.behavior) behaviors.push(p.behavior);
    }
    for (const [id, lvl] of Object.entries(cfg.workshop)) {
      const wdef = WORKSHOP_MAP[id];
      // A refit only tunes its own core.
      if (wdef && lvl > 0 && (!wdef.core || wdef.core === core.id)) mods.push(...wdef.mods(lvl));
    }
    for (const p of pacts) if (p.mods) mods.push(...p.mods);
    mods.push(...talentModifiers(this.talents));
    // Research: Combat Archive rewards a wide boss record, Core Resonance lends half of another core's passive stats.
    if (this.flags.has('archive')) mods.push({ stat: 'eliteDamage', add: 0.02 * Math.min(10, cfg.bossLore ?? 0) });
    const echo = this.flags.has('echocore') && cfg.echoCore && cfg.echoCore !== core.id ? CORE_MAP[cfg.echoCore] : undefined;
    if (echo) for (const m of echo.mods) mods.push({ stat: m.stat, ...(m.add ? { add: m.add / 2 } : {}), ...(m.mult ? { mult: m.mult / 2 } : {}) });
    if (asc.has('hull15')) mods.push({ stat: 'maxHp', mult: -0.15 });
    if (asc.has('heal30')) mods.push({ stat: 'healMult', mult: -0.3 });
    if (this.flags.has('tactics')) mods.push({ stat: 'recallCooldown', add: -2 });
    if (this.flags.has('surge1')) mods.push({ stat: 'surgeGain', mult: 0.15 });
    for (const t of TALENTS) if (this.talents[t.id] && t.behavior) behaviors.push(t.behavior);
    // Workshop Spare Ball raises Extra Ball's ceiling: more balls late, no early power spike.
    const spare = (ws('spare_ball') > 0 ? 1 : 0) + (ws('spare_ball') > 0 && ws('bp_magazine') > 0 ? 1 : 0);
    const caps: Record<string, number> = spare ? { extra_ball: spare } : {};
    this.build = new Build(core.id, mods, behaviors, [], caps);
    for (const u of core.startUpgrades) this.build.addUpgrade(u);
    if (this.flags.has('evocat')) this.build.evoDiscount = 1;
    const sig = SIGNATURE_UPGRADE[core.id];
    if (this.flags.has('signature') && sig && cfg.pool.includes(sig) && this.build.level(sig) === 0) this.build.addUpgrade(sig);
    this.refreshBehaviors();
    this.maxHp = this.build.stats.maxHp;
    this.hp = this.maxHp;
    this.hand = this.maxBallsAllowed();
    this.barrier.charges = this.build.stats.barrier;

    this.buildArena();
    this.resonance = new ResonanceCircuit(this);
    this.director = new Director(this);
    this.discover('arenas', this.arena.id);
    if (ws('head_start') > 0) this.pendingLevels++;
    if (ws('head_start') > 0) this.pendingLevels += ws('bp_launch');
    if (ws('relic_cache') > 0 && !cfg.tutorial) this.grantRelic(false);
    if (this.flags.has('unified') && !cfg.tutorial) this.grantRelic(false, 2);
    if (ws('bp_primed') > 0) this.surge.charge = this.surge.max * Math.min(1, ws('bp_primed') / 3);
  }

  // ------------------------------------------------------------------ setup
  private buildArena(): void {
    const bottom = H + 200;
    this.segments.push(
      { ax: 0, ay: FIELD_TOP, bx: W, by: FIELD_TOP, kind: 'wall' },
      { ax: 0, ay: FIELD_TOP, bx: 0, by: bottom, kind: 'wall' },
      { ax: W, ay: FIELD_TOP, bx: W, by: bottom, kind: 'wall' },
    );
    const lr = this.rng.fork(7);
    const layout = lr.pick(this.arena.layouts);
    const mirror = lr.chance(0.5);
    const mx = (x: number) => (mirror ? W - x : x);
    const jitter = () => lr.range(-10, 10);
    for (const t of layout) {
      switch (t.kind) {
        case 'bumper': this.obstacles.push({ kind: 'bumper', x: mx(t.x) + jitter(), y: t.y + jitter(), r: t.r, flash: 0 }); break;
        case 'deflector': {
          const o: Obstacle = { kind: 'deflector', ax: mx(t.ax), ay: t.ay, bx: mx(t.bx), by: t.by, flash: 0 };
          this.obstacles.push(o);
          this.segments.push({ ax: o.ax, ay: o.ay, bx: o.bx, by: o.by, kind: 'deflector', ref: o });
          break;
        }
        case 'barrel': this.obstacles.push({ kind: 'barrel', x: mx(t.x) + jitter(), y: t.y + jitter(), r: 15, alive: true, respawn: 0 }); break;
        case 'oil': this.obstacles.push({ kind: 'oil', x: mx(t.x), y: t.y, r: t.r, burning: 0 }); break;
        case 'crate': {
          const x = mirror ? W - t.x - t.w : t.x;
          this.obstacles.push({ kind: 'crate', x, y: t.y, w: t.w, h: t.h, hp: 3, alive: true, respawn: 0, flash: 0 });
          break;
        }
        case 'portal': this.obstacles.push({ kind: 'portal', ax: mx(t.ax), ay: t.ay, bx: mx(t.bx), by: t.by, r: 24, spin: 0 }); break;
        case 'well': this.obstacles.push({ kind: 'well', x: mx(t.x), y: t.y, r: t.r, strength: t.strength }); break;
        case 'spore': this.obstacles.push({ kind: 'spore', x: mx(t.x) + jitter(), y: t.y + jitter(), r: 16, alive: true, respawn: 0 }); break;
        case 'pylon': this.obstacles.push({ kind: 'pylon', x: mx(t.x), y: t.y, r: t.r, flash: 0, cd: 0 }); break;
        case 'booster': this.obstacles.push({ kind: 'booster', x: mx(t.x), y: t.y, r: t.r, flash: 0 }); break;
      }
    }
  }

  refreshBehaviors(): void {
    this.bh = [];
    for (const [id, p] of this.build.behaviors) {
      const b = BEHAVIORS[id];
      if (b) this.bh.push([b, p]);
    }
  }

  maxBallsAllowed(): number {
    return this.loneBall ? 1 : this.build.stats.maxBalls + this.milestoneBalls;
  }

  // ------------------------------------------------------------------ ids & fx
  id(): number {
    return this.nextId++;
  }

  emit(f: Fx): void {
    if (this.fx.length < 2000) this.fx.push(f);
  }

  banner(text: string, color: string, sub?: string, big = false): void {
    this.emit({ t: 'banner', text, color, sub, big });
  }

  discover(cat: DiscoveryCat, id: string): boolean {
    if (this.seen[cat].has(id)) return false;
    this.seen[cat].add(id);
    this.newDiscoveries.push({ cat, id });
    this.bus.emit('discovery', { cat, id });
    return true;
  }

  // ------------------------------------------------------------------ spawning
  spawnBall(kind: BallKind, x: number, y: number, dx: number, dy: number, parent?: Ball): Ball | null {
    if (this.balls.length >= MAX_BALLS_TOTAL) return null;
    const st = this.build.stats;
    const l = Math.hypot(dx, dy) || 1;
    const temp = kind !== 'main';
    const b: Ball = {
      id: this.id(), kind, x, y, dx: dx / l, dy: dy / l,
      r: temp ? Math.max(5, st.radius * (kind === 'shard' ? 0.7 : 0.9)) : st.radius,
      state: 'flight', returnT: 0, rx: 0, ry: 0,
      wallBounces: parent?.wallBounces ?? 0, bounceChain: 0,
      momentum: parent ? parent.momentum * 0.5 : kind === 'main' ? Math.max(st.momentumStart, this.savedMomentum.pop() ?? 0) : st.momentumStart,
      floorBounces: temp ? 0 : st.floorBounces,
      pierceLeft: st.pierce,
      dmgMult: kind === 'main' ? 1 : st.shardPower * (kind === 'frenzy' ? 1.4 : 1),
      powered: parent?.powered ?? false,
      life: kind === 'main' ? -1 : kind === 'frenzy' ? 9 : 12,
      recentId: [], recentT: [], trail: [], boost: 1, portalCd: 0, portalHops: 0, phased: false,
      splitGen: parent ? parent.splitGen + 1 : 0, hitCounter: 0, arcTimer: 0, firstHitDone: false, dead: false, pulse: 0,
      anchorX: x, anchorY: y, stuckT: 0, idleT: 0, prism: false, meteorDone: false,
    };
    this.balls.push(b);
    let inFlight = 0;
    for (const o of this.balls) if (o.state === 'flight') inFlight++;
    if (inFlight > this.run.maxBallsInFlight) this.run.maxBallsInFlight = inFlight;
    return b;
  }

  makeEnemy(def: EnemyDef, x: number, y: number, hpMult = 1): Enemy {
    const g = this.diff.growth;
    const timeScale = 1 + (this.time / 100) * 0.3 * g + Math.pow(this.time / 300, 2) * 0.35 * g;
    const blood = this.event?.id === 'blood_moon' ? 1.5 : 1;
    const endless = this.director?.endlessPressure() ?? 1;
    // Tier and arena toughness phase in over the opening ninety seconds, so early fodder still pops in a hit or two.
    const tier = 1 + (this.enemyHpMult - 1) * Math.min(1, 0.4 + this.time / 150);
    const crown = this.build.has('relic_cursed_crown') ? 1.25 : 1;
    const bossAsc = def.boss && this.asc.has('boss20') ? 1.2 : 1;
    const late = 1 + ((this.diff.lateHp ?? 1) - 1) * clamp((this.time - LATE_HP_START) / LATE_HP_RAMP, 0, 1);
    const hp = def.boss ? def.hp * hpMult * bossAsc : def.hp * tier * timeScale * blood * hpMult * endless * crown * late;
    return {
      id: this.id(), def, x, y, r: def.radius, _q: 0, hp, maxHp: hp, speed: def.speed,
      armor: def.armor + (this.pacts.has('ironclad') ? 3 : 0),
      kx: 0, ky: 0,
      st: {
        burnDps: 0, burnT: 0, burnTick: 0, chill: 0, chillT: 0, frozenT: 0, bleed: 0, bleedT: 0, bleedDps: 0, bleedTick: 0,
        poison: 0, poisonT: 0, poisonDps: 0, poisonTick: 0, stunT: 0, reactCd: 0,
      },
      elite: [], shieldHp: 0, flash: 0, alive: true, spawnT: 0, t0: 0, t1: 0, phase: 0, gen: 0, t2: 0, t3: 0, tag: '', phased: false, slowT: 0, lives: 0,
      boss: !!def.boss, killedBy: '', dmgAcc: 0, dmgAccT: 0, dmgAccCrit: false, wobble: this.rng.range(0, 6.28),
    };
  }

  spawnEnemy(id: string, x: number, y: number, opts: { elite?: string[]; hpMult?: number } = {}): Enemy | null {
    if (this.enemies.length >= MAX_ENEMIES) return null;
    const def = ENEMY_MAP[id];
    if (!def) return null;
    const e = this.makeEnemy(def, clamp(x, def.radius + 4, W - def.radius - 4), y, opts.hpMult ?? 1);
    if (opts.elite?.length) this.makeElite(e, opts.elite);
    if (this.event?.id === 'iron_tide' && !def.boss && def.ai !== 'golden' && def.ai !== 'pylon') {
      e.armor += 3;
      e.shieldHp = Math.max(e.shieldHp, e.maxHp * 0.25);
    }
    this.enemies.push(e);
    if (!def.boss && !INTERNAL_ENEMIES.includes(id)) {
      this.enemiesSeen.add(id);
      this.discover('enemies', id);
    }
    return e;
  }

  makeElite(e: Enemy, mods: string[]): void {
    e.elite = this.asc.has('eliteRegen') && !mods.includes('regen') ? [...mods, 'regen'] : mods;
    e.hp *= 3;
    e.maxHp = e.hp;
    e.r *= 1.3;
    for (const m of mods) {
      if (m === 'swift') e.speed *= 1.7;
      if (m === 'armored') e.armor += 5;
      if (m === 'shielded') e.shieldHp = e.maxHp * 0.45;
      if (m === 'undying') e.lives = 1;
    }
  }

  /** Remembers where a regular enemy fell, for Necromancers (bounded). */
  recordGrave(e: Enemy): void {
    this.graves.push({ x: e.x, y: e.y });
    if (this.graves.length > 24) this.graves.shift();
  }

  spawnPickup(kind: PickupKind, x: number, y: number, value: number): void {
    if (this.pickups.length > 400 && kind === 'xp') {
      // merge into an existing gem to keep counts bounded
      const g = this.pickups[this.rng.int(0, this.pickups.length - 1)];
      if (g.kind === 'xp') {
        g.value += value;
        return;
      }
    }
    this.pickups.push({
      kind, x, y, vx: this.rng.range(-60, 60), vy: this.rng.range(-80, -20), value, t: 0, alive: true, homing: false,
    });
  }

  spawnProjectile(x: number, y: number, vx: number, vy: number, dmg: number, color = '#ff4a6a', r = 8): void {
    const k = this.asc.has('projectiles') ? 1.25 : 1;
    this.projectiles.push({ x, y, vx: vx * k, vy: vy * k, r, dmg, alive: true, color });
  }

  addZone(kind: Zone['kind'], x: number, y: number, r: number, dur: number, dps: number): void {
    if (this.zones.length > 60) return;
    this.zones.push({ kind, x, y, r, t: 0, dur, dps, tick: 0, alive: true });
  }

  // ------------------------------------------------------------------ relics
  /** Relics can be found unless a pact forbids them. */
  relicsAllowed(): boolean {
    return !this.pacts.has('noRelic');
  }

  /** A relic cache: opens a relic draft as soon as the arena is calm (between level-ups). */
  grantRelic(announce = true, floor = 0): void {
    if (!this.relicsAllowed() || !this.relicChoices().length) return;
    this.pendingRelics++;
    this.relicFloors.push(floor);
    if (announce) {
      this.banner(t('fx.relicCache'), '#ffb300', t('fx.relicCacheSub'));
      this.emit({ t: 'sfx', name: 'relic' });
    }
  }

  /** Relics that could appear in a cache right now. */
  relicChoices(): string[] {
    const pool = new Set([...DEFAULT_UNLOCKED_RELICS, ...(this.cfg.relicPool ?? [])]);
    return RELICS.filter((r) => pool.has(r.id) && !this.build.hasRelic(r.id) &&
      !(r.inert?.includes('noHeal') && this.noHeal) && !(r.inert?.includes('loneBall') && this.loneBall)).map((r) => r.id);
  }

  openRelicDraft(): void {
    const count = Math.max(1, (this.flags.has('relic4') ? 4 : 3) + ((this.cfg.workshop.bp_relic_vault ?? 0) > 0 ? 1 : 0) - (this.asc.has('relic2') ? 1 : 0));
    let candidates = this.relicChoices();
    const luck = this.build.stats.luck;
    const tier = { common: 0, rare: 1, legendary: 2 };
    // A lifted cache offers only the rarer relics, stepping down when none of that rarity are left.
    let floor = this.relicFloors[0] ?? 0;
    if (this.flags.has('attune') && !this.attuned) { floor = Math.max(floor, 1); this.attuned = true; }
    for (; floor > 0; floor--) {
      const lifted = candidates.filter((id) => tier[RELIC_MAP[id].rarity] >= floor);
      if (lifted.length) { candidates = lifted; break; }
    }
    this.offers = [];
    while (this.offers.length < count && candidates.length) {
      const pick = this.rng.weighted(candidates, (id) => RELIC_WEIGHT[RELIC_MAP[id].rarity] * (1 + luck * 0.3 * tier[RELIC_MAP[id].rarity]));
      if (!pick) break;
      candidates.splice(candidates.indexOf(pick), 1);
      this.offers.push({ kind: 'relic', id: pick });
    }
    if (!this.offers.length) {
      this.pendingRelics = 0;
      this.relicFloors.length = 0;
      return;
    }
    this.draft = 'relic';
    this.state = 'levelup';
    this.bus.emit('levelUp', { offers: this.offers });
  }

  /** Charges Surge, scaled by the build's surge gain. */
  chargeSurge(n: number): void {
    this.surge.charge = Math.min(this.surge.max, this.surge.charge + n * this.build.stats.surgeGain);
  }

  // ------------------------------------------------------------------ arena devices
  burstSpore(o: Extract<Obstacle, { kind: 'spore' }>): void {
    if (!o.alive) return;
    o.alive = false;
    o.respawn = 10;
    const st = this.build.stats;
    const dps = Math.max(st.damage * 0.12, st.damage * st.poisonPower * 1.5) * st.elementPower;
    this.addZone('toxic', o.x, o.y, 70, 3.5, dps);
    this.grid.query(o.x, o.y, 80, this.q2);
    for (const e of [...this.q2]) applyPoison(this, e, dps, 3, 1);
    this.addCombo(2);
    this.emit({ t: 'explosion', x: o.x, y: o.y, r: 70, color: '#9cff5e' });
    this.emit({ t: 'sfx', name: 'poison' });
  }

  zapPylon(o: Extract<Obstacle, { kind: 'pylon' }>): void {
    if (o.cd > 0) return;
    o.cd = 0.35;
    const st = this.build.stats;
    const first = nearestEnemy(this, o.x, o.y, 200, undefined, undefined, 'lightning');
    if (!first) return;
    const dmg = st.damage * 0.8 * st.elementPower;
    this.emit({ t: 'lightning', pts: [o.x, o.y, first.x, first.y], color: '#ffe38a' });
    damageEnemy(this, first, dmg, { src: 'chain', crit: false, depth: 1 });
    // The arc carries on to two more enemies from wherever the first one stood.
    if (first.alive) chainLightning(this, first, dmg, 2, 1);
  }

  // ------------------------------------------------------------------ player
  hurt(dmg: number, x: number): void {
    if (this.state === 'over' || this.time < this.invulnUntil) return;
    const st = this.build.stats;
    if (this.barrier.charges > 0) {
      this.barrier.charges--;
      this.barrier.timer = this.build.has('evo_aegis') ? 5 : BARRIER_RECHARGE;
      this.emit({ t: 'ring', x, y: DEFENSE_Y, r: 40, color: '#5ad7ff' });
      this.emit({ t: 'sfx', name: 'shield' });
      if (this.build.has('evo_aegis')) {
        for (const e of [...this.enemies]) {
          if (e.alive && e.y > DEFENSE_Y - 160) explode(this, e.x, e.y, 30, st.damage * 1.5, 2, { src: 'quake', color: '#7ef0ff' });
        }
        this.emit({ t: 'ring', x: 270, y: DEFENSE_Y, r: 300, color: '#7ef0ff', dur: 0.5 });
      }
      return;
    }
    let amount = Math.max(1, dmg * this.diff.dmgMult * st.damageTaken - st.armor);
    if (this.talents.last_bastion && this.hp <= this.maxHp * 0.35) amount *= 0.75;
    if (st.comboGuard > 0 && this.combo.count >= 30) amount *= 1 - Math.min(0.6, st.comboGuard);
    this.hp -= amount;
    this.run.damageTaken += amount;
    // Cryostasis Failsafe: the first time the line runs low, the whole field freezes.
    if (this.flags.has('cryostasis') && !this.cryostasisUsed && this.hp > 0 && this.hp < this.maxHp * 0.25) {
      this.cryostasisUsed = true;
      for (const e of this.enemies) if (e.alive) e.st.frozenT = Math.max(e.st.frozenT, e.boss ? 1 : 3);
      this.banner(t('fx.cryostasis'), '#9fdcff', t('fx.cryostasisSub'), true);
      this.emit({ t: 'flash', color: '#9fdcff', a: 0.4 });
      this.emit({ t: 'ring', x: 270, y: DEFENSE_Y, r: 420, color: '#9fdcff', dur: 0.6 });
      this.emit({ t: 'sfx', name: 'freeze' });
    }
    if (this.director.bossActive) this.run.bossNoDamage = false;
    this.emit({ t: 'hurt', x, dmg: amount });
    this.emit({ t: 'shake', amt: Math.min(14, 4 + amount * 0.4) });
    this.emit({ t: 'sfx', name: 'hurt' });
    if (this.hp <= 0 && this.build.has('relic_phoenix') && !this.phoenixUsed && !this.noHeal) {
      this.phoenixUsed = true;
      this.hp = this.maxHp * 0.4;
      for (const e of [...this.enemies]) {
        if (e.alive && e.y > DEFENSE_Y - 260) explode(this, e.x, e.y, 40, st.damage * 4, 1, { src: 'quake', color: '#ffb36b' });
      }
      this.banner(t('fx.phoenix'), '#ffb36b', t('fx.phoenixSub'), true);
      this.emit({ t: 'flash', color: '#ffb36b', a: 0.5 });
      this.emit({ t: 'slowmo', dur: 0.8, scale: 0.3 });
      this.emit({ t: 'sfx', name: 'evolve' });
    }
    // Unbreakable: the talent capstone turns the first lethal hit of a run into 1 HP and four seconds of grace.
    if (this.hp <= 0 && this.talents.unbreakable && !this.unbreakableUsed) {
      this.unbreakableUsed = true;
      this.hp = 1;
      this.invulnUntil = this.time + 4;
      this.banner(t('fx.unbreakable'), '#7be0cb', t('fx.unbreakableSub'), true);
      this.emit({ t: 'flash', color: '#7be0cb', a: 0.4 });
      this.emit({ t: 'ring', x: 270, y: DEFENSE_Y, r: 360, color: '#7be0cb', dur: 0.6 });
      this.emit({ t: 'sfx', name: 'shield' });
    }
    const wind = this.cfg.workshop.bp_second_wind ?? 0;
    if (this.hp <= 0 && wind > 0 && !this.secondWindUsed && !this.noHeal) {
      // Second Wind: the line holds once, recovers and clears the enemies pressing on it.
      this.secondWindUsed = true;
      this.hp = this.maxHp * SECOND_WIND[Math.min(wind, SECOND_WIND.length) - 1];
      for (const e of [...this.enemies]) {
        if (e.alive && e.y > DEFENSE_Y - 220) explode(this, e.x, e.y, 40, st.damage * 3, 1, { src: 'quake', color: '#ff6b8b' });
      }
      this.banner(t('fx.secondWind'), '#ff6b8b', t('fx.secondWindSub'), true);
      this.emit({ t: 'flash', color: '#ff6b8b', a: 0.45 });
      this.emit({ t: 'slowmo', dur: 0.7, scale: 0.35 });
      this.emit({ t: 'sfx', name: 'evolve' });
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.finish(false);
    }
  }

  /** Sentinel drones: each fires a short-lived shard at the enemy closest to the line. */
  private updateSentinels(dt: number): void {
    this.sentinelT -= dt;
    if (this.sentinelT > 0 || this.endTimer >= 0) return;
    const twin = this.flags.has('sentinel2');
    this.sentinelT = SENTINEL_INTERVAL[twin ? 1 : 0];
    let target: Enemy | null = null;
    for (const e of this.enemies) if (e.alive && e.y > FIELD_TOP + 20 && (!target || e.y > target.y)) target = e;
    if (!target) return;
    for (const [x, y] of twin ? SENTINEL_POS : SENTINEL_POS.slice(0, 1)) {
      const b = this.spawnBall('shard', x, y, target.x - x, target.y - y);
      if (!b) continue;
      b.life = 5;
      this.emit({ t: 'ring', x, y, r: 16, color: '#7ef0ff' });
    }
    this.emit({ t: 'sfx', name: 'launch' });
  }

  heal(amount: number, budgeted = true): void {
    if (this.noHeal || amount <= 0 || this.hp >= this.maxHp) return;
    amount *= this.build.stats.healMult;
    if (budgeted) {
      amount = Math.min(amount, this.healBudget);
      this.healBudget -= amount;
    }
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.run.healed += this.hp - before;
  }

  gainXp(v: number): void {
    const event = this.event?.id === 'blackout' || this.event?.id === 'swarm_surge' ? 1.5 : 1;
    const mult = this.build.stats.xpGain * (1 + Math.min(this.combo.count, 200) * 0.002) * event;
    this.xp += v * mult;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = Math.ceil(xpForLevel(this.level) * this.xpScale);
      this.pendingLevels++;
      this.emit({ t: 'sfx', name: 'levelup' });
      if (BALL_MILESTONES.includes(this.level)) this.grantMilestone();
    }
  }

  private grantMilestone(): void {
    if (this.loneBall) {
      this.onBuildChanged(this.build.addBaseMods([{ stat: 'damage', mult: LONE_FOCUS }]));
      this.milestoneNews.push(() => {
        this.banner(t('fx.loneFocus'), '#ffe3a3', t('fx.loneFocusSub', { n: Math.round(LONE_FOCUS * 100) }), true);
        this.emit({ t: 'ring', x: LAUNCHER_X, y: LAUNCHER_Y, r: 70, color: '#ffe3a3' });
      });
      return;
    }
    this.milestoneBalls++;
    this.hand++;
    this.run.maxBallsOwned = Math.max(this.run.maxBallsOwned, this.maxBallsAllowed());
    const balls = this.maxBallsAllowed();
    this.milestoneNews.push(() => {
      this.banner(t('fx.ballMilestone'), '#8debdc', t('fx.ballMilestoneSub', { n: balls }), true);
      this.emit({ t: 'ring', x: LAUNCHER_X, y: LAUNCHER_Y, r: 70, color: '#8debdc' });
    });
  }

  addCombo(amount: number, targetId = -1): void {
    const c = this.combo;
    if (targetId >= 0) {
      if (targetId === c.lastId) {
        c.same++;
        if (c.same >= 3) return; // hammering one target doesn't build combo
      } else {
        c.same = 0;
        c.lastId = targetId;
      }
    }
    c.count += amount;
    c.timer = this.build.stats.comboWindow;
    if (c.count > this.run.bestCombo) this.run.bestCombo = Math.floor(c.count);
    const next = COMBO_MILESTONES[c.nextMilestone];
    if (next !== undefined && c.count >= next) {
      c.nextMilestone++;
      this.bus.emit('combo', { n: next });
      this.banner(t('fx.combo', { n: next }), '#ffe066', t(`fx.combo${next}` as UiKey));
      this.emit({ t: 'sfx', name: 'combo', pitch: 1 + c.nextMilestone * 0.1 });
      if (next >= 100) this.emit({ t: 'slowmo', dur: 0.5, scale: 0.35 });
    }
  }

  comboMult(): number {
    return 1 + Math.min(this.combo.count, 250) * 0.004 * this.build.stats.comboPower;
  }

  // ------------------------------------------------------------------ input API
  setAim(dx: number, dy: number): void {
    let a = Math.atan2(dy, dx);
    const minA = -Math.PI + 0.16;
    const maxA = -0.16;
    if (a > 0) a = a > Math.PI / 2 ? minA : maxA;
    a = clamp(a, minA, maxA);
    this.aim.dx = Math.cos(a);
    this.aim.dy = Math.sin(a);
  }

  beginAim(): void {
    if (this.state !== 'playing' || this.endTimer >= 0) return;
    this.aim.active = true;
    this.aim.holdTime = 0;
    this.aim.streamed = false;
  }

  isPowerWindow(): boolean {
    return this.aim.active && !this.aim.streamed && this.hand > 0 &&
      this.aim.holdTime >= POWER_START && this.aim.holdTime <= POWER_END;
  }

  release(): void {
    if (!this.aim.active) return;
    if (this.hand > 0) this.powerQueue = this.isPowerWindow() ? this.hand : 0;
    this.aim.active = false;
    this.launchQueue = Math.max(this.launchQueue, this.hand);
  }

  cancelAim(): void {
    this.aim.active = false;
  }

  canSurge(): boolean {
    return this.state === 'playing' && this.endTimer < 0 && this.surge.charge >= this.surge.max && this.surge.active <= 0;
  }

  canRecall(): boolean {
    return this.state === 'playing' && this.endTimer < 0 && this.recallCooldown <= 0 &&
      this.balls.some(b => b.kind === 'main' && b.state === 'flight' && !b.dead);
  }

  activateRecall(): void {
    if (!this.canRecall()) return;
    this.recallCooldown = this.build.stats.recallCooldown;
    const spark = this.build.has('quick_recall');
    this.recalls++;
    this.launchQueue = 0;
    this.powerQueue = 0;
    for (const b of this.balls) {
      if (b.kind !== 'main' || b.state !== 'flight' || b.dead) continue;
      b.state = 'returning';
      b.returnT = 0;
      b.rx = b.x;
      b.ry = b.y;
      b.momentum = 0;
      b.trail.length = 0;
      this.emit({ t: 'ring', x: b.x, y: b.y, r: 42, color: '#8debdc' });
      this.emit({ t: 'beam', x0: b.x, y0: b.y, x1: LAUNCHER_X, y1: LAUNCHER_Y, color: '#8debdc' });
      if (spark) sparkNearest(this, b.x, b.y, this.build.stats.damage * 1.5, '#8debdc');
    }
    this.emit({ t: 'sfx', name: 'recall' });
  }

  activateSurge(): void {
    if (!this.canSurge()) return;
    this.surge.charge = 0;
    this.surgeBurst(this.build.stats.surgeDuration);
  }

  /** The Surge itself: a damage and speed window opened by a blast from every ball in flight. */
  private surgeBurst(dur: number): void {
    this.surge.active = dur;
    this.addBuff('surge', dur, [{ stat: 'speed', mult: 0.25 }, { stat: 'damage', mult: 0.3 }]);
    const st = this.build.stats;
    for (const b of this.balls) {
      if (b.state !== 'flight') continue;
      b.momentum += 12;
      explode(this, b.x, b.y, 90, st.damage * 1.5, 1, { color: '#ffe066', src: 'surge' });
    }
    this.emit({ t: 'flash', color: '#ffe066', a: 0.25 });
    this.emit({ t: 'sfx', name: 'surge' });
    this.banner(t('fx.surge'), '#ffe066');
  }

  addBuff(id: string, t: number, mods: Modifier[]): void {
    const ex = this.buffs.find((b) => b.id === id);
    if (ex) ex.t = Math.max(ex.t, t);
    else this.buffs.push({ id, t, mods });
    this.syncTempMods();
  }

  private syncTempMods(): void {
    const mods: Modifier[] = [];
    for (const b of this.buffs) mods.push(...b.mods);
    if (this.event?.id === 'overcharge') {
      mods.push({ stat: 'burnChance', mult: 1 }, { stat: 'chillChance', mult: 1 }, { stat: 'chainChance', mult: 1 }, { stat: 'bleedChance', mult: 1 }, { stat: 'poisonChance', mult: 1 });
    }
    if (this.event?.id === 'time_warp') mods.push({ stat: 'speed', mult: 0.2 });
    this.build.tempMods = mods;
    this.onBuildChanged(this.build.recompute());
  }

  // ------------------------------------------------------------------ level ups
  openLevelUp(): void {
    // Pacts make some upgrades inert; never offer a card that cannot do anything.
    const inert = [...(this.loneBall ? ['extra_ball'] : []), ...(this.noHeal ? ['vampiric', 'regen'] : [])];
    const wide = (this.cfg.workshop.bp_wide_draft ?? 0) > 0 ? 1 : 0;
    const count = Math.min(MAX_DRAFT_CARDS, (this.flags.has('fourth_card') ? 4 : 3) + wide + (this.build.has('relic_chaos_die') ? 1 : 0));
    this.offers = makeOffers({
      build: this.build, rng: this.rng, pool: this.pool, banished: inert.length ? new Set([...this.banished, ...inert]) : this.banished,
      count, levelIndex: this.levelUps, noHeal: this.noHeal, guaranteeRare: this.flags.has('fate'),
    });
    this.draft = 'upgrade';
    this.state = 'levelup';
    this.bus.emit('levelUp', { offers: this.offers });
  }

  reroll(): boolean {
    if (this.state !== 'levelup' || this.rerolls <= 0 || this.draft !== 'upgrade') return false;
    this.rerolls--;
    this.openLevelUp();
    return true;
  }

  banish(id: string): boolean {
    if (this.state !== 'levelup' || this.banishes <= 0 || this.draft !== 'upgrade') return false;
    this.banishes--;
    this.banished.add(id);
    this.openLevelUp();
    return true;
  }

  choose(offer: Offer): void {
    if (this.state !== 'levelup') return;
    const relicDraft = this.draft === 'relic';
    if (relicDraft) {
      this.pendingRelics = Math.max(0, this.pendingRelics - 1);
      this.relicFloors.shift();
    }
    else {
      this.levelUps++;
      this.pendingLevels = Math.max(0, this.pendingLevels - 1);
    }
    const prevMaxHp = this.build.stats.maxHp;
    const prevBalls = this.maxBallsAllowed();
    const prevBarrier = this.build.stats.barrier;
    if (offer.kind === 'upgrade') {
      const fresh = this.build.addUpgrade(offer.id);
      this.discover('upgrades', offer.id);
      this.onBuildChanged(fresh);
    } else if (offer.kind === 'evolution') {
      const fresh = this.build.addEvolution(offer.id);
      const e = EVOLUTION_MAP[offer.id];
      this.discover('evolutions', offer.id);
      this.bus.emit('evolution', { id: offer.id });
      this.banner(t('fx.evolved'), e.color, `${e.icon} ${e.name}`, true);
      this.emit({ t: 'flash', color: e.color, a: 0.5 });
      this.emit({ t: 'slowmo', dur: 1.2, scale: 0.25 });
      this.emit({ t: 'sfx', name: 'evolve' });
      for (const b of this.balls) this.emit({ t: 'ring', x: b.x, y: b.y, r: 120, color: e.color });
      this.onBuildChanged(fresh);
    } else if (offer.kind === 'relic') {
      const r = RELIC_MAP[offer.id];
      const fresh = this.build.addRelic(offer.id);
      this.discover('relics', offer.id);
      if (offer.id === 'chaos_die' && !this.pacts.has('noReroll')) this.rerolls += 2;
      this.banner(t('fx.relicFound'), r.cursed ? '#ff5d73' : '#ffb300', `${r.icon} ${r.name}`, true);
      this.emit({ t: 'flash', color: '#ffb300', a: 0.25 });
      this.emit({ t: 'sfx', name: 'relic' });
      this.onBuildChanged(fresh);
    } else if (offer.kind === 'heal') {
      this.heal(this.maxHp * (this.flags.has('medic') ? 0.5 : 0.3), false);
    } else {
      this.run.coinsCollected += relicDraft ? 60 : 25;
    }
    // stat side-effects
    const st = this.build.stats;
    if (st.maxHp > prevMaxHp) this.hp += st.maxHp - prevMaxHp;
    this.maxHp = st.maxHp;
    this.hp = Math.min(this.hp, this.maxHp);
    const newBalls = this.maxBallsAllowed();
    if (newBalls > prevBalls) this.hand += newBalls - prevBalls;
    this.run.maxBallsOwned = Math.max(this.run.maxBallsOwned, newBalls);
    if (st.barrier > prevBarrier) this.barrier.charges += st.barrier - prevBarrier;
    this.state = 'playing';
  }

  onBuildChanged(fresh: string[]): void {
    this.refreshBehaviors();
    for (const id of fresh) {
      const s = SYNERGY_MAP[id];
      const isNew = this.discover('synergies', id);
      this.bus.emit('synergy', { id, isNew });
      this.banner(isNew ? t('fx.synergyNew') : t('fx.synergy'), s.tier === 'legendary' ? '#ffb300' : '#c77dff', `${s.icon} ${s.name}`, isNew);
      this.emit({ t: 'sfx', name: 'synergy' });
      if (s.tier === 'legendary') this.emit({ t: 'slowmo', dur: 0.8, scale: 0.3 });
    }
  }

  // ------------------------------------------------------------------ events
  startEvent(id: string): void {
    const def = EVENT_MAP[id];
    if (!def) return;
    this.event = { id, t: 0, dur: def.duration, timer: 0, dir: 1 };
    this.eventsSeen.push(id);
    this.discover('events', id);
    this.banner(`${def.icon} ${def.name.toUpperCase()}`, def.color, def.desc);
    this.emit({ t: 'sfx', name: 'event' });
    this.bus.emit('eventStart', { id });
    if (id === 'overcharge' || id === 'time_warp') this.syncTempMods();
  }

  private updateEvent(dt: number): void {
    const ev = this.event;
    if (!ev) return;
    ev.t += dt;
    ev.timer -= dt;
    if (ev.id === 'ball_frenzy' && ev.timer <= 0) {
      ev.timer = 1.2;
      const x = this.rng.range(60, W - 60);
      this.spawnBall('frenzy', x, FIELD_TOP + 12, this.rng.range(-0.6, 0.6), 1);
    }
    if (ev.id === 'jackpot' && ev.timer <= 0) {
      ev.timer = 4.5;
      this.spawnEnemy('golden', this.rng.range(60, W - 60), 520);
    }
    if (ev.id === 'gravity_storm' && ev.timer <= 0) {
      ev.timer = 4;
      ev.dir = -ev.dir;
    }
    if (ev.id === 'toxic_rain' && ev.timer <= 0) {
      ev.timer = 1.3;
      const st = this.build.stats;
      const x = this.rng.range(60, W - 60);
      const y = this.rng.range(FIELD_TOP + 80, DEFENSE_Y - 120);
      this.addZone('toxic', x, y, 60, 3.5, Math.max(st.damage * 0.1, st.damage * st.poisonPower) * st.elementPower);
    }
    if (ev.id === 'meteor_shower' && ev.timer <= 0) {
      ev.timer = 1.1;
      const tgt = densest(this);
      if (tgt) meteor(this, tgt.x, tgt.y, this.build.stats.damage * 2.4, 1);
    }
    if (ev.id === 'swarm_surge' && ev.timer <= 0) {
      ev.timer = 3;
      const cx = this.rng.range(80, W - 80);
      for (let i = 0; i < 4; i++) this.spawnEnemy('mite', cx + (i - 1.5) * 26, FIELD_TOP - 30 - i * 8);
    }
    if (ev.t >= ev.dur) {
      const resync = ev.id === 'overcharge' || ev.id === 'time_warp';
      this.event = null;
      if (resync) this.syncTempMods();
    }
  }

  // ------------------------------------------------------------------ main step
  step(dt: number): void {
    if (this.state !== 'playing') return;
    if (this.pendingLevels > 0 && this.endTimer < 0) {
      this.openLevelUp();
      return;
    }
    if (this.pendingRelics > 0 && this.endTimer < 0) {
      this.openRelicDraft();
      if (this.state !== 'playing') return;
    }
    // Level-ups pause the arena behind their cards; announce milestones once it is visible again.
    if (this.milestoneNews.length) for (const announce of this.milestoneNews.splice(0)) announce();
    this.time += dt;
    if (this.director.endless) this.endlessTime += dt;
    this.explosionsThisStep = 0;
    if (this.timeStop > 0) this.timeStop -= dt;
    const st = this.build.stats;

    // end-of-run grace period (victory slow-mo)
    if (this.endTimer >= 0) {
      this.endTimer -= dt;
      if (this.endTimer < 0) {
        this.state = 'over';
        this.bus.emit('over', { victory: this.victory });
        return;
      }
    }

    this.healBudget = Math.min(this.healBudget + dt * (this.build.has('evo_blood') ? 16 : 8), 20);
    for (const o of this.obstacles) if (o.kind === 'pylon' && o.cd > 0) o.cd -= dt;
    if (st.regen > 0) this.heal(st.regen * dt, false);
    if (st.barrier > 0 && this.barrier.charges < st.barrier) {
      this.barrier.timer -= dt;
      if (this.barrier.timer <= 0) {
        this.barrier.charges = st.barrier;
        this.barrier.timer = this.build.has('evo_aegis') ? 5 : BARRIER_RECHARGE;
      }
    }

    // buffs
    let buffsChanged = false;
    for (const b of this.buffs) {
      b.t -= dt;
      if (b.t <= 0) buffsChanged = true;
    }
    if (buffsChanged) {
      this.buffs = this.buffs.filter((b) => b.t > 0);
      this.syncTempMods();
    }
    if (this.surge.active > 0) {
      this.surge.active -= dt;
      // Aftershock: a finished Surge fires once more at half length; the echo itself never echoes.
      if (this.surge.active <= 0) {
        if (this.flags.has('aftershock') && !this.aftershockLive && this.endTimer < 0) {
          this.aftershockLive = true;
          this.surgeBurst(this.build.stats.surgeDuration / 2);
          this.banner(t('fx.aftershock'), '#ffb347');
        } else this.aftershockLive = false;
      }
    }
    if (this.flags.has('sentinel')) this.updateSentinels(dt);
    this.recallCooldown = Math.max(0, this.recallCooldown - dt);
    this.resonance.update(dt);

    // combo decay
    if (this.combo.count > 0) {
      this.combo.timer -= dt;
      if (this.combo.timer <= 0) {
        this.combo.count = 0;
        this.combo.nextMilestone = 0;
        this.combo.lastId = -1;
      }
    }

    this.director.update(dt);
    this.updateEvent(dt);

    // launching
    if (this.aim.active) {
      this.aim.holdTime += dt;
      // Holding keeps a stream going: balls returning mid-hold are re-fired along the aim.
      // A fresh press never fires on its own, so aiming is always deliberate.
      if (this.aim.holdTime > 1.15 && this.hand > 0 && this.balls.some((b) => b.kind === 'main')) {
        this.aim.streamed = true;
        this.powerQueue = 0;
        this.launchQueue = Math.max(this.launchQueue, this.hand);
      }
    }
    this.launchTimer -= dt;
    while (this.launchQueue > 0 && this.hand > 0 && this.launchTimer <= 0) {
      this.launchQueue--;
      this.hand--;
      this.launchTimer = 0.075;
      const b = this.spawnBall('main', LAUNCHER_X, LAUNCHER_Y - 16, this.aim.dx, this.aim.dy);
      if (!b) {
        this.hand++;
        this.launchQueue++;
        break;
      }
      if (this.powerQueue > 0) {
        this.powerQueue--;
        this.powerShots++;
        b.powered = true;
        b.dmgMult *= 1.45;
        b.momentum += 5 * st.momentumGain;
        this.emit({ t: 'ring', x: LAUNCHER_X, y: LAUNCHER_Y, r: 62, color: '#ffe3a3' });
        this.emit({ t: 'text', x: LAUNCHER_X, y: LAUNCHER_Y - 55, text: t('fx.powerShot'), color: '#ffe3a3' });
        this.emit({ t: 'sfx', name: 'power' });
      }
      this.emit({ t: 'sfx', name: 'launch' });
      for (const [bh, p] of this.bh) bh.onLaunch?.(this, b, p);
      if (this.rng.chance(st.echoChance)) {
        const c = this.spawnBall('clone', LAUNCHER_X, LAUNCHER_Y - 16, this.aim.dx + this.rng.range(-0.12, 0.12), this.aim.dy);
        if (c) c.life = 10;
      }
    }
    if (this.hand <= 0) this.launchQueue = 0;

    // grid (enemies) for ball collision queries
    this.grid.clear();
    this.fieldEnemies.length = 0;
    this.commanders.length = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      // Phased enemies are out of reach: nothing collides with or targets them.
      if (!e.phased) this.grid.insert(e);
      if (e.def.ai === 'magnet' || e.def.ai === 'warden' || e.def.ai === 'pulsar' || e.def.id === 'boss_magnetar' || e.def.id === 'boss_sovereign') this.fieldEnemies.push(e);
      if (e.elite.includes('commander')) this.commanders.push(e);
    }

    // balls
    this.dynSegments.length = 0;
    this.director.updateBoss(dt);
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (!b.dead) stepBall(this, b, dt);
      for (const [bh, p] of this.bh) if (!b.dead && b.state === 'flight') bh.onBallTick?.(this, b, dt, p);
    }
    this.balls = this.balls.filter((b) => !b.dead);

    // enemies
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.alive) updateEnemy(this, e, dt);
    }
    this.enemies = this.enemies.filter((e) => e.alive);

    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateObstacles(dt);
    this.updatePickups(dt);
    for (const [bh, p] of this.bh) bh.onTick?.(this, dt, p);
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < p.r || p.x > W - p.r) p.vx = -p.vx;
      if (p.y >= DEFENSE_Y) {
        p.alive = false;
        this.hurt(p.dmg, p.x);
        this.emit({ t: 'explosion', x: p.x, y: DEFENSE_Y, r: 30, color: p.color });
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  private updateZones(dt: number): void {
    for (const z of this.zones) {
      z.t += dt;
      if (z.t >= z.dur) {
        z.alive = false;
        continue;
      }
      if (z.kind === 'fire') {
        z.tick -= dt;
        if (z.tick <= 0) {
          z.tick = 0.4;
          this.grid.query(z.x, z.y, z.r, this.q2);
          for (const e of this.q2) {
            if (e.alive && !e.def.immune?.includes('fire')) {
              e.st.burnDps = Math.max(e.st.burnDps, z.dps);
              e.st.burnT = Math.max(e.st.burnT, 1.5);
            }
          }
        }
      } else if (z.kind === 'toxic') {
        z.tick -= dt;
        if (z.tick <= 0) {
          z.tick = 0.5;
          this.grid.query(z.x, z.y, z.r, this.q2);
          for (const e of [...this.q2]) applyPoison(this, e, z.dps, 1, 2);
        }
      } else if (z.kind === 'vortex') {
        this.grid.query(z.x, z.y, z.r, this.q2);
        for (const e of this.q2) {
          if (!e.alive || e.boss || e.def.ai === 'charger' || e.def.ai === 'pylon') continue;
          e.kx += (z.x - e.x) * 5 * dt * 6;
          e.ky += (z.y - e.y) * 4 * dt * 6;
        }
        if (z.t + dt >= z.dur && this.build.has('implosion')) {
          explode(this, z.x, z.y, z.r * 0.8 * this.build.stats.area, z.dps, 1, { color: '#b48cff' });
        }
      } else if (z.kind === 'mine') {
        // Armed after a moment; any enemy touching it (or a nearby blast) sets it off.
        if (z.t > 0.25) {
          let hit = z.tick < 0;
          if (!hit) {
            this.grid.query(z.x, z.y, z.r, this.q2);
            hit = this.q2.some((e) => e.alive);
          }
          if (hit) {
            z.alive = false;
            explode(this, z.x, z.y, 70 * this.build.stats.area, z.dps, 1, { src: 'mine', color: '#ffb13b' });
          }
        }
      }
    }
    this.zones = this.zones.filter((z) => z.alive);
  }

  private updateObstacles(dt: number): void {
    for (const o of this.obstacles) {
      switch (o.kind) {
        case 'bumper':
        case 'deflector':
          o.flash = Math.max(0, o.flash - dt * 4);
          break;
        case 'barrel':
          if (!o.alive) {
            o.respawn -= dt;
            if (o.respawn <= 0) o.alive = true;
          }
          break;
        case 'crate':
          o.flash = Math.max(0, o.flash - dt * 4);
          if (!o.alive) {
            o.respawn -= dt;
            if (o.respawn <= 0) {
              o.alive = true;
              o.hp = 3;
            }
          }
          break;
        case 'oil':
          if (o.burning > 0) {
            o.burning -= dt;
            this.grid.query(o.x, o.y, o.r, this.q2);
            for (const e of this.q2) {
              e.st.burnDps = Math.max(e.st.burnDps, this.build.stats.damage * 0.8 * this.build.stats.elementPower);
              e.st.burnT = Math.max(e.st.burnT, 1.2);
            }
          }
          break;
        case 'portal':
          o.spin += dt * 2;
          break;
        case 'spore':
          if (!o.alive) {
            o.respawn -= dt;
            if (o.respawn <= 0) o.alive = true;
          }
          break;
        case 'pylon':
        case 'booster':
          o.flash = Math.max(0, o.flash - dt * 4);
          break;
        default:
          break;
      }
    }
  }

  detonateBarrel(o: Extract<Obstacle, { kind: 'barrel' }>, depth: number): void {
    if (!o.alive) return;
    o.alive = false;
    o.respawn = 12;
    this.run.barrelsExploded++;
    this.addCombo(2);
    const st = this.build.stats;
    explode(this, o.x, o.y, 85, st.damage * 2.2 + 12, depth + 1, { color: '#ff8a3d', src: 'barrel', burn: true });
    this.emit({ t: 'shake', amt: 7 });
  }

  private updatePickups(dt: number): void {
    const pr = this.build.stats.pickupRadius;
    for (const p of this.pickups) {
      if (!p.alive) continue;
      p.t += dt;
      if (!p.homing) {
        p.vx *= Math.exp(-dt * 3);
        p.vy += (70 - p.vy) * Math.min(1, dt * 2);
        p.x = clamp(p.x + p.vx * dt, 8, W - 8);
        p.y += p.vy * dt;
        if (p.y >= DEFENSE_Y - 10 || p.t > 7) p.homing = true;
        for (const b of this.balls) {
          if (b.state !== 'flight') continue;
          const dx = b.x - p.x;
          const dy = b.y - p.y;
          if (dx * dx + dy * dy < (pr + b.r) * (pr + b.r)) {
            p.homing = true;
            break;
          }
        }
      } else {
        const dx = LAUNCHER_X - p.x;
        const dy = LAUNCHER_Y - p.y;
        const d = Math.hypot(dx, dy);
        const sp = 900;
        if (d < 20) {
          this.collect(p);
          continue;
        }
        p.x += (dx / d) * sp * dt;
        p.y += (dy / d) * sp * dt;
      }
    }
    this.pickups = this.pickups.filter((p) => p.alive);
  }

  private collect(p: Pickup): void {
    p.alive = false;
    const blood = this.event?.id === 'blood_moon' ? 2 : 1;
    switch (p.kind) {
      case 'xp':
        this.gainXp(p.value * blood);
        this.emit({ t: 'sfx', name: 'pickup', pitch: 1 + Math.min(this.combo.count, 100) / 100, vol: 0.4 });
        break;
      case 'coin':
        this.run.coinsCollected += p.value * this.build.stats.coinGain * blood * (this.event?.id === 'iron_tide' ? 2 : 1);
        this.emit({ t: 'sfx', name: 'coin', vol: 0.5 });
        break;
      case 'core':
        this.run.coresCollected += p.value;
        this.banner(t('fx.core'), '#ff7ad9');
        this.emit({ t: 'sfx', name: 'core' });
        break;
      case 'heal':
        this.heal(p.value, false);
        break;
      case 'mystery':
        this.mysteryTransform();
        break;
      case 'relic':
        this.grantRelic();
        break;
    }
  }

  private mysteryTransform(): void {
    const opts: [string, string, Modifier[]][] = [
      [t('fx.mysteryMega'), '#ff7ad9', [{ stat: 'radius', mult: 1 }, { stat: 'damage', mult: 1 }]],
      [t('fx.mysteryPrism'), '#5ee7ff', [{ stat: 'burnChance', add: 0.5 }, { stat: 'chillChance', add: 0.5 }, { stat: 'chainChance', add: 0.5 }]],
      [t('fx.mysteryOverdrive'), '#ffe066', [{ stat: 'speed', mult: 0.5 }, { stat: 'pierce', add: 3 }]],
      [t('fx.mysteryBlast'), '#ff8a3d', [{ stat: 'explosionChance', add: 0.6 }]],
    ];
    const [name, color, mods] = this.rng.pick(opts);
    this.addBuff('mystery', 12, mods);
    this.banner(t('fx.mystery', { name }), color, t('fx.mysterySub'));
    this.emit({ t: 'sfx', name: 'synergy' });
  }

  // ------------------------------------------------------------------ end
  finish(victory: boolean): void {
    if (this.endTimer >= 0 || this.state === 'over') return;
    // Endless follows a won run: falling there ends the run but keeps the victory.
    this.victory = victory || this.director.endless;
    this.endTimer = victory ? 2.5 : 1.2;
    this.emit({ t: 'slowmo', dur: this.endTimer, scale: 0.3 });
    if (!victory) {
      this.banner(t('fx.defenseBroken'), '#ff3b3b', undefined, true);
      this.emit({ t: 'sfx', name: 'defeat' });
    }
  }

  /** Continue into endless mode after a victory. */
  continueEndless(): void {
    if (!this.victory) return;
    this.state = 'playing';
    this.endTimer = -1;
    this.director.startEndless();
    this.banner(t('fx.endless'), '#c77dff', t('fx.endlessSub'), true);
  }

  summary(): RunSummary {
    const r = this.run;
    const st = this.build.stats;
    return {
      arena: this.arena.id, difficulty: this.cfg.difficulty, core: this.cfg.core, pacts: this.cfg.pacts, seed: this.cfg.seed,
      daily: !!this.cfg.daily, victory: this.victory, time: this.time, level: this.level,
      kills: r.kills, eliteKills: r.eliteKills, bossesDefeated: r.bossesDefeated, bossFightTimes: r.bossFightTimes,
      bossNoDamage: r.bossNoDamage && r.bossesDefeated.length > 0,
      damageDealt: r.damageDealt, damageTaken: r.damageTaken, healed: r.healed, bestCombo: r.bestCombo,
      powerShots: this.powerShots, starfalls: this.resonance.completed, recalls: this.recalls,
      maxWallChain: r.maxWallChain, maxBounceChain: r.maxBounceChain, maxBallsInFlight: r.maxBallsInFlight,
      maxBallsOwned: r.maxBallsOwned, maxMomentumTier: r.maxMomentumTier, fireKills: r.fireKills,
      lightningKills: r.lightningKills, explosionKills: r.explosionKills, bleedKills: r.bleedKills,
      frozenCount: r.frozenCount, barrelsExploded: r.barrelsExploded, goldenCaught: r.goldenCaught,
      coinsCollected: Math.round(r.coinsCollected), coresCollected: r.coresCollected,
      poisonKills: r.poisonKills, relics: [...this.build.relics], endlessTime: this.endlessTime,
      ascension: this.asc.size,
      reactions: [...this.reactionsRun], synergies: [...this.build.synergies], evolutions: [...this.build.evolutions],
      upgrades: [...this.build.upgrades.entries()].map(([id, level]) => ({ id, level })),
      enemiesSeen: [...this.enemiesSeen], eventsSeen: this.eventsSeen,
      buildName: buildName(this.build),
      buildStats: {
        damage: st.damage, critChance: st.critChance, critMult: st.critMult, speed: st.speed, balls: this.maxBallsAllowed(),
        chain: st.chainChance > 0 ? st.chainCount : 0, lifesteal: st.lifesteal, pierce: st.pierce,
      },
    };
  }
}

export function upgradeName(id: string): string {
  return UPGRADE_MAP[id]?.name ?? id;
}
