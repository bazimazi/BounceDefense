import {
  applyBleed, applyChill, applyPoison, chainLightning, damageEnemy, densest, explode, meteor, nearestEnemy, randomElement,
  shardAt, sparkNearest, type HitInfo,
} from './combat';
import { phaseExitX, phaseY } from './physics';
import { DEFENSE_Y, type Ball, type Enemy, type Segment } from './types';
import type { World } from './world';

/**
 * Behaviors are composable hooks granted by upgrades, parts, cores, synergies and
 * evolutions. Adding a new mechanic = adding an entry here + referencing its id
 * from data. The combat engine never needs to know about specific upgrades.
 */
export interface Behavior {
  onHit?(w: World, b: Ball, e: Enemy, crit: boolean, dmg: number, power: number): void;
  onWall?(w: World, b: Ball, power: number, kind: Segment['kind'] | 'bumper' | 'crate' | 'pylon'): void;
  /** An enemy reached the defense line. */
  onBreach?(w: World, e: Enemy, power: number): void;
  onKill?(w: World, e: Enemy, info: HitInfo, power: number): void;
  onBallTick?(w: World, b: Ball, dt: number, power: number): void;
  onLaunch?(w: World, b: Ball, power: number): void;
  /** Return true if the floor contact was fully handled (ball keeps flying). */
  onFloor?(w: World, b: Ball, power: number): boolean | void;
  onTick?(w: World, dt: number, power: number): void;
}

