import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { BEHAVIORS } from '../src/sim/behaviors';
import { botChoose, botStep } from '../src/sim/bot';
import { damageEnemy } from '../src/sim/combat';
import { SIM_DT } from '../src/sim/types';
import { skillInfo, SOURCE_KEYS } from '../src/ui/damage-meter';
import { emptyWorld, makeWorld } from './helpers';

function play(core: string, seed: number, seconds: number) {
  const w = makeWorld({ core, seed });
  const rng = new Rng(seed);
  for (let i = 0; i < seconds / SIM_DT && w.state !== 'over'; i++) {
    if (w.state === 'levelup') w.choose(botChoose(w, rng, 'focused'));
    botStep(w, rng);
    w.step(SIM_DT);
    w.fx.length = 0;
  }
  return w;
}

describe('damage meter', () => {
  it('accounts for every point of damage dealt, per skill', () => {
    const w = play('pyro', 3, 150);
    const report = w.damageReport();
    const sum = report.reduce((a, [, v]) => a + v, 0);
    expect(w.run.damageDealt).toBeGreaterThan(0);
    expect(sum).toBeCloseTo(w.run.damageDealt, 3);
    for (let i = 1; i < report.length; i++) expect(report[i - 1][1]).toBeGreaterThanOrEqual(report[i][1]);
    expect(w.summary().damageBy).toEqual(report);
  });

  it('credits damage to the skill running at the time, and restores the previous one', () => {
    const w = emptyWorld({ seed: 1 });
    const e = w.spawnEnemy('grunt', 270, 300)!;
    e.hp = e.maxHp = 1e6;
    w.credit('static_charge', () => {
      damageEnemy(w, e, 50, { src: 'chain', crit: false, depth: 1 });
      w.credit('relic_meteor', () => damageEnemy(w, e, 20, { src: 'meteor', crit: false, depth: 1 }));
      damageEnemy(w, e, 5, { src: 'chain', crit: false, depth: 1 });
    });
    damageEnemy(w, e, 7, { src: 'ball', crit: false, depth: 0 });
    expect(w.dmgSkill).toBe('');
    expect(w.damageBy.get('ball')).toBeGreaterThan(0);
    expect(w.damageBy.get('static_charge')).toBeGreaterThan(w.damageBy.get('relic_meteor')!);
    expect(w.damageBy.has('chain')).toBe(false);
  });

  it('names every skill a run can credit', () => {
    for (const key of SOURCE_KEYS) expect(BEHAVIORS[key], key).toBeUndefined();
    const unnamed = Object.keys(BEHAVIORS).filter((id) => skillInfo(id).icon === '◆');
    expect(unnamed).toEqual([]);
    for (const id of ['overkill', 'bp_second_wind', 'pylon', 'surge']) expect(skillInfo(id).icon, id).not.toBe('◆');
  });

  it('shows behavior skills by name in a real run', () => {
    const keys = new Set<string>();
    for (const [core, seed] of [['tesla', 5], ['venom', 9], ['titan', 2]] as const) {
      for (const [k] of play(core, seed, 180).damageReport()) keys.add(k);
    }
    expect([...keys].some((k) => !SOURCE_KEYS.includes(k))).toBe(true);
  });
});
