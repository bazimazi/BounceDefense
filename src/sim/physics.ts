import { angleDiff, clamp, closestOnSegment, reflect, type Vec2 } from '../core/math';
import { ballHitEnemy, sparkNearest } from './combat';
import {
  FIELD_TOP, FLOOR_Y, LAUNCHER_X, LAUNCHER_Y, TRAIL_LEN, W,
  type Ball, type Enemy, type Segment,
} from './types';
import { momentumTier, TIER_SPEED, type World } from './world';

/** Balls may never travel closer to horizontal than this (prevents endless side-to-side loops). */
export const MIN_DY = 0.14;
const HIT_COOLDOWN = 0.2;
const tmp: Vec2 = { x: 0, y: 0 };
const rv: Vec2 = { x: 0, y: 0 };

export function enforceAngle(b: { dx: number; dy: number }): void {
  const l = Math.hypot(b.dx, b.dy) || 1;
  b.dx /= l;
  b.dy /= l;
  if (Math.abs(b.dy) < MIN_DY) {
    const sy = b.dy >= 0 ? 1 : -1;
    const sx = b.dx >= 0 ? 1 : -1;
    b.dy = sy * MIN_DY;
    b.dx = sx * Math.sqrt(1 - MIN_DY * MIN_DY);
  }
}

export function effectiveTier(w: World, b: Ball): number {
  let t = momentumTier(b.momentum);
  if (w.combo.count >= 25 && w.build.has('combo_reactor')) t = Math.max(t, 2);
  return t;
}

export function ballSpeed(w: World, b: Ball): number {
  const st = w.build.stats;
  let s = st.speed * (1 + Math.min(st.wallAccel * b.wallBounces, 1)) * b.boost * TIER_SPEED[effectiveTier(w, b)];
  for (const e of w.fieldEnemies) {
    if (e.def.ai !== 'warden') continue;
    const dx = e.x - b.x;
    const dy = e.y - b.y;
    if (dx * dx + dy * dy < 115 * 115) s *= 0.55;
  }
  return s;
}

function steer(w: World, b: Ball, dt: number, spd: number): void {
  const st = w.build.stats;
  let ax = 0;
  let ay = 0;
  if (st.magnetism > 0) {
    w.grid.query(b.x, b.y, 170, w.q);
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of w.q) {
      if (!e.alive) continue;
      const dx = e.x - b.x;
      const dy = e.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd && dx * b.dx + dy * b.dy > 0) {
        bd = d2;
        best = e;
      }
    }
    if (best) {
      const want = Math.atan2(best.y - b.y, best.x - b.x);
      const cur = Math.atan2(b.dy, b.dx);
      const turn = clamp(angleDiff(cur, want), -st.magnetism * dt, st.magnetism * dt);
      const na = cur + turn;
      b.dx = Math.cos(na);
      b.dy = Math.sin(na);
    }
  }
  for (const o of w.obstacles) {
    if (o.kind !== 'well') continue;
    const dx = o.x - b.x;
    const dy = o.y - b.y;
    const d = Math.hypot(dx, dy);
    const range = o.r * 1.6;
    if (d < range && d > 1) {
      const pull = o.strength * (1 - d / range);
      ax += (dx / d) * pull;
      ay += (dy / d) * pull;
    }
  }
  for (const e of w.fieldEnemies) {
    const dx = e.x - b.x;
    const dy = e.y - b.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) continue;
    if (e.def.ai === 'magnet' && d < 150) {
      const pull = 650 * (1 - d / 150);
      ax += (dx / d) * pull;
      ay += (dy / d) * pull;
    } else if (e.def.id === 'boss_magnetar' && d < 320) {
      const pulse = e.t1 > 0;
      const pull = (pulse ? -2600 : 820 + e.phase * 300) * (1 - d / 320);
      ax += (dx / d) * pull;
      ay += (dy / d) * pull;
    }
  }
  if (w.event?.id === 'gravity_storm') ax += 380 * w.event.dir;
  if (ax !== 0 || ay !== 0) {
    b.dx += (ax * dt) / spd;
    b.dy += (ay * dt) / spd;
  }
  enforceAngle(b);
}

function recentlyHit(w: World, b: Ball, id: number): boolean {
  for (let i = 0; i < b.recentId.length; i++) {
    if (b.recentId[i] === id && w.time - b.recentT[i] < HIT_COOLDOWN) return true;
  }
  return false;
}

