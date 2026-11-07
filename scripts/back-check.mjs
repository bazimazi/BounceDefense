// Real History API traversal and mobile input, not synthetic popstate events.
import { chromium, firefox, webkit } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const engine = process.env.ENGINE ?? 'chromium';
const browser = await ({ chromium, firefox, webkit }[engine]).launch({ headless: true });
const out = process.env.SHOTS ?? `smoke-shots/back/${engine}`;
fs.mkdirSync(out, { recursive: true });
const errors = [], checks = [];
try {
  for (const [width, height] of [[320, 568], [568, 320]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    const page = await context.newPage();
    const ui = page.locator('#ui');
    page.setDefaultTimeout(8000);
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const url = process.env.URL ?? 'http://localhost:4173';
    await page.route(`${url}/back-origin`, route => route.fulfill({ contentType: 'text/html', body: '<title>Before game</title><p>Previous page</p>' }));
    await page.goto(`${url}/back-origin`);
    await page.goto(url, { waitUntil: 'networkidle' });
    const ready = async () => {
      await page.waitForFunction(() => window.game && !window.game.ui.navigation.busy && [...document.querySelectorAll('#ui .deck')].every(d => d.dataset.pages)
        && !document.getAnimations().some(animation => animation.id.startsWith('ui:') && animation.playState === 'running')
        && !document.querySelector('[data-motion-ghost]'));
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    };
    const back = async kind => {
      await ready();
      if (kind === 'browser') await page.goBack();
      else if (kind === 'touch') await page.getByRole('button', { name: 'Back', exact: true }).tap();
      else if (kind === 'hardware') assert.equal(await page.evaluate(() => !document.dispatchEvent(new Event('backbutton', { bubbles: true, cancelable: true }))), true);
      else await page.keyboard.press('Escape');
      await ready();
    };
    const homeNav = async name => { await ready(); await ui.locator('.home-nav').getByRole('button', { name: new RegExp(name) }).tap(); await ready(); };
    const category = async name => { await ui.locator('.deck-tabs').getByRole('tab', { name, exact: true }).tap(); await ready(); };
    const reveal = async locator => {
      while (!await ui.locator('.deck-prev').isDisabled()) { await ui.locator('.deck-prev').tap(); await ready(); }
      for (let i = 0; i < 100; i++) {
        const visible = locator.filter({ visible: true });
        if (await visible.count()) return visible.first();
        if (await ui.locator('.deck-next').isDisabled()) break;
        await ui.locator('.deck-next').tap(); await ready();
      }
      throw new Error(`Control not reachable: ${locator}`);
    };
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

    // Every menu has exactly one Back step; category/page changes aren't history entries.
    for (const [name, kind] of [['Loadout', 'browser'], ['Workshop', 'hardware'], ['Research', 'escape'], ['Codex', 'touch'], ['Goals', 'browser'], ['Settings', 'hardware'], ['Talents', 'escape']]) {
      await homeNav(name);
      const historyLength = await page.evaluate(() => history.length);
      if (name === 'Codex') {
        await page.getByRole('tab', { name: /Upgrades/ }).tap(); await ready();
        await ui.locator('.deck-next').tap(); await ready();
        await page.getByRole('tab', { name: /Arenas/ }).tap(); await ready();
      }
      assert.equal(await page.evaluate(() => history.length), historyLength);
      await back(kind);
      assert.equal(await ui.locator('.home').count(), 1, `${kind} from ${name}`);
    }
    mark('every menu: browser, hardware, Escape and touch Back; no history per category/page');

    // Forward restores a menu, and purchasing/rerendering never adds extra Back steps.
    await homeNav('Loadout'); await back('browser'); await page.goForward(); await ready();
    assert.equal(await ui.locator('.topbar h2').textContent(), 'Loadout');
    const beforePurchase = await page.evaluate(() => history.length);
    await category('Shell');
    await (await reveal(ui.locator('.card').filter({ hasText: 'Aero Shell' }))).tap(); await ready();
    assert.equal(await page.evaluate(() => history.length), beforePurchase);
    await back('browser'); assert.equal(await ui.locator('.home').count(), 1);
    mark('forward restoration and one-step Back after purchase');

    // Talent Back closes the sheet, asks about the draft, and keeps it on cancel.
    await ui.locator('.launch-button').tap(); await ready();
    await category('Overview'); await page.getByRole('button', { name: 'Edit talents', exact: true }).tap(); await ready();
    await ui.locator('#talent-bankcraft').tap(); await ui.locator('#talent-learn').tap();
    await back('browser');
    assert.equal(await ui.locator('.talent-screen[data-detail-open]').count(), 0);
    assert.equal(await ui.locator('#talent-bankcraft .talent-rank').textContent(), '1/3');
    await page.evaluate(() => window.game.ui.toast('Recent unlock'));
    await back('hardware'); assert.equal(await page.getByRole('dialog', { name: 'Discard talent changes?' }).count(), 1);
    assert.equal(await ui.locator('.toast:visible').count(), 0, 'Toasts cannot cover confirmation text or actions');
    const dialog = page.getByRole('dialog', { name: 'Discard talent changes?' });
    assert.equal(await dialog.evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && el.scrollHeight <= el.clientHeight + 1;
    }), true, 'Discard prompt fits the phone without scrolling');
    await page.screenshot({ path: `${out}/talent-discard-${width}x${height}.png` });
    await back('browser'); assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await ui.locator('#talent-bankcraft .talent-rank').textContent(), '1/3');
    await back('touch'); await page.getByRole('button', { name: 'Discard changes', exact: true }).tap(); await ready();
    assert.equal(await ui.locator('.topbar h2').textContent(), 'New Run');
    assert.deepEqual(await page.evaluate(() => window.game.profile.talents), {});
    // Forward onto the old prompt finds nothing left to discard: stay on Talents, keep one Back step.
    await page.goForward(); await ready(); await page.goForward(); await ready();
    assert.equal(await page.getByRole('dialog').count(), 0, 'A retired discard prompt does not reopen');
    assert.equal(await ui.locator('.topbar h2').textContent(), 'Talents');
    await back('browser'); assert.equal(await ui.locator('.topbar h2').textContent(), 'New Run');
    await page.getByRole('button', { name: 'Edit talents', exact: true }).tap(); await ready();
    await ui.locator('#talent-bankcraft').tap(); await ui.locator('#talent-learn').tap();
    await page.getByRole('button', { name: 'Apply talents', exact: true }).tap();
    await back('escape');
    await page.getByRole('button', { name: 'Back', exact: true }).evaluate(button => { button.click(); button.click(); }); await ready();
    assert.equal(await ui.locator('.topbar h2').textContent(), 'New Run');
    assert.equal(await page.evaluate(() => window.game.profile.talents.bankcraft), 1);
    mark('talent details, draft confirmation/cancel/discard/apply, double-click protection and return to invoking Setup');

    await page.getByRole('button', { name: /LAUNCH/ }).tap(); await ready();
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
    await page.getByRole('button', { name: /Banish \(1\)/ }).tap(); await ready();
    await back('hardware');
    assert.equal(await page.evaluate(() => window.game.paused), false, 'Back leaves banish mode before pausing');
    assert.equal(await page.getByRole('button', { name: /Banish \(1\)/ }).count(), 1);
    await page.getByRole('button', { name: /Banish \(1\)/ }).tap(); await ready();
    await back('browser'); assert.equal(await page.getByRole('button', { name: /Banish \(1\)/ }).count(), 1);
    assert.deepEqual(await page.evaluate(() => window.game.world.offers), offers);
    await page.getByRole('button', { name: /^Skip/ }).tap(); await ready();
    await page.getByRole('button', { name: /^Skip/ }).tap(); await ready();
    await page.evaluate(() => { const g = window.game; g.world.state = 'over'; g.world.victory = true; g.ui.victoryChoice(g.world); });
    await back('hardware'); await back('browser');
    assert.equal(await page.getByRole('button', { name: /Claim rewards/ }).count(), 1);
    await page.screenshot({ path: `${out}/victory-back-${width}x${height}.png` });
    await page.getByRole('button', { name: /Claim rewards/ }).tap(); await ready();
    const runs = await page.evaluate(() => window.game.profile.stats.runs);
    await page.getByRole('button', { name: /One more run/ }).tap(); await ready();
    await back('touch'); assert.equal(await ui.locator('.result-title').textContent(), 'RUN COMPLETE');
    await back('browser'); assert.equal(await ui.locator('.home').count(), 1);
    await page.goForward(); await ready(); assert.equal(await ui.locator('.result-title').textContent(), 'RUN COMPLETE');
    assert.equal(await page.evaluate(() => window.game.profile.stats.runs), runs);
    assert.equal(await page.evaluate(() => window.game.world), null);
    await page.getByRole('button', { name: 'Home', exact: true }).tap(); await ready();
    await page.goForward(); await ready();
    assert.equal(await ui.locator('.home').count(), 1, 'Retired entries cannot resurrect a run or stale results');
    mark('upgrade, banish and victory choices survive Back; Results parent and forward cannot pay rewards twice');

    await homeNav('Settings'); await category('System');
    await (await reveal(page.getByRole('button', { name: 'Reset progress', exact: true }))).tap(); await ready();
    await back('browser'); assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await ui.locator('.topbar h2').textContent(), 'Settings');
    assert.equal(await page.evaluate(() => window.game.profile.stats.runs), runs);
    await page.reload({ waitUntil: 'networkidle' }); await ready();
    assert.equal(await ui.locator('.home').count(), 1);
    assert.equal(await page.evaluate(() => history.state.depth), 0, 'Reload retires the old app history');
    assert.equal(await page.evaluate(() => document.dispatchEvent(new Event('backbutton', { cancelable: true }))), true, 'Home allows the native host to exit');
    await page.keyboard.press('Escape'); assert.equal(await ui.locator('.home').count(), 1);
    await page.goBack(); await page.waitForURL(`${url}/back-origin`);
    assert.equal(await page.title(), 'Before game', 'A single Back from Home returns to the previous site');
    mark('reset dialog cancellation, reload normalization and natural Home exit');
    console.log(`${engine}: Back navigation passed at ${width}x${height}`);
    await page.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${out}/back.json`, JSON.stringify({ engine, checks, errors }, null, 2));
} finally { await browser.close(); }
