import { t } from '../i18n';
import { TAU } from '../core/math';
import { DEFENSE_Y, FIELD_TOP, W, type Enemy } from './types';
import { clamp } from '../core/math';
import { ENEMY_MAP } from '../data/enemies';
import type { World } from './world';

/** Boss scripts change the rules of the arena instead of just being HP sponges. */
export interface BossScript {
  init(w: World, e: Enemy): void;
  update(w: World, e: Enemy, dt: number): void;
  onDeath?(w: World, e: Enemy): void;
}

function enrage(w: World, e: Enemy, text: string): void {
  if (e.phase === 0 && e.hp < e.maxHp * (w.asc.has('enrage') ? 0.65 : 0.5)) {
    e.phase = 1;
    w.banner(text, '#ff3b3b');
    w.emit({ t: 'shake', amt: 10 });
    w.emit({ t: 'sfx', name: 'boss' });
  }
}

function volley(w: World, x: number, y: number, n: number, speed: number, dmg: number, color: string): void {
  for (let i = 0; i < n; i++) {
    const tx = ((i + 0.5) / n) * W;
    const dx = tx - x;
    const dy = DEFENSE_Y - y;
    const l = Math.hypot(dx, dy) || 1;
    w.spawnProjectile(x, y, (dx / l) * speed, (dy / l) * speed, dmg, color, 9);
  }
}

/** Ward pylons orbit the Architect at this distance. */
export const PYLON_ORBIT = 96;
/** The Architect's walls: half-width and height below the boss. */
export const ARCHITECT_WALL = { half: 85, below: 105 };

export const FORTRESS_RING = 36;
export const FORTRESS_HALF_ARC = 0.44;

