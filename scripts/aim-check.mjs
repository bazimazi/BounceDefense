// Native mouse/touch input across the board, HUD layers and letterboxed layouts.
import { chromium, firefox, webkit } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const engine = process.env.ENGINE ?? 'chromium';
const browser = await ({ chromium, firefox, webkit }[engine]).launch({ headless: true });
const out = process.env.SHOTS ?? `smoke-shots/aim/${engine}`;
fs.mkdirSync(out, { recursive: true });
const errors = [], checks = [];
try {
  for (const [width, height] of [[320, 568], [390, 844], [568, 320], [1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(process.env.URL ?? 'http://localhost:4173', { waitUntil: 'networkidle' });
    const settle = () => page.waitForFunction(() => !window.game.ui.navigation.busy
      && !document.getAnimations().some(animation => animation.id.startsWith('ui:') && animation.playState === 'running')
      && !document.querySelector('[data-motion-ghost]'));
    await page.evaluate(() => {
      const g = window.game;
      g.profile.tutorialDone = true; g.profile.settings.sfx = 0; g.profile.settings.music = 0;
      g.startRun({ arena: 'proving', difficulty: 0, pacts: [], seed: 27 });
      g.world.director.update = () => {};
      g.world.resonance.update = () => {};
      window.addEventListener('pointerdown', event => {
        if (event.isPrimary) window.aimPress = { x: event.clientX, y: event.clientY };
      });
    });
    await settle();
    const bounds = await page.locator('#game').boundingBox();
    const point = (x, y) => ({ x: bounds.x + bounds.width * x, y: bounds.y + bounds.height * y });
    const state = () => page.evaluate(() => {
      const g = window.game, w = g.world;
      return { ...w.aim, queue: w.launchQueue, balls: w.balls.length, hand: w.hand, paused: g.paused, pointer: g.pointer.id };
    });
    const rearm = () => page.evaluate(() => {
      const w = window.game.world;
      w.cancelAim(); w.balls = []; w.hand = 1; w.launchQueue = 0; w.powerQueue = 0;
    });
    const mouseDown = async p => { await page.mouse.move(p.x, p.y); await page.mouse.down(); };
    const matchesPress = async label => {
      const result = await page.evaluate(() => {
        const g = window.game, rect = g.renderer.canvas.getBoundingClientRect(), press = window.aimPress;
        const dx = (press.x - rect.left) / g.renderer.scale - 270;
        const dy = Math.min((press.y - rect.top) / g.renderer.scale, 840) - 850;
        const angle = Math.max(-Math.PI + .16, Math.min(-.16, Math.atan2(dy, dx)));
        return { dx: g.world.aim.dx, dy: g.world.aim.dy, expectedX: Math.cos(angle), expectedY: Math.sin(angle) };
      });
      assert.ok(Math.abs(result.dx - result.expectedX) < .001 && Math.abs(result.dy - result.expectedY) < .001, label);
    };
    const launched = async label => {
      const s = await state();
      assert.equal(s.active, false, label);
      assert.ok(s.queue > 0 || s.balls > 0, `${label}: release launches`);
    };

    // Upper, middle and lower regions all start a gesture, far above the gun.
    for (const y of [.16, .38, .65, .84]) for (const x of [.12, .35, .5, .7, .88]) {
      await rearm();
      await mouseDown(point(x, y));
      assert.equal((await state()).active, true, `Mouse starts aiming at ${x},${y}`);
      await matchesPress('Gun points toward the press');
      const end = point(x < .5 ? .85 : .15, .45);
      await page.mouse.move(end.x, end.y);
      assert.equal(Math.sign((await state()).dx), x < .5 ? 1 : -1, 'Drag changes direction across the board');
      await page.mouse.up(); await launched('Mouse release');
    }
    for (const y of [.16, .45, .8]) for (const x of [.15, .5, .85]) {
      await rearm();
      const p = point(x, y); await page.touchscreen.tap(p.x, p.y);
      await matchesPress('Touch aims toward its board position'); await launched('Touch release');
    }
    checks.push(`${width}x${height}: mouse and native touch aim across the entire board`);

    // Passive content must never become a narrow aiming boundary.
    await rearm();
    await page.locator('#ui .game-hud').evaluate(el => { el.style.pointerEvents = 'auto'; });
    await mouseDown(point(.15, .4));
    assert.equal((await state()).active, true, 'A passive HUD layer can receive the press without stealing aiming');
    await page.mouse.up(); await launched('HUD layer release');
    await page.locator('#ui .game-hud').evaluate(el => { el.style.removeProperty('pointer-events'); });
    if (bounds.x > 20 || bounds.y > 20) {
      await rearm();
      const p = bounds.x > 20 ? { x: bounds.x / 2, y: height * .5 } : { x: width * .4, y: bounds.y / 2 };
      await mouseDown(p); assert.equal((await state()).active, true, 'Letterbox space supports aiming');
      await page.mouse.up(); await launched('Letterbox release');
    }

    await rearm();
    const pause = await page.getByRole('button', { name: 'Pause game', exact: true }).boundingBox();
    await mouseDown(point(.3, .4));
    await page.mouse.move(pause.x + pause.width / 2, pause.y + pause.height / 2);
    assert.equal((await state()).active, true, 'Captured drag continues over HUD buttons');
    await page.mouse.up(); await launched('Drag over Pause');
    assert.equal((await state()).paused, false, 'An existing aim drag does not click Pause');

    await rearm();
    await page.getByRole('button', { name: 'Pause game', exact: true }).tap(); await settle();
    assert.equal((await state()).active, false); assert.equal((await state()).queue, 0);
    await page.mouse.click(point(.2, .4).x, point(.2, .4).y);
    assert.equal((await state()).active, false, 'Paused menus cannot start aiming');
    await page.getByRole('button', { name: /Resume/ }).tap(); await settle();

    await rearm(); await mouseDown(point(.7, .3));
    await page.keyboard.press('Escape'); await settle();
    assert.equal((await state()).pointer, -1, 'Pausing releases pointer ownership');
    await page.mouse.up();
    assert.equal((await state()).queue, 0, 'Pausing an aim never launches a volley');
    await page.getByRole('button', { name: /Resume/ }).tap(); await settle();

    await rearm(); await mouseDown(point(.7, .3));
    await page.mouse.move(point(.65, .35).x, point(.65, .35).y);
    await page.evaluate(() => { const g = window.game; document.getElementById('app').releasePointerCapture(g.pointer.id); });
    await page.mouse.move(point(.3, .5).x, point(.3, .5).y); await page.mouse.up();
    assert.equal((await state()).active, false, 'Losing capture cancels aiming');
    assert.equal((await state()).queue, 0, 'Losing capture cannot launch a volley');
    checks.push(`${width}x${height}: layers, margins and captured drags work; pause/capture loss cancel safely`);

    await page.evaluate(() => { window.game.profile.settings.aimMode = 'slingshot'; });
    for (const [x, y] of [[.2, .2], [.8, .4], [.5, .7]]) {
      await rearm(); const start = point(x, y);
      await mouseDown(start);
      await page.mouse.move(start.x + bounds.width * .08, start.y + bounds.height * .08);
      assert.ok((await state()).dx < 0 && (await state()).dy < 0, 'Slingshot can start anywhere and pull left');
      await page.mouse.move(start.x - bounds.width * .08, start.y + bounds.height * .08);
      assert.ok((await state()).dx > 0 && (await state()).dy < 0, 'Slingshot direction follows the drag');
      await page.mouse.up(); await launched('Slingshot release');
    }
    await page.evaluate(() => { window.game.profile.settings.aimMode = 'direct'; });

    if (engine === 'chromium') {
      const cdp = await page.context().newCDPSession(page);
      await rearm(); const start = point(.2, .3), end = point(.8, .5);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
      assert.equal((await state()).active, true);
      const owner = (await state()).pointer;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }, { ...point(.5, .7), id: 2 }] });
      assert.equal((await state()).pointer, owner, 'Second finger cannot steal aiming');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 1 }, { ...point(.6, .7), id: 2 }] });
      assert.ok((await state()).dx > 0, 'Native touch drag changes direction across the board');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await launched('Native touch drag release');
      await rearm();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      assert.equal((await state()).active, false); assert.equal((await state()).queue, 0);
      await cdp.detach();
      checks.push(`${width}x${height}: native touch dragging, second finger and cancellation`);
    }
    await page.close(); console.log(`${engine}: free aiming passed at ${width}x${height}`);
  }
  assert.deepEqual(errors, [], 'Browser errors');
  fs.writeFileSync(`${out}/aim.json`, JSON.stringify({ engine, checks, errors }, null, 2));
} finally { await browser.close(); }
