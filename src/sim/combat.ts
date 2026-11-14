import { t } from '../i18n';
import { REACTION_MAP } from '../data/synergies';
import type { Element } from '../data/types';
import { bossMitigation } from './bosses';
import { ballSpeed, effectiveTier } from './physics';
import { DEFENSE_Y, H, type Ball, type Enemy } from './types';
import { TIER_CRIT, TIER_DMG, type World } from './world';

export type DamageSource =
  | 'ball' | 'chain' | 'explosion' | 'burn' | 'bleed' | 'spark' | 'shatter' | 'barrel' | 'surge' | 'beam' | 'enemyBlast' | 'nova'
  | 'poison' | 'quake' | 'meteor' | 'mine';

export interface HitInfo {
  src: DamageSource;
  crit: boolean;
  depth: number;
  ball?: Ball;
}

/** Max depth of proc chains (explosion -> chain -> explosion ...). Keeps cascades finite. */
export const MAX_DEPTH = 4;
/** Enemies above this line are "far" (Long Shot); below NEAR_Y they are "near" (Point Blank). */
export const FAR_Y = 450;
export const NEAR_Y = DEFENSE_Y - 220;

// Scratch lists form a stack keyed by call nesting, not proc depth: a kill inside an
// explosion can start another query at the same depth, which must not clobber the list
// still being iterated. Every acquire() is paired with release() in a finally block.
const lists: Enemy[][] = [];
let nested = 0;
function acquire(): Enemy[] {
  return (lists[nested++] ??= []);
}
function release(): void {
  lists[--nested].length = 0;
}

export const ELEMENT_COLORS = { fire: '#ff7a2f', ice: '#9fdcff', lightning: '#5ee7ff', bleed: '#ff2a55', poison: '#8dff5a' };

export function immune(e: Enemy, el: Element): boolean {
  return !!e.def.immune?.includes(el);
}

/** Damage multiplier from where the target stands and what it is (Long Shot, Point Blank, Bounty Hunter...). */
function targetMult(w: World, e: Enemy): number {
  const st = w.build.stats;
  let m = 1;
  if (st.farDamage && e.y < FAR_Y) m *= 1 + st.farDamage;
  if (st.nearDamage && e.y > NEAR_Y) m *= 1 + st.nearDamage;
  if (st.eliteDamage && (e.elite.length || e.boss)) m *= 1 + st.eliteDamage;
  if (st.bleedVuln && e.st.bleed > 0) m *= 1 + st.bleedVuln;
  return m;
}