export const BOSS_SCRIPTS: Record<string, BossScript> = {
  boss_fortress: {
    init(_w, e) {
      e.t0 = 0; // rotation
      e.t1 = 4; // summon timer
      e.gen = 5; // volley timer (re-used field)
    },
    update(w, e, dt) {
      if (e.y < 250) e.y += 90 * dt;
      enrage(w, e, t('fx.fortressHardens'));
      e.t0 += (e.phase ? 1.45 : 0.85) * dt * (e.st.frozenT > 0 ? 0.3 : 1);
      const n = e.phase ? 4 : 3;
      const R = e.r + FORTRESS_RING;
      for (let k = 0; k < n; k++) {
        const a = e.t0 + (k * TAU) / n;
        const steps = 4;
        for (let s = 0; s < steps; s++) {
          const a0 = a - FORTRESS_HALF_ARC + (s / steps) * 2 * FORTRESS_HALF_ARC;
          const a1 = a - FORTRESS_HALF_ARC + ((s + 1) / steps) * 2 * FORTRESS_HALF_ARC;
          w.dynSegments.push({
            ax: e.x + Math.cos(a0) * R, ay: e.y + Math.sin(a0) * R,
            bx: e.x + Math.cos(a1) * R, by: e.y + Math.sin(a1) * R, kind: 'shield',
          });
        }
      }
      e.t1 -= dt;
      if (e.t1 <= 0) {
        e.t1 = e.phase ? 5.5 : 7.5;
        for (const off of [-110, 110]) w.spawnEnemy('minion', e.x + off, e.y + 40);
      }
      if (e.phase) {
        e.gen -= dt;
        if (e.gen <= 0) {
          e.gen = 5;
          volley(w, e.x, e.y + e.r, 3, 115, 7, '#8fa8ff');
        }
      }
    },
  },

  boss_magnetar: {
    init(_w, e) {
      e.t0 = 6; // pulse timer
      e.t1 = 0; // pulse active time (read by ball physics)
      e.gen = 10; // summon timer
    },
    update(w, e, dt) {
      if (e.y < 230) e.y += 80 * dt;
      enrage(w, e, t('fx.magnetarCollapses'));
      e.x = W / 2 + Math.sin(w.time * 0.45) * 150;
      if (e.t1 > 0) e.t1 -= dt;
      e.t0 -= dt;
      if (e.t0 <= 0) {
        e.t0 = e.phase ? 6 : 8;
        e.t1 = 0.8;
        w.emit({ t: 'ring', x: e.x, y: e.y, r: 320, color: '#ff9950', dur: 0.8 });
        w.emit({ t: 'sfx', name: 'pulse' });
        if (e.phase) volley(w, e.x, e.y + e.r, 4, 110, 7, '#ff9950');
      }
      e.gen -= dt;
      if (e.gen <= 0) {
        e.gen = 14;
        w.spawnEnemy('magnet', e.x + (w.rng.chance(0.5) ? -120 : 120), e.y + 30);
      }
    },
  },

  boss_hydra: {
    init(_w, e) {
      e.t0 = 3; // spit timer
      e.t1 = e.x; // sway anchor
    },
    update(w, e, dt) {
      if (e.y < 210 + e.gen * 40) e.y += 80 * dt;
      e.x = e.t1 + Math.sin(w.time * (0.8 + e.gen * 0.3) + e.id) * (60 - e.gen * 10);
      e.t0 -= dt;
      if (e.t0 <= 0) {
        e.t0 = 3.2 + e.gen * 0.8 + w.rng.range(0, 1);
        const tx = w.rng.range(60, W - 60);
        const dx = tx - e.x;
        const dy = DEFENSE_Y - e.y;
        const l = Math.hypot(dx, dy) || 1;
        w.spawnProjectile(e.x, e.y + e.r, (dx / l) * 130, (dy / l) * 125, 7, '#5dffa0', 8);
      }
    },
    onDeath(w, e) {
      if (e.gen >= 2) return;
      const sizes = [44, 32, 22];
      for (const off of [-70, 70]) {
        const x = Math.min(W - 40, Math.max(40, e.x + off));
        const c = w.spawnEnemy('boss_hydra', x, e.y, { hpMult: (e.maxHp * 0.45) / e.def.hp });
        if (!c) continue;
        c.gen = e.gen + 1;
        c.r = sizes[c.gen];
        c.spawnT = 0.2;
        BOSS_SCRIPTS.boss_hydra.init(w, c);
        c.t1 = x;
      }
      w.banner(t('fx.hydraSplits'), '#5dffa0');
      w.emit({ t: 'sfx', name: 'boss' });
    },
  },

  // Lays eggs that hatch into mites and spits acid; enraged, it lays faster and bursts a brood.
  boss_broodmother: {
    init(_w, e) {
      e.t0 = 4; // egg timer
      e.t1 = 3; // acid timer
      e.t2 = e.x; // sway anchor
    },
    update(w, e, dt) {
      if (e.y < 220) e.y += 75 * dt;
      const was = e.phase;
      enrage(w, e, t('fx.broodEnrage'));
      if (e.phase && !was) {
        for (let i = 0; i < 6; i++) w.spawnEnemy('mite', e.x + (i - 2.5) * 30, e.y + e.r);
      }
      e.x = e.t2 + Math.sin(w.time * 0.5) * 120;
      e.t0 -= dt;
      if (e.t0 <= 0) {
        e.t0 = e.phase ? 4.5 : 6.5;
        for (let i = 0; i < 2; i++) {
          const egg = w.spawnEnemy('brood_egg', clamp(e.x + w.rng.range(-150, 150), 40, W - 40), e.y + e.r + w.rng.range(20, 120));
          if (egg) egg.spawnT = 0.2;
        }
        w.emit({ t: 'sfx', name: 'split', pitch: 0.6 });
      }
      e.t1 -= dt;
      if (e.t1 <= 0) {
        e.t1 = e.phase ? 3.6 : 5;
        volley(w, e.x, e.y + e.r, e.phase ? 4 : 3, 120, 7, '#a6ff4d');
      }
    },
  },

  // Stops time (balls crawl), raises stasis bubbles; enraged, it stops time more often.
  boss_chronarch: {
    init(_w, e) {
      e.t0 = 7; // time-stop timer
      e.t1 = 5; // stasis timer
      e.gen = 9; // summon timer
    },
    update(w, e, dt) {
      if (e.y < 235) e.y += 80 * dt;
      enrage(w, e, t('fx.chronarchEnrage'));
      e.x = W / 2 + Math.sin(w.time * 0.35) * 130;
      e.t0 -= dt;
      if (e.t0 <= 1.2 && e.t0 + dt > 1.2) {
        w.emit({ t: 'ring', x: e.x, y: e.y, r: 90, color: '#ffd27a', dur: 1.2 });
        w.emit({ t: 'sfx', name: 'warning', vol: 0.4 });
      }
      if (e.t0 <= 0) {
        e.t0 = e.phase ? 7.5 : 10;
        w.timeStop = 1.1;
        w.banner(t('fx.timeStop'), '#ffd27a');
        w.emit({ t: 'flash', color: '#ffe9b0', a: 0.3 });
        w.emit({ t: 'sfx', name: 'timestop' });
      }
      e.t1 -= dt;
      if (e.t1 <= 0) {
        e.t1 = e.phase ? 5 : 7;
        const n = e.phase ? 2 : 1;
        for (let i = 0; i < n; i++) w.addZone('stasis', w.rng.range(90, W - 90), w.rng.range(340, 600), 62, 6, 0);
      }
      e.gen -= dt;
      if (e.gen <= 0) {
        e.gen = 11;
        for (const off of [-100, 100]) w.spawnEnemy('phantom', e.x + off, e.y + 40);
        if (e.phase) volley(w, e.x, e.y + e.r, 3, 115, 7, '#ffd27a');
      }
    },
  },

  // Hides behind orbiting ward pylons and raises walls between itself and your launcher.
  boss_architect: {
    init(w, e) {
      e.t0 = 4; // wall timer
      e.t1 = 0; // wall time left
      e.t2 = 0; // pylon orbit angle
      e.gen = 18; // pylon rebuild timer
      spawnPylons(w, e);
    },
    update(w, e, dt) {
      if (e.y < 230) e.y += 80 * dt;
      enrage(w, e, t('fx.architectEnrage'));
      e.x = W / 2 + Math.sin(w.time * 0.3) * (e.phase ? 150 : 110);
      // Pylons orbit the boss; their count gates its damage reduction (combat reads e.t3).
      e.t2 += dt * (e.phase ? 1.1 : 0.7);
      let k = 0;
      const pylons = w.enemies.filter((o) => o.alive && o.def.id === 'ward_pylon');
      for (const p of pylons) {
        const a = e.t2 + (k++ * Math.PI * 2) / Math.max(1, pylons.length);
        p.x = e.x + Math.cos(a) * PYLON_ORBIT;
        p.y = e.y + Math.sin(a) * PYLON_ORBIT * 0.75;
      }
      e.t3 = pylons.length;
      if (!pylons.length) {
        e.gen -= dt;
        if (e.gen <= 0) {
          e.gen = e.phase ? 14 : 18;
          spawnPylons(w, e);
          w.banner(t('fx.architectRebuilds'), '#e8eef8');
        }
      }
      // Walls: a barrier segment below the boss that deflects shots for a few seconds.
      if (e.t1 > 0) {
        e.t1 -= dt;
        const y = e.y + ARCHITECT_WALL.below;
        const half = ARCHITECT_WALL.half * (e.phase ? 1.35 : 1);
        const tilt = e.phase ? Math.sin(w.time * 1.4) * 22 : 0;
        w.dynSegments.push({ ax: e.x - half, ay: y - tilt, bx: e.x + half, by: y + tilt, kind: 'shield' });
      } else {
        e.t0 -= dt;
        if (e.t0 <= 0) {
          e.t0 = e.phase ? 5.5 : 7.5;
          e.t1 = e.phase ? 4.5 : 3.5;
          w.emit({ t: 'sfx', name: 'shield' });
        }
      }
      if (e.phase && w.rng.chance(dt / 6)) volley(w, e.x, e.y + e.r, 3, 115, 7, '#e8eef8');
    },
    onDeath(w) {
      for (const p of w.enemies) {
        if (!p.alive || p.def.id !== 'ward_pylon') continue;
        p.alive = false;
        w.emit({ t: 'kill', x: p.x, y: p.y, r: p.r, color: p.def.color, big: false });
      }
    },
  },
  // ---- apex bosses ---------------------------------------------------------------------------

  // Unyielding: only a steady trickle of damage gets through (see bossMitigation). Its quakes drive
  // the whole field toward the line, and it keeps calling heavy escorts.
  boss_colossus: {
    init(_w, e) {
      e.t0 = 8; // quake timer
      e.t1 = 5; // summon timer
      e.t3 = e.maxHp * COLOSSUS_CAP; // damage budget (refills every second)
    },
    update(w, e, dt) {
      if (e.y < 240) e.y += 55 * dt;
      enrage(w, e, t('fx.colossusEnrage'));
      const cap = e.maxHp * COLOSSUS_CAP;
      e.t3 = Math.min(cap, e.t3 + cap * dt);
      e.x = W / 2 + Math.sin(w.time * 0.22) * 95;
      e.t0 -= dt;
      if (e.t0 <= 1.2 && e.t0 + dt > 1.2) {
        w.emit({ t: 'ring', x: e.x, y: e.y, r: 140, color: '#d2a679', dur: 1.2 });
        w.emit({ t: 'sfx', name: 'warning', vol: 0.4 });
      }
      if (e.t0 <= 0) {
        e.t0 = e.phase ? 7 : 10;
        const push = e.phase ? 34 : 24;
        for (const o of w.enemies) {
          if (!o.alive || o.boss || o.def.ai === 'pylon' || o.def.ai === 'golden') continue;
          o.y = Math.max(o.y, Math.min(o.y + push, DEFENSE_Y - o.r - 30));
        }
        volley(w, e.x, e.y + e.r, e.phase ? 5 : 4, 120, 8, '#d2a679');
        w.banner(t('fx.colossusQuake'), '#d2a679');
        w.emit({ t: 'shake', amt: 9 });
        w.emit({ t: 'sfx', name: 'explode', pitch: 0.5 });
      }
      e.t1 -= dt;
      if (e.t1 <= 0) {
        e.t1 = e.phase ? 9 : 12;
        for (const off of [-120, 120]) w.spawnEnemy('brute', e.x + off, e.y + 30);
        if (e.phase) w.spawnEnemy('juggernaut', e.x, e.y + e.r + 20);
      }
    },
  },

  // Sol and Luna orbit together; a fallen twin rises at half health unless its partner falls soon after.
  boss_sol: twinScript('boss_luna', true),
  boss_luna: twinScript('boss_sol', false),

  // Every mind on the field shields it (see bossMitigation); it calls elite thralls and mends its swarm.
  boss_overmind: {
    init(_w, e) {
      e.t0 = 5; // thrall timer
      e.t1 = 2.5; // brood timer
      e.t2 = 8; // psionic mend timer
      e.t3 = 0; // damage reduction from living minds
    },
    update(w, e, dt) {
      if (e.y < 225) e.y += 80 * dt;
      enrage(w, e, t('fx.overmindEnrage'));
      e.x = W / 2 + Math.sin(w.time * 0.4) * 125;
      e.t3 = Math.min(OVERMIND_WARD_MAX, overmindMinds(w) * OVERMIND_WARD_PER);
      e.t0 -= dt;
      if (e.t0 <= 0) {
        e.t0 = e.phase ? 9 : 12;
        w.director.spawnElite(e.phase ? 2 : 1, 1);
      }
      e.t1 -= dt;
      if (e.t1 <= 0) {
        e.t1 = e.phase ? 4 : 5.5;
        for (let i = 0; i < 3; i++) {
          const m = w.spawnEnemy('runner', e.x + (i - 1) * 46, e.y + e.r + 16);
          if (m) m.spawnT = 0.2;
        }
      }
      e.t2 -= dt;
      if (e.t2 <= 0) {
        e.t2 = e.phase ? 7 : 9;
        for (const o of w.enemies) {
          if (o.alive && !o.boss && o.def.ai !== 'pylon') o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.25);
        }
        w.emit({ t: 'ring', x: e.x, y: e.y, r: 360, color: '#ff6bd6', dur: 0.9 });
        w.emit({ t: 'sfx', name: 'pulse', pitch: 0.7 });
        volley(w, e.x, e.y + e.r, e.phase ? 4 : 3, 115, 7, '#ff6bd6');
      }
    },
  },

  // Three phases: at 70% and 35% it seals itself behind void shards; it bends shots (physics),
  // then adds stasis bubbles and blinks, and finally stops time.
  boss_sovereign: {
    init(_w, e) {
      e.t0 = 3.5; // void bolt timer
      e.t1 = 6; // stasis / blink timer
      e.t2 = 10; // time-stop timer
      e.gen = 0; // seals raised
      e.t3 = 0; // void shards standing
    },
    update(w, e, dt) {
      if (e.y < 230) e.y += 70 * dt;
      e.t3 = w.enemies.reduce((n, o) => n + (o.alive && o.def.id === 'void_shard' ? 1 : 0), 0);
      if (e.gen < SOVEREIGN_SEALS.length && e.hp <= sovereignFloor(e) + 0.5) {
        e.gen++;
        e.phase = e.gen;
        for (const [x, y] of SOVEREIGN_SHARDS) {
          const sh = w.spawnEnemy('void_shard', x, y, { hpMult: SOVEREIGN_SHARD_HP });
          if (sh) sh.spawnT = 0.3;
        }
        e.t3 = SOVEREIGN_SHARDS.length;
        w.banner(t('fx.sovereignSealed'), '#c9a2ff', t('fx.sovereignSealedSub'));
        w.emit({ t: 'flash', color: '#9d4dff', a: 0.3 });
        w.emit({ t: 'shake', amt: 10 });
        w.emit({ t: 'sfx', name: 'boss' });
      }
      e.x += (W / 2 + Math.sin(w.time * 0.33) * (110 + e.phase * 25) - e.x) * Math.min(1, dt * 2);
      e.t0 -= dt;
      if (e.t0 <= 0) {
        e.t0 = [4.5, 3.8, 3.2][e.phase] ?? 3.2;
        volley(w, e.x, e.y + e.r, 3 + e.phase, 120, 8, '#9d4dff');
      }
      if (e.phase >= 1) {
        e.t1 -= dt;
        if (e.t1 <= 0) {
          e.t1 = e.phase >= 2 ? 6 : 8;
          w.addZone('stasis', w.rng.range(90, W - 90), w.rng.range(340, 600), 62, 6, 0);
          for (const off of [-90, 90]) w.spawnEnemy('phantom', e.x + off, e.y + 40);
        }
      }
      if (e.phase >= 2) {
        e.t2 -= dt;
        if (e.t2 <= 1.2 && e.t2 + dt > 1.2) {
          w.emit({ t: 'ring', x: e.x, y: e.y, r: 90, color: '#c9a2ff', dur: 1.2 });
          w.emit({ t: 'sfx', name: 'warning', vol: 0.4 });
        }
        if (e.t2 <= 0) {
          e.t2 = 9;
          w.timeStop = 1;
          w.banner(t('fx.timeStop'), '#c9a2ff');
          w.emit({ t: 'flash', color: '#e0ccff', a: 0.3 });
          w.emit({ t: 'sfx', name: 'timestop' });
        }
      }
    },
    onDeath(w) {
      for (const p of w.enemies) {
        if (!p.alive || p.def.id !== 'void_shard') continue;
        p.alive = false;
        w.emit({ t: 'kill', x: p.x, y: p.y, r: p.r, color: p.def.color, big: false });
      }
    },
  },
};