function markHit(w: World, b: Ball, id: number): void {
  b.recentId.push(id);
  b.recentT.push(w.time);
  if (b.recentId.length > 6) {
    b.recentId.shift();
    b.recentT.shift();
  }
}

export function onWallBounce(w: World, b: Ball, x: number, y: number, nx: number, ny: number, kind: Segment['kind'] | 'bumper' | 'crate'): void {
  const st = w.build.stats;
  const double = w.event?.id === 'double_bounce';
  b.wallBounces += double ? 2 : 1;
  b.bounceChain++;
  b.pierceLeft = st.pierce;
  b.pulse = 1;
  if (b.wallBounces > w.run.maxWallChain) w.run.maxWallChain = b.wallBounces;
  if (b.bounceChain > w.run.maxBounceChain) w.run.maxBounceChain = b.bounceChain;
  w.emit({ t: 'wall', x, y, nx, ny, color: kind === 'shield' ? '#8fa8ff' : w.trailColors[1] });
  if (kind !== 'bumper') w.emit({ t: 'sfx', name: kind === 'shield' ? 'shield' : 'wall', pitch: 1 + Math.min(b.wallBounces, 20) * 0.03, vol: 0.35 });
  if (double) sparkNearest(w, b.x, b.y, st.damage * 0.6, '#8fa8ff');
  for (const [bh, p] of w.bh) bh.onWall?.(w, b, p);
}

function collideSegments(w: World, b: Ball, segs: Segment[]): void {
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    closestOnSegment(b.x, b.y, s.ax, s.ay, s.bx, s.by, tmp);
    const dx = b.x - tmp.x;
    const dy = b.y - tmp.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= b.r * b.r) continue;
    let nx: number;
    let ny: number;
    const d = Math.sqrt(d2);
    if (d < 1e-6) {
      nx = -(s.by - s.ay);
      ny = s.bx - s.ax;
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      if (nx * b.dx + ny * b.dy > 0) {
        nx = -nx;
        ny = -ny;
      }
    } else {
      nx = dx / d;
      ny = dy / d;
    }
    b.x = tmp.x + nx * (b.r + 0.01);
    b.y = tmp.y + ny * (b.r + 0.01);
    if (b.dx * nx + b.dy * ny < 0) {
      reflect(b.dx, b.dy, nx, ny, rv);
      b.dx = rv.x;
      b.dy = rv.y;
      enforceAngle(b);
      if (s.ref) s.ref.flash = 1;
      onWallBounce(w, b, tmp.x, tmp.y, nx, ny, s.kind);
    }
  }
}

function bounceCircle(b: Ball, cx: number, cy: number, cr: number): { nx: number; ny: number } | null {
  const dx = b.x - cx;
  const dy = b.y - cy;
  const rr = cr + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return null;
  const d = Math.sqrt(d2) || 1;
  const nx = dx / d;
  const ny = dy / d;
  b.x = cx + nx * (rr + 0.01);
  b.y = cy + ny * (rr + 0.01);
  if (b.dx * nx + b.dy * ny < 0) {
    reflect(b.dx, b.dy, nx, ny, rv);
    b.dx = rv.x;
    b.dy = rv.y;
    enforceAngle(b);
  }
  return { nx, ny };
}

