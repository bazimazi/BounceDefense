import type { Modifier } from '../sim/stats';
import type { Profile, RunSummary, Unlock } from '../meta/types';

// ---------------------------------------------------------------- achievements
/** Cumulative goals. They double as a roadmap: every one unlocks new content. */
export interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  progress: (p: Profile) => [number, number];
  rewards: Unlock[];
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_hundred', name: 'First Hundred', icon: '💯', desc: 'Destroy 100 enemies.', progress: (p) => [p.stats.kills, 100], rewards: [{ type: 'part', id: 'shell_titan' }] },
  { id: 'first_boss', name: 'Giant Slayer', icon: '👑', desc: 'Defeat any boss.', progress: (p) => [Object.values(p.bossKills).reduce((a, b) => a + b, 0), 1], rewards: [{ type: 'research', amount: 2 }] },
  { id: 'ricochet_adept', name: 'Ricochet Adept', icon: '🔁', desc: '25 wall bounces in a single flight.', progress: (p) => [p.stats.maxWallChain, 25], rewards: [{ type: 'part', id: 'mom_accel' }] },
  { id: 'demolition', name: 'Demolition', icon: '💥', desc: 'Kill 50 enemies with explosions.', progress: (p) => [p.stats.explosionKills, 50], rewards: [{ type: 'upgrade', id: 'chain_reaction' }, { type: 'part', id: 'impact_concussive' }] },
  { id: 'combo_reactor', name: 'Combo Reactor', icon: '🔗', desc: 'Reach a 60 combo.', progress: (p) => [p.stats.bestCombo, 60], rewards: [{ type: 'upgrade', id: 'combo_engine' }] },
  { id: 'swarm_protocol', name: 'Swarm Protocol', icon: '🐝', desc: 'Have 6 balls in flight at once.', progress: (p) => [p.stats.maxBallsInFlight, 6], rewards: [{ type: 'upgrade', id: 'echo' }, { type: 'part', id: 'impact_split' }] },
  { id: 'elemental_fusion', name: 'Elemental Fusion', icon: '🔮', desc: 'Trigger an elemental reaction.', progress: (p) => [p.discoveries.reactions.length, 1], rewards: [{ type: 'upgrade', id: 'attunement' }] },
  { id: 'pyromaniac', name: 'Pyromaniac', icon: '🔥', desc: 'Kill 200 enemies with fire.', progress: (p) => [p.stats.fireKills, 200], rewards: [{ type: 'upgrade', id: 'wildfire' }, { type: 'cosmetic', id: 'ember' }] },
  { id: 'shatterer', name: 'Shatterer', icon: '🧊', desc: 'Freeze 100 enemies.', progress: (p) => [p.stats.frozen, 100], rewards: [{ type: 'upgrade', id: 'permafrost' }, { type: 'cosmetic', id: 'aurora' }] },
  { id: 'blood_bank', name: 'Blood Bank', icon: '🩸', desc: 'Heal 300 HP in total.', progress: (p) => [p.stats.healed, 300], rewards: [{ type: 'part', id: 'shell_spiked' }] },
  { id: 'hoarder', name: 'Hoarder', icon: '💰', desc: 'Earn 3,000 coins in total.', progress: (p) => [p.stats.coinsEarned, 3000], rewards: [{ type: 'upgrade', id: 'greed' }] },
  { id: 'hyperball', name: 'Hyperball', icon: '🌠', desc: 'Reach Hyper momentum.', progress: (p) => [p.stats.maxMomentumTier, 3], rewards: [{ type: 'part', id: 'mom_flywheel' }] },
  { id: 'unstable', name: 'Unstable', icon: '☢️', desc: 'Reach Unstable momentum.', progress: (p) => [p.stats.maxMomentumTier, 4], rewards: [{ type: 'part', id: 'mom_stabilizer' }] },
  { id: 'evolved', name: 'Evolved', icon: '🧬', desc: 'Evolve your ball.', progress: (p) => [p.stats.evolutions, 1], rewards: [{ type: 'research', amount: 3 }, { type: 'cosmetic', id: 'prism' }] },
  { id: 'storm_caller', name: 'Storm Caller', icon: '🌩️', desc: 'Kill 250 enemies with lightning.', progress: (p) => [p.stats.lightningKills, 250], rewards: [{ type: 'research', amount: 3 }] },
  { id: 'elite_hunter', name: 'Elite Hunter', icon: '🏹', desc: 'Kill 25 elites.', progress: (p) => [p.stats.elitesKilled, 25], rewards: [{ type: 'cores', amount: 3 }] },
  { id: 'champion', name: 'Champion', icon: '🏆', desc: 'Win 5 runs.', progress: (p) => [p.stats.wins, 5], rewards: [{ type: 'cosmetic', id: 'gold' }, { type: 'cores', amount: 3 }] },
];