/** Colossus: each second only this share of its max HP gets through at full strength... */
export const COLOSSUS_CAP = 0.035;
/** ...and only this fraction of anything beyond it. */
export const COLOSSUS_SPILL = 0.15;
/** Seconds a fallen twin waits for its partner before rising again. */
export const TWIN_REVIVE = 9;
/** Damage each twin takes while its partner still stands. */
export const TWIN_BOND = 0.6;
/** Overmind damage reduction per mind on the field, and its ceiling. */
export const OVERMIND_WARD_PER = 0.05;
export const OVERMIND_WARD_MAX = 0.75;
/** Void Sovereign: health fractions where it seals itself, and the shards that hold the seal. */
export const SOVEREIGN_SEALS = [0.7, 0.35];
export const SOVEREIGN_SHARDS: [number, number][] = [[110, 360], [270, 440], [430, 360]];
const SOVEREIGN_SHARD_HP = 1.5;
/** Damage taken by a sealed Sovereign. */
export const SOVEREIGN_SEALED = 0.1;

/** Health the Sovereign cannot be pushed below until its next seal has been raised. */
export function sovereignFloor(e: Enemy): number {
  return e.gen < SOVEREIGN_SEALS.length ? e.maxHp * SOVEREIGN_SEALS[e.gen] : 0;
}

