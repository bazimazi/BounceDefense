import { t } from '../i18n';
import { TAU } from '../core/math';
import { DEFENSE_Y, FIELD_TOP, W, type Enemy } from './types';
import { clamp } from '../core/math';
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
      const pylons = w.enemies.filter((o) => o.alive && o.def.ai === 'pylon');
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
        if (!p.alive || p.def.ai !== 'pylon') continue;
        p.alive = false;
        w.emit({ t: 'kill', x: p.x, y: p.y, r: p.r, color: p.def.color, big: false });
      }
    },
  },
};

function spawnPylons(w: World, e: Enemy): void {
  for (let i = 0; i < 3; i++) {
    const a = e.t2 + (i * Math.PI * 2) / 3;
    const p = w.spawnEnemy('ward_pylon', e.x + Math.cos(a) * PYLON_ORBIT, e.y + Math.sin(a) * PYLON_ORBIT * 0.75, { hpMult: Math.max(1, e.maxHp / e.def.hp) * 0.35 });
    if (p) p.spawnT = 0.2;
  }
  e.t3 = 3;
}

export const BOSS_SPAWN_Y = FIELD_TOP - 60;