// ---------------------------------------------------------------- challenges
/** Per-run feats. Completed once, each unlocks something meaningful. */
export interface ChallengeDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  check: (s: RunSummary) => boolean;
  rewards: Unlock[];
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'ricochet_master', name: 'Ricochet Master', icon: '🔁', desc: '50 wall bounces without touching the floor.', check: (s) => s.maxWallChain >= 50, rewards: [{ type: 'research', amount: 3 }] },
  { id: 'pyro_run', name: 'Pyromaniac', icon: '🔥', desc: 'Kill 100 enemies with fire in one run.', check: (s) => s.fireKills >= 100, rewards: [{ type: 'cores', amount: 2 }] },
  { id: 'untouchable', name: 'Untouchable', icon: '🛡️', desc: 'Win a run without taking damage.', check: (s) => s.victory && s.damageTaken <= 0, rewards: [{ type: 'cores', amount: 5 }] },
  { id: 'speed_demon', name: 'Speed Demon', icon: '⏱️', desc: 'Defeat a boss within 75 seconds of its arrival.', check: (s) => s.bossFightTimes.some((t) => t <= 75), rewards: [{ type: 'research', amount: 3 }, { type: 'coins', amount: 300 }] },
  { id: 'minimalist', name: 'Minimalist', icon: '1️⃣', desc: 'Win while never owning more than one ball.', check: (s) => s.victory && s.maxBallsOwned <= 1, rewards: [{ type: 'cosmetic', id: 'void' }, { type: 'cores', amount: 2 }] },
  { id: 'swarm', name: 'Swarm', icon: '🐝', desc: 'Have 10 balls in flight at once.', check: (s) => s.maxBallsInFlight >= 10, rewards: [{ type: 'cores', amount: 3 }] },
  { id: 'glass_cannon', name: 'Glass Cannon', icon: '💔', desc: 'Win with the Glass Heart pact.', check: (s) => s.victory && s.pacts.includes('fragile'), rewards: [{ type: 'research', amount: 4 }] },
  { id: 'combo_king', name: 'Combo King', icon: '👑', desc: 'Reach a 150 combo.', check: (s) => s.bestCombo >= 150, rewards: [{ type: 'coins', amount: 500 }] },
  { id: 'evolutionist', name: 'Evolutionist', icon: '🧬', desc: 'Evolve twice in one run.', check: (s) => s.evolutions.length >= 2, rewards: [{ type: 'research', amount: 4 }] },
  { id: 'elementalist', name: 'Elementalist', icon: '🔺', desc: 'Trigger all three elemental reactions in one run.', check: (s) => s.reactions.length >= 3, rewards: [{ type: 'research', amount: 4 }] },
  { id: 'demolition_expert', name: 'Demolition Expert', icon: '🛢️', desc: 'Detonate 25 barrels in one run.', check: (s) => s.barrelsExploded >= 25, rewards: [{ type: 'coins', amount: 400 }] },
  { id: 'iron_wall', name: 'Iron Wall', icon: '🧱', desc: 'Win on Veteran or higher.', check: (s) => s.victory && s.difficulty >= 1, rewards: [{ type: 'cores', amount: 5 }] },
  { id: 'nightmare_slayer', name: 'Nightmare Slayer', icon: '😈', desc: 'Win on Nightmare or higher.', check: (s) => s.victory && s.difficulty >= 2, rewards: [{ type: 'cosmetic', id: 'crimson' }, { type: 'cores', amount: 8 }] },
  { id: 'lucky_catch', name: 'Lucky Catch', icon: '✨', desc: 'Catch 3 golden wisps in one run.', check: (s) => s.goldenCaught >= 3, rewards: [{ type: 'coins', amount: 600 }] },
];

// ---------------------------------------------------------------- research
/** Research expands the game horizontally: new mechanics and decisions, not bigger numbers. */
export interface ResearchDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  cost: number;
  requires: string[];
  grants: Unlock[];
}