/** Enemies that count toward the Overmind's psionic ward. */
export function overmindMinds(w: World): number {
  let n = 0;
  for (const o of w.enemies) if (o.alive && !o.boss && o.def.ai !== 'golden' && o.def.ai !== 'pylon') n++;
  return n;
}

/** Boss damage rules, applied after armor and before shields (combat.damageEnemy). */
export function bossMitigation(e: Enemy, amount: number): number {
  switch (e.def.id) {
    // The Architect hides behind its ward pylons.
    case 'boss_architect': return e.t3 > 0 ? amount * 0.25 : amount;
    case 'boss_colossus': {
      const free = Math.min(amount, Math.max(0, e.t3));
      e.t3 -= free;
      return free + (amount - free) * COLOSSUS_SPILL;
    }
    // While both twins stand, the bond spreads the blow (t1 counts down only once a partner has fallen).
    case 'boss_sol':
    case 'boss_luna': return e.t1 > 0 ? amount : amount * TWIN_BOND;
    case 'boss_overmind': return amount * (1 - e.t3);
    case 'boss_sovereign': {
      const dealt = e.t3 > 0 ? amount * SOVEREIGN_SEALED : amount;
      return Math.min(dealt, Math.max(0, e.hp - sovereignFloor(e)));
    }
    default: return amount;
  }
}

