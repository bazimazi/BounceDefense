import { EventBus } from './events';

/**
 * Analytics-ready event catalogue. Nothing is sent anywhere yet; sinks can be
 * attached later (remote endpoint, local balancing log, etc).
 */
export interface AnalyticsEvents {
  RunStarted: { arena: string; difficulty: number; core: string; pacts: string[]; seed: number };
  RunCompleted: { arena: string; difficulty: number; time: number; level: number; kills: number; build: string[] };
  RunFailed: { arena: string; difficulty: number; time: number; level: number; kills: number; build: string[] };
  UpgradeSelected: { id: string; level: number; offered: string[]; runTime: number };
  BallUnlocked: { id: string };
  PartUnlocked: { id: string };
  EvolutionUnlocked: { id: string; runTime: number };
  BossDefeated: { id: string; fightTime: number };
  ChallengeCompleted: { id: string };
  AchievementUnlocked: { id: string };
  MasteryLevelUp: { core: string; level: number };
  SynergyDiscovered: { id: string };
  ArenaCompleted: { arena: string; difficulty: number };
  ResearchPurchased: { id: string };
  WorkshopPurchased: { id: string; level: number };
}

export const analytics = new EventBus<AnalyticsEvents>();

/** In-memory ring buffer sink, handy for the debug panel and balance sessions. */
export const analyticsLog: { name: string; t: number; payload: unknown }[] = [];

const names: (keyof AnalyticsEvents)[] = [
  'RunStarted', 'RunCompleted', 'RunFailed', 'UpgradeSelected', 'BallUnlocked', 'PartUnlocked',
  'EvolutionUnlocked', 'BossDefeated', 'ChallengeCompleted', 'AchievementUnlocked', 'MasteryLevelUp',
  'SynergyDiscovered', 'ArenaCompleted', 'ResearchPurchased', 'WorkshopPurchased',
];
for (const n of names) {
  analytics.on(n, (payload) => {
    analyticsLog.push({ name: n, t: Date.now(), payload });
    if (analyticsLog.length > 300) analyticsLog.shift();
  });
}
