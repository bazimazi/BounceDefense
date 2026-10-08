// Run against `npm run dev -- --port 4173` or the production preview.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const executablePath = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
].find(p => fs.existsSync(p));
const out = process.env.SHOTS ?? 'smoke-shots/talents';
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 1366, height: 1000 });
  await page.goto(process.env.URL ?? 'http://localhost:4173', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !!window.game);
  const button = async text => {
    await page.waitForFunction(() => !window.game.ui.navigation.busy);
    await page.waitForFunction(text => [...document.querySelectorAll('button')].some(b => b.textContent.includes(text) && getComputedStyle(b).visibility !== 'hidden' && b.getBoundingClientRect().height > 0), {}, text);
    const handle = await page.evaluateHandle(text => [...document.querySelectorAll('button')].find(b => b.textContent.includes(text) && getComputedStyle(b).visibility !== 'hidden' && b.getBoundingClientRect().height > 0), text);
    assert(await handle.evaluate(b => !!b && !b.disabled), `Expected enabled button: ${text}`);
    await handle.asElement().click();
    await handle.dispose();
  };
  await button('Talents');
  assert.equal(await page.$eval('.talent-points', el => el.textContent), '3 points available');
  await page.click('#talent-bankcraft');
  await button('Learn rank');
  await button('Apply talents');
  assert.equal(await page.evaluate(() => window.game.profile.talents.bankcraft), 1);
  await page.reload({ waitUntil: 'networkidle0' });
  await button('Talents');
  assert.equal(await page.$eval('#talent-bankcraft .talent-rank', el => el.textContent), '1/3');
  // Unlock enough budget for capstone and refund interaction checks.
  await page.evaluate(() => {
    const g = window.game;
    g.profile.mastery.striker = 6000;
    g.profile.tutorialDone = true;
    g.save(); g.ui.talents();
  });
  const learn = async (id, n) => {
    await page.click(`#talent-${id}`);
    for (let i = 0; i < n; i++) await button('Learn rank');
  };
  await learn('bankcraft', 2);
  await learn('flow', 3);
  await learn('precision', 2);
  await learn('banked_power', 1);
  await button('Apply talents');
  assert.equal(await page.evaluate(() => window.game.profile.talents.banked_power), 1);
  // Refunding a prerequisite cascades only in the draft.
  await page.click('#talent-bankcraft');
  await button('Refund');
  assert.equal(await page.$eval('#talent-precision .talent-rank', el => el.textContent), '0/2');
  assert.equal(await page.$eval('#talent-banked_power .talent-rank', el => el.textContent), '0/1');
  assert.equal(await page.evaluate(() => window.game.profile.talents.banked_power), 1);
  await page.click('button[aria-label="Back"]');
  await page.waitForFunction(() => !window.game.ui.navigation.busy);
  await page.click('button[aria-label="Back"]');
  await button('Discard changes');
  await button('Talents');
  assert.equal(await page.$eval('#talent-banked_power .talent-rank', el => el.textContent), '1/1');
  await page.click('#talent-banked_power');
  await page.$eval('.talent-scroll', el => { el.scrollTop = 0; });
  await page.screenshot({ path: `${out}/desktop.png` });
  for (const width of [390, 320]) {
    await page.setViewport({ width, height: 844, isMobile: true, hasTouch: true });
    await page.evaluate(() => window.game.ui.talents());
    await button('Conduit');
    assert.equal(await page.$$eval('.talent-tree', els => els.filter(el => getComputedStyle(el).display !== 'none').length), 1);
    await learn('voltage', 1);
    await button('Apply talents');
    const bounds = await page.$eval('.talent-screen', el => {
      const r = el.getBoundingClientRect();
      return { x: r.x, right: r.right, overflow: el.scrollWidth > el.clientWidth };
    });
    assert(bounds.x >= -1 && bounds.right <= width + 1 && !bounds.overflow, `Overflow at ${width}: ${JSON.stringify(bounds)}`);
    await page.screenshot({ path: `${out}/mobile-${width}-detail.png` });
    await page.$eval('.talent-scroll', el => { el.scrollTop = 0; });
    await page.screenshot({ path: `${out}/mobile-${width}-tree.png` });
  }
  // Saved talents are included at launch and can be inspected without editing in pause.
  await page.evaluate(() => window.game.ui.runSetup());
  await button('Edit talents');
  await page.click('button[aria-label="Back"]');
  await page.waitForFunction(() => !window.game.ui.navigation.busy);
  assert.equal(await page.$eval('.topbar h2', el => el.textContent), 'New Run');
  await button('LAUNCH');
  assert.equal(await page.evaluate(() => window.game.world.talents.banked_power), 1);
  await page.evaluate(() => window.game.pause());
  await button('Talents');
  await page.waitForFunction(() => document.querySelector('.deck')?.dataset.section === '2');
  assert(await page.$eval('.levelup', el => el.textContent.includes('Banked Power')));
  assert.deepEqual(errors, []);
  console.log('Talent browser checks passed: allocation, capstone, refunds, draft discard, save/reload, launch, pause, desktop and 390/320px layouts.');
} finally {
  await browser.close();
}
