// Presentation-only checks against the Vite dev server: node scripts/presentation-check.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const executablePath = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
].find(fs.existsSync);
const browser = await puppeteer.launch({ executablePath, headless: true });
const out = process.env.SHOTS ?? 'smoke-shots/presentation';
fs.mkdirSync(out, { recursive: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(process.env.URL ?? 'http://localhost:5173', { waitUntil: 'networkidle0' });
  const audio = await page.evaluate(async () => {
    const { AudioEngine } = await import('/src/audio/audio.ts');
    const stats = buffer => {
      let peak = 0, sum = 0, stereo = 0;
      const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
      for (let i = 0; i < left.length; i++) {
        if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) throw new Error('Nonfinite audio sample');
        peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
        sum += left[i] ** 2; stereo += Math.abs(left[i] - right[i]);
      }
      return { peak, rms: Math.sqrt(sum / left.length), stereo: stereo / left.length };
    };
    async function render(names, music = false, muted = false) {
      const ctx = new OfflineAudioContext(2, 44100 * (music ? 16 : 2), 44100);
      const Original = window.AudioContext;
      window.AudioContext = function () { return ctx; };
      const engine = new AudioEngine();
      try { engine.setVolumes(muted ? 0 : .8, muted ? 0 : .5); engine.unlock(); }
      finally { window.AudioContext = Original; }
      for (const name of names) engine.play(name);
      if (music) {
        engine.intensity = 1; engine.boss = true; engine.schedule();
        for (let i = 1; i < 159; i++) {
          ctx.suspend(i * .1).then(() => { engine.schedule(); return ctx.resume(); });
        }
      }
      return stats(await ctx.startRendering());
    }
    const sounds = {};
    for (const name of ['launch', 'hit', 'crit', 'wall', 'bumper', 'explode', 'zap', 'kill', 'bigkill',
      'levelup', 'pickup', 'coin', 'core', 'hurt', 'shield', 'shieldbreak', 'freeze', 'shatter', 'ignite',
      'portal', 'pulse', 'boss', 'warning', 'synergy', 'evolve', 'victory', 'defeat', 'click', 'select',
      'poison', 'timestop', 'relic', 'resonate', 'starfall']) sounds[name] = await render([name]);
    return { sounds, music: await render([], true), muted: await render(['hit', 'explode'], true, true),
      busy: await render(Object.keys(sounds)) };
  });
  for (const [name, samples] of Object.entries(audio.sounds)) {
    assert.ok(samples.rms > .00001, `${name} is audible`);
    assert.ok(samples.peak < .99, `${name} does not clip`);
  }
  assert.ok(audio.music.rms > .001, 'Music is audible');
  assert.ok(audio.music.stereo > .0001, 'Music has stereo space');
  assert.ok(audio.busy.peak < .99, 'Simultaneous effects do not clip');
  assert.equal(audio.muted.peak, 0, 'Both volume controls fully mute');

  await page.evaluate(async () => {
    const { CORES } = await import('/src/data/balls.ts');
    const { coreSprite, corePortrait } = await import('/src/render/cores.ts');
    const sheet = document.createElement('div'); sheet.id = 'art-review';
    Object.assign(sheet.style, { position: 'fixed', inset: '0', zIndex: 999, padding: '20px', overflow: 'auto',
      background: '#070b16', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', alignContent: 'start' });
    for (const core of CORES) {
      const tile = document.createElement('div'); tile.style.textAlign = 'center';
      const sprite = coreSprite(core.id, core.color);
      if (coreSprite(core.id, core.color) !== sprite) throw new Error('Core art is not cached');
      const art = document.createElement('img'); art.src = corePortrait(core.id, core.color).toDataURL(); art.style.width = '100%';
      const label = document.createElement('div'); label.textContent = core.name; label.style.fontSize = '11px';
      tile.append(art, label); sheet.append(tile);
    }
    document.body.append(sheet);
  });
  await page.screenshot({ path: `${out}/core-art.png` });
  await page.evaluate(() => { document.querySelector('#art-review').remove(); window.game.ui.loadout(); });
  await page.waitForFunction(() => !document.getAnimations().some(a => a.id.startsWith('ui:') && a.playState === 'running'));
  await page.screenshot({ path: `${out}/armory.png` });
  const unchanged = await page.evaluate(() => {
    const g = window.game;
    g.profile.tutorialDone = true;
    g.startRun({ arena: 'proving', difficulty: 0, pacts: [], seed: 19 }); g.paused = true;
    const w = g.world, r = g.renderer;
    ['grunt', 'shielder', 'brute', 'spawner', 'reflector', 'runner'].forEach((id, i) => {
      const e = w.spawnEnemy(id, 105 + i % 3 * 165, 260 + Math.floor(i / 3) * 150); e.spawnT = 1;
      r.handleFx({ t: 'hit', x: e.x, y: e.y, color: e.def.color, crit: i % 2 === 0 });
    });
    r.handleFx({ t: 'explosion', x: 190, y: 590, r: 72, color: '#ffb13b' });
    r.handleFx({ t: 'lightning', pts: [105, 260, 270, 410, 435, 260], color: '#6de2ff' });
    r.handleFx({ t: 'beam', x0: 270, y0: 850, x1: 435, y1: 410, color: '#b49cff' });
    const state = () => JSON.stringify({ time: w.time, enemies: w.enemies, balls: w.balls, zones: w.zones, pickups: w.pickups });
    const before = state(); r.update(.04); r.draw(w);
    for (let i = 0; i < 5; i++) r.draw(w);
    return state() === before;
  });
  assert.ok(unchanged, 'Drawing changes no combat state');
  await page.screenshot({ path: `${out}/effects.png` });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluate(() => { window.game.ui.home(); window.game.ui.loadout(); });
  assert.equal(await page.evaluate(() => document.getAnimations().some(a => a.id.startsWith('ui:') && a.playState === 'running')), false);
  assert.equal(await page.$('[data-motion-ghost]'), null, 'Reduced motion leaves no transition ghosts');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ effects: Object.keys(audio.sounds).length, music: audio.music, busy: audio.busy,
    mute: 'passed', cachedArtwork: 'passed', reducedMotion: 'passed', errors }, null, 2));
} finally { await browser.close(); }
