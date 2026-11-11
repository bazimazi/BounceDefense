import { t } from '../i18n';
import { localize } from '../i18n/content';
import type { Modifier } from '../sim/stats';
import type { Profile, RunSummary, Unlock } from '../meta/types';
import { CORES, TRAILS } from './balls';
import { APEX_BOSSES, BOSSES } from './enemies';
import { UPGRADE_MAP } from './upgrades';

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
  { id: 'pyromaniac', name: 'Pyromaniac', icon: '🔥', desc: 'Kill 200 enemies with fire.', progress: (p) => [p.stats.fireKills, 200], rewards: [{ type: 'upgrade', id: 'wildfire' }, { type: 'upgrade', id: 'melt' }, { type: 'cosmetic', id: 'ember' }] },
  { id: 'shatterer', name: 'Shatterer', icon: '🧊', desc: 'Freeze 100 enemies.', progress: (p) => [p.stats.frozen, 100], rewards: [{ type: 'upgrade', id: 'permafrost' }, { type: 'cosmetic', id: 'aurora' }] },
  { id: 'blood_bank', name: 'Blood Bank', icon: '🩸', desc: 'Heal 300 HP in total.', progress: (p) => [p.stats.healed, 300], rewards: [{ type: 'part', id: 'shell_spiked' }] },
  { id: 'hoarder', name: 'Hoarder', icon: '💰', desc: 'Earn 3,000 coins in total.', progress: (p) => [p.stats.coinsEarned, 3000], rewards: [{ type: 'upgrade', id: 'greed' }] },
  { id: 'hyperball', name: 'Hyperball', icon: '🌠', desc: 'Reach Hyper momentum.', progress: (p) => [p.stats.maxMomentumTier, 3], rewards: [{ type: 'part', id: 'mom_flywheel' }] },
  { id: 'unstable', name: 'Unstable', icon: '☢️', desc: 'Reach Unstable momentum.', progress: (p) => [p.stats.maxMomentumTier, 4], rewards: [{ type: 'part', id: 'mom_stabilizer' }] },
  { id: 'evolved', name: 'Evolved', icon: '🧬', desc: 'Evolve your ball.', progress: (p) => [p.stats.evolutions, 1], rewards: [{ type: 'research', amount: 3 }, { type: 'cosmetic', id: 'prism' }] },
  { id: 'storm_caller', name: 'Storm Caller', icon: '🌩️', desc: 'Kill 250 enemies with lightning.', progress: (p) => [p.stats.lightningKills, 250], rewards: [{ type: 'research', amount: 3 }] },
  { id: 'elite_hunter', name: 'Elite Hunter', icon: '🏹', desc: 'Kill 25 elites.', progress: (p) => [p.stats.elitesKilled, 25], rewards: [{ type: 'upgrade', id: 'bounty_hunter' }, { type: 'cores', amount: 3 }] },
  { id: 'champion', name: 'Champion', icon: '🏆', desc: 'Win 5 runs.', progress: (p) => [p.stats.wins, 5], rewards: [{ type: 'cosmetic', id: 'gold' }, { type: 'cores', amount: 3 }] },
  { id: 'first_thousand', name: 'Thousand Cuts', icon: '⚔️', desc: 'Destroy 1,000 enemies.', progress: (p) => [p.stats.kills, 1000], rewards: [{ type: 'upgrade', id: 'flow_guard' }, { type: 'cores', amount: 3 }] },
  { id: 'slayer', name: 'Slayer', icon: '☠️', desc: 'Destroy 10,000 enemies.', progress: (p) => [p.stats.kills, 10000], rewards: [{ type: 'cosmetic', id: 'nebula' }, { type: 'cores', amount: 5 }] },
  { id: 'toxicologist', name: 'Toxicologist', icon: '🧪', desc: 'Kill 300 enemies with poison.', progress: (p) => [p.stats.poisonKills, 300], rewards: [{ type: 'upgrade', id: 'miasma' }, { type: 'part', id: 'shell_toxic' }] },
  { id: 'veteran_pilot', name: 'Veteran Pilot', icon: '🎖️', desc: 'Play 25 runs.', progress: (p) => [p.stats.runs, 25], rewards: [{ type: 'part', id: 'shell_phase' }] },
  { id: 'dedicated', name: 'Dedicated', icon: '📅', desc: 'Play 100 runs.', progress: (p) => [p.stats.runs, 100], rewards: [{ type: 'cosmetic', id: 'celestial' }, { type: 'research', amount: 5 }] },
  { id: 'conqueror', name: 'Conqueror', icon: '🏰', desc: 'Win 25 runs.', progress: (p) => [p.stats.wins, 25], rewards: [{ type: 'cores', amount: 6 }] },
  { id: 'warlord', name: 'Warlord', icon: '⚜️', desc: 'Win 100 runs.', progress: (p) => [p.stats.wins, 100], rewards: [{ type: 'research', amount: 10 }, { type: 'cores', amount: 10 }] },
  { id: 'boss_hunter', name: 'Boss Hunter', icon: '🎯', desc: 'Defeat 10 bosses.', progress: (p) => [Object.values(p.bossKills).reduce((a, b) => a + b, 0), 10], rewards: [{ type: 'relic', id: 'giant_killer' }] },
  { id: 'pantheon', name: 'Pantheon', icon: '🏛️', desc: 'Defeat all six bosses.', progress: (p) => [BOSSES.filter((b) => (p.bossKills[b.id] ?? 0) > 0).length, BOSSES.length], rewards: [{ type: 'relic', id: 'infinity_loop' }, { type: 'cores', amount: 5 }] },
  { id: 'cartographer', name: 'Cartographer', icon: '🗺️', desc: 'Visit all six arenas.', progress: (p) => [p.discoveries.arenas.length, 6], rewards: [{ type: 'cosmetic', id: 'frost' }, { type: 'research', amount: 3 }] },
  { id: 'relic_collector', name: 'Relic Collector', icon: '🏺', desc: 'Discover 10 relics.', progress: (p) => [p.discoveries.relics?.length ?? 0, 10], rewards: [{ type: 'relic', id: 'chaos_die' }] },
  { id: 'relic_hoarder', name: 'Relic Hoarder', icon: '🗝️', desc: 'Discover 25 relics.', progress: (p) => [p.discoveries.relics?.length ?? 0, 25], rewards: [{ type: 'cores', amount: 8 }] },
  { id: 'ascendant', name: 'Ascendant', icon: '🔆', desc: 'Win a run on Ascension 1.', progress: (p) => [p.stats.maxAscension, 1], rewards: [{ type: 'research', amount: 5 }] },
  { id: 'combo_god', name: 'Combo God', icon: '🌟', desc: 'Reach a 250 combo.', progress: (p) => [p.stats.bestCombo, 250], rewards: [{ type: 'cosmetic', id: 'storm' }] },
  { id: 'evolution_master', name: 'Evolution Master', icon: '🧬', desc: 'Evolve your ball 10 times.', progress: (p) => [p.stats.evolutions, 10], rewards: [{ type: 'part', id: 'impact_gravity' }] },
  { id: 'ricochet_virtuoso', name: 'Ricochet Virtuoso', icon: '🎱', desc: '40 wall bounces in a single flight.', progress: (p) => [p.stats.maxWallChain, 40], rewards: [{ type: 'part', id: 'mom_gyro' }] },
  { id: 'stargazer', name: 'Stargazer', icon: '🌠', desc: 'Call 50 Starfalls.', progress: (p) => [p.stats.starfalls, 50], rewards: [{ type: 'part', id: 'mom_resonant' }] },
  { id: 'gold_rush', name: 'Gold Rush', icon: '✨', desc: 'Catch 20 golden wisps.', progress: (p) => [p.stats.goldenCaught, 20], rewards: [{ type: 'coins', amount: 2000 }] },
  { id: 'deep_freeze', name: 'Deep Freeze', icon: '❄️', desc: 'Freeze 1,000 enemies.', progress: (p) => [p.stats.frozen, 1000], rewards: [{ type: 'relic', id: 'frost_crown' }] },
  { id: 'arsonist', name: 'Arsonist', icon: '🔥', desc: 'Kill 2,000 enemies with fire.', progress: (p) => [p.stats.fireKills, 2000], rewards: [{ type: 'relic', id: 'ember_heart' }] },
  { id: 'thunder_lord', name: 'Thunder Lord', icon: '⚡', desc: 'Kill 2,000 enemies with lightning.', progress: (p) => [p.stats.lightningKills, 2000], rewards: [{ type: 'relic', id: 'storm_rod' }] },
  { id: 'plague_lord', name: 'Plague Lord', icon: '☣️', desc: 'Kill 2,000 enemies with poison.', progress: (p) => [p.stats.poisonKills, 2000], rewards: [{ type: 'relic', id: 'venom_gland' }] },
  { id: 'elite_slayer', name: 'Elite Slayer', icon: '🏹', desc: 'Kill 200 elites.', progress: (p) => [p.stats.elitesKilled, 200], rewards: [{ type: 'relic', id: 'soul_lantern' }] },
  { id: 'apex_hunter', name: 'Apex Hunter', icon: '🗿', desc: 'Defeat an apex boss.', progress: (p) => [apexKills(p), 1], rewards: [{ type: 'research', amount: 4 }, { type: 'cores', amount: 5 }] },
  { id: 'apex_pantheon', name: 'Apex Pantheon', icon: '🌌', desc: 'Defeat all four apex bosses.', progress: (p) => [APEX_BOSSES.filter((b) => (p.bossKills[b.id] ?? 0) > 0).length, APEX_BOSSES.length], rewards: [{ type: 'research', amount: 8 }, { type: 'cores', amount: 20 }] },
  { id: 'apex_slayer', name: 'Apex Slayer', icon: '⚔️', desc: 'Defeat 25 apex bosses.', progress: (p) => [apexKills(p), 25], rewards: [{ type: 'research', amount: 10 }, { type: 'cores', amount: 25 }] },
  { id: 'hivemind', name: 'Hivemind', icon: '🐝', desc: 'Have 14 balls in flight at once.', progress: (p) => [p.stats.maxBallsInFlight, 14], rewards: [{ type: 'relic', id: 'echo_bell' }, { type: 'relic', id: 'hydra_tooth' }] },
];

