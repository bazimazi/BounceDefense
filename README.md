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
npm test           # vitest unit + simulation tests (scripts/vitest.mjs runs Vitest from the true path, so a
                   # lowercase Windows drive such as c:\ no longer breaks every test file)
npm run sim -- --runs 20 --core striker,pyro,tesla --arena proving --diff 0 [--full] [--tutorial]
npm run balance -- --runs 16 --core striker,pyro --diff 0,1,2 [--meta none|mid|max] [--full]
npm run journey -- --runs 900 [--seed 1] [--draft smart]  # a whole career from a fresh profile: runs and hours to every milestone
npx tsx scripts/trickshot-solve.ts [t1,t2] [--write]       # solve Trickshot stages; --write stores par, shots and solutions
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
npm run test:ui:arcade         # Arcade: Trickshot cleared at par by real drags, Next/Restart/abandon, Siege volleys, Back, Persian
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
since the native builds allow only self-hosted fonts. Persian shows Persian digits (۱۲۳).

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
git tag v0.6.0 && git push origin v0.6.0
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
  arena, difficulty, reward multiplier and active pacts; tap it for **Run setup** (the mode, Standard
  or Gauntlet, once every classic boss has fallen; an arena carousel drawn from each arena's real floor,
  the unlocked difficulties plus the next one as a teaser, and Risk Pacts, with Play pinned below) or
  swipe it to change arena. Daily Seed sits beside Play.
- **Armory** shows the core as a large orb in a carousel (unlock in place) with its Mastery and
  Awakening, parts and trails as slots that open a bottom sheet to compare, buy and equip, and three
  build presets.
