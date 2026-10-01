import { REACTION_MAP } from '../data/synergies';
import { ballSpeed, effectiveTier } from './physics';
import { DEFENSE_Y, type Ball, type Enemy } from './types';
import { TIER_CRIT, TIER_DMG, type World } from './world';

export type DamageSource =
  | 'ball' | 'chain' | 'explosion' | 'burn' | 'bleed' | 'spark' | 'shatter' | 'barrel' | 'surge' | 'beam' | 'enemyBlast' | 'nova';

export interface HitInfo {
  src: DamageSource;
  crit: boolean;
  depth: number;
  ball?: Ball;
}

/** Max depth of proc chains (explosion -> chain -> explosion ...). Keeps cascades finite. */
export const MAX_DEPTH = 4;

// Per-depth scratch lists so nested queries never clobber a list being iterated.
const lists: Enemy[][] = [];
function listAt(depth: number): Enemy[] {
  return (lists[depth] ??= []);
}

const ELEMENT_COLORS = { fire: '#ff7a2f', ice: '#9fdcff', lightning: '#5ee7ff', bleed: '#ff2a55' };

// ------------------------------------------------------------------ direct hits
/** Resolves a ball striking an enemy. Returns true when the ball passes through. */
export function ballHitEnemy(w: World, b: Ball, e: Enemy): boolean {
  const st = w.build.stats;
  const tier = effectiveTier(w, b);
  let dmg = st.damage * b.dmgMult;
  dmg *= 1 + st.bounceDamage * Math.min(b.wallBounces, 10);
  dmg *= TIER_DMG[tier] * w.comboMult();
  if (w.build.has('kinetic_strike')) dmg *= Math.max(1, ballSpeed(w, b) / 780);
  if (w.build.has('sanguine')) dmg *= 1 + (1 - w.hp / w.maxHp) * w.build.power('sanguine');
  if (w.build.has('pyro_core') && e.st.burnT > 0) dmg *= 1.1;
  const cc = st.critChance + (b.wallBounces > 0 ? st.bankCrit : 0) + TIER_CRIT[tier];
  const crit = w.rng.chance(cc);
  if (crit) dmg *= st.critMult;
  const procBase = dmg;
  // Talent amplification stays on the direct hit: no recursive proc scaling.
  let talentMult = 1;
  if (w.talents.convergence) {
    const statuses = Number(e.st.burnT > 0) + Number(e.st.chill > 0 || e.st.frozenT > 0) + Number(e.st.bleed > 0);
    talentMult = 1 + 0.08 * statuses;
    dmg *= talentMult;
  }
  if (e.def.directMult) dmg *= e.def.directMult;

  let shattered = false;
  if (e.st.frozenT > 0 && w.build.has('shatter')) {
    dmg *= 3;
    shattered = true;
    e.st.frozenT = 0;
  }

  b.momentum += st.momentumGain * (e.elite.length || e.boss ? 2 : 1);
  b.hitCounter++;
  b.bounceChain++;
  b.pulse = 1;
  if (b.bounceChain > w.run.maxBounceChain) w.run.maxBounceChain = b.bounceChain;
  w.addCombo(e.elite.length || e.boss ? 3 : 1, e.id);
  w.surge.charge = Math.min(w.surge.max, w.surge.charge + 1);

  const color = crit ? '#ffe066' : w.trailColors[0];
  w.emit({ t: 'hit', x: (b.x + e.x) / 2, y: (b.y + e.y) / 2, crit, mat: e.def.material, power: dmg, color });
  w.emit({ t: 'sfx', name: crit ? 'crit' : 'hit', pitch: e.def.material === 'metal' ? 0.8 : e.def.material === 'crystal' ? 1.3 : 1, vol: crit ? 0.8 : 0.5 });
  if (crit) w.emit({ t: 'shake', amt: 2.5 });

  const hpBefore = e.hp;
  damageEnemy(w, e, dmg, { src: 'ball', crit, depth: 0, ball: b });

  if (shattered) {
    w.emit({ t: 'burst', x: e.x, y: e.y, color: '#cfefff', n: 22, speed: 320, size: 3 });
    w.emit({ t: 'text', x: e.x, y: e.y - e.r - 10, text: 'SHATTER', color: '#cfefff' });
    w.emit({ t: 'sfx', name: 'shatter' });
    const list = listAt(1);
    w.grid.query(e.x, e.y, 85, list);
    for (const o of list) {
      if (o === e || !o.alive) continue;
      damageEnemy(w, o, dmg / talentMult * 0.4, { src: 'shatter', crit: false, depth: 1 });
      applyChill(w, o, 1, 1);
    }
  }

  if (e.alive && !e.boss) {
    const kb = (st.knockback * (crit ? 1.5 : 1) * 6) / Math.max(1, e.r / 16);
    e.kx += b.dx * kb;
    e.ky += b.dy * kb * 0.6;
  }

  procs(w, e, procBase, crit, 0, b);

  if (b.splitGen < 2 && w.rng.chance(st.splitChance)) splitBall(w, b, st.splitCount);
  for (const [bh, p] of w.bh) bh.onHit?.(w, b, e, crit, dmg / talentMult, p);

  if (e.boss || e.def.directMult) return false;
  if (w.build.has('evo_railgun')) return true;
  if (b.pierceLeft > 0) {
    b.pierceLeft--;
    return true;
  }
  // Overwhelming hits plow straight through: late-game power you can see.
  if (!e.alive && dmg >= hpBefore * 2.5) return true;
  return false;
}

