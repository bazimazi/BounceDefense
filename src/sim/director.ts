import { t as i18n } from '../i18n';
import { HOSTILE_EVENTS } from '../data/arenas';
import { APEX_BOSSES, BOSSES, BOSS_MAP, ELITE_MODS, ENEMY_MAP } from '../data/enemies';
import type { SquadDef } from '../data/types';
import { BOSS_SCRIPTS, BOSS_SPAWN_Y } from './bosses';
import { FIELD_TOP, W, type Enemy } from './types';
import type { World } from './world';

/** Endless multiplies enemy health by this much per minute survived past the victory. */
export const ENDLESS_RAMP = 1.22;

const ELITE_POOL: [string, number][] = [
  ['grunt', 0], ['runner', 30], ['brute', 60], ['shielder', 80], ['splitter', 95], ['bomber', 120], ['healer', 160], ['magnet', 170],
];

/**
 * Paces the run. Difficulty rises through composition (squads that combine
 * enemies), elites, events and bosses — not just HP inflation.
 */
export class Director {
  /** Enough for the first squad on the opening step. */
  budget = 3;
  next: SquadDef | null = null;
  bossActive = false;
  bossId = '';
  bossesSpawned = 0;
  bossTime: number;
  warned = false;
  eliteTimer: number;
  eventTime: number;
  miniDone = false;
  goldenTimer = 45;
  endless = false;
  endlessCycle = 0;
  /** Run time when Endless began. */
  endlessStart = 0;
  /** This run's boss fights in order: rotation bosses (the arena's own first), then the tier's apex bosses. */
  readonly queue: string[];
  /** Endless order: the run's queue, then every other boss, repeating. */
  readonly cycle: string[];

  constructor(private w: World) {
    const rotation = [w.arena.bossId, ...BOSSES.map((b) => b.id).filter((b) => b !== w.arena.bossId)];
    const regular = w.diff.bosses + (w.asc.has('thirdBoss') ? 1 : 0);
    this.queue = [...rotation.slice(0, regular), ...(w.diff.apex ?? [])];
    this.cycle = [...this.queue, ...[...rotation, ...APEX_BOSSES.map((b) => b.id)].filter((b) => !this.queue.includes(b))];
    const tut = !!w.cfg.tutorial;
    this.bossTime = tut ? 330 : 400 - (w.pacts.has('shortFuse') ? 90 : 0);
    // Even the hardest tiers give the build ~90 seconds to form before the first elite.
    this.eliteTimer = tut ? 150 : Math.max(90, Math.min(110, this.eliteEvery()));
    this.eventTime = tut ? 75 : 65;
  }

  /** Seconds between elites: the tier's pace, doubled by the Elite Surge pact. */
  eliteEvery(): number {
    return this.w.diff.eliteEvery * (this.w.pacts.has('eliteSurge') ? 0.5 : 1);
  }

  get squadsPaused(): boolean {
    return this.bossActive || (!this.endless && this.w.time > this.bossTime - 8 && this.bossesSpawned === 0);
  }

  /** Endless pressure: 1 before Endless, then growing every minute so every build eventually falls. */
  endlessPressure(): number {
    return this.endless ? Math.pow(ENDLESS_RAMP, Math.max(0, this.w.time - this.endlessStart) / 60) : 1;
  }

  threatRate(t: number): number {
    const tut = this.w.cfg.tutorial && t < 45 ? 0.8 : 1;
    // A lively opening (fodder to smash right away) that meets the long-run curve by ~4 minutes.
    const base = 0.3 + t * 0.0034 + Math.max(0, t - 240) * 0.003;
    const asc = this.w.asc.has('spawn10') ? 1.1 : 1;
    return base * this.w.diff.spawnMult * (this.w.arena.spawnMult ?? 1) * tut * asc;
  }

  private pickSquad(): SquadDef {
    const w = this.w;
    const t = w.time;
    const opts = w.arena.squads.filter((s) => s.minTime <= t && (s.maxTime === undefined || t <= s.maxTime) && (s.minDiff ?? 0) <= w.cfg.difficulty);
    const early = t < 25 ? opts.filter((s) => s.id === 'grunt_line') : opts;
    return w.rng.weighted(early.length ? early : opts, (s) => s.weight) ?? w.arena.squads[0];
  }

  private squadCost(s: SquadDef): number {
    return s.members.reduce((a, [id, n]) => a + ENEMY_MAP[id].threat * n, 0);
  }