// ------------------------------------------------------------------ direct hits
/** Resolves a ball striking an enemy. Returns true when the ball passes through. */
export function ballHitEnemy(w: World, b: Ball, e: Enemy): boolean {
  const st = w.build.stats;
  const build = w.build;
  const tier = effectiveTier(w, b);
  let dmg = st.damage * b.dmgMult;
  dmg *= 1 + st.bounceDamage * Math.min(b.wallBounces, 10);
  dmg *= TIER_DMG[tier] * w.comboMult();
  if (build.has('kinetic_strike')) dmg *= Math.max(1, ballSpeed(w, b) / 780);
  if (build.has('sanguine')) dmg *= 1 + (1 - w.hp / w.maxHp) * build.power('sanguine');
  if (build.has('relic_berserker')) dmg *= 1 + (1 - w.hp / w.maxHp);
  if (build.has('relic_war_drum')) dmg *= 1 + Math.min(0.35, Math.floor(w.combo.count / 8) * 0.01);
  if (build.has('pyro_core') && e.st.burnT > 0) dmg *= 1.25;
  dmg *= targetMult(w, e);
  const cc = st.critChance + (b.wallBounces > 0 ? st.bankCrit : 0) + TIER_CRIT[tier];
  const crit = w.rng.chance(cc);
  if (crit) dmg *= st.critMult + (build.has('snipers_nest') && e.y < FAR_Y ? 0.5 : 0);
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
  if (e.st.frozenT > 0 && build.has('shatter')) {
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
  w.chargeSurge(1);

  const color = crit ? '#ffe066' : w.trailColors[0];
  w.emit({ t: 'hit', x: (b.x + e.x) / 2, y: (b.y + e.y) / 2, crit, mat: e.def.material, power: dmg, color });
  w.emit({ t: 'sfx', name: crit ? 'crit' : 'hit', pitch: e.def.material === 'metal' ? 0.8 : e.def.material === 'crystal' ? 1.3 : 1, vol: crit ? 0.8 : 0.5 });
  if (crit) w.emit({ t: 'shake', amt: 2.5 });

  const hpBefore = e.hp;
  damageEnemy(w, e, dmg, { src: 'ball', crit, depth: 0, ball: b });

  if (shattered) {
    w.emit({ t: 'burst', x: e.x, y: e.y, color: '#cfefff', n: 22, speed: 320, size: 3 });
    w.emit({ t: 'text', x: e.x, y: e.y - e.r - 10, text: t('fx.shatter'), color: '#cfefff' });
    w.emit({ t: 'sfx', name: 'shatter' });
    const list = acquire();
    try {
      w.grid.query(e.x, e.y, 85, list);
      for (const o of list) {
        if (o === e || !o.alive) continue;
        damageEnemy(w, o, dmg / talentMult * 0.4, { src: 'shatter', crit: false, depth: 1 });
        applyChill(w, o, 1, 1);
      }
    } finally {
      release();
    }
  }

  if (e.alive && !e.boss && e.def.ai !== 'charger' && e.def.ai !== 'pylon') {
    let kb = (st.knockback * (crit ? 1.5 : 1) * 6) / Math.max(1, e.r / 16);
    if (build.has('last_line') && e.y > NEAR_Y) kb *= 3;
    e.kx += b.dx * kb;
    e.ky += b.dy * kb * 0.6;
  }

  procs(w, e, procBase, crit, 0, b);
  if (b.prism && e.alive) randomElement(w, e, procBase, 1);

  if (b.splitGen < 2 && w.rng.chance(st.splitChance * (b.splitGen ? 0.5 : 1))) splitBall(w, b, st.splitCount);
  for (const [bh, p] of w.bh) bh.onHit?.(w, b, e, crit, dmg / talentMult, p);

  if (e.boss || e.def.directMult || e.def.ai === 'pylon') return false;
  if (build.has('evo_railgun')) return true;
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
    const a = base + off;
    w.spawnBall('shard', b.x, b.y, Math.cos(a), Math.sin(a), b);
  }
  w.emit({ t: 'sfx', name: 'split' });
}

/** Fires a temporary shard from (x, y) toward the nearest other enemy. */
export function shardAt(w: World, from: Ball | null, x: number, y: number, exclude: Enemy | null, power: number): Ball | null {
  const target = nearestEnemy(w, x, y, 320, exclude ?? undefined);
  const dx = target ? target.x - x : 0;
  const dy = target ? target.y - y : -1;
  const s = w.spawnBall('shard', x, y, dx || 0.01, dy || -1, from ?? undefined);
  if (s) {
    s.dmgMult *= power;
    s.splitGen = 2;
    s.life = 4;
  }
  return s;
}

/** Applies one random element: Primal Chaos and Prism shards. */
export function randomElement(w: World, e: Enemy, base: number, depth: number): void {
  const st = w.build.stats;
  const ep = st.elementPower;
  switch (w.rng.int(0, 3)) {
    case 0: applyBurn(w, e, base * st.burnPower * ep, depth); break;
    case 1: applyChill(w, e, 1, depth); break;
    case 2: if (depth < MAX_DEPTH) chainLightning(w, e, base * st.chainDamage * ep, st.chainCount, depth + 1); break;
    default: applyPoison(w, e, base * st.poisonPower * ep, 1, depth); break;
  }
}

