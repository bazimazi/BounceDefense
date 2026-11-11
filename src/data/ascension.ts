import { localize } from '../i18n/content';

/**
 * Ascension: an endgame ladder on Abyss and every tier above it. Winning on Abyss opens Ascension 1;
 * every win at the highest open level (on Abyss or harder) opens the next. Rules stack: Ascension 7
 * plays with rules 1 through 7.
 */
export type AscensionRule =
  | 'hp10' | 'eliteMod' | 'speed8' | 'heal30' | 'boss20' | 'reroll' | 'breach15' | 'spawn10' | 'hull15' | 'miniboss'
  | 'traits' | 'starfall' | 'hp15' | 'xp10' | 'enrage' | 'projectiles' | 'eliteRegen' | 'relic2' | 'hp20' | 'thirdBoss';

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