function collideObstacles(w: World, b: Ball): void {
  for (let i = 0; i < w.obstacles.length; i++) {
    const o = w.obstacles[i];
    switch (o.kind) {
      case 'bumper': {
        const n = bounceCircle(b, o.x, o.y, o.r);
        if (n) {
          o.flash = 1;
          b.boost = 1.35;
          if (!recentlyHit(w, b, -1000 - i)) {
            markHit(w, b, -1000 - i);
            w.addCombo(1);
            w.emit({ t: 'sfx', name: 'bumper' });
            onWallBounce(w, b, o.x + n.nx * o.r, o.y + n.ny * o.r, n.nx, n.ny, 'bumper');
          }
        }
        break;
      }
      case 'barrel': {
        if (!o.alive) break;
        const n = bounceCircle(b, o.x, o.y, o.r);
        if (n) w.detonateBarrel(o, 0);
        break;
      }
      case 'crate': {
        if (!o.alive) break;
        const cx = clamp(b.x, o.x, o.x + o.w);
        const cy = clamp(b.y, o.y, o.y + o.h);
        const dx = b.x - cx;
        const dy = b.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= b.r * b.r) break;
        let d = Math.sqrt(d2);
        let nx = dx;
        let ny = dy;
        if (d < 1e-6) {
          ny = b.dy > 0 ? -1 : 1;
          nx = 0;
          d = 1;
        }
        nx /= d;
        ny /= d;
        b.x = cx + nx * (b.r + 0.01);
        b.y = cy + ny * (b.r + 0.01);
        if (b.dx * nx + b.dy * ny < 0) {
          reflect(b.dx, b.dy, nx, ny, rv);
          b.dx = rv.x;
          b.dy = rv.y;
          enforceAngle(b);
          o.flash = 1;
          o.hp--;
          onWallBounce(w, b, cx, cy, nx, ny, 'crate');
          if (o.hp <= 0) {
            o.alive = false;
            o.respawn = 14;
            w.addCombo(2);
            w.emit({ t: 'burst', x: o.x + o.w / 2, y: o.y + o.h / 2, color: '#c9a36b', n: 16, speed: 220 });
            w.emit({ t: 'sfx', name: 'crate' });
          }
        }
        break;
      }
      case 'portal': {
        if (b.portalCd > 0) break;
        const inA = (b.x - o.ax) ** 2 + (b.y - o.ay) ** 2 < o.r * o.r;
        const inB = !inA && (b.x - o.bx) ** 2 + (b.y - o.by) ** 2 < o.r * o.r;
        if (inA || inB) {
          const [fx, fy, tx, ty] = inA ? [o.ax, o.ay, o.bx, o.by] : [o.bx, o.by, o.ax, o.ay];
          w.emit({ t: 'ring', x: fx, y: fy, r: 34, color: '#c77dff' });
          b.x = tx + b.dx * 2;
          b.y = ty + b.dy * 2;
          b.portalCd = 0.45;
          b.momentum += 2 * w.build.stats.momentumGain;
          b.trail.length = 0;
          w.addCombo(1);
          w.emit({ t: 'ring', x: tx, y: ty, r: 34, color: '#c77dff' });
          w.emit({ t: 'sfx', name: 'portal' });
        }
        break;
      }
      case 'oil': {
        if (o.burning > 0) break;
        if (!w.build.has('evo_inferno') && w.cfg.core !== 'pyro') break;
        if ((b.x - o.x) ** 2 + (b.y - o.y) ** 2 < o.r * o.r) {
          o.burning = 5;
          w.emit({ t: 'sfx', name: 'ignite' });
        }
        break;
      }
      default:
        break;
    }
  }
}

function collideEnemies(w: World, b: Ball): void {
  w.grid.query(b.x, b.y, b.r, w.q);
  for (const e of w.q) {
    if (!e.alive || e.spawnT < 0.1) continue;
    const dx = b.x - e.x;
    const dy = b.y - e.y;
    const rr = e.r + b.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) continue;
    if (recentlyHit(w, b, e.id)) continue;
    markHit(w, b, e.id);
    const d = Math.sqrt(d2) || 1;
    const nx = dx / d;
    const ny = dy / d;
    // Shielder: frontal (downward-facing) shield deflects hits from below.
    if (e.def.ai === 'shielder' && e.phase < 3 && ny > 0.45 && e.st.frozenT <= 0) {
      bounceCircle(b, e.x, e.y, e.r);
      e.flash = 0.05;
      e.phase++; // shields crack after 3 blocks
      if (e.phase >= 3) {
        w.emit({ t: 'burst', x: e.x, y: e.y + e.r, color: '#4fd1ff', n: 14, speed: 200 });
        w.emit({ t: 'text', x: e.x, y: e.y - e.r - 8, text: 'SHIELD BROKEN', color: '#4fd1ff' });
        w.emit({ t: 'sfx', name: 'shieldbreak' });
      }
      w.emit({ t: 'wall', x: e.x + nx * e.r, y: e.y + ny * e.r, nx, ny, color: '#4fd1ff' });
      w.emit({ t: 'sfx', name: 'shield', vol: 0.5 });
      b.bounceChain++;
      return;
    }
    const passes = ballHitEnemy(w, b, e);
    if (!passes) {
      if (b.dx * nx + b.dy * ny < 0) {
        reflect(b.dx, b.dy, nx, ny, rv);
        b.dx = rv.x;
        b.dy = rv.y;
      }
      if (e.alive) {
        b.x = e.x + nx * (rr + 0.5);
        b.y = e.y + ny * (rr + 0.5);
      }
      if (e.def.directMult) b.boost = Math.max(b.boost, 1.15);
      enforceAngle(b);
    }
    return;
  }
}

