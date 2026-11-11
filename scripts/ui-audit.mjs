// Playwright visual/layout audit. Runs against dev or production preview.
// AUDIT_ONLY=1 records defects; the default fails on layout regressions.
import { chromium, firefox, webkit } from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { CORES, PARTS, TRAILS } from '../src/data/balls.ts';
import { ACHIEVEMENTS, BLUEPRINTS, CHALLENGES, OVERDRIVE, REFITS, RESEARCH } from '../src/data/meta.ts';
import { UPGRADES } from '../src/data/upgrades.ts';
import { SYNERGIES, EVOLUTIONS, REACTIONS } from '../src/data/synergies.ts';
import { ALL_BOSSES, CODEX_ENEMIES } from '../src/data/enemies.ts';
import { ARENAS, DIFFICULTIES } from '../src/data/arenas.ts';

const engine = process.env.ENGINE ?? 'chromium';
const browserType = { chromium, firefox, webkit }[engine];
assert.ok(browserType, `Unknown Playwright engine: ${engine}`);
// UI_LANG=fa reviews every layout in Persian (right-to-left).
const lang = process.env.UI_LANG ?? 'en';
const out = process.env.SHOTS ?? `smoke-shots/ui-audit/${engine}${lang === 'en' ? '' : `-${lang}`}`;
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
  await page.evaluate(lang => { window.game.profile.settings.language = lang; window.game.applySettings(); window.game.ui.home(); }, lang);
  assert.equal(await page.evaluate(() => document.documentElement.lang), lang);
  const fullProfile = {
    unlockedCores: CORES.map(x => x.id), unlockedParts: PARTS.map(x => x.id), cosmetics: TRAILS.map(x => x.id),
    unlockedUpgrades: UPGRADES.map(x => x.id), researchNodes: RESEARCH.map(x => x.id),
    achievements: ACHIEVEMENTS.map(x => x.id), challenges: CHALLENGES.map(x => x.id),
    talents: { bankcraft: 3, flow: 3, precision: 2, banked_power: 1, voltage: 2, hull: 3, plating: 3, recovery: 2, repulsion: 2, last_bastion: 1, bulwark: 2, fortitude: 3, aegis_field: 2, regenerator: 1 },
    // Every tier won once in one arena: the full ten-tier difficulty grid and the Overdrive cap at its end.
    cleared: { ...Object.fromEntries(ARENAS.map(x => [x.id, 2])), proving: DIFFICULTIES.length - 1 },
    // Every Workshop section part-way: some lines empty, some mid-way, some maxed.
    workshop: Object.fromEntries([...OVERDRIVE.map((x, i) => [x.id, i * 5]), ...BLUEPRINTS.map((x, i) => [x.id, i % (x.maxLevel + 1)]), ...REFITS.map((x, i) => [x.id, i])]),
    mastery: Object.fromEntries(CORES.map((x, i) => [x.id, i * 4000])),
    discoveries: { upgrades: UPGRADES.map(x => x.id), synergies: SYNERGIES.map(x => x.id), evolutions: EVOLUTIONS.map(x => x.id),
      reactions: REACTIONS.map(x => x.id), enemies: CODEX_ENEMIES.map(x => x.id), bosses: ALL_BOSSES.map(x => x.id), arenas: ARENAS.map(x => x.id), events: [] },
  };
  const partialProfile = await page.evaluate(() => structuredClone(window.game.profile));
  partialProfile.talents = fullProfile.talents;

  async function capture(name, width, height, bottom = false) {
    await page.waitForFunction(() => !document.getAnimations().some(animation => animation.id.startsWith('ui:') && animation.playState === 'running') && !document.querySelector('[data-motion-ghost]'));
    await page.evaluate(bottom => {
      for (const scroll of document.querySelectorAll('.screen .scroll, .levelup .scroll, .levelup')) scroll.scrollTop = bottom ? scroll.scrollHeight : 0;
    }, bottom);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const defects = await page.evaluate(combat => {
      const issues = [];
      const describe = el => `${el.tagName.toLowerCase()}.${el.className} ${el.textContent.trim().slice(0, 65)}`;
      const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
      for (const el of document.querySelectorAll('.screen, .levelup, .screen button, .levelup button, .topbar, .hub-top, .hub-page, .tabbar, .battle-panel, .arena-card, .play-row, .goal-chip, .run-card, .segmented, .shop-row, .slot-row, .option-row, .pact-row, .preset-card, .codex-grid, .codex-tile, .goal-card, .achievement, .stat-grid, .stat-tile, .reward-row, .mastery-card, .unlock-card, .buildcard, .offer, .offer-actions, .results-actions, .row:not(.wrap), .statgrid, .settings-section, .settings-audio, .setting-volume, .setting-volume-head, .setting-switch, .aim-modes, .aim-option, .talent-panel, .talent-tree, .talent-detail, .sheet, .modal, .compact-main, .compact-details, .compact-main > div, .compact-details > div')) {
        if (!visible(el)) continue;
        // Rank badges deliberately extend a few pixels beyond their talent node, inside the slot;
        // a draft card may scroll its own text in phone landscape.
        if (el.matches('.talent-node, .offer')) continue;
        if (el.scrollWidth > el.clientWidth + 2) issues.push({ kind: 'horizontal overflow', element: describe(el), excess: el.scrollWidth - el.clientWidth });
      }
      // Long lists scroll vertically and chip rails scroll sideways; every other action stays on screen.
      for (const el of document.querySelectorAll('.screen button, .levelup button')) {
        const r = el.getBoundingClientRect();
        const scroller = el.closest('.scroll, .battle-panel, .levelup, .chip-scroller, .difficulty-options');
        const clip = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: innerHeight, left: 0, right: innerWidth };
        const sideways = el.closest('.chip-scroller, .difficulty-options');
        if (visible(el) && !sideways && (r.left < -1 || r.right > innerWidth + 1)) issues.push({ kind: 'action outside viewport', element: describe(el) });
        if (visible(el) && !scroller && (r.top < -1 || r.bottom > innerHeight + 1)) issues.push({ kind: 'action outside viewport', element: describe(el) });
        if (visible(el) && scroller && !sideways && (clip.top < -1 || clip.bottom > innerHeight + 1 || clip.left < -1 || clip.right > innerWidth + 1))
          issues.push({ kind: 'scroll area outside viewport', element: describe(scroller) });
        if (visible(el) && (r.width < 43.5 || r.height < 43.5)) issues.push({ kind: 'undersized menu touch target', element: describe(el) });
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
      for (const wallet of document.querySelectorAll('.wallet')) {
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
          // Label and value sit at opposite inline ends (mirrored in RTL); their boxes must never overlap.
          const a = label?.getBoundingClientRect(), b = value?.getBoundingClientRect();
          if (a && b && a.left < b.right - 1 && a.right > b.left + 1)
            issues.push({ kind: 'colliding stat label/value', element: describe(row) });
        }
      }
      const launch = document.querySelector('.hub-battle .launch-button');
      if (launch) {
        const b = launch.getBoundingClientRect(), bar = document.querySelector('.tabbar')?.getBoundingClientRect();
        if (b.top < 0 || b.bottom > (bar ? bar.top + 1 : innerHeight)) issues.push({ kind: 'launch below initial viewport', element: describe(launch) });
      }
      // The tab bar is the one persistent navigation: never covered, never pushed off screen.
      const bar = document.querySelector('.hub .tabbar');
      if (bar && !document.querySelector('.levelup')) {
        const b = bar.getBoundingClientRect();
        if (b.bottom > innerHeight + 1 || b.top < innerHeight - 140) issues.push({ kind: 'tab bar out of place', element: describe(bar) });
      }
      for (const el of document.querySelectorAll('.screen *, .levelup *')) {
        if (!el.childElementCount && visible(el) && el.textContent.trim() && parseFloat(getComputedStyle(el).fontSize) < 9.5 && !el.closest('.compact-telemetry, .recall, .surge'))
          issues.push({ kind: 'text too small to read', element: describe(el) });
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

  /** Top of the page, and its end too when the page scrolls. */
  async function crawl(name, width, height) {
    await capture(name, width, height);
    const scrolls = await page.evaluate(() => [...document.querySelectorAll('.screen .scroll, .levelup .scroll')].some(el => el.scrollHeight > el.clientHeight + 2));
    if (scrolls) await capture(name, width, height, true);
  }
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const at = async (name, width, height, fn, arg) => { await page.evaluate(fn, arg); await settle(); await crawl(name, width, height); };

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
      for (const [label, profile] of [['locked', partialProfile], ['full', fullProfile]]) {
        await page.evaluate(profile => Object.assign(window.game.profile, profile), profile);
        await at(`${label}-home`, width, height, () => { const g = window.game; g.ui.closeOverlay(); g.toMenu(); g.ui.home(); });
        await at(`${label}-armory`, width, height, () => window.game.ui.loadout());
        for (const slot of ['shell', 'impact', 'momentum']) await at(`${label}-sheet-${slot}`, width, height, slot => window.game.ui.partSheet(slot), slot);
        await at(`${label}-trail-sheet`, width, height, () => window.game.ui.trailSheet());
        for (const screen of ['workshop', 'research', 'talents']) await at(`${label}-${screen}`, width, height, screen => window.game.ui[screen](), screen);
        for (const tab of ['blueprints', 'refits', 'overdrive'])
          await at(`${label}-workshop-${tab}`, width, height, tab => { window.game.ui.workshopTab = tab; window.game.ui.workshop(); }, tab);
        await page.evaluate(() => { window.game.ui.workshopTab = 'classic'; });
        for (const tab of ['advanced', 'apex'])
          await at(`${label}-research-${tab}`, width, height, tab => { window.game.ui.researchTab = tab; window.game.ui.research(); }, tab);
        await page.evaluate(() => { window.game.ui.researchTab = 'core'; });
        for (const segment of ['next', 'challenges', 'badges', 'mastery'])
          await at(`${label}-goals-${segment}`, width, height, segment => { window.game.ui.goalSegment = segment; window.game.ui.goals(); }, segment);
      }
      await page.evaluate(() => window.game.ui.talents());
      for (let tree = 0; tree < 3; tree++) {
        await page.locator('.talent-tabs button').nth(tree).click();
        const nodes = page.locator('.talent-tree.active .talent-node');
        for (let node = 0; node < await nodes.count(); node++) {
          await nodes.nth(node).click(); await settle();
          await capture(`talent-${tree + 1}-${node + 1}`, width, height, true);
        }
      }
      for (const tab of ['balls', 'upgrades', 'synergies', 'evolutions', 'reactions', 'enemies', 'bosses', 'arenas']) {
        await at(`codex-${tab}`, width, height, tab => { window.game.ui.codexTab = tab; window.game.ui.codex(); }, tab);
      }
      await page.locator('.codex-tile').first().click(); await settle();
      await capture('codex-sheet', width, height);
      await at('settings', width, height, () => window.game.ui.settings());
      await at('run-sheet', width, height, () => { const g = window.game; g.ui.home(); g.ui.runSheet(); });
      await page.evaluate(() => {
        const p = window.game.profile; p.coins = p.cores = p.research = 999999; window.game.ui.home();
      });
      await capture('wallet-large-home', width, height);
      await page.evaluate(() => window.game.ui.workshop());
      await capture('wallet-large-forge', width, height);
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
    await page.waitForFunction(() => !document.querySelector('[data-arming]'));
    await crawl('levelup', width, height);
    await page.evaluate(() => {
      const g = window.game, w = g.world;
      w.offers = [{ kind: 'heal' }, { kind: 'coins' }, { kind: 'evolution', id: 'inferno' }, { kind: 'evolution', id: 'tesla_storm' }];
      g.ui.levelUp(w);
    });
    await crawl('levelup-bonus', width, height);
    await page.evaluate(() => { const g = window.game; g.world.state = 'playing'; g.ui.pauseMenu(g.world); });
    await crawl('pause', width, height);
    await page.evaluate(() => { window.game.ui.victoryChoice(window.game.world); });
    await capture('victory', width, height);
    await page.evaluate(() => { window.game.finishRun(); });
    await crawl('results', width, height);
    await page.evaluate(() => {
      const g = window.game; g.startRun({ arena: 'proving', difficulty: 0, pacts: [], seed: 51 });
      g.world.victory = true; g.finishRun();
    });
    await crawl('results-win', width, height);
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
