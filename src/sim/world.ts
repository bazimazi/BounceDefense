import { EventBus } from '../core/events';
import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { SpatialHash } from '../core/spatial';
import { ARENA_MAP, DIFFICULTIES, EVENT_MAP, PACT_MAP } from '../data/arenas';
import { CORE_MAP, PART_MAP, TRAILS } from '../data/balls';
import { ENEMY_MAP } from '../data/enemies';
import { WORKSHOP_MAP } from '../data/meta';
import { EVOLUTION_MAP, SYNERGY_MAP } from '../data/synergies';
import { UPGRADE_MAP } from '../data/upgrades';
import type { ArenaDef, DifficultyDef, EnemyDef } from '../data/types';
import type { DiscoveryCat, RunSummary } from '../meta/types';
import { BEHAVIORS, type Behavior } from './behaviors';
import { Build, buildName } from './build';
import { explode } from './combat';
import { Director } from './director';
import { updateEnemy } from './enemies';
import { makeOffers, type Offer } from './offers';
import { stepBall } from './physics';
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
  /** Unlocked upgrade pool. */
  pool: string[];
  /** Research flags (reroll1, banish, fourth_card, codex, bounty, scope...). */
  flags: string[];
  trail: string;
  /** Already-known discoveries, so the sim knows what's "new". */
  known: Partial<Record<DiscoveryCat, string[]>>;
  tutorial?: boolean;
  daily?: boolean;
}

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
export const MOMENTUM_NAMES = ['Normal', 'Charged', 'Overcharged', 'Hyper', 'Unstable'];
export const MOMENTUM_COLORS = ['#ffffff', '#7ad7ff', '#ffe066', '#ff7ad9', '#ff3b3b'];
export const TIER_DMG = [1, 1.15, 1.35, 1.7, 2.0];
export const TIER_CRIT = [0, 0, 0.05, 0.1, 0.12];
export const TIER_SPEED = [1, 1, 1.05, 1.15, 1.2];
export const COMBO_MILESTONES = [10, 25, 50, 100, 150, 200, 300];

export function momentumTier(m: number): number {
  let t = 0;
  for (let i = 0; i < MOMENTUM_TIERS.length; i++) if (m >= MOMENTUM_TIERS[i]) t = i;
  return t;
}

/** XP needed to advance from `level` to `level + 1`. */
export function xpForLevel(level: number): number {
  const k = level - 1;
  return Math.floor(3 + k * 1.6 + Math.pow(k, 1.4) * 0.5);
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
}

export class World {
  readonly cfg: RunConfig;
  readonly rng: Rng;
  readonly arena: ArenaDef;
  readonly diff: DifficultyDef;
  readonly bus = new EventBus<WorldEvents>();
  readonly build: Build;
  readonly director: Director;
  readonly grid = new SpatialHash<Enemy>(W, H, 64);

  time = 0;
  state: 'playing' | 'levelup' | 'over' = 'playing';
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
  pool: Set<string>;
  flags: Set<string>;

  hand = 1;
  launchQueue = 0;
  launchTimer = 0;
  aim = { active: false, dx: 0, dy: -1, holdTime: 0 };

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
    bossesDefeated: [], bossFightTimes: [], bossNoDamage: true,
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
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
    this.arena = ARENA_MAP[cfg.arena] ?? ARENA_MAP.proving;
    this.diff = DIFFICULTIES[clamp(cfg.difficulty, 0, DIFFICULTIES.length - 1)];
    this.pool = new Set(cfg.pool);
    this.flags = new Set(cfg.flags);
    const pacts = cfg.pacts.map((p) => PACT_MAP[p]).filter(Boolean);
    this.noHeal = pacts.some((p) => p.rule === 'noHeal');
    this.loneBall = pacts.some((p) => p.rule === 'loneBall');
    this.enemySpeedMult = this.diff.speedMult * (pacts.some((p) => p.rule === 'haste') ? 1.4 : 1);
    this.enemyHpMult = this.diff.hpMult * (pacts.some((p) => p.rule === 'fortified') ? 1.35 : 1);
    const noReroll = pacts.some((p) => p.rule === 'noReroll');
    this.rerolls = noReroll ? 0 : 1 + (this.flags.has('reroll1') ? 1 : 0) + (this.flags.has('reroll2') ? 1 : 0);
    this.banishes = noReroll || !this.flags.has('banish') ? 0 : 2;
    this.trailColors = (TRAILS.find((t) => t.id === cfg.trail) ?? TRAILS[0]).colors;
    this.seen = {
      enemies: new Set(cfg.known.enemies), bosses: new Set(cfg.known.bosses), synergies: new Set(cfg.known.synergies),
      evolutions: new Set(cfg.known.evolutions), reactions: new Set(cfg.known.reactions), upgrades: new Set(cfg.known.upgrades),
      arenas: new Set(cfg.known.arenas), events: new Set(cfg.known.events),
    };

