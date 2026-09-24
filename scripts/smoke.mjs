// Browser smoke test: drives the built game in headless Chrome/Edge, captures
// console errors and screenshots of key screens.
//   npx vite build && npx vite preview --port 4173 &  node scripts/smoke.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const out = process.env.SHOTS ?? 'smoke-shots';
fs.mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome']
  .find((p) => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
const url = process.env.URL ?? 'http://localhost:4173/';
await page.goto(url, { waitUntil: 'networkidle0' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => page.screenshot({ path: `${out}/${name}.png` });

await wait(1500);
await shot('01-home');
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('START') || b.textContent.includes('PLAY')).click());
await wait(800);
const rect = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const P = (lx, ly) => ({ x: rect.x + (lx / 540) * rect.w, y: rect.y + (ly / 960) * rect.h });
async function launch(lx, ly) {
  const a = P(270, 700), b = P(lx, ly);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 });
  await wait(150);
  return async () => page.mouse.up();
}
let up = await launch(150, 300);
await shot('02-aim');
await up();
await wait(2500);
await shot('03-flight');
for (let i = 0; i < 8; i++) { up = await launch(100 + i * 45, 250); await up(); await wait(900); }
await page.evaluate(() => { window.game.world.pendingLevels++; });
await wait(400);
await shot('04-levelup');
await page.evaluate(() => document.querySelector('.offer')?.click());
// give it a strong build to see effects
await page.evaluate(() => {
  const w = window.game.world;
  for (const id of ['extra_ball','extra_ball','ignite','ignite','ignite','ignite','ignite','volatile','chain_lightning','chain_lightning','frostbite','frostbite','heavy_impact']) w.onBuildChanged(w.build.addUpgrade(id));
  w.hand += 2; w.pendingLevels++;
});
await wait(400);
await shot('05-evolution-offer');
await page.evaluate(() => { const b = [...document.querySelectorAll('.offer')].find((x) => x.classList.contains('evolution')) ?? document.querySelector('.offer'); b.click(); });
for (let i = 0; i < 10; i++) { up = await launch(80 + i * 40, 220); await wait(700); await up(); }
await wait(600);
await shot('06-combat');
await page.evaluate(() => { const w = window.game.world; w.director.bossTime = w.time; w.startEvent('blackout'); });
await wait(3000);
for (let i = 0; i < 4; i++) { up = await launch(120 + i * 90, 260); await wait(600); await up(); }
await shot('07-boss-blackout');
await page.evaluate(() => window.game.pause());
await wait(300);
await shot('08-pause');
await page.evaluate(() => window.game.abandonRun());
await wait(800);
await shot('09-postrun');
const screens = ['Loadout', 'Workshop', 'Research', 'Codex', 'Goals'];
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Home')).click());
await wait(500);
await shot('10-home2');
for (const [i, s] of screens.entries()) {
  await page.evaluate((s) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(s))?.click(), s);
  await wait(400);
  await shot(`${11 + i}-${s.toLowerCase()}`);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '←')?.click());
  await wait(300);
}
const perf = await page.evaluate(async () => {
  // stress: many balls & enemies, measure frame time
  window.game.ui.runSetup();
  [...document.querySelectorAll('button')].find((b) => b.textContent.includes('LAUNCH')).click();
  const w = window.game.world;
  for (const id of ['extra_ball','extra_ball','extra_ball','extra_ball','splitter','splitter','splitter','splitter','volatile','volatile','chain_lightning','chain_lightning']) w.onBuildChanged(w.build.addUpgrade(id));
  w.hand = w.maxBallsAllowed();
  for (let i = 0; i < 150; i++) w.spawnEnemy('grunt', 40 + Math.random() * 460, 150 + Math.random() * 400);
  w.hp = w.maxHp = 1e9;
  let frames = 0; const t0 = performance.now();
  await new Promise((res) => { const f = () => { frames++; if (w.state === 'levelup') { w.choose(w.offers[0]); document.querySelector('.levelup')?.remove(); } w.beginAim(); w.setAim(Math.random() - 0.5, -1); w.release(); if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  return { fps: frames / 4, balls: w.balls.length, enemies: w.enemies.length, particles: window.game.renderer.particles.n };
});
await shot('16-stress');
console.log('perf', JSON.stringify(perf));
console.log('errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