export function apexKills(p: Profile): number {
  return APEX_BOSSES.reduce((n, b) => n + (p.bossKills[b.id] ?? 0), 0);
}

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
  { id: 'minimalist', name: 'Minimalist', icon: '1️⃣', desc: 'Win with the Lone Ball pact, never owning more than one ball.', check: (s) => s.victory && s.maxBallsOwned <= 1, rewards: [{ type: 'cosmetic', id: 'void' }, { type: 'cores', amount: 2 }] },
  { id: 'swarm', name: 'Swarm', icon: '🐝', desc: 'Have 10 balls in flight at once.', check: (s) => s.maxBallsInFlight >= 10, rewards: [{ type: 'cores', amount: 3 }] },
  { id: 'glass_cannon', name: 'Glass Cannon', icon: '💔', desc: 'Win with the Glass Heart pact.', check: (s) => s.victory && s.pacts.includes('fragile'), rewards: [{ type: 'research', amount: 4 }] },
  { id: 'combo_king', name: 'Combo King', icon: '👑', desc: 'Reach a 150 combo.', check: (s) => s.bestCombo >= 150, rewards: [{ type: 'coins', amount: 500 }] },
  { id: 'evolutionist', name: 'Evolutionist', icon: '🧬', desc: 'Evolve twice in one run.', check: (s) => s.evolutions.length >= 2, rewards: [{ type: 'research', amount: 4 }] },
  { id: 'elementalist', name: 'Elementalist', icon: '🔺', desc: 'Trigger all three elemental reactions in one run.', check: (s) => s.reactions.length >= 3, rewards: [{ type: 'research', amount: 4 }] },
  { id: 'demolition_expert', name: 'Demolition Expert', icon: '🛢️', desc: 'Detonate 25 barrels in one run.', check: (s) => s.barrelsExploded >= 25, rewards: [{ type: 'coins', amount: 400 }] },
  { id: 'iron_wall', name: 'Iron Wall', icon: '🧱', desc: 'Win on Veteran or higher.', check: (s) => s.victory && s.difficulty >= 1, rewards: [{ type: 'cores', amount: 5 }] },
  { id: 'nightmare_slayer', name: 'Nightmare Slayer', icon: '😈', desc: 'Win on Nightmare or higher.', check: (s) => s.victory && s.difficulty >= 2, rewards: [{ type: 'cosmetic', id: 'crimson' }, { type: 'cores', amount: 8 }] },
  { id: 'lucky_catch', name: 'Lucky Catch', icon: '✨', desc: 'Catch 3 golden wisps in one run.', check: (s) => s.goldenCaught >= 3, rewards: [{ type: 'coins', amount: 600 }] },
  { id: 'toxic_run', name: 'Toxic Avenger', icon: '🧪', desc: 'Kill 150 enemies with poison in one run.', check: (s) => (s.poisonKills ?? 0) >= 150, rewards: [{ type: 'cores', amount: 3 }] },
  { id: 'relic_trove', name: 'Relic Trove', icon: '🏺', desc: 'Hold 4 relics in one run.', check: (s) => (s.relics?.length ?? 0) >= 4, rewards: [{ type: 'coins', amount: 800 }] },
  { id: 'flawless_boss', name: 'Flawless', icon: '💠', desc: 'Defeat a boss without taking damage during the fight.', check: (s) => s.bossNoDamage, rewards: [{ type: 'cores', amount: 3 }] },
  { id: 'blight_win', name: 'Blight Cleanser', icon: '🌿', desc: 'Win in The Blight.', check: (s) => s.victory && s.arena === 'blight', rewards: [{ type: 'cores', amount: 4 }] },
  { id: 'spire_win', name: 'Timekeeper', icon: '⌛', desc: 'Win in the Chrono Spire.', check: (s) => s.victory && s.arena === 'spire', rewards: [{ type: 'cores', amount: 4 }] },
  { id: 'citadel_win', name: 'Siege Breaker', icon: '🏰', desc: 'Win in The Citadel.', check: (s) => s.victory && s.arena === 'citadel', rewards: [{ type: 'cores', amount: 5 }, { type: 'research', amount: 3 }] },
  { id: 'inferno_slayer', name: 'Into the Fire', icon: '🌋', desc: 'Win on Inferno or higher.', check: (s) => s.victory && s.difficulty >= 3, rewards: [{ type: 'cores', amount: 10 }] },
  { id: 'abyss_slayer', name: 'Abyss Walker', icon: '🕳️', desc: 'Win on Abyss.', check: (s) => s.victory && s.difficulty >= 4, rewards: [{ type: 'cosmetic', id: 'abyssal' }, { type: 'cores', amount: 12 }] },
  { id: 'ascension_5', name: 'Rising', icon: '🔆', desc: 'Win on Ascension 5 or higher.', check: (s) => s.victory && (s.ascension ?? 0) >= 5, rewards: [{ type: 'relic', id: 'cursed_crown' }, { type: 'research', amount: 6 }] },
  { id: 'ascension_10', name: 'Transcendent', icon: '🌞', desc: 'Win on Ascension 10 or higher.', check: (s) => s.victory && (s.ascension ?? 0) >= 10, rewards: [{ type: 'cores', amount: 15 }] },
  { id: 'ascension_20', name: 'Apex', icon: '👁️', desc: 'Win on Ascension 20.', check: (s) => s.victory && (s.ascension ?? 0) >= 20, rewards: [{ type: 'cosmetic', id: 'ascendant' }, { type: 'cores', amount: 25 }] },
  { id: 'pact_master', name: 'Pact Master', icon: '📜', desc: 'Win with 3 or more Risk Pacts.', check: (s) => s.victory && s.pacts.length >= 3, rewards: [{ type: 'cores', amount: 6 }] },
  { id: 'blitz', name: 'Blitz', icon: '⚡', desc: 'Win a run in 7:30 or less.', check: (s) => s.victory && s.time <= 450, rewards: [{ type: 'research', amount: 4 }] },
  { id: 'level_30', name: 'Ascended Build', icon: '⬆️', desc: 'Reach level 30 in one run.', check: (s) => s.level >= 30, rewards: [{ type: 'coins', amount: 1000 }] },
  { id: 'endless_10', name: 'Unending', icon: '♾️', desc: 'Survive 10 minutes of Endless.', check: (s) => (s.endlessTime ?? 0) >= 600, rewards: [{ type: 'cores', amount: 6 }] },
  { id: 'triple_evo', name: 'Metamorphosis', icon: '🦋', desc: 'Evolve three times in one run.', check: (s) => s.evolutions.length >= 3, rewards: [{ type: 'research', amount: 6 }] },
  { id: 'reaction_master', name: 'Alchemist', icon: '⚗️', desc: 'Trigger all six elemental reactions in one run.', check: (s) => s.reactions.length >= 6, rewards: [{ type: 'research', amount: 6 }] },
  { id: 'golden_rush', name: 'Midas', icon: '🪙', desc: 'Catch 6 golden wisps in one run.', check: (s) => s.goldenCaught >= 6, rewards: [{ type: 'coins', amount: 1500 }] },
  { id: 'purist', name: 'Purist', icon: '🕊️', desc: 'Win with 5 or fewer different upgrades.', check: (s) => s.victory && s.upgrades.length <= 5, rewards: [{ type: 'cores', amount: 5 }] },
  { id: 'oblivion_slayer', name: 'Beyond the Abyss', icon: '🌀', desc: 'Win on Oblivion or higher.', check: (s) => s.victory && s.difficulty >= 5, rewards: [{ type: 'cores', amount: 15 }, { type: 'research', amount: 5 }] },
  { id: 'cataclysm_slayer', name: 'Stormbreaker', icon: '☄️', desc: 'Win on Cataclysm or higher.', check: (s) => s.victory && s.difficulty >= 6, rewards: [{ type: 'cores', amount: 18 }, { type: 'research', amount: 6 }] },
  { id: 'singularity_slayer', name: 'Event Horizon', icon: '⚫', desc: 'Win on Singularity or higher.', check: (s) => s.victory && s.difficulty >= 7, rewards: [{ type: 'cores', amount: 22 }, { type: 'research', amount: 8 }] },
  { id: 'pandemonium_slayer', name: 'Chaos Tamer', icon: '🎭', desc: 'Win on Pandemonium or higher.', check: (s) => s.victory && s.difficulty >= 8, rewards: [{ type: 'cores', amount: 26 }, { type: 'research', amount: 10 }] },
  { id: 'eternity_slayer', name: 'Eternal', icon: '💫', desc: 'Win on Eternity.', check: (s) => s.victory && s.difficulty >= 9, rewards: [{ type: 'cores', amount: 35 }, { type: 'research', amount: 12 }] },
  { id: 'combo_300', name: 'Combo Legend', icon: '🎇', desc: 'Reach a 300 combo.', check: (s) => s.bestCombo >= 300, rewards: [{ type: 'research', amount: 5 }] },
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
  /** Advanced and Apex branches: what must be won (difficulty index) or defeated before it can be studied. */
  gate?: { win?: number; apex?: boolean };
  branch?: 'advanced' | 'apex';
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
  { id: 'toxicology', name: 'Toxicology', icon: '🧪', desc: 'Adds Venom Tip (Poison) to the upgrade pool.', cost: 2, requires: [], grants: [{ type: 'upgrade', id: 'venom' }] },
  { id: 'virology', name: 'Virology', icon: '🦠', desc: 'Adds Virulence and Contagion to the pool.', cost: 3, requires: ['toxicology'], grants: [{ type: 'upgrade', id: 'virulence' }, { type: 'upgrade', id: 'contagion' }] },
  { id: 'hemostatics', name: 'Hemostatics', icon: '🩹', desc: 'Adds Bloodletting to the pool.', cost: 3, requires: ['blood_arts'], grants: [{ type: 'upgrade', id: 'bloodletting' }] },
  { id: 'cryo_dynamics', name: 'Cryodynamics', icon: '🥶', desc: 'Adds Cold Snap to the pool.', cost: 3, requires: ['cryogenics'], grants: [{ type: 'upgrade', id: 'cold_snap' }] },
  { id: 'ordnance', name: 'Ordnance', icon: '🧷', desc: 'Adds Mine Layer to the pool.', cost: 3, requires: ['demolitions'], grants: [{ type: 'upgrade', id: 'mine_layer' }] },
  { id: 'relic_lore', name: 'Relic Lore', icon: '📜', desc: 'Relic caches offer 4 choices instead of 3.', cost: 3, requires: [], grants: [{ type: 'flag', id: 'relic4' }] },
  { id: 'relic_hunter', name: 'Relic Hunter', icon: '🗝️', desc: 'Elites have a small chance to drop a relic cache.', cost: 4, requires: ['relic_lore'], grants: [{ type: 'flag', id: 'relichunt' }] },
  { id: 'reroll_3', name: 'Reroll Insight', icon: '🎲', desc: '+1 more reroll per run.', cost: 5, requires: ['reroll_2'], grants: [{ type: 'flag', id: 'reroll3' }] },
  { id: 'banish_2', name: 'Exile', icon: '🚫', desc: '+1 banish per run.', cost: 4, requires: ['banish'], grants: [{ type: 'flag', id: 'banish2' }] },
  { id: 'prospecting', name: 'Prospecting', icon: '⛏️', desc: 'Golden wisps appear more often.', cost: 2, requires: [], grants: [{ type: 'flag', id: 'prospect' }] },
  { id: 'field_medic', name: 'Field Medic', icon: '🩺', desc: 'Repair cards restore 50% hull instead of 30%.', cost: 3, requires: [], grants: [{ type: 'flag', id: 'medic' }] },
  { id: 'tactics', name: 'Tactics', icon: '♟️', desc: 'Tactical Recall recharges 2 seconds faster.', cost: 3, requires: [], grants: [{ type: 'flag', id: 'tactics' }] },
  { id: 'chronometry', name: 'Chronometry', icon: '📡', desc: 'Aim preview shows one more bounce.', cost: 4, requires: ['extended_scope'], grants: [{ type: 'flag', id: 'scope2' }] },
  { id: 'surge_study', name: 'Surge Theory', icon: '⚡', desc: 'Surge charges 15% faster.', cost: 3, requires: [], grants: [{ type: 'flag', id: 'surge1' }] },
  { id: 'deep_salvage', name: 'Deep Salvage', icon: '💠', desc: '+1 Core from every victory.', cost: 4, requires: ['elite_bounty'], grants: [{ type: 'flag', id: 'salvage' }] },
  { id: 'mastery_study', name: 'Mastery Study', icon: '🎓', desc: '+15% Mastery and Pilot Rank XP.', cost: 4, requires: [], grants: [{ type: 'flag', id: 'mastery' }] },
  { id: 'gravitics', name: 'Gravitics', icon: '🌪️', desc: 'Adds Vortex Core to the pool.', cost: 3, requires: [], grants: [{ type: 'upgrade', id: 'vortex' }] },
  { id: 'acoustics', name: 'Acoustics', icon: '🔊', desc: 'Adds Thunderclap and Pinball Wizard to the pool.', cost: 3, requires: ['geometry'], grants: [{ type: 'upgrade', id: 'thunderclap' }, { type: 'upgrade', id: 'pinball_wizard' }] },
  { id: 'prismatics', name: 'Prismatics', icon: '🔆', desc: 'Adds Refraction to the pool.', cost: 3, requires: ['multiball'], grants: [{ type: 'upgrade', id: 'refraction' }] },
  { id: 'field_electrics', name: 'Field Electrics', icon: '🔋', desc: 'Adds Capacitor and Quick Recall to the pool.', cost: 2, requires: [], grants: [{ type: 'upgrade', id: 'capacitor' }, { type: 'upgrade', id: 'quick_recall' }] },
  { id: 'storm_theory', name: 'Storm Theory', icon: '⛈️', desc: 'Adds Storm Surge to the pool.', cost: 3, requires: [], grants: [{ type: 'upgrade', id: 'storm_surge' }] },
  { id: 'chronomancy', name: 'Chronomancy', icon: '⏱️', desc: 'Adds Time Shot to the pool.', cost: 5, requires: ['field_electrics'], grants: [{ type: 'upgrade', id: 'chrono_shot' }] },
  { id: 'pact_mastery', name: 'Forbidden Pacts', icon: '🩸', desc: 'Four more Risk Pacts become available.', cost: 4, requires: ['risk_pacts'], grants: [{ type: 'flag', id: 'pacts2' }] },
  // ---- Advanced: opened by wins from Veteran to Abyss.
  { id: 'scholarship', branch: 'advanced', gate: { win: 1 }, name: 'Scholarship', icon: '📚', desc: 'Victories pay +1 Research, and +1 more for every three difficulty tiers (up to +4 on Eternity).', cost: 8, requires: [], grants: [{ type: 'flag', id: 'scholar' }] },
  { id: 'gilded_elites', branch: 'advanced', gate: { win: 2 }, name: 'Gilded Elites', icon: '🪙', desc: 'Elites drop 25% more coins.', cost: 8, requires: ['elite_bounty'], grants: [{ type: 'flag', id: 'gilded' }] },
  { id: 'spoils_of_war', branch: 'advanced', gate: { win: 4 }, name: 'Spoils of War', icon: '🏆', desc: 'Every boss you defeat grants a free upgrade choice.', cost: 12, requires: [], grants: [{ type: 'flag', id: 'spoils' }] },
  { id: 'relic_attunement', branch: 'advanced', gate: { win: 3 }, name: 'Relic Attunement', icon: '🔮', desc: 'The first relic cache of every run offers only rare and legendary relics.', cost: 12, requires: ['relic_lore'], grants: [{ type: 'flag', id: 'attune' }] },
  { id: 'sentinel', branch: 'advanced', gate: { win: 4 }, name: 'Sentinel Drone', icon: '🛰️', desc: 'A drone on the line fires a shard at the closest threat every 6 seconds.', cost: 15, requires: [], grants: [{ type: 'flag', id: 'sentinel' }] },
  { id: 'aftershock', branch: 'advanced', gate: { win: 3 }, name: 'Aftershock', icon: '🌋', desc: 'When Surge ends, it fires once more for half its duration.', cost: 15, requires: ['surge_study'], grants: [{ type: 'flag', id: 'aftershock' }] },
  { id: 'midas', branch: 'advanced', gate: { win: 4 }, name: 'Midas Protocol', icon: '👑', desc: 'Runs on Abyss and above pay +15% coins.', cost: 18, requires: ['prospecting'], grants: [{ type: 'flag', id: 'midas' }] },
  { id: 'evo_catalyst', branch: 'advanced', gate: { win: 4 }, name: 'Evolution Catalyst', icon: '⚗️', desc: 'Evolution recipes need one level less of every ingredient that needs two or more.', cost: 20, requires: ['evolution_codex'], grants: [{ type: 'flag', id: 'evocat' }] },
  { id: 'cryostasis', branch: 'advanced', gate: { win: 4 }, name: 'Cryostasis Failsafe', icon: '🧊', desc: 'Once per run, when the line falls below 25% HP, every enemy freezes for 3 seconds (bosses for 1).', cost: 20, requires: ['field_medic'], grants: [{ type: 'flag', id: 'cryostasis' }] },
  // ---- Apex: opened by apex bosses and the tiers beyond Abyss.
  { id: 'trophy_hunter', branch: 'apex', gate: { apex: true }, name: 'Trophy Hunter', icon: '🗿', desc: 'Bosses drop twice the coins, and an apex boss restores 30% of the line when it falls.', cost: 25, requires: [], grants: [{ type: 'flag', id: 'trophy' }] },
  { id: 'twin_sentinels', branch: 'apex', gate: { win: 5 }, name: 'Twin Sentinels', icon: '📡', desc: 'A second Sentinel joins the first, and both fire every 5 seconds.', cost: 35, requires: ['sentinel'], grants: [{ type: 'flag', id: 'sentinel2' }] },
  { id: 'combat_archive', branch: 'apex', gate: { win: 6 }, name: 'Combat Archive', icon: '📖', desc: '+2% damage to elites and bosses for every different boss you have defeated (up to +20%).', cost: 35, requires: [], grants: [{ type: 'flag', id: 'archive' }] },
  { id: 'signature_mastery', branch: 'apex', gate: { win: 6 }, name: 'Signature Mastery', icon: '🌟', desc: "Runs begin with your core's signature upgrade already taken, once Mastery 2 unlocks it.", cost: 40, requires: ['mastery_study'], grants: [{ type: 'flag', id: 'signature' }] },
  { id: 'industrial_theory', branch: 'apex', gate: { win: 7 }, name: 'Industrial Theory', icon: '🏭', desc: 'Every Workshop price is 15% lower.', cost: 50, requires: [], grants: [{ type: 'flag', id: 'industry' }] },
  { id: 'fate_weaving', branch: 'apex', gate: { win: 7 }, name: 'Fate Weaving', icon: '🧵', desc: 'Every level-up draft holds at least one rare or better card.', cost: 50, requires: ['fortune'], grants: [{ type: 'flag', id: 'fate' }] },
  { id: 'core_resonance', branch: 'apex', gate: { win: 8 }, name: 'Core Resonance', icon: '💞', desc: 'Runs also carry half the passive stats of your most-mastered other core.', cost: 60, requires: [], grants: [{ type: 'flag', id: 'echocore' }] },
  { id: 'grand_unification', branch: 'apex', gate: { win: 9 }, name: 'Grand Unification', icon: '🌌', desc: 'Every run begins with a legendary relic choice, and relic caches from bosses offer only rare and legendary relics.', cost: 120,
    requires: ['scholarship', 'gilded_elites', 'spoils_of_war', 'relic_attunement', 'sentinel', 'aftershock', 'midas', 'evo_catalyst', 'cryostasis', 'trophy_hunter', 'twin_sentinels', 'combat_archive', 'signature_mastery', 'industrial_theory', 'fate_weaving', 'core_resonance'],
    grants: [{ type: 'flag', id: 'unified' }] },
];
/** Workshop prices once Industrial Theory is studied. */
export const INDUSTRY_DISCOUNT = 0.15;
/** Sentinel fire interval in seconds: one drone, then two. */
export const SENTINEL_INTERVAL = [6, 5];
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
  /** Overdrive: a long-term line whose open levels grow with the hardest difficulty won. */
  overdrive?: boolean;
  /** Blueprint: the difficulty index that must be won before each level can be bought. */
  tiers?: number[];
  /** Blueprint: another Workshop item that must be owned first. */
  needs?: string;
  /** Refit: the ball core this line tunes; it only applies to runs with that core. */
  core?: string;
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
  { id: 'head_start', name: 'Head Start', icon: '🏁', desc: () => 'Begin each run with a free upgrade choice', maxLevel: 1, cost: () => 900, mods: () => [] },
  // A whole extra ball at launch doubled early damage; raising the ceiling rewards late runs instead.
  { id: 'spare_ball', name: 'Spare Ball', icon: '⚪', desc: () => 'Extra Ball can be taken once more (up to 6 balls)', maxLevel: 1, cost: () => 2500, mods: () => [] },
  { id: 'plating', name: 'Bastion Plating', icon: '🛡️', desc: (l) => `+${l} armor on the defense line`, maxLevel: 3, cost: costCurve(220, 1.9), mods: (l) => [{ stat: 'armor', add: l }] },
  { id: 'coils', name: 'Surge Coils', icon: '🔋', desc: (l) => `Surge charges ${l * 5}% faster`, maxLevel: 4, cost: costCurve(160, 1.7), mods: (l) => [{ stat: 'surgeGain', mult: 0.05 * l }] },
  { id: 'quick_hands', name: 'Quick Hands', icon: '↩️', desc: (l) => `Recall cooldown −${l}s`, maxLevel: 2, cost: costCurve(320, 2), mods: (l) => [{ stat: 'recallCooldown', add: -l }] },
  { id: 'lucky_charm', name: 'Lucky Charm', icon: '🍀', desc: (l) => `+${l} luck: better upgrade and relic rarity`, maxLevel: 2, cost: costCurve(450, 2.2), mods: (l) => [{ stat: 'luck', add: l }] },
  { id: 'relic_cache', name: 'Relic Cache', icon: '🏺', desc: () => 'Begin each run with a relic choice', maxLevel: 1, cost: () => 3500, mods: () => [] },
];

