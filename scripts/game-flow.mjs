// Real input checks across the hub, progression, save and combat flows. Fixtures isolate each browser's save.
import { chromium, firefox, webkit } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { uiHelpers } from './ui-helpers.mjs';

const engine = process.env.ENGINE ?? 'chromium';
const browser = await ({ chromium, firefox, webkit }[engine]).launch({ headless: true });
const out = process.env.SHOTS ?? `smoke-shots/ui-audit/${engine}`;
fs.mkdirSync(out, { recursive: true });
const errors = [], checks = [];
try {
  for (const [width, height] of [[320, 568], [568, 320]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(process.env.URL ?? 'http://localhost:4173', { waitUntil: 'networkidle' });
    const { ui, tick, ready, isHome, tab, segment, openSettings, closeSheet, row, shopRow } = uiHelpers(page);
    const watchHud = () => page.evaluate(() => {
      const renderer = window.game.renderer, draw = renderer.draw.bind(renderer);
      renderer.draw = (world, hud = true) => { renderer.lastHudForAudit = hud; draw(world, hud); };
    });
    await watchHud();
    const state = (fn, arg) => page.evaluate(fn, arg);
    const mark = text => checks.push(`${width}x${height}: ${text}`);

    // First run: one button, a tutorial with a ghost-hand gesture, and the full pause/abandon path.
    assert.equal(await ui.locator('.tabbar').count(), 0, 'First Contact hides the tab bar');
    await ui.locator('.launch-button').tap();
    await page.waitForFunction(() => window.game.world?.cfg.tutorial);
    await page.waitForSelector('.guide-hand', { state: 'attached' });
    const canvas = page.locator('#game');
    let bounds = await canvas.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * .55, bounds.y + bounds.height * .55);
    await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .7, bounds.y + bounds.height * .35);
    await page.mouse.up();
    await page.waitForFunction(() => window.game.world.balls.some(b => b.state === 'flight'));
    await page.waitForFunction(() => !document.querySelector('.guide-hand'));
    await page.getByRole('button', { name: 'Pause game', exact: true }).tap(); await ready();
    await tick(); assert.equal(await state(() => window.game.renderer.lastHudForAudit), false);
    await page.screenshot({ path: `${out}/paused-${width}x${height}.png` });
    await page.getByRole('button', { name: 'Abandon', exact: true }).tap();
    assert.equal(await page.getByRole('dialog').count(), 1);
    await page.getByRole('button', { name: 'Keep playing', exact: true }).tap(); await ready();
    assert.equal(await ui.locator('.pause-overlay').count(), 1);
    await page.getByRole('button', { name: 'Abandon', exact: true }).tap();
    await page.getByRole('button', { name: 'End run', exact: true }).tap(); await ready();
    await page.getByRole('button', { name: 'Home', exact: true }).tap(); await ready();
    assert.equal(await ui.locator('.tabbar').count(), 1, 'The hub opens after the first run');
    mark('first run: no tab bar, ghost hand until the first launch, abandon confirmation and rewards');

    await state(() => {
      const g = window.game, p = g.profile;
      p.tutorialDone = true; p.coins = 10000; p.cores = 30; p.research = 30; p.mastery.striker = 6000;
      p.cleared.proving = 0; p.bossKills.fortress = 1; g.save(); g.ui.home();
    });
    await ready();
    assert.equal(await ui.locator('.tabbar .tab-armory .badge').count(), 1, 'Affordable unlocks badge the Armory tab');

    // Armory: browse and unlock a core, buy and equip parts from sheets, save and load a preset.
    await tab('armory');
    await ui.getByRole('button', { name: 'Next core', exact: true }).tap(); await ready();
    assert.equal(await ui.locator('.core-title h2').textContent(), 'Pyro Core');
    await ui.locator('.core-unlock button').tap(); await ready();
    assert.deepEqual(await state(() => [window.game.profile.loadout.core, window.game.profile.cores]), ['pyro', 27]);
    await row('.slot-row', 'Shell').tap(); await ready();
    assert.equal(await ui.locator('.sheet-layer').count(), 1);
    await row('.option-row', 'Aero Shell').tap(); await ready();
    assert.equal(await ui.locator('.sheet-layer').count(), 0, 'Choosing a part closes its sheet');
    assert.deepEqual(await state(() => [window.game.profile.loadout.shell, window.game.profile.coins]), ['shell_aero', 9600]);
    await row('.slot-row', 'Impact').tap(); await ready();
    await row('.option-row', 'Explosive Impact').tap(); await ready();
    assert.equal(await state(() => window.game.profile.loadout.impact), 'impact_explosive');
    await ui.locator('.preset-card').first().getByRole('button', { name: 'Save', exact: true }).tap(); await ready();
    await ui.getByRole('button', { name: 'Previous core', exact: true }).tap(); await ready();
    assert.equal(await state(() => window.game.profile.loadout.core), 'striker');
    await ui.locator('.preset-card').first().getByRole('button', { name: 'Load', exact: true }).tap(); await ready();
    assert.equal(await state(() => window.game.profile.loadout.core), 'pyro');
    await row('.slot-row', 'Trail').tap(); await ready(); await closeSheet();
    assert.equal(await ui.locator('.hub-armory').count(), 1);
    mark('core carousel unlock, part sheets with purchase, presets save/load');

    // Forge: Workshop purchase, Research prerequisites, immediate talents.
    await tab('forge');
    await shopRow('Reinforced Line').getByRole('button').tap(); await ready();
    assert.equal(await state(() => window.game.profile.workshop.hull), 1);
    await segment('Research');
    assert.equal(await shopRow('Banishment').getByRole('button').isDisabled(), true);
    for (const name of ['Reroll Protocol', 'Banishment', 'Risk Pacts', 'Evolution Codex']) {
      await shopRow(name).getByRole('button').tap(); await ready();
    }
    assert.equal(await state(() => window.game.flags().includes('pacts') && window.game.flags().includes('banish')), true);
    await segment('Talents');
    await ui.locator('#talent-bankcraft').tap(); await ui.locator('#talent-learn').tap(); await ready();
    assert.equal(await state(() => window.game.profile.talents.bankcraft), 1, 'Talents apply immediately');
    for (const name of ['Conduit', 'Warden', 'Kinetics']) {
      await ui.locator('.talent-tabs').getByRole('tab', { name: new RegExp(name) }).tap(); await ready();
      assert.equal(await ui.locator('.talent-tree').count(), 1);
    }
    await ui.locator('#talent-bankcraft').tap(); await ui.locator('#talent-learn').tap(); await ready();
    await ui.locator('#talent-refund').tap(); await ready();
    assert.equal(await ui.locator('#talent-bankcraft .talent-rank').textContent(), '1/3');
    mark('Workshop purchase, Research prerequisites/unlocks, talent trees with instant learn/refund');

    // Codex and Goals: every category, an entry's detail sheet, and the goal segments.
    await tab('codex');
    for (let i = 0; i < 8; i++) {
      await ui.locator('.codex-tabs button').nth(i).tap(); await ready();
      assert.equal(await ui.locator('.codex-tabs button').nth(i).getAttribute('aria-selected'), 'true');
    }
    await ui.locator('.codex-tile').first().tap(); await ready();
    assert.equal(await ui.locator('.sheet-layer').count(), 1);
    await closeSheet();
    await tab('goals');
    for (const name of ['Challenges', 'Badges', 'Mastery', 'Next']) await segment(new RegExp(`^${name}`));
    mark('all Codex categories, entry sheet, and Goals segments');

    // Settings: keyboard/touch toggles, slider drag, aim mode, debug tools, persistence.
    await openSettings();
    for (const [label, key] of [['Screen shake', 'shake'], ['Damage numbers', 'damageNumbers'], ['Left-handed controls', 'leftHanded']]) {
      const toggle = page.getByRole('switch', { name: label, exact: true });
      const before = await state(k => window.game.profile.settings[k], key);
      await toggle.focus(); await toggle.press('Space');
      assert.equal(await toggle.getAttribute('aria-checked'), String(!before), label);
      await toggle.press('Enter'); assert.equal(await toggle.getAttribute('aria-checked'), String(before));
      await toggle.tap(); assert.equal(await state(k => window.game.profile.settings[k], key), !before);
      if (key !== 'leftHanded') await toggle.tap();
    }
    for (const [label, key] of [['Sound effects', 'sfx'], ['Music', 'music']]) {
      const range = page.getByRole('slider', { name: label, exact: true });
      await range.scrollIntoViewIfNeeded();
      await range.focus(); await range.press('Home'); assert.equal(await range.getAttribute('aria-valuetext'), '0%');
      await range.press('End'); assert.equal(await range.getAttribute('aria-valuetext'), '100%');
      const r = await range.boundingBox(); await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
      assert.equal(await range.inputValue(), '50');
      await range.press('Home'); await range.press('ArrowRight');
      assert.equal(await state(k => window.game.profile.settings[k], key), .05);
    }
    await ui.locator('[data-mode="slingshot"]').tap();
    const debug = page.getByRole('switch', { name: 'Debug tools', exact: true });
    await debug.scrollIntoViewIfNeeded();
    await debug.tap(); assert.equal(await page.locator('.debug').count(), 1); assert.equal(await page.locator('.debug').isVisible(), false);
    await debug.tap();
    await page.getByRole('button', { name: 'Back', exact: true }).tap(); await ready();
    assert.equal(await ui.locator('.hub-goals').count(), 1, 'Settings returns to the tab that opened it');
    await page.reload({ waitUntil: 'networkidle' }); await ready();
    await watchHud();
    assert.deepEqual(await state(() => [window.game.profile.settings.sfx, window.game.profile.settings.music, window.game.profile.settings.aimMode, window.game.profile.settings.leftHanded, window.game.profile.loadout.core, window.game.profile.talents.bankcraft]),
      [.05, .05, 'slingshot', true, 'pyro', 1]);
    mark('Settings touch/keyboard/drag controls, debug visibility and save/reload');

    // Battle tab: the run card opens Run setup (arena carousel, difficulty, pacts); Home then
    // summarizes the choice and launches with it.
    assert.equal(await isHome(), true);
    await ui.locator('.run-card').tap(); await ready();
    await ui.getByRole('button', { name: 'Next arena', exact: true }).tap(); await ready();
    assert.match(await ui.locator('.arena-name').textContent(), /Foundry/);
    await ui.getByRole('radio', { name: 'Veteran', exact: true }).tap(); await ready();
    const pact = row('.pact-row', 'Glass Heart'); await pact.focus(); await pact.press('Space'); await ready();
    assert.equal(await pact.getAttribute('aria-checked'), 'true');
    await closeSheet();
    assert.match(await ui.locator('.run-card').textContent(), /Foundry.*Veteran/);
    assert.match(await ui.locator('.run-pacts').textContent(), /1/);
    await ui.locator('.play-btn').tap();
    await page.waitForFunction(() => window.game.world && !window.game.world.cfg.tutorial);
    assert.deepEqual(await state(() => [window.game.world.cfg.arena, window.game.world.cfg.difficulty, window.game.world.cfg.pacts, window.game.world.talents.bankcraft]), ['foundry', 1, ['fragile'], 1]);
    assert.equal(await ui.getAttribute('data-left-handed'), '', 'Left-handed controls mirror the HUD');
    // Real slingshot drag, Recall, Surge and pause/resume.
    bounds = await canvas.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .7); await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * .4, bounds.y + bounds.height * .85); await page.mouse.up();
    await page.waitForFunction(() => window.game.world.balls.some(b => b.state === 'flight'));
    await page.getByRole('button', { name: 'Recall balls (R)', exact: true }).tap();
    assert.equal(await state(() => window.game.world.recalls), 1);
    await state(() => { const w = window.game.world; w.surge.charge = w.surge.max; window.game.ui.updateHud(w); });
    // Surge intentionally pulses continuously; use a real touch at its center.
    const surge = page.getByRole('button', { name: 'Surge (Space)', exact: true });
    assert.equal(await surge.isEnabled(), true);
    const surgeBounds = await surge.boundingBox();
    await page.touchscreen.tap(surgeBounds.x + surgeBounds.width / 2, surgeBounds.y + surgeBounds.height / 2);
    assert.ok(await state(() => window.game.world.surge.active > 0));
    await page.getByRole('button', { name: 'Pause game', exact: true }).tap(); await ready();
    const time = await state(() => window.game.world.time); await tick();
    assert.equal(await state(() => window.game.world.time), time);
    await page.getByRole('button', { name: 'Settings', exact: true }).tap(); await ready();
    await page.getByRole('button', { name: 'Back', exact: true }).tap(); await ready();
    await page.keyboard.press('Escape'); await ready();
    await tick(); assert.equal(await state(() => window.game.renderer.lastHudForAudit), true);
    assert.equal(await ui.locator('.levelup').count(), 0);
    assert.equal(await state(() => window.game.controlsEnabled), true);
    mark('Battle tab carousel/difficulty/pacts sheet, talents snapshot, slingshot, Recall, Surge and keyboard resume');

    // Draft: tap guard, pause during it, reroll, banish, consecutive levels and Skip.
    await state(() => { const w = window.game.world; w.pendingLevels = 2; w.level = 3; w.openLevelUp(); });
    assert.equal(await ui.locator('.draft[data-arming]').count(), 1, 'A fresh draft ignores taps for a moment');
    await state(() => document.querySelector('.offer')?.click());
    assert.equal(await state(() => window.game.world.state), 'levelup', 'An early tap cannot pick a card');
    await ready();
    assert.equal(await state(() => window.game.renderer.lastHudForAudit), false);
    assert.match(await ui.locator('.draft-queue').textContent(), /\+1/);
    await page.keyboard.press('Escape'); await ready(); assert.equal(await ui.locator('.pause-overlay').count(), 1);
    await page.getByRole('button', { name: /Resume/ }).tap(); await ready();
    assert.equal(await ui.locator('.offer-list').count(), 1);
    const rerolls = await state(() => window.game.world.rerolls);
    await page.getByRole('button', { name: /Reroll/ }).tap(); await ready();
    assert.equal(await state(() => window.game.world.rerolls), rerolls - 1);
    const id = await state(() => window.game.world.offers.find(o => o.kind === 'upgrade').id);
    await page.getByRole('button', { name: /Banish/ }).tap(); await ready();
    await state(() => document.querySelector('.offer').click()); await ready();
    assert.equal(await state(id => window.game.world.banished.has(id), id), true);
    await ui.locator('.offer').first().tap(); await ready();
    assert.equal(await state(() => window.game.world.pendingLevels), 1);
    assert.equal(await ui.locator('.levelup').count(), 1, 'Consecutive level-ups keep the next choice open');
    // Peek is a hold: pointerdown hides the draft, any release or cancel restores it.
    const peek = ui.locator('.peek-btn');
    await peek.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 31, isPrimary: true });
    assert.equal(await ui.locator('.draft.peeking').count(), 1);
    await peek.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 31, isPrimary: true });
    assert.equal(await ui.locator('.draft.peeking').count(), 0);
    await page.getByRole('button', { name: /^Skip/ }).tap(); await ready();
    assert.equal(await state(() => window.game.world.state), 'playing');
    assert.equal(await ui.locator('.levelup').count(), 0);
    mark('draft tap guard, queue counter, pause during upgrade, reroll, banish, peek, consecutive levels and Skip');

    // Victory: Endless, then Play Again repeats the arena; the Daily Seed claims rewards.
    await state(() => { const g = window.game, w = g.world; w.victory = true; w.state = 'over'; g.ui.victoryChoice(w); });
    await page.getByRole('button', { name: /Endless/ }).tap();
    assert.equal(await state(() => window.game.world.director.endless), true);
    assert.equal(await state(() => window.game.world.state), 'playing');
    await page.getByRole('button', { name: 'Pause game', exact: true }).tap(); await ready();
    await page.getByRole('button', { name: 'Abandon', exact: true }).tap(); await page.getByRole('button', { name: 'End run', exact: true }).tap(); await ready();
    assert.ok(await ui.locator('.reward-tile').count());
    await page.getByRole('button', { name: /Play again/ }).tap();
    await page.waitForFunction(() => window.game.world?.cfg.arena === 'foundry' && window.game.world.cfg.difficulty === 1);
    await page.getByRole('button', { name: 'Pause game', exact: true }).tap(); await ready();
    await page.getByRole('button', { name: 'Abandon', exact: true }).tap(); await page.getByRole('button', { name: 'End run', exact: true }).tap(); await ready();
    await page.getByRole('button', { name: 'Home', exact: true }).tap(); await ready();
    await ui.locator('.daily-btn').tap();
    await page.waitForFunction(() => window.game.world?.cfg.daily);
    await state(() => { const g = window.game; g.world.victory = true; g.world.state = 'over'; g.ui.victoryChoice(g.world); });
    await page.getByRole('button', { name: /Claim rewards/ }).tap(); await ready();
    assert.equal(await ui.locator('.result-title').textContent(), 'RUN COMPLETE');
    await page.getByRole('button', { name: 'Home', exact: true }).tap(); await ready();
    mark('victory, Endless, Play Again with the same setup, Daily Seed and claim rewards');

    await openSettings();
    const reset = page.getByRole('button', { name: 'Reset progress', exact: true });
    await reset.scrollIntoViewIfNeeded(); await reset.tap(); await ready();
    await page.screenshot({ path: `${out}/reset-dialog-${width}x${height}.png` });
    await page.keyboard.press('Escape'); await ready(); assert.equal(await page.getByRole('dialog').count(), 0);
    assert.ok(await state(() => window.game.profile.coins > 0));
    await reset.tap(); await ready();
    await page.getByRole('button', { name: 'Erase progress', exact: true }).tap(); await ready();
    assert.deepEqual(await state(() => [window.game.profile.coins, window.game.profile.tutorialDone, window.game.profile.settings.aimMode]), [0, false, 'slingshot']);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await state(() => window.game.profile.coins), 0);
    mark('game-styled reset dialog, cancel, reset and persistence');
    console.log(`${engine}: functional flows passed at ${width}x${height}`);
    // Keep context disposal with browser.close(): Firefox can race window restoration after reload.
    await page.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${out}/flows.json`, JSON.stringify({ engine, checks, errors }, null, 2));
  console.log(`${engine}: ${checks.length} functional flow groups passed`);
} finally { await browser.close(); }
