# Bounce Defense

A mobile-first, physics-driven roguelite. You don't control a character: you launch a weaponized ball
and build a machine of destruction around it. It ricochets, crits, burns, freezes, chains lightning,
splits, explodes and evolves, and enemies march down toward your defense line.

Built with TypeScript, Vite and Canvas 2D. It has no runtime dependencies and no art or audio assets:
all visuals are drawn procedurally and all sound is synthesized with WebAudio.

## Running

```bash
npm install
npm run dev        # dev server (open on your phone via the LAN URL)
npm run build      # typecheck + production build to dist/
npm test           # vitest unit + simulation tests
npm run sim -- --runs 20 --core striker,pyro,tesla --arena proving --diff 0 [--full] [--tutorial]
```

Browser smoke test (headless Chrome or Edge, with screenshots and console-error capture):

```bash
npm run build && npx vite preview --port 4173 &
node scripts/smoke.mjs          # writes screenshots to smoke-shots/
node scripts/visual-check.mjs   # responsive layouts, all arenas, motion settings, draw benchmark
node scripts/talent-check.mjs   # talent allocation, saves, refunds, mobile/desktop layouts
```

The visual check accepts `URL`, `SHOTS`, and `CHROME_PATH` environment variables. It captures
320px, 390px and desktop home screens plus seeded enemy/boss fixtures in all three arenas,
and checks that paused drawing does not accumulate ambient particles.

## Visual direction

The interface uses a mint-lit kinetic reactor motif, with an animated core on the launch screen,
layered upgrade cards, segmented hull telemetry, and responsive touch controls. The arenas have
cached hexagonal floors and armored rails: calibration rings in Proving Grounds, furnace channels
in The Foundry, and orbital contours in Void Rift.

Combat uses shaded enemy shells and visors, material details, dimensional ball cores, tapered
energy trails, launcher recoil, rotating bumper mechanisms, ricochet rings, and velocity-stretched
sparks. Ambient emissions are frame-rate independent and stop while paused. The operating system's
reduced-motion preference disables decorative movement and shake; Settings also offers
**Reduce flashes & motion**. All artwork remains procedural, with no downloaded assets or new dependencies.

### Controls

| Action | Touch | Desktop |
| --- | --- | --- |
| Aim | Drag anywhere (or pull back in *Slingshot* mode) | Drag with the mouse |
| Launch | Release | Release |
| Stream fire | Keep holding while balls return | Same |
| Surge | Tap the Surge button when it is charged | `Space` |
| Pause | ❚❚ button | `Esc` / `P` |
| Debug panel | Settings → Debug tools | `` ` `` or `?debug` in the URL |

## What's in the vertical slice

| System | Content |
| --- | --- |
| Ball cores | 6: Striker, Pyro, Tesla, Cryo, Blood, Void. Each has a passive, starting upgrade and mastery track |
| Ball parts | 14 across Shell, Impact and Momentum slots |
| Run upgrades | 45 across offense, physics, multiplication, elemental, defense, utility and core signatures |
| Synergies | 13 (known, hidden and legendary), discovered automatically |
| Evolutions | 6 (Inferno, Tesla Storm, Glacier, Blood Moon, Hydra Swarm, Railgun) |
| Talents | 3 persistent trees, 15 ranked nodes, 3 capstones; shared point budget and free respecs |
| Elemental reactions | 3 (Steam Burst, Overload, Supercharge) |
| Enemies | 12 behaviours plus fragments and a golden wisp; composition squads |
| Elite modifiers | 6, stackable |
| Bosses | 3 scripted mechanical fights: Fortress (rotating shields), Magnetar (gravity and pulses), Hydra (splits) |
| Arenas | 3 with procedural layout variants: bumpers, deflectors, barrels, oil, crates, portals, gravity wells |
| Arena events | 7 (Double Bounce, Ball Frenzy, Jackpot, Overcharge, Blood Moon, Gravity Storm, Blackout) |
| Difficulty | 5 tiers that add rules, plus 6 Risk Pacts that trade challenge for rewards |
| Meta | Coins, Cores and Research; Workshop (capped), Research tree, Mastery 1–20, 17 achievements, 14 challenges, Codex, trails, build presets |
| Modes | Standard run, Endless continuation after a victory, Daily Seed |

Core feel systems: constant-speed readable physics with an aim preview that uses the exact same
reflection code, combo meter with diversity rules, momentum tiers (Charged → Overcharged → Hyper → Unstable),
the Surge active ability, hit-stop and slow-motion moments, pooled particles, aggregated damage numbers,
and layered, voice-limited SFX with adaptive music.

## Talent specializations

Open **Talents** from Home or **Edit talents** during run setup. Spend a shared budget
across three trees: **Kinetics** rewards bank shots and combos, **Conduit** amplifies
elements acquired during the run, and **Warden** improves defense and recovery.
Each tree has five ranked nodes, prerequisite connections, and a distinct capstone.
You start with 3 points and earn another per 500 total Mastery XP across all cores,
up to 15. Existing saves receive credit for their accumulated XP.

Higher tiers require 3 / 8 points in earlier tiers of that tree and a maxed prerequisite.
The 15-point budget allows a focused specialization with supporting talents, but not
two capstones. Changes are a draft until **Apply talents**; Back discards the draft.
Refunds and resets are free between runs. Refunding a prerequisite also refunds
dependent nodes. Each run snapshots the allocation, shown in its pause menu.

Talents spend no Coins, Cores or Research. Their modifiers compose through the existing
stat pipeline, while capstones use isolated effects: wall bounces charge Surge on a
shared cooldown, existing statuses increase direct-hit damage, or low HP reduces
incoming damage. Talents never supply upgrade levels, elemental proc chances, synergy
tags or evolution ingredients. Risk Pacts remain authoritative, including Bloodless
disabling talent regeneration. Saves migrate automatically to version 3.

## Architecture

```
src/
  core/      math, seeded RNG, event bus, spatial hash, analytics event catalogue
  data/      ALL content definitions (upgrades, synergies, evolutions, enemies, arenas, cores, parts, meta)
  sim/       deterministic headless simulation (no DOM)
    world.ts       run state + fixed-step loop (120 Hz)
    physics.ts     ball movement, sub-stepped collisions, fields, aim tracing
    combat.ts      damage pipeline, statuses, reactions, explosions, chains, kills
    behaviors.ts   composable hook registry (onHit/onWall/onKill/onBallTick/onFloor…)
    build.ts       modifier composition -> Stats; synergy detection; build naming
    offers.ts      level-up offer generation (rarity, luck, build affinity, evolutions)
    director.ts    pacing: threat budget, squads, elites, events, bosses, endless
    bosses.ts      boss scripts
    bot.ts         autoplayer for tests and balance simulation
  meta/      profile, save/migration, rewards, unlocks, goals
  render/    canvas renderer + particle pool
  audio/     WebAudio synth SFX and generative music
  ui/        DOM screens (menus, level-up, pause, post-run)
  debug/     in-game debug panel
