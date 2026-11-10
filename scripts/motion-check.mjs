// Live transitions: tab and segment changes, sheets, the draft deal, and feedback after purchases.
// Departing views animate as inert ghosts; input and state change immediately.
import { chromium, firefox, webkit } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { uiHelpers } from './ui-helpers.mjs';

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
      p.mastery.striker = 6000; p.cleared.proving = 0; p.researchNodes = ['risk_pacts'];
      g.ui.home();
    });
    const { ui, ready, tab } = uiHelpers(page);
    const running = selector => page.evaluate(selector => document.getAnimations().some(a => a.id.startsWith('ui:') && a.playState === 'running'
      && (a.effect?.target?.matches?.(selector) || a.effect?.target?.closest?.(selector))), selector);
    const ghostsInert = () => page.evaluate(() => [...document.querySelectorAll('[data-motion-ghost]')].every(el => el.inert && getComputedStyle(el).pointerEvents === 'none'));
    const mark = text => checks.push(`${width}x${height}: ${text}`);
    await ready();

    // A tab change animates only the page body; the tab bar stays put and the old page leaves as a ghost.
    const barBefore = await ui.locator('.tabbar').boundingBox();
    await ui.locator('.tabbar .tab-forge').tap();
    assert.equal(await ui.locator('.hub').getAttribute('data-tab'), 'forge', 'state changes immediately');
    assert.ok(await running('.hub-page'), 'page body animates');
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-motion-ghost] .tabbar').length), 0, 'the tab bar never leaves');
    assert.ok(await ghostsInert());
    await ready();
    assert.deepEqual(await ui.locator('.tabbar').boundingBox(), barBefore);
    // Rapid taps settle on the last tab with at most three departing frames.
    for (const id of ['codex', 'goals', 'armory', 'codex', 'goals']) await ui.locator(`.tabbar .tab-${id}`).tap();
    assert.ok(await page.evaluate(() => document.querySelectorAll('[data-motion-ghost]').length <= 3));
    await ready();
    assert.equal(await ui.locator('.hub').getAttribute('data-tab'), 'goals');
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-motion-ghost]').length), 0);
    mark('tab changes move only the page body; ghosts are inert and rapid taps settle on the last tab');

    // Segments: the pill slides along its own row from where it is drawn (never from a screen corner,
    // including when a second tap retargets it mid-flight), the body slides, and a new segment starts at its top.
    await tab('forge');
    const segment = i => ui.locator('.segmented > button').nth(i);
    const pill = () => page.evaluate(() => { const r = document.querySelector('.segmented > .ui-tab-indicator').getBoundingClientRect(); return [r.left, r.top]; });
    const restY = (await pill())[1];
    await ui.locator('.forge-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await segment(2).tap();
    assert.ok(await running('[data-segment-body]'), 'segment body slides');
    const path = [await pill()];
    await segment(0).tap();
    for (let i = 0; i < 6; i++) { path.push(await pill()); await page.evaluate(() => new Promise(r => requestAnimationFrame(r))); }
    assert.ok(path.every(([, y]) => Math.abs(y - restY) < 1), `the pill stays on its row: ${JSON.stringify(path)}`);
    const target = (await segment(0).boundingBox()).x;
    // After the second tap every frame is closer to the new segment than the one before.
    const retarget = path.slice(1);
    assert.ok(retarget.every(([x], i) => i === 0 || Math.abs(x - target) <= Math.abs(retarget[i - 1][0] - target) + 1), `a retargeted pill heads straight for the new segment: ${JSON.stringify(path)}`);
    await ready();
    assert.equal(await ui.locator('.segmented button[aria-selected="true"]').count(), 1);
    assert.equal(await ui.locator('.forge-body').evaluate(el => el.scrollTop), 0, 'a new segment starts at its top');
    // A purchase pulses the bought row and the wallet in place: no pill travel, no lost scroll.
    const scroll = ui.locator('.forge-body');
    await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const top = await scroll.evaluate(el => el.scrollTop);
    const pillBefore = await pill();
    // Buy from the last row, which is in view at the end of the list.
    // The last plain item: Relic Cache would open every later run with a relic choice.
    await scroll.evaluate(el => [...el.querySelectorAll('.shop-row:not([data-motion-key="workshop:relic_cache"]) .buy-btn')].at(-1).click());
    await page.waitForFunction(() => document.getAnimations().some(a => a.id === 'ui:feedback'));
    assert.equal(await page.evaluate(() => document.getAnimations().some(a => a.id === 'ui:tab-travel' && a.playState === 'running')), false, 'a purchase does not move the pill');
    assert.deepEqual(await pill(), pillBefore);
    if (top > 0) assert.equal(await ui.locator('.forge-body').evaluate(el => el.scrollTop), top, 'a purchase keeps the scroll position');
    await ready();
    // Talent trees slide when their tab changes.
    await segment(2).tap(); await ready();
    await ui.locator('.talent-tabs button').nth(1).tap();
    assert.ok(await running('.talent-tree'), 'talent tree slides');
    await ready();
    // The Codex rail keeps its scroll and shows the chosen chip.
    await tab('codex');
    await ui.locator('.codex-tabs button').last().tap(); await ready();
    assert.ok(await page.evaluate(() => {
      const r = document.querySelector('.codex-tabs').getBoundingClientRect(), c = document.querySelector('.codex-tabs .on').getBoundingClientRect();
      return c.left >= r.left - 1 && c.right <= r.right + 1;
    }), 'the chosen Codex chip stays in view');
    mark('segment pill slides on its row and retargets mid-flight; bodies and talent trees slide; purchases keep pill and scroll; Codex rail keeps its place');

    // Sheets slide up; Back slides them away.
    await tab('armory');
    await ui.locator('.slot-row').first().tap();
    assert.ok(await running('.sheet'), 'sheet slides in');
    await ready();
    await page.screenshot({ path: `${out}/sheet-${width}x${height}.png` });
    await page.goBack(); await ready();
    assert.equal(await ui.locator('.sheet-layer').count(), 0);
    mark('sheets slide in and close with Back');

    // The draft deals its cards one after another and ignores taps until they land.
    await tab('battle');
    await ui.locator('.play-btn').tap();
    await page.waitForFunction(() => window.game.world && window.game.controlsEnabled);
    await page.evaluate(() => { const w = window.game.world; w.pendingLevels = 1; w.level = 2; w.openLevelUp(); });
    const dealt = await page.evaluate(() => [...document.querySelectorAll('.offer')].map(el => getComputedStyle(el).animationName));
    assert.ok(dealt.every(name => name.includes('deal')), 'cards deal in');
    const delays = await page.evaluate(() => [...document.querySelectorAll('.offer')].map(el => parseFloat(getComputedStyle(el).animationDelay)));
    assert.ok(delays.every((d, i) => i === 0 || d > delays[i - 1]), 'cards land in sequence');
    assert.equal(await ui.locator('.draft[data-arming]').count(), 1);
    await ready();
    await page.screenshot({ path: `${out}/draft-${width}x${height}.png` });
    await ui.locator('.offer').first().tap(); await ready();
    assert.equal(await page.evaluate(() => window.game.world.state), 'playing');
    mark('draft cards deal in sequence behind a short tap guard');
    console.log(`${engine}: motion passed at ${width}x${height}`);
    await page.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${out}/motion.json`, JSON.stringify({ engine, checks, errors }, null, 2));
} finally { await browser.close(); }
