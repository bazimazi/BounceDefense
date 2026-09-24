import { describe, expect, it } from 'vitest';
import { computeStats, STAT_DEFAULTS } from '../src/sim/stats';

describe('modifier system', () => {
  it('returns defaults with no modifiers', () => {
    const s = computeStats([]);
    expect(s.damage).toBe(STAT_DEFAULTS.damage);
    expect(s.maxBalls).toBe(1);
  });

  it('applies flat adds before multiplicative factors', () => {
    const s = computeStats([{ stat: 'damage', add: 10 }, { stat: 'damage', mult: 0.5 }], { damage: 10 });
    expect(s.damage).toBeCloseTo(30);
  });

  it('stacks multipliers multiplicatively', () => {
    const s = computeStats([{ stat: 'damage', mult: 0.5 }, { stat: 'damage', mult: 0.5 }], { damage: 10 });
    expect(s.damage).toBeCloseTo(22.5);
  });

  it('clamps crit chance, lifesteal and integer stats', () => {
    const s = computeStats([
      { stat: 'critChance', add: 5 },
      { stat: 'lifesteal', add: 3 },
      { stat: 'maxBalls', add: 1.7 },
      { stat: 'pierce', add: 1.9 },
    ]);
    expect(s.critChance).toBe(1);
    expect(s.lifesteal).toBe(0.5);
    expect(s.maxBalls).toBe(2);
    expect(s.pierce).toBe(1);
  });

  it('never lets speed or radius leave sane bounds', () => {
    const s = computeStats([{ stat: 'speed', mult: -0.99 }, { stat: 'radius', mult: 10 }]);
    expect(s.speed).toBeGreaterThanOrEqual(260);
    expect(s.radius).toBeLessThanOrEqual(26);
  });
});
