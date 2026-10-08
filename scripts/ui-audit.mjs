// Playwright visual/layout audit. Runs against dev or production preview.
// AUDIT_ONLY=1 records defects; the default fails on layout regressions.
import { chromium, firefox, webkit } from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { CORES, PARTS, TRAILS } from '../src/data/balls.ts';
import { ACHIEVEMENTS, CHALLENGES, RESEARCH } from '../src/data/meta.ts';
import { UPGRADES } from '../src/data/upgrades.ts';
import { SYNERGIES, EVOLUTIONS, REACTIONS } from '../src/data/synergies.ts';
import { BOSSES, CODEX_ENEMIES } from '../src/data/enemies.ts';
import { ARENAS } from '../src/data/arenas.ts';

const engine = process.env.ENGINE ?? 'chromium';
const browserType = { chromium, firefox, webkit }[engine];
assert.ok(browserType, `Unknown Playwright engine: ${engine}`);
const out = process.env.SHOTS ?? `smoke-shots/ui-audit/${engine}`;
fs.mkdirSync(out, { recursive: true });
const executablePath = engine === 'chromium' ? process.env.CHROME_PATH : undefined;
const browser = await browserType.launch({ executablePath, headless: true });
const errors = [], findings = [], captures = [];
const sizes = process.env.SIZES ? process.env.SIZES.split(';').map(size => size.split('x').map(Number)) : [[320, 568], [375, 667], [390, 844], [820, 1180], [1440, 900], [844, 390], [568, 320]];
try {
  const page = await browser.newPage({ deviceScaleFactor: 1, hasTouch: true });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(process.env.URL ?? 'http://localhost:4173', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const renderer = window.game.renderer, draw = renderer.draw.bind(renderer);
    renderer.draw = (world, hud = true) => { renderer.lastHudForAudit = hud; draw(world, hud); };
    const p = window.game.profile;
    p.tutorialDone = true; p.coins = 2171; p.cores = 5; p.research = 11;
    p.mastery.striker = 6000;
    p.presets = Array.from({ length: 3 }, () => ({ ...p.loadout, name: 'Striker Explosive' }));
    p.discoveries.upgrades = ['chain_lightning', 'heavy_impact', 'extra_ball', 'ignite'];
    p.discoveries.enemies = ['grunt', 'runner', 'shielder', 'brute'];
    p.discoveries.bosses = ['fortress', 'magnetar', 'hydra'];
  });
  const fullProfile = {
    unlockedCores: CORES.map(x => x.id), unlockedParts: PARTS.map(x => x.id), cosmetics: TRAILS.map(x => x.id),
    unlockedUpgrades: UPGRADES.map(x => x.id), researchNodes: RESEARCH.map(x => x.id),
    achievements: ACHIEVEMENTS.map(x => x.id), challenges: CHALLENGES.map(x => x.id),
    talents: { bankcraft: 3, flow: 3, precision: 2, banked_power: 1, voltage: 2, hull: 2, plating: 2 },
    cleared: Object.fromEntries(ARENAS.map(x => [x.id, 2])),
    discoveries: { upgrades: UPGRADES.map(x => x.id), synergies: SYNERGIES.map(x => x.id), evolutions: EVOLUTIONS.map(x => x.id),
      reactions: REACTIONS.map(x => x.id), enemies: CODEX_ENEMIES.map(x => x.id), bosses: BOSSES.map(x => x.id), arenas: ARENAS.map(x => x.id), events: [] },
  };
  const partialProfile = await page.evaluate(() => structuredClone(window.game.profile));
  partialProfile.talents = fullProfile.talents;

  async function capture(name, width, height, bottom = false) {
    await page.waitForFunction(() => [...document.querySelectorAll('.deck')].every(el => el.dataset.pages));
    await page.waitForFunction(() => !document.getAnimations().some(animation => animation.id.startsWith('ui:') && animation.playState === 'running') && !document.querySelector('[data-motion-ghost]'));
    if (bottom) await page.evaluate(() => {
      const scroll = document.querySelector('.screen .scroll, .levelup .scroll');
      if (scroll) scroll.scrollTop = scroll.scrollHeight;
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const defects = await page.evaluate(combat => {
      const issues = [];
      const describe = el => `${el.tagName.toLowerCase()}.${el.className} ${el.textContent.trim().slice(0, 65)}`;
      const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
      for (const el of document.querySelectorAll('.screen, .levelup, .screen button, .levelup button, .topbar, .home-topline, .home-content, .deck, .deck-content, .deck-list, .deck-tabs, .codex-tabs, .deck-pager, .card, .buildcard, .offer, .row:not(.wrap), .grid2, .grid3, .statgrid, .settings-section, .settings-audio, .setting-volume, .setting-volume-head, .setting-switch, .aim-modes, .aim-option, .talent-footer, .compact-main, .compact-details, .compact-main > div, .compact-details > div')) {
        if (!visible(el)) continue;
        // Rank badges deliberately extend a few pixels beyond their talent node, inside the slot.
        if (el.matches('.talent-node')) continue;
        if (el.scrollWidth > el.clientWidth + 2) issues.push({ kind: 'horizontal overflow', element: describe(el), excess: el.scrollWidth - el.clientWidth });
      }
      for (const el of document.querySelectorAll('.scroll, .deck-tall')) {
        if (visible(el) && el.scrollHeight > el.clientHeight + 2) issues.push({ kind: 'scrolling menu content', element: describe(el), excess: el.scrollHeight - el.clientHeight });
      }
      for (const el of document.querySelectorAll('.screen button, .levelup button')) {
        const r = el.getBoundingClientRect();
        if (visible(el) && (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth)) issues.push({ kind: 'action outside viewport', element: describe(el) });
        if (visible(el) && (r.width < 43.5 || r.height < 43.5)) issues.push({ kind: 'undersized menu touch target', element: describe(el) });
      }
      const content = document.querySelector('.deck-content');
      if (content) for (const el of document.querySelectorAll('.deck-list > *')) {
        const r = el.getBoundingClientRect(), bounds = content.getBoundingClientRect();
        if (r.bottom > bounds.bottom + 2) issues.push({ kind: 'card clipped by page', element: describe(el), excess: r.bottom - bounds.bottom });
      }
      const root = document.querySelector('.levelup') ?? document.querySelector('.screen');
      if (root) {
        if (window.game.world && window.game.renderer.lastHudForAudit)
          issues.push({ kind: 'canvas HUD showing through menu', element: 'combat telemetry' });
        const r = root.getBoundingClientRect();
        if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) issues.push({ kind: 'screen outside viewport', element: describe(root) });
        // A title shifted above a scroll container's origin cannot be reached by scrolling.
        const first = root.firstElementChild;
        if (first && first.getBoundingClientRect().top < r.top - 1 && root.scrollTop === 0) issues.push({ kind: 'unreachable overlay heading', element: describe(first) });
        for (const control of document.querySelectorAll('.game-hud button, .compact-main, .compact-details'))
          if (visible(control)) issues.push({ kind: 'combat HUD showing through menu', element: describe(control) });
      }
      for (const wallet of document.querySelectorAll('.topbar > .chips, .home-topline > .chips')) {
        const rows = new Set([...wallet.children].map(el => Math.round(el.getBoundingClientRect().top)));
        if (rows.size > 1) issues.push({ kind: 'split currency strip', element: describe(wallet) });
      }
      for (const button of document.querySelectorAll('.preset-actions button')) {
        const range = document.createRange(); range.selectNodeContents(button);
        if (range.getClientRects().length > 1) issues.push({ kind: 'wrapped preset button label', element: describe(button) });
      }
      for (const control of document.querySelectorAll('.setting-switch, .setting-range, .aim-option')) {
        const r = control.getBoundingClientRect();
        if (r.width < 44 || r.height < 44) issues.push({ kind: 'undersized settings touch target', element: describe(control) });
      }
      const aimLabels = [...document.querySelectorAll('.aim-option .setting-name')];
      if (aimLabels.length === 2 && Math.abs(aimLabels[0].getBoundingClientRect().top - aimLabels[1].getBoundingClientRect().top) > 1)
        issues.push({ kind: 'misaligned aim option labels', element: 'Aim mode' });
      for (const grid of document.querySelectorAll('.statgrid')) {
        for (const row of grid.children) {
          const [label, value] = row.children;
          if (label && value && label.getBoundingClientRect().right > value.getBoundingClientRect().left + 1)
            issues.push({ kind: 'colliding stat label/value', element: describe(row) });
        }
      }
      const launch = document.querySelector('.launch-button');
      const scroll = document.querySelector('.home-content');
      if (launch && scroll) {
        const b = launch.getBoundingClientRect(), s = scroll.getBoundingClientRect();
        if (b.top < s.top || b.bottom > s.bottom) issues.push({ kind: 'launch below initial viewport', element: describe(launch) });
      }
      if (combat) {
        // Canvas HUD text is invisible to DOM overflow checks. Measure one actual draw in CSS pixels.
        const canvas = document.querySelector('#game'), ctx = canvas.getContext('2d');
        const bounds = canvas.getBoundingClientRect(), scale = bounds.width / canvas.width;
        const fillText = ctx.fillText, texts = [];
        ctx.fillText = function(text, x, y, maxWidth) {
          const m = this.measureText(text), squeeze = maxWidth ? Math.min(1, maxWidth / m.width) : 1;
          const matrix = this.getTransform();
          const points = [
            [x - m.actualBoundingBoxLeft * squeeze, y - m.actualBoundingBoxAscent],
            [x + m.actualBoundingBoxRight * squeeze, y + m.actualBoundingBoxDescent],
          ].map(([px, py]) => new DOMPoint(px, py).matrixTransform(matrix));
          const r = {
            left: bounds.left + Math.min(...points.map(p => p.x)) * scale,
            right: bounds.left + Math.max(...points.map(p => p.x)) * scale,
            top: bounds.top + Math.min(...points.map(p => p.y)) * scale,
            bottom: bounds.top + Math.max(...points.map(p => p.y)) * scale,
          };
          // Arena labels and telemetry are stationary; transient battlefield effects may overlap.
          if (r.bottom < bounds.top + bounds.height * .1 || r.top > bounds.top + bounds.height * .82)
            texts.push({ text, ...r });
          return fillText.call(this, text, x, y, ...(maxWidth ? [maxWidth] : []));
        };
        try { window.game.renderer.draw(window.game.world); } finally { ctx.fillText = fillText; }
        const overlaps = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
        const controls = [...document.querySelectorAll('.hudbtn, .recall, .surge')];
        for (const text of texts) {
          if (text.left < bounds.left - 1 || text.right > bounds.right + 1)
            issues.push({ kind: 'canvas text outside arena', element: text.text });
          for (const control of controls) if (overlaps(text, control.getBoundingClientRect()))
            issues.push({ kind: 'canvas text covered by control', element: `${text.text} / ${control.getAttribute('aria-label')}` });
        }
        for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++)
          if (overlaps(texts[i], texts[j])) issues.push({ kind: 'colliding canvas telemetry', element: `${texts[i].text} / ${texts[j].text}` });
        for (const control of controls) {
          const r = control.getBoundingClientRect();
          if (r.width < 43.5 || r.height < 43.5) issues.push({ kind: 'undersized combat touch target', element: describe(control) });
        }
        if (document.querySelector('#ui[data-compact-hud]')) {
          for (const panel of document.querySelectorAll('.compact-main, .compact-details')) {
            const r = panel.getBoundingClientRect();
            if (overlaps(r, bounds)) issues.push({ kind: 'side telemetry covers battlefield', element: describe(panel) });
            for (const control of controls) if (overlaps(r, control.getBoundingClientRect()))
              issues.push({ kind: 'side telemetry covered by control', element: describe(panel) });
          }
        }
      }
      return issues;
    }, name.startsWith('combat-'));
    findings.push(...defects.map(d => ({ size: `${width}x${height}`, screen: name, ...d })));
    const file = `${name}-${width}x${height}${bottom ? '-bottom' : ''}.png`;
    await page.screenshot({ path: `${out}/${file}` });
    captures.push({ name, size: `${width}x${height}`, file });
  }

  async function crawlDeck(name, width, height) {
    const deck = page.locator('.deck');
    if (!await deck.count()) return;
    await page.waitForFunction(() => document.querySelector('.deck')?.dataset.pages);
    const tabs = page.locator('.deck-tabs > button'), count = await tabs.count();
    for (let section = 0; section < Math.max(1, count); section++) {
      if (count) await tabs.nth(section).click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      while (!await page.locator('.deck-prev').isDisabled()) await page.locator('.deck-prev').click();
      const label = count ? (await tabs.nth(section).textContent()).replace(/\W+/g, '-') : 'items';
      let index = 0;
      do {
        await capture(`${name}-${label}-${++index}`, width, height);
        if (await page.locator('.deck-next').isDisabled()) break;
        await page.locator('.deck-next').click();
      } while (index < 100);
    }
  }

  for (const [width, height] of sizes) {
    console.log(`${engine}: reviewing ${width}x${height}`);
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() => {
      const scale = Math.min(innerWidth / 540, innerHeight / 960);
      return document.getElementById('ui').clientWidth === Math.floor(540 * scale);
    });
    if (!process.env.OVERLAYS_ONLY) {
      await page.evaluate(() => { const p = window.game.profile; p.coins = 2171; p.cores = 5; p.research = 11; });
      await page.evaluate(() => { window.game.ui.closeOverlay(); window.game.toMenu(); window.game.profile.tutorialDone = false; window.game.ui.home(); });
      await capture('first-home', width, height);
      await page.evaluate(profile => Object.assign(window.game.profile, profile), partialProfile);
      for (const screen of ['home', 'loadout', 'research', 'runSetup', 'goals']) {
        await page.evaluate(screen => { const g = window.game; g.ui.closeOverlay(); g.toMenu(); g.ui[screen](); }, screen);
        await capture(`locked-${screen}`, width, height);
        if (screen === 'loadout' || screen === 'runSetup') await crawlDeck(`locked-${screen}`, width, height);
      }
      await page.evaluate(profile => Object.assign(window.game.profile, profile), fullProfile);
      for (const screen of ['home', 'loadout', 'workshop', 'research', 'runSetup', 'goals', 'settings', 'talents']) {
        await page.evaluate(screen => { const g = window.game; g.ui.closeOverlay(); g.toMenu(); g.ui[screen](); }, screen);
        await capture(screen, width, height);
        await crawlDeck(screen, width, height);
        if (screen === 'talents') {
          for (let tree = 0; tree < 3; tree++) {
            await page.locator('.talent-tabs button').nth(tree).click();
            await capture(`talent-tree-${tree + 1}`, width, height);
            const nodes = page.locator('.talent-tree.active .talent-node');
            for (let node = 0; node < await nodes.count(); node++) {
              await nodes.nth(node).click();
              await capture(`talent-details-${tree + 1}-${node + 1}`, width, height);
              await page.getByRole('button', { name: 'Close talent details', exact: true }).click();
            }
          }
        }
      }
      for (const tab of ['balls', 'upgrades', 'synergies', 'evolutions', 'reactions', 'enemies', 'bosses', 'arenas']) {
        await page.evaluate(tab => { window.game.ui.codexTab = tab; window.game.ui.codex(); }, tab);
        await capture(`codex-${tab}`, width, height);
        await crawlDeck(`codex-${tab}`, width, height);
      }
      await page.evaluate(() => {
        const p = window.game.profile; p.coins = p.cores = p.research = 999999; window.game.ui.home();
      });
      await capture('wallet-large-home', width, height);
      await page.evaluate(() => window.game.ui.loadout());
      await capture('wallet-large-loadout', width, height);
      await page.evaluate(() => { const p = window.game.profile; p.coins = 2171; p.cores = 5; p.research = 11; });
    }
    await page.evaluate(profile => Object.assign(window.game.profile, profile), partialProfile);
    await page.evaluate(() => {
      const g = window.game; g.startRun({ arena: 'proving', difficulty: 0, pacts: [], seed: 51 }); g.paused = true;
      const w = g.world; w.flags.add('codex'); w.flags.add('fourth_card'); w.flags.add('banish'); w.banishes = 2;
      for (const id of ['extra_ball', 'ignite', 'chain_lightning', 'volatile', 'frostbite']) w.onBuildChanged(w.build.addUpgrade(id));
      w.state = 'levelup'; w.level = 12; w.pendingLevels = 1;
      w.offers = [{ kind: 'upgrade', id: 'chain_lightning', level: 3 }, { kind: 'upgrade', id: 'volatile', level: 3 },
        { kind: 'upgrade', id: 'frostbite', level: 3 }, { kind: 'evolution', id: 'inferno' }];
      g.ui.levelUp(w);
    });
    await capture('levelup', width, height);
    await crawlDeck('levelup', width, height);
    await page.evaluate(() => { const el = document.querySelector('.levelup'); el.scrollTop = el.scrollHeight; });
    await capture('levelup-end', width, height);
    await page.evaluate(() => {
      const g = window.game, w = g.world;
      w.offers = [{ kind: 'heal' }, { kind: 'coins' }, { kind: 'evolution', id: 'inferno' }, { kind: 'evolution', id: 'tesla_storm' }];
      g.ui.levelUp(w);
    });
    await crawlDeck('levelup-bonus', width, height);
    await page.evaluate(() => { const g = window.game; g.world.state = 'playing'; g.ui.pauseMenu(g.world); });
    await capture('pause', width, height);
    await crawlDeck('pause', width, height);
    await capture('pause', width, height, true);
    await page.evaluate(() => { window.game.ui.victoryChoice(window.game.world); });
    await capture('victory', width, height);
    await page.evaluate(() => { window.game.finishRun(); });
    await capture('results', width, height);
    await crawlDeck('results', width, height);
    await capture('results', width, height, true);
    await page.evaluate(() => {
      const g = window.game; g.startRun({ arena: 'proving', difficulty: 0, pacts: [], seed: 51 });
      g.world.victory = true; g.finishRun();
    });
    await capture('results-win', width, height);
    await crawlDeck('results-win', width, height);
    await capture('results-win', width, height, true);
    await page.evaluate(() => {
      const g = window.game; g.startRun({ arena: 'rift', difficulty: 0, pacts: [], seed: 51 }); g.paused = true;
      const w = g.world; w.startEvent('gravity_storm'); w.resonance.update(5.1);
      w.combo.count = 12345; w.combo.timer = 3; w.level = 120; w.run.kills = 123456; w.time = 12345;
      g.renderer.banners = []; g.renderer.draw(w); g.ui.updateHud(w);
    });
    await capture('combat-hud', width, height);
    await page.evaluate(() => {
      const g = window.game, w = g.world;
      const boss = w.spawnEnemy('boss_hydra', 270, 200); boss.spawnT = 1; boss.hp *= .5;
      w.director.bossActive = true; w.director.bossId = 'hydra';
      w.resonance.overdrive = 7; w.surge.charge = w.surge.max; w.recallCooldown = 9;
      w.aim.active = true; w.aim.holdTime = .7; w.hand = 1;
      g.renderer.draw(w); g.ui.updateHud(w);
    });
    await capture('combat-boss', width, height);
    await page.evaluate(() => {
      const g = window.game, w = g.world;
      w.time = 120; w.director.bossActive = false; w.event = null;
      for (const enemy of w.enemies) if (enemy.boss) enemy.alive = false;
      w.resonance.overdrive = 0; w.aim.active = false;
      g.renderer.draw(w); g.ui.updateHud(w);
    });
    await capture('combat-countdown', width, height);
  }
  fs.writeFileSync(`${out}/findings.json`, JSON.stringify({ findings, errors, captures }, null, 2));
  // Contact sheets keep the complete visual review manageable at every viewport.
  for (const [width, height] of sizes) {
    const allItems = captures.filter(c => c.size === `${width}x${height}`);
    for (let start = 0; start < allItems.length; start += 12) {
      const items = allItems.slice(start, start + 12);
      const sheet = await browser.newPage({ viewport: { width: 1500, height: 2000 } });
      const html = `<style>body{margin:0;background:#202632;color:#fff;font:14px system-ui}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:12px}figure{margin:0}img{width:100%;height:330px;object-fit:contain;background:#111}figcaption{padding:7px}</style><div class="grid">${items.map(c => `<figure><img src="data:image/png;base64,${fs.readFileSync(`${out}/${c.file}`).toString('base64')}"><figcaption>${c.name}${c.file.includes('-bottom') ? ' / bottom' : ''}</figcaption></figure>`).join('')}</div>`;
      await sheet.setContent(html); await sheet.screenshot({ path: `${out}/sheet-${width}x${height}-${Math.floor(start / 12) + 1}.png`, fullPage: true }); await sheet.close();
    }
  }
  console.log(JSON.stringify({ engine, captures: captures.length, defects: findings.length, errors, findings: findings.slice(0, 35) }, null, 2));
  if (!process.env.AUDIT_ONLY) { assert.deepEqual(errors, []); assert.equal(findings.length, 0, `UI layout defects: ${JSON.stringify(findings.slice(0, 3))}`); }
} finally { await browser.close(); }