  update(dt: number): void {
    const w = this.w;
    const t = w.time;
    if (w.endTimer >= 0) return; // run is ending

    // ---- boss timeline
    if (!this.bossActive) {
      if (!this.warned && t >= this.bossTime - 6) {
        this.warned = true;
        w.banner(i18n('fx.warning'), '#ff3b3b', i18n('fx.warningSub'));
        w.emit({ t: 'sfx', name: 'warning' });
      }
      if (t >= this.bossTime) this.spawnBoss();
    }

    // ---- squads
    if (!this.squadsPaused) {
      this.budget += this.threatRate(t) * dt;
      if (!this.next) this.next = this.pickSquad();
      if (this.budget >= this.squadCost(this.next)) {
        this.budget -= this.squadCost(this.next);
        this.spawnSquad(this.next);
        this.next = null;
      }
    }

    // ---- elites & mini-boss
    if (!this.bossActive) {
      this.eliteTimer -= dt;
      if (this.eliteTimer <= 0) {
        this.eliteTimer = this.eliteEvery() * w.rng.range(0.85, 1.15);
        this.spawnElite(this.eliteMods(), 1);
      }
      if (!this.miniDone && t >= this.bossTime * 0.62) {
        this.miniDone = true;
        const harder = w.asc.has('miniboss');
        const e = this.spawnElite(Math.min(harder ? 4 : 3, this.eliteMods() + 1 + (harder ? 1 : 0)), harder ? 2.25 : 1.5, 'brute');
        if (e) {
          e.tag = 'mini';
          w.banner(i18n('fx.miniBoss'), '#ff7ad9', w.relicsAllowed() ? i18n('fx.miniBossRelic') : i18n('fx.miniBossSub'));
        }
      }
      if (t >= this.eventTime && !w.event && !this.squadsPaused) {
        // Abyss promises hostile events everywhere, even in arenas whose own list has none.
        const own = w.arena.events.filter((e) => HOSTILE_EVENTS.includes(e));
        const pool = w.diff.hostileEvents ? (own.length ? own : HOSTILE_EVENTS) : w.arena.events;
        w.startEvent(w.rng.pick(pool));
        this.eventTime = t + w.rng.range(85, 105);
      }
    }

    // ---- rare golden wisp
    this.goldenTimer -= dt;
    if (this.goldenTimer <= 0) {
      this.goldenTimer = 50;
      const chance = 0.28 + w.build.stats.luck * 0.08 + w.build.level('greed') * 0.1 + (w.flags.has('prospect') ? 0.15 : 0);
      if (w.rng.chance(chance)) {
        w.spawnEnemy('golden', w.rng.range(80, W - 80), 480);
        w.banner(i18n('fx.goldenWisp'), '#ffd84a', i18n('fx.goldenWispSub'));
      }
    }
  }

  /** Elite modifier count ramps up with time: one early, the difficulty's full count from 5 minutes. */
  eliteMods(): number {
    const base = Math.min(this.w.diff.eliteModCount, 1 + Math.floor(this.w.time / 150));
    return Math.min(ELITE_MODS.length, base + (this.w.asc.has('eliteMod') ? 1 : 0));
  }

  private place(s: SquadDef): [string, number, number][] {
    const w = this.w;
    const out: [string, number, number][] = [];
    const ids: string[] = [];
    for (const [id, n] of s.members) for (let i = 0; i < n; i++) ids.push(id);
    const cx = w.rng.range(80, W - 80);
    const y0 = FIELD_TOP - 30;
    ids.forEach((id, i) => {
      const k = i - (ids.length - 1) / 2;
      switch (s.formation) {
        case 'line': out.push([id, cx + k * 46, y0]); break;
        case 'column': out.push([id, cx, y0 - i * 42]); break;
        case 'v': out.push([id, cx + k * 40, y0 - Math.abs(k) * 34]); break;
        case 'cluster': out.push([id, cx + w.rng.range(-45, 45), y0 - w.rng.range(0, 60)]); break;
        default: out.push([id, w.rng.range(40, W - 40), y0 - w.rng.range(0, 90)]); break;
      }
    });
    return out;
  }

  spawnSquad(s: SquadDef): void {
    const w = this.w;
    // Elite traits on ordinary enemies phase in over the first 90 seconds.
    const base = w.diff.traitChance + (w.asc.has('traits') ? 0.1 : 0);
    const traitChance = base * Math.min(1, w.time / 90);
    for (const [id, x, y] of this.place(s)) {
      const e = w.spawnEnemy(id, x, y);
      if (e && traitChance && w.rng.chance(traitChance)) {
        const m = w.rng.pick(['swift', 'armored', 'shield']);
        if (m === 'swift') e.speed *= 1.5;
        else if (m === 'armored') e.armor += 5;
        else e.shieldHp = e.maxHp * 0.3;
      }
    }
  }