// ---------------------------------------------------------------- overdrive
/**
 * The long road after the Workshop is complete: many small levels with steep prices. Each difficulty
 * won opens OVERDRIVE_PER_TIER more levels of every line, so the coins farmed on easier tiers become
 * the power that beats the next one.
 */
export const OVERDRIVE_PER_TIER = 5;
export const OVERDRIVE_MAX = 50;
const odCost = (base: number) => (lvl: number) => Math.round((base * Math.pow(1.105, lvl) + base * 0.6 * lvl) / 10) * 10;
const pct1 = (v: number) => (Math.round(v * 1000) / 10).toString();

export const OVERDRIVE: WorkshopDef[] = [
  { id: 'od_forge', name: 'Kinetic Forge', icon: '🔨', overdrive: true, desc: (l) => `+${l * 2}% damage`, maxLevel: OVERDRIVE_MAX, cost: odCost(450), mods: (l) => [{ stat: 'damage', mult: 0.02 * l }] },
  { id: 'od_bulwark', name: 'Bulwark Core', icon: '🏯', overdrive: true, desc: (l) => `+${l * 5} max HP`, maxLevel: OVERDRIVE_MAX, cost: odCost(380), mods: (l) => [{ stat: 'maxHp', add: 5 * l }] },
  { id: 'od_aegis', name: 'Aegis Lattice', icon: '💠', overdrive: true, desc: (l) => `−${pct1(l * 0.008)}% damage taken on the line`, maxLevel: OVERDRIVE_MAX, cost: odCost(420), mods: (l) => [{ stat: 'damageTaken', mult: -0.008 * l }] },
  { id: 'od_breaker', name: 'Titan Breaker', icon: '🪓', overdrive: true, desc: (l) => `+${l * 2}% damage to elites and bosses`, maxLevel: OVERDRIVE_MAX, cost: odCost(420), mods: (l) => [{ stat: 'eliteDamage', add: 0.02 * l }] },
  { id: 'od_focus', name: 'Focus Lens', icon: '🔍', overdrive: true, desc: (l) => `+${l * 3}% critical damage`, maxLevel: OVERDRIVE_MAX, cost: odCost(340), mods: (l) => [{ stat: 'critMult', add: 0.03 * l }] },
  { id: 'od_infusion', name: 'Elemental Infusion', icon: '⚗️', overdrive: true, desc: (l) => `+${l * 2}% elemental power`, maxLevel: OVERDRIVE_MAX, cost: odCost(340), mods: (l) => [{ stat: 'elementPower', mult: 0.02 * l }] },
  { id: 'od_detonator', name: 'Detonator', icon: '🧨', overdrive: true, desc: (l) => `+${l * 2}% explosion damage`, maxLevel: OVERDRIVE_MAX, cost: odCost(300), mods: (l) => [{ stat: 'explosionDamage', mult: 0.02 * l }] },
  { id: 'od_swarm', name: 'Swarm Foundry', icon: '🧬', overdrive: true, desc: (l) => `+${pct1(l * 0.006)}% shard and clone power`, maxLevel: OVERDRIVE_MAX, cost: odCost(300), mods: (l) => [{ stat: 'shardPower', add: 0.006 * l }] },
  { id: 'od_tempo', name: 'Tempo Engine', icon: '⏩', overdrive: true, desc: (l) => `+${l}% XP and +${l}% Surge charge`, maxLevel: OVERDRIVE_MAX, cost: odCost(340), mods: (l) => [{ stat: 'xpGain', mult: 0.01 * l }, { stat: 'surgeGain', mult: 0.01 * l }] },
  { id: 'od_treasury', name: 'Treasury', icon: '🏦', overdrive: true, desc: (l) => `+${l * 2}% coins`, maxLevel: OVERDRIVE_MAX, cost: odCost(380), mods: (l) => [{ stat: 'coinGain', mult: 0.02 * l }] },
];

