// Android system Back on a real device or emulator: KEYCODE_BACK and the edge-swipe gesture go
// through the Activity (MainActivity's bridge) exactly as a player's do, and taps are real
// touchscreen input. Needs a debug build installed (WebView debugging on) and adb running:
//   npx tauri android build --debug --apk --target x86_64 && adb install -r <apk>
//   npm run test:android:back
import { _android } from 'playwright-core';
import assert from 'node:assert/strict';
import { uiHelpers } from './ui-helpers.mjs';

const pkg = process.env.PKG ?? 'games.bazimazi.bouncedefense.debug';
const [device] = await _android.devices();
if (!device) throw new Error('No Android device or emulator found by adb.');
const checks = [];
try {
  const focused = async () => (await device.shell('dumpsys window | grep mCurrentFocus')).toString().includes(pkg);
  await device.shell(`am force-stop ${pkg}`);
  await device.shell(`am start -n ${pkg}/games.bazimazi.bouncedefense.MainActivity`);
  const page = await (await device.webView({ pkg })).page();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.game);
  const { ui, ready, isHome, row } = uiHelpers(page);
  await ready();
  // Count the presses the game receives from MainActivity, so the bridge is known to be in use.
  await page.evaluate(() => { window.__bridge = 0; document.addEventListener('backbutton', () => window.__bridge++, true); });

  const [screenW, screenH] = (await device.shell('wm size')).toString().match(/(\d+)x(\d+)\s*$/m).slice(1).map(Number);
  /** A real touchscreen tap on an element: the WebView fills the screen below any cutout. */
  const tap = async locator => {
    await ready(); await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    const { dpr, w, h } = await page.evaluate(() => ({ dpr: devicePixelRatio, w: innerWidth, h: innerHeight }));
    const x = screenW - w * dpr + (box.x + box.width / 2) * dpr, y = screenH - h * dpr + (box.y + box.height / 2) * dpr;
    await device.shell(`input tap ${Math.round(x)} ${Math.round(y)}`);
    await page.waitForTimeout(400); await ready();
  };
  const settle = async () => { await page.waitForTimeout(500); await ready(); };
  const back = async () => { await ready(); await device.shell('input keyevent KEYCODE_BACK'); await settle(); };
  const swipeBack = async () => { await ready(); await device.shell(`input swipe 2 ${screenH >> 1} ${screenW >> 2} ${screenH >> 1} 120`); await settle(); };
  const state = () => page.evaluate(() => ({ paused: window.game.paused, run: !!window.game.world, synced: window.game.ui.navigation.current.depth === history.state.depth }));
  const mark = text => checks.push(text);

  await tap(ui.locator('.launch-button'));
  assert.equal((await state()).run, true);
  await back(); assert.equal((await state()).paused, true, 'Back pauses First Contact');
  await back(); assert.equal((await state()).paused, false, 'Back resumes');
  for (const gap of [60, 250]) {
    await device.shell('input keyevent KEYCODE_BACK'); await page.waitForTimeout(gap); await device.shell('input keyevent KEYCODE_BACK');
    await settle();
    const s = await state();
    assert.ok(s.run && s.synced && await focused(), `double Back ${gap}ms keeps the app and the run: ${JSON.stringify(s)}`);
    if (s.paused) await back();
  }
  mark('Back pauses and resumes; double Back at 60/250 ms never leaves the app or the run');

  await page.evaluate(() => { const g = window.game; g.profile.tutorialDone = true; g.profile.coins = 50000; g.profile.cleared.proving = 2; g.profile.bossKills.fortress = 1; g.save(); g.finishRun(true); });
  await ready();
  await back(); assert.equal(await isHome(), true, 'Results return to Battle');
  for (const id of ['armory', 'forge', 'codex', 'goals']) {
    await tap(ui.locator(`.tabbar .tab-${id}`)); await back();
    assert.equal(await isHome(), true, `Back from ${id}`);
  }
  await tap(ui.locator('.tabbar .tab-armory')); await tap(row('.slot-row', 'Shell'));
  await back(); assert.equal(await ui.locator('.sheet-layer').count(), 0, 'Back closes a sheet');
  assert.equal(await ui.locator('.hub').getAttribute('data-tab'), 'armory');
  await back(); assert.equal(await isHome(), true);
  await tap(ui.locator('.settings-btn')); await back(); assert.equal(await isHome(), true, 'Back from Settings');
  mark('Results, every tab, a sheet and Settings are one Back step');

  await tap(ui.locator('.run-card')); await tap(ui.locator('.sheet .play-btn'));
  await back(); assert.equal((await state()).paused, true);
  await tap(page.getByRole('button', { name: 'Settings', exact: true }));
  await back(); assert.equal(await ui.locator('.pause-overlay').count(), 1, 'Settings returns to Pause');
  await tap(page.getByRole('button', { name: 'Abandon', exact: true }));
  await back(); assert.equal(await ui.locator('.pause-overlay').count(), 1, 'Back cancels the end-run prompt');
  await back(); assert.equal((await state()).paused, false);
  await swipeBack(); assert.equal((await state()).paused, true, 'The edge-swipe gesture pauses too');
  await swipeBack(); assert.equal((await state()).paused, false);
  await back();
  await tap(page.getByRole('button', { name: 'Abandon', exact: true }));
  await tap(page.getByRole('button', { name: 'End run', exact: true }));
  await back(); assert.equal(await isHome(), true);
  mark('paused Settings, end-run prompt and the swipe gesture');

  const bridged = await page.evaluate(() => window.__bridge);
  assert.ok(bridged > 20, `MainActivity forwards Back to the game (${bridged} presses)`);
  assert.deepEqual(errors, []);
  await device.shell('input keyevent KEYCODE_BACK'); await page.waitForTimeout(1500).catch(() => {});
  assert.equal(await focused(), false, 'Back from Battle leaves the app');
  mark(`${bridged} presses reached the game through MainActivity; Back from Battle leaves the app`);
  console.log(`android (${device.model()}): Back passed\n  ${checks.join('\n  ')}`);
} finally { await device.close(); }
