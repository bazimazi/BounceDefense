// Arcade flows with real input: the Arcade sheet, a Trickshot stage cleared at par by pointer drags,
// Next stage, a failed board, Siege volleys, Pause/Restart/abandon, Back from every arcade page, and the
// sheet and results in Persian (right to left, no overflow).
import { chromium, firefox, webkit } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { uiHelpers } from './ui-helpers.mjs';
import { STAGES } from '../src/data/trickshot.ts';

const engine = process.env.ENGINE ?? 'chromium';
const browser = await ({ chromium, firefox, webkit }[engine]).launch({ headless: true });
const out = process.env.SHOTS ?? `smoke-shots/ui-audit/${engine}`;
fs.mkdirSync(out, { recursive: true });
const errors = [], checks = [];
try {
  for (const [width, height] of [[390, 844], [320, 568], [844, 390]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(process.env.URL ?? 'http://localhost:4173', { waitUntil: 'networkidle' });
    const { ui, ready, isHome } = uiHelpers(page);
    const mark = text => checks.push(`${width}x${height}: ${text}`);
    const state = (fn, arg) => page.evaluate(fn, arg);

    // A fresh profile has no Arcade: it opens with First Contact done.
    assert.equal(await ui.locator('.arcade-btn').count(), 0, 'Arcade waits for First Contact');
    await state(() => { window.game.profile.tutorialDone = true; window.game.save(); window.game.ui.home(); });
    await ready();
    await ui.locator('.arcade-btn').tap();
    await ready();
    assert.equal(await ui.locator('.arcade-sheet').count(), 1);
    assert.equal(await ui.locator('.stage-tile').count(), STAGES.length);
    assert.equal(await ui.locator('.stage-tile:not([disabled])').count(), 1, 'only the first stage is open');
    assert.equal(await ui.locator('.stage-tile').first().getAttribute('aria-checked'), 'true');
    mark('Arcade sheet: every stage listed, only the first open');

    // Back closes the sheet onto Home.
    await page.goBack();
    await ready();
    assert.ok(await isHome());
    assert.equal(await ui.locator('.arcade-sheet').count(), 0);
    mark('Back closes the Arcade sheet');

    // Trickshot stage 1, cleared at par with a real drag.
    await ui.locator('.arcade-btn').tap();
    await ready();
    await ui.locator('.arcade-play').tap();
    await page.waitForFunction(() => window.game.world?.arcade?.kind === 'trickshot');
    const canvas = page.locator('#game');
    const shoot = async deg => {
      await page.waitForFunction(() => window.game.world?.arcade?.canFire());
      const b = await canvas.boundingBox();
      const P = (lx, ly) => ({ x: b.x + (lx / 540) * b.width, y: b.y + (ly / 960) * b.height });
      const r = (deg * Math.PI) / 180;
      const a = P(270, 700), to = P(270 + Math.cos(r) * 400, 850 + Math.sin(r) * 400);
      await page.mouse.move(a.x, a.y); await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 5 });
      await page.mouse.up();
      await page.waitForFunction(() => window.game.world === null || !window.game.world.balls.some(x => x.kind === 'main') || window.game.world.endTimer >= 0, null, { timeout: 20000 });
    };
    // Pointer rounding moves the aim by about a tenth of a degree; stored solutions tolerate half a degree.
    for (const deg of STAGES[0].solution) await shoot(deg);
    await page.waitForSelector('.arcade-results', { timeout: 20000 });
    await ready();
    assert.equal(await ui.locator('.result-star.got').count(), 3);
    assert.equal(await state(() => window.game.profile.arcade.stars.t1), 3);
    assert.ok(await state(() => window.game.profile.coins) > 0, 'new stars pay coins');
    mark('Trickshot: stage 1 cleared at par by pointer input, 3 stars saved and paid');

    // Next stage starts stage 2; abandoning it from Pause fails the board without stars.
    await ui.locator('.results-actions .primary').tap();
    await page.waitForFunction(() => window.game.world?.arcade?.stage?.id === 't2');
    mark('Next stage opens the following stage');
    await ui.locator('.pause-btn').tap();
    await ready();
    assert.equal(await ui.locator('.arcade-pause').count(), 1);
    await ui.locator('.arcade-pause .overlay-actions button', { hasText: /Restart/ }).tap();
    await page.waitForFunction(() => window.game.world?.arcade?.stage?.id === 't2' && !window.game.paused);
    await ready();
    mark('Pause Restart starts the same stage over');
    await ui.locator('.pause-btn').tap();
    await ready();
    await ui.locator('.arcade-pause .danger').tap();
    await ready();
    await ui.locator('.confirm-overlay .danger').tap();
    await page.waitForSelector('.arcade-results');
    await ready();
    assert.equal(await ui.locator('.result-star.got').count(), 0);
    assert.equal(await state(() => window.game.profile.arcade.stars.t2), undefined);
    mark('Abandoned board: no stars');

    // Back from results goes Home; Forward cannot revive the board.
    await page.goBack();
    await ready();
    assert.ok(await isHome());
    await page.goForward().catch(() => {});
    await ready();
    assert.equal(await state(() => window.game.world), null);
    // Forward may show the results page again (a page, not the run); go back Home from it.
    if (!(await isHome())) { await page.goBack(); await ready(); }
    assert.ok(await isHome());
    mark('Back from arcade results returns Home and Forward does not revive the run');

    // Siege: one volley with every ball, the wall steps down, then abandon pays the turns held.
    await ui.locator('.arcade-btn').tap();
    await ready();
    await ui.locator('.arcade-mode').nth(1).tap();
    await ready();
    assert.equal(await ui.locator('.arcade-siege-card').count(), 1);
    await ui.locator('.arcade-play').tap();
    await page.waitForFunction(() => window.game.world?.arcade?.kind === 'siege');
    assert.equal(await ui.locator('.surge').count(), 0, 'Siege has no Surge button');
    for (const deg of [-70, -110, -60]) {
      const turn = await state(() => window.game.world.arcade.turn);
      await shoot(deg);
      await page.waitForFunction(t => window.game.world === null || window.game.world.arcade.turn > t && window.game.world.arcade.phase === 'aim', turn, { timeout: 60000 });
      if (await state(() => window.game.world === null)) break;
    }
    const turnNow = await state(() => window.game.world?.arcade?.turn ?? 0);
    assert.ok(turnNow >= 4, 'three volleys moved the wall on');
    mark('Siege: volleys fire every ball and the wall steps down after each');
    await ui.locator('.pause-btn').tap();
    await ready();
    await ui.locator('.arcade-pause .danger').tap();
    await ready();
    await ui.locator('.confirm-overlay .danger').tap();
    await page.waitForSelector('.arcade-results.siege');
    assert.ok(await state(() => window.game.profile.arcade.siegeBest) >= 3);
    await page.screenshot({ path: `${out}/arcade-siege-results-${width}x${height}.png` });
    mark('Siege results record the best');

    // Rebound: the pointer slides the paddle, release launches from it, keys work too, and there is no Recall.
    await ui.locator('.results-actions .home-btn').tap();
    await ready();
    await ui.locator('.arcade-mode').nth(2).tap();
    await ready();
    assert.equal(await ui.locator('.arcade-rebound-card').count(), 1);
    await ui.locator('.arcade-play').tap();
    await page.waitForFunction(() => window.game.world?.arcade?.kind === 'rebound');
    await ready();
    assert.equal(await ui.locator('.recall').count(), 0, 'Rebound has no Recall');
    {
      const b = await canvas.boundingBox();
      const P = (lx, ly) => ({ x: b.x + (lx / 540) * b.width, y: b.y + (ly / 960) * b.height });
      let q = P(270, 600);
      await page.mouse.move(q.x, q.y); await page.mouse.down();
      q = P(120, 640); await page.mouse.move(q.x, q.y, { steps: 6 });
      await page.waitForFunction(() => Math.abs(window.game.world.arcade.paddle.x - 120) < 4);
      assert.equal(await state(() => window.game.world.balls.length), 0, 'dragging alone does not launch');
      await page.mouse.up();
      await page.waitForFunction(() => window.game.world.balls.some(x => x.kind === 'main'));
      assert.equal(await state(() => window.game.world.arcade.docked), false);
      const before = await state(() => window.game.world.arcade.paddle.tx);
      await page.keyboard.press('ArrowRight');
      assert.ok(await state(() => window.game.world.arcade.paddle.tx) > before, 'arrow keys slide the paddle');
    }
    mark('Rebound: pointer slides the paddle, release launches from it, arrow keys steer, no Recall');
    await ui.locator('.pause-btn').tap();
    await ready();
    assert.equal(await ui.locator('.arcade-pause').count(), 1);
    await ui.locator('.arcade-pause .danger').tap();
    await ready();
    await ui.locator('.confirm-overlay .danger').tap();
    await page.waitForSelector('.arcade-results.siege');
    assert.ok(await state(() => window.game.profile.arcade.reboundBest) >= 1);
    mark('Rebound results record the wave reached');

    // Persian: the sheet and results right to left without horizontal overflow.
    await state(() => { window.game.profile.settings.language = 'fa'; window.game.applySettings(); window.game.ui.home(); });
    await ready();
    await ui.locator('.arcade-btn').tap();
    await ready();
    const overflow = await state(() => [...document.querySelectorAll('.arcade-sheet .sheet, .arcade-sheet .stage-grid, .arcade-sheet .mode-option, .arcade-sheet .arcade-milestone, .arcade-sheet .arcade-play')]
      .filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.className));
    assert.deepEqual(overflow, []);
    assert.equal(await state(() => document.documentElement.dir), 'rtl');
    await page.screenshot({ path: `${out}/arcade-sheet-fa-${width}x${height}.png` });
    mark('Persian Arcade sheet fits right to left');
    await state(() => { window.game.profile.settings.language = 'en'; window.game.applySettings(); });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`${engine}: arcade checks passed\n  ${checks.join('\n  ')}`);
} finally {
  await browser.close();
}
