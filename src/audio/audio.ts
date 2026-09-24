/**
 * Fully synthesized audio (no asset downloads). Layered one-shots per material
 * and event, with voice limiting so chain reactions never turn into noise, plus
 * a small generative music loop whose layers follow combat intensity.
 */
type Wave = OscillatorType;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private comp!: DynamicsCompressorNode;
  private noise!: AudioBuffer;
  private last: Record<string, number> = {};
  private voiceEnds: number[] = [];
  sfxVolume = 0.8;
  musicVolume = 0.5;
  intensity = 0;
  boss = false;
  private musicTimer: number | null = null;
  private nextNote = 0;
  private step = 0;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.comp);
    this.musicBus.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.setVolumes(this.sfxVolume, this.musicVolume);
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    if (!this.ctx) return;
    this.sfxBus.gain.value = sfx;
    this.musicBus.gain.value = music * 0.5;
  }

  private voice(dur: number): boolean {
    const now = this.ctx!.currentTime;
    this.voiceEnds = this.voiceEnds.filter((t) => t > now);
    if (this.voiceEnds.length > 26) return false;
    this.voiceEnds.push(now + dur);
    return true;
  }

  private tone(wave: Wave, f0: number, f1: number, dur: number, vol: number, delay = 0, bus?: AudioNode): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, delay = 0, bus?: AudioNode): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus ?? this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name: string, pitch = 1, vol = 1): void {
    const ctx = this.ctx;
    if (!ctx || this.sfxVolume <= 0) return;
    const now = ctx.currentTime;
    const minGap = name === 'hit' || name === 'wall' || name === 'pickup' ? 0.022 : 0.045;
    if ((this.last[name] ?? 0) + minGap > now) return;
    this.last[name] = now;
    const p = pitch * (0.97 + Math.random() * 0.06);
    const v = vol;
    switch (name) {
      case 'hit':
        if (!this.voice(0.08)) return;
        this.tone('triangle', 520 * p, 240 * p, 0.07, 0.22 * v);
        this.hiss(0.03, 0.08 * v, 'highpass', 3000, 2000);
        break;
      case 'crit':
        if (!this.voice(0.14)) return;
        this.tone('square', 900 * p, 420 * p, 0.1, 0.16 * v);
        this.tone('triangle', 1500 * p, 1400 * p, 0.08, 0.12 * v, 0.02);
        this.hiss(0.06, 0.12 * v, 'bandpass', 2500, 1200);
        break;
      case 'wall':
        if (!this.voice(0.04)) return;
        this.tone('sine', 820 * p, 700 * p, 0.035, 0.08 * v);
        break;
      case 'bumper':
        if (!this.voice(0.14)) return;
        this.tone('sine', 480 * p, 1100 * p, 0.12, 0.2 * v);
        break;
      case 'explode':
        if (!this.voice(0.45)) return;
        this.hiss(0.45, 0.5 * v, 'lowpass', 1400, 120);
        this.tone('sine', 110, 38, 0.35, 0.45 * v);
        break;
      case 'zap':
        if (!this.voice(0.1)) return;
        this.tone('sawtooth', 1900 * p, 700 * p, 0.08, 0.08 * v);
        this.hiss(0.08, 0.12 * v, 'highpass', 4000, 2500);
        break;
      case 'kill':
        if (!this.voice(0.1)) return;
        this.tone('triangle', 520 * p, 1300 * p, 0.08, 0.16 * v);
        break;
      case 'bigkill':
        if (!this.voice(0.4)) return;
        this.tone('triangle', 300 * p, 1200 * p, 0.2, 0.25 * v);
        this.hiss(0.35, 0.3 * v, 'lowpass', 2000, 200);
        break;
      case 'levelup':
        [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.12, 0.18, i * 0.07));
        break;
      case 'pickup':
        if (!this.voice(0.05)) return;
        this.tone('sine', 1100 * p, 1400 * p, 0.04, 0.05 * v);
        break;
      case 'coin':
        this.tone('square', 1500, 2100, 0.05, 0.05 * v);
        break;
      case 'core':
        [880, 1320, 1760].forEach((f, i) => this.tone('triangle', f, f, 0.1, 0.15, i * 0.05));
        break;
      case 'hurt':
        this.tone('sine', 160, 50, 0.3, 0.5);
        this.hiss(0.25, 0.3, 'lowpass', 900, 100);
        break;
      case 'shield':
        if (!this.voice(0.1)) return;
        this.tone('square', 310 * p, 290 * p, 0.08, 0.08 * v);
        this.tone('square', 467 * p, 440 * p, 0.08, 0.06 * v);
        break;
      case 'shieldbreak':
        this.hiss(0.25, 0.3, 'highpass', 3000, 800);
        this.tone('square', 600, 150, 0.2, 0.1);
        break;
      case 'launch':
        if (!this.voice(0.07)) return;
        this.tone('sine', 280, 620, 0.06, 0.12);
        break;
      case 'freeze':
        this.tone('sine', 2400, 1500, 0.15, 0.08 * v);
        this.tone('sine', 3100, 2200, 0.12, 0.05 * v, 0.03);
        break;
      case 'shatter':
        this.hiss(0.2, 0.3, 'highpass', 5000, 2000);
        this.tone('triangle', 2600, 900, 0.15, 0.1);
        break;
      case 'ignite':
        this.hiss(0.35, 0.2, 'bandpass', 700, 300);
        break;
      case 'split':
        this.tone('sine', 700, 1100, 0.06, 0.08);
        break;
      case 'portal':
      case 'blink':
        this.tone('sine', 300, 1200, 0.15, 0.1 * v);
        this.tone('sine', 1200, 300, 0.15, 0.06 * v, 0.05);
        break;
      case 'pulse':
        this.tone('sine', 80, 200, 0.6, 0.35);
        this.hiss(0.6, 0.15, 'lowpass', 300, 1200);
        break;
      case 'boss':
        this.tone('sawtooth', 55, 45, 1.2, 0.25);
        this.tone('sawtooth', 82, 70, 1.2, 0.15);
        this.hiss(1.0, 0.2, 'lowpass', 400, 80);
        break;
      case 'warning':
        [0, 0.3, 0.6].forEach((d) => {
          this.tone('square', 440, 440, 0.14, 0.1, d);
          this.tone('square', 330, 330, 0.14, 0.1, d + 0.15);
        });
        break;
      case 'event':
        [392, 523, 659].forEach((f, i) => this.tone('square', f, f, 0.1, 0.07, i * 0.06));
        break;
      case 'synergy':
        [523, 659, 784, 988].forEach((f, i) => this.tone('triangle', f, f * 1.01, 0.2, 0.16, i * 0.06));
        break;
      case 'evolve':
        [262, 330, 392, 523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.3, 0.18, i * 0.06));
        this.hiss(1.2, 0.2, 'bandpass', 800, 4000);
        break;
      case 'combo':
        this.tone('triangle', 660 * p, 990 * p, 0.12, 0.15);
        this.tone('triangle', 990 * p, 1320 * p, 0.12, 0.12, 0.06);
        break;
      case 'tier':
        this.tone('sawtooth', 300 * p, 900 * p, 0.18, 0.08);
        break;
      case 'surge':
        this.tone('sawtooth', 120, 800, 0.4, 0.2);
        this.hiss(0.5, 0.3, 'bandpass', 500, 3000);
        break;
      case 'victory':
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.2, i * 0.11));
        break;
      case 'defeat':
        [392, 330, 262, 196].forEach((f, i) => this.tone('triangle', f, f * 0.98, 0.3, 0.2, i * 0.18));
        break;
      case 'intercept':
        this.tone('square', 900, 400, 0.08, 0.08);
        break;
      case 'net':
        this.tone('sine', 400, 900, 0.1, 0.12);
        break;
      case 'crate':
        this.hiss(0.15, 0.25, 'bandpass', 600, 300);
        this.tone('triangle', 180, 90, 0.12, 0.15);
        break;
      case 'elite':
        this.tone('sawtooth', 150, 300, 0.3, 0.12);
        break;
      case 'click':
        this.tone('sine', 900, 700, 0.03, 0.1);
        break;
      case 'select':
        this.tone('triangle', 660, 990, 0.1, 0.15);
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ music
  startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.musicTimer = window.setInterval(() => this.schedule(), 50);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || this.musicVolume <= 0) return;
    const bpm = this.boss ? 138 : 118 + this.intensity * 12;
    const sixteenth = 60 / bpm / 4;
    // A minor pentatonic bass line, shifts up during bosses for tension
    const root = this.boss ? 49 : 55;
    const bassPat = [0, 0, 7, 0, 10, 0, 7, 5, 0, 0, 7, 0, 12, 10, 7, 5];
    const lead = [12, 15, 17, 19, 22, 19, 17, 15];
    while (this.nextNote < ctx.currentTime + 0.2) {
      const s = this.step % 16;
      const d = this.nextNote - ctx.currentTime;
      const bus = this.musicBus;
      if (s % 4 === 0) {
        this.tone('sine', 140, 42, 0.18, 0.5, d, bus); // kick
      }
      if (s % 2 === 0) {
        const f = root * Math.pow(2, bassPat[s] / 12);
        this.tone('triangle', f, f, sixteenth * 1.8, 0.16, d, bus);
      }
      if (this.intensity > 0.25 && s % 2 === 1) this.hiss(0.04, 0.05, 'highpass', 8000, 6000, d, bus);
      if (this.intensity > 0.5 && (s === 4 || s === 12)) this.hiss(0.12, 0.14, 'bandpass', 1800, 900, d, bus); // snare
      if ((this.intensity > 0.7 || this.boss) && s % 2 === 0) {
        const f = root * 4 * Math.pow(2, lead[(this.step / 2) % lead.length | 0] / 12);
        this.tone('square', f, f, sixteenth * 1.5, 0.035, d, bus);
      }
      this.nextNote += sixteenth;
      this.step++;
    }
  }
}
