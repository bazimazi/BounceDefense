import { AudioEngine } from './audio/audio';
import { analytics } from './core/analytics';
import { clamp } from './core/math';
import { Rng } from './core/rng';
import { createDebugPanel } from './debug/debug';
import { applyRun, researchFlags, runConfig } from './meta/progress';
import { loadProfile, safeLocalStorage, saveProfile } from './meta/profile';
import type { Profile } from './meta/types';
import { Renderer } from './render/renderer';
import { botChoose, botStep, defaultConfig, FULL_POOL } from './sim/bot';
import { buildName } from './sim/build';
import type { Offer } from './sim/offers';
import { DEFENSE_Y, LAUNCHER_X, LAUNCHER_Y, SIM_DT } from './sim/types';
import { World } from './sim/world';
import { UI } from './ui/screens';

export interface RunOptions {
  arena: string;
  difficulty: number;
  pacts: string[];
  seed?: number;
  daily?: boolean;
}

/** Owns the app lifecycle: menus, runs, input, the frame loop, saving. */
export class Game {
  readonly store = safeLocalStorage();
  profile: Profile = loadProfile(this.store);
  readonly audio = new AudioEngine();
  readonly renderer: Renderer;
  readonly ui: UI;
  world: World | null = null;
  private demo: World | null = null;
  private demoRng = new Rng(99);
  private mode: 'menu' | 'run' = 'menu';
  private paused = false;
  private acc = 0;
  private last = 0;
  private slow = { t: 0, scale: 1 };
  private pointer = { id: -1, sx: 0, sy: 0 };
  private tut = { launched: false, t: 0, eliteHint: 0, surgeHinted: false, holdHinted: false, idle: 0 };
  private debugEl: HTMLElement | null = null;
  private runOpts: RunOptions | null = null;

  constructor(private canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.ui = new UI(uiRoot, this);
  }