export function splitBall(w: World, b: Ball, count: number): void {
  const base = Math.atan2(b.dy, b.dx);
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * 0.5 + (count === 1 ? 0.35 : 0);
    const a = base + off + Math.PI * (i % 2 === 0 ? 0 : 0);
    w.spawnBall('shard', b.x, b.y, Math.cos(a), Math.sin(a), b);
  }
  w.emit({ t: 'sfx', name: 'split' });
}

/** Secondary effects of a hit: elements, chains, explosions. */
export function procs(w: World, e: Enemy, base: number, crit: boolean, depth: number, ball?: Ball): void {
  const st = w.build.stats;
  const b = w.build;
  const m = ball && ball.kind !== 'main' && !b.has('swarm_protocol') ? 0.5 : 1;
  const ep = st.elementPower;
  if (e.alive && w.rng.chance(st.burnChance * m)) applyBurn(w, e, base * st.burnPower * ep, depth);
  if (e.alive && w.rng.chance(st.chillChance * m)) applyChill(w, e, 1, depth);
  if (e.alive && w.rng.chance(st.bleedChance * m)) applyBleed(w, e, base * 0.16 * ep, crit && b.has('hemorrhage') ? 3 : 1);
  else if (e.alive && crit && b.has('hemorrhage')) applyBleed(w, e, base * 0.16 * ep, 3);
  if (b.has('elemental_trinity') && w.rng.chance(0.3)) {
    if (e.alive) applyBurn(w, e, base * st.burnPower * ep, depth);
    if (e.alive) applyChill(w, e, 1, depth);
    if (depth < MAX_DEPTH) chainLightning(w, e, base * st.chainDamage * ep, st.chainCount, depth + 1);
  }
  if (depth < MAX_DEPTH - 1 && w.rng.chance(st.chainChance * m)) chainLightning(w, e, base * st.chainDamage * ep, st.chainCount, depth + 1);
  const boom = w.rng.chance(st.explosionChance * m) || (crit && b.has('critical_mass'));
  if (depth < MAX_DEPTH - 1 && boom) explode(w, e.x, e.y, 55 * st.area, base * st.explosionDamage, depth + 1, {});
}