  spawnElite(mods: number, hpMult: number, forceId?: string): Enemy | null {
    const w = this.w;
    const opts = ELITE_POOL.filter(([, t]) => t <= w.time).map(([id]) => id);
    const id = forceId ?? w.rng.pick(opts);
    const pool = ELITE_MODS.map((m) => m.id);
    w.rng.shuffle(pool);
    const e = w.spawnEnemy(id, w.rng.range(80, W - 80), FIELD_TOP - 30, { elite: pool.slice(0, mods), hpMult });
    if (e) {
      const names = e.elite.map((m) => ELITE_MODS.find((x) => x.id === m)!.name).join(' ');
      w.emit({ t: 'text', x: e.x, y: FIELD_TOP + 44, text: i18n('fx.elite', { mods: names.toUpperCase(), name: e.def.name.toUpperCase() }), color: '#ff7ad9', elite: true });
      w.emit({ t: 'sfx', name: 'elite' });
    }
    return e;
  }

  spawnBoss(): void {
    const w = this.w;
    // The run's queue first (the arena's own boss leads); Endless keeps cycling through every boss.
    const id = this.cycle[this.bossesSpawned % this.cycle.length];
    const def = BOSS_MAP[id];
    const hpMult = w.diff.bossHpMult * (1 + 0.5 * this.bossesSpawned) * (this.endless ? 1 + this.endlessCycle * 0.8 : 1);
    const e = w.spawnEnemy(def.enemy, W / 2, BOSS_SPAWN_Y, { hpMult });
    if (!e) return;
    BOSS_SCRIPTS[def.enemy]?.init(w, e);
    w.resonance.avoidBosses();
    this.bossActive = true;
    this.bossId = id;
    this.bossesSpawned++;
    w.bossStart = w.time;
    w.discover('bosses', id);
    w.banner(def.name.toUpperCase(), '#ff3b3b', def.title, true);
    w.emit({ t: 'shake', amt: 12 });
    w.emit({ t: 'sfx', name: 'boss' });
    w.bus.emit('bossSpawn', { id });
  }

  updateBoss(dt: number): void {
    if (!this.bossActive) return;
    for (const e of this.w.enemies) {
      if (e.alive && e.boss) BOSS_SCRIPTS[e.def.id]?.update(this.w, e, dt);
    }
  }

  bosses(): Enemy[] {
    return this.w.enemies.filter((e) => e.alive && e.boss);
  }

  onBossPartDeath(e: Enemy): void {
    const w = this.w;
    BOSS_SCRIPTS[e.def.id]?.onDeath?.(w, e);
    if (w.enemies.some((o) => o.alive && o.boss)) return;
    // boss defeated
    this.bossActive = false;
    const fight = w.time - w.bossStart;
    w.run.bossesDefeated.push(this.bossId);
    w.run.bossFightTimes.push(fight);
    w.bus.emit('bossDefeated', { id: this.bossId });
    w.banner(i18n('fx.bossDefeated'), '#ffe066', BOSS_MAP[this.bossId].name, true);
    w.emit({ t: 'flash', color: '#ffffff', a: 0.6 });
    w.emit({ t: 'slowmo', dur: 1.4, scale: 0.2 });
    w.emit({ t: 'sfx', name: 'victory' });
    const trophy = w.flags.has('trophy');
    for (let i = 0; i < 12; i++) w.spawnPickup('coin', e.x, e.y, trophy ? 24 : 12);
    for (let i = 0; i < 2; i++) w.spawnPickup('core', e.x, e.y, 1);
    for (let i = 0; i < 6; i++) w.spawnPickup('xp', e.x, e.y, 6);
    // Research rewards for a fallen boss: Grand Unification lifts its relic cache, Spoils of War adds a free pick,
    // Trophy Hunter mends the line after an apex kill.
    w.grantRelic(true, w.flags.has('unified') ? 1 : 0);
    if (w.flags.has('spoils')) w.pendingLevels++;
    if (trophy && BOSS_MAP[this.bossId]?.apex) w.heal(w.maxHp * 0.3, false);

    if (this.endless) {
      this.endlessCycle++;
      this.bossTime = w.time + 150;
      this.warned = false;
      return;
    }
    if (this.bossesSpawned < this.queue.length) {
      const apex = BOSS_MAP[this.queue[this.bossesSpawned]]?.apex;
      this.bossTime = w.time + 80;
      this.warned = false;
      this.eventTime = w.time + 30;
      if (apex) w.banner(i18n('fx.apexAssault'), '#ff3b9a', i18n('fx.apexAssaultSub', { name: BOSS_MAP[this.queue[this.bossesSpawned]].name }));
      else w.banner(i18n('fx.assault'), '#ff7b54', i18n('fx.assaultSub'));
      return;
    }
    this.bossTime = Infinity;
    w.finish(true);
  }

  startEndless(): void {
    this.endless = true;
    this.endlessStart = this.w.time;
    this.bossTime = this.w.time + 150;
    this.warned = false;
  }
}