/** Secondary effects of a hit: elements, chains, explosions. */
export function procs(w: World, e: Enemy, base: number, crit: boolean, depth: number, ball?: Ball): void {
  const st = w.build.stats;
  const b = w.build;
  const m = ball && ball.kind !== 'main' && !b.has('swarm_protocol') ? 0.5 : 1;
  const ep = st.elementPower;
  if (e.alive && w.rng.chance(st.burnChance * m)) applyBurn(w, e, base * st.burnPower * ep, depth);
  if (e.alive && w.rng.chance(st.chillChance * m)) applyChill(w, e, 1, depth);
  if (e.alive && w.rng.chance(st.poisonChance * m)) applyPoison(w, e, base * st.poisonPower * ep, 1, depth);
  if (e.alive && w.rng.chance(st.bleedChance * m)) applyBleed(w, e, base * 0.16 * ep, crit && b.has('hemorrhage') ? 3 : 1);
  else if (e.alive && crit && b.has('hemorrhage')) applyBleed(w, e, base * 0.16 * ep, 3);
  if (b.has('elemental_trinity') && w.rng.chance(0.3)) {
    if (e.alive) applyBurn(w, e, base * st.burnPower * ep, depth);
    if (e.alive) applyChill(w, e, 1, depth);
    if (depth < MAX_DEPTH) chainLightning(w, e, base * st.chainDamage * ep, st.chainCount, depth + 1);
  }
  if (b.has('primal_chaos') && e.alive) randomElement(w, e, base, depth);
  if (depth < MAX_DEPTH - 1 && w.rng.chance(st.chainChance * m)) chainLightning(w, e, base * st.chainDamage * ep, st.chainCount, depth + 1);
  const boom = w.rng.chance(st.explosionChance * m) || (crit && b.has('critical_mass'));
  if (depth < MAX_DEPTH - 1 && boom) explode(w, e.x, e.y, 55 * st.area, base * st.explosionDamage, depth + 1, {});
}

