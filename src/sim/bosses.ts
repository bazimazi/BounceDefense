import { TAU } from '../core/math';
import { DEFENSE_Y, FIELD_TOP, W, type Enemy } from './types';
import type { World } from './world';

/** Boss scripts change the rules of the arena instead of just being HP sponges. */
export interface BossScript {
  init(w: World, e: Enemy): void;
  update(w: World, e: Enemy, dt: number): void;
  onDeath?(w: World, e: Enemy): void;
}

function enrage(w: World, e: Enemy, text: string): void {
  if (e.phase === 0 && e.hp < e.maxHp * 0.5) {
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
      enrage(w, e, 'THE FORTRESS HARDENS');
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
      enrage(w, e, 'THE MAGNETAR COLLAPSES');
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
      w.banner('THE HYDRA SPLITS', '#5dffa0');
      w.emit({ t: 'sfx', name: 'boss' });
    },
  },
};

export const BOSS_SPAWN_Y = FIELD_TOP - 60;
