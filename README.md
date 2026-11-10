# Bounce Defense

A mobile-first, physics-driven roguelite. You don't control a character: you launch a weaponized ball
and build a machine of destruction around it. It ricochets, crits, burns, freezes, chains lightning,
splits, explodes and evolves, and enemies march down toward your defense line.

Built with TypeScript, Vite and Canvas 2D. It has no runtime dependencies and no art or audio assets:
all visuals are drawn procedurally and all sound is synthesized with WebAudio.
It ships as a web app and, through [Tauri 2](https://v2.tauri.app), as a native app for
Windows, macOS, Linux, Android and iOS.

## Running

```bash
npm install
npm run dev        # dev server (open on your phone via the LAN URL)
npm run build      # typecheck + production build to dist/
npm test           # vitest unit + simulation tests
npm run sim -- --runs 20 --core striker,pyro,tesla --arena proving --diff 0 [--full] [--tutorial]
npm run balance -- --runs 16 --core striker,pyro --diff 0,1,2 [--meta none|mid|max] [--full]
```

Browser smoke test (headless Chrome or Edge, with screenshots and console-error capture):

```bash
npm run build && npx vite preview --port 4173 &
node scripts/smoke.mjs          # writes screenshots to smoke-shots/
node scripts/visual-check.mjs   # responsive layouts, all arenas, draw benchmark
node scripts/resonance-check.mjs # power-shot input, recall controls, circuit and starfall screenshots
npx playwright-core install chromium firefox webkit # install the three test engines once
npm run test:ui                # all three engines: every tab, segment, sheet and overlay plus gameplay flows
npm run test:ui:back           # Back/forward across tabs, sheets, dialogs, paused runs and reload (ENGINE selects browser)
npm run test:ui:motion         # tab/segment transitions, sheets, purchase feedback and the draft deal
npm run test:ui:aim            # board-wide mouse/touch aiming, HUD layers and pointer capture
npm run test:ui:i18n           # Persian: device detection, language picker, every screen, RTL paging, run flow
UI_LANG=fa npm run test:ui:layout # the full layout audit in Persian (right-to-left)
```

The visual check accepts `URL`, `SHOTS`, and `CHROME_PATH` environment variables. It captures
320px, 390px and desktop home screens plus seeded enemy/boss fixtures in all three arenas,
and checks that paused drawing does not accumulate ambient particles.

The Playwright suite runs in Chromium, Firefox and WebKit against dev or production preview (`URL`
defaults to `http://localhost:4173`). It saves the top and end of every page, manageable contact sheets,
a layout report and functional results under `smoke-shots/ui-audit/<engine>/`. Seven viewport sizes cover
small phones, tablet, desktop and phone landscape. Both locked and fully discovered profiles are
reviewed for overflow, actions pushed off screen, undersized touch targets, text under 9.5px, the tab
bar's position, split currency strips, stats and combat HUD collisions. Real touch, mouse and keyboard
checks cover the core carousel, part sheets and purchases, presets, research prerequisites, talents,
saved settings, the arena carousel, pacts, launch/recall/surge, pause/resume, the draft's tap guard,
consecutive upgrade choices, reroll/banish/peek, Play Again, Daily Seed, victory/Endless, rewards, and
reset/abandon dialogs. Swipe handlers are additionally checked with Pointer Events. Set
`ENGINE=chromium|firefox|webkit` to run one engine or `SIZES=320x568;568x320` to narrow the layout audit.
`SHOTS` changes the output root; `AUDIT_ONLY=1` records layout findings without failing;
`OVERLAYS_ONLY=1` reviews the run overlays and HUD. `scripts/ui-helpers.mjs` holds the shared waits and
navigation helpers.

Aiming works across the board and its surrounding play area. Drag anywhere to steer the gun,
then release to launch. Passive HUD layers do not block gestures; buttons and menus retain
their own controls. The aiming check covers mouse, touch, Direct and Slingshot aiming,
portrait/landscape/desktop layouts, and canceling a gesture when pausing or losing capture.

Tab changes slide only the page body while the wallet and tab bar stay put; segments slide their
content, sheets rise from the bottom, and a moving highlight follows the selected tab. Purchases pulse
the changed row and the wallet in place, keeping the scroll position. Input and game state update
immediately during transitions, and departing views cannot intercept clicks or focus. Decorative loops
stop under `prefers-reduced-motion`; instructional motion (the First Contact ghost hand) stays.

Back uses one navigation path for the on-screen arrow, browser/Android browser Back, Escape (P during a run),
and a webview's `backbutton` event. It dismisses the top dialog or sheet first and returns to the page
that opened it. Hub tabs replace one another rather than stacking, so Back from any tab returns to
Battle in one step, and Settings returns to whichever tab or pause menu opened it. During a run,
Back pauses; Back from Pause resumes, preserving pending upgrades and victory choices. Home
keeps the browser/host's normal exit behavior. Finished runs and reloads retire their old history,
so Forward cannot resurrect a run or claim its rewards again. `test:ui:back` exercises these paths
with real history traversal at phone portrait and landscape sizes.
A native wrapper can call `game.ui.back()` (false at Home), or forward a cancelable
`backbutton` event and handle its own exit when the event is not consumed.
The Tauri Android shell needs neither: its Back button walks WebView history, which the game
already manages, and exits at Home.

## Languages

The game ships in English and Persian (فارسی). The first launch follows the device language
(`navigator.language`); afterwards Settings → Language decides, and the choice is saved with the
profile. Persian switches the whole document to right-to-left (`<html lang="fa" dir="rtl">`):
menus use logical CSS properties, card decks page and swipe in the mirrored direction, and the
canvas HUD draws with an RTL base direction. Persian text uses the bundled
[Vazirmatn](https://github.com/rastikerdar/vazirmatn) variable font (`public/fonts/`, SIL OFL),
since the native builds allow only self-hosted fonts. Digits stay Latin.

UI phrases live in `src/i18n/en.ts` and `src/i18n/fa.ts` (`t('key', { params })`); a language must
provide every key or the typecheck fails. Game content stays authored in English in `src/data/`
and is translated through `src/i18n/fa-content.ts`: `localize()` turns the listed fields into
getters that serve the active language, so menus, run banners, build names and the canvas HUD
all switch without touching their call sites. `tests/i18n.test.ts` proves every key, placeholder
and content field is covered; `npm run test:ui:i18n` and `UI_LANG=fa npm run test:ui:layout`
exercise the real UI in Persian. To add a language: register it in `src/i18n/index.ts`, add a
dictionary and a content table, and extend the Settings picker's font rules in `style.css`.

## Native apps (Tauri)

`src-tauri/` wraps the production build (`dist/`) in a native WebView. The game needs no native
APIs, so the Rust side only hosts the window; saves stay in the WebView's `localStorage`, which
persists per install. The app version comes from `package.json`.

### Prerequisites

- Everything in [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS:
  Rust (stable), plus the Visual Studio C++ build tools and WebView2 on Windows, Xcode on macOS,
  or `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev` and `patchelf` on Linux.
- Android: Android Studio or the SDK command-line tools, NDK 27, JDK 17, the four Android Rust
  targets (`rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`),
  and `ANDROID_HOME`, `NDK_HOME` and `JAVA_HOME` set.
- iOS: a Mac with Xcode, CocoaPods and the iOS Rust targets.

### Commands

```bash
npm run app:dev         # desktop window with Vite hot reload
npm run app:build       # desktop installers in src-tauri/target/release/bundle/
npm run android:dev     # emulator or USB device (add -- --open to use Android Studio)
npm run android:build   # signed APK + AAB in src-tauri/gen/android/app/build/outputs/
npm run ios:dev         # simulator or device
npm run ios:build       # IPA for App Store Connect / TestFlight
```

Desktop bundles are MSI and NSIS on Windows, `.app` and DMG on macOS, and AppImage, `.deb` and
`.rpm` on Linux. Each OS builds its own installers; use the release workflow below for all of them.

The Android project in `src-tauri/gen/android` is committed. Its `MainActivity` runs the game
immersive (system bars hidden, camera cutouts padded) on the game's dark background. The iOS
project is not generated yet: run `npx tauri ios init` once on a Mac and commit `src-tauri/gen/apple`.
The WebView needs Canvas `roundRect`, so the minimum OS versions are macOS 13, iOS 16 and Android 7
(API 24) with a current Android System WebView.

### Icons

All platform icons are generated from `public/icon.svg`. After changing it, run
`npx tauri icon public/icon.svg` and commit `src-tauri/icons` and the Android `mipmap-*` folders.

### Android signing

Create an upload key once and keep it out of git:

```bash
keytool -genkey -v -keystore upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Then create `src-tauri/gen/android/keystore.properties` (git-ignored):

```properties
keyAlias=upload
password=<keystore password>
storeFile=<absolute path to upload.jks>
```

Without this file, release builds are unsigned. Debug builds are always signed with the debug key.

### Publishing

`.github/workflows/release.yml` builds every platform into one draft GitHub release.
Bump `version` in `package.json`, commit, then push a matching tag:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

It can also be started from the Actions tab. Desktop jobs run the tests and upload the installers;
the Android job uploads the APK (for sideloading) and AAB (for Google Play). Add these repository
secrets for signed Android builds: `ANDROID_KEY_BASE64` (`base64 -w0 upload.jks`),
`ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. Review the draft, then publish it.

Store submission is manual:

- **Google Play:** upload the AAB to a Play Console release. Android `versionCode` is derived from
  the version, so bump it for every upload.
- **Microsoft Store:** submit the NSIS or MSI installer as a Win32 app.
- **Mac App Store / iOS App Store:** need an Apple Developer account, code signing and
  notarization (see Tauri's [distribution guides](https://v2.tauri.app/distribute/)).
  Unsigned macOS builds open only after the user allows them in System Settings.

## Interface

The menus are a hub with a five-tab bar, thumb-reachable on a phone: **Armory**, **Forge**, **Battle**
(the center tab and Home), **Codex** and **Goals**, with Settings behind the gear. The tab bar
appears after First Contact, whose home is just a start button and three one-line steps; red dots
mark only actions that can be taken now (an affordable unlock, a talent point, a Research node).

- **Battle** is a lobby over the live attract-mode game, which plays in the selected arena: the logo
  with the next goal under it (one tap to Goals), then one run card and Play. The run card sums up
  arena, difficulty, reward multiplier and active pacts; tap it for **Run setup** (an arena carousel
  drawn from each arena's real floor, the unlocked difficulties plus the next one as a teaser, and
  Risk Pacts, with Play pinned below) or swipe it to change arena. Daily Seed sits beside Play.
- **Armory** shows the core as a large orb in a carousel (unlock in place), parts and trails as
  slots that open a bottom sheet to compare, buy and equip, and three build presets.
- **Forge** holds every permanent upgrade: Workshop (coins), Research (sorted available first) and
  Talents. Talents apply the moment they are learned; respecs are free between runs, so there is
  no draft to apply or discard.
- **Codex** is a collection grid with a completion ring; each entry opens a detail sheet.
- **Goals** splits next goals, challenges, badges and mastery into segments.
- **Settings** is a single scrolling page and adds Vibration, Left-handed controls (mirrors Recall
  and Surge) and Reduce flashes (softer full-screen flashes and low-hull pulse).

In a run, the canvas HUD reads hull as a heart and number, shows the level as a badge, maps the time
to the boss on a track with the next anomaly marked, lists the build as an icon strip, and shows an
active anomaly as a pill at the top of the field. Shot coaching appears only while aiming or with
overdrive to spend, and the screen edge breathes red below 30% hull. First Contact demonstrates the
drag with a ghost finger until the first launch.

The level-up draft keeps the arena dimly visible, deals cards from the bottom with a rising chime,
and ignores taps for 0.42 seconds so a shot meant for the board cannot pick a card. Cards carry a
rarity band, level pips, bold numbers, synergy and evolution chips, and a "+n more" counter when
several levels are queued. **Peek** (hold) hides the draft to look at the board; reroll locks for
0.35 seconds after use. Results lead with rewards counting up, the mastery bar filling, unlocks as
cards, personal bests flagged, and **Play again** repeating the same arena, difficulty and pacts.
Haptics (Android and other devices with the Vibration API) mark hits taken, level-ups, Starfall, big
kills and the end of a run, rate-limited so a busy fight never buzzes constantly.

Icons are inline SVG (`src/ui/icons.ts`), including the coin, core gem and research flask, so they
look the same on every platform. Signed numbers stay left-to-right islands inside Persian text.

## Visual direction

The resonance update adds a celestial pinball layer: three holographic diamond signals, animated
star charts and aurora ribbons, traveling rail lights, gold power-shot trails, magnetic recall arcs,
fracturing enemy shells, breach projections, and a sweeping starfall attack with its own synth chord.
The interface explains shot timing beside the launcher and shows circuit progress and overdrive.

The interface uses deep navy surfaces with a mint brand accent, gold for currency and progress,
tactile buttons with a pressed edge, and nothing smaller than 10px of type. The arenas have
cached hexagonal floors and armored rails: calibration rings in Proving Grounds, furnace channels
in The Foundry, and orbital contours in Void Rift.

Combat uses shaded enemy shells and visors, material details, dimensional ball cores, tapered
energy trails, launcher recoil, rotating bumper mechanisms, ricochet rings, and velocity-stretched
sparks. Ambient emissions are frame-rate independent and stop while paused.
All artwork remains procedural, with no downloaded assets or new dependencies.

### Controls

| Action | Touch | Desktop |
| --- | --- | --- |
| Aim | Drag anywhere (or pull back in *Slingshot* mode) | Drag with the mouse |
| Launch | Release | Release |
| Power shot | Release while the charge dial is gold | Hold 0.55–0.95 seconds, then release |
| Stream fire | Keep holding while balls return | Same |
| Recall | Tap ↶ (bottom left, or right with Left-handed controls) | `R` |
| Surge | Tap the Surge button when it is charged | `Space` |
| View the arena during a level-up | Hold **Peek** | Hold **Peek** or press Space/Enter on it |
| Pause | ❚❚ button | `Esc` / `P` |
| Debug panel | Settings → Debug tools | `` ` `` or `?debug` in the URL |

### Resonance combat

- **Power shots:** releasing in the gold window grants +45% damage to that volley and starts each
  ball with five momentum (scaled by momentum gain). Quick shots still fire immediately.
  Holding beyond 1.15 seconds streams ordinary shots as balls return.
- **Tactical recall:** bring all main balls home and choose another angle. Recall resets their
  momentum, leaves temporary balls in play, and has a ten-second cooldown.
- **Resonance circuit:** three pass-through diamond signals appear five seconds into the run.
  Link them in any order within 24 seconds by passing a launched ball through them (shards, clones
  and frenzy balls do not count). A lit signal fades after seven seconds unless the circuit
  completes, so Starfall rewards a deliberate route rather than balls drifting through the sensors.
  Each signal adds momentum, combo and Surge charge.
  Linking all three calls **Starfall**, striking the five threats closest to the defense line,
  hitting every boss for at least 6% of its health, and clearing enemy projectiles. It also grants
  seven seconds of +25% damage / +10% speed, two base XP and four hull repair (Bloodless blocks the
  repair). A fresh circuit arrives after sixteen seconds; a missed circuit returns after four.
  Routes vary with the run seed, and signals always stay clear of obstacles and of a boss's band
  (including Fortress shields), so every signal is reachable during boss fights.
- **Pacing:** the first squad arrives on the opening step and the opening threat rate keeps fodder
  on the field, converging on the long-run curve by about four minutes. Arena anomalies start after
  65 seconds (75 in the tutorial) and recur every 85–105 seconds, outside boss fights. Elites arrive
  no earlier than 90 seconds and gain their difficulty's full modifier count over five minutes;
  elite traits on ordinary enemies (Inferno, Abyss) phase in over the first 90 seconds.
- **Multi-ball:** every run gains a ball at levels 4 and 11 (`BALL_MILESTONES`), so the
  hold-to-stream verb arrives early and no build has to spend picks on it. Under the Lone Ball pact
  each milestone grants Lone Focus (+90% damage) instead, which keeps that pact hard but winnable.
  Extra Ball (two levels, three with the Workshop's Spare Ball) stacks on top, up to six balls.
- **Endless:** after a victory the run can continue. Bosses rotate through all three, and enemies
  gain `ENDLESS_RAMP` (×1.22) health per minute survived, with breach damage rising at half that
  rate, so every build eventually falls (a good player lasts roughly 3–15 minutes).
- **Fair geometry:** Rift Phase re-enters away from corner pockets, a ball may make at most two
  portal jumps between bounces or hits, and a ball that stays trapped in a small area for three
  seconds, or touches no enemy for fifteen, is sent home. These guards make endless loops impossible.

The pause screen includes a flight manual. Run results count power shots, starfalls and recalls.

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
| Difficulty | 5 tiers that add rules and steeper health growth and line damage, plus 6 Risk Pacts that trade challenge for rewards |
| Meta | Coins, Cores and Research; Workshop (capped), Research tree, Mastery 1–20, 17 achievements, 14 challenges, Codex, trails, build presets |
| Modes | Standard run, Endless continuation after a victory, Daily Seed (the first run each UTC day that lasts 90 seconds or wins pays +50% coins and +1 Research; the day's best is shown on Home) |

Core feel systems: constant-speed readable physics with an aim preview that runs the ball's own
reflection, steering (gravity wells, magnets, storms), portal and floor rules, combo meter with diversity rules, momentum tiers (Charged → Overcharged → Hyper → Unstable),
the Surge active ability, hit-stop and slow-motion moments, pooled particles, aggregated damage numbers,
and layered, voice-limited SFX with adaptive music.

## Talent specializations

Open **Forge → Talents**. Spend a shared budget
across three trees: **Kinetics** rewards bank shots and combos, **Conduit** amplifies
elements acquired during the run, and **Warden** improves defense and recovery.
Each tree has five ranked nodes, prerequisite connections, and a distinct capstone.
You start with 3 points and earn another per 500 total Mastery XP across all cores,
up to 15. Existing saves receive credit for their accumulated XP.

Higher tiers require 3 / 8 points in earlier tiers of that tree and a maxed prerequisite.
The 15-point budget allows a focused specialization with supporting talents, but not
two capstones. Learning or refunding a rank applies and saves immediately.
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
src-tauri/   native shell (Tauri 2): config, Rust entry point, icons, Android project
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
  ui/        DOM hub (tabs, sheets), level-up draft, pause, results, SVG icons, motion, Back navigation
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
The bot is intentionally mediocre, and humans should outperform it.

`npm run balance` is the reference for difficulty tuning. Its bot plays like a good touch-screen
player: it aims at the most advanced threat with some noise, decides every 0.3–0.85 s, really holds
a third of its shots into the power window, chases Resonance signals half the time when nothing is
near the line, and fires Surge when ready. `--meta none|mid|max` adds a fresh, a mid-progression
(about ten runs) or a complete Workshop with talents:

```bash
npm run balance -- --runs 16 --core striker,pyro,tesla,cryo,blood,void --arena proving --diff 0,1,2 --meta none
npm run balance -- --runs 16 --core striker,tesla --diff 2,3,4 --full --meta max
```

Current results (win rate, all six cores, 12 runs per cell): a fresh profile wins about 98% on
Normal, 82% on Veteran and 55% on Nightmare; mid progression about 87% / 64% on Nightmare / Inferno;
a complete meta about 91% / 72% on Inferno / Abyss. The tutorial stays forgiving: a slow, sloppy
player still wins about 90% of first runs.

Ball count used to decide runs on its own: a player who took Extra Ball whenever it appeared won
every Nightmare run on a fresh profile, while one who skipped it won almost none. Balls now arrive
through level milestones, Extra Ball is capped at two levels, and the gap between upgrade strategies
is a few points. Difficulty leans on enemy toughness rather than spawn volume, because extra enemies
also mean extra XP; each tier's health multiplier phases in over the first 90 seconds so early fodder
still pops in a hit or two. Foundry and Rift add their own `hpMult`/`spawnMult`, so each arena is at
least as demanding as the one that unlocks it despite its stronger tools. Tuning levers live in
`sim/director.ts` (threat rate, timeline, elites, Endless ramp), `World.makeEnemy` (HP scaling with
each tier's `growth`), `DifficultyDef`/`ArenaDef` multipliers, `xpForLevel`, and `data/`.

## Roadmap ideas

- Opt-in fast-forward while every ball is in flight (players praise it in ball launchers; never forced)
- A "best shot" replay on Results: the path of the run's highest-hit shot as a ghost trail
- Ball roles for multi-ball builds (Bomber, Collector, Healer balls)
- Boss Rush, Challenge Gauntlet and Build Trials modes (the director and seeded RNG already support fixed scenarios)
- More arenas and bosses (the Architect, the Chronarch), and more elements (poison, void)
- Cosmetic impact effects and arena themes
- Code signing for Windows and macOS installers, and Tauri's updater for desktop builds
