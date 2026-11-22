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
  private musicFilter!: BiquadFilterNode;

  unlock(): void {
    if (this.ctx) {
      // Firefox rejects a pending resume when the page unloads; that is not an error.
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 16;
    this.comp.ratio.value = 5;
    this.comp.attack.value = .004;
    this.comp.release.value = .18;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.gain.value = this.musicBus.gain.value = 0;
    const rumbleCut = ctx.createBiquadFilter();
    rumbleCut.type = 'highpass'; rumbleCut.frequency.value = 32; rumbleCut.Q.value = .5;
    this.sfxBus.connect(rumbleCut); rumbleCut.connect(this.comp);
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 3200; this.musicFilter.Q.value = .5;
    this.musicBus.connect(this.musicFilter); this.musicFilter.connect(this.comp);
    // A short stereo room adds depth without blurring the attack of rapid impacts.
    const room = ctx.createConvolver();
    const impulse = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * .72), ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3.5) * .4;
    }
    room.buffer = impulse;
    const roomTone = ctx.createBiquadFilter(); roomTone.type = 'lowpass'; roomTone.frequency.value = 3600;
    const sfxSend = ctx.createGain(); sfxSend.gain.value = .13;
    const musicSend = ctx.createGain(); musicSend.gain.value = .28;
    rumbleCut.connect(sfxSend); sfxSend.connect(room);
    this.musicFilter.connect(musicSend); musicSend.connect(room);
    room.connect(roomTone); roomTone.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.setVolumes(this.sfxVolume, this.musicVolume);
  }

  /** Silences everything while the app is in the background (phones keep WebAudio running otherwise). */
  setBackground(hidden: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (hidden && ctx.state === 'running') ctx.suspend().catch(() => {});
    else if (!hidden && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(sfx, now, .025);
    this.musicBus.gain.setTargetAtTime(music * 0.5, now, .04);
  }

  private voice(dur: number, important = false): boolean {
    const now = this.ctx!.currentTime;
    this.voiceEnds = this.voiceEnds.filter((t) => t > now);
    if (this.voiceEnds.length >= (important ? 32 : 26)) return false;
    this.voiceEnds.push(now + dur);
    return true;
  }

  private tone(wave: Wave, f0: number, f1: number, dur: number, vol: number, delay = 0, bus?: AudioNode, pan = 0): void {
    if (vol <= 0) return;
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
    const destination = bus ?? this.sfxBus;
    const stereo = pan ? ctx.createStereoPanner() : null;
    if (stereo) { stereo.pan.value = pan; g.connect(stereo); stereo.connect(destination); }
    else g.connect(destination);
    o.onended = () => { o.disconnect(); g.disconnect(); stereo?.disconnect(); };
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, delay = 0, bus?: AudioNode): void {
    if (vol <= 0) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
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
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** A struck resonator: a soft fundamental and a short, slightly inharmonic overtone. */
  private chime(f: number, dur: number, vol: number, delay = 0, bus?: AudioNode, pan = 0): void {
    this.tone('sine', f, f * .998, dur, vol, delay, bus, pan);
    this.tone('sine', f * 2.005, f * 2, dur * .43, vol * .27, delay, bus, -pan);
    this.tone('sine', f * 3.98, f * 4, dur * .16, vol * .08, delay, bus, pan);
  }

  private pad(f: number, dur: number, delay: number, pan: number): void {
    const ctx = this.ctx!, t = ctx.currentTime + delay;
    const gain = ctx.createGain(); const filter = ctx.createBiquadFilter();
    const stereo = ctx.createStereoPanner(); stereo.pan.value = pan;
    filter.type = 'lowpass'; filter.frequency.value = 900 + this.intensity * 900;
    gain.gain.setValueAtTime(.0001, t); gain.gain.linearRampToValueAtTime(.055, t + .25);
    gain.gain.setTargetAtTime(.0001, t + dur * .65, dur * .12);
    filter.connect(gain); gain.connect(stereo); stereo.connect(this.musicBus);
    for (const detune of [-5, 5]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = detune;
      o.connect(filter); o.start(t); o.stop(t + dur + .2);
      o.onended = () => { o.disconnect(); if (detune === 5) { filter.disconnect(); gain.disconnect(); stereo.disconnect(); } };
    }
  }

  play(name: string, pitch = 1, vol = 1): void {
    const ctx = this.ctx;
    if (!ctx || this.sfxVolume <= 0 || vol <= 0) return;
    const now = ctx.currentTime;
    const minGap = name === 'hit' || name === 'wall' || name === 'pickup' ? 0.022 : 0.045;
    if ((this.last[name] ?? -Infinity) + minGap > now) return;
    const important = ['hurt', 'boss', 'warning', 'victory', 'defeat', 'levelup', 'evolve', 'relic', 'select', 'click'].includes(name);
    if (!this.voice(important ? 1.5 : .35, important)) return;
    this.last[name] = now;
    const p = pitch * (0.97 + Math.random() * 0.06);
    const v = vol;
    switch (name) {
      case 'resonate':
        this.chime(660 * p, .38, .17 * v);
        this.chime(990 * p, .24, .05 * v, .045);
        break;
      case 'power':
        this.tone('triangle', 220, 880, .16, .2 * v);
        this.hiss(.12, .12 * v, 'highpass', 800, 3200);
        break;
      case 'recall':
        this.tone('sine', 1100, 220, .3, .16 * v);
        this.tone('triangle', 880, 440, .24, .08 * v, .03);
        break;
      case 'starfall':
        [330, 494, 659, 988, 1318].forEach((f, i) => this.tone('sine', f, f * 1.005, .5, .12 * v, i * .055));
        this.hiss(.65, .2 * v, 'bandpass', 3200, 240);
        this.tone('sine', 100, 40, .7, .25 * v);
        break;
      case 'hit':
        this.tone('sine', 240 * p, 95 * p, .065, .2 * v);
        this.chime(740 * p, .09, .09 * v);
        this.hiss(.018, .065 * v, 'bandpass', 2600, 1600);
        break;
      case 'crit':
        this.tone('triangle', 450 * p, 110 * p, .12, .19 * v);
        this.chime(1480 * p, .18, .13 * v, .008);
        this.hiss(0.06, 0.12 * v, 'bandpass', 2500, 1200);
        break;
      case 'wall':
        this.chime(880 * p, .075, .065 * v);
        break;
      case 'bumper':
        this.tone('sine', 230 * p, 740 * p, .085, .16 * v);
        this.chime(1175 * p, .26, .14 * v, .012);
        break;
      case 'explode':
        this.hiss(.36, .34 * v, 'lowpass', 1800, 110);
        this.hiss(.05, .17 * v, 'bandpass', 2800, 800);
        this.tone('sine', 135, 38, .4, .4 * v);
        this.tone('triangle', 75, 45, .22, .12 * v, .025);
        break;
      case 'zap':
        this.tone('sawtooth', 1900 * p, 700 * p, 0.08, 0.08 * v);
        this.hiss(0.08, 0.12 * v, 'highpass', 4000, 2500);
        break;
      case 'kill':
        this.chime(660 * p, .13, .11 * v);
        this.hiss(.055, .06 * v, 'bandpass', 1800, 420);
        break;
      case 'bigkill':
        this.tone('triangle', 300 * p, 1200 * p, 0.2, 0.25 * v);
        this.hiss(0.35, 0.3 * v, 'lowpass', 2000, 200);
        break;
      case 'levelup':
        [523, 659, 784, 1046].forEach((f, i) => this.chime(f, .42, .13 * v, i * .075));
        break;
      case 'pickup':
        this.chime(1320 * p, .085, .045 * v);
        break;
      case 'coin':
        this.chime(1760 * p, .13, .06 * v);
        break;
      case 'core':
        [880, 1320, 1760].forEach((f, i) => this.chime(f, .32, .12 * v, i * .06));
        break;
      case 'hurt':
        this.tone('sine', 160, 50, 0.3, 0.5);
        this.hiss(0.25, 0.3, 'lowpass', 900, 100);
        break;
      case 'shield':
        this.tone('square', 310 * p, 290 * p, 0.08, 0.08 * v);
        this.tone('square', 467 * p, 440 * p, 0.08, 0.06 * v);
        break;
      case 'shieldbreak':
        this.hiss(0.25, 0.3, 'highpass', 3000, 800);
        this.tone('square', 600, 150, 0.2, 0.1);
        break;
      case 'launch':
        this.tone('sine', 170 * p, 530 * p, .075, .17 * v);
        this.hiss(.055, .08 * v, 'bandpass', 900, 3400);
        break;
      case 'freeze':
        [1760, 2349, 3136].forEach((f, i) => this.chime(f, .22, .055 * v, i * .025));
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
        this.tone('triangle', 73.4, 55, 1.2, .24 * v);
        this.tone('triangle', 110, 82.4, 1.1, .15 * v, .06);
        this.tone('sine', 55, 36.7, 1.3, .26 * v);
        this.hiss(.9, .15 * v, 'lowpass', 600, 80);
        break;
      case 'warning':
        [0, 0.3, 0.6].forEach((d) => {
          this.tone('triangle', 440, 440, .14, .13 * v, d);
          this.tone('sine', 330, 330, .14, .1 * v, d + .15);
        });
        break;
      case 'event':
        [392, 523, 659].forEach((f, i) => this.tone('square', f, f, 0.1, 0.07, i * 0.06));
        break;
      case 'synergy':
        [523, 659, 784, 988].forEach((f, i) => this.chime(f, .46, .14 * v, i * .065));
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
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.chime(f, .65, .16 * v, i * .12));
        [262, 330, 392].forEach(f => this.tone('triangle', f, f, 1.1, .07 * v, .35));
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
        this.tone('sine', 1200, 800, .025, .065 * v);
        this.hiss(.012, .025 * v, 'highpass', 4000, 2200);
        break;
      case 'select':
        this.chime(660, .16, .1 * v);
        this.chime(990, .22, .085 * v, .045);
        break;
      case 'poison':
        this.hiss(0.35, 0.22 * v, 'bandpass', 900, 300);
        this.tone('sine', 220, 140, 0.25, 0.1 * v);
        break;
      case 'mine':
        this.tone('square', 1400 * p, 1400 * p, 0.04, 0.06 * v);
        break;
      case 'timestop':
        this.tone('sine', 880, 110, 0.9, 0.22);
        this.tone('triangle', 1320, 165, 0.9, 0.1, 0.05);
        this.hiss(0.8, 0.12, 'lowpass', 2000, 200);
        break;
      case 'relic':
        [392, 494, 587, 784, 988].forEach((f, i) => this.tone('triangle', f, f * 1.005, 0.32, 0.14, i * 0.07));
        this.hiss(0.6, 0.08, 'bandpass', 2000, 5000);
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
    const energy = Math.max(0, Math.min(1, this.intensity));
    this.musicFilter.frequency.setTargetAtTime(1800 + energy * 3600 + (this.boss ? 1200 : 0), ctx.currentTime, .3);
    // Am / Dm / C / G: two bars per harmony, with an eight-bar melodic answer.
    const progression = [0, -5, 3, -2];
    const bassPat = [0, 0, 12, 0, 7, 0, 0, 12, 0, 0, 7, 0, 12, 0, 7, 0];
    const melody = [12, 7, 14, 15, 19, 14, 7, 10, 12, 19, 15, 14, 7, 10, 7, 0];
    // Background tabs throttle the timer; skip missed notes instead of playing them all at once.
    if (this.nextNote < ctx.currentTime) this.nextNote = ctx.currentTime + 0.05;
    while (this.nextNote < ctx.currentTime + 0.2) {
      const s = this.step % 16;
      const d = this.nextNote - ctx.currentTime;
      const bus = this.musicBus;
      const chord = Math.floor(this.step / 32) % 4;
      const root = (this.boss ? 49 : 55) * Math.pow(2, progression[chord] / 12);
      if (this.step % 32 === 0) {
        const third = chord < 2 ? 3 : 4;
        [0, third, 7, 14].forEach((note, i) => this.pad(root * 4 * Math.pow(2, note / 12), sixteenth * 32, d, (i - 1.5) * .32));
      }
      if (s === 0 || s === 8 || (energy > .45 && (s === 6 || s === 14))) {
        this.tone('sine', 155, 43, .2, .38, d, bus);
        this.hiss(.017, .045, 'lowpass', 1800, 600, d, bus);
      }
      if (s % 2 === 0 || (this.boss && s === 15)) {
        const f = root * Math.pow(2, bassPat[s] / 12);
        this.tone('triangle', f, f * .997, sixteenth * 1.7, .17, d, bus);
        this.tone('sine', f / 2, f / 2, sixteenth * 1.4, .1, d, bus);
      }
      if (energy > .2 && s % 2 === 1) this.hiss(s === 15 ? .1 : .035, s % 4 === 3 ? .045 : .025, 'highpass', 7800, 5500, d, bus);
      if ((energy > .4 || this.boss) && (s === 4 || s === 12)) {
        this.hiss(.11, .1, 'bandpass', 1900, 1000, d, bus);
        this.tone('triangle', 185, 115, .09, .075, d, bus);
      }
      if (s % 4 === 2 || ((energy > .7 || this.boss) && s % 4 === 0)) {
        let note = melody[Math.floor(this.step / 2) % melody.length];
        if (chord >= 2 && note % 12 === 3) note++;
        const f = root * 4 * Math.pow(2, note / 12);
        this.chime(f, sixteenth * 2.8, .045 + energy * .025, d, bus, s % 4 ? -.35 : .35);
      }
      this.nextNote += sixteenth;
      this.step++;
    }
  }
}