- **Forge** holds every permanent upgrade: Workshop (coins, in four sections: Foundations,
  Blueprints, Refits and Overdrive, with a completion meter across all of them), Research (three
  branches, Foundations, Advanced and Apex, open studies first, with its own completion meter) and Talents. Talents apply the moment they are learned; respecs are free between runs, so there is
  no draft to apply or discard. The selected talent and its Learn/Refund buttons dock to the bottom of
  the page while the tree scrolls beneath them (beside the tree in phone landscape), so no node is
  ever more than one tap from its description.
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
0.35 seconds after use. Once every slot of a build is maxed, a level-up has only Repair and Salvage
left: it no longer stops the fight but resolves on its own (Repair below 85% hull, Salvage otherwise)
with a short label over the line, which spares a late endgame run dozens of empty drafts. Results lead with rewards counting up, the mastery bar filling, unlocks as
cards, personal bests flagged, and **Play again** repeating the same arena, difficulty and pacts.
Run setup remembers the last launched arena, difficulty, mode, pacts and Ascension between sessions.
A won run is kept in the save from the victory screen on (and refreshed during Endless), so closing
the app before claiming it still pays it on the next launch.
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
  hitting every boss for 6% of its health (before its own defenses, such as the Overmind's ward), and clearing enemy projectiles. It also grants
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

## What's in the game

| System | Content |
| --- | --- |
| Ball cores | 11: Striker, Pyro, Tesla, Cryo, Blood, Void, Venom, Titan, Gemini, Blast, Chrono. Every damage type has a core of its own (direct hits, fire, lightning, ice, bleed, poison, explosions, shards). Each has a passive, starting upgrade, signature upgrade and a 30-level mastery track |
| Ball parts | 26 across Shell, Impact and Momentum slots |
| Run upgrades | 70 across offense, physics, multiplication, elemental (fire, ice, lightning, poison, bleed), defense, utility and core signatures |
| Synergies | 25 (known, hidden and legendary), discovered automatically |
| Evolutions | 13 (Inferno, Tesla Storm, Glacier, Blood Moon, Hydra Swarm, Railgun, Plague Ball, Singularity, Thunderhead, Minefield, Grim Reaper, Aegis, Prism Ball) |
| Relics | 32 run-long artifacts (common, rare, legendary and cursed) found in relic caches; most are earned through Goals and Pilot Rank |
| Talents | 4 persistent trees (Kinetics, Conduit, Warden, Havoc) of 11 nodes each across six tiers (44 nodes, 120 ranks), 4 capstones and 4 apex capstones; deep tiers need wins on Abyss, Singularity and Eternity; a 100-point budget whose later points cost more Mastery XP; free respecs |
| Elemental reactions | 6 (Steam Burst, Overload, Supercharge, Combustion, Necrosis, Neurotoxin) |
| Enemies | 23 behaviours (Linker pairs whose tether deflects balls, spitters, phantoms, juggernauts, necromancers, aegis drones, pulsars, element-immune golems…) plus fragments, eggs and a golden wisp; composition squads |
| Elite modifiers | 10, stackable (including Undying, Phasing, Fission and Commander) |
| Bosses | 6 scripted fights: Fortress, Magnetar, Hydra, Broodmother (eggs and acid), Chronarch (time stop and stasis), Architect (walls and ward pylons); plus 4 apex bosses that close Abyss and every tier above it: Colossus (damage budget and quakes), Twin Eclipse (two bound bosses that revive each other), Overmind (shielded by its swarm) and Void Sovereign (three phases, sealed behind void shards) |
| Arenas | 6 with procedural layout variants: bumpers, deflectors, barrels, oil, crates, portals, gravity wells, spore pods, tesla pylons, booster pads, prism gates (a launched ball splits off two shards) |
| Arena events | 12, five of them hostile (the only kind Abyss allows) |
| Difficulty | 10 tiers (Normal to Abyss, then Oblivion, Cataclysm, Singularity, Pandemonium and Eternity, each with its own health pressure), a 30-step Ascension ladder (1–10 on Abyss and up, 11–20 on Singularity and up, 21–30 on Eternity) with stacking rules, growing pressure and growing rewards, and the endless Descent below Eternity (12 Afflictions), ten Rifts past Eternity and Boss Fury on the tiers above Abyss; 14 Risk Pacts (four of them Abyssal) |
| Meta | Coins, Cores, Research and Aether (the Descent's currency); 10 Sigils from the Rifts; 5 endless Constellations (Might, Bastion, Ward, Ruin, Fortune); Workshop in four sections (14 Foundations, 17 Blueprints, 11 core Refits, 11 Overdrive lines of 50 levels each; 743 levels in all), 55-node Research tree in three branches (Foundations, Advanced, Apex; 667 points in all), Core Awakening (five Cores-bought ranks per core, the last a perk of its own), Mastery 1–30, Pilot Rank 1–100, 51 achievements, 44 challenges, daily and weekly contracts, Codex, 28 trails, build presets |
| Modes | Arcade: Trickshot (24 puzzle stages), Siege (turn-based block breaker) and Rebound (real-time paddle waves), open after First Contact; Standard run, the Gauntlet (every boss back to back, opened by defeating all six), the Descent (an endless ladder of depths below Eternity, opened by an Eternity win), the Rifts (ten handcrafted trials past Eternity, each granting a permanent Sigil), Endless continuation after a victory, Daily Seed (a shared seed played at your strength: the hardest difficulty you have won, the highest Ascension you have won there and, once Risk Pacts are researched, a pact of the day; the first run each UTC day that lasts 90 seconds or wins pays +50% coins and +1 Research; today's challenge and best are shown on Home) |

### Damage types

Every damage type scales from the hit that caused it and has its own levers, core and endgame line:

| Type | How it deals damage | Core | Scales with |
| --- | --- | --- | --- |
| Direct hits | Ball, shard and clone impacts; armor applies | Striker, Titan, Void | damage, crits, bank shots, Impact Driver (direct hits only) |
| Fire | One burn per enemy, refreshed by every proc; through armor | Pyro | burn power, Thermal Core crits |
| Lightning | Arcs to nearby enemies; jumps with no target left ground into the struck enemy (25% each, up to 4), so chains still hurt a lone boss | Tesla (+12% chain damage, +1 jump) | chain damage, jumps |
| Ice | Freezes, then frozen enemies take more damage and shatter | Cryo | frozen vulnerability, freeze time |
| Bleed | Stacks (10 by default) that each deal 16% of the hit per second, through armor | Blood (+75% bleed damage, 5 more stacks) | bleed power (Bloodletting, Hemorrhage, Whetstone, Blood Refit, Crimson Tide) |
| Poison | Stacks (12 by default) that each deal 8% of the hit per second, spread on death | Venom | poison power, stack cap |
| Explosions | Area blasts | Blast (its blasts can crit, at a quarter of the crit chance; Cluster Charge scatters bomblets) | explosion damage, area |
| Shards | Split shards, echo clones and Gemini's twin, all at shard power | Gemini | shard power |

Elemental power raises every status and arc.

### Arcade

The **Arcade** button beside Daily opens three modes with rules of their own. Every arcade board plays the
same for everyone: a bare Striker Core with no parts, Workshop, talents or research, and no upgrades.
Arcade runs pay their own rewards (no Mastery, contracts or achievements) and show their own results.

- **Trickshot** is a puzzle mode: 24 stages in three chapters (First Light, Rift Geometry, The Spire), each a
  fixed board of crystals, walls and arena devices cleared with a few single-ball shots. Each shot has a
  bounce budget (walls, rails, bumpers and armor all count); past it the ball fizzles. Crystals: plain ones
  shatter and let the ball fly on, armored ones take two hits, bank crystals only break after a bounce, bombs
  crack everything nearby, and keys open every gate. Stars: three at par, two one shot over, one otherwise.
  Stages open in order. New stars pay coins (more in later chapters), a chapter at three stars everywhere
  pays Research, and 18/36/54/72 stars pay coins, the Trickster trail, Research and the Kaleidoscope trail.
  Every stage's `solution` (in `src/data/trickshot.ts`) was found by `scripts/trickshot-solve.ts`, a beam
  search that scores each angle by its worst result within ±0.5°, so par is reachable with human aim;
  `tests/arcade.test.ts` replays every solution, and the same angles half a degree off.
- **Siege** is turn-based: every ball fires in one volley; once the last one is home, the wall of numbered
  blocks steps down a row and a new row arrives. A block's number is the hits it needs (they grow with the
  turn; heavy blocks have twice as many). Orbs add a ball for the next volley, lasers strike their whole row
  or column whenever a ball crosses them, bomb blocks blast their neighbours, and coins can be picked up.
  Long volleys speed up to ×2 and ×3; Recall ends one early. A block reaching the line ends the siege. Turns
  held and new records pay coins; 15/25/40/60 turns pay coins, Research and the Rampart trail.
- **Rebound** is real time: the launcher sleeps and you slide a paddle along the line (drag anywhere, or the
  arrow keys) to keep the ball in play; release or Space launches it. Where the ball meets the paddle sets its
  angle (the edges send it wide, never straight up). Waves of bricks step down a row on a timer while a ball
  is in play; clearing one brings a faster, tougher wave. Broken bricks may drop capsules to catch: multiball,
  a wide paddle, a fire ball that burns through bricks, a slower ball, an extra life. A lost ball costs one of
  three lives once none is left; a brick reaching the paddle, or the last life, ends the run. Score and waves
  pay coins; waves 3/6/10/15 pay coins, Research and the Ricochet trail.
- Three Arcade badges (Sharpshooter, Siege Breaker, Rebound Ace) count toward Goals like every other badge.

### Field mechanics

- **Bounty marks.** From 55 seconds, about every 80 seconds outside boss fights, the toughest enemy in the
  upper field is marked for 18 seconds (a gold reticle with a closing timer). Killing it pays six coin drops,
  experience and Surge charge, all doubled for a swift kill; Results count the bounties claimed.
- **Linkers** (Veteran and up, from 2:30) arrive in pairs joined by an energy tether: a segment that deflects
  balls like a shield wall until either Linker falls. The pair keeps its spacing as it marches.
- **Weak points.** Every elite and boss carries a glowing arc on its rim that turns slowly. A ball striking
  inside it deals 60% more damage; the spot then closes for a second and reopens on the far side. Results
  count the weak points struck.
- **Prism gates** (a layout in the Void Rift and the Chrono Spire): a launched ball passing through splits off
  two four-second prism shards; shards and clones pass untouched, and each ball splits at most once a pass.

### Long-term progression

- **Relics.** The mini-boss and every boss leave a relic cache: pick one of three relics (four with
  Relic Lore research) or take coins. Relics are strong, distinct twists (Phoenix Feather, War Drum,
  Meteor Core, Cursed Crown…) and are never offered twice in a run. Twenty-one start in the pool; the
  rest unlock through achievements, challenges and Pilot Rank. The Codex records each one found.
- **Poison.** A fourth element that stacks (12 by default), ticks through armor, spreads with
  Contagion and reacts with the other three: fire ignites it (Combustion), freezing rots armor
  (Necrosis), lightning stuns and carries it down the chain (Neurotoxin). Golems and Insulators are
  immune to one element, so a single-element build has to adapt.
- **Beyond Abyss.** Five more tiers follow Abyss. Each opens close to Abyss and turns into a wall
  later in the run (`lateHp` ramps enemy health in from minute one to minute seven), and each ends with
  one or more apex bosses. Abyss itself now closes with the Colossus.
- **Overdrive.** Eleven long Workshop lines (damage, HP, damage taken, boss damage, crit damage, direct
  hits, elements, explosions, shards, XP and Surge, coins) with 50 levels each and steep prices. Every difficulty won
  opens five more levels of every line, so coins farmed on easier tiers become the power that beats the
  next one, and buying everything takes many hours on the top tiers.
- **Blueprints.** Seventeen mechanics bought with coins, each level gated by a difficulty won:
  extra rerolls and banishes, Surge charged at the start, line regeneration, armor pierce, overkill,
  a barrier, a bigger relic draft, Second Wind (the line holds once per run; at 1 HP under Bloodless), execute, a fifth draft
  card, longer Surge, more opening picks, a seventh ball and the Overdrive Catalyst (Overdrive levels
  ahead of your wins). Prices run from 6,000 to 1.8 million coins, about 8 million in all. The strongest
  levers (opening picks, Second Wind) open only from Abyss up, so they do not flatten the classic tiers.
- **Refits.** One ten-level line per ball core (+2% damage and a signature stat such as burn damage,
  chain damage or lifesteal) that only applies to runs with that core. A level opens every three
  Mastery levels of the core, so tuning every core means playing every core; about 2.8 million coins.
- **Advanced and Apex Research.** Eighteen studies beyond the founding tree, each opened by a win
  (Veteran up to Eternity) or an apex kill, priced 8 to 120 Research (553 in all, against 114 for the
  founding tree). Advanced: Scholarship (wins pay more Research, up to +4 on Eternity), Gilded Elites,
  Relic Attunement, Aftershock (Surge echoes at half length), Spoils of War (a free pick per boss),
  Sentinel Drone (a drone on the line fires a shard every 6 s), Midas Protocol, Evolution Catalyst
  (recipes need one level less), Cryostasis Failsafe (the field freezes once when the line runs low) and
  Abyssal Pacts (four harsher Risk Pacts).
  Apex: Trophy Hunter, Twin Sentinels, Combat Archive, Signature Mastery (runs open with the core's
  signature upgrade), Industrial Theory (Workshop prices −15%), Fate Weaving (a rare card in every draft),
  Core Resonance (half the passive stats of the most-mastered other core) and Grand Unification, which
  needs every other study and an Eternity win and opens each run with a legendary relic.
- **Ascension.** Every level also adds pressure that grows with the square of the level (enemy and boss
  health ×1.6 at A10, ×6 at A20, ×57 at A30; breaches ×1.15, ×1.75 and ×3.5), carried like a Descent depth.
  A finished Workshop wins about 85% of Eternity runs but only a few percent at A30: the top of the ladder
  is climbed with Constellations from the Descent. Winning on Abyss opens Ascension 1; each win at the highest open level opens the
  next, up to 30. The ladder climbs with the tiers: levels 1–10 are played on Abyss and up, 11–20 on
  Singularity and up, and 21–30 only on Eternity, so the top of the ladder is fought against every apex
  boss and cannot be farmed on Abyss (a full kit won 100% of Abyss A30 runs there, paying more than
  Eternity A0). Rules stack (tougher enemies, fewer rerolls, faster projectiles, earlier enrages,
  a third boss…) and each level adds 12% to rewards and extra Cores on victory. Ascension II (21–30) is
  for profiles that have bought everything: armored enemies, faster elites, tougher bosses, halved
  regeneration, more traits, slower Surge, harder breaches, more health, dearer levels and, at 30, one
  more apex boss at the end of the run. Winning on 25 and 30 pays Cores, Research and the Zenith trail.
- **The Gauntlet.** Defeating all six classic bosses opens a second mode in Run setup: every classic
  boss back to back (the arena's own first), then the tier's apex bosses. A 75-second opening builds
  the machine, there are no elites or mini-boss, a free pick follows every fight, squads keep coming at
  about a third of their pace during fights, and the next boss arrives 20 seconds later. Classic bosses
  are three times as tough as in a Standard run (more on the tiers whose enemies toughen late) and each
  one adds 45%; apex bosses keep their Standard strength. A Gauntlet win is its own
  record (shown in Run setup): it opens no difficulty or Ascension step, but pays like any run and has
  its own challenges, an achievement and the Gladiator trail.
- **Core Awakening.** Cores no longer pile up once every core is unlocked. Each core has five
  Awakening ranks bought with Cores (10, 20, 35, 55 and 80; 2,200 for all eleven cores), and a rank opens
  every six Mastery levels of that core. Ranks 1–4 are shared (+6% damage, +10% max HP, +10% XP and a
  reroll, +10% damage to elites and bosses); rank 5 awakens a perk of the core's own (True Aim,
  Wildfire Heart, Living Current, Absolute Zero, Crimson Tide, Event Horizon, Blight Bloom,
  Unstoppable, Binary Star, Supernova, Timeless), several of which pay back the core's passive cost. Awakening
  only applies to runs with that core.
- **Abyssal Pacts.** An Advanced study after an Abyss win adds four harsher pacts: Eclipse (no
  Resonance circuit, so no Starfall, and Surge charges 30% slower, +35%), Warlords (bosses and elites
  +50% health, +45%), Endless Tide (squads 30% more often and enemies 15% tougher, +35%) and Narrow Fate
  (one fewer draft card and 15% less XP, +30%). Each has a second edge because a late kit shrugged off
  the first one (all four together cost about 4 points of win rate at the frontier while paying 2.45×).
  **Pactbreaker** asks for three of them on the hardest difficulty you have open, at the highest
  Ascension it allows, so it is a real fight whenever it is attempted (about 60–66% for the bot at a
  fresh frontier); a finished kit used to clear the old "two pacts on Abyss" every time.
- **The Descent.** Winning Eternity opens a third mode in Run setup: an endless ladder of depths. Every
  depth is an Eternity run (all its apex bosses) whose ordinary enemies are 19% tougher than the depth above,
  whose bosses are 19% tougher, and whose breaches hit 5% harder, all compounding. Ordinary enemies carry part
  of that in the opening and all of it by six minutes, because a late build snowballs past any boss: the
  depth bites where the permanent kit has to carry the run. From Depth 3 an Affliction joins every five depths
  (at most six): Bulwark, Frenzy, Tyrant, Horde, Veiled, Sanguine, Grievous, Sapping, Withering, Bolster,
  Warband and Juggernaut. They are fixed per band of five depths and drawn afresh for every band, so a depth
  can be read before it is tried and the deep ladder never settles into one set. A win opens the next depth;
  Play Again on the results screen goes straight on to it. Runs pay Aether (10 × 1.04^depth on a win; a loss
  pays up to 15% for the time it lasted and 35% more for the bosses it felled), extra Cores and coins, and the
  records at Depths 5, 10, 20, 30, 50, 75 and 100 pay Cores and Research once (Fathom, Starborn and Infinite
  trails at 10, 30 and 50). The pause screen lists the depth's Afflictions. Ascension rules never apply in the
  Descent; the depth is its own ladder.
- **Constellations.** The Forge's fourth segment, lit by the first depth won. Five lines with no top:
  Might (+3% damage per level), Bastion (+3% max HP) and Ward (−2.2% damage taken) compound, every level
  multiplying what the line already gives, and cost Aether (×1.085 per level). Ruin compounds damage to elites
  and bosses and costs Cores; Fortune adds 4% Aether per level and costs Research, so every currency keeps a
  use forever. Every depth won also opens one more level on every Overdrive line past 50 (once all fifty are
  open), so coins stay worth earning too. Prices rise faster than Aether does with depth, so each depth
  takes a little more play than the one before: about 25 runs per five depths at first, over 100 by Depth 70.
- **Boss Fury.** From Oblivion up (and in the Descent and the Rifts) a boss may stand only so long: 110 s on
  Oblivion down to 90 s on Eternity, apex bosses 1.35× as long. A fuse under the boss bar burns down, a
  banner warns ten seconds before, and then the line crumbles by 1% of its max HP per second, growing by
  another 1% every ten seconds (about 35 seconds from full to nothing). Armor, barriers and damage
  reduction do not slow it; the once-per-run saves still apply. Fury turns boss health into a real damage
  check: squads pause during boss fights, so before it a long fight was only slow, never lost. Endless and
  the Gauntlet have no Fury.
- **The Rifts.** Winning Eternity also opens a fourth mode: ten handcrafted trials, opened one after
  another, each an Eternity run carrying a fixed depth's worth of pressure (`power`, Depth 12 for the first
  up to Depth 130 for the last), its own Risk Pacts and Afflictions as rules, a shorter Boss Fury and its
  Rift Lords (apex bosses) at the end: the Frayed Rift, the Iron Rift, the Silent Rift (no Resonance, no
  rerolls), the Lone Star (one ball), the Bloodless Rift (half a line, no healing), the Rift of Kings, the
  Teeming Rift, the Narrow Rift, the Shattered Rift and the Heart of the Void (every apex boss, six
  Afflictions), the summit of the game. Run setup steps through all ten, locked ones included, with their
  rules, Lords, Fury timing and reward. A win pays Aether like a depth of the Rift's power; the first clear
  pays Cores and Research and grants the Rift's **Sigil**, a permanent power every later run carries:
  Patience (Fury 15 s later), Breaking (+30% to elites and bosses, ignore 5 armor), Insight (+2 rerolls,
  +1 banish), Breadth (an eleventh upgrade slot), the Bulwark (+30% max HP, −10% damage taken), Spoils (one
  more free pick at the start), Plenty (+50% Aether, +25% coins), the Hoard (a legendary relic choice at
  the start), the Firmament (every compounding Constellation steps 0.5% further) and the Void (Extra Ball once
  more, +25% damage). Riftwalker, Riftbreaker and Heart of the Void (the Void Heart trail) mark the way.
- **Pilot Rank.** Every run's Mastery XP also fills an account-wide rank from 1 to 100. Each rank pays
  coins; every third adds Research, every fourth Cores, and milestones unlock relics and trails.
- **Contracts.** Three daily contracts and one weekly contract, drawn from a date seed so every
  player shares the jobs. Progress accumulates over every run and pays automatically. The jobs grow with
  the player (difficulties won, fixed when the board is drawn): volume jobs follow kills per run at the
  hardest open tier (about 5× from Normal to Eternity), level and survival jobs follow typical level and
  run length, and from the second win on only runs one tier below the hardest win or above count.
  Rewards follow the economy (a daily stays worth about a fifth of a run's coins) and are shown on each
  contract.
- **Mastery** now runs to level 30, and the Workshop, Research tree and talent budget grew to match.

Core feel systems: constant-speed readable physics with an aim preview that runs the ball's own
reflection, steering (gravity wells, magnets, storms), portal and floor rules, combo meter with diversity rules, momentum tiers (Charged → Overcharged → Hyper → Unstable),
the Surge active ability, hit-stop and slow-motion moments, pooled particles, aggregated damage numbers,
and layered, voice-limited SFX with adaptive music.

## Talent specializations

Open **Forge → Talents**. Spend a shared budget
across four trees: **Kinetics** rewards bank shots and combos, **Conduit** amplifies
elements acquired during the run, **Warden** improves defense and recovery, and **Havoc**
amplifies explosions, crits and shards. Each tree has eleven ranked nodes over six tiers,
prerequisite connections, a capstone and an apex capstone.
You start with 3 points and earn another per 900 total Mastery XP across all cores for the
first twenty, then at a rising price up to 100. Existing saves receive credit for their accumulated XP.

Higher tiers require 3 / 8 points in earlier tiers of that tree and a maxed prerequisite.
The first 20 points allow a focused specialization with supporting talents, but not
two capstones. Learning or refunding a rank applies and saves immediately; tap a node and its
description, current and next rank and the Learn/Max/Refund buttons stay docked in view. **Max**
learns every rank of the talent that the budget and its requirements allow in one tap.
Refunds and resets are free between runs. Refunding a prerequisite also refunds
dependent nodes. Each run snapshots the allocation, shown in its pause menu.

The fourth tree, **Havoc**, amplifies explosions, crits and shards, and its capstone sends a
shockwave from every 25th kill. With 20 points a pilot can complete one tree and most of a second,
but never two capstones.

**Deep tiers.** Below each capstone, every tree continues for three more tiers (19 more ranks per
tree): a tier that opens with an Abyss win and 11 points in the tree, one that opens with a Singularity
win and 16 points, and an apex capstone that needs an Eternity win and 26 points. Points 21 to 100
cost 1,400, 1,600, … 17,200 Mastery XP each (about 760,000 XP for all hundred), so the budget keeps
growing for hundreds of runs, and 100 points fill three trees but never all four.

| Tree | Abyss tier | Singularity tier | Apex capstone |
| --- | --- | --- | --- |
| Kinetics | Long Shot, Momentum Core | Hypervelocity, Deadeye | Perpetual Motion: every 5th wall bounce throws off a full-power shard |
| Conduit | Venom Lore, Permafrost | Elemental Supremacy, Hemorrhage | Elemental Storm: enemies dying with two or more elements burst |
| Warden | Fortitude, Aegis Field | Regenerator, Iron Will | Unbreakable: once per run the line holds at 1 HP and ignores damage for 4 s |
| Havoc | Demolisher, Bladestorm | Carnage, Critical Mass | Armageddon: every 15th kill calls a meteor on the densest group |

The capstone tier also gained a second node in each tree (Ricochet Engine, Overload, Bulwark, Sunder).

Talents spend no Coins, Cores or Research. Their modifiers compose through the existing
stat pipeline, while capstones use isolated effects: wall bounces charge Surge on a
shared cooldown, existing statuses increase direct-hit damage, or low HP reduces
incoming damage. Talents never supply upgrade levels, elemental proc chances, synergy
tags or evolution ingredients. Risk Pacts remain authoritative, including Bloodless
disabling talent regeneration. Saves migrate automatically to version 4, which credits
existing Mastery XP to Pilot Rank.

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
| Achievement / challenge / research / workshop / rank rewards | `data/meta.ts` |
| Affliction / Constellation | `data/descent.ts`: an `AFFLICTIONS` entry read with `w.afflictions.has(id)` where it applies; a `STARS` line with `mods(level)`, `cost(level)` and its currency |
| Relic | `data/relics.ts`: mods and/or a behavior; `locked: true` plus an unlock (achievement, challenge or `RANK_UNLOCKS`) |
| Contract | `data/contracts.ts`: a metric over `RunSummary`, `sum` or `max`, daily and weekly targets |
| Ascension rule | `data/ascension.ts`, then read it with `w.asc.has(id)` where it applies |

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

The later arenas step up on purpose. With mid progression, Nightmare wins drop from about 90% in the
Void Rift to roughly 70% in The Blight, 78% in the Chrono Spire and 45–55% in The Citadel.

`--meta end` is an Ascension-ready profile (every Workshop item, 20 talent points, the Research
flags that shape a run, every relic), and `--asc` runs chosen Ascension levels (the sim does not
apply the game's bands, so Abyss above A10 is a measurement, not something a player can start):

```bash
npm run balance -- --runs 8 --core striker,pyro,tesla,cryo,venom,gemini --diff 4 --asc 0,5,10,15,20 --meta end --full
```

With the Colossus closing Abyss, `--meta end` wins about 70% there and `--meta max` about 43%
(about 70% with Overdrive 10). `--od N` sets every Overdrive line to level N, and the endgame tiers
are tuned against it, each hard at entry and easing as Overdrive grows (win rate, three cores, 8 runs
per cell):

| Tier | Overdrive 5k−10 | Overdrive 5k (the cap after winning the tier below) |
| --- | --- | --- |
| Oblivion (5) | ~70% at 15 | ~88% at 25 |
| Cataclysm (6) | ~50% at 20 | ~55% at 30 |
| Singularity (7) | ~20% at 25 | ~55% at 35 |
| Pandemonium (8) | ~17% at 30 | ~38% at 40 |
| Eternity (9) | ~17% at 35 | ~25% at 45 |

```bash
npm run balance -- --runs 8 --core striker,pyro,tesla --diff 7 --meta end --od 35
```

`--bp K` adds every Blueprint level that opens once difficulty K is won, and `--refit N` sets every
core's Refit to level N. With them, the journey looks like this (three cores, 8 to 12 runs per cell):

| Profile | Win rate |
| --- | --- |
| Abyss, `--meta max` (no Blueprints) | ~38% |
| Abyss, `--meta max --bp 3` (every Blueprint open after Inferno) | ~53% |
| Abyss, `--meta end --bp 3` | ~81% |
| Oblivion, `--meta end --od 25 --bp 4 --refit 4` | ~88% |
| Cataclysm, `--meta end --od 30 --bp 5 --refit 5` | ~50% |
| Pandemonium, `--meta end --od 40 --bp 7 --refit 7` | ~50% |
| Eternity, `--meta end --od 45 --bp 8 --refit 8` | ~46% |
| Eternity, everything bought (`--od 50 --bp 9 --refit 10`) | ~55% |

Singularity, Pandemonium and Eternity got a steeper late-run HP ramp (`lateHp` 5.6, 6 and 7.8) once
research landed, so the Overdrive-only table further up reads a little easier than the game now plays.

`--tp N` spends N talent points (Warden, then Havoc, Kinetics and Conduit, deep tiers as if the tier
below had been won; `--tpwin K` overrides that). With the whole kit, including the talent budget a
player plausibly holds at each step, the tiers beyond Abyss were stiffened again (late HP 7 / 8 / 12
and boss HP 34 / 46 / 76 on Singularity, Pandemonium and Eternity):

| Profile (16 runs per core) | Win rate |
| --- | --- |
| Singularity, `--od 35 --bp 6 --refit 6 --research 6 --tp 50` | ~73% |
| Pandemonium, `--od 40 --bp 7 --refit 7 --research 7 --tp 60` | ~48% |
| Eternity, `--od 45 --bp 8 --refit 8 --research 8 --tp 70` | ~59% |
| Eternity, everything (`--od 50 --bp 9 --refit 10 --research 9 --tp 100 --tpwin 9`) | ~94%; ~83% at Ascension 10, ~75% at 20 |

`--research K` adds every Advanced and Apex study open after winning difficulty K, and
`--without a,b` drops research flags to measure one study. With the full kit at each step (Overdrive
5k, Blueprints and Refits to the tier below, research to the tier below; three cores, 16 runs each):

| Tier | Without research | With research |
| --- | --- | --- |
| Abyss (`--meta max --bp 3`) | ~56% | ~67% |
| Oblivion | | ~90% |
| Singularity | ~58% | ~73% |
| Eternity | ~48% | ~44–54% |
| Eternity, everything bought and studied | | ~73% |

Sentinel Drone was the strongest study (about +20 points on Singularity at a 4 s interval), so it
fires every 6 s and opens only after an Abyss win, like Spoils of War. Research adds about a fifth to
top-tier income. The bot never rerolls or banishes, so the drafting Blueprints help a human more than
these numbers show. Opening picks were the strongest single lever measured: one extra free pick alone lifted Abyss
from about 38% to 58%, which is why Launch Protocol opens only after an Abyss win.

The output also reports the final boss's median fight time and the average coins a run pays. New upgrades start locked behind
Research or Goals: every card added to the opening pool dilutes the draft, and 13 unlocked additions
once dropped Nightmare wins from about 42% to 19%.

Ball count used to decide runs on its own: a player who took Extra Ball whenever it appeared won
every Nightmare run on a fresh profile, while one who skipped it won almost none. Balls now arrive
through level milestones, Extra Ball is capped at two levels, and the gap between upgrade strategies
is a few points. Difficulty leans on enemy toughness rather than spawn volume, because extra enemies
also mean extra XP; each tier's health multiplier phases in over the first 90 seconds so early fodder
still pops in a hit or two. Foundry and Rift add their own `hpMult`/`spawnMult`, so each arena is at
least as demanding as the one that unlocks it despite its stronger tools. Tuning levers live in
`sim/director.ts` (threat rate, timeline, elites, Endless ramp), `World.makeEnemy` (HP scaling with
each tier's `growth`), `DifficultyDef`/`ArenaDef` multipliers, `xpForLevel`, and `data/`.

**Ascension II** is a wall for a profile that is still buying its kit and a long climb for one that
is done (Eternity, three cores, 8 runs per cell; `--asc` takes the levels):

| Eternity profile | A10 | A20 | A30 |
| --- | --- | --- | --- |
| Entry kit (`--meta end --od 45 --bp 8 --refit 8 --research 8 --tp 70`) | ~73% | ~64% | ~44% |
| Everything (`--od 50 --bp 9 --refit 10 --research 9 --tp 100 --tpwin 9 --awaken 5`) | ~100% | ~97% | ~80% |

(All eleven cores, 6 runs per cell, full pool.) Ascension 29 now toughens enemies 50% more late in the
run (it was 25%), which took A30 from ~86% to ~80% with everything and from ~51% to ~44% with the entry
kit, so the last rung is still a climb once the kit is complete.

**The Gauntlet** (`--mode gauntlet`, `--awaken N` sets the core's Awakening rank) plays about as hard
as Standard on the same tier for a well-kitted profile and clearly harder for a young one:

| Profile (three cores, 8 runs per cell) | Gauntlet | Standard |
| --- | --- | --- |
| Normal, `--meta mid --full` | ~75% | ~98% (fresh profile) |
| Veteran / Inferno, `--meta max --full` | ~92% / ~92% | — / ~87% |
| Abyss, `--meta max --bp 3 --research 3` | ~67% | ~67% |
| Singularity, `--meta end --od 35 --bp 6 --refit 6 --research 6 --tp 50` | ~63% | ~73% |
| Eternity, everything | ~100% | ~94% |

Squads that keep coming during Gauntlet fights also pay XP, which is why the low tiers do not get
harder in step with boss health; the fight stream (`GAUNTLET.fightSquads`) and the boss multipliers
are the levers.

**Long-run pacing (the Descent rebalance).** A finished Workshop used to win nearly every Eternity and A30 run,
and a fresh profile reached that point fast: `npm run journey` (below) won Eternity on its 22nd run (about
3.5 hours) and Ascension 30 on its 55th. Three things changed. Workshop prices rose (`PRICE` in
`data/meta.ts`: Foundations ×4, Blueprints and Refits ×4, Overdrive ×6) with dearer talent points and Pilot
Ranks. The tiers above Abyss gained `pressure` (enemy and boss health ×1.4 / 2 / 2.8 / 3.8 / 5, carried like a
depth) and triple boss health, because late builds snowball past almost any boss and only the opening asks
the permanent kit to carry the run. Ascension gained its quadratic pressure. Some of the older tables above
predate this and read easier than the game now plays.

`npm run journey -- --runs 900 --seed N` plays a whole career with the human-like bot and the real meta code:
every run goes through `runConfig` and `applyRun`, the player spends everything cheapest first (Workshop,
Research, cores, Awakening, Constellations), re-spends talents, and pushes the next difficulty, Ascension step
or depth, farming the last setting won after two straight losses. It prints the run and hour of each
milestone, income by source and the win rate of every setting tried. The bot keeps standard parts and never
uses pacts, rerolls or banishes. Two seeds after the rebalance:

| Milestone | Before | Seed 1 | Seed 2 |
| --- | --- | --- | --- |
| Abyss won | run 5 (0.8 h) | run 17 (2.2 h) | run 11 (1.4 h) |
| Eternity won | run 22 (3.5 h) | run 113 (13 h) | run 88 (11 h) |
| Ascension 30 won | run 55 (10 h) | run 286 (43 h) | run 314 (50 h) |
| Depth 25 | — | run 287 (43 h) | run 301 (47 h) |
| Depth 50 | — | run 507 (72 h) | run 431 (68 h) |
| Depth 70 | — | run 855 (101 h) | run 819 (100 h) |

**Skilled-play pacing (Boss Fury and the Rifts, Nov 2026).** The journey's bot drafts half at random and never
rerolls; a player who drafts with intent was found to be far stronger (`--draft smart`, `scripts/drafter.ts`:
it plans evolutions, values balls and its signature, keeps its ten slots for the plan, and spends rerolls and
banishes). It won Eternity by run ~45, Depth 90 by ~700 and, once added, every Rift by run ~290, so the end game
is now tuned against it: Boss Fury on the tiers above Abyss (boss health became a real wall), boss health and late
ramps raised on Oblivion to Eternity, Overdrive prices doubled (`PRICE.overdrive` 12), half the coins per depth,
Descent growth 1.19 per depth for enemies and bosses, and steeper Ascension pressure. Three skilled careers and one
with the tuning bot (`npm run journey -- --runs 1300 --seed N [--draft smart]`):

| Milestone | Skilled (3 seeds) | Tuning bot |
| --- | --- | --- |
| Abyss won | run 5–6 (0.8 h) | run 7 (1 h) |
| Eternity won | run 88–102 (8–13 h) | run 144 (16 h) |
| Rift 1 / Rift 4 / Rift 8 | runs 132–142 / 268–390 / 640–798 | runs 216 / 474 / — |
| Ascension 30 won | run 317–353 (45–53 h) | run 542 (70 h) |
| Depth 25 / 50 / 70 | runs 295–307 / 494–574 / 949–992 | runs 589 / 920 / — |

Rifts are walls: the bot needed 10–36 attempts for each of the first eight. Rift 9 and the Heart of the Void were
not cleared within 1,300 runs; with a late kit (`--od 124 --stars 62 --sigils 8`, deep Overdrive allowed) Rift 8 /
9 / 10 win about 22% / 31% / 8% and Depth 72 / 80 about 50% / 25%, so the summit is reached only by players who keep
climbing the Descent well past Depth 80.

Each five depths take more runs than the five before (about 25 around Depth 20, 40–70 around Depth 50, over
100 past Depth 65), and the ladder has no end. With the whole kit (`--meta end --od 50 --bp 9 --refit 10
--research 9 --tp 100 --tpwin 9 --awaken 5 --full`; three cores, 12 runs per cell):

| Setting | Win rate |
| --- | --- |
| Eternity / A10 / A20 / A30 | ~95% / ~75% / ~39% / ~14% |
| Descent Depth 1 / 5 / 10 / 15 / 20, no Constellations | ~89% / ~75% / ~67% / ~28% / ~28% |
| Depth 10 / 20 / 30 with every Constellation at 15 (`--stars 15`) | ~81% / ~44% / ~14% |
| Depth 20 / 30 / 40 with every Constellation at 30 | ~69% / ~33% / ~19% |
| Eternity with a mid kit (`--od 15 --bp 5 --refit 3 --research 5 --tp 45`) / the old entry kit (`--od 45 --bp 8 --refit 8 --research 8 --tp 70`) | ~8% / ~40% |

`--depth 1,5,10` plays Descent depths instead of `--diff`, and `--stars N` (or `--star '{"might":30}'`) sets
Constellation levels. Outcomes stay bimodal (a run either snowballs or falls in its first six minutes), so
use 12 or more runs per cell; the journey's two seeds differ by 20–30% at the same milestone.

**Cores** are compared with `npm run balance:cores`, which plays every core at eight stages of the
journey (fresh Veteran and Nightmare, mid-kit Inferno, Abyss with Blueprints, Oblivion right after a first
Abyss win, Singularity and Eternity entry kits, and Eternity A30 with everything) and prints each core's
deviation from the stage average. Each core has an early lever (its passive) and late levers (its Refit
line and Awakening perk), so a curve can be reshaped, not just shifted. After the core pass (24 runs per
cell), every core sits within about ±5 points overall, down from ±10, and the worst early/late split is
about +8/−7, down from +21/−14:

| Points vs stage average | Striker | Pyro | Tesla | Cryo | Blood | Void | Venom | Titan | Gemini | Chrono | Blast |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Before, overall | −2 | +3 | +5 | −7 | −10 | +7 | −7 | +5 | +6 | −10 | +10 |
| After, overall | −1 | −3 | +1 | −3 | −4 | +3 | −1 | +3 | +5 | −1 | +2 |
| After, early / late | −3 / 0 | −5 / −2 | +3 / −1 | −2 / −4 | −6 / −3 | +3 / +2 | −1 / −1 | −1 / +7 | +8 / +2 | +2 / −4 | 0 / +5 |

Gemini's twin was the early outlier (45% power from the first launch) and fell behind late; it now starts at
25% and its Refit adds 5.5% shard power a level. Blast explosions crit at a quarter of the crit chance, since
full chance let Overdrive crit damage run away with the late game. Blood, Venom and Chrono gained direct
damage (they had none, or little), and Titan traded ball size, which dominated big late crowds, for damage
and hull. The weak cores gained more than the strong ones lost, so Nightmare, Inferno and Oblivion enemy
health rose (2.1 → 2.25, 2.6 → 2.8, 3.6 → 3.85) to keep the curve where it was: fresh Nightmare ~55%, mid
Inferno ~62%, Oblivion right after a first Abyss win ~75%.

**Damage types** are compared with `--build <type>`, which drafts only from one archetype's upgrades
(`ARCHETYPES` in `scripts/balance.ts`), the core's signature and a shared kit of hull, extra balls
and generic damage; `--shares` prints the damage meter averaged over the cell. Each type on its own
core, Eternity at Ascension 20 with the entry kit (24 runs per cell), before and after the damage
pass that added bleed power, lightning grounding, the Blast Core and Impact Driver:

| Type (core) | Before | After | Final boss fight |
| --- | --- | --- | --- |
| Direct hits (Striker) | ~50% | ~67% | 41 s → 23 s |
| Fire (Pyro) | ~83% | ~88% | ~15–29 s (unchanged mechanics) |
| Lightning (Tesla) | ~75% | ~79% | 55 s → 27 s |
| Ice (Cryo) | ~92% | ~92% | ~31–36 s (unchanged mechanics) |
| Bleed (Blood) | ~58% | ~71% | 33 s → 20 s |
| Poison (Venom) | ~100% | ~90% | 5 s → 7 s |
| Explosions (Striker, then Blast) | ~58% | ~75% | ~35 s |
| Shards (Gemini) | ~33% | ~46% | ~15 s |

Every type wins 96–100% of Singularity Gauntlets with the entry kit. Shard builds stay the weakest at
the very top: they have no stacking or area damage, so they lean on Swarm Foundry and Impact Driver.
Gemini's twin used to be pinned at 45% and ignored every shard power bonus; it now follows shard power,
which is what lets those lines scale it.

## Roadmap ideas

- Opt-in fast-forward while every ball is in flight (players praise it in ball launchers; never forced)
- A "best shot" replay on Results: the path of the run's highest-hit shot as a ghost trail
- Ball roles for multi-ball builds (Bomber, Collector, Healer balls)
- Challenge Gauntlet and Build Trials modes (the director and seeded RNG already support fixed scenarios; the Gauntlet's
  boss queue shows how a mode reshapes the director)
- A void element and more arenas and bosses
- Cosmetic impact effects and arena themes
- Code signing for Windows and macOS installers, and Tauri's updater for desktop builds
