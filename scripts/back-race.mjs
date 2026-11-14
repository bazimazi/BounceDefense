// Real Back presses in quick succession, the way a browser's Back button or Android's system Back
// delivers them. Chromium's Back must be browser-initiated: Playwright's page.goBack() there goes
// through DevTools, which ignores Chromium's skippable-entry rule, so a tiny extension calls
// chrome.tabs.goBack() instead. Firefox and WebKit's page.goBack() is a real traversal.
import { chromium, firefox, webkit } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { uiHelpers } from './ui-helpers.mjs';

const engine = process.env.ENGINE ?? 'chromium';
const url = process.env.URL ?? 'http://localhost:4173';
const out = process.env.SHOTS ?? `smoke-shots/back-race/${engine}`;
fs.mkdirSync(out, { recursive: true });
const options = { viewport: { width: 360, height: 740 }, hasTouch: true };
let context, browser, worker, extension;
if (engine === 'chromium') {
  extension = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-back-'));
  fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'back', version: '1', permissions: ['tabs'], background: { service_worker: 'sw.js' } }));
  fs.writeFileSync(path.join(extension, 'sw.js'), 'self.uiBack = async () => { const [t] = await chrome.tabs.query({}); await chrome.tabs.goBack(t.id); };');
  context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, ...options, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
} else {
  browser = await ({ firefox, webkit })[engine].launch({ headless: true });
  context = await browser.newContext(options);
}
const errors = [], checks = [];
try {
  const page = context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route(`${url}/back-origin`, route => route.fulfill({ contentType: 'text/html', body: '<title>Before game</title><p>Previous page</p>' }));
  await page.goto(`${url}/back-origin`);
  // 'load' plus the game object: networkidle can time out when several engines run at once.
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.game, null, { timeout: 30000 });
  const { ui, ready, isHome, tab, row } = uiHelpers(page);
  /** One press of the browser's own Back, not awaited: presses can overlap like real ones. */
  const press = () => worker ? worker.evaluate(() => self.uiBack()).catch(() => {}) : page.goBack({ timeout: 4000 }).catch(() => {});
  const settle = async () => { await page.waitForTimeout(450); await ready(); };
  const back = async () => { await ready(); await press(); await settle(); };
  const presses = async (gap, n = 2) => {
    await ready();
    const pending = [];
    for (let i = 0; i < n; i++) { if (i) await page.waitForTimeout(gap); pending.push(press()); }
    await Promise.all(pending); await settle();
  };
  const state = () => page.evaluate(() => {
    const g = window.game, n = g?.ui.navigation;
    return { inGame: !!g && location.pathname === '/', run: g?.world === window.__run && !!g?.world, paused: g?.paused,
      synced: !!n && n.current.depth === history.state?.depth, home: !!document.querySelector('.hub-battle') };
  });
  const mark = text => checks.push(text);

  await page.evaluate(() => { const g = window.game; g.profile.tutorialDone = true; g.save(); g.ui.home(); });
  await ready();
  await ui.locator('.play-btn').tap(); await ready();
  await page.evaluate(() => { window.__run = window.game.world; });
  for (let i = 0; i < 4; i++) {
    await back();
    const s = await state();
    assert.ok(s.inGame && s.run && s.synced, `single Back ${i + 1} keeps the run: ${JSON.stringify(s)}`);
    assert.equal(s.paused, i % 2 === 0, `single Back ${i + 1} toggles Pause`);
  }
  mark('single real Back toggles Pause and Resume without leaving the run');

  for (const gap of [30, 80, 200]) {
    for (const paused of [false, true]) {
      if ((await state()).paused !== paused) await back();
      await presses(gap);
      const s = await state();
      assert.ok(s.inGame && s.run && s.synced, `double Back ${gap}ms from ${paused ? 'Pause' : 'play'} keeps the run: ${JSON.stringify(s)}`);
    }
  }
  if (!(await state()).paused) await back();
  await page.getByRole('button', { name: 'Settings', exact: true }).tap(); await ready();
  await presses(80, 3);
  let s = await state();
  assert.ok(s.inGame && s.run && s.synced, `triple Back from paused Settings keeps the run: ${JSON.stringify(s)}`);
  mark('double Back at 30/80/200 ms (playing and paused) and triple Back from paused Settings keep the run');

  if (!(await state()).paused) await back();
  await page.getByRole('button', { name: 'Abandon', exact: true }).tap(); await ready();
  await page.getByRole('button', { name: 'End run', exact: true }).tap(); await ready();
  await back();
  assert.equal(await isHome(), true, 'Back from Results returns to Battle');
  mark('Results return to Battle');

  await page.evaluate(() => { const g = window.game; g.profile.coins = 10000; g.save(); g.ui.home(); }); await ready();
  await tab('armory');
  await row('.slot-row', 'Shell').tap(); await ready();
  await presses(80);
  s = await state();
  assert.ok(s.inGame && s.synced, `double Back from a sheet stays in the game: ${JSON.stringify(s)}`);
  if (!s.home) await back();
  assert.equal(await isHome(), true);
  await press(); await page.waitForURL(`${url}/back-origin`);
  assert.equal(await page.title(), 'Before game', 'Back from Battle leaves the game');
  mark('double Back from a sheet stays in the game; Back from Battle leaves it');
  console.log(`${engine}: real Back races passed`);
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${out}/back-race.json`, JSON.stringify({ engine, checks, errors }, null, 2));
} finally {
  await context.close();
  await browser?.close();
  if (extension) fs.rmSync(extension, { recursive: true, force: true });
}
