// Persian (RTL) end-to-end check: device-language detection, the in-game language picker, every
// menu, the run HUD/overlays and results in Persian, right-to-left paging, and switching back.
// Fails on any untranslated Latin word, console error, or broken RTL mechanic.
import { chromium, firefox, webkit } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { en } from '../src/i18n/en.ts';
import { fa } from '../src/i18n/fa.ts';
import { faContent } from '../src/i18n/fa-content.ts';

const engine = process.env.ENGINE ?? 'chromium';
const browser = await ({ chromium, firefox, webkit }[engine]).launch({ headless: true });
const out = process.env.SHOTS ?? `smoke-shots/i18n/${engine}`;
fs.mkdirSync(out, { recursive: true });
const url = process.env.URL ?? 'http://localhost:4173';
const errors = [], checks = [];
const PERSIAN = /[؀-ۿ]/;
/** Latin words allowed to remain in a Persian UI: the logo and the system tag. */
const LATIN_OK = new Set(['BOUNCE', 'DEFENSE', 'BD', 'English']);
const rx = (text) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const word = (phrase) => rx(String(phrase).replace(/^[^\p{L}\p{N}]+/u, '').split(/\s+·|\s+\(/)[0]);

try {
  // ---- First launch on a Persian device: no save yet, so the device language wins.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'fa-IR' });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url, { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'fa');
    assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
    assert.equal(await page.evaluate(() => window.game.profile.settings.language), 'fa');
    assert.ok(await page.evaluate(async () => (await document.fonts.load('16px Vazirmatn')).length > 0), 'Vazirmatn loaded');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.launch-button strong')).fontFamily.includes('Vazirmatn')), true);
    assert.match(await page.locator('.launch-button strong').textContent(), PERSIAN);
    await page.screenshot({ path: `${out}/first-run-home.png` });
    // The run itself: tutorial hints and the canvas HUD speak Persian too.
    await page.locator('.launch-button').tap();
    await page.waitForFunction(() => window.game.world?.cfg.tutorial);
    await page.waitForSelector('.hint');
    assert.match(await page.locator('.hint').textContent(), PERSIAN);
    const drawn = await page.evaluate(() => {
      const ctx = document.querySelector('#game').getContext('2d'), texts = [], fillText = ctx.fillText;
      ctx.fillText = function (text, ...rest) { texts.push(String(text)); return fillText.call(this, text, ...rest); };
      try { window.game.renderer.draw(window.game.world); } finally { ctx.fillText = fillText; }
      return { texts, direction: ctx.direction };
    });
    assert.equal(drawn.direction, 'rtl');
    assert.ok(drawn.texts.some(text => PERSIAN.test(text)), `canvas HUD in Persian: ${drawn.texts.join(' | ')}`);
    assert.deepEqual(drawn.texts.filter(text => /[A-Za-z]{3,}/.test(text) && !/^BD \//.test(text)), [], 'untranslated canvas text');
    await page.screenshot({ path: `${out}/first-run-tutorial.png` });
    await context.close();
    checks.push('fa-IR device: Persian detected on first launch, Vazirmatn active, tutorial hint and canvas HUD in Persian');
  }

  for (const [width, height] of [[390, 844], [568, 320]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, locale: 'en-US' });
    const page = await context.newPage();
    const ui = page.locator('#ui');
    page.setDefaultTimeout(8000);
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url, { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    const tick = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const ready = async () => {
      await page.waitForFunction(() => !window.game.ui.navigation.busy && [...document.querySelectorAll('#ui .deck')].every(el => el.dataset.pages)
        && !document.getAnimations().some(animation => animation.id.startsWith('ui:') && animation.playState === 'running')
        && !document.querySelector('[data-motion-ghost]'));
      await tick();
    };
    const mark = text => checks.push(`${width}x${height}: ${text}`);
    const shot = name => page.screenshot({ path: `${out}/${name}-${width}x${height}.png` });
    /** Every text node, aria-label and title inside #ui must be free of Latin words (logo excepted). */
    const scan = async (name) => {
      const found = await page.evaluate(() => {
        const root = document.getElementById('ui'), out = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent.trim();
          if (text && !node.parentElement.closest('[lang="en"]')) out.push(text);
        }
        for (const el of root.querySelectorAll('[aria-label], [title]')) for (const attr of ['aria-label', 'title']) {
          const value = el.getAttribute(attr); if (value) out.push(value);
        }
        return out;
      });
      const bad = found.filter(text => (text.match(/[A-Za-z]{3,}/g) ?? []).some(w => !LATIN_OK.has(w)));
      assert.deepEqual(bad, [], `${name}: untranslated text`);
      assert.ok(found.some(text => PERSIAN.test(text)), `${name}: no Persian text at all`);
    };
    const reveal = async locator => {
      await ready();
      while (!await ui.locator('.deck-prev').isDisabled()) { await ui.locator('.deck-prev').tap(); await ready(); }
      for (let i = 0; i < 100; i++) {
        const visible = locator.filter({ visible: true });
        if (await visible.count()) return visible.first();
        if (await ui.locator('.deck-next').isDisabled()) break;
        await ui.locator('.deck-next').tap(); await ready();
      }
      throw new Error(`Control not reachable in its category: ${locator}`);
    };
    const back = async () => { await ready(); await page.getByRole('button', { name: fa['common.back'], exact: true }).tap(); await ready(); };
    const homeNav = async (key, dict = fa) => { await ready(); await ui.locator('.home-nav').getByRole('button', { name: word(dict[key]) }).tap(); await ready(); };
    /** Walk every category of the current deck (all cards of a section are in the DOM at once). */
    const walkDeck = async (name) => {
      await ready();
      const tabs = ui.locator('.deck-tabs > button'), count = await tabs.count();
      await scan(name);
      for (let i = 1; i < count; i++) { await tabs.nth(i).tap(); await ready(); await scan(`${name}/${i}`); }
      if (count) { await tabs.nth(0).tap(); await ready(); }
    };

    await page.evaluate(() => {
      const g = window.game, p = g.profile;
      p.tutorialDone = true; p.coins = 10000; p.cores = 30; p.research = 30; p.mastery.striker = 6000;
      p.cleared.proving = 0; p.bossKills.fortress = 1; p.researchNodes = ['risk_pacts', 'evolution_codex'];
      p.discoveries = { enemies: ['grunt', 'runner'], bosses: ['fortress'], synergies: ['shatter'], evolutions: ['glacier'],
        reactions: ['overload'], upgrades: ['heavy_impact', 'executioner'], arenas: ['proving'], events: ['jackpot'] };
      p.presets = [{ ...p.loadout, name: 'Striker Standard' }];
      g.save(); g.ui.home();
    });

    // ---- Switch to Persian through the real Settings UI, then verify it persisted.
    await homeNav('home.nav.settings', en);
    assert.equal(await page.locator('.language-option[data-language="fa"]').getAttribute('aria-pressed'), 'false');
    await page.locator('.language-option[data-language="fa"]').tap(); await ready();
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'fa');
    assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('bounce-defense-save')).settings.language), 'fa');
    assert.equal(await page.locator('.language-option[data-language="fa"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await ui.locator('h2').textContent(), fa['settings.title']);
    await walkDeck('settings');
    await shot('settings');
    // The on/off switch text follows the language, including after a live toggle.
    await ui.locator('.deck-tabs > button').nth(2).tap(); await ready();
    const shake = await reveal(page.getByRole('switch', { name: fa['settings.shake'], exact: true }));
    const before = await shake.locator('.switch-state').textContent();
    await shake.tap(); assert.notEqual(await shake.locator('.switch-state').textContent(), before);
    assert.match(await shake.locator('.switch-state').textContent(), PERSIAN);
    await shake.tap();
    await back();
    mark('language picker switches to Persian, persists, settings fully translated');

    // ---- Every menu.
    await scan('home'); await shot('home');
    assert.match(await ui.locator('.home-nav button').first().textContent(), PERSIAN);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.home-nav-tile')).fontFamily.includes('Vazirmatn')), true);
    await ui.locator('.launch-button').tap(); await walkDeck('setup'); await shot('setup');
    // Difficulty rules and pacts are localized data, not just UI strings.
    await ui.locator('.deck-tabs > button').nth(2).tap(); await ready();
    await page.getByRole('button', { name: faContent.difficulty.veteran.name, exact: true }).tap(); await ready();
    assert.equal(await page.evaluate(() => window.game.ui.setup.difficulty), 1);
    await back();
    await homeNav('home.nav.loadout'); await walkDeck('loadout'); await shot('loadout'); await back();
    await homeNav('home.nav.workshop'); await walkDeck('workshop'); await shot('workshop'); await back();
    await homeNav('home.nav.research'); await walkDeck('research'); await shot('research'); await back();
    await homeNav('home.nav.goals'); await walkDeck('goals'); await shot('goals'); await back();
    await homeNav('home.nav.codex');
    for (let i = 0; i < 8; i++) {
      await ui.locator('.codex-tabs button').nth(i).tap(); await ready();
      await scan(`codex/${i}`);
      if (i === 1) await shot('codex-upgrades');
      if (!await ui.locator('.deck-next').isDisabled()) {
        // RTL paging: "previous" sits on the right, and a rightward swipe advances.
        const prev = await ui.locator('.deck-prev').boundingBox(), next = await ui.locator('.deck-next').boundingBox();
        assert.ok(prev.x > next.x, 'deck pager mirrored in RTL');
        assert.equal(await ui.locator('.deck-next').textContent(), '‹');
        await ui.locator('.deck-next').tap(); await ready(); assert.equal(await ui.locator('.deck').getAttribute('data-page'), '1');
        await ui.locator('.deck-prev').tap(); await ready(); assert.equal(await ui.locator('.deck').getAttribute('data-page'), '0');
        const content = ui.locator('.deck-content');
        await content.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 21, clientX: 70, clientY: 200 });
        await content.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 21, clientX: 220, clientY: 205 });
        await ready();
        assert.equal(await ui.locator('.deck').getAttribute('data-page'), '1', 'swipe right advances in RTL');
        await ui.locator('.deck-content').focus();
        await page.keyboard.press('ArrowRight'); await ready();
        assert.equal(await ui.locator('.deck').getAttribute('data-page'), '0', 'ArrowRight returns to the previous page in RTL');
      }
    }
    await back();
    await homeNav('home.nav.talents');
    await scan('talents');
    for (let tree = 0; tree < 3; tree++) {
      await ui.locator('.talent-tabs button').nth(tree).tap(); await ready();
      await ui.locator('.talent-tree.active .talent-node').first().tap(); await ready();
      await scan(`talents/${tree}/detail`);
      if (tree === 0) await shot('talents');
      await page.getByRole('button', { name: fa['talents.closeDetails'], exact: true }).tap(); await ready();
    }
    await ui.locator('.talent-tabs button').nth(0).tap(); await ready();
    await ui.locator('#talent-bankcraft').tap(); await ui.locator('#talent-learn').tap(); await ready();
    await back(); await back();
    await scan('talents/discard-dialog');
    await page.getByRole('button', { name: fa['talents.discard'], exact: true }).tap(); await ready();
    assert.equal(await ui.locator('.home').count(), 1);
    mark('every menu, codex category, talent tree and dialog is Persian; RTL pager, swipe and keys mirrored');

    // ---- A run: HUD, pause, settings from pause, level-up, abandon, results.
    await ui.locator('.launch-button').tap(); await ready();
    await page.getByRole('button', { name: word(fa['setup.launch']) }).tap();
    await page.waitForFunction(() => window.game.world && window.game.controlsEnabled);
    await scan('hud');
    const bounds = await page.locator('#game').boundingBox();
    await page.mouse.move(bounds.x + bounds.width * .55, bounds.y + bounds.height * .55);
    await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .7, bounds.y + bounds.height * .35); await page.mouse.up();
    await page.waitForFunction(() => window.game.world.balls.some(b => b.state === 'flight'));
    await page.getByRole('button', { name: fa['hud.pause'], exact: true }).tap(); await ready();
    await walkDeck('pause'); await shot('pause');
    await page.getByRole('button', { name: fa['pause.settings'], exact: true }).tap(); await ready();
    await scan('pause/settings'); await back();
    assert.equal(await ui.locator('.pause-overlay').count(), 1);
    await page.getByRole('button', { name: word(fa['pause.resume']) }).tap(); await ready();
    await page.evaluate(() => { window.game.world.pendingLevels++; });
    await ui.locator('.levelup').waitFor(); await ready();
    await scan('levelup'); await shot('levelup');
    assert.match(await ui.locator('.levelup .deck-list .otags').first().textContent(), PERSIAN);
    await ui.locator('.levelup .deck-list .offer').first().tap(); await ready();
    await page.getByRole('button', { name: fa['hud.pause'], exact: true }).tap(); await ready();
    await page.getByRole('button', { name: fa['pause.abandon'], exact: true }).tap(); await ready();
    await scan('abandon-dialog');
    await page.getByRole('button', { name: fa['pause.endRun'], exact: true }).tap(); await ready();
    await walkDeck('results'); await shot('results');
    assert.match(await ui.locator('.buildname').textContent(), PERSIAN);
    await page.getByRole('button', { name: fa['results.home'], exact: true }).tap(); await ready();
    mark('run HUD, pause, in-run settings, level-up offers, abandon dialog and results are Persian');

    // ---- Reload keeps the choice; switching back restores English and LTR.
    await page.reload({ waitUntil: 'networkidle' }); await ready();
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'fa');
    await homeNav('home.nav.settings');
    await page.locator('.language-option[data-language="en"]').tap(); await ready();
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    assert.equal(await page.evaluate(() => document.documentElement.dir), 'ltr');
    assert.equal(await ui.locator('h2').textContent(), en['settings.title']);
    await page.getByRole('button', { name: en['common.back'], exact: true }).tap(); await ready();
    assert.equal(await ui.locator('.home-nav button').first().textContent(), en['home.nav.daily'] + en['home.nav.dailyDesc']);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.home-nav-tile')).fontFamily.includes('Vazirmatn')), false);
    mark('Persian survives a reload; switching back to English restores LTR layout and text');
    await context.close();
  }
} finally { await browser.close(); }

assert.deepEqual(errors, []);
console.log(`${engine}: i18n checks passed\n- ${checks.join('\n- ')}`);