// ---------------------------------------------------------------- blueprints
/**
 * Mechanics bought with coins. Each level is gated by a difficulty won, so the price list grows with
 * the player: a few thousand coins after the first wins, hundreds of thousands near Eternity.
 */
const prices = (list: number[]) => (lvl: number) => list[Math.min(lvl, list.length - 1)];
const bp = (d: Omit<WorkshopDef, 'cost' | 'maxLevel'> & { prices: number[]; tiers: number[] }): WorkshopDef => {
  const { prices: list, ...rest } = d;
  return { ...rest, maxLevel: list.length, cost: prices(list) };
};
/** Second Wind: hull restored, by level, when the line first falls in a run. */
export const SECOND_WIND = [0.25, 0.4, 0.55];
/** Level-up drafts never show more cards than this. */
export const MAX_DRAFT_CARDS = 5;
/** Overdrive levels each Overdrive Catalyst level opens ahead of the difficulty gate. */
export const CATALYST_LEVELS = 5;

export const BLUEPRINTS: WorkshopDef[] = [
  bp({ id: 'bp_mentor', name: 'Mentor Program', icon: '🎓', tiers: [0, 1, 3], prices: [2000, 6500, 18000],
    desc: (l) => `+${l * 10}% Mastery and Pilot Rank XP`, mods: () => [] }),
  bp({ id: 'bp_draft', name: 'Draft Table', icon: '🗂️', tiers: [1, 2, 4], prices: [1500, 6000, 20000],
    desc: (l) => `+${l} reroll${l > 1 ? 's' : ''} every run`, mods: () => [] }),
  bp({ id: 'bp_primed', name: 'Primed Surge', icon: '🔆', tiers: [1, 2, 3], prices: [2500, 8000, 22000],
    desc: (l) => l >= 3 ? 'Runs begin with Surge fully charged' : `Runs begin with Surge ${Math.round((l / 3) * 100)}% charged`, mods: () => [] }),
  bp({ id: 'bp_nanite', name: 'Nanite Mesh', icon: '🩹', tiers: [2, 4, 6], prices: [4000, 12000, 32000],
    desc: (l) => `The line repairs ${(l * 0.25).toFixed(2)} HP per second`, mods: (l) => [{ stat: 'regen', add: 0.25 * l }] }),
  bp({ id: 'bp_exile', name: 'Exile Ledger', icon: '📕', tiers: [2, 3], prices: [4000, 15000],
    desc: (l) => `+${l} banish${l > 1 ? 'es' : ''} every run: remove an upgrade from the draft for the run`, mods: () => [] }),
  bp({ id: 'bp_launch', name: 'Launch Protocol', icon: '🚀', needs: 'head_start', tiers: [4, 6], prices: [30000, 90000],
    desc: (l) => `Begin each run with ${l} more free upgrade choice${l > 1 ? 's' : ''}`, mods: () => [] }),
  bp({ id: 'bp_breach', name: 'Breach Rounds', icon: '🔩', tiers: [2, 4, 6], prices: [5000, 14000, 36000],
    desc: (l) => `Hits ignore ${l * 2} enemy armor`, mods: (l) => [{ stat: 'armorPen', add: 2 * l }] }),
  bp({ id: 'bp_war_chest', name: 'War Chest', icon: '🏆', tiers: [2, 4, 6], prices: [5000, 18000, 55000],
    desc: (l) => `Victories pay +${l * 10}% coins`, mods: () => [] }),
  bp({ id: 'bp_barrier', name: 'Barrier Projector', icon: '🔷', tiers: [3, 6], prices: [14000, 50000],
    desc: (l) => `A barrier blocks ${l} hit${l > 1 ? 's' : ''} on the line, recharging every 12 seconds`, mods: (l) => [{ stat: 'barrier', add: l }] }),
  bp({ id: 'bp_overkill', name: 'Overkill Relay', icon: '➰', tiers: [3, 5, 7], prices: [7000, 20000, 50000],
    desc: (l) => `${l * 12}% of excess kill damage jumps to a nearby enemy`, mods: (l) => [{ stat: 'overkill', add: 0.12 * l }] }),
  bp({ id: 'bp_relic_vault', name: 'Relic Vault', icon: '🏛️', tiers: [3], prices: [20000],
    desc: () => 'Relic caches offer one more relic to choose from', mods: () => [] }),
  bp({ id: 'bp_second_wind', name: 'Second Wind', icon: '❤️‍🔥', tiers: [4, 6, 8], prices: [25000, 70000, 180000],
    desc: (l) => `Once per run, when the line falls, it holds, restores ${Math.round(SECOND_WIND[l - 1] * 100)}% HP and blasts nearby enemies`, mods: () => [] }),
  bp({ id: 'bp_culling', name: 'Culling Protocol', icon: '☠️', tiers: [4, 6, 8], prices: [16000, 45000, 110000],
    desc: (l) => `Hits finish off non-boss enemies below ${l * 2}% HP`, mods: (l) => [{ stat: 'execute', add: 0.02 * l }] }),
  bp({ id: 'bp_wide_draft', name: 'Wide Draft', icon: '🃏', tiers: [4], prices: [80000],
    desc: () => `Level-up drafts show one more card (up to ${MAX_DRAFT_CARDS})`, mods: () => [] }),
  bp({ id: 'bp_surge_caps', name: 'Surge Capacitors', icon: '⏳', tiers: [5, 7], prices: [40000, 120000],
    desc: (l) => `Surge lasts ${l} second${l > 1 ? 's' : ''} longer`, mods: (l) => [{ stat: 'surgeDuration', add: l }] }),
  bp({ id: 'bp_catalyst', name: 'Overdrive Catalyst', icon: '🧪', tiers: [5, 7], prices: [150000, 450000],
    desc: (l) => `Opens ${l * CATALYST_LEVELS} Overdrive levels ahead of your wins`, mods: () => [] }),
  bp({ id: 'bp_magazine', name: 'Twin Magazine', icon: '🎱', needs: 'spare_ball', tiers: [6], prices: [200000],
    desc: () => 'Extra Ball can be taken once more again (up to 7 balls)', mods: () => [] }),
];