export const RESEARCH: ResearchDef[] = [
  { id: 'cryogenics', name: 'Cryogenics', icon: '❄️', desc: 'Adds Frostbite to the upgrade pool.', cost: 2, requires: [], grants: [{ type: 'upgrade', id: 'frostbite' }] },
  { id: 'blood_arts', name: 'Blood Arts', icon: '🦷', desc: 'Adds Serrated (Bleed) to the upgrade pool.', cost: 2, requires: [], grants: [{ type: 'upgrade', id: 'serrated' }] },
  { id: 'geometry', name: 'Applied Geometry', icon: '📐', desc: 'Adds Bank Shot to the upgrade pool.', cost: 2, requires: [], grants: [{ type: 'upgrade', id: 'bank_shot' }] },
  { id: 'reroll_1', name: 'Reroll Protocol', icon: '🎲', desc: '+1 reroll per run.', cost: 1, requires: [], grants: [{ type: 'flag', id: 'reroll1' }] },
  { id: 'multiball', name: 'Multiball Theory', icon: '✂️', desc: 'Adds Split Shot to the upgrade pool.', cost: 3, requires: [], grants: [{ type: 'upgrade', id: 'splitter' }] },
  { id: 'demolitions', name: 'Demolitions', icon: '🎆', desc: 'Adds Blast Radius to the upgrade pool.', cost: 2, requires: [], grants: [{ type: 'upgrade', id: 'blast_radius' }] },
  { id: 'risk_pacts', name: 'Risk Pacts', icon: '📜', desc: 'Make runs harder for bigger rewards.', cost: 2, requires: [], grants: [{ type: 'flag', id: 'pacts' }] },
  { id: 'evolution_codex', name: 'Evolution Codex', icon: '🧬', desc: 'Upgrade cards show which evolutions they feed.', cost: 2, requires: [], grants: [{ type: 'flag', id: 'codex' }] },
  { id: 'banish', name: 'Banishment', icon: '🚫', desc: '2 banishes per run: remove an upgrade from the pool.', cost: 3, requires: ['reroll_1'], grants: [{ type: 'flag', id: 'banish' }] },
  { id: 'reroll_2', name: 'Reroll Mastery', icon: '🎲', desc: '+1 more reroll per run.', cost: 4, requires: ['reroll_1'], grants: [{ type: 'flag', id: 'reroll2' }] },
  { id: 'lethal_arts', name: 'Lethal Arts', icon: '⚰️', desc: 'Adds Executioner and Overkill to the pool.', cost: 4, requires: ['geometry'], grants: [{ type: 'upgrade', id: 'executioner' }, { type: 'upgrade', id: 'overkill' }] },
  { id: 'elite_bounty', name: 'Elite Bounty', icon: '🏹', desc: 'Elites drop Cores more often.', cost: 3, requires: ['risk_pacts'], grants: [{ type: 'flag', id: 'bounty' }] },
  { id: 'extended_scope', name: 'Extended Scope', icon: '🔭', desc: 'Aim preview shows one more bounce.', cost: 2, requires: [], grants: [{ type: 'flag', id: 'scope' }] },
  { id: 'fortune', name: 'Fortune', icon: '🃏', desc: 'Level-ups offer 4 choices instead of 3.', cost: 6, requires: ['evolution_codex', 'reroll_1'], grants: [{ type: 'flag', id: 'fourth_card' }] },
];
export const RESEARCH_MAP: Record<string, ResearchDef> = Object.fromEntries(RESEARCH.map((r) => [r.id, r]));

// ---------------------------------------------------------------- workshop
/** Deliberately small, capped stat upgrades. Mechanics come from research/unlocks. */
export interface WorkshopDef {
  id: string;
  name: string;
  icon: string;
  desc: (lvl: number) => string;
  maxLevel: number;
  cost: (lvl: number) => number;
  mods: (lvl: number) => Modifier[];
}

const costCurve = (base: number, growth: number) => (lvl: number) => Math.round(base * Math.pow(growth, lvl));