// ------------------------------------------------------------------ damage & death
export function damageEnemy(w: World, e: Enemy, amount: number, info: HitInfo): number {
  if (!e.alive || amount <= 0) return 0;
  const st = w.build.stats;
  if (e.st.frozenT > 0) amount *= 1 + st.frozenVuln;
  if (info.src !== 'burn' && info.src !== 'bleed') {
    const arm = Math.max(0, e.armor - st.armorPen);
    amount = Math.max(amount * 0.15, amount - arm);
  }
  if (e.shieldHp > 0) {
    const a = Math.min(e.shieldHp, amount);
    e.shieldHp -= a;
    amount -= a;
    if (e.shieldHp <= 0) {
      w.emit({ t: 'burst', x: e.x, y: e.y, color: '#5ad7ff', n: 18, speed: 260 });
      w.emit({ t: 'sfx', name: 'shieldbreak' });
    }
    if (amount <= 0) {
      e.flash = 0.06;
      return 0;
    }
  }
  e.hp -= amount;
  e.flash = 0.1;
  w.run.damageDealt += amount;
  if (st.lifesteal > 0) {
    const ls = st.lifesteal * (w.build.has('blood_harvest') && e.st.bleed > 0 ? 2 : 1);
    w.heal(amount * ls);
  }
  e.dmgAcc += amount;
  if (info.crit) e.dmgAccCrit = true;
  if (!e.boss && st.execute > 0 && e.hp > 0 && e.hp < e.maxHp * st.execute) {
    e.hp = 0;
    w.emit({ t: 'text', x: e.x, y: e.y - e.r - 8, text: 'EXECUTE', color: '#c9c9ff' });
  }
  if (e.hp <= 0) killEnemy(w, e, info, -e.hp);
  return amount;
}

export function flushDamageNumber(w: World, e: Enemy): void {
  if (e.dmgAcc <= 0) return;
  w.emit({ t: 'dmg', x: e.x + w.rng.range(-6, 6), y: e.y - e.r, v: e.dmgAcc, crit: e.dmgAccCrit, color: e.dmgAccCrit ? '#ffe066' : '#ffffff' });
  e.dmgAcc = 0;
  e.dmgAccCrit = false;
  e.dmgAccT = 0;
}

