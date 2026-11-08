// Real History API traversal and mobile input, not synthetic popstate events.
import { chromium, firefox, webkit } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { uiHelpers } from './ui-helpers.mjs';

const engine = process.env.ENGINE ?? 'chromium';
const browser = await ({ chromium, firefox, webkit }[engine]).launch({ headless: true });
const out = process.env.SHOTS ?? `smoke-shots/back/${engine}`;
fs.mkdirSync(out, { recursive: true });
const errors = [], checks = [];
try {
  for (const [width, height] of [[320, 568], [568, 320]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const url = process.env.URL ?? 'http://localhost:4173';
    await page.route(`${url}/back-origin`, route => route.fulfill({ contentType: 'text/html', body: '<title>Before game</title><p>Previous page</p>' }));
    await page.goto(`${url}/back-origin`);
    await page.goto(url, { waitUntil: 'networkidle' });
    const { ui, ready, isHome, tab, segment, openSettings, row } = uiHelpers(page);
    /** touch = the on-screen control that means Back here: the arrow, or the Battle tab inside the hub. */
    const back = async kind => {
      await ready();
      if (kind === 'browser') await page.goBack();
      else if (kind === 'touch') {
        if (await ui.locator('.hub .tabbar').count()) await ui.locator('.tabbar .tab-battle').tap();
        else await page.getByRole('button', { name: 'Back', exact: true }).tap();
      } else if (kind === 'hardware') assert.equal(await page.evaluate(() => !document.dispatchEvent(new Event('backbutton', { bubbles: true, cancelable: true }))), true);
      else await page.keyboard.press('Escape');
      await ready();
    };
    const hubTab = () => ui.locator('.hub').getAttribute('data-tab');
    const mark = text => checks.push(`${width}x${height}: ${text}`);
    await ready();
    await ui.locator('.launch-button').tap(); await ready();
    await page.evaluate(() => { history.back(); history.back(); });
    await ui.locator('.pause-overlay').waitFor(); await ready();
    assert.equal(await page.evaluate(() => window.game.paused), true);
    assert.equal(await page.evaluate(() => window.game.world.cfg.tutorial), true);
    await back('hardware'); assert.equal(await page.evaluate(() => window.game.controlsEnabled), true);
    await page.evaluate(() => {
      document.dispatchEvent(new Event('backbutton', { cancelable: true }));
      document.dispatchEvent(new Event('backbutton', { cancelable: true }));
    });
    await ready(); assert.equal(await ui.locator('.pause-overlay').count(), 1);
    // Back can pause the final slow-motion after the hull breaks; ending from Pause keeps the real outcome.
    await page.evaluate(() => window.game.world.finish(false));
    await page.getByRole('button', { name: 'Abandon', exact: true }).tap(); await ready();
    await page.getByRole('button', { name: 'End run', exact: true }).tap(); await ready();
    assert.equal(await ui.locator('.result-title').textContent(), 'DEFEATED');
    await page.getByRole('button', { name: 'Home', exact: true }).tap(); await ready();
    mark('two queued browser/hardware Back presses cannot exit or unpause First Contact; paused defeat keeps its outcome');
    await page.evaluate(() => { const g = window.game; g.profile.tutorialDone = true; g.profile.coins = 10000; g.profile.mastery.striker = 6000; g.save(); g.ui.home(); });
    await ready();

    // Every tab is one Back step from Battle, whichever way it is reached; tabs, segments and categories add no history.
    for (const [id, kind] of [['armory', 'browser'], ['forge', 'hardware'], ['codex', 'escape'], ['goals', 'touch']]) {
      await tab(id);
      const historyLength = await page.evaluate(() => history.length);
      if (id === 'codex') {
        await ui.locator('.codex-tabs').getByRole('tab', { name: /Upgrades/ }).tap(); await ready();
        await ui.locator('.codex-tabs').getByRole('tab', { name: /Arenas/ }).tap(); await ready();
      }
      if (id === 'forge') { await segment('Research'); await segment('Talents'); }
      assert.equal(await page.evaluate(() => history.length), historyLength);
      await back(kind);
      assert.equal(await isHome(), true, `${kind} from ${id}`);
    }
    await tab('armory'); await tab('forge'); await tab('codex'); await tab('goals');
    await back('browser'); assert.equal(await isHome(), true, 'Switching tabs replaces the entry; Back returns to Battle');
    await tab('codex'); await openSettings(); await back('hardware');
    assert.equal(await hubTab(), 'codex', 'Settings returns to the tab that opened it');
    await back('escape'); assert.equal(await isHome(), true);
    mark('each tab, by browser/hardware/Escape/touch Back; tab switches and categories add no history; Settings returns to its tab');

    // Forward restores a tab; sheets are one Back step and purchases add no extra steps.
    await tab('armory'); await back('browser'); await page.goForward(); await ready();
    assert.equal(await hubTab(), 'armory');
    await row('.slot-row', 'Shell').tap(); await ready();
    await back('browser'); assert.equal(await ui.locator('.sheet-layer').count(), 0, 'Back closes a sheet');
    assert.equal(await hubTab(), 'armory');
    await row('.slot-row', 'Shell').tap(); await ready();
    await row('.option-row', 'Aero Shell').tap(); await ready();
    assert.equal(await page.evaluate(() => window.game.profile.loadout.shell), 'shell_aero');
    await back('hardware'); assert.equal(await isHome(), true, 'One Back step after a purchase from a sheet');
    await tab('codex'); await ui.locator('.codex-tile').first().tap(); await ready();
    await back('escape'); assert.equal(await ui.locator('.sheet-layer').count(), 0); assert.equal(await hubTab(), 'codex');
    await back('touch'); assert.equal(await isHome(), true);
    mark('forward restoration, sheets close with Back, one-step Back after purchase');

    await ui.locator('.play-btn').tap(); await ready();
    // A held or duplicated key must never immediately unpause. Aim is cancelled safely.
    const bounds = await page.locator('#game').boundingBox();
    await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .65); await page.mouse.down();
    assert.equal(await page.evaluate(() => window.game.world.aim.active), true);
    await page.keyboard.down('Escape'); await page.keyboard.down('Escape'); await page.keyboard.up('Escape'); await ready();
    assert.equal(await ui.locator('.pause-overlay').count(), 1);
    assert.equal(await page.evaluate(() => window.game.world.aim.active), false);
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.game.world.balls.some(b => b.state === 'flight')), false);
    const runTime = await page.evaluate(() => window.game.world.time);
    await page.getByRole('button', { name: 'Settings', exact: true }).tap(); await ready();
    await back('browser'); assert.equal(await ui.locator('.pause-overlay').count(), 1);
    assert.equal(await page.evaluate(() => window.game.world.time), runTime);
    await back('hardware'); assert.equal(await page.evaluate(() => window.game.controlsEnabled), true);
    await back('browser'); assert.equal(await ui.locator('.pause-overlay').count(), 1);
    await page.getByRole('button', { name: 'Abandon', exact: true }).tap(); await ready();
    await back('hardware'); assert.equal(await ui.locator('.pause-overlay').count(), 1);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Abandon', 'Cancelling returns focus to the invoking control');
    await page.getByRole('button', { name: /Resume/ }).tap(); await ready();
    assert.equal(await page.evaluate(() => window.game.controlsEnabled), true);
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
      document.querySelector('.pause-overlay .primary').click();
    });
    await ready(); assert.equal(await page.evaluate(() => window.game.controlsEnabled), true, 'Resume works immediately after Back');
    mark('held Escape, pointer release, paused Settings and abandon cancellation; browser Back pauses live run');

    // One traversal can skip several entries. Each must stop at the run's guard, never drop the run.
    const synced = () => page.evaluate(() => {
      const n = window.game.ui.navigation;
      return n.current.depth === history.state.depth && (n.key === 'pause') === window.game.paused;
    });
    const world = await page.evaluate(() => (window.__run = window.game.world, true));
    // A Back computed before Pause pushed its entry lands two levels up.
    await page.evaluate(() => { history.back(); document.querySelector('.game-hud .hudbtn').click(); }); await ready();
    assert.equal(await ui.locator('.pause-overlay').count(), 1); assert.equal(await synced(), true);
    await back('hardware'); assert.equal(await page.evaluate(() => window.game.controlsEnabled), true);
    await page.evaluate(() => { history.back(); history.back(); }); await ready();
    assert.equal(await ui.locator('.pause-overlay').count(), 1, 'Both run guard entries survive the race');
    // A long-press history jump from paused Settings straight to the menus.
    await page.getByRole('button', { name: 'Settings', exact: true }).tap(); await ready();
    await page.evaluate(() => history.go(-(history.state.depth - 1))); await ready();
    assert.equal(await ui.locator('.pause-overlay').count(), 1, 'A multi-step jump pauses instead of discarding the run');
    assert.equal(await page.evaluate(() => window.game.world === window.__run && window.game.paused), world);
    assert.equal(await synced(), true);
    // Engines may drop a scripted step when another lands in the same task; Back must recover.
    await page.evaluate(() => { document.querySelector('.pause-overlay .primary').click(); history.forward(); }); await ready();
    assert.equal(await synced(), true);
    if (await page.evaluate(() => window.game.paused)) { await back('hardware'); }
    assert.equal(await page.evaluate(() => window.game.controlsEnabled), true, 'Back responds after a dropped traversal');
    await back('hardware'); assert.equal(await ui.locator('.pause-overlay').count(), 1);
    await back('hardware'); assert.equal(await page.evaluate(() => window.game.controlsEnabled), true);
    mark('raced, multi-step and dropped traversals keep the run and both guard entries');

    // Mandatory choices survive pause/back and the same offers remain available.
    await page.evaluate(() => { const w = window.game.world; w.pendingLevels = 2; w.level = 3; w.openLevelUp(); }); await ready();
    const offers = await page.evaluate(() => window.game.world.offers);
    await back('browser'); assert.equal(await ui.locator('.pause-overlay').count(), 1);
    await back('escape'); assert.equal(await page.getByRole('button', { name: /^Skip/ }).count(), 1);
    assert.deepEqual(await page.evaluate(() => window.game.world.offers), offers);
    assert.equal(await page.evaluate(() => window.game.world.pendingLevels), 2);
    // Banish targeting is a sub-mode: Back leaves it without pausing or spending a banish.
    await page.evaluate(() => { const g = window.game; g.world.banishes = 1; g.ui.levelUp(g.world); }); await ready();
    const banish = page.locator('.offer-actions .draft-action').filter({ has: page.locator('.icon-banish') });
    await banish.tap(); await ready();
    assert.equal(await ui.locator('.draft.banishing').count(), 1);
    await back('hardware');
    assert.equal(await page.evaluate(() => window.game.paused), false, 'Back leaves banish mode before pausing');
    assert.equal(await ui.locator('.draft.banishing').count(), 0);
    assert.equal(await page.evaluate(() => window.game.world.banishes), 1);
    await banish.tap(); await ready();
    await back('browser'); assert.equal(await ui.locator('.draft.banishing').count(), 0);
    assert.deepEqual(await page.evaluate(() => window.game.world.offers), offers);
    await page.getByRole('button', { name: /^Skip/ }).tap(); await ready();
    await page.getByRole('button', { name: /^Skip/ }).tap(); await ready();
    await page.evaluate(() => { const g = window.game; g.world.state = 'over'; g.world.victory = true; g.ui.victoryChoice(g.world); });
    await back('hardware'); await back('browser');
    assert.equal(await page.getByRole('button', { name: /Claim rewards/ }).count(), 1);
    await page.screenshot({ path: `${out}/victory-back-${width}x${height}.png` });
    await page.getByRole('button', { name: /Claim rewards/ }).tap(); await ready();
    const runs = await page.evaluate(() => window.game.profile.stats.runs);
    await back('browser'); assert.equal(await isHome(), true, 'Results sit above Battle');
    await page.goForward(); await ready(); assert.equal(await ui.locator('.result-title').textContent(), 'RUN COMPLETE');
    assert.equal(await page.evaluate(() => window.game.profile.stats.runs), runs);
    assert.equal(await page.evaluate(() => window.game.world), null);
    // Play Again starts a fresh guarded run on top of Results; Back pauses it rather than leaving.
    await page.getByRole('button', { name: /Play again/ }).tap(); await ready();
    await back('browser'); assert.equal(await ui.locator('.pause-overlay').count(), 1);
    await page.getByRole('button', { name: 'Abandon', exact: true }).tap(); await ready();
    await page.getByRole('button', { name: 'End run', exact: true }).tap(); await ready();
    await page.getByRole('button', { name: 'Home', exact: true }).tap(); await ready();
    await page.goForward(); await ready();
    assert.equal(await isHome(), true, 'Retired entries cannot resurrect a run or stale results');
    mark('upgrade, banish and victory choices survive Back; Results parent, Play Again guard; forward cannot pay rewards twice');

    await openSettings();
    const reset = page.getByRole('button', { name: 'Reset progress', exact: true });
    await reset.scrollIntoViewIfNeeded(); await reset.tap(); await ready();
    await back('browser'); assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await ui.locator('.topbar h2').textContent(), 'Settings');
    await page.reload({ waitUntil: 'networkidle' }); await ready();
    assert.equal(await isHome(), true);
    assert.equal(await page.evaluate(() => history.state.depth), 0, 'Reload retires the old app history');
    assert.equal(await page.evaluate(() => document.dispatchEvent(new Event('backbutton', { cancelable: true }))), true, 'Home allows the native host to exit');
    await page.keyboard.press('Escape'); assert.equal(await isHome(), true);
    await page.goBack(); await page.waitForURL(`${url}/back-origin`);
    assert.equal(await page.title(), 'Before game', 'A single Back from Home returns to the previous site');
    mark('reset dialog cancellation, reload normalization and natural Home exit');
    console.log(`${engine}: Back navigation passed at ${width}x${height}`);
    await page.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${out}/back.json`, JSON.stringify({ engine, checks, errors }, null, 2));
} finally { await browser.close(); }
