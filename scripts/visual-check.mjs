// Deterministic visual fixtures, responsive layout checks, and renderer benchmarks.
// Run against dev or preview: node scripts/visual-check.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const out = process.env.SHOTS ?? 'smoke-shots/visual';
fs.mkdirSync(out, { recursive: true });
const executablePath = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
].find(fs.existsSync);
const browser = await puppeteer.launch({ executablePath, headless: true });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(process.env.URL ?? 'http://localhost:4173', { waitUntil: 'networkidle0' });
  for (const [width, height] of [[320, 568], [390, 844], [1440, 1000]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    // Chromium can return before the resize event updates the canvas and UI root.
    await page.waitForFunction(() => {
      const root = document.getElementById('ui');
      const scale = Math.min(innerWidth / 540, innerHeight / 960);
      return root.clientWidth === Math.floor(540 * scale) && root.clientHeight === Math.floor(960 * scale);
    });
    await page.evaluate(() => window.game.ui.home());
    await page.locator('.launch-button').wait();
    const layout = await page.evaluate(() => {
      const scroll = document.querySelector('.home-content');
      const button = document.querySelector('.launch-button');
      const br = button.getBoundingClientRect(), sr = scroll.getBoundingClientRect();
      return { overflow: scroll.scrollWidth > scroll.clientWidth + 1, visible: br.top >= sr.top && br.bottom <= sr.bottom };
    });
    assert.equal(layout.overflow, false, `Horizontal overflow at ${width}x${height}`);
    assert.equal(layout.visible, true, `Launch button outside initial viewport at ${width}x${height}`);
    await page.screenshot({ path: `${out}/home-${width}.png` });
  }
  await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 2 });
  for (const arena of ['proving', 'foundry', 'rift']) {
    await page.evaluate((arena) => {
      const g = window.game;
      g.profile.tutorialDone = true;
      g.startRun({ arena, difficulty: 0, pacts: [], seed: 27 });
      g.paused = true; // Freeze this visual fixture, without a pause overlay.
      const w = g.world;
      const ids = ['grunt', 'runner', 'brute', 'shielder', 'splitter', 'healer', 'spawner', 'magnet', 'bomber', 'reflector', 'teleporter', 'warden'];
      ids.forEach((id, i) => {
        const e = w.spawnEnemy(id, 100 + i % 4 * 112, 205 + Math.floor(i / 4) * 95);
        e.spawnT = 1;
      });
      w.enemies[4].st.frozenT = 2;
      w.enemies[7].st.burnT = 2;
      const boss = w.spawnEnemy(`boss_${{ proving: 'fortress', foundry: 'magnetar', rift: 'hydra' }[arena]}`, 270, 580);
      boss.spawnT = 1;
      const b = w.spawnBall('main', 390, 675, .3, -1); b.momentum = 20;
      b.trail = Array.from({ length: 28 }, (_, i) => i % 2 ? 760 - Math.floor(i / 2) * 6.54 : 315 + Math.floor(i / 2) * 5.77);
      g.renderer.time = 2;
      g.renderer.draw(w);
    }, arena);
    await page.screenshot({ path: `${out}/arena-${arena}.png` });
  }
  // Repeated draws while paused must not grow the ambient particle pool.
  const pauseCheck = await page.evaluate(() => {
    const g = window.game, r = g.renderer, w = g.world;
    r.update(1 / 60); r.draw(w);
    const before = r.particles.n;
    for (let i = 0; i < 90; i++) r.draw(w);
    return { before, after: r.particles.n };
  });
  assert.equal(pauseCheck.before, pauseCheck.after, 'Paused renderer emitted particles');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.waitForFunction(() => window.game.renderer.opts.reducedMotion);
  assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-reduced-motion')), true);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.waitForFunction(() => !window.game.renderer.opts.reducedMotion);

  const benchmark = await page.evaluate(() => {
    const g = window.game, w = g.world, r = g.renderer;
    for (let i = 0; i < 140; i++) {
      const e = w.spawnEnemy(['grunt', 'brute', 'shielder'][i % 3], 35 + i % 14 * 36, 145 + Math.floor(i / 14) * 53);
      e.spawnT = 1;
    }
    const times = [];
    for (let i = 0; i < 120; i++) {
      const start = performance.now(); r.draw(w); times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    return { enemies: w.enemies.length, medianDrawMs: times[60], p95DrawMs: times[114] };
  });
  assert.deepEqual(errors, [], 'Browser errors');
  console.log(JSON.stringify({ layouts: 'passed', arenas: 3, pausedParticles: 'passed', reducedMotion: 'passed', benchmark, errors }, null, 2));
} finally {
  await browser.close();
}
