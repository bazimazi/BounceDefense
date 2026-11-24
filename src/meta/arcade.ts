import { t } from '../i18n';
import { CHAPTERS, MAX_STARS, STAGES, STAGE_MAP } from '../data/trickshot';
import type { ArcadeKind, ArcadeResult } from '../sim/arcade';
import { applyUnlock } from './progress';
import { ACHIEVEMENTS } from '../data/meta';
import type { Profile, Unlock } from './types';

/**
 * Arcade progression. Trickshot pays for each new star (more in later chapters) and Research for a
 * perfected chapter; Siege pays for the turns held and for each new record. Both modes have milestones
 * on their totals (stars collected, best Siege) that grant coins, Research and three trails.
 */
export interface ArcadeMilestone {
  id: string;
  mode: ArcadeKind;
  at: number;
  reward: Unlock;
}

export const ARCADE_MILESTONES: ArcadeMilestone[] = [
  { id: 'trick18', mode: 'trickshot', at: 18, reward: { type: 'coins', amount: 600 } },
  { id: 'trick36', mode: 'trickshot', at: 36, reward: { type: 'cosmetic', id: 'trickster' } },
  { id: 'trick54', mode: 'trickshot', at: 54, reward: { type: 'research', amount: 5 } },
  { id: 'trick72', mode: 'trickshot', at: MAX_STARS, reward: { type: 'cosmetic', id: 'kaleido' } },
  { id: 'siege15', mode: 'siege', at: 15, reward: { type: 'coins', amount: 500 } },
  { id: 'siege25', mode: 'siege', at: 25, reward: { type: 'research', amount: 3 } },
  { id: 'siege40', mode: 'siege', at: 40, reward: { type: 'cosmetic', id: 'rampart' } },
  { id: 'siege60', mode: 'siege', at: 60, reward: { type: 'research', amount: 6 } },
  { id: 'rebound3', mode: 'rebound', at: 3, reward: { type: 'coins', amount: 400 } },
  { id: 'rebound6', mode: 'rebound', at: 6, reward: { type: 'research', amount: 3 } },
  { id: 'rebound10', mode: 'rebound', at: 10, reward: { type: 'cosmetic', id: 'ricochet' } },
  { id: 'rebound15', mode: 'rebound', at: 15, reward: { type: 'research', amount: 6 } },
];

/** Coins for each new Trickshot star, by chapter. */
export const STAR_COINS = (chapter: number): number => 20 + 15 * chapter;
/** Research for perfecting a chapter (every stage at three stars). */
export const PERFECT_RESEARCH = (chapter: number): number => 2 * chapter;
/** Siege coins: per turn held, and per turn beyond the old record. */
export const SIEGE_COINS = { turn: 4, record: 10 };
/** Rebound coins: per point of score, per wave reached, and per wave beyond the old record. */
export const REBOUND_COINS = { score: 1 / 80, wave: 6, record: 25 };

export interface ArcadeReport {
  coins: number;
  research: number;
  /** Trickshot: total stars before and after this run, and this stage's stars before it. */
  starsBefore: number;
  starsAfter: number;
  stageBefore: number;
  /** Siege or Rebound: the record before this run, and whether this run set a new one. */
  bestBefore: number;
  newBest: boolean;
  /** A chapter this run perfected. */
  perfected: number | null;
  /** Milestones and other unlocks, described. */
  unlocks: string[];
}

export const arcadeUnlocked = (p: Profile): boolean => p.tutorialDone;

export function totalStars(p: Profile): number {
  let n = 0;
  for (const s of STAGES) n += p.arcade.stars[s.id] ?? 0;
  return n;
}

/** A stage opens once the one before it is cleared. */
export function stageOpen(p: Profile, id: string): boolean {
  const i = STAGES.findIndex((s) => s.id === id);
  return i === 0 || (i > 0 && (p.arcade.stars[STAGES[i - 1].id] ?? 0) > 0);
}

/** The natural stage to play next: the first open one not yet cleared, else the first without three stars. */
export function nextStage(p: Profile): string {
  return (STAGES.find((s) => stageOpen(p, s.id) && (p.arcade.stars[s.id] ?? 0) === 0)
    ?? STAGES.find((s) => stageOpen(p, s.id) && (p.arcade.stars[s.id] ?? 0) < 3) ?? STAGES[STAGES.length - 1]).id;
}

