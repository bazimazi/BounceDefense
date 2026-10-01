import { applyBleed, applyChill, chainLightning, damageEnemy, explode, nearestEnemy, sparkNearest, type HitInfo } from './combat';
import { FIELD_TOP, type Ball, type Enemy } from './types';
import type { World } from './world';

/**
 * Behaviors are composable hooks granted by upgrades, parts, cores, synergies and
 * evolutions. Adding a new mechanic = adding an entry here + referencing its id
 * from data. The combat engine never needs to know about specific upgrades.
 */
export interface Behavior {
  onHit?(w: World, b: Ball, e: Enemy, crit: boolean, dmg: number, power: number): void;
  onWall?(w: World, b: Ball, power: number): void;
  onKill?(w: World, e: Enemy, info: HitInfo, power: number): void;
  onBallTick?(w: World, b: Ball, dt: number, power: number): void;
  onLaunch?(w: World, b: Ball, power: number): void;
  /** Return true if the floor contact was fully handled (ball keeps flying). */
  onFloor?(w: World, b: Ball, power: number): boolean | void;
  onTick?(w: World, dt: number, power: number): void;
}

const cooldowns = new WeakMap<Ball, Record<string, number>>();
function ready(w: World, b: Ball, key: string, cd: number): boolean {
  let c = cooldowns.get(b);
  if (!c) cooldowns.set(b, (c = {}));
  if ((c[key] ?? -1) > w.time) return false;
  c[key] = w.time + cd;
  return true;
}

export const BEHAVIORS: Record<string, Behavior> = {
  talent_banked_power: {
    onWall(w, b) {
      if (b.kind !== 'main' || w.surge.active > 0 || w.time < w.talentBankReadyAt) return;
      w.talentBankReadyAt = w.time + 2;
      w.surge.charge = Math.min(w.surge.max, w.surge.charge + 4);
    },
  },
  static_charge: {
    onHit(w, _b, e, _crit, _dmg, power) {
      w.staticCounter++;
      const n = [8, 8, 6, 4][Math.min(3, power)];
      if (w.staticCounter % n === 0) {
        const st = w.build.stats;
        chainLightning(w, e, st.damage * st.chainDamage * st.elementPower * 1.2, st.chainCount + 1, 1);
      }
    },
  },

  ricochet_storm: {
    onWall(w, b) {
      if (b.wallBounces % 4 === 0) sparkNearest(w, b.x, b.y, w.build.stats.damage * 0.9, '#8fa8ff');
    },
  },

  kinetic_lens: {
    onHit(_w, b, _e, crit) {
      if (crit && b.wallBounces >= 3) b.pierceLeft = Math.max(1, b.pierceLeft);
    },
  },

  blood_harvest: {
    onKill(w, e) {
      if (e.st.bleed > 0) w.heal(2, false);
    },
  },

  void_core: {
    onFloor(w, b) {
      if (b.phased || b.kind !== 'main') return false;
      b.phased = true;
      w.emit({ t: 'ring', x: b.x, y: b.y, r: 30, color: '#c77dff' });
      b.y = FIELD_TOP + b.r + 6;
      b.dy = Math.abs(b.dy);
      b.trail.length = 0;
      w.emit({ t: 'ring', x: b.x, y: b.y, r: 30, color: '#c77dff' });
      w.emit({ t: 'sfx', name: 'portal' });
      if (w.build.has('event_horizon')) {
        const range = 150 + 30 * w.build.power('event_horizon');
        for (const e of w.enemies) {
          if (!e.alive || e.boss) continue;
          const dx = b.x - e.x;
          const dy = b.y + 120 - e.y;
          if (dx * dx + dy * dy < range * range) {
            e.kx += dx * 2.2;
            e.ky += dy * 0.8;
          }
        }
        w.emit({ t: 'ring', x: b.x, y: b.y + 120, r: range, color: '#c77dff' });
      }
      return true;
    },
  },

  // ---------------------------------------------------------------- evolutions
  evo_inferno: {
    onHit(w, b, e, _crit, dmg) {
      if (!ready(w, b, 'inferno', 0.1)) return;
      explode(w, e.x, e.y, 62 * w.build.stats.area, dmg * 0.55, 1, { burn: true, color: '#ff6a2a' });
    },
    onBallTick(w, b) {
      if (!ready(w, b, 'trail', 0.16)) return;
      const st = w.build.stats;
      w.addZone('fire', b.x, b.y, 24, 1.4, st.damage * 0.7 * st.elementPower);
    },
  },

  evo_tesla: {
    onBallTick(w, b) {
      if (!ready(w, b, 'arc', 0.32)) return;
      const st = w.build.stats;
      const hit: number[] = [];
      for (let i = 0; i < 2; i++) {
        const t = nearestEnemy(w, b.x, b.y, 160, undefined, hit);
        if (!t) break;
        hit.push(t.id);
        w.emit({ t: 'lightning', pts: [b.x, b.y, t.x, t.y], color: '#8ff4ff' });
        damageEnemy(w, t, st.damage * 0.7 * st.elementPower, { src: 'chain', crit: false, depth: 1 });
      }
      if (hit.length) w.emit({ t: 'sfx', name: 'zap', vol: 0.25 });
    },
  },

  evo_glacier: {
    onWall(w, b) {
      if (!ready(w, b, 'nova', 0.2)) return;
      for (const e of w.enemies) {
        if (e.alive && (e.x - b.x) ** 2 + (e.y - b.y) ** 2 < 95 * 95) applyChill(w, e, 2, 1);
      }
      w.emit({ t: 'ring', x: b.x, y: b.y, r: 95, color: '#9fdcff', dur: 0.35 });
    },
    onKill(w, e) {
      if (e.st.frozenT <= 0) return;
      const st = w.build.stats;
      for (const o of w.enemies) {
        if (o !== e && o.alive && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 85 * 85) {
          damageEnemy(w, o, st.damage, { src: 'shatter', crit: false, depth: 3 });
          applyChill(w, o, 1, 3);
        }
      }
      w.emit({ t: 'burst', x: e.x, y: e.y, color: '#cfefff', n: 16, speed: 280, size: 3 });
    },
  },

  evo_blood: {
    onKill(w, e) {
      if (e.st.bleed <= 0) return;
      for (const o of w.enemies) {
        if (o !== e && o.alive && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 95 * 95) applyBleed(w, o, e.st.bleedDps, 3);
      }
      w.heal(1.5, false);
      w.emit({ t: 'burst', x: e.x, y: e.y, color: '#ff2a55', n: 14, speed: 200 });
    },
  },

  evo_hydra: {
    onHit(w, b) {
      if (b.firstHitDone || b.kind !== 'main') return;
      b.firstHitDone = true;
      const base = Math.atan2(b.dy, b.dx);
      for (const off of [-0.55, 0.55]) {
        const c = w.spawnBall('clone', b.x, b.y, Math.cos(base + off), Math.sin(base + off), b);
        if (c) {
          c.dmgMult = 0.9;
          c.life = 9;
          c.splitGen = 2;
        }
      }
      w.emit({ t: 'ring', x: b.x, y: b.y, r: 40, color: '#7dff8a' });
    },
  },

  evo_railgun: {
    onBallTick(w, b) {
      if (!ready(w, b, 'beam', 0.05)) return;
      const n = b.trail.length;
      if (n >= 4) w.emit({ t: 'beam', x0: b.trail[n - 4], y0: b.trail[n - 3], x1: b.x, y1: b.y, color: '#e2d3ff' });
    },
  },
};