const cooldowns = new WeakMap<object, Record<string, number>>();
function ready(w: World, b: object, key: string, cd: number): boolean {
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
      b.x = phaseExitX(w, b.x, b.r);
      b.y = phaseY(b.r);
      b.dy = Math.abs(b.dy);
      b.anchorX = b.x;
      b.anchorY = b.y;
      b.stuckT = 0;
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
  },  // ---------------------------------------------------------------- poison
  miasma: {
    onKill(w, e, _info, power) {
      if (e.st.poison <= 0) return;
      const st = w.build.stats;
      w.addZone('toxic', e.x, e.y, 46 + 14 * power, 2.5 + power, Math.max(e.st.poisonDps, st.damage * st.poisonPower));
    },
  },
  pandemic: {},
  evo_plague: {
    onHit(w, _b, e, _crit, dmg) {
      const st = w.build.stats;
      applyPoison(w, e, dmg * st.poisonPower * st.elementPower, 2, 1);
    },
    onKill(w, e) {
      if (e.st.poison <= 0) return;
      w.addZone('toxic', e.x, e.y, 58, 3, Math.max(e.st.poisonDps, w.build.stats.damage * w.build.stats.poisonPower));
    },
  },
  venom_core: {},

  // ---------------------------------------------------------------- tactics
  vortex: {
    onHit(w, _b, e, _crit, _dmg, power) {
      w.vortexCounter++;
      const n = [6, 6, 5, 4][Math.min(3, power)];
      if (w.vortexCounter % n !== 0) return;
      w.addZone('vortex', e.x, e.y, 95, 1.5, w.build.stats.damage * 1.6);
    },
  },
  thunderclap: {
    onWall(w, b, power) {
      if (!ready(w, b, 'clap', 0.25)) return;
      const st = w.build.stats;
      const dmg = st.damage * [0, 0.5, 0.7, 0.9][Math.min(3, power)];
      explode(w, b.x, b.y, 70 * st.area, dmg, 1, { src: 'quake', color: '#b8c8ff' });
      if (w.build.has('storm_front') && w.rng.chance(0.35)) {
        const tgt = nearestEnemy(w, b.x, b.y, 200);
        if (tgt) chainLightning(w, tgt, st.damage * st.chainDamage * st.elementPower, st.chainCount, 2);
      }
    },
  },
  quick_recall: {},
  mine_layer: {
    onWall(w, b, power) {
      if (b.kind !== 'main' && b.kind !== 'clone') return;
      const evo = w.build.has('evo_minefield');
      if (!evo && b.wallBounces % 3 !== 0) return;
      if (!ready(w, b, 'mine', evo ? 0.15 : 0.3)) return;
      const cap = (2 + 2 * power) * (evo ? 2 : 1);
      let mines = 0;
      for (const z of w.zones) if (z.kind === 'mine' && z.alive) mines++;
      if (mines >= cap) return;
      const st = w.build.stats;
      w.addZone('mine', b.x, Math.min(b.y, DEFENSE_Y - 30), 22, 20, st.damage * 2.2 * st.explosionDamage / 0.7);
      w.emit({ t: 'sfx', name: 'mine', vol: 0.4 });
    },
  },
  evo_minefield: {},
  refraction: {
    onHit(w, b, e, crit, _dmg, power) {
      if (!crit || b.splitGen >= 2 || !w.rng.chance(0.25 * power)) return;
      shardAt(w, b, e.x, e.y, e, 1);
    },
  },
  cold_snap: {},
  storm_surge: {},
  chrono_shot: {
    onLaunch(w, b, power) {
      if (!b.powered) return;
      for (const e of w.enemies) if (e.alive && !e.phased) applyChill(w, e, power, 2);
      w.emit({ t: 'ring', x: b.x, y: b.y, r: 520, color: '#bfe9ff', dur: 0.6 });
      w.emit({ t: 'sfx', name: 'freeze' });
    },
  },
  pinball: {
    onWall(w, b, _power, kind) {
      if (kind === 'wall' || kind === 'deflector') return;
      b.momentum += 2 * w.build.stats.momentumGain;
      if (ready(w, b, 'pinball', 0.12)) sparkNearest(w, b.x, b.y, w.build.stats.damage * 0.8, '#ffe38a');
    },
  },

  // ---------------------------------------------------------------- core signatures & cores
  earthshaker: {
    onHit(w, b, e, _crit, dmg, power) {
      if (!(e.boss || e.armor >= 3) || !ready(w, b, 'quake', 0.2)) return;
      explode(w, e.x, e.y, (60 + 15 * power) * w.build.stats.area, dmg * 0.5, 2, { src: 'quake', color: '#e0b080' });
    },
  },
  mirror_image: {},
  stasis_field: {
    onLaunch(w, b) {
      if (!b.powered) return;
      for (const e of w.enemies) {
        if (!e.alive || e.phased) continue;
        e.st.frozenT = Math.max(e.st.frozenT, e.boss ? 0.3 : 0.9);
      }
      w.emit({ t: 'flash', color: '#ffe9b0', a: 0.25 });
      w.emit({ t: 'sfx', name: 'timestop' });
    },
  },
  gemini_core: {
    onLaunch(w, b) {
      if (b.kind !== 'main') return;
      const a = Math.atan2(b.dy, b.dx) + (w.rng.chance(0.5) ? 0.09 : -0.09);
      const c = w.spawnBall('clone', b.x, b.y, Math.cos(a), Math.sin(a));
      if (!c) return;
      const mirror = w.build.has('mirror_image');
      c.dmgMult = mirror ? 0.8 : 0.45;
      if (mirror) c.pierceLeft += 1;
      c.powered = b.powered;
      c.life = 9;
    },
  },
  chrono_core: {
    onBallTick(w, b) {
      if (!ready(w, b, 'dilate', 0.1)) return;
      w.grid.query(b.x, b.y, 120, w.q2);
      for (const e of w.q2) e.slowT = 0.35;
    },
  },
  impact_gravity: {
    onHit(w, b, e) {
      if (!ready(w, b, 'gravity', 0.1)) return;
      w.grid.query(e.x, e.y, 120, w.q2);
      for (const o of w.q2) {
        if (o === e || !o.alive || o.boss || o.def.ai === 'charger' || o.def.ai === 'pylon') continue;
        o.kx += (e.x - o.x) * 2;
        o.ky += (e.y - o.y) * 1.2;
      }
    },
  },

  // ---------------------------------------------------------------- synergies (most act inline in combat)
  toxic_shrapnel: {},
  corrosion: {},
  venom_leech: {},
  snipers_nest: {},
  storm_front: {},
  implosion: {},
  cold_blood: {},
  bounty_board: {},
  last_line: {},
  primal_chaos: {},
  perfect_storm: {
    onWall(w, b) {
      if (!w.rng.chance(0.2) || !ready(w, b, 'storm', 0.2)) return;
      const tgt = nearestEnemy(w, b.x, b.y, 240);
      if (!tgt) return;
      const st = w.build.stats;
      w.emit({ t: 'lightning', pts: [b.x, b.y, tgt.x, tgt.y], color: '#8ff4ff' });
      chainLightning(w, tgt, st.damage * st.chainDamage * st.elementPower, st.chainCount, 1);
    },
  },
  apocalypse: {
    onKill(w) {
      if (w.run.kills % 15 !== 0) return;
      const tgt = densest(w);
      if (tgt) meteor(w, tgt.x, tgt.y, w.build.stats.damage * 3, 2);
    },
  },

  // ---------------------------------------------------------------- evolutions
  evo_singularity: {
    onBallTick(w, b) {
      if (!ready(w, b, 'singularity', 0.2)) return;
      const st = w.build.stats;
      w.grid.query(b.x, b.y, 150, w.q2);
      for (const e of [...w.q2]) {
        if (!e.alive) continue;
        const dx = b.x - e.x;
        const dy = b.y - e.y;
        const d2 = dx * dx + dy * dy;
        if (!e.boss && e.def.ai !== 'charger' && e.def.ai !== 'pylon') {
          e.kx += dx * 1.6;
          e.ky += dy * 1.2;
        }
        if (d2 < 55 * 55) damageEnemy(w, e, st.damage * 0.45, { src: 'quake', crit: false, depth: 2 });
      }
      if (w.rng.chance(0.3)) w.emit({ t: 'ring', x: b.x, y: b.y, r: 60, color: '#b48cff', dur: 0.3 });
    },
  },
  evo_thunderhead: {
    onWall(w, b) {
      if (!ready(w, b, 'thunderhead', 0.3)) return;
      const st = w.build.stats;
      const targets = w.enemies.filter((e) => e.alive && !e.phased).sort((a, c) => c.y - a.y).slice(0, 2);
      for (const e of targets) {
        w.emit({ t: 'lightning', pts: [e.x + 20, 96, e.x - 10, (96 + e.y) / 2, e.x, e.y], color: '#cfe0ff' });
        damageEnemy(w, e, st.damage * 1.3 * st.elementPower, { src: 'chain', crit: false, depth: 1 });
      }
      if (targets.length) w.emit({ t: 'sfx', name: 'zap', vol: 0.5 });
    },
  },
  evo_reaper: {},
  evo_aegis: {},
  evo_prism: {
    onHit(w, b, e, crit, dmg) {
      if (!crit || b.splitGen >= 2 || !ready(w, b, 'prism', 0.08)) return;
      const base = Math.atan2(b.dy, b.dx);
      for (const off of [-0.6, 0, 0.6]) {
        const s = w.spawnBall('shard', b.x, b.y, Math.cos(base + off), Math.sin(base + off), b);
        if (s) {
          s.splitGen = 2;
          s.life = 5;
          s.prism = true;
        }
      }
      if (e.alive) randomElement(w, e, dmg, 1);
    },
  },

  // ---------------------------------------------------------------- relics (several act inline in World and combat)
  relic_war_drum: {},
  relic_berserker: {},
  relic_cursed_crown: {},
  relic_star_compass: {},
  relic_chaos_die: {},
  relic_phoenix: {},
  relic_soul_lantern: {
    onKill(w) {
      if (w.run.kills % 20 !== 0 || w.lanternStacks >= 40) return;
      w.lanternStacks++;
      w.onBuildChanged(w.build.addBaseMods([{ stat: 'damage', mult: 0.01 }]));
    },
  },
  relic_meteor: {
    onHit(w, b, e, _crit, dmg) {
      if (!b.powered || b.kind !== 'main' || b.meteorDone) return;
      b.meteorDone = true;
      meteor(w, e.x, e.y, dmg * 3, 1);
    },
  },
  relic_thorns: {
    onBreach(w, e) {
      if (!ready(w, w, 'thorns', 0.4)) return;
      const st = w.build.stats;
      for (const o of [...w.enemies]) {
        if (!o.alive || o === e || o.y < DEFENSE_Y - 140) continue;
        damageEnemy(w, o, st.damage * 2.5, { src: 'quake', crit: false, depth: 1 });
      }
      w.emit({ t: 'ring', x: e.x, y: DEFENSE_Y, r: 140, color: '#7dff8a', dur: 0.5 });
    },
  },
  relic_chalice: {
    onKill(w) {
      w.heal(0.3);
    },
  },
  talent_cascade: {
    onKill(w, e, info) {
      if (w.run.kills % 25 !== 0 || info.src === 'quake') return;
      explode(w, e.x, e.y, 80 * w.build.stats.area, w.build.stats.damage * 1.1, 2, { src: 'quake', color: '#ff8a6b' });
    },
  },
  // ---- Apex capstones of the deep talent tiers.
  talent_perpetual: {
    onWall(w, b) {
      if (b.kind !== 'main' || b.wallBounces === 0 || b.wallBounces % 5 !== 0) return;
      shardAt(w, b, b.x, b.y, null, 1 / Math.max(0.01, w.build.stats.shardPower));
    },
  },
  talent_storm: {
    onKill(w, e, info) {
      const st = e.st;
      const statuses = Number(st.burnT > 0) + Number(st.chill > 0 || st.frozenT > 0) + Number(st.bleed > 0) + Number(st.poison > 0);
      if (statuses < 2 || info.depth >= 3 || !ready(w, w, 'storm', 0.15)) return;
      const s = w.build.stats;
      explode(w, e.x, e.y, 70 * s.area, s.damage * 1.2 * s.elementPower, info.depth + 1, { src: 'quake', color: '#c49bff' });
    },
  },
  talent_armageddon: {
    onKill(w) {
      if (w.run.kills % 15 !== 0) return;
      const target = densest(w);
      if (target) meteor(w, target.x, target.y, w.build.stats.damage * 2.5, 2);
    },
  },
};

