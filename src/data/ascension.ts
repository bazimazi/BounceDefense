import { localize } from '../i18n/content';

/**
 * Ascension: an endgame ladder on Abyss and every tier above it. Winning on Abyss opens Ascension 1;
 * every win at the highest open level (on Abyss or harder) opens the next. Rules stack: Ascension 7
 * plays with rules 1 through 7.
 */
export type AscensionRule =
  | 'hp10' | 'eliteMod' | 'speed8' | 'heal30' | 'boss20' | 'reroll' | 'breach15' | 'spawn10' | 'hull15' | 'miniboss'
  | 'traits' | 'starfall' | 'hp15' | 'xp10' | 'enrage' | 'projectiles' | 'eliteRegen' | 'relic2' | 'hp20' | 'thirdBoss'
  | 'armor3' | 'speed10' | 'boss40' | 'regen50' | 'traits2' | 'surgeSlow' | 'breach40' | 'hp50' | 'late25' | 'apexPlus';

export interface AscensionDef {
  id: AscensionRule;
  level: number;
  desc: string;
}

export const ASCENSIONS: AscensionDef[] = [
  { id: 'hp10', level: 1, desc: 'Enemies have 10% more health.' },
  { id: 'eliteMod', level: 2, desc: 'Elites carry an extra modifier.' },
  { id: 'speed8', level: 3, desc: 'Enemies move 8% faster.' },
  { id: 'heal30', level: 4, desc: 'All healing is 30% weaker.' },
  { id: 'boss20', level: 5, desc: 'Bosses have 20% more health.' },
  { id: 'reroll', level: 6, desc: 'One fewer reroll each run.' },
  { id: 'breach15', level: 7, desc: 'Breaches hit your line 15% harder.' },
  { id: 'spawn10', level: 8, desc: 'Squads arrive 10% more often.' },
  { id: 'hull15', level: 9, desc: 'Start with 15% less max HP.' },
  { id: 'miniboss', level: 10, desc: 'The mini-boss has 50% more health and an extra modifier.' },
  { id: 'traits', level: 11, desc: '10% more ordinary enemies carry elite traits.' },
  { id: 'starfall', level: 12, desc: 'Starfall deals 30% less damage.' },
  { id: 'hp15', level: 13, desc: 'Enemies have 15% more health.' },
  { id: 'xp10', level: 14, desc: 'Level-ups need 10% more XP.' },
  { id: 'enrage', level: 15, desc: 'Bosses enrage at 65% health instead of 50%.' },
  { id: 'projectiles', level: 16, desc: 'Enemy projectiles fly 25% faster.' },
  { id: 'eliteRegen', level: 17, desc: 'Every elite regenerates.' },
  { id: 'relic2', level: 18, desc: 'Relic caches offer one fewer choice.' },
  { id: 'hp20', level: 19, desc: 'Enemies have 20% more health.' },
  { id: 'thirdBoss', level: 20, desc: 'A third boss joins the assault.' },
  // Ascension II: past the twentieth step the ladder keeps going for players who have bought everything.
  { id: 'armor3', level: 21, desc: 'Every enemy except bosses gains +3 armor.' },
  { id: 'speed10', level: 22, desc: 'Enemies move 10% faster.' },
  { id: 'boss40', level: 23, desc: 'Bosses have 40% more health.' },
  { id: 'regen50', level: 24, desc: 'Line regeneration is halved.' },
  { id: 'traits2', level: 25, desc: 'Another 15% of ordinary enemies carry elite traits.' },
  { id: 'surgeSlow', level: 26, desc: 'Surge charges 25% slower.' },
  { id: 'breach40', level: 27, desc: 'Breaches hit your line 40% harder.' },
  { id: 'hp50', level: 28, desc: 'Enemies have 50% more health.' },
  { id: 'late25', level: 29, desc: 'Enemies toughen 25% more as the run goes on.' },
  { id: 'apexPlus', level: 30, desc: 'One more apex boss waits at the end of the run.' },
];

export const MAX_ASCENSION = ASCENSIONS.length;
/** Difficulty index (Abyss) from which Ascension can be played. */
export const ASCENSION_TIER = 4;
/** Reward multiplier added per Ascension level. */
export const ASCENSION_REWARD = 0.12;

/** Every rule active at this Ascension level. */
export function ascensionRules(level: number): Set<AscensionRule> {
  return new Set(ASCENSIONS.filter((a) => a.level <= level).map((a) => a.id));
}

localize('ascension', ASCENSIONS, ['desc']);