/** The stage after `id`, if there is one and it is open. */
export function stageAfter(p: Profile, id: string): string | null {
  const i = STAGES.findIndex((s) => s.id === id);
  const next = STAGES[i + 1];
  return next && stageOpen(p, next.id) ? next.id : null;
}

export function milestoneProgress(p: Profile, mode: ArcadeKind): number {
  return mode === 'trickshot' ? totalStars(p) : mode === 'rebound' ? p.arcade.reboundBest : p.arcade.siegeBest;
}

export function applyArcade(p: Profile, r: ArcadeResult): ArcadeReport {
  const a = p.arcade;
  const report: ArcadeReport = { coins: 0, research: 0, starsBefore: totalStars(p), starsAfter: 0, stageBefore: 0, bestBefore: r.mode === 'rebound' ? a.reboundBest : a.siegeBest, newBest: false, perfected: null, unlocks: [] };
  a.runs++;
  p.stats.playTime += r.time;
  if (r.mode === 'trickshot' && r.stage && STAGE_MAP[r.stage]) {
    const stage = STAGE_MAP[r.stage];
    const before = a.stars[stage.id] ?? 0;
    report.stageBefore = before;
    const stars = r.cleared ? Math.max(1, Math.min(3, r.stars ?? 1)) : 0;
    if (stars > before) {
      a.stars[stage.id] = stars;
      report.coins += (stars - before) * STAR_COINS(stage.chapter);
    }
    const chapter = CHAPTERS.find((c) => c.n === stage.chapter);
    if (chapter && !a.perfect.includes(chapter.n) && STAGES.filter((s) => s.chapter === chapter.n).every((s) => (a.stars[s.id] ?? 0) >= 3)) {
      a.perfect.push(chapter.n);
      report.research += PERFECT_RESEARCH(chapter.n);
      report.perfected = chapter.n;
    }
  } else if (r.mode === 'rebound') {
    const wave = Math.max(0, Math.floor(r.wave ?? 0));
    const score = Math.max(0, Math.floor(r.score ?? 0));
    report.coins += Math.floor(score * REBOUND_COINS.score) + wave * REBOUND_COINS.wave;
    if (wave > a.reboundBest) {
      report.coins += (wave - a.reboundBest) * REBOUND_COINS.record;
      report.newBest = true;
      a.reboundBest = wave;
    }
    if (score > a.reboundScore) {
      a.reboundScore = score;
      report.newBest = true;
    }
  } else if (r.mode === 'siege') {
    const turns = Math.max(0, Math.floor(r.turns ?? 0));
    report.coins += turns * SIEGE_COINS.turn + Math.max(0, Math.floor(r.coins));
    if (turns > a.siegeBest) {
      report.coins += (turns - a.siegeBest) * SIEGE_COINS.record;
      report.newBest = true;
      a.siegeBest = turns;
    }
  }
  report.starsAfter = totalStars(p);
  p.coins += report.coins;
  p.research += report.research;
  p.stats.coinsEarned += report.coins;
  for (const m of ARCADE_MILESTONES) {
    if (a.milestones.includes(m.id) || milestoneProgress(p, m.mode) < m.at) continue;
    a.milestones.push(m.id);
    const text = applyUnlock(p, m.reward);
    if (text) report.unlocks.push(text);
  }
  // Badges can be earned here too (the Arcade ones, or a coin total the rewards just crossed).
  for (const ach of ACHIEVEMENTS) {
    if (p.achievements.includes(ach.id)) continue;
    const [cur, max] = ach.progress(p);
    if (cur < max) continue;
    p.achievements.push(ach.id);
    report.unlocks.push(t('results.achievementShort', { name: `${ach.icon} ${ach.name}` }));
    for (const u of ach.rewards) {
      const text = applyUnlock(p, u);
      if (text) report.unlocks.push(text);
    }
  }
  return report;
}

/** The milestone's threshold in words: so many stars, or so many turns. */
export function milestoneText(m: ArcadeMilestone): string {
  return m.mode === 'trickshot' ? t('arcade.starReward', { n: m.at }) : m.mode === 'rebound' ? t('arcade.waveReward', { n: m.at }) : t('arcade.turnReward', { n: m.at });
}
