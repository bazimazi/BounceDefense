import { analyticsLog } from '../core/analytics';
import { ARENA_EVENTS } from '../data/arenas';
import { ENEMIES } from '../data/enemies';
import { EVOLUTIONS } from '../data/synergies';
import { UPGRADES, UPGRADE_MAP } from '../data/upgrades';
import type { Game } from '../game';
import { damageEnemy } from '../sim/combat';
import { W } from '../sim/types';
import { h } from '../ui/dom';

/** In-game tools for balancing and testing synergies. Toggle with ` or Settings. */
export function createDebugPanel(game: Game): HTMLElement {
  let god = false;
  let fps = 0;
  let frames = 0;
  let lastT = performance.now();
  const fpsEl = h('div', {}, 'fps');
  const w = () => game.world;
  const btn = (label: string, fn: () => void) => h('button', { onclick: fn }, label);

  const enemySel = h('select', {}, ENEMIES.map((e) => h('option', { value: e.id }, e.name)));
  const upgSel = h('select', {}, UPGRADES.map((u) => h('option', { value: u.id }, `${u.icon} ${u.name}`)));
  const evoSel = h('select', {}, EVOLUTIONS.map((e) => h('option', { value: e.id }, `${e.icon} ${e.name}`)));
  const evSel = h('select', {}, ARENA_EVENTS.map((e) => h('option', { value: e.id }, e.name)));

  const panel = h('div', { class: 'debug' },
    h('div', { class: 'row' }, h('b', {}, 'DEBUG'), h('span', { class: 'spacer' }), fpsEl),
    btn('+Level', () => { const x = w(); if (x) x.pendingLevels++; }),
    btn('+Ball', () => { const x = w(); if (x) { x.build.addUpgrade('extra_ball'); x.hand++; x.onBuildChanged([]); } }),
    btn('God', () => { god = !god; }),
    btn('Kill all', () => { const x = w(); x?.enemies.forEach((e) => !e.boss && damageEnemy(x, e, 1e9, { src: 'spark', crit: false, depth: 5 })); }),
    btn('Boss', () => { const x = w(); if (x) x.director.bossTime = x.time; }),
    btn('Elite', () => w()?.director.spawnElite(2, 1)),
    btn('Surge', () => { const x = w(); if (x) x.surge.charge = x.surge.max; }),
    btn('+Combo50', () => w()?.addCombo(50)),
    h('div', {}, 'Time:', btn('¼', () => setTs(0.25)), btn('1', () => setTs(1)), btn('3', () => setTs(3))),
    enemySel,
    btn('Spawn', () => w()?.spawnEnemy(enemySel.value, W / 2 + (Math.random() - 0.5) * 300, 150)),
    btn('Spawn elite', () => w()?.spawnEnemy(enemySel.value, W / 2, 150, { elite: ['armored', 'regen'] })),
    upgSel,
    btn('Give upgrade', () => { const x = w(); if (x) { x.onBuildChanged(x.build.addUpgrade(upgSel.value)); x.maxHp = x.build.stats.maxHp; } }),
    evoSel,
    btn('Give recipe', () => {
      const x = w();
      const e = EVOLUTIONS.find((v) => v.id === evoSel.value);
      if (!x || !e) return;
      for (const r of e.recipe) while (x.build.level(r.id) < r.level && x.build.level(r.id) < UPGRADE_MAP[r.id].maxLevel) x.onBuildChanged(x.build.addUpgrade(r.id));
      x.pendingLevels++;
    }),
    evSel,
    btn('Start event', () => w()?.startEvent(evSel.value)),
    btn('+1000🪙 +10💠 +10🔬', () => { game.profile.coins += 1000; game.profile.cores += 10; game.profile.research += 10; game.save(); game.ui.toast('Granted'); }),
    btn('Log analytics', () => console.table(analyticsLog.slice(-30))),
  );

  let ts = 1;
  function setTs(v: number) {
    ts = v;
  }

  // piggyback on rAF for fps + god mode + time scale
  const tick = () => {
    frames++;
    const now = performance.now();
    if (now - lastT > 500) {
      fps = Math.round((frames * 1000) / (now - lastT));
      frames = 0;
      lastT = now;
      const x = w();
      fpsEl.textContent = `${fps}fps ${x ? `e${x.enemies.length} b${x.balls.length} p${game.renderer.particles.n}` : ''}`;
    }
    const x = w();
    if (x) {
      if (god) x.hp = x.maxHp;
      if (ts !== 1 && x.state === 'playing') {
        // extra (or fewer) sim steps for time scaling
        if (ts > 1) for (let i = 0; i < Math.round((ts - 1) * 2); i++) x.step(1 / 120);
      }
    }
    if (panel.isConnected) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return panel;
}