// ---------------------------------------------------------------- refits
/**
 * One line per ball core, applied only to runs with that core. A refit level opens every three
 * Mastery levels of its core, so playing a core is what makes it worth tuning.
 */
export const REFIT_MAX = 10;
export const REFIT_MASTERY_STEP = 3;
const refitCost = (lvl: number) => Math.round((900 * Math.pow(1.4, lvl)) / 10) * 10;
const REFIT_SIGNATURE: Record<string, { text: (l: number) => string; mods: (l: number) => Modifier[]; damage?: number }> = {
  striker: { text: (l) => `+${l}% crit chance after a wall bounce`, mods: (l) => [{ stat: 'bankCrit', add: 0.01 * l }] },
  pyro: { text: (l) => `+${l * 4}% burn damage`, mods: (l) => [{ stat: 'burnPower', mult: 0.04 * l }] },
  tesla: { text: (l) => `+${l * 2}% chain damage`, mods: (l) => [{ stat: 'chainDamage', add: 0.02 * l }] },
  cryo: { text: (l) => `+${pct1(l * 0.025)}% damage to frozen enemies`, mods: (l) => [{ stat: 'frozenVuln', add: 0.025 * l }] },
  blood: { text: (l) => `+${pct1(l * 0.002)}% lifesteal and +${l * 2} max HP`, mods: (l) => [{ stat: 'lifesteal', add: 0.002 * l }, { stat: 'maxHp', add: 2 * l }] },
  void: { text: (l) => `+${pct1(l * 0.02)}% stronger homing`, mods: (l) => [{ stat: 'magnetism', add: 0.006 * l }], damage: 0.03 },
  venom: { text: (l) => `+${l * 3}% poison damage`, mods: (l) => [{ stat: 'poisonPower', mult: 0.03 * l }] },
  titan: { text: (l) => `+${l * 4}% knockback and +${l * 3} max HP`, mods: (l) => [{ stat: 'knockback', mult: 0.04 * l }, { stat: 'maxHp', add: 3 * l }] },
  gemini: { text: (l) => `+${pct1(l * 0.008)}% twin and shard power`, mods: (l) => [{ stat: 'shardPower', add: 0.008 * l }] },
  chrono: { text: (l) => `Surge charges ${l * 2}% faster`, mods: (l) => [{ stat: 'surgeGain', mult: 0.02 * l }] },
};