    // ---- build: core + parts + workshop + pacts
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
      if (wdef && lvl > 0) mods.push(...wdef.mods(lvl));
    }
    for (const p of pacts) if (p.mods) mods.push(...p.mods);
    this.build = new Build(core.id, mods, behaviors);
    for (const u of core.startUpgrades) this.build.addUpgrade(u);
    this.refreshBehaviors();
    this.maxHp = this.build.stats.maxHp;
    this.hp = this.maxHp;
    this.hand = this.maxBallsAllowed();
    this.barrier.charges = this.build.stats.barrier;

    this.buildArena();
    this.director = new Director(this);
    this.discover('arenas', this.arena.id);
    if ((cfg.workshop.head_start ?? 0) > 0) this.pendingLevels++;
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
    return this.loneBall ? 1 : this.build.stats.maxBalls;
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
      life: kind === 'main' ? -1 : kind === 'frenzy' ? 9 : 12,
      recentId: [], recentT: [], trail: [], boost: 1, portalCd: 0, phased: false,
      splitGen: parent ? parent.splitGen + 1 : 0, hitCounter: 0, arcTimer: 0, firstHitDone: false, dead: false, pulse: 0,
    };
    this.balls.push(b);
    let inFlight = 0;
    for (const o of this.balls) if (o.state === 'flight') inFlight++;
    if (inFlight > this.run.maxBallsInFlight) this.run.maxBallsInFlight = inFlight;
    return b;
  }

  makeEnemy(def: EnemyDef, x: number, y: number, hpMult = 1): Enemy {
    const timeScale = 1 + (this.time / 100) * 0.3 + Math.pow(this.time / 300, 2) * 0.35;
    const blood = this.event?.id === 'blood_moon' ? 1.5 : 1;
    const hp = def.boss ? def.hp * hpMult : def.hp * this.enemyHpMult * timeScale * blood * hpMult;
    return {
      id: this.id(), def, x, y, r: def.radius, _q: 0, hp, maxHp: hp, speed: def.speed, armor: def.armor,
      kx: 0, ky: 0,
      st: { burnDps: 0, burnT: 0, burnTick: 0, chill: 0, chillT: 0, frozenT: 0, bleed: 0, bleedT: 0, bleedDps: 0, bleedTick: 0, reactCd: 0 },
      elite: [], shieldHp: 0, flash: 0, alive: true, spawnT: 0, t0: 0, t1: 0, phase: 0, gen: 0,
      boss: !!def.boss, killedBy: '', dmgAcc: 0, dmgAccT: 0, dmgAccCrit: false, wobble: this.rng.range(0, 6.28),
    };
  }

  spawnEnemy(id: string, x: number, y: number, opts: { elite?: string[]; hpMult?: number } = {}): Enemy | null {
    if (this.enemies.length >= MAX_ENEMIES) return null;
    const def = ENEMY_MAP[id];
    if (!def) return null;
    const e = this.makeEnemy(def, clamp(x, def.radius + 4, W - def.radius - 4), y, opts.hpMult ?? 1);
    if (opts.elite?.length) this.makeElite(e, opts.elite);
    this.enemies.push(e);
    if (!def.boss && id !== 'splitling' && id !== 'swarmling' && id !== 'minion') {
      this.enemiesSeen.add(id);
      this.discover('enemies', id);
    }
    return e;
  }

  makeElite(e: Enemy, mods: string[]): void {
    e.elite = mods;
    e.hp *= 3;
    e.maxHp = e.hp;
    e.r *= 1.3;
    for (const m of mods) {
      if (m === 'swift') e.speed *= 1.7;
      if (m === 'armored') e.armor += 5;
      if (m === 'shielded') e.shieldHp = e.maxHp * 0.45;
    }
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
    this.projectiles.push({ x, y, vx, vy, r, dmg, alive: true, color });
  }

  addZone(kind: Zone['kind'], x: number, y: number, r: number, dur: number, dps: number): void {
    if (this.zones.length > 60) return;
    this.zones.push({ kind, x, y, r, t: 0, dur, dps, tick: 0, alive: true });
  }

  // ------------------------------------------------------------------ player
  hurt(dmg: number, x: number): void {
    if (this.state === 'over') return;
    if (this.barrier.charges > 0) {
      this.barrier.charges--;
      this.barrier.timer = 18;
      this.emit({ t: 'ring', x, y: DEFENSE_Y, r: 40, color: '#5ad7ff' });
      this.emit({ t: 'sfx', name: 'shield' });
      return;
    }
    const amount = Math.max(1, dmg - this.build.stats.armor);
    this.hp -= amount;
    this.run.damageTaken += amount;
    if (this.director.bossActive) this.run.bossNoDamage = false;
    this.emit({ t: 'hurt', x, dmg: amount });
    this.emit({ t: 'shake', amt: Math.min(14, 4 + amount * 0.4) });
    this.emit({ t: 'sfx', name: 'hurt' });
    if (this.hp <= 0) {
      this.hp = 0;
      this.finish(false);
    }
  }

  heal(amount: number, budgeted = true): void {
    if (this.noHeal || amount <= 0 || this.hp >= this.maxHp) return;
    if (budgeted) {
      amount = Math.min(amount, this.healBudget);
      this.healBudget -= amount;
    }
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.run.healed += this.hp - before;
  }

  gainXp(v: number): void {
    const mult = this.build.stats.xpGain * (1 + Math.min(this.combo.count, 200) * 0.002) * (this.event?.id === 'blackout' ? 1.5 : 1);
    this.xp += v * mult;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpForLevel(this.level);
      this.pendingLevels++;
      this.emit({ t: 'sfx', name: 'levelup' });
    }
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
      const labels: Record<number, string> = { 10: 'NICE', 25: 'GREAT', 50: 'AMAZING', 100: 'UNSTOPPABLE', 150: 'GODLIKE', 200: 'BEYOND', 300: 'IMPOSSIBLE' };
      this.banner(`${next} COMBO`, '#ffe066', labels[next]);
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
    this.aim.active = true;
    this.aim.holdTime = 0;
  }

  release(): void {
    if (!this.aim.active) return;
    this.aim.active = false;
    this.launchQueue = Math.max(this.launchQueue, this.hand);
  }

  cancelAim(): void {
    this.aim.active = false;
  }

  canSurge(): boolean {
    return this.surge.charge >= this.surge.max && this.surge.active <= 0;
  }

  activateSurge(): void {
    if (!this.canSurge()) return;
    this.surge.charge = 0;
    this.surge.active = 5;
    this.addBuff('surge', 5, [{ stat: 'speed', mult: 0.25 }, { stat: 'damage', mult: 0.3 }]);
    const st = this.build.stats;
    for (const b of this.balls) {
      if (b.state !== 'flight') continue;
      b.momentum += 12;
      explode(this, b.x, b.y, 90, st.damage * 1.5, 1, { color: '#ffe066', src: 'surge' });
    }
    this.emit({ t: 'flash', color: '#ffe066', a: 0.25 });
    this.emit({ t: 'sfx', name: 'surge' });
    this.banner('SURGE', '#ffe066');
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
      mods.push({ stat: 'burnChance', mult: 1 }, { stat: 'chillChance', mult: 1 }, { stat: 'chainChance', mult: 1 }, { stat: 'bleedChance', mult: 1 });
    }
    this.build.tempMods = mods;
    this.onBuildChanged(this.build.recompute());
  }

  // ------------------------------------------------------------------ level ups
  openLevelUp(): void {
    this.offers = makeOffers({
      build: this.build, rng: this.rng, pool: this.pool, banished: this.banished,
      count: this.flags.has('fourth_card') ? 4 : 3, levelIndex: this.levelUps,
    });
    this.state = 'levelup';
    this.bus.emit('levelUp', { offers: this.offers });
  }

  reroll(): boolean {
    if (this.state !== 'levelup' || this.rerolls <= 0) return false;
    this.rerolls--;
    this.openLevelUp();
    return true;
  }

  banish(id: string): boolean {
    if (this.state !== 'levelup' || this.banishes <= 0) return false;
    this.banishes--;
    this.banished.add(id);
    this.openLevelUp();
    return true;
  }

  choose(offer: Offer): void {
    if (this.state !== 'levelup') return;
    this.levelUps++;
    this.pendingLevels = Math.max(0, this.pendingLevels - 1);
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
      this.banner('BALL EVOLVED', e.color, `${e.icon} ${e.name}`, true);
      this.emit({ t: 'flash', color: e.color, a: 0.5 });
      this.emit({ t: 'slowmo', dur: 1.2, scale: 0.25 });
      this.emit({ t: 'sfx', name: 'evolve' });
      for (const b of this.balls) this.emit({ t: 'ring', x: b.x, y: b.y, r: 120, color: e.color });
      this.onBuildChanged(fresh);
    } else if (offer.kind === 'heal') {
      this.heal(this.maxHp * 0.3, false);
    } else {
      this.run.coinsCollected += 25;
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
      this.banner(isNew ? 'SYNERGY DISCOVERED' : 'SYNERGY', s.tier === 'legendary' ? '#ffb300' : '#c77dff', `${s.icon} ${s.name}`, isNew);
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
    if (id === 'overcharge') this.syncTempMods();
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
    if (ev.t >= ev.dur) {
      const wasOvercharge = ev.id === 'overcharge';
      this.event = null;
      if (wasOvercharge) this.syncTempMods();
    }
  }

  // ------------------------------------------------------------------ main step
  step(dt: number): void {
    if (this.state !== 'playing') return;
    if (this.pendingLevels > 0 && this.endTimer < 0) {
      this.openLevelUp();
      return;
    }
    this.time += dt;
    this.explosionsThisStep = 0;
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
    if (st.regen > 0) this.heal(st.regen * dt, false);
    if (st.barrier > 0 && this.barrier.charges < st.barrier) {
      this.barrier.timer -= dt;
      if (this.barrier.timer <= 0) {
        this.barrier.charges = st.barrier;
        this.barrier.timer = 18;
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
    if (this.surge.active > 0) this.surge.active -= dt;

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
      if (this.aim.holdTime > 0.3 && this.hand > 0 && this.balls.some((b) => b.kind === 'main')) {
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
        break;
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
    for (const e of this.enemies) {
      if (!e.alive) continue;
      this.grid.insert(e);
      if (e.def.ai === 'magnet' || e.def.ai === 'warden' || e.def.id === 'boss_magnetar') this.fieldEnemies.push(e);
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
            if (e.alive) {
              e.st.burnDps = Math.max(e.st.burnDps, z.dps);
              e.st.burnT = Math.max(e.st.burnT, 1.5);
            }
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
        default:
          break;
      }
    }
  }

  detonateBarrel(o: Extract<Obstacle, { kind: 'barrel' }>, depth: number): void {
    if (!o.alive) return;
    o.alive = false;
    o.respawn = 10;
    this.run.barrelsExploded++;
    this.addCombo(2);
    const st = this.build.stats;
    explode(this, o.x, o.y, 85, st.damage * 3 + 20, depth + 1, { color: '#ff8a3d', src: 'barrel', burn: true });
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
        this.run.coinsCollected += p.value * this.build.stats.coinGain * blood;
        this.emit({ t: 'sfx', name: 'coin', vol: 0.5 });
        break;
      case 'core':
        this.run.coresCollected += p.value;
        this.banner('+1 CORE', '#ff7ad9');
        this.emit({ t: 'sfx', name: 'core' });
        break;
      case 'heal':
        this.heal(p.value, false);
        break;
      case 'mystery':
        this.mysteryTransform();
        break;
    }
  }

  private mysteryTransform(): void {
    const opts: [string, string, Modifier[]][] = [
      ['MEGA BALL', '#ff7ad9', [{ stat: 'radius', mult: 1 }, { stat: 'damage', mult: 1 }]],
      ['PRISM BALL', '#5ee7ff', [{ stat: 'burnChance', add: 0.5 }, { stat: 'chillChance', add: 0.5 }, { stat: 'chainChance', add: 0.5 }]],
      ['OVERDRIVE', '#ffe066', [{ stat: 'speed', mult: 0.5 }, { stat: 'pierce', add: 3 }]],
      ['BLAST BALL', '#ff8a3d', [{ stat: 'explosionChance', add: 0.6 }]],
    ];
    const [name, color, mods] = this.rng.pick(opts);
    this.addBuff('mystery', 12, mods);
    this.banner(`❓ ${name}`, color, 'Mystery transformation for 12s');
    this.emit({ t: 'sfx', name: 'synergy' });
  }

  // ------------------------------------------------------------------ end
  finish(victory: boolean): void {
    if (this.endTimer >= 0 || this.state === 'over') return;
    this.victory = victory;
    this.endTimer = victory ? 2.5 : 1.2;
    this.emit({ t: 'slowmo', dur: this.endTimer, scale: 0.3 });
    if (!victory) {
      this.banner('DEFENSE BROKEN', '#ff3b3b', undefined, true);
      this.emit({ t: 'sfx', name: 'defeat' });
    }
  }

  /** Continue into endless mode after a victory. */
  continueEndless(): void {
    if (!this.victory) return;
    this.state = 'playing';
    this.endTimer = -1;
    this.director.startEndless();
    this.banner('ENDLESS MODE', '#c77dff', 'How long can your build survive?', true);
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
      maxWallChain: r.maxWallChain, maxBounceChain: r.maxBounceChain, maxBallsInFlight: r.maxBallsInFlight,
      maxBallsOwned: r.maxBallsOwned, maxMomentumTier: r.maxMomentumTier, fireKills: r.fireKills,
      lightningKills: r.lightningKills, explosionKills: r.explosionKills, bleedKills: r.bleedKills,
      frozenCount: r.frozenCount, barrelsExploded: r.barrelsExploded, goldenCaught: r.goldenCaught,
      coinsCollected: Math.round(r.coinsCollected), coresCollected: r.coresCollected,
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