function collideProjectiles(w: World, b: Ball): void {
  for (const p of w.projectiles) {
    if (!p.alive) continue;
    const rr = p.r + b.r + 4;
    if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < rr * rr) {
      p.alive = false;
      w.addCombo(1);
      w.emit({ t: 'burst', x: p.x, y: p.y, color: p.color, n: 10, speed: 180 });
      w.emit({ t: 'sfx', name: 'intercept' });
    }
  }
}

function handleFloor(w: World, b: Ball): void {
  for (const [bh, p] of w.bh) {
    if (bh.onFloor?.(w, b, p)) return;
  }
  if (b.floorBounces > 0) {
    b.floorBounces--;
    b.y = FLOOR_Y - 0.5;
    b.dy = -Math.abs(b.dy);
    w.emit({ t: 'wall', x: b.x, y: FLOOR_Y, nx: 0, ny: -1, color: '#7dff8a' });
    w.emit({ t: 'sfx', name: 'net' });
    return;
  }
  if (b.kind !== 'main') {
    b.dead = true;
    w.emit({ t: 'burst', x: b.x, y: FLOOR_Y, color: w.trailColors[1], n: 5, speed: 90 });
    return;
  }
  // preserve momentum for the next launch if the build allows it
  let keep = 0;
  if (w.build.has('perpetual_motion')) keep = b.momentum;
  else if (w.build.has('stabilizer')) {
    const t = momentumTier(b.momentum);
    keep = t > 0 ? [0, 5, 12, 25, 45][t - 1] : 0;
  }
  if (keep > 0) w.savedMomentum.push(keep);
  b.state = 'returning';
  b.returnT = 0;
  b.rx = b.x;
  b.ry = FLOOR_Y;
  b.trail.length = 0;
}

export function stepBall(w: World, b: Ball, dt: number): void {
  if (b.state === 'returning') {
    b.returnT += dt * 4;
    const t = Math.min(1, b.returnT);
    b.x = b.rx + (LAUNCHER_X - b.rx) * t;
    b.y = b.ry + (LAUNCHER_Y - 16 - b.ry) * t;
    if (t >= 1) {
      b.dead = true;
      let mainInFlight = 0;
      for (const o of w.balls) if (o.kind === 'main' && !o.dead && o !== b) mainInFlight++;
      w.hand = Math.min(w.hand + 1, Math.max(0, w.maxBallsAllowed() - mainInFlight));
    }
    return;
  }
  if (b.life > 0) {
    b.life -= dt;
    if (b.life <= 0) {
      b.dead = true;
      w.emit({ t: 'burst', x: b.x, y: b.y, color: w.trailColors[1], n: 6, speed: 90 });
      return;
    }
  }
  b.portalCd -= dt;
  b.boost = 1 + (b.boost - 1) * Math.exp(-dt * 2.5);
  b.pulse = Math.max(0, b.pulse - dt * 6);

  let spd = ballSpeed(w, b);
  steer(w, b, dt, spd);
  const prevTier = momentumTier(b.momentum);

  let remaining = spd * dt;
  const maxStep = Math.max(2, b.r * 0.6);
  while (remaining > 0 && !b.dead && b.state === 'flight') {
    const s = Math.min(remaining, maxStep);
    remaining -= s;
    b.x += b.dx * s;
    b.y += b.dy * s;
    collideSegments(w, b, w.segments);
    if (w.dynSegments.length) collideSegments(w, b, w.dynSegments);
    collideObstacles(w, b);
    collideEnemies(w, b);
    if (w.projectiles.length) collideProjectiles(w, b);
    if (b.y < FIELD_TOP + b.r - 2) b.y = FIELD_TOP + b.r; // safety clamp
    if (b.x < b.r - 2 || b.x > W - b.r + 2) b.x = clamp(b.x, b.r, W - b.r);
    if (b.y > FLOOR_Y) handleFloor(w, b);
  }

  const tier = momentumTier(b.momentum);
  if (tier > prevTier && b.kind === 'main') {
    if (tier > w.run.maxMomentumTier) w.run.maxMomentumTier = tier;
    w.bus.emit('momentum', { tier });
    w.emit({ t: 'text', x: b.x, y: b.y - 20, text: ['', 'CHARGED', 'OVERCHARGED', 'HYPER!', 'UNSTABLE!!'][tier], color: ['#fff', '#7ad7ff', '#ffe066', '#ff7ad9', '#ff3b3b'][tier] });
    w.emit({ t: 'ring', x: b.x, y: b.y, r: 30 + tier * 10, color: ['#fff', '#7ad7ff', '#ffe066', '#ff7ad9', '#ff3b3b'][tier] });
    w.emit({ t: 'sfx', name: 'tier', pitch: 1 + tier * 0.15 });
  }

  // trail sampling by distance keeps trails consistent at any speed
  const tr = b.trail;
  const n = tr.length;
  if (n < 2 || (tr[n - 2] - b.x) ** 2 + (tr[n - 1] - b.y) ** 2 > 36) {
    tr.push(b.x, b.y);
    if (tr.length > TRAIL_LEN * 2) tr.splice(0, 2);
  }
}

