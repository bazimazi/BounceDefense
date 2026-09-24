import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { EVOLUTIONS, SYNERGIES } from '../src/data/synergies';
import { UPGRADES, UPGRADE_MAP } from '../src/data/upgrades';
import { Build, buildName } from '../src/sim/build';
import { MAX_DISTINCT_UPGRADES, makeOffers, previewSynergies, type OfferContext } from '../src/sim/offers';

const ALL = new Set(UPGRADES.map((u) => u.id));

function ctx(build: Build, over: Partial<OfferContext> = {}): OfferContext {
  return { build, rng: new Rng(7), pool: ALL, banished: new Set(), count: 3, levelIndex: 5, ...over };
}

describe('build & synergies', () => {
  it('upgrades stack levels and cap at max level', () => {
    const b = new Build('striker', [], []);
    for (let i = 0; i < 10; i++) b.addUpgrade('precision');
    expect(b.level('precision')).toBe(UPGRADE_MAP.precision.maxLevel);
    expect(b.stats.critChance).toBeCloseTo(0.05 + 0.07 * 5);
  });

  it('activates Burning Explosion from fire + explosion tags', () => {
    const b = new Build('striker', [], []);
    expect(b.addUpgrade('ignite')).toEqual([]);
    expect(b.addUpgrade('volatile')).toContain('burning_explosion');
    expect(b.has('burning_explosion')).toBe(true);
  });

  it('synergies that grant stats are applied', () => {
    const b = new Build('striker', [], []);
    const before = b.stats.chainCount;
    b.addUpgrade('magnetism');
    b.addUpgrade('chain_lightning');
    expect(b.synergies.has('magnetic_chain')).toBe(true);
    expect(b.stats.chainCount).toBe(before + 2);
  });

  it('every synergy is reachable with some upgrade combination', () => {
    const b = new Build('striker', [], []);
    for (const u of UPGRADES) if (!u.core) for (let i = 0; i < u.maxLevel; i++) b.addUpgrade(u.id);
    for (const s of SYNERGIES) expect(b.synergies.has(s.id), s.id).toBe(true);
  });

  it('evolution requires every ingredient at its level', () => {
    const b = new Build('striker', [], []);
    for (let i = 0; i < 4; i++) b.addUpgrade('ignite');
    b.addUpgrade('volatile');
    expect(b.eligibleEvolutions()).not.toContain('inferno');
    b.addUpgrade('ignite');
    expect(b.eligibleEvolutions()).toContain('inferno');
    b.addEvolution('inferno');
    expect(b.eligibleEvolutions()).not.toContain('inferno');
    expect(b.has('evo_inferno')).toBe(true);
  });

  it('every evolution recipe references real upgrades within their max level', () => {
    for (const e of EVOLUTIONS) for (const r of e.recipe) {
      expect(UPGRADE_MAP[r.id], `${e.id}:${r.id}`).toBeDefined();
      expect(r.level).toBeLessThanOrEqual(UPGRADE_MAP[r.id].maxLevel);
    }
  });

  it('previewSynergies predicts activation', () => {
    const b = new Build('striker', [], []);
    b.addUpgrade('ignite');
    expect(previewSynergies(b, 'volatile')).toContain('burning_explosion');
    expect(previewSynergies(b, 'scholar')).toEqual([]);
  });

  it('names builds after their dominant archetypes', () => {
    const b = new Build('striker', [], []);
    for (let i = 0; i < 3; i++) b.addUpgrade('chain_lightning');
    b.addUpgrade('vampiric');
    expect(buildName(b)).toBe('Tesla Conduit');
    const v = new Build('striker', [], []);
    for (let i = 0; i < 4; i++) v.addUpgrade('vampiric');
    for (let i = 0; i < 2; i++) v.addUpgrade('ignite');
    expect(buildName(v)).toBe('Vampiric Furnace');
  });
});

describe('upgrade offers', () => {
  it('never offers duplicates, maxed or banished upgrades', () => {
    const b = new Build('striker', [], []);
    for (let i = 0; i < 5; i++) b.addUpgrade('precision');
    for (let seed = 0; seed < 50; seed++) {
      const offers = makeOffers(ctx(b, { rng: new Rng(seed), banished: new Set(['heavy_impact']) }));
      const ids = offers.map((o) => (o.kind === 'upgrade' ? o.id : o.kind));
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain('precision');
      expect(ids).not.toContain('heavy_impact');
    }
  });

  it('respects the unlocked pool but still offers owned upgrades', () => {
    const b = new Build('striker', [], []);
    b.addUpgrade('frostbite');
    const pool = new Set(['heavy_impact', 'precision']);
    for (let seed = 0; seed < 30; seed++) {
      for (const o of makeOffers(ctx(b, { rng: new Rng(seed), pool }))) {
        if (o.kind === 'upgrade') expect(['heavy_impact', 'precision', 'frostbite']).toContain(o.id);
      }
    }
  });

  it('guarantees an eligible evolution appears', () => {
    const b = new Build('striker', [], []);
    for (let i = 0; i < 5; i++) b.addUpgrade('ignite');
    b.addUpgrade('volatile');
    const offers = makeOffers(ctx(b));
    expect(offers[0]).toEqual({ kind: 'evolution', id: 'inferno' });
  });

  it('stops offering new upgrades once the build is full', () => {
    const b = new Build('striker', [], []);
    const ids = UPGRADES.filter((u) => !u.core).map((u) => u.id).slice(0, MAX_DISTINCT_UPGRADES);
    for (const id of ids) b.addUpgrade(id);
    for (let seed = 0; seed < 20; seed++) {
      for (const o of makeOffers(ctx(b, { rng: new Rng(seed) }))) {
        if (o.kind === 'upgrade') expect(ids).toContain(o.id);
      }
    }
  });

  it('only offers core signature upgrades for that core', () => {
    const b = new Build('striker', [], []);
    for (let seed = 0; seed < 60; seed++) {
      for (const o of makeOffers(ctx(b, { rng: new Rng(seed), count: 6 }))) {
        if (o.kind === 'upgrade') expect(UPGRADE_MAP[o.id].core === undefined || UPGRADE_MAP[o.id].core === 'striker').toBe(true);
      }
    }
  });

  it('falls back to heal/coins when nothing is left', () => {
    const b = new Build('striker', [], []);
    const offers = makeOffers(ctx(b, { pool: new Set() }));
    expect(offers.map((o) => o.kind)).toEqual(['heal', 'coins']);
  });
});
