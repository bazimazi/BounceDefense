// Real input checks across menu, progression, save and combat flows. Fixtures isolate each browser's save.
import { chromium, firefox, webkit } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const engine = process.env.ENGINE ?? 'chromium';
const browser = await ({ chromium, firefox, webkit }[engine]).launch({ headless: true });
const out = process.env.SHOTS ?? `smoke-shots/ui-audit/${engine}`;
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
    await page.goto(process.env.URL ?? 'http://localhost:4173', { waitUntil: 'networkidle' });
    const watchHud = () => page.evaluate(() => {
      const renderer = window.game.renderer, draw = renderer.draw.bind(renderer);
      renderer.draw = (world, hud = true) => { renderer.lastHudForAudit = hud; draw(world, hud); };
    });
    await watchHud();
    const tick = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const deckReady = async () => {
      await page.waitForFunction(() => !window.game.ui.navigation.busy && [...document.querySelectorAll('#ui .deck')].every(el => el.dataset.pages)
        && !document.getAnimations().some(animation => animation.id.startsWith('ui:') && animation.playState === 'running')
        && !document.querySelector('[data-motion-ghost]'));
      await tick();
    };
    const category = async name => {
      await ui.locator('.deck-tabs').getByRole('tab', { name, exact: true }).tap(); await tick();
      await deckReady();
    };
    const reveal = async locator => {
      await deckReady();
      while (!await ui.locator('.deck-prev').isDisabled()) { await ui.locator('.deck-prev').tap(); await deckReady(); }
      for (let i = 0; i < 100; i++) {
        const visible = locator.filter({ visible: true });
        if (await visible.count()) return visible.first();
        if (await ui.locator('.deck-next').isDisabled()) break;
        await ui.locator('.deck-next').tap(); await deckReady();
      }
      throw new Error(`Control not reachable in its category: ${locator}`);
    };
    const card = name => ui.locator('.deck-list .card').filter({ hasText: name });
    const back = async () => { await deckReady(); await page.getByRole('button', { name: 'Back', exact: true }).tap(); await deckReady(); };
    const homeNav = async name => { await ui.locator('.home-nav').getByRole('button', { name: new RegExp(name) }).tap(); await deckReady(); };
    const mark = text => checks.push(`${width}x${height}: ${text}`);

    // First run: playable home and tutorial, even before the full menu is unlocked.
    await ui.locator('.launch-button').tap();
    await page.waitForFunction(() => window.game.world?.cfg.tutorial);
    const canvas = page.locator('#game');
    let bounds = await canvas.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * .55, bounds.y + bounds.height * .55);
    await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .7, bounds.y + bounds.height * .35);
    await page.mouse.up();
    await page.waitForFunction(() => window.game.world.balls.some(b => b.state === 'flight'));
    await page.getByRole('button', { name: 'Pause game', exact: true }).tap();
    await tick(); assert.equal(await page.evaluate(() => window.game.renderer.lastHudForAudit), false);
    await page.screenshot({ path: `${out}/paused-${width}x${height}.png` });
    await page.getByRole('button', { name: 'Abandon', exact: true }).tap();
    assert.equal(await page.getByRole('dialog').count(), 1);
    await page.getByRole('button', { name: 'Keep playing', exact: true }).tap(); await deckReady();
    assert.equal(await ui.locator('.pause-overlay').count(), 1);
    await page.getByRole('button', { name: 'Abandon', exact: true }).tap();
    await page.getByRole('button', { name: 'End run', exact: true }).tap();
    await page.getByRole('button', { name: 'Home', exact: true }).tap();
    mark('first-run tutorial, pointer launch, abandon confirmation and rewards');

    await page.evaluate(() => {
      const g = window.game, p = g.profile;
      p.tutorialDone = true; p.coins = 10000; p.cores = 30; p.research = 30; p.mastery.striker = 6000;
      p.cleared.proving = 0; p.bossKills.fortress = 1; g.save(); g.ui.home();
    });
    // Unlock/select/equip/save a preset, then load it after changing the core.
    await homeNav('Loadout');
    await category('Core');
    await (await reveal(card('Pyro Core'))).getByRole('button', { name: /Unlock/ }).tap(); await deckReady();
    assert.equal(await page.evaluate(() => window.game.profile.loadout.core), 'pyro');
    assert.equal(await page.evaluate(() => window.game.profile.cores), 27);
    await category('Shell'); await (await reveal(card('Aero Shell'))).tap(); await deckReady();
    assert.equal(await page.evaluate(() => window.game.profile.loadout.shell), 'shell_aero');
    assert.equal(await page.evaluate(() => window.game.profile.coins), 9600);
    await category('Impact'); await (await reveal(card('Explosive Impact'))).tap(); await deckReady();
    assert.equal(await page.evaluate(() => window.game.profile.loadout.impact), 'impact_explosive');
    await category('Build Presets'); await page.getByRole('button', { name: 'Save', exact: true }).first().tap(); await deckReady();
    await category('Core'); await (await reveal(card('Striker Core'))).tap(); await deckReady();
    await category('Build Presets'); await page.getByRole('button', { name: 'Load', exact: true }).first().tap(); await deckReady();
    assert.equal(await page.evaluate(() => window.game.profile.loadout.core), 'pyro');
    await back();
    mark('core unlock, part purchases, equipment and preset save/load');

    await homeNav('Workshop');
    await (await reveal(card('Reinforced Line'))).getByRole('button').tap(); await deckReady();
    assert.equal(await page.evaluate(() => window.game.profile.workshop.hull), 1);
    await back(); await homeNav('Research');
    assert.equal(await (await reveal(card('Banishment'))).getByRole('button').isDisabled(), true);
    for (const name of ['Reroll Protocol', 'Banishment', 'Risk Pacts', 'Evolution Codex']) {
      await (await reveal(card(name))).getByRole('button').tap(); await deckReady();
    }
    assert.equal(await page.evaluate(() => window.game.flags().includes('pacts') && window.game.flags().includes('banish')), true);
    await back(); mark('Workshop purchase and Research prerequisite/unlock behavior');

    await homeNav('Talents');
    await ui.locator('#talent-bankcraft').tap(); await ui.locator('#talent-learn').tap();
    assert.equal(await page.evaluate(() => window.game.profile.talents.bankcraft ?? 0), 0);
    await page.getByRole('button', { name: 'Apply talents', exact: true }).tap();
    assert.equal(await page.evaluate(() => window.game.profile.talents.bankcraft), 1);
    await page.getByRole('button', { name: 'Close talent details', exact: true }).tap();
    for (const name of ['Conduit', 'Warden', 'Kinetics']) {
      await ui.locator('.talent-tabs').getByRole('button', { name: new RegExp(name) }).tap();
      await deckReady();
      assert.equal(await ui.locator('.talent-tree:visible').count(), 1);
    }
    await ui.locator('#talent-bankcraft').tap(); await ui.locator('#talent-refund').tap();
    await back(); await back();
    await page.getByRole('button', { name: 'Discard changes', exact: true }).tap(); await deckReady();
    await homeNav('Talents');
    assert.equal(await ui.locator('#talent-bankcraft .talent-rank').textContent(), '1/3');
    await back();
    mark('talent tabs, detail sheet, draft, apply and discard');

    await homeNav('Codex');
    for (let i = 0; i < 8; i++) {
      await ui.locator('.codex-tabs button').nth(i).tap(); await deckReady();
      assert.equal(await ui.locator('.codex-tabs button').nth(i).getAttribute('aria-selected'), 'true');
      if (!await ui.locator('.deck-next').isDisabled()) {
        await ui.locator('.deck-next').tap(); await deckReady(); assert.equal(await ui.locator('.deck').getAttribute('data-page'), '1');
        await ui.locator('.deck-prev').tap(); await deckReady(); assert.equal(await ui.locator('.deck').getAttribute('data-page'), '0');
        // The swipe handler uses standard Pointer Events in every engine.
        const content = ui.locator('.deck-content');
        await content.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 17, clientX: 220, clientY: 200 });
        await content.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 17, clientX: 70, clientY: 205 });
        await deckReady();
        assert.equal(await ui.locator('.deck').getAttribute('data-page'), '1');
      }
    }
    await back(); await homeNav('Goals');
    for (const name of ['Next goals', 'Challenges', 'Achievements', 'Mastery']) await category(name);
    await back(); mark('all Codex/Goals categories and pagination/swipe');

    await homeNav('Settings');
    await category('Combat feedback');
    for (const [label, key] of [['Screen shake', 'shake'], ['Damage numbers', 'damageNumbers']]) {
      const toggle = await reveal(page.getByRole('switch', { name: label, exact: true }));
      const before = await page.evaluate(key => window.game.profile.settings[key], key);
      await toggle.focus(); await toggle.press('Space');
      assert.equal(await toggle.getAttribute('aria-checked'), String(!before));
      await toggle.press('Enter'); assert.equal(await toggle.getAttribute('aria-checked'), String(before));
      await toggle.tap(); assert.equal(await page.evaluate(key => window.game.profile.settings[key], key), !before);
      await toggle.tap();
    }
    await category('Audio');
    for (const [label, key] of [['Sound effects', 'sfx'], ['Music', 'music']]) {
      const range = await reveal(page.getByRole('slider', { name: label, exact: true }));
      await range.focus(); await range.press('Home'); assert.equal(await range.getAttribute('aria-valuetext'), '0%');
      await range.press('End'); assert.equal(await range.getAttribute('aria-valuetext'), '100%');
      const r = await range.boundingBox(); await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
      assert.equal(await range.inputValue(), '50');
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down();
      await page.mouse.move(r.x + r.width * .75, r.y + r.height / 2, { steps: 5 }); await page.mouse.up();
      assert.ok(Number(await range.inputValue()) >= 70 && Number(await range.inputValue()) <= 85);
      await range.press('Home'); await range.press('ArrowRight');
      assert.equal(await page.evaluate(key => window.game.profile.settings[key], key), .05);
    }
    await category('Aim mode'); await ui.locator('[data-mode="slingshot"]').tap();
    await category('System');
    const debug = await reveal(page.getByRole('switch', { name: 'Debug tools', exact: true }));
    await debug.tap(); assert.equal(await page.locator('.debug').count(), 1); assert.equal(await page.locator('.debug').isVisible(), false);
    await debug.tap(); await back();
    await page.reload({ waitUntil: 'networkidle' });
    await watchHud();
    assert.deepEqual(await page.evaluate(() => [window.game.profile.settings.sfx, window.game.profile.settings.music, window.game.profile.settings.aimMode, window.game.profile.loadout.core, window.game.profile.talents.bankcraft]), [.05, .05, 'slingshot', 'pyro', 1]);
    mark('Settings touch/keyboard/drag controls, debug visibility and save/reload');

    // Select the setup cards with both touch and keyboard; check the snapshot used by the run.
    await ui.locator('.launch-button').tap(); await deckReady();
    await category('Overview'); await (await reveal(page.getByRole('button', { name: 'Edit talents', exact: true }))).tap();
    await back();
    assert.equal(await ui.locator('.topbar h2').textContent(), 'New Run');
    await category('Arena'); await (await reveal(card('The Foundry'))).tap(); await deckReady();
    await category('Difficulty'); await page.getByRole('button', { name: 'Veteran', exact: true }).tap(); await deckReady();
    await category('Risk Pacts'); const pact = await reveal(card('Glass Heart')); await pact.focus(); await pact.press('Space'); await deckReady();
    await page.getByRole('button', { name: /LAUNCH/ }).tap();
    assert.deepEqual(await page.evaluate(() => [window.game.world.cfg.arena, window.game.world.cfg.difficulty, window.game.world.cfg.pacts, window.game.world.talents.bankcraft]), ['foundry', 1, ['fragile'], 1]);
    // Real slingshot drag, Recall, Surge and pause/resume.
    bounds = await canvas.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .7); await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * .4, bounds.y + bounds.height * .85); await page.mouse.up();
    await page.waitForFunction(() => window.game.world.balls.some(b => b.state === 'flight'));
    await page.getByRole('button', { name: 'Recall balls (R)', exact: true }).tap();
    assert.equal(await page.evaluate(() => window.game.world.recalls), 1);
    await page.evaluate(() => { const w = window.game.world; w.surge.charge = w.surge.max; window.game.ui.updateHud(w); });
    // Surge intentionally pulses continuously; use a real touch at its center.
    const surge = page.getByRole('button', { name: 'Surge (Space)', exact: true });
    assert.equal(await surge.isEnabled(), true);
    const surgeBounds = await surge.boundingBox();
    await page.touchscreen.tap(surgeBounds.x + surgeBounds.width / 2, surgeBounds.y + surgeBounds.height / 2);
    assert.ok(await page.evaluate(() => window.game.world.surge.active > 0));
    await page.getByRole('button', { name: 'Pause game', exact: true }).tap();
    const time = await page.evaluate(() => window.game.world.time); await tick();
    assert.equal(await page.evaluate(() => window.game.world.time), time);
    await page.getByRole('button', { name: 'Settings', exact: true }).tap(); await back();
    await page.keyboard.press('Escape'); await deckReady();
    await tick(); assert.equal(await page.evaluate(() => window.game.renderer.lastHudForAudit), true);
    assert.equal(await ui.locator('.levelup').count(), 0);
    assert.equal(await page.evaluate(() => window.game.controlsEnabled), true);
    mark('run setup, talents snapshot, slingshot, Recall, Surge and keyboard resume');

    await page.evaluate(() => { const w = window.game.world; w.pendingLevels = 2; w.level = 3; w.openLevelUp(); });
    await deckReady();
    assert.equal(await page.evaluate(() => window.game.renderer.lastHudForAudit), false);
    await page.keyboard.press('Escape'); assert.equal(await ui.locator('.pause-overlay').count(), 1);
    await page.getByRole('button', { name: /Resume/ }).tap(); await deckReady();
    assert.equal(await ui.locator('.offer-list').count(), 1);
    const rerolls = await page.evaluate(() => window.game.world.rerolls);
    await page.getByRole('button', { name: /Reroll/ }).tap(); await deckReady();
    assert.equal(await page.evaluate(() => window.game.world.rerolls), rerolls - 1);
    const id = await page.evaluate(() => window.game.world.offers.find(o => o.kind === 'upgrade').id);
    await page.getByRole('button', { name: /Banish/ }).tap(); await deckReady();
    await ui.locator('.deck-list .offer').first().tap(); await deckReady();
    assert.equal(await page.evaluate(id => window.game.world.banished.has(id), id), true);
    await ui.locator('.deck-list .offer').first().tap(); await deckReady();
    assert.equal(await page.evaluate(() => window.game.world.pendingLevels), 1);
    assert.equal(await ui.locator('.levelup').count(), 1, 'Consecutive level-ups keep the next choice open');
    await page.getByRole('button', { name: 'Skip', exact: true }).tap();
    assert.equal(await page.evaluate(() => window.game.world.state), 'playing');
    assert.equal(await ui.locator('.levelup').count(), 0);
    mark('pause during upgrade, reroll, banish, consecutive levels and Skip');

    await page.evaluate(() => { const g = window.game, w = g.world; w.victory = true; w.state = 'over'; g.ui.victoryChoice(w); });
    await page.getByRole('button', { name: /Continue.*Endless/ }).tap();
    assert.equal(await page.evaluate(() => window.game.world.director.endless), true);
    assert.equal(await page.evaluate(() => window.game.world.state), 'playing');
    await page.getByRole('button', { name: 'Pause game', exact: true }).tap();
    await page.getByRole('button', { name: 'Abandon', exact: true }).tap(); await page.getByRole('button', { name: 'End run', exact: true }).tap();
    await page.getByRole('button', { name: /One more run/ }).tap();
    assert.equal(await ui.locator('.topbar h2').textContent(), 'New Run');
    await back();
    assert.ok(await ui.locator('.result-title').count());
    await page.getByRole('button', { name: 'Home', exact: true }).tap(); await deckReady();
    await homeNav('Daily Seed');
    assert.equal(await page.evaluate(() => window.game.world.cfg.daily), true);
    await page.evaluate(() => { const g = window.game; g.world.victory = true; g.world.state = 'over'; g.ui.victoryChoice(g.world); });
    await page.getByRole('button', { name: /Claim rewards/ }).tap();
    assert.equal(await ui.locator('.result-title').textContent(), 'RUN COMPLETE');
    await page.getByRole('button', { name: 'Home', exact: true }).tap();
    mark('victory, Endless, result navigation, Daily Seed and claim rewards');

    await homeNav('Settings'); await category('System');
    await (await reveal(page.getByRole('button', { name: 'Reset progress', exact: true }))).tap();
    await page.screenshot({ path: `${out}/reset-dialog-${width}x${height}.png` });
    await page.keyboard.press('Escape'); await deckReady(); assert.equal(await page.getByRole('dialog').count(), 0);
    assert.ok(await page.evaluate(() => window.game.profile.coins > 0));
    await page.getByRole('button', { name: 'Reset progress', exact: true }).tap();
    await page.getByRole('button', { name: 'Erase progress', exact: true }).tap();
    assert.deepEqual(await page.evaluate(() => [window.game.profile.coins, window.game.profile.tutorialDone, window.game.profile.settings.aimMode]), [0, false, 'slingshot']);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => window.game.profile.coins), 0);
    mark('game-styled reset dialog, cancel, reset and persistence');
    console.log(`${engine}: functional flows passed at ${width}x${height}`);
    // Keep context disposal with browser.close(): Firefox can race window restoration after reload.
    await page.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${out}/flows.json`, JSON.stringify({ engine, checks, errors }, null, 2));
  console.log(`${engine}: ${checks.length} functional flow groups passed`);
} finally { await browser.close(); }
