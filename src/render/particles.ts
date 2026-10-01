/**
 * Struct-of-arrays particle pool. Fixed capacity; when full, new low-priority
 * particles are dropped instead of evicting important ones.
 */
export class Particles {
  readonly cap: number;
  n = 0;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  life: Float32Array;
  max: Float32Array;
  size: Float32Array;
  drag: Float32Array;
  grav: Float32Array;
  color: string[];

  constructor(cap = 1200) {
    this.cap = cap;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.color = new Array(cap).fill('#fff');
  }

  spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, drag = 3, grav = 0, priority = false): void {
    if (this.n >= this.cap) {
      if (!priority) return;
      this.n--; // overwrite last
    }
    if (!priority && this.n > this.cap * 0.8 && Math.random() < 0.5) return;
    const i = this.n++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.max[i] = life;
    this.size[i] = size;
    this.color[i] = color;
    this.drag[i] = drag;
    this.grav[i] = grav;
  }

  burst(x: number, y: number, color: string, n: number, speed: number, size = 2.5, life = 0.5): void {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), color, 4);
    }
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const j = --this.n;
        this.x[i] = this.x[j];
        this.y[i] = this.y[j];
        this.vx[i] = this.vx[j];
        this.vy[i] = this.vy[j];
        this.life[i] = this.life[j];
        this.max[i] = this.max[j];
        this.size[i] = this.size[j];
        this.color[i] = this.color[j];
        this.drag[i] = this.drag[j];
        this.grav[i] = this.grav[j];
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= d;
      this.vy[i] = this.vy[i] * d + this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      i++;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.n; i++) {
      const t = this.life[i] / this.max[i];
      ctx.globalAlpha = t;
      ctx.fillStyle = this.color[i];
      const s = this.size[i] * (0.4 + 0.6 * t);
      const speed = Math.hypot(this.vx[i], this.vy[i]);
      if (speed > 65) {
        // Fast fragments stretch into sparks; slowing embers resolve into points.
        const stretch = Math.min(14, speed * .035);
        ctx.strokeStyle = this.color[i];
        ctx.lineWidth = Math.max(.7, s * .65);
        ctx.beginPath();
        ctx.moveTo(this.x[i], this.y[i]);
        ctx.lineTo(this.x[i] - this.vx[i] / speed * stretch, this.y[i] - this.vy[i] / speed * stretch);
        ctx.stroke();
      } else {
        ctx.fillRect(this.x[i] - s / 2, this.y[i] - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