```

- **The simulation is pure and deterministic.** It never touches the DOM and all randomness goes
  through a seeded `Rng`. It emits `Fx` events that the renderer and audio consume. That's why the same
  code runs in the browser, in vitest and in `npm run sim`.
- **All power is modifiers plus behaviors.** Cores, parts, workshop, upgrades, synergies, evolutions, pacts
  and temporary buffs all contribute `Modifier`s (`add` then multiplicative `mult`) that resolve into
  one `Stats` object. Unique mechanics are `Behavior` hooks keyed by id.
- **Performance.** The sim uses a uniform-grid spatial hash rebuilt each step, sub-stepped continuous
  collision (no tunnelling at any speed), per-depth scratch arrays so there are no allocations in hot loops,
  a bounded proc depth, and a per-step explosion budget. The renderer uses cached glow sprites instead of
  `shadowBlur`, a struct-of-arrays particle pool with priority dropping, and merged damage numbers.
  Static arena architecture is cached separately from live effects. The visual check reports median
  and p95 canvas command submission time with 153 enemies; this is a CPU-side diagnostic, not a GPU
  frame-rate measurement. The full smoke test also exercises live combat under load.

## Adding content

| To add | Do this |
| --- | --- |
| Upgrade | Add an entry to `data/upgrades.ts` (`mods(level)` and/or `behavior`). Set `locked: true` and grant it from research, an achievement or mastery if it should be earned |
| New mechanic | Add a `Behavior` in `sim/behaviors.ts` and reference its id from an upgrade, part, core, synergy or evolution |
| Synergy | `data/synergies.ts`: `requires(buildView)` plus `mods`/`behavior`. Pick a `tier`: known, hidden or legendary |
| Evolution | `data/synergies.ts` `EVOLUTIONS`: a recipe plus a behavior. It is offered automatically when eligible |
| Enemy | `data/enemies.ts`. Reuse an `ai` or add a case in `sim/enemies.ts`, then add it to arena squads |
| Boss | Add an enemy with `boss: true`, a `BossScript` in `sim/bosses.ts`, and an entry in `BOSSES` |
| Arena | `data/arenas.ts`: theme, layout variants, squads, events, boss and unlock requirement |
| Core / part | `data/balls.ts` |
| Achievement / challenge / research / workshop | `data/meta.ts` |

## Save data

`localStorage` is versioned (`SAVE_VERSION`), and `migrate()` deep-merges old saves over current
defaults. Every save keeps a backup copy, and a corrupted save falls back to that backup.

## Analytics hooks

`core/analytics.ts` defines typed events: `RunStarted`, `RunCompleted`, `RunFailed`, `UpgradeSelected`,
`BallUnlocked`, `EvolutionUnlocked`, `BossDefeated`, `ChallengeCompleted`, `MasteryLevelUp`,
`SynergyDiscovered`, `ArenaCompleted` and others. Events currently go to an in-memory log (see the
debug panel). A remote sink can be attached later without touching gameplay code.

## Balancing

`npm run sim` runs the autoplayer (it samples angles with the real aim tracer) and reports win rate,
boss-reach rate, median death time, levels, and how each upgrade correlates with winning.
The bot is intentionally mediocre, and humans should outperform it. Tuning levers live in
`sim/director.ts` (threat rate, timeline), `World.makeEnemy` (HP scaling), `xpForLevel`, and `data/`.

## Roadmap ideas

- Ball roles for multi-ball builds (Bomber, Collector, Healer balls)
- Boss Rush, Challenge Gauntlet and Build Trials modes (the director and seeded RNG already support fixed scenarios)
- More arenas and bosses (the Architect, the Chronarch), and more elements (poison, void)
- Cosmetic impact effects and arena themes
- Capacitor wrapper for app-store builds