function twinScript(partner: string, fire: boolean): BossScript {
  return {
    init(w, e) {
      e.t0 = fire ? 3 : 4.5; // volley timer
      e.t1 = 0; // partner revive countdown
      e.t2 = fire ? 0 : Math.PI; // orbit angle
      e.gen = 0; // fallen partner's max HP
      e.t3 = fire ? 6 : 5; // special timer: Sol's flare, Luna's stasis
      // The fight opens with Sol alone on the spawn: Luna arrives beside it with the same strength.
      if (!w.enemies.some((o) => o.alive && o.def.id === partner)) {
        const c = w.spawnEnemy(partner, W - e.x, e.y, { hpMult: e.maxHp / ENEMY_MAP[partner].hp });
        if (c) {
          c.maxHp = c.hp = e.maxHp;
          BOSS_SCRIPTS[partner].init(w, c);
          c.t2 = e.t2 + Math.PI;
        }
      }
    },
    update(w, e, dt) {
      const was = e.phase;
      enrage(w, e, fire ? t('fx.solEnrage') : t('fx.lunaEnrage'));
      if (e.phase && !was) e.t0 = Math.min(e.t0, 1);
      e.t2 += dt * (e.phase ? 0.85 : 0.5);
      e.x = W / 2 + Math.cos(e.t2) * 150;
      const ty = 225 + Math.sin(e.t2) * 45;
      e.y = e.y < ty ? Math.min(ty, e.y + 90 * dt) : ty;
      e.t0 -= dt;
      if (e.t0 <= 0) {
        e.t0 = e.phase ? 2.8 : 4;
        volley(w, e.x, e.y + e.r, fire ? 3 : 2, fire ? 125 : 105, 7, e.def.color);
      }
      e.t3 -= dt;
      if (e.t3 <= 0) {
        e.t3 = e.phase ? 5 : 7;
        if (fire) {
          // Solar flare: a fan of fast bolts aimed straight down.
          for (let i = -2; i <= 2; i++) w.spawnProjectile(e.x, e.y + e.r, i * 26, 150, 6, '#ffb347', 7);
          w.emit({ t: 'flash', color: '#ffd9a0', a: 0.15 });
        } else {
          w.addZone('stasis', w.rng.range(90, W - 90), w.rng.range(340, 600), 60, 5.5, 0);
        }
      }
      if (e.t1 > 0) {
        e.t1 -= dt;
        if (e.t1 <= 0) {
          const def = ENEMY_MAP[partner];
          const c = w.spawnEnemy(partner, W - e.x, e.y);
          if (!c) {
            e.t1 = 0.25; // the field is full: try again shortly
          } else {
            c.maxHp = e.gen;
            c.hp = c.maxHp * 0.5;
            c.spawnT = 0.3;
            BOSS_SCRIPTS[partner].init(w, c);
            c.t2 = e.t2 + Math.PI;
            c.phase = 1;
            w.banner(t('fx.twinRises', { name: def.name.toUpperCase() }), def.color);
            w.emit({ t: 'sfx', name: 'boss' });
          }
        }
      }
    },
    onDeath(w, e) {
      const other = w.enemies.find((o) => o.alive && o.def.id === partner);
      if (!other) return;
      other.t1 = TWIN_REVIVE;
      other.gen = e.maxHp;
      other.phase = 1;
      w.banner(t('fx.twinFallen', { name: e.def.name.toUpperCase() }), e.def.color, t('fx.twinFallenSub', { n: TWIN_REVIVE }));
    },
  };
}

function spawnPylons(w: World, e: Enemy): void {
  for (let i = 0; i < 3; i++) {
    const a = e.t2 + (i * Math.PI * 2) / 3;
    const p = w.spawnEnemy('ward_pylon', e.x + Math.cos(a) * PYLON_ORBIT, e.y + Math.sin(a) * PYLON_ORBIT * 0.75, { hpMult: Math.max(1, e.maxHp / e.def.hp) * 0.35 });
    if (p) p.spawnT = 0.2;
  }
  e.t3 = 3;
}

export const BOSS_SPAWN_Y = FIELD_TOP - 60;
