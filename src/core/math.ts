export const TAU = Math.PI * 2;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const dist2 = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};
export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.sqrt(dist2(ax, ay, bx, by));

export interface Vec2 {
  x: number;
  y: number;
}

/** Closest point on segment AB to P, written into `out`. Returns t in [0,1]. */
export function closestOnSegment(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number,
  out: Vec2,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const l2 = abx * abx + aby * aby;
  let t = l2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / l2 : 0;
  t = clamp(t, 0, 1);
  out.x = ax + abx * t;
  out.y = ay + aby * t;
  return t;
}

/** Reflect direction (dx,dy) about unit normal (nx,ny). Writes into out. */
export function reflect(dx: number, dy: number, nx: number, ny: number, out: Vec2): void {
  const d = dx * nx + dy * ny;
  out.x = dx - 2 * d * nx;
  out.y = dy - 2 * d * ny;
}

export function normalize(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  if (l > 1e-9) {
    v.x /= l;
    v.y /= l;
  }
  return v;
}

/** Rotate a unit vector by angle (radians). */
export function rotate(v: Vec2, a: number): Vec2 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = v.x * c - v.y * s;
  v.y = v.x * s + v.y * c;
  v.x = x;
  return v;
}

/** Signed smallest difference between two angles. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export function formatNum(n: number): string {
  n = Math.round(n);
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString('en-US');
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