// ------------------------------------------------------------------ aim preview
/**
 * Traces the path a launched ball would take (walls, deflectors, bumpers, crates),
 * stopping at the first enemy. Writes polyline points to `out`. Uses the exact same
 * reflection rules as the real simulation so the preview never lies.
 */
export function traceAim(w: World, maxLen: number, maxBounces: number, out: number[]): { ex: number; ey: number; enemy: Enemy | null } {
  out.length = 0;
  const g = { x: LAUNCHER_X, y: LAUNCHER_Y - 16, dx: w.aim.dx, dy: w.aim.dy, r: w.build.stats.radius };
  out.push(g.x, g.y);
  let len = 0;
  let bounces = 0;
  const step = 4;
  const segs = w.dynSegments.length ? w.segments.concat(w.dynSegments) : w.segments;
  while (len < maxLen) {
    g.x += g.dx * step;
    g.y += g.dy * step;
    len += step;
    let bounced = false;
    for (const s of segs) {
      closestOnSegment(g.x, g.y, s.ax, s.ay, s.bx, s.by, tmp);
      const dx = g.x - tmp.x;
      const dy = g.y - tmp.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= g.r * g.r) continue;
      const d = Math.sqrt(d2) || 1;
      const nx = dx / d;
      const ny = dy / d;
      g.x = tmp.x + nx * (g.r + 0.01);
      g.y = tmp.y + ny * (g.r + 0.01);
      if (g.dx * nx + g.dy * ny < 0) {
        reflect(g.dx, g.dy, nx, ny, rv);
        g.dx = rv.x;
        g.dy = rv.y;
        enforceAngle(g);
        bounced = true;
      }
    }
    for (const o of w.obstacles) {
      if (o.kind === 'bumper' || (o.kind === 'barrel' && o.alive)) {
        const dx = g.x - o.x;
        const dy = g.y - o.y;
        const rr = o.r + g.r;
        if (dx * dx + dy * dy < rr * rr) {
          const d = Math.hypot(dx, dy) || 1;
          const nx = dx / d;
          const ny = dy / d;
          g.x = o.x + nx * (rr + 0.01);
          g.y = o.y + ny * (rr + 0.01);
          if (g.dx * nx + g.dy * ny < 0) {
            reflect(g.dx, g.dy, nx, ny, rv);
            g.dx = rv.x;
            g.dy = rv.y;
            enforceAngle(g);
            bounced = true;
          }
        }
      } else if (o.kind === 'crate' && o.alive) {
        const cx = clamp(g.x, o.x, o.x + o.w);
        const cy = clamp(g.y, o.y, o.y + o.h);
        const dx = g.x - cx;
        const dy = g.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < g.r * g.r) {
          const d = Math.sqrt(d2) || 1;
          const nx = d2 > 0 ? dx / d : 0;
          const ny = d2 > 0 ? dy / d : 1;
          g.x = cx + nx * (g.r + 0.01);
          g.y = cy + ny * (g.r + 0.01);
          if (g.dx * nx + g.dy * ny < 0) {
            reflect(g.dx, g.dy, nx, ny, rv);
            g.dx = rv.x;
            g.dy = rv.y;
            enforceAngle(g);
            bounced = true;
          }
        }
      }
    }
    if (bounced) {
      out.push(g.x, g.y);
      bounces++;
      if (bounces > maxBounces) return { ex: g.x, ey: g.y, enemy: null };
    }
    w.grid.query(g.x, g.y, g.r, w.q2);
    for (const e of w.q2) {
      if (e.alive && (e.x - g.x) ** 2 + (e.y - g.y) ** 2 < (e.r + g.r) ** 2) {
        out.push(g.x, g.y);
        return { ex: g.x, ey: g.y, enemy: e };
      }
    }
    if (g.y > FLOOR_Y) break;
  }
  out.push(g.x, g.y);
  return { ex: g.x, ey: g.y, enemy: null };
}