// ------------------------------------------------------------------ damage & death
export function damageEnemy(w: World, e: Enemy, amount: number, info: HitInfo): number {
  if (!e.alive || amount <= 0) return 0;
  const st = w.build.stats;
  if (e.st.frozenT > 0) amount *= 1 + st.frozenVuln;
  if (info.src !== 'burn' && info.src !== 'bleed' && info.src !== 'poison') {
    let pen = st.armorPen;
    if (e.st.burnT > 0) pen += st.burnShred;
    if (e.st.poison > 0 && w.build.has('corrosion')) pen += Math.floor(e.st.poison / 3);
    const arm = Math.max(0, e.armor - pen);
    amount = Math.max(amount * 0.15, amount - arm);
  }
  // Boss rules: the Architect's pylons, the Colossus's damage budget, the Overmind's ward, the Sovereign's seals.
  if (e.boss) {
    amount = bossMitigation(e, amount);
    if (amount <= 0) {
      e.flash = 0.06;
      return 0;
    }
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
  const skill = w.dmgSkill || info.src;
  w.damageBy.set(skill, (w.damageBy.get(skill) ?? 0) + amount);
  if (st.lifesteal > 0) {
    const boost = (w.build.has('blood_harvest') && e.st.bleed > 0) || (w.build.has('venom_leech') && e.st.poison > 0) ? 2 : 1;
    w.heal(amount * st.lifesteal * boost);
  }
  e.dmgAcc += amount;
  if (info.crit) e.dmgAccCrit = true;
  let executed = false;
  if (!e.boss && st.execute > 0 && e.hp > 0 && e.hp < e.maxHp * st.execute) {
    e.hp = 0;
    executed = true;
    w.emit({ t: 'text', x: e.x, y: e.y - e.r - 8, text: t('fx.execute'), color: '#c9c9ff' });
  }
  if (e.hp <= 0) {
    killEnemy(w, e, info, -e.hp);
    if (executed && w.build.has('evo_reaper') && info.depth < MAX_DEPTH) {
      w.credit('evo_reaper', () => { for (let i = 0; i < 2; i++) sparkNearest(w, e.x, e.y, st.damage * 1.2, '#d0c4ff'); });
    }
  }
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
  // Death effects (on-kill procs, death blasts) are their own skills, not the killer's;
  // behavior hooks re-credit themselves.
  const prevSkill = w.dmgSkill;
  w.dmgSkill = '';
  try {
    killEnemyInner(w, e, info, overflow);
  } finally {
    w.dmgSkill = prevSkill;
  }
}

function killEnemyInner(w: World, e: Enemy, info: HitInfo, overflow: number): void {
  // Undying elites rise once more, before any rewards are paid.
  if (e.lives > 0 && !e.boss) {
    e.lives--;
    e.hp = e.maxHp * 0.4;
    e.st.burnT = 0; e.st.poison = 0; e.st.bleed = 0; e.st.frozenT = 0;
    flushDamageNumber(w, e);
    w.emit({ t: 'ring', x: e.x, y: e.y, r: e.r + 24, color: '#d6c8ff' });
    w.emit({ t: 'text', x: e.x, y: e.y - e.r - 12, text: t('fx.undying'), color: '#d6c8ff' });
    w.emit({ t: 'sfx', name: 'boss', vol: 0.4 });
    return;
  }
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
    case 'explosion': case 'barrel': case 'enemyBlast': case 'mine': case 'meteor': r.explosionKills++; break;
    case 'bleed': r.bleedKills++; break;
    case 'poison': r.poisonKills++; break;
    default: if (e.st.burnT > 0 && w.build.has('evo_inferno')) r.fireKills++; break;
  }

  // ---- rewards (eggs and pylons only pay their small XP)
  const eliteMult = e.elite.length ? 5 : 1;
  let xp = e.def.xp * eliteMult;
  const gems = Math.min(5, Math.ceil(xp / 4));
  for (let i = 0; i < gems && xp > 0; i++) {
    const v = i === gems - 1 ? xp : Math.min(4, xp);
    w.spawnPickup('xp', e.x, e.y, v);
    xp -= v;
  }
  const bounty = e.elite.length && w.build.has('bounty_board') ? 3 : 1;
  if (e.def.ai === 'golden') {
    r.goldenCaught++;
    for (let i = 0; i < 8; i++) w.spawnPickup('coin', e.x, e.y, Math.ceil(e.def.coins / 8));
    w.banner(t('fx.golden'), '#ffd84a');
  } else if (e.def.coins > 0 && w.rng.chance(e.elite.length ? 1 : 0.3)) {
    w.spawnPickup('coin', e.x, e.y, e.def.coins * eliteMult * bounty * (e.elite.length && w.flags.has('gilded') ? 1.25 : 1));
  }
  if (e.elite.length) {
    if (w.rng.chance(w.flags.has('bounty') ? 0.4 : 0.25)) w.spawnPickup('core', e.x, e.y, 1);
    if (w.rng.chance(0.18 + st.luck * 0.04)) w.spawnPickup('mystery', e.x, e.y, 1);
    if (bounty > 1 || w.rng.chance(0.4)) w.spawnPickup('heal', e.x, e.y, 12);
    if (w.flags.has('relichunt') && e.tag !== 'mini' && w.rng.chance(0.04) && w.relicsAllowed()) w.spawnPickup('relic', e.x, e.y, 1);
  }
  if (e.tag === 'mini') w.grantRelic();
  w.addCombo(1);

  const big = e.elite.length > 0 || e.boss;
  w.emit({ t: 'kill', x: e.x, y: e.y, r: e.r, color: e.def.color, big });
  w.emit({ t: 'sfx', name: big ? 'bigkill' : 'kill', pitch: 1.4 - Math.min(e.r, 40) / 60, vol: 0.5 });
  if (big) w.emit({ t: 'shake', amt: 6 });

  // ---- on-death mechanics
  if (!e.boss && e.tag !== 'risen' && !e.def.splitsInto && e.def.ai !== 'egg' && e.def.ai !== 'pylon') w.recordGrave(e);
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
  if (e.elite.includes('fission') && !e.boss) {
    for (const side of [-1, 1]) {
      const c = w.spawnEnemy(e.def.id, e.x + side * 20, e.y, { hpMult: 0.45 });
      if (c) {
        c.r = e.def.radius * 0.85;
        c.spawnT = 0.1;
        c.kx = side * 140;
      }
    }
  }
  if (e.def.deathBlast) {
    explode(w, e.x, e.y, e.def.deathBlast.radius, e.def.deathBlast.damage * (1 + w.time / 300), info.depth + 1, { color: '#ff3b3b', src: 'enemyBlast' });
  }
  if (e.st.burnT > 0 && st.burnSpread > 0 && w.rng.chance(st.burnSpread) && info.depth < MAX_DEPTH) {
    const list = acquire();
    try {
      w.grid.query(e.x, e.y, 85, list);
      for (const o of list) if (o !== e && o.alive) applyBurn(w, o, e.st.burnDps, info.depth + 1);
    } finally {
      release();
    }
    w.emit({ t: 'ring', x: e.x, y: e.y, r: 85, color: ELEMENT_COLORS.fire });
  }
  if (e.st.poison > 0 && st.poisonSpread > 0 && w.rng.chance(st.poisonSpread) && info.depth < MAX_DEPTH) {
    const stacks = Math.max(1, Math.ceil(e.st.poison * 0.6));
    const list = acquire();
    try {
      w.grid.query(e.x, e.y, 90, list);
      for (const o of list) if (o !== e && o.alive) applyPoison(w, o, e.st.poisonDps, stacks, info.depth + 1);
    } finally {
      release();
    }
    w.emit({ t: 'ring', x: e.x, y: e.y, r: 90, color: ELEMENT_COLORS.poison });
  }
  if ((info.src === 'explosion' || info.src === 'barrel') && info.depth < MAX_DEPTH && w.rng.chance(st.chainReaction)) {
    explode(w, e.x, e.y, 55 * st.area, st.damage * st.explosionDamage * 1.5, info.depth + 1, {});
  }
  if (st.overkill > 0 && overflow > 1 && info.depth < MAX_DEPTH) {
    const tgt = nearestEnemy(w, e.x, e.y, 220, e);
    if (tgt) {
      w.emit({ t: 'beam', x0: e.x, y0: e.y, x1: tgt.x, y1: tgt.y, color: '#ffffff' });
      w.credit('overkill', () => damageEnemy(w, tgt, overflow * st.overkill, { src: 'spark', crit: false, depth: info.depth + 1 }));
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

export function nearestEnemy(w: World, x: number, y: number, range: number, exclude?: Enemy, excludeIds?: number[], skipImmune?: Element): Enemy | null {
  const list = acquire();
  let best: Enemy | null = null;
  try {
    w.grid.query(x, y, range, list);
    let bd = Infinity;
    for (const o of list) {
      if (!o.alive || o === exclude || (excludeIds && excludeIds.includes(o.id)) || (skipImmune && immune(o, skipImmune))) continue;
      const d = (o.x - x) ** 2 + (o.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
  } finally {
    release();
  }
  return best;
}

export function sparkNearest(w: World, x: number, y: number, dmg: number, color: string): void {
  const tgt = nearestEnemy(w, x, y, 260);
  if (!tgt) return;
  w.emit({ t: 'beam', x0: x, y0: y, x1: tgt.x, y1: tgt.y, color });
  damageEnemy(w, tgt, dmg * targetMult(w, tgt), { src: 'spark', crit: false, depth: 2 });
}

/** The enemy with the most others packed around it (meteors aim here). */
export function densest(w: World): Enemy | null {
  let best: Enemy | null = null;
  let bn = -1;
  const list = acquire();
  try {
    for (const e of w.enemies) {
      if (!e.alive || e.phased || e.y < 110) continue;
      w.grid.query(e.x, e.y, 80, list);
      const n = list.length + (e.y / H) * 0.5;
      list.length = 0;
      if (n > bn) {
        bn = n;
        best = e;
      }
    }
  } finally {
    release();
  }
  return best;
}

/** A meteor from the sky: a beam from the top of the field and a heavy blast. */
export function meteor(w: World, x: number, y: number, dmg: number, depth = 1): void {
  w.emit({ t: 'beam', x0: x + 60, y0: 96, x1: x, y1: y, color: '#ffb36b' });
  explode(w, x, y, 75 * w.build.stats.area, dmg, depth, { color: '#ff9a3d', src: 'meteor', burn: true });
}

// ------------------------------------------------------------------ area & chains
export function explode(
  w: World, x: number, y: number, r: number, dmg: number, depth: number,
  opts: { color?: string; src?: 'explosion' | 'barrel' | 'enemyBlast' | 'surge' | 'nova' | 'quake' | 'meteor' | 'mine'; burn?: boolean },
): void {
  if (w.explosionsThisStep > 16) return; // runaway guard (per sim step)
  w.explosionsThisStep++;
  const src = opts.src ?? 'explosion';
  const b = w.build;
  const burn = opts.burn || b.has('burning_explosion') || b.has('evo_inferno');
  const toxic = b.has('toxic_shrapnel') && src !== 'enemyBlast';
  const st = b.stats;
  const list = acquire();
  try {
    w.grid.query(x, y, r, list);
    for (const e of list) {
      if (!e.alive) continue;
      damageEnemy(w, e, dmg * (src === 'enemyBlast' ? 1 : targetMult(w, e)), { src: src === 'surge' ? 'explosion' : src, crit: false, depth });
      if (e.alive) {
        if (!e.boss && e.def.ai !== 'charger' && e.def.ai !== 'pylon') {
          const dx = e.x - x;
          const dy = e.y - y;
          const d = Math.hypot(dx, dy) || 1;
          e.kx += (dx / d) * 160;
          e.ky += (dy / d) * 90;
        }
        if (burn && depth < MAX_DEPTH + 1) applyBurn(w, e, dmg * st.burnPower * 0.8 * st.elementPower, depth + 1);
        if (toxic && depth < MAX_DEPTH + 1) applyPoison(w, e, Math.max(dmg, st.damage) * st.poisonPower * st.elementPower, 2, depth + 1);
      }
    }
  } finally {
    release();
  }
  if (depth < MAX_DEPTH) {
    for (const o of w.obstacles) {
      if (o.kind === 'barrel' && o.alive && (o.x - x) ** 2 + (o.y - y) ** 2 < (r + o.r) ** 2) w.detonateBarrel(o, depth);
      if (o.kind === 'spore' && o.alive && (o.x - x) ** 2 + (o.y - y) ** 2 < (r + o.r) ** 2) w.burstSpore(o);
      if (o.kind === 'oil' && burn && o.burning <= 0 && (o.x - x) ** 2 + (o.y - y) ** 2 < (r + o.r) ** 2) {
        o.burning = 5;
        w.emit({ t: 'sfx', name: 'ignite' });
      }
    }
    // Minefield: a blast sets off the mines around it.
    if (b.has('evo_minefield')) {
      for (const z of w.zones) if (z.kind === 'mine' && z.alive && z.t > 0.2 && (z.x - x) ** 2 + (z.y - y) ** 2 < (r + 30) ** 2) z.tick = -1;
    }
  }
  w.emit({ t: 'explosion', x, y, r, color: opts.color ?? (burn ? '#ff7a2f' : toxic ? '#9cff5e' : '#ffb13b') });
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
  if (b.has('storm_surge')) extra += Math.min(4, Math.floor(w.combo.count / (b.power('storm_surge') >= 2 ? 15 : 25)));
  // Once Neurotoxin fires, the rest of the chain carries a share of that enemy's poison.
  let toxin = 0;
  let toxinDps = 0;
  for (let i = 0; i < count + extra && i < 16; i++) {
    const next = nearestEnemy(w, cx, cy, 170, undefined, hit, 'lightning');
    if (!next) break;
    hit.push(next.id);
    let d = dmg;
    const rx = b.has('primal_chaos') ? 2 : 1;
    if (b.has('superconductor') && (next.st.chill > 0 || next.st.frozenT > 0)) d *= 2;
    if (next.st.frozenT > 0 && tryReaction(w, 'supercharge', next)) {
      extra += 2;
      d *= 1.5 * rx;
    }
    if (next.st.burnT > 0 && depth < MAX_DEPTH && tryReaction(w, 'overload', next)) {
      explode(w, next.x, next.y, 55 * w.build.stats.area, (dmg * 0.9 + next.st.burnDps) * rx, depth + 1, { color: '#ff9a3d' });
    }
    if (next.st.poison > 0 && tryReaction(w, 'neurotoxin', next)) {
      next.st.stunT = Math.max(next.st.stunT, next.boss ? 0.3 : 1.2);
      toxin = Math.max(toxin, Math.floor(next.st.poison / 2) * rx);
      toxinDps = Math.max(toxinDps, next.st.poisonDps);
      w.emit({ t: 'ring', x: next.x, y: next.y, r: next.r + 12, color: ELEMENT_COLORS.poison });
    } else if (toxin > 0 && next.alive) {
      applyPoison(w, next, toxinDps, toxin, depth);
    }
    pts.push(next.x, next.y);
    const nx = next.x;
    const ny = next.y;
    damageEnemy(w, next, d * targetMult(w, next), { src: 'chain', crit: false, depth });
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
    w.banner(t('fx.reactionNew'), '#ff9af0', `${def.icon} ${def.name}`, true);
    w.emit({ t: 'slowmo', dur: 0.5, scale: 0.35 });
  } else {
    w.emit({ t: 'text', x: e.x, y: e.y - e.r - 12, text: def.name.toUpperCase(), color: '#ff9af0' });
  }
  return true;
}

function reactionMult(w: World): number {
  return w.build.has('primal_chaos') ? 2 : 1;
}

function steamBurst(w: World, e: Enemy, power: number, depth: number): void {
  e.st.chill = 0;
  e.st.frozenT = 0;
  e.st.burnT = 0;
  const st = w.build.stats;
  explode(w, e.x, e.y, 80 * st.area, Math.max(power * 3, st.damage * 1.4) * st.elementPower * reactionMult(w), depth + 1, { color: '#e8f4ff' });
}

/** Fire meets poison: every stack erupts at once. */
function combustion(w: World, e: Enemy, depth: number): void {
  const st = w.build.stats;
  const stacks = e.st.poison;
  const power = Math.max(stacks * e.st.poisonDps * 3, st.damage * 1.2) * reactionMult(w);
  e.st.poison = 0;
  e.st.poisonT = 0;
  explode(w, e.x, e.y, (60 + stacks * 3) * st.area, power, depth + 1, { color: '#c6ff3d' });
}

export function applyBurn(w: World, e: Enemy, dps: number, depth: number): void {
  if (!e.alive || e.shieldHp > 0 || dps <= 0 || immune(e, 'fire')) return;
  if ((e.st.chill > 0 || e.st.frozenT > 0) && depth < MAX_DEPTH && tryReaction(w, 'steam_burst', e)) {
    steamBurst(w, e, dps, depth);
    return;
  }
  if (e.st.poison >= 3 && depth < MAX_DEPTH && tryReaction(w, 'combustion', e)) {
    combustion(w, e, depth);
    return;
  }
  e.st.burnDps = e.st.burnT > 0 ? Math.max(e.st.burnDps, dps) : dps;
  e.st.burnT = 3;
}

export function applyChill(w: World, e: Enemy, stacks: number, depth: number): void {
  if (!e.alive || e.shieldHp > 0 || immune(e, 'ice')) return;
  if (e.st.burnT > 0 && depth < MAX_DEPTH && tryReaction(w, 'steam_burst', e)) {
    steamBurst(w, e, e.st.burnDps, depth);
    return;
  }
  if (e.st.frozenT > 0) return;
  e.st.chill += stacks;
  e.st.chillT = 3;
  if (e.st.chill >= 3) {
    const st = w.build.stats;
    e.st.chill = 0;
    e.st.frozenT = (e.boss ? 0.6 : 1.8) * st.freezeDuration;
    w.run.frozenCount++;
    w.emit({ t: 'ring', x: e.x, y: e.y, r: e.r + 14, color: ELEMENT_COLORS.ice });
    w.emit({ t: 'sfx', name: 'freeze', vol: 0.5 });
    if (e.st.poison > 0 && tryReaction(w, 'necrosis', e)) {
      e.armor = Math.max(0, e.armor - 3 * reactionMult(w));
      e.st.poison = Math.min(st.poisonCap, e.st.poison * 2);
      e.st.poisonT = Math.max(e.st.poisonT, 4);
    }
    if (e.st.bleed > 0 && w.build.has('cold_blood')) {
      const burst = e.st.bleed * e.st.bleedDps * 4;
      e.st.bleed = 0;
      e.st.bleedT = 0;
      w.emit({ t: 'burst', x: e.x, y: e.y, color: '#ff2a55', n: 16, speed: 240 });
      damageEnemy(w, e, burst, { src: 'bleed', crit: false, depth: depth + 1 });
      if (!e.alive) return;
    }
    if (w.build.has('cold_snap') && !e.boss) {
      e.ky -= 260;
      w.emit({ t: 'ring', x: e.x, y: e.y, r: 34, color: '#e0f6ff' });
    }
    if (w.build.has('glacial_heart') && depth < 2) {
      const list = acquire();
      try {
        w.grid.query(e.x, e.y, 70 + 20 * w.build.power('glacial_heart'), list);
        for (const o of list) if (o !== e) applyChill(w, o, 1, depth + 1);
      } finally {
        release();
      }
    }
  }
}

export function applyBleed(w: World, e: Enemy, dps: number, stacks: number): void {
  if (!e.alive || e.shieldHp > 0) return;
  e.st.bleed = Math.min(w.build.stats.bleedCap, e.st.bleed + stacks);
  e.st.bleedT = 4;
  e.st.bleedDps = Math.max(e.st.bleedDps, dps);
}

/** Poison stacks up to the cap and refreshes; each stack ticks for `dps`, through armor. */
export function applyPoison(w: World, e: Enemy, dps: number, stacks: number, depth: number): void {
  if (!e.alive || e.shieldHp > 0 || dps <= 0 || stacks <= 0 || immune(e, 'poison')) return;
  if (e.st.burnT > 0 && e.st.poison + stacks >= 3 && depth < MAX_DEPTH && tryReaction(w, 'combustion', e)) {
    e.st.poison += stacks;
    e.st.poisonDps = Math.max(e.st.poisonDps, dps);
    combustion(w, e, depth);
    return;
  }
  e.st.poison = Math.min(w.build.stats.poisonCap, e.st.poison + stacks);
  e.st.poisonT = 5;
  e.st.poisonDps = e.st.poisonT > 0 ? Math.max(e.st.poisonDps, dps) : dps;
}
