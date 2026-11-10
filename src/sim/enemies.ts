import { t } from '../i18n';
import { clamp } from '../core/math';
import { damageEnemy, flushDamageNumber, nearestEnemy } from './combat';
import { DEFENSE_Y, FIELD_TOP, W, type Enemy } from './types';
import type { World } from './world';

/** Phantoms (and Phasing elites) spend this long out of phase in every cycle. */
const PHASE_CYCLE = 3.6;
const PHASE_OUT = 1.3;

export function updateEnemy(w: World, e: Enemy, dt: number): void {
  e.spawnT += dt;
  e.flash = Math.max(0, e.flash - dt);
  e.wobble += dt;
  const st = e.st;
  st.reactCd = Math.max(0, st.reactCd - dt);
  if (e.slowT > 0) e.slowT -= dt;
  if (st.stunT > 0) st.stunT -= dt;

  // ---- statuses (burn, bleed and poison ignore armor)
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
  if (st.poison > 0) {
    st.poisonT -= dt;
    st.poisonTick -= dt;
    if (st.poisonTick <= 0) {
      st.poisonTick = 0.5;
      damageEnemy(w, e, st.poison * st.poisonDps * 0.5, { src: 'poison', crit: false, depth: 2 });
      if (!e.alive) return;
      // Pandemic: a stack may jump to a neighbour on every tick.
      if (w.build.has('pandemic') && w.rng.chance(0.15 * w.build.power('pandemic'))) {
        const o = nearestEnemy(w, e.x, e.y, 90, e);
        if (o && !o.def.immune?.includes('poison') && o.shieldHp <= 0) {
          o.st.poison = Math.min(w.build.stats.poisonCap, o.st.poison + 1);
          o.st.poisonT = 5;
          o.st.poisonDps = Math.max(o.st.poisonDps, st.poisonDps);
        }
      }
    }
    if (st.poisonT <= 0) {
      st.poison = 0;
      st.poisonDps = 0;
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

  // ---- phasing (Phantom, Phasing elites): balls, chains and blasts pass through
  if (e.def.ai === 'phantom' || e.elite.includes('phasing')) {
    const cyc = (e.wobble + e.id * 0.37) % PHASE_CYCLE;
    const was = e.phased;
    e.phased = cyc > PHASE_CYCLE - PHASE_OUT && st.frozenT <= 0 && st.stunT <= 0;
    if (was !== e.phased) w.emit({ t: 'burst', x: e.x, y: e.y, color: e.def.color, n: 6, speed: 90 });
  }

  // ---- knockback integration (rams and pylons cannot be moved)
  if (e.def.ai === 'charger' || e.def.ai === 'pylon') {
    e.kx = 0;
    e.ky = 0;
  }
  e.x += e.kx * dt;
  e.y += e.ky * dt;
  const damp = Math.exp(-dt * 6);
  e.kx *= damp;
  e.ky *= damp;

  if (e.boss || e.def.ai === 'pylon') return; // bosses and their pylons move via scripts

  // ---- movement / AI
  const frozen = st.frozenT > 0 || st.stunT > 0;
  let slow = frozen ? 0 : Math.max(0.25, 1 - st.chill * 0.2);
  if (st.poison > 0 && w.build.has('venom_core')) slow *= 0.8;
  if (e.slowT > 0) slow *= 0.6;
  if (w.event?.id === 'time_warp') slow *= 0.55;
  if (w.commanders.length && !e.elite.includes('commander')) {
    for (const c of w.commanders) {
      if ((c.x - e.x) ** 2 + (c.y - e.y) ** 2 < 140 * 140) {
        slow *= 1.3;
        break;
      }
    }
  }
  let sp = e.speed * w.enemySpeedMult * slow * (e.spawnT < 0.6 ? 1.6 : 1);
  let vx = 0;
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
    case 'spitter': {
      // Walks to a firing line, then lobs acid at the defense line.
      if (e.t1 === 0) e.t1 = w.rng.range(250, 420);
      if (e.y >= e.t1) {
        sp = 0;
        e.t0 -= dt;
        if (e.t0 <= 0 && !frozen) {
          e.t0 = 4;
          const tx = clamp(e.x + w.rng.range(-140, 140), 40, W - 40);
          const dx = tx - e.x;
          const dy = DEFENSE_Y - e.y;
          const l = Math.hypot(dx, dy) || 1;
          w.spawnProjectile(e.x, e.y + e.r, (dx / l) * 120, (dy / l) * 120, 6, '#a6ff4d', 8);
          w.emit({ t: 'sfx', name: 'split', pitch: 0.6, vol: 0.4 });
        }
      } else if (e.t0 === 0) e.t0 = 1.2;
      vx = Math.sin(e.wobble * 0.9) * 6;
      break;
    }
    case 'phantom':
      vx = Math.sin(e.wobble * 1.4) * sp * 0.5;
      break;
    case 'charger': {
      // A slow march broken by short charges.
      e.t0 += dt;
      const cyc = e.t0 % 7;
      if (cyc > 6.1 && !frozen) sp *= 4;
      if (cyc > 6.1 && cyc - dt <= 6.1) w.emit({ t: 'ring', x: e.x, y: e.y, r: e.r + 16, color: '#ff8a6b', dur: 0.35 });
      break;
    }
    case 'necro': {
      e.t0 -= dt;
      if (e.t0 <= 0 && !frozen && e.y > FIELD_TOP) {
        e.t0 = 6;
        let raised = 0;
        for (let i = w.graves.length - 1; i >= 0 && raised < 2; i--) {
          const g = w.graves[i];
          if ((g.x - e.x) ** 2 + (g.y - e.y) ** 2 > 170 * 170) continue;
          w.graves.splice(i, 1);
          const r = w.spawnEnemy('revenant', g.x, g.y);
          if (r) {
            r.tag = 'risen';
            r.spawnT = 0.05;
            raised++;
            w.emit({ t: 'beam', x0: e.x, y0: e.y, x1: g.x, y1: g.y, color: '#b48cff' });
          }
        }
        if (raised) w.emit({ t: 'ring', x: e.x, y: e.y, r: 60, color: '#b48cff', dur: 0.5 });
      }
      vx = Math.sin(e.wobble * 0.7) * 10;
      break;
    }
    case 'aegis': {
      e.t0 -= dt;
      if (e.t0 <= 0 && !frozen && e.y > FIELD_TOP) {
        e.t0 = 5;
        const near = w.enemies
          .filter((o) => o !== e && o.alive && !o.boss && o.shieldHp <= 0 && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 150 * 150)
          .sort((a, b) => (a.x - e.x) ** 2 + (a.y - e.y) ** 2 - ((b.x - e.x) ** 2 + (b.y - e.y) ** 2))
          .slice(0, 3);
        for (const o of near) {
          o.shieldHp = o.maxHp * 0.3;
          w.emit({ t: 'beam', x0: e.x, y0: e.y, x1: o.x, y1: o.y, color: '#7af0ff' });
        }
        if (near.length) w.emit({ t: 'sfx', name: 'shield', vol: 0.35 });
      }
      vx = Math.sin(e.wobble * 0.9) * 8;
      break;
    }
    case 'pulsar': {
      e.t0 -= dt;
      if (e.t1 > 0) e.t1 -= dt;
      if (e.t0 <= 0 && !frozen) {
        e.t0 = 4.5;
        e.t1 = 0.45;
        w.emit({ t: 'ring', x: e.x, y: e.y, r: 130, color: '#ff8af0', dur: 0.45 });
        w.emit({ t: 'sfx', name: 'pulse', vol: 0.4 });
      }
      break;
    }
    case 'egg': {
      e.t0 += dt;
      if (e.t0 >= 4 && !frozen) {
        e.alive = false;
        for (let i = 0; i < 3; i++) {
          const m = w.spawnEnemy('mite', e.x + (i - 1) * 14, e.y);
          if (m) m.kx = (i - 1) * 110;
        }
        w.emit({ t: 'burst', x: e.x, y: e.y, color: '#e6ff9a', n: 14, speed: 180 });
        w.emit({ t: 'sfx', name: 'split', pitch: 0.8 });
        return;
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
        w.emit({ t: 'text', x: e.x, y: FIELD_TOP + 20, text: t('fx.escaped'), color: '#ffd84a' });
      }
      return;
    }
    default:
      break;
  }
  e.x += vx * dt;
  e.y += sp * dt;
  e.x = clamp(e.x, e.r, W - e.r);
  if (e.y < FIELD_TOP - 60) e.y = FIELD_TOP - 60;

  // ---- reaching the defense line
  if (e.y + e.r * 0.4 >= DEFENSE_Y) {
    e.alive = false;
    // Endless pressure also sharpens breaches, at half the rate it toughens enemies.
    const endless = 1 + (w.director.endlessPressure() - 1) * 0.5;
    const asc = w.asc.has('breach15') ? 1.15 : 1;
    const dmg = e.def.damage * (e.elite.length ? 1.6 : 1) * (1 + w.time / 600) * endless * asc;
    w.emit({ t: 'explosion', x: e.x, y: DEFENSE_Y, r: e.r + 10, color: '#ff3b3b' });
    if (e.def.deathBlast) w.emit({ t: 'explosion', x: e.x, y: DEFENSE_Y, r: 60, color: '#ff3b3b' });
    w.hurt(dmg, e.x);
    for (const [bh, p] of w.bh) bh.onBreach?.(w, e, p);
  }
}