export function killEnemy(w: World, e: Enemy, info: HitInfo, overflow: number): void {
  if (!e.alive) return;
  e.alive = false;
  e.killedBy = info.src;
  flushDamageNumber(w, e);
  const st = w.build.stats;
  const r = w.run;
  r.kills++;
  if (e.elite.length) r.eliteKills++;
  switch (info.src) {
    case 'burn': r.fireKills++; break;
    case 'chain': r.lightningKills++; break;
    case 'explosion': case 'barrel': case 'enemyBlast': r.explosionKills++; break;
    case 'bleed': r.bleedKills++; break;
    default: if (e.st.burnT > 0 && w.build.has('evo_inferno')) r.fireKills++; break;
  }

  // ---- rewards
  const eliteMult = e.elite.length ? 5 : 1;
  let xp = e.def.xp * eliteMult;
  const gems = Math.min(5, Math.ceil(xp / 4));
  for (let i = 0; i < gems && xp > 0; i++) {
    const v = i === gems - 1 ? xp : Math.min(4, xp);
    w.spawnPickup('xp', e.x, e.y, v);
    xp -= v;
  }
  if (e.def.ai === 'golden') {
    r.goldenCaught++;
    for (let i = 0; i < 8; i++) w.spawnPickup('coin', e.x, e.y, Math.ceil(e.def.coins / 8));
    w.banner('GOLDEN!', '#ffd84a');
  } else if (e.def.coins > 0 && w.rng.chance(e.elite.length ? 1 : 0.3)) {
    w.spawnPickup('coin', e.x, e.y, e.def.coins * eliteMult);
  }
  if (e.elite.length) {
    if (w.rng.chance(w.flags.has('bounty') ? 0.4 : 0.25)) w.spawnPickup('core', e.x, e.y, 1);
    if (w.rng.chance(0.18 + st.luck * 0.04)) w.spawnPickup('mystery', e.x, e.y, 1);
    if (w.rng.chance(0.4)) w.spawnPickup('heal', e.x, e.y, 12);
  }
  w.addCombo(1);

  const big = e.elite.length > 0 || e.boss;
  w.emit({ t: 'kill', x: e.x, y: e.y, r: e.r, color: e.def.color, big });
  w.emit({ t: 'sfx', name: big ? 'bigkill' : 'kill', pitch: 1.4 - Math.min(e.r, 40) / 60, vol: 0.5 });
  if (big) w.emit({ t: 'shake', amt: 6 });

  // ---- on-death mechanics
  if (e.def.splitsInto && !e.boss) {
    const { id, count } = e.def.splitsInto;
    for (let i = 0; i < count; i++) {
      const c = w.spawnEnemy(id, e.x + (i - (count - 1) / 2) * 22, e.y);
      if (c) {
        c.spawnT = 0.1;
        c.kx = (i - (count - 1) / 2) * 120;
      }
    }
  }
  if (e.def.deathBlast) {
    explode(w, e.x, e.y, e.def.deathBlast.radius, e.def.deathBlast.damage * (1 + w.time / 300), info.depth + 1, { color: '#ff3b3b', src: 'enemyBlast' });
  }
  if (e.st.burnT > 0 && st.burnSpread > 0 && w.rng.chance(st.burnSpread) && info.depth < MAX_DEPTH) {
    const list = listAt(info.depth + 1);
    w.grid.query(e.x, e.y, 85, list);
    for (const o of list) if (o !== e && o.alive) applyBurn(w, o, e.st.burnDps, info.depth + 1);
    w.emit({ t: 'ring', x: e.x, y: e.y, r: 85, color: ELEMENT_COLORS.fire });
  }
  if ((info.src === 'explosion' || info.src === 'barrel') && info.depth < MAX_DEPTH && w.rng.chance(st.chainReaction)) {
    explode(w, e.x, e.y, 55 * st.area, st.damage * st.explosionDamage * 1.5, info.depth + 1, {});
  }
  if (st.overkill > 0 && overflow > 1 && info.depth < MAX_DEPTH) {
    const t = nearestEnemy(w, e.x, e.y, 220, e);
    if (t) {
      w.emit({ t: 'beam', x0: e.x, y0: e.y, x1: t.x, y1: t.y, color: '#ffffff' });
      damageEnemy(w, t, overflow * st.overkill, { src: 'spark', crit: false, depth: info.depth + 1 });
    }
  }
  if (e.elite.includes('volatile')) {
    for (let i = 0; i < 3; i++) {
      const tx = 90 + i * 180;
      const dx = tx - e.x;
      const dy = DEFENSE_Y - e.y;
      const l = Math.hypot(dx, dy) || 1;
      w.spawnProjectile(e.x, e.y, (dx / l) * 110, (dy / l) * 110, 10, '#ff4a4a');
    }
  }
  if (!e.boss) {
    for (const o of w.enemies) {
      if (o.alive && o.elite.includes('vampiric') && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 160 * 160) {
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.15);
        w.emit({ t: 'beam', x0: e.x, y0: e.y, x1: o.x, y1: o.y, color: '#ff2a55' });
      }
    }
  }
  for (const [bh, p] of w.bh) bh.onKill?.(w, e, info, p);
  if (e.boss) w.director.onBossPartDeath(e);
}

