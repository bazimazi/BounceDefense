import { t } from '../i18n';
import { localize } from '../i18n/content';
import type { Modifier } from '../sim/stats';
import type { Profile, RunSummary, Unlock } from '../meta/types';
import { TRAILS } from './balls';
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
  { id: 'pantheon', name: 'Pantheon', icon: '🏛️', desc: 'Defeat all six bosses.', progress: (p) => [Object.values(p.bossKills).filter((n) => n > 0).length, 6], rewards: [{ type: 'relic', id: 'infinity_loop' }, { type: 'cores', amount: 5 }] },
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
  { id: 'hivemind', name: 'Hivemind', icon: '🐝', desc: 'Have 14 balls in flight at once.', progress: (p) => [p.stats.maxBallsInFlight, 14], rewards: [{ type: 'relic', id: 'echo_bell' }, { type: 'relic', id: 'hydra_tooth' }] },
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
  { id: 'head_start', name: 'Head Start', icon: '🏁', desc: () => 'Begin each run with a free upgrade choice', maxLevel: 1, cost: () => 900, mods: () => [] },
  // A whole extra ball at launch doubled early damage; raising the ceiling rewards late runs instead.
  { id: 'spare_ball', name: 'Spare Ball', icon: '⚪', desc: () => 'Extra Ball can be taken once more (up to 6 balls)', maxLevel: 1, cost: () => 2500, mods: () => [] },
  { id: 'plating', name: 'Bastion Plating', icon: '🛡️', desc: (l) => `+${l} armor on the defense line`, maxLevel: 3, cost: costCurve(220, 1.9), mods: (l) => [{ stat: 'armor', add: l }] },
  { id: 'coils', name: 'Surge Coils', icon: '🔋', desc: (l) => `Surge charges ${l * 5}% faster`, maxLevel: 4, cost: costCurve(160, 1.7), mods: (l) => [{ stat: 'surgeGain', mult: 0.05 * l }] },
  { id: 'quick_hands', name: 'Quick Hands', icon: '↩️', desc: (l) => `Recall cooldown −${l}s`, maxLevel: 2, cost: costCurve(320, 2), mods: (l) => [{ stat: 'recallCooldown', add: -l }] },
  { id: 'lucky_charm', name: 'Lucky Charm', icon: '🍀', desc: (l) => `+${l} luck: better upgrade and relic rarity`, maxLevel: 2, cost: costCurve(450, 2.2), mods: (l) => [{ stat: 'luck', add: l }] },
  { id: 'relic_cache', name: 'Relic Cache', icon: '🏺', desc: () => 'Begin each run with a relic choice', maxLevel: 1, cost: () => 3500, mods: () => [] },
];
export const WORKSHOP_MAP: Record<string, WorkshopDef> = Object.fromEntries(WORKSHOP.map((w) => [w.id, w]));

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
localize('workshop', WORKSHOP, ['name', 'desc']);
