// Shared Playwright helpers for the hub UI: settle motion, switch tabs/segments, open sheets.
export function uiHelpers(page) {
  const ui = page.locator('#ui');
  const tick = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  /** Navigation settled, no UI motion running, no departing ghosts, and any draft armed. */
  const ready = async () => {
    await page.waitForFunction(() => window.game && !window.game.ui.navigation.busy
      && !document.getAnimations().some(animation => animation.id.startsWith('ui:') && animation.playState === 'running')
      && !document.querySelector('[data-motion-ghost]') && !document.querySelector('[data-arming]'));
    await tick();
  };
  const isHome = async () => (await ui.locator('.hub-battle').count()) === 1;
  const tab = async id => { await ready(); await ui.locator(`.tabbar .tab-${id}`).tap(); await ready(); };
  const segment = async name => { await ready(); await ui.locator('.segmented').getByRole('tab', { name: typeof name === 'string' ? new RegExp(name) : name }).tap(); await ready(); };
  const openSettings = async () => { await ready(); await ui.locator('.settings-btn').tap(); await ready(); };
  const closeSheet = async () => { await ready(); await ui.locator('.sheet-close').tap(); await ready(); };
  const row = (selector, text) => ui.locator(selector).filter({ hasText: text });
  /** A Workshop/Research row by its exact name (other rows may mention it as a prerequisite). */
  const shopRow = name => ui.locator('.shop-row').filter({ has: page.locator('.shop-name b', { hasText: new RegExp(`^${name}$`) }) });
  return { ui, tick, ready, isHome, tab, segment, openSettings, closeSheet, row, shopRow };
}
