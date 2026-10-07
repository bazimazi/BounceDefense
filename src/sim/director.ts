import { BOSSES, BOSS_MAP, ELITE_MODS, ENEMY_MAP } from '../data/enemies';
import type { SquadDef } from '../data/types';
import { BOSS_SCRIPTS, BOSS_SPAWN_Y } from './bosses';
import { FIELD_TOP, W, type Enemy } from './types';
import type { World } from './world';

const ELITE_POOL: [string, number][] = [
  ['grunt', 0], ['runner', 30], ['brute', 60], ['shielder', 80], ['splitter', 95], ['bomber', 120], ['healer', 160], ['magnet', 170],
];

/**
 * Paces the run. Difficulty rises through composition (squads that combine
 * enemies), elites, events and bosses — not just HP inflation.
 */
export class Director {
  budget = 2.65;
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

  constructor(private w: World) {
    const tut = !!w.cfg.tutorial;
    this.bossTime = tut ? 330 : 400;
    this.eliteTimer = tut ? 150 : Math.min(110, w.diff.eliteEvery);
    this.eventTime = tut ? 75 : 65;
  }

  get squadsPaused(): boolean {
    return this.bossActive || (!this.endless && this.w.time > this.bossTime - 8 && this.bossesSpawned === 0);
  }

  threatRate(t: number): number {
    const tut = this.w.cfg.tutorial && t < 60 ? 0.7 : 1;
    const base = 0.22 + t * 0.0038 + Math.max(0, t - 240) * 0.003;
    return base * this.w.diff.spawnMult * tut;
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
        w.banner('⚠ WARNING ⚠', '#ff3b3b', 'A boss approaches');
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
        this.eliteTimer = w.diff.eliteEvery * w.rng.range(0.85, 1.15);
        this.spawnElite(w.diff.eliteModCount, 1);
      }
      if (!this.miniDone && t >= this.bossTime * 0.62) {
        this.miniDone = true;
        const e = this.spawnElite(Math.min(3, w.diff.eliteModCount + 1), 1.5, 'brute');
        if (e) w.banner('MINI-BOSS', '#ff7ad9', 'A hulking elite arrives');
      }
      if (t >= this.eventTime && !w.event && !this.squadsPaused) {
        const hostile = ['blood_moon', 'gravity_storm', 'blackout'];
        const pool = w.cfg.difficulty >= 4 ? w.arena.events.filter((e) => hostile.includes(e)) : w.arena.events;
        w.startEvent(w.rng.pick(pool.length ? pool : w.arena.events));
        this.eventTime = t + w.rng.range(85, 105);
      }
    }

    // ---- rare golden wisp
    this.goldenTimer -= dt;
    if (this.goldenTimer <= 0) {
      this.goldenTimer = 50;
      const chance = 0.28 + w.build.stats.luck * 0.08 + w.build.level('greed') * 0.1;
      if (w.rng.chance(chance)) {
        w.spawnEnemy('golden', w.rng.range(80, W - 80), 480);
        w.banner('✨ GOLDEN WISP', '#ffd84a', 'Catch it before it escapes!');
      }
    }
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
    const traitChance = w.cfg.difficulty >= 4 ? 0.15 : w.cfg.difficulty >= 3 ? 0.08 : 0;
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
      w.emit({ t: 'text', x: e.x, y: FIELD_TOP + 30, text: `ELITE ${names.toUpperCase()} ${e.def.name.toUpperCase()}`, color: '#ff7ad9' });
      w.emit({ t: 'sfx', name: 'elite' });
    }
    return e;
  }

  spawnBoss(): void {
    const w = this.w;
    let id = w.arena.bossId;
    if (this.bossesSpawned > 0) {
      const others = BOSSES.filter((b) => b.id !== w.arena.bossId);
      id = others[(this.bossesSpawned - 1 + this.endlessCycle) % others.length].id;
    }
    const def = BOSS_MAP[id];
    const hpMult = w.diff.bossHpMult * (1 + 0.5 * this.bossesSpawned) * (this.endless ? 1 + this.endlessCycle * 0.8 : 1);
    const e = w.spawnEnemy(def.enemy, W / 2, BOSS_SPAWN_Y, { hpMult });
    if (!e) return;
    BOSS_SCRIPTS[def.enemy]?.init(w, e);
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
    w.banner('BOSS DEFEATED', '#ffe066', BOSS_MAP[this.bossId].name, true);
    w.emit({ t: 'flash', color: '#ffffff', a: 0.6 });
    w.emit({ t: 'slowmo', dur: 1.4, scale: 0.2 });
    w.emit({ t: 'sfx', name: 'victory' });
    for (let i = 0; i < 12; i++) w.spawnPickup('coin', e.x, e.y, 12);
    for (let i = 0; i < 2; i++) w.spawnPickup('core', e.x, e.y, 1);
    for (let i = 0; i < 6; i++) w.spawnPickup('xp', e.x, e.y, 6);

    if (this.endless) {
      this.endlessCycle++;
      this.bossTime = w.time + 150;
      this.warned = false;
      return;
    }
    if (w.diff.secondBoss && this.bossesSpawned === 1) {
      this.bossTime = w.time + 80;
      this.warned = false;
      this.eventTime = w.time + 30;
      w.banner('THE ASSAULT CONTINUES', '#ff7b54', 'A second boss is coming');
      return;
    }
    this.bossTime = Infinity;
    w.finish(true);
  }

  startEndless(): void {
    this.endless = true;
    this.bossTime = this.w.time + 150;
    this.warned = false;
  }
}
