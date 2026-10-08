// Exercise live navigation, control feedback and overlay animations.
import { chromium, firefox, webkit } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const engine = process.env.ENGINE ?? 'chromium';
const browser = await ({ chromium, firefox, webkit }[engine]).launch({ headless: true });
const out = process.env.SHOTS ?? `smoke-shots/motion/${engine}`;
fs.mkdirSync(out, { recursive: true });
const errors = [], checks = [];
try {
  for (const [width, height] of [[390, 844], [568, 320]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(process.env.URL ?? 'http://localhost:4173', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const g = window.game, p = g.profile;
      p.tutorialDone = true; p.coins = 10000; p.cores = 30; p.research = 30;
      p.mastery.striker = 6000; p.cleared.proving = 0;
      p.unlockedCores = ['striker', 'pyro', 'tesla'];
      p.researchNodes = ['risk_pacts'];
      g.ui.home();
    });
    const ready = () => page.waitForFunction(() => !window.game.ui.navigation.busy && [...document.querySelectorAll('.deck')].every(deck => deck.dataset.pages));
    const settle = async () => {
      await ready();
      await page.waitForFunction(() => !document.getAnimations().some(animation => animation.id.startsWith('ui:') && animation.playState === 'running') && !document.querySelector('[data-motion-ghost]'));
      const clipped = await page.evaluate(() => {
        const content = document.querySelector('.deck-content');
        if (!content) return [];
        const bounds = content.getBoundingClientRect();
        return [...document.querySelectorAll('.deck-list > *')].filter(card => card.getBoundingClientRect().bottom > bounds.bottom + 2).map(card => card.textContent);
      });
      assert.deepEqual(clipped, [], 'Pagination must fit after animated entrances');
    };
    const motion = async (label, selector) => {
      await page.waitForFunction(selector => {
        const area = document.querySelector(selector);
        return area && document.getAnimations().some(animation => {
          const target = animation.effect?.target;
          if (!animation.id.startsWith('ui:') || animation.playState !== 'running' || !(target instanceof HTMLElement) || target.closest('[data-motion-ghost]')) return false;
          if (getComputedStyle(target).visibility === 'hidden' || !target.offsetWidth || !target.offsetHeight) return false;
          if (target !== area && !area.contains(target)) return false;
          const frames = animation.effect.getKeyframes();
          return new Set(frames.map(frame => frame.transform)).size > 1 || new Set(frames.map(frame => frame.boxShadow)).size > 1;
        });
      }, selector);
      checks.push(`${width}x${height}: ${label}`);
      await settle();
    };
    const backHome = async () => {
      await page.getByRole('button', { name: 'Back', exact: true }).tap();
      await motion('Back to Home', '.home');
    };
    const category = async name => {
      await page.locator('.deck-tabs').getByRole('tab', { name, exact: true }).tap();
      await motion(`category ${name}`, '.deck-content');
    };
    const reveal = async locator => {
      for (let i = 0; i < 40; i++) {
        const visible = locator.filter({ visible: true });
        if (await visible.count()) return visible.first();
        assert.equal(await page.locator('.deck-next').isDisabled(), false, `Unreachable control: ${locator}`);
        await page.locator('.deck-next').tap(); await motion('next card page', '.deck-content');
      }
      throw new Error(`Unreachable control: ${locator}`);
    };
    await settle();
    for (const name of ['Loadout', 'Workshop', 'Research', 'Codex', 'Goals', 'Settings', 'Talents']) {
      await page.locator('.home-nav').getByRole('button', { name: new RegExp(name) }).tap();
      await motion(`Home to ${name}`, `.screen[data-view="${name.toLowerCase()}"]`);
      if (name === 'Loadout') {
        await page.locator('.deck-next').tap(); await motion('next page', '.deck-content');
        await page.locator('.deck-prev').tap(); await motion('previous page', '.deck-content');
        await (await reveal(page.locator('[data-motion-key="core:pyro"]'))).tap();
        await motion('equip Pyro Core', '[data-motion-key="core:pyro"]');
        assert.equal(await page.evaluate(() => window.game.profile.loadout.core), 'pyro');
        await category('Shell');
      } else if (name === 'Workshop') {
        await (await reveal(page.locator('[data-motion-key="workshop:hull"]'))).getByRole('button').tap();
        await motion('Workshop purchase', '[data-motion-key="workshop:hull"]');
      } else if (name === 'Research') {
        await (await reveal(page.locator('[data-motion-key="research:reroll_1"]'))).getByRole('button').tap();
        await motion('Research unlock', '[data-motion-key="research:reroll_1"]');
      } else if (name === 'Codex') {
        for (const tab of ['Upgrades', 'Synergies', 'Balls']) {
          await page.locator('.codex-tabs').getByRole('tab', { name: new RegExp(`^${tab}`) }).tap();
          await motion(`Codex ${tab}`, '.deck-content');
        }
      } else if (name === 'Goals') {
        await category('Challenges'); await category('Next goals');
      } else if (name === 'Settings') {
        await category('Combat feedback');
        await page.getByRole('switch', { name: 'Screen shake', exact: true }).tap();
        await motion('Settings switch', '[data-setting="shake"]');
      } else if (name === 'Talents') {
        await page.locator('#talent-bankcraft').tap(); await motion('open talent sheet', '.talent-detail');
        await page.getByRole('button', { name: 'Close talent details', exact: true }).tap();
        await motion('close talent sheet', '#talent-bankcraft');
        await page.locator('#talent-tab-conduit').tap(); await motion('talent discipline', '.talent-tree.active');
      }
      await backHome();
    }

    await page.locator('.launch-button').tap(); await motion('run setup', '.screen[data-view="setup"]');
    await category('Difficulty');
    await page.locator('[data-motion-key="difficulty:1"]').tap(); await motion('difficulty selection', '[data-motion-key="difficulty:1"]');
    await page.getByRole('button', { name: /LAUNCH/ }).tap(); await motion('deploy core', '.game-hud');
    await page.getByRole('button', { name: 'Pause game', exact: true }).tap(); await motion('pause', '.pause-overlay');
    await page.getByRole('button', { name: 'Settings', exact: true }).tap(); await motion('paused Settings', '.settings-screen');
    await page.getByRole('button', { name: 'Back', exact: true }).tap(); await motion('return to Pause', '.pause-overlay');
    await page.getByRole('button', { name: /Resume/ }).tap(); await motion('resume', '.game-hud');
    assert.equal(await page.evaluate(() => window.game.controlsEnabled), true);
    await page.evaluate(() => { const w = window.game.world; w.pendingLevels = 1; w.level = 2; w.openLevelUp(); });
    await page.waitForSelector('.deck-list .offer');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.deck-list .offer')].every(offer => offer.getBoundingClientRect().width >= offer.offsetWidth * .98)), true, 'Upgrade entrances preserve their touch-target size');
    await motion('upgrade offers', '.levelup[data-view="upgrade"]');
    await page.getByRole('button', { name: /Reroll/ }).tap(); await motion('reroll offers', '.deck-content');
    await page.getByRole('button', { name: 'Skip', exact: true }).tap(); await settle();
    await page.evaluate(() => { const g = window.game; g.world.victory = true; g.world.state = 'over'; g.ui.victoryChoice(g.world); });
    await motion('victory', '.levelup[data-view="victory"]');
    await page.getByRole('button', { name: /Claim rewards/ }).tap(); await motion('results', '.screen[data-view="results"]');
    await page.getByRole('button', { name: 'Home', exact: true }).tap(); await motion('results to Home', '.home');

    await page.evaluate(() => { const ui = window.game.ui; ui.codex(); ui.goals(); ui.settings(); });
    const ghosts = await page.evaluate(() => [...document.querySelectorAll('[data-motion-ghost]')].map(ghost => ({ inert: ghost.inert, hidden: ghost.getAttribute('aria-hidden'), ids: ghost.querySelectorAll('[id]').length, pointerEvents: getComputedStyle(ghost).pointerEvents })));
    assert.ok(ghosts.length <= 3);
    for (const ghost of ghosts) assert.deepEqual(ghost, { inert: true, hidden: 'true', ids: 0, pointerEvents: 'none' });
    await settle();
    assert.equal(await page.locator('.settings-screen').count(), 1);
    checks.push(`${width}x${height}: rapid navigation settles without interactive ghosts`);

    await page.evaluate(() => window.game.ui.loadout());
    await motion('navigation after rapid changes', '.screen[data-view="loadout"]');
    await page.screenshot({ path: `${out}/motion-settled-${width}x${height}.png` });
    await page.close();
    console.log(`${engine}: navigation motion passed at ${width}x${height}`);
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${out}/motion.json`, JSON.stringify({ engine, checks, errors }, null, 2));
} finally { await browser.close(); }