export const REFITS: WorkshopDef[] = CORES.map((c) => {
  const sig = REFIT_SIGNATURE[c.id];
  const dmg = sig?.damage ?? 0.02;
  return {
    id: `refit_${c.id}`, name: `${c.name.replace(/ Core$/, '')} Refit`, icon: c.icon, core: c.id, maxLevel: REFIT_MAX, cost: refitCost,
    desc: (l: number) => sig ? `+${Math.round(l * dmg * 100)}% damage and ${sig.text(l)}` : `+${Math.round(l * dmg * 100)}% damage`,
    mods: (l: number) => [{ stat: 'damage', mult: dmg * l }, ...(sig ? sig.mods(l) : [])],
  };
});

/** Every purchasable Workshop line: the small classic set, Blueprints, Refits, then Overdrive. */
export const ALL_WORKSHOP: WorkshopDef[] = [...WORKSHOP, ...BLUEPRINTS, ...REFITS, ...OVERDRIVE];
export const WORKSHOP_MAP: Record<string, WorkshopDef> = Object.fromEntries(ALL_WORKSHOP.map((w) => [w.id, w]));

// ---------------------------------------------------------------- mastery
export const MASTERY_MAX = 30;
export const SIGNATURE_UPGRADE: Record<string, string> = {
  striker: 'kinetic_lens', pyro: 'thermal_core', tesla: 'arc_capacitor', cryo: 'glacial_heart', blood: 'sanguine_pact', void: 'event_horizon',
  venom: 'pandemic', titan: 'earthshaker', gemini: 'mirror_image', chrono: 'stasis_field',
};
export const MASTERY_TRAIL: Record<string, string> = {
  striker: 'prism', pyro: 'ember', tesla: 'aurora', cryo: 'aurora', blood: 'crimson', void: 'void',
  venom: 'toxin', titan: 'magma', gemini: 'mirror', chrono: 'chrono',
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
    { level: 2, text: t('mastery.signature', { name: `${UPGRADE_MAP[sig]?.icon ?? ''} ${UPGRADE_MAP[sig]?.name ?? sig}` }), unlocks: [{ type: 'upgrade', id: sig }] },
    { level: 3, text: t('mastery.research2'), unlocks: [{ type: 'research', amount: 2 }] },
    { level: 4, text: t('mastery.trail', { name: TRAILS.find((tr) => tr.id === MASTERY_TRAIL[core])?.name ?? '' }), unlocks: [{ type: 'cosmetic', id: MASTERY_TRAIL[core] }] },
    { level: 5, text: t('mastery.cores2'), unlocks: [{ type: 'cores', amount: 2 }] },
  ];
  for (let l = 6; l <= MASTERY_MAX; l++) {
    if (l % 5 === 0) out.push(l > 20 ? { level: l, text: t('mastery.cores5'), unlocks: [{ type: 'cores', amount: 5 }] } : { level: l, text: t('mastery.cores3'), unlocks: [{ type: 'cores', amount: 3 }] });
    else out.push({ level: l, text: t('mastery.research1'), unlocks: [{ type: 'research', amount: 1 }] });
  }
  return out;
}

