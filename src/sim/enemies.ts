import { clamp } from '../core/math';
import { damageEnemy, flushDamageNumber } from './combat';
import { DEFENSE_Y, FIELD_TOP, W, type Enemy } from './types';
import type { World } from './world';

export function updateEnemy(w: World, e: Enemy, dt: number): void {
  e.spawnT += dt;
  e.flash = Math.max(0, e.flash - dt);
  e.wobble += dt;
  const st = e.st;
  st.reactCd = Math.max(0, st.reactCd - dt);

  // ---- statuses (burn and bleed ignore armor)
  if (st.burnT > 0) {
    st.burnT -= dt;
    st.burnTick -= dt;
    if (st.burnTick <= 0) {
      st.burnTick = 0.5;
      let d = st.burnDps * 0.5;
      let crit = false;
      if (w.build.has('burn_crit') && w.rng.chance(w.build.stats.critChance)) {
        d *= w.build.stats.critMult;
        crit = true;
      }
      damageEnemy(w, e, d, { src: 'burn', crit, depth: 2 });
      if (!e.alive) return;
      // burning enemies ignite oil they walk over
      for (const o of w.obstacles) {
        if (o.kind === 'oil' && o.burning <= 0 && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < o.r * o.r) {
          o.burning = 5;
          w.emit({ t: 'sfx', name: 'ignite' });
        }
      }
    }
    if (st.burnT <= 0) st.burnDps = 0;
  }
  if (st.bleed > 0) {
    st.bleedT -= dt;
    st.bleedTick -= dt;
    if (st.bleedTick <= 0) {
      st.bleedTick = 0.5;
      damageEnemy(w, e, st.bleed * st.bleedDps * 0.5, { src: 'bleed', crit: false, depth: 2 });
      if (!e.alive) return;
    }
    if (st.bleedT <= 0) {
      st.bleed = 0;
      st.bleedDps = 0;
    }
  }
  if (st.chill > 0) {
    st.chillT -= dt;
    if (st.chillT <= 0) st.chill = 0;
  }
  if (st.frozenT > 0) st.frozenT -= dt;

  // ---- damage number aggregation (keeps the screen readable)
  if (e.dmgAcc > 0) {
    e.dmgAccT += dt;
    if (e.dmgAccT > 0.14) flushDamageNumber(w, e);
  }

  if (e.elite.includes('regen')) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.04 * dt);

  // ---- knockback integration
  e.x += e.kx * dt;
  e.y += e.ky * dt;
  const damp = Math.exp(-dt * 6);
  e.kx *= damp;
  e.ky *= damp;

  if (e.boss) return; // bosses move via their scripts

  // ---- movement / AI
  const frozen = st.frozenT > 0;
  const slow = frozen ? 0 : Math.max(0.25, 1 - st.chill * 0.2);
  const sp = e.speed * w.enemySpeedMult * slow * (e.spawnT < 0.6 ? 1.6 : 1);
  let vx = 0;
  const vy = sp;
  switch (e.def.ai) {
    case 'runner':
      vx = Math.sin(e.wobble * 3) * sp * 1.1;
      break;
    case 'walker':
    case 'minion':
      vx = Math.sin(e.wobble * 0.9) * 8;
      break;
    case 'healer': {
      e.t0 -= dt;
      if (e.t0 <= 0 && !frozen) {
        e.t0 = 1.6;
        let healed = false;
        for (const o of w.enemies) {
          if (o !== e && o.alive && !o.boss && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 100 * 100 && o.hp < o.maxHp) {
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.12);
            healed = true;
          }
        }
        if (healed) w.emit({ t: 'ring', x: e.x, y: e.y, r: 100, color: '#6dffcf', dur: 0.5 });
      }
      break;
    }
    case 'spawner': {
      e.t0 -= dt;
      if (e.t0 <= 0 && !frozen && e.y > FIELD_TOP) {
        e.t0 = 4.2;
        const s = w.spawnEnemy('swarmling', e.x, e.y + e.r);
        if (s) s.kx = w.rng.range(-120, 120);
      }
      break;
    }
    case 'teleporter': {
      // blink shortly after being hurt
      if (e.t1 === 0) e.t1 = e.hp;
      if (e.hp < e.t1 && e.t0 === 0) e.t0 = 0.25;
      if (e.t0 > 0) {
        e.t0 -= dt;
        if (e.t0 <= 0 && !frozen) {
          w.emit({ t: 'burst', x: e.x, y: e.y, color: e.def.color, n: 10, speed: 160 });
          e.x = clamp(e.x + w.rng.range(-140, 140), 30, W - 30);
          e.y = clamp(e.y + w.rng.range(-30, 70), FIELD_TOP + 20, DEFENSE_Y - 60);
          e.t1 = e.hp; // re-arm: blink again on the next hit
          e.t0 = 0;
          w.emit({ t: 'sfx', name: 'blink', vol: 0.4 });
          w.emit({ t: 'burst', x: e.x, y: e.y, color: e.def.color, n: 10, speed: 160 });
        }
      }
      break;
    }
    case 'golden': {
      // floats around the middle, then escapes upward
      e.t0 += dt;
      vx = Math.sin(e.wobble * 2) * 90;
      e.x = clamp(e.x + vx * dt, 20, W - 20);
      e.y += (e.t0 < 7 ? Math.sin(e.wobble) * 30 : -80) * dt;
      if (e.y < FIELD_TOP - 30) {
        e.alive = false;
        w.emit({ t: 'text', x: e.x, y: FIELD_TOP + 20, text: 'ESCAPED', color: '#ffd84a' });
      }
      return;
    }
    default:
      break;
  }
  e.x += vx * dt;
  e.y += vy * dt;
  e.x = clamp(e.x, e.r, W - e.r);
  if (e.y < FIELD_TOP - 60) e.y = FIELD_TOP - 60;

  // ---- reaching the defense line
  if (e.y + e.r * 0.4 >= DEFENSE_Y) {
    e.alive = false;
    const dmg = e.def.damage * (e.elite.length ? 1.6 : 1) * (1 + w.time / 600);
    w.emit({ t: 'explosion', x: e.x, y: DEFENSE_Y, r: e.r + 10, color: '#ff3b3b' });
    if (e.def.deathBlast) w.emit({ t: 'explosion', x: e.x, y: DEFENSE_Y, r: 60, color: '#ff3b3b' });
    w.hurt(dmg, e.x);
  }
}
