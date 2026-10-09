// Browser integration checks for power-shot input, tactical recall and starfall.
// node scripts/resonance-check.mjs (URL, SHOTS and CHROME_PATH can override defaults)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const out = process.env.SHOTS ?? 'smoke-shots/resonance';
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
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 1 });
  await page.goto(process.env.URL ?? 'http://localhost:4173', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    const g = window.game; g.profile.tutorialDone = true;
    g.startRun({ arena: 'proving', difficulty: 0, pacts: [], seed: 51 });
    g.world.director.update = () => {};
  });
  // Exercise native pointer events and the game's fixed-step timing window.
  await page.mouse.move(115, 400); await page.mouse.down();
  await page.waitForFunction(() => window.game.world.isPowerWindow(), { polling: 'raf' });
  await page.evaluate(() => { window.game.paused = true; });
  await page.screenshot({ path: `${out}/01-power-dial.png` });
  await page.evaluate(() => { window.game.paused = false; });
  await page.mouse.up();
  await page.waitForFunction(() => window.game.world.balls.some(b => b.powered));
  assert.equal(await page.evaluate(() => window.game.world.balls[0].dmgMult), 1.45);
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => window.game.world.hand === 1);
  assert.ok(await page.evaluate(() => window.game.world.recallCooldown > 9));

  for (const arena of ['proving', 'foundry', 'rift']) {
    await page.evaluate(arena => {
      const g = window.game; g.startRun({ arena, difficulty: 0, pacts: [], seed: 51 });
      g.paused = true;
      const w = g.world; w.director.update = () => {}; w.resonance.update(5.1);
      ['runner', 'grunt', 'shielder', 'brute', 'healer', 'splitter', 'bomber', 'magnet'].forEach((id, i) => {
        const e = w.spawnEnemy(id, 72 + i % 4 * 130, 175 + Math.floor(i / 4) * 165); e.spawnT = 1;
      });
      const danger = w.spawnEnemy('runner', 425, 690); danger.spawnT = 1;
      const ball = w.spawnBall('main', 185, 610, .35, -1); w.hand = 0;
      ball.momentum = 8; ball.powered = true;
      ball.trail = Array.from({ length: 28 }, (_, i) => i % 2 ? 710 - Math.floor(i / 2) * 7.7 : 150 + Math.floor(i / 2) * 2.7);
      const node = w.resonance.nodes[0];
      w.resonance.touch({ ...ball, x: node.x, y: node.y });
      g.renderer.time = 3; g.renderer.draw(w); g.ui.updateHud(w);
    }, arena);
    await page.screenshot({ path: `${out}/02-circuit-${arena}.png` });
  }
  const starfall = await page.evaluate(() => {
    const g = window.game, w = g.world;
    const ball = w.balls[0];
    for (const node of [...w.resonance.nodes]) w.resonance.touch({ ...ball, x: node.x, y: node.y });
    for (const f of w.fx) g.renderer.handleFx(f);
    w.fx = []; g.renderer.update(.14); g.renderer.draw(w); g.ui.updateHud(w);
    return { complete: w.resonance.completed, targets: g.renderer.starfalls[0].pts.length / 2, overdrive: w.resonance.overdrive };
  });
  assert.deepEqual(starfall, { complete: 1, targets: 5, overdrive: 7 });
  await page.screenshot({ path: `${out}/03-starfall.png` });

  // Buttons remain usable and separate on the narrowest supported layout.
  for (const [width, height] of [[320, 568], [390, 844], [1440, 1000]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.waitForFunction(() => {
      const scale = Math.min(innerWidth / 540, innerHeight / 960);
      return document.getElementById('ui').clientWidth === Math.floor(540 * scale);
    });
    await page.evaluate(() => {
      const g = window.game; g.startRun({ arena: 'proving', difficulty: 0, pacts: [], seed: 51 });
      g.world.director.update = () => {}; g.world.resonance.update(5.1);
      const n = g.world.resonance.nodes[0];
      g.world.spawnBall('main', n.x, n.y + 120, 0, -1); g.world.hand = 0;
    });
    await page.waitForFunction(() => !document.getAnimations().some(a => a.id.startsWith('ui:') && a.playState === 'running'));
    const controls = await page.evaluate(() => {
      const r = document.querySelector('.recall').getBoundingClientRect();
      const s = document.querySelector('.surge').getBoundingClientRect();
      return { separate: r.right < s.left, inBounds: r.left >= 0 && s.right <= innerWidth && r.bottom <= innerHeight, touch: r.width >= 44 && r.height >= 44 };
    });
    assert.deepEqual(controls, { separate: true, inBounds: true, touch: true });
    await page.waitForFunction(() => !document.querySelector('.recall').disabled);
    await page.click('.recall');
    await page.waitForFunction(() => window.game.world.recallCooldown > 0 && window.game.world.hand === 1);
    await page.screenshot({ path: `${out}/04-controls-${width}.png` });
  }
  await page.evaluate(() => { window.game.pause(); });
  await page.waitForFunction(() => document.querySelector('.recall').disabled);
  const before = await page.evaluate(() => window.game.world.recallCooldown);
  await page.keyboard.press('KeyR');
  assert.equal(await page.evaluate(() => window.game.world.recallCooldown), before);

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ powerInput: 'passed', keyboardRecall: 'passed', touchRecall: 'passed', starfall,
    arenas: 3, responsiveControls: 'passed', pausedInput: 'passed', errors }, null, 2));
} finally { await browser.close(); }