// ---------------------------------------------------------------- pilot rank
/** Account-wide level fed by every run's Mastery XP: a bar that always moves. */
export const RANK_MAX = 100;
/** XP needed to go from `rank` to `rank + 1`. */
export const rankXpFor = (rank: number): number => 120 + 20 * rank;

export function rankLevel(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let rem = Math.max(0, xp);
  while (level < RANK_MAX && rem >= rankXpFor(level)) {
    rem -= rankXpFor(level);
    level++;
  }
  return { level, into: rem, need: level >= RANK_MAX ? 0 : rankXpFor(level) };
}

/** Signature unlocks on the road to Rank 100; every rank also pays currency. */
export const RANK_UNLOCKS: Record<number, Unlock[]> = {
  3: [{ type: 'cosmetic', id: 'sunset' }],
  5: [{ type: 'relic', id: 'echo_bell' }],
  8: [{ type: 'relic', id: 'giant_killer' }],
  12: [{ type: 'relic', id: 'soul_lantern' }],
  15: [{ type: 'relic', id: 'hydra_tooth' }],
  20: [{ type: 'relic', id: 'chaos_die' }],
  25: [{ type: 'relic', id: 'ember_heart' }, { type: 'relic', id: 'frost_crown' }],
  30: [{ type: 'relic', id: 'venom_gland' }, { type: 'relic', id: 'storm_rod' }],
  40: [{ type: 'relic', id: 'infinity_loop' }],
  50: [{ type: 'cosmetic', id: 'celestial' }],
  75: [{ type: 'relic', id: 'cursed_crown' }],
  100: [{ type: 'cosmetic', id: 'ascendant' }],
};

export function rankRewards(rank: number): Unlock[] {
  const out: Unlock[] = [{ type: 'coins', amount: 50 + 10 * rank }];
  if (rank % 4 === 0) out.push({ type: 'cores', amount: 2 });
  if (rank % 3 === 0) out.push({ type: 'research', amount: 1 });
  return out.concat(RANK_UNLOCKS[rank] ?? []);
}

localize('achievement', ACHIEVEMENTS, ['name', 'desc']);
localize('challenge', CHALLENGES, ['name', 'desc']);
localize('research', RESEARCH, ['name', 'desc']);
localize('workshop', ALL_WORKSHOP, ['name', 'desc']);