export function nearestEnemy(w: World, x: number, y: number, range: number, exclude?: Enemy, excludeIds?: number[]): Enemy | null {
  const list = listAt(7);
  w.grid.query(x, y, range, list);
  let best: Enemy | null = null;
  let bd = Infinity;
  for (const o of list) {
    if (!o.alive || o === exclude || (excludeIds && excludeIds.includes(o.id))) continue;
    const d = (o.x - x) ** 2 + (o.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

export function sparkNearest(w: World, x: number, y: number, dmg: number, color: string): void {
  const t = nearestEnemy(w, x, y, 260);
  if (!t) return;
  w.emit({ t: 'beam', x0: x, y0: y, x1: t.x, y1: t.y, color });
  damageEnemy(w, t, dmg, { src: 'spark', crit: false, depth: 2 });
}

// ------------------------------------------------------------------ area & chains
export function explode(
  w: World, x: number, y: number, r: number, dmg: number, depth: number,
  opts: { color?: string; src?: 'explosion' | 'barrel' | 'enemyBlast' | 'surge' | 'nova'; burn?: boolean },
): void {
  if (w.explosionsThisStep > 16) return; // runaway guard (per sim step)
  w.explosionsThisStep++;
  const src = opts.src ?? 'explosion';
  const burn = opts.burn || w.build.has('burning_explosion') || w.build.has('evo_inferno');
  const list = listAt(Math.min(depth, 6));
  w.grid.query(x, y, r, list);
  const st = w.build.stats;
  for (const e of list) {
    if (!e.alive) continue;
    damageEnemy(w, e, dmg, { src: src === 'surge' ? 'explosion' : src, crit: false, depth });
    if (e.alive) {
      if (!e.boss) {
        const dx = e.x - x;
        const dy = e.y - y;
        const d = Math.hypot(dx, dy) || 1;
        e.kx += (dx / d) * 160;
        e.ky += (dy / d) * 90;
      }
      if (burn && depth < MAX_DEPTH + 1) applyBurn(w, e, dmg * st.burnPower * 0.8 * st.elementPower, depth + 1);
    }
  }
  if (depth < MAX_DEPTH) {
    for (const o of w.obstacles) {
      if (o.kind === 'barrel' && o.alive && (o.x - x) ** 2 + (o.y - y) ** 2 < (r + o.r) ** 2) w.detonateBarrel(o, depth);
      if (o.kind === 'oil' && burn && o.burning <= 0 && (o.x - x) ** 2 + (o.y - y) ** 2 < (r + o.r) ** 2) {
        o.burning = 5;
        w.emit({ t: 'sfx', name: 'ignite' });
      }
    }
  }
  w.emit({ t: 'explosion', x, y, r, color: opts.color ?? (burn ? '#ff7a2f' : '#ffb13b') });
  w.emit({ t: 'sfx', name: 'explode', vol: Math.min(1, 0.4 + r / 150) });
  w.emit({ t: 'shake', amt: Math.min(8, r / 16) });
}

export function chainLightning(w: World, from: Enemy, dmg: number, count: number, depth: number): void {
  const b = w.build;
  const hit = [from.id];
  const pts = [from.x, from.y];
  let cx = from.x;
  let cy = from.y;
  let extra = 0;
  const list = listAt(Math.min(depth, 6));
  for (let i = 0; i < count + extra && i < 16; i++) {
    w.grid.query(cx, cy, 170, list);
    let next: Enemy | null = null;
    let bd = Infinity;
    for (const o of list) {
      if (!o.alive || hit.includes(o.id)) continue;
      const d = (o.x - cx) ** 2 + (o.y - cy) ** 2;
      if (d < bd) {
        bd = d;
        next = o;
      }
    }
    if (!next) break;
    hit.push(next.id);
    let d = dmg;
    if (b.has('superconductor') && (next.st.chill > 0 || next.st.frozenT > 0)) d *= 2;
    if (next.st.frozenT > 0 && tryReaction(w, 'supercharge', next)) {
      extra += 2;
      d *= 1.5;
    }
    if (next.st.burnT > 0 && depth < MAX_DEPTH && tryReaction(w, 'overload', next)) {
      explode(w, next.x, next.y, 55 * w.build.stats.area, dmg * 0.9 + next.st.burnDps, depth + 1, { color: '#ff9a3d' });
    }
    pts.push(next.x, next.y);
    const nx = next.x;
    const ny = next.y;
    damageEnemy(w, next, d, { src: 'chain', crit: false, depth });
    if (next.alive) {
      if (b.has('superconductor')) applyChill(w, next, 1, depth);
      if (b.has('magnetic_chain') && !next.boss) {
        next.kx += (cx - next.x) * 2.5;
        next.ky += (cy - next.y) * 1.2;
      }
    }
    cx = nx;
    cy = ny;
  }
  if (pts.length > 2) {
    w.emit({ t: 'lightning', pts, color: '#8ff4ff' });
    w.emit({ t: 'sfx', name: 'zap', vol: 0.45 });
  }
}

// ------------------------------------------------------------------ statuses & reactions
function tryReaction(w: World, id: string, e: Enemy): boolean {
  if (e.st.reactCd > 0) return false;
  e.st.reactCd = 0.5;
  w.reactionsRun.add(id);
  const def = REACTION_MAP[id];
  if (w.discover('reactions', id)) {
    w.banner('REACTION DISCOVERED', '#ff9af0', `${def.icon} ${def.name}`, true);
    w.emit({ t: 'slowmo', dur: 0.5, scale: 0.35 });
  } else {
    w.emit({ t: 'text', x: e.x, y: e.y - e.r - 12, text: def.name.toUpperCase(), color: '#ff9af0' });
  }
  return true;
}

function steamBurst(w: World, e: Enemy, power: number, depth: number): void {
  e.st.chill = 0;
  e.st.frozenT = 0;
  e.st.burnT = 0;
  const st = w.build.stats;
  explode(w, e.x, e.y, 80 * st.area, Math.max(power * 3, st.damage * 1.4) * st.elementPower, depth + 1, { color: '#e8f4ff' });
}

export function applyBurn(w: World, e: Enemy, dps: number, depth: number): void {
  if (!e.alive || e.shieldHp > 0 || dps <= 0) return;
  if ((e.st.chill > 0 || e.st.frozenT > 0) && depth < MAX_DEPTH && tryReaction(w, 'steam_burst', e)) {
    steamBurst(w, e, dps, depth);
    return;
  }
  e.st.burnDps = e.st.burnT > 0 ? Math.max(e.st.burnDps, dps) : dps;
  e.st.burnT = 3;
}

export function applyChill(w: World, e: Enemy, stacks: number, depth: number): void {
  if (!e.alive || e.shieldHp > 0) return;
  if (e.st.burnT > 0 && depth < MAX_DEPTH && tryReaction(w, 'steam_burst', e)) {
    steamBurst(w, e, e.st.burnDps, depth);
    return;
  }
  if (e.st.frozenT > 0) return;
  e.st.chill += stacks;
  e.st.chillT = 3;
  if (e.st.chill >= 3) {
    e.st.chill = 0;
    e.st.frozenT = e.boss ? 0.6 : 1.8;
    w.run.frozenCount++;
    w.emit({ t: 'ring', x: e.x, y: e.y, r: e.r + 14, color: ELEMENT_COLORS.ice });
    w.emit({ t: 'sfx', name: 'freeze', vol: 0.5 });
    if (w.build.has('glacial_heart') && depth < 2) {
      const list = listAt(depth + 1);
      w.grid.query(e.x, e.y, 70 + 20 * w.build.power('glacial_heart'), list);
      for (const o of list) if (o !== e) applyChill(w, o, 1, depth + 1);
    }
  }
}

export function applyBleed(w: World, e: Enemy, dps: number, stacks: number): void {
  if (!e.alive || e.shieldHp > 0) return;
  e.st.bleed = Math.min(10, e.st.bleed + stacks);
  e.st.bleedT = 4;
  e.st.bleedDps = Math.max(e.st.bleedDps, dps);
}