  start(): void {
    const onResize = () => this.ui.layout(this.renderer.resize());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    onResize();
    this.bindInput();
    this.applySettings();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'run' && !this.paused && this.world?.state === 'playing') this.pause();
      if (document.hidden) this.save();
    });
    this.ui.home();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ------------------------------------------------------------------ profile
  save(): void {
    saveProfile(this.store, this.profile);
  }

  flags(): string[] {
    return researchFlags(this.profile);
  }

  applySettings(): void {
    const s = this.profile.settings;
    this.audio.setVolumes(s.sfx, s.music);
    this.renderer.opts.shake = s.shake;
    this.renderer.opts.damageNumbers = s.damageNumbers;
    this.renderer.opts.reducedFlashes = s.reducedFlashes;
    this.renderer.opts.previewBounces = this.flags().includes('scope') ? 2 : 1;
    const wantDebug = s.debug || new URLSearchParams(location.search).has('debug');
    if (wantDebug && !this.debugEl) {
      this.debugEl = createDebugPanel(this);
      document.getElementById('app')!.append(this.debugEl);
    } else if (!wantDebug && this.debugEl) {
      this.debugEl.remove();
      this.debugEl = null;
    }
  }

  buildName(): string {
    return this.world ? buildName(this.world.build) : '';
  }

  // ------------------------------------------------------------------ modes
  toMenu(): void {
    this.mode = 'menu';
    this.world = null;
    this.paused = false;
    this.ui.hideHud();
    this.audio.intensity = 0.1;
    this.audio.boss = false;
    if (!this.demo) this.newDemo();
  }

  private newDemo(): void {
    this.renderer.reset();
    const arenas = ['proving', 'foundry', 'rift'];
    this.demo = new World(defaultConfig({
      seed: this.demoRng.int(1, 1e9), arena: this.demoRng.pick(arenas), core: this.demoRng.pick(['striker', 'pyro', 'tesla', 'cryo']),
      pool: FULL_POOL,
    }));
    this.demo.hp = this.demo.maxHp = 400;
  }

  startRun(opts: RunOptions): void {
    this.audio.unlock();
    this.audio.startMusic();
    this.runOpts = opts;
    const seed = opts.seed ?? (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    const cfg = runConfig(this.profile, { ...opts, seed });
    this.world = new World(cfg);
    this.demo = null;
    this.renderer.reset();
    this.mode = 'run';
    this.paused = false;
    this.acc = 0;
    this.slow = { t: 0, scale: 1 };
    this.tut = { launched: false, t: 0, eliteHint: 0, surgeHinted: false, holdHinted: false, idle: 0 };
    this.ui.hud();
    const w = this.world;
    w.bus.on('levelUp', () => this.ui.levelUp(w));
    w.bus.on('over', ({ victory }) => {
      if (victory && !w.director.endless) this.ui.victoryChoice(w);
      else this.finishRun();
    });
    w.bus.on('evolution', () => this.ui.hint(null));
    analytics.emit('RunStarted', { arena: cfg.arena, difficulty: cfg.difficulty, core: cfg.core, pacts: cfg.pacts, seed: cfg.seed });
  }

  onOfferChosen(o: Offer): void {
    const w = this.world;
    if (!w) return;
    analytics.emit('UpgradeSelected', {
      id: o.kind === 'upgrade' || o.kind === 'evolution' ? o.id : o.kind,
      level: o.kind === 'upgrade' ? o.level : 1,
      offered: w.offers.map((x) => (x.kind === 'upgrade' || x.kind === 'evolution' ? x.id : x.kind)),
      runTime: w.time,
    });
    w.choose(o);
  }

  pause(): void {
    if (this.mode !== 'run' || !this.world || this.paused) return;
    this.paused = true;
    this.world.cancelAim();
    this.ui.pauseMenu(this.world);
  }

  resume(): void {
    this.paused = false;
    this.last = performance.now();
  }

  abandonRun(): void {
    if (!this.world) return;
    this.finishRun();
  }

  continueEndless(): void {
    this.world?.continueEndless();
  }

  finishRun(): void {
    const w = this.world;
    if (!w) return;
    const s = w.summary();
    const report = applyRun(this.profile, s, w.newDiscoveries);
    const build = s.upgrades.map((u) => u.id);
    analytics.emit(s.victory ? 'RunCompleted' : 'RunFailed', { arena: s.arena, difficulty: s.difficulty, time: s.time, level: s.level, kills: s.kills, build });
    this.save();
    this.world = null;
    this.mode = 'menu';
    this.paused = false;
    this.newDemo();
    this.ui.postRun(s, report);
  }

  // ------------------------------------------------------------------ input
  private toLogical(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const s = this.renderer.scale;
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
  }

  private aimAt(x: number, y: number): void {
    const w = this.world;
    if (!w) return;
    if (this.profile.settings.aimMode === 'slingshot') {
      const dx = this.pointer.sx - x;
      const dy = this.pointer.sy - y;
      if (dx * dx + dy * dy > 100) w.setAim(dx, dy);
    } else {
      w.setAim(x - LAUNCHER_X, Math.min(y, LAUNCHER_Y - 10) - LAUNCHER_Y);
    }
  }

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      const w = this.world;
      if (this.mode !== 'run' || !w || this.paused || w.state !== 'playing') return;
      this.pointer.id = e.pointerId;
      const p = this.toLogical(e);
      this.pointer.sx = p.x;
      this.pointer.sy = p.y;
      c.setPointerCapture(e.pointerId);
      w.beginAim();
      if (this.profile.settings.aimMode === 'direct') this.aimAt(p.x, p.y);
    });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointer.id || !this.world?.aim.active) return;
      const p = this.toLogical(e);
      this.aimAt(p.x, p.y);
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.pointer.id) return;
      this.pointer.id = -1;
      const w = this.world;
      if (!w || !w.aim.active) return;
      if (e.type === 'pointercancel') w.cancelAim();
      else {
        w.release();
        this.tut.launched = true;
      }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    window.addEventListener('keydown', (e) => {
      const w = this.world;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.paused) {
          this.ui.clearScreen();
          this.ui.hud();
          this.resume();
        } else this.pause();
      }
      if (e.code === 'Space' && w && !this.paused) {
        e.preventDefault();
        w.activateSurge();
      }
      if (e.code === 'Backquote') {
        this.profile.settings.debug = !this.profile.settings.debug;
        this.applySettings();
      }
    });
  }

  // ------------------------------------------------------------------ frame loop
  private frame(t: number): void {
    const dt = clamp((t - (this.last || t)) / 1000, 0, 0.1);
    this.last = t;
    try {
      this.tick(dt);
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  private tick(dt: number): void {
    if (this.slow.t > 0) this.slow.t -= dt;
    const ts = this.slow.t > 0 ? this.slow.scale : 1;
    const w = this.mode === 'run' ? this.world : this.demo;
    if (!w) return;

    if (this.mode === 'menu' && this.demo) {
      // attract mode: an autoplayer shows off the game behind the menus
      if (this.demo.state === 'levelup') this.demo.choose(botChoose(this.demo, this.demoRng, 'focused'));
      if (this.demo.state === 'over' || this.demo.time > 240) this.newDemo();
      botStep(this.demo, this.demoRng);
    }

    const running = !(this.mode === 'run' && this.paused);
    if (running) {
      this.acc += dt * ts;
      let steps = 0;
      const cur = this.mode === 'run' ? this.world : this.demo;
      while (cur && this.acc >= SIM_DT && steps < 12) {
        cur.step(SIM_DT);
        this.acc -= SIM_DT;
        steps++;
      }
      if (steps >= 12) this.acc = 0; // device too slow: slow the game rather than spiral
      if (cur) this.consumeFx(cur);
      this.renderer.update(dt * ts);
    }

    const drawW = this.mode === 'run' ? this.world : this.demo;
    if (drawW) this.renderer.draw(drawW, this.mode === 'run');

    if (this.mode === 'run' && this.world) {
      this.ui.updateHud(this.world);
      this.updateAudioIntensity(this.world);
      if (this.world.cfg.tutorial) this.updateTutorial(this.world, dt);
    }
  }

  private consumeFx(w: World): void {
    const isRun = this.mode === 'run';
    for (const f of w.fx) {
      if (f.t === 'sfx') {
        if (isRun) this.audio.play(f.name, f.pitch, f.vol);
      } else if (f.t === 'slowmo') {
        if (isRun && !this.profile.settings.reducedFlashes) this.slow = { t: f.dur, scale: f.scale };
      } else if (f.t === 'text' && isRun && w.cfg.tutorial && f.text.startsWith('ELITE')) {
        this.tut.eliteHint = 4;
        this.renderer.handleFx(f);
      } else if (isRun || (f.t !== 'banner' && f.t !== 'shake' && f.t !== 'flash')) {
        this.renderer.handleFx(f);
      }
    }
    w.fx.length = 0;
  }

  private updateAudioIntensity(w: World): void {
    let near = 0;
    for (const e of w.enemies) if (e.y > DEFENSE_Y - 200) near++;
    this.audio.intensity = clamp(w.combo.count / 60 + near * 0.06 + w.time / 600, 0, 1);
    this.audio.boss = w.director.bossActive;
  }

  private updateTutorial(w: World, dt: number): void {
    const t = this.tut;
    t.t += dt;
    if (t.eliteHint > 0) t.eliteHint -= dt;
    const inFlight = w.balls.some((b) => b.state === 'flight' && b.kind === 'main');
    t.idle = inFlight ? 0 : t.idle + dt;
    let hint: string | null = null;
    if (w.state !== 'playing' || this.paused) hint = null;
    else if (!t.launched) hint = this.profile.settings.aimMode === 'slingshot' ? 'Pull back and release to launch' : 'Drag to aim · Release to launch';
    else if (t.t < 9 && w.run.kills < 3) hint = 'Your ball bounces on its own. Stop enemies before they reach the line!';
    else if (t.eliteHint > 0) hint = 'Elites are tough — but drop 💠 Cores for permanent unlocks.';
    else if (w.canSurge() && !t.surgeHinted) {
      hint = 'SURGE is charged! Tap it (or Space) to supercharge every ball.';
      if (w.surge.active > 0) t.surgeHinted = true;
    } else if (w.maxBallsAllowed() > 1 && !t.holdHinted && t.idle > 2.5) {
      hint = 'Tip: keep holding to auto-fire balls as they return.';
      if (w.aim.active) t.holdHinted = true;
    }
    this.ui.hint(hint);
  }
}
