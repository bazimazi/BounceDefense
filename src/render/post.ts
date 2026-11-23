import { H, W } from '../sim/types';

/**
 * Screen-space finishing: a cheap bloom and a cinematic grade, all GPU blits.
 *
 * The bright pass needs no pixel reads: drawing the downsampled frame onto itself with `multiply`
 * squares every channel, so dark floor art falls away while glows, sparks and lit cores survive.
 * Two blurred mips are then added back over the frame.
 */
export class PostFx {
  private small: HTMLCanvasElement | null = null;
  private tiny: HTMLCanvasElement | null = null;
  private grade: HTMLCanvasElement | null = null;
  private filters = false;
  /** Rolling frame interval, so a struggling device sheds the bloom pass instead of frames. */
  private avg = 16;
  private last = 0;
  private strain = 0;
  enabled = true;

  private ensure(): void {
    if (this.small) return;
    this.small = document.createElement('canvas');
    this.small.width = Math.round(W / 4); this.small.height = Math.round(H / 4);
    this.tiny = document.createElement('canvas');
    this.tiny.width = Math.round(W / 12); this.tiny.height = Math.round(H / 12);
    const probe = this.small.getContext('2d')!;
    this.filters = typeof probe.filter === 'string';
    this.grade = buildGrade();
  }

  /** Called once per drawn frame; turns bloom off for good when frames stay slow. */
  pace(now: number): void {
    if (this.last) {
      const dt = Math.min(100, now - this.last);
      this.avg += (dt - this.avg) * .05;
      this.strain = this.avg > 26 ? this.strain + 1 : Math.max(0, this.strain - 2);
      if (this.strain > 180) this.enabled = false;
    }
    this.last = now;
  }

  /** Adds the bloom of whatever is on `canvas` so far. `strength` scales the added light. */
  bloom(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, strength: number): void {
    // A canvas that is not laid out yet has no pixels to sample.
    if (!this.enabled || strength <= 0 || !canvas.width || !canvas.height) return;
    this.ensure();
    const small = this.small!, tiny = this.tiny!;
    const s = small.getContext('2d')!, t = tiny.getContext('2d')!;
    s.globalCompositeOperation = 'copy';
    s.imageSmoothingEnabled = true;
    s.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, small.width, small.height);
    // Bright pass: x², then x⁴ keeps only what is genuinely luminous.
    s.globalCompositeOperation = 'multiply';
    s.drawImage(small, 0, 0);
    s.drawImage(small, 0, 0);
    s.globalCompositeOperation = 'source-over';
    t.globalCompositeOperation = 'copy';
    if (this.filters) t.filter = 'blur(1.5px)';
    t.drawImage(small, 0, 0, tiny.width, tiny.height);
    t.filter = 'none';
    if (this.filters) {
      s.globalCompositeOperation = 'copy';
      s.filter = 'blur(1.2px)';
      s.drawImage(small, 0, 0);
      s.filter = 'none';
      s.globalCompositeOperation = 'source-over';
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .7 * strength;
    ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = .9 * strength;
    ctx.drawImage(tiny, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  /** Vignette, cool shadows and a warm center: one cached overlay over the playfield. */
  finish(ctx: CanvasRenderingContext2D, animate = true, grain = true): void {
    if (!this.grade) {
      if (typeof document === 'undefined') return;
      this.grade = buildGrade();
    }
    ctx.drawImage(this.grade, 0, 0, W, H);
    // Film grain at device resolution, re-seeded every frame unless motion is reduced.
    if (!grain) return;
    this.grain ??= ctx.createPattern(buildGrain(), 'repeat');
    if (this.grain) {
      const ox = animate ? Math.floor(Math.random() * 128) : 0, oy = animate ? Math.floor(Math.random() * 128) : 0;
      if (typeof DOMMatrix !== 'undefined') this.grain.setTransform(new DOMMatrix([1, 0, 0, 1, ox, oy]));
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = this.grain;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }
  }
  private grain: CanvasPattern | null = null;
}

function buildGrain(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random();
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v > .5 ? 255 : 0;
    img.data[i + 3] = Math.round(Math.abs(v - .5) * 2 * 11);
  }
  g.putImageData(img, 0, 0);
  return c;
}

function buildGrade(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W / 2; c.height = H / 2;
  const g = c.getContext('2d')!;
  g.scale(.5, .5);
  const vignette = g.createRadialGradient(W / 2, H * .46, H * .2, W / 2, H * .5, H * .72);
  vignette.addColorStop(0, '#00000000');
  vignette.addColorStop(.62, '#02040a22');
  vignette.addColorStop(1, '#010208a8');
  g.fillStyle = vignette; g.fillRect(0, 0, W, H);
  // A faint top-down key light: the field reads as lit from above the enemy spawn.
  const key = g.createLinearGradient(0, 0, 0, H);
  key.addColorStop(0, '#9fd8ff08'); key.addColorStop(.45, '#00000000'); key.addColorStop(1, '#00000018');
  g.fillStyle = key; g.fillRect(0, 0, W, H);
  return c;
}
