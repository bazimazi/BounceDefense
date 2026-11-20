import { describe, expect, it } from 'vitest';
import { CORES, CORE_MAP } from '../src/data/balls';
import { AWAKEN_PERK_MAP } from '../src/data/awakening';
import { MASTERY_TRAIL, OVERDRIVE, REFITS, SIGNATURE_UPGRADE } from '../src/data/meta';
import { UPGRADE_MAP } from '../src/data/upgrades';
import { GEMINI_MIRROR, GEMINI_TWIN } from '../src/sim/behaviors';
import { applyBleed, BLAST_CRIT_SHARE, chainLightning, explode, GROUND_MAX, GROUNDING, procs } from '../src/sim/combat';
import { STAT_DEFAULTS } from '../src/sim/stats';
import { SIM_DT } from '../src/sim/types';
import { emptyWorld } from './helpers';

function rebuildGrid(w: ReturnType<typeof emptyWorld>) {
  w.grid.clear();
  for (const e of w.enemies) w.grid.insert(e);
}

describe('damage types', () => {
  it('every damage type has a core of its own, with a refit, an awakened perk, a signature and a trail', () => {
    const element = (stat: string) => CORES.filter((c) => c.mods.some((m) => m.stat === stat));
    for (const stat of ['burnPower', 'chainDamage', 'chillChance', 'bleedPower', 'poisonPower', 'explosionDamage']) {
      expect(element(stat).length, stat).toBeGreaterThan(0);
    }
    for (const c of CORES) {
      expect(REFITS.some((r) => r.core === c.id), c.id).toBe(true);
      expect(AWAKEN_PERK_MAP[c.id], c.id).toBeTruthy();
      expect(UPGRADE_MAP[SIGNATURE_UPGRADE[c.id]]?.core, c.id).toBe(c.id);
      expect(MASTERY_TRAIL[c.id], c.id).toBeTruthy();
    }
  });

  it('bleed scales with bleed power, which the Blood Core raises', () => {
    const plain = emptyWorld();
    const blood = emptyWorld({ core: 'blood' });
    expect(blood.build.stats.bleedPower).toBeGreaterThan(plain.build.stats.bleedPower * 1.3);
    expect(blood.build.stats.bleedCap).toBeGreaterThan(plain.build.stats.bleedCap);
    for (const w of [plain, blood]) {
      w.build.stats.bleedChance = 1;
      const e = w.spawnEnemy('brute', 200, 300)!;
      procs(w, e, 100, false, 0);
      expect(e.st.bleedDps).toBeCloseTo(100 * w.build.stats.bleedPower * w.build.stats.elementPower);
    }
  });

  it('Bloodletting and Hemorrhage feed bleed damage, not only stacks', () => {
    const w = emptyWorld();
    const base = w.build.stats.bleedPower;
    w.build.addUpgrade('bloodletting');
    expect(w.build.stats.bleedPower).toBeCloseTo(base * 1.2);
  });

  it('a bleeding enemy at full stacks loses stacks x dps every second, through armor', () => {
    const w = emptyWorld();
    const e = w.spawnEnemy('brute', 200, 300)!;
    e.armor = 50;
    e.hp = e.maxHp = 1e6;
    applyBleed(w, e, 10, 10);
    const hp = e.hp;
    for (let i = 0; i < Math.round(1 / SIM_DT); i++) w.step(SIM_DT);
    expect(hp - e.hp).toBeCloseTo(10 * 10, -1);
  });

  it('lightning grounds its unspent jumps into a lone target', () => {
    const w = emptyWorld();
    const boss = w.spawnEnemy('brute', 200, 300)!;
    boss.armor = 0;
    boss.hp = boss.maxHp = 1e6;
    rebuildGrid(w);
    const hp = boss.hp;
    chainLightning(w, boss, 10, 5, 1);
    expect(hp - boss.hp).toBeCloseTo(10 * GROUNDING * Math.min(5, GROUND_MAX));
  });

  it('a chain that spends every jump does not ground', () => {
    const w = emptyWorld();
    const a = w.spawnEnemy('brute', 100, 300)!;
    const b = w.spawnEnemy('brute', 180, 300)!;
    a.armor = b.armor = 0;
    rebuildGrid(w);
    const hp = a.hp;
    chainLightning(w, a, 10, 1, 1);
    expect(a.hp).toBe(hp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('the Tesla Core raises chain damage', () => {
    expect(emptyWorld({ core: 'tesla' }).build.stats.chainDamage).toBeGreaterThan(STAT_DEFAULTS.chainDamage * 1.1);
  });

  it('the Blast Core makes explosions bigger, and its blasts can crit', () => {
    const w = emptyWorld({ core: 'blast' });
    const st = w.build.stats;
    expect(st.explosionChance).toBeGreaterThan(STAT_DEFAULTS.explosionChance + 0.1);
    expect(st.explosionDamage).toBeGreaterThan(STAT_DEFAULTS.explosionDamage);
    expect(w.build.has('blast_core')).toBe(true);
    // Blast explosions roll at a share of the crit chance: this chance makes that share certain.
    st.critChance = 1 / BLAST_CRIT_SHARE;
    st.critMult = 3;
    const e = w.spawnEnemy('brute', 200, 300)!;
    e.armor = 0;
    e.hp = e.maxHp = 1e6;
    rebuildGrid(w);
    explode(w, 200, 300, 60, 10, 1, {});
    expect(e.maxHp - e.hp).toBeCloseTo(30);
    // An enemy's death blast never crits.
    const hp = e.hp;
    explode(w, 200, 300, 60, 10, 1, { src: 'enemyBlast' });
    expect(hp - e.hp).toBeCloseTo(10);
  });

  it('Cluster Charge scatters bomblets that never scatter more', () => {
    const w = emptyWorld({ core: 'blast' });
    w.build.stats.critChance = 0;
    w.build.addUpgrade('cluster_charge');
    w.build.stats.critChance = 0;
    const e = w.spawnEnemy('brute', 200, 300)!;
    e.armor = 0;
    e.hp = e.maxHp = 1e6;
    rebuildGrid(w);
    const before = w.explosionsThisStep;
    explode(w, 200, 300, 80, 10, 1, {});
    expect(w.explosionsThisStep - before).toBe(1 + 2);
    expect(w.damageBy.get('cluster_charge') ?? 0).toBeGreaterThan(0);
  });

  it('Impact Driver raises direct hits only', () => {
    const od = OVERDRIVE.find((o) => o.id === 'od_impact')!;
    expect(od.mods(10)).toEqual([{ stat: 'hitPower', mult: 0.2 }]);
    const w = emptyWorld({ workshop: { od_impact: 10 } });
    expect(w.build.stats.hitPower).toBeCloseTo(1.2);
    expect(w.build.stats.damage).toBeCloseTo(emptyWorld().build.stats.damage);
  });

  it("Gemini's twin grows with shard power, and Mirror Image lifts it", () => {
    const g = emptyWorld({ core: 'gemini', seed: 9 });
    g.beginAim(); g.setAim(0, -1); g.release();
    g.step(SIM_DT);
    const twin = g.balls.find((b) => b.kind === 'clone')!;
    expect(twin.dmgMult).toBeCloseTo(g.build.stats.shardPower * GEMINI_TWIN / STAT_DEFAULTS.shardPower);
    expect(CORE_MAP.gemini.mods).toEqual([{ stat: 'damage', mult: -0.14 }]);

    const m = emptyWorld({ core: 'gemini', seed: 9 });
    m.build.addUpgrade('mirror_image');
    m.refreshBehaviors();
    m.beginAim(); m.setAim(0, -1); m.release();
    m.step(SIM_DT);
    const mirrored = m.balls.find((b) => b.kind === 'clone')!;
    expect(mirrored.dmgMult).toBeCloseTo(m.build.stats.shardPower * GEMINI_MIRROR / STAT_DEFAULTS.shardPower);
  });
});