export const WORKSHOP: WorkshopDef[] = [
  { id: 'hull', name: 'Reinforced Line', icon: '🧱', desc: (l) => `+${l * 10} max HP`, maxLevel: 5, cost: costCurve(50, 1.6), mods: (l) => [{ stat: 'maxHp', add: 10 * l }] },
  { id: 'calibration', name: 'Calibration', icon: '🎚️', desc: (l) => `+${l * 4}% damage`, maxLevel: 5, cost: costCurve(60, 1.65), mods: (l) => [{ stat: 'damage', mult: 0.04 * l }] },
  { id: 'optics', name: 'Optics', icon: '🎯', desc: (l) => `+${(l * 1.5).toFixed(1)}% crit chance`, maxLevel: 4, cost: costCurve(80, 1.7), mods: (l) => [{ stat: 'critChance', add: 0.015 * l }] },
  { id: 'overclock', name: 'Overclock', icon: '⚙️', desc: (l) => `+${l * 3}% ball speed`, maxLevel: 3, cost: costCurve(90, 1.8), mods: (l) => [{ stat: 'speed', mult: 0.03 * l }] },
  { id: 'salvage', name: 'Salvage', icon: '🪙', desc: (l) => `+${l * 8}% coins`, maxLevel: 5, cost: costCurve(70, 1.6), mods: (l) => [{ stat: 'coinGain', mult: 0.08 * l }] },
  { id: 'study', name: 'Field Study', icon: '📘', desc: (l) => `+${l * 5}% XP`, maxLevel: 4, cost: costCurve(80, 1.7), mods: (l) => [{ stat: 'xpGain', mult: 0.05 * l }] },
  { id: 'primer', name: 'Momentum Primer', icon: '🌀', desc: (l) => `Balls launch with ${l * 2} momentum`, maxLevel: 3, cost: costCurve(150, 1.9), mods: (l) => [{ stat: 'momentumStart', add: 2 * l }] },
  { id: 'head_start', name: 'Head Start', icon: '🏁', desc: (l) => (l ? 'Begin each run with a free upgrade choice' : 'Begin each run with a free upgrade choice'), maxLevel: 1, cost: () => 900, mods: () => [] },
  { id: 'spare_ball', name: 'Spare Ball', icon: '⚪', desc: () => 'Start every run with +1 ball', maxLevel: 1, cost: () => 2500, mods: (l) => [{ stat: 'maxBalls', add: l }] },
];
export const WORKSHOP_MAP: Record<string, WorkshopDef> = Object.fromEntries(WORKSHOP.map((w) => [w.id, w]));

// ---------------------------------------------------------------- mastery
export const MASTERY_MAX = 20;
export const SIGNATURE_UPGRADE: Record<string, string> = {
  striker: 'kinetic_lens', pyro: 'thermal_core', tesla: 'arc_capacitor', cryo: 'glacial_heart', blood: 'sanguine_pact', void: 'event_horizon',
};
export const MASTERY_TRAIL: Record<string, string> = {
  striker: 'prism', pyro: 'ember', tesla: 'aurora', cryo: 'aurora', blood: 'crimson', void: 'void',
};

/** XP needed to go from `level` to `level + 1`. */
export const masteryXpFor = (level: number): number => Math.round(120 * Math.pow(level, 1.25));

export function masteryLevel(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let rem = xp;
  while (level < MASTERY_MAX && rem >= masteryXpFor(level)) {
    rem -= masteryXpFor(level);
    level++;
  }
  return { level, into: rem, need: level >= MASTERY_MAX ? 0 : masteryXpFor(level) };
}

export interface MasteryReward {
  level: number;
  text: string;
  unlocks: Unlock[];
}

export function masteryRewards(core: string): MasteryReward[] {
  const sig = SIGNATURE_UPGRADE[core];
  const out: MasteryReward[] = [
    { level: 2, text: 'Signature upgrade unlocked', unlocks: [{ type: 'upgrade', id: sig }] },
    { level: 3, text: '+2 Research', unlocks: [{ type: 'research', amount: 2 }] },
    { level: 4, text: 'Mastery trail', unlocks: [{ type: 'cosmetic', id: MASTERY_TRAIL[core] }] },
    { level: 5, text: '+2 Cores', unlocks: [{ type: 'cores', amount: 2 }] },
  ];
  for (let l = 6; l <= MASTERY_MAX; l++) {
    if (l % 5 === 0) out.push({ level: l, text: '+3 Cores', unlocks: [{ type: 'cores', amount: 3 }] });
    else out.push({ level: l, text: '+1 Research', unlocks: [{ type: 'research', amount: 1 }] });
  }
  return out;
}
