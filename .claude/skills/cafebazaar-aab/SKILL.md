---
name: cafebazaar-aab
description: Rebuild the Bounce Defense Android App Bundle (.aab) and generate the Cafebazaar signature file (.bin) with bundlesigner, ready to upload to the Bazaar developer panel. Use when the user asks to build/rebuild/sign the AAB, make a Cafebazaar (Bazaar, کافه‌بازار) release, or run bundlesigner.
---

# Cafebazaar AAB release

Cafebazaar does not take a jar-signed bundle. It takes the **unsigned `.aab`**
plus a **`.bin`** produced by Bazaar's
[Bundle Signer](https://developers.cafebazaar.ir/fa/guidelines/feature/app_bundle#Bundle-Signer)
(`bundlesigner genbin`), which holds the signed digests of every APK the bundle
can produce. Both files are uploaded together.

Everything is automated in [release.ps1](release.ps1).

## Run it

From the repo root (takes several minutes: Rust for 4 ABIs + Gradle):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .claude\skills\cafebazaar-aab\release.ps1
```

Run it in the background with a 10-minute timeout and wait for the
notification. Options:

| Flag                  | Default                                              | Use                                     |
| --------------------- | ---------------------------------------------------- | --------------------------------------- |
| `-SkipBuild`          | off                                                  | only re-run genbin on the last build    |
| `-KeystoreProperties` | `C:\Android\bdefence-signing\keystore.properties`    | other app / key                         |
| `-BundleSigner`       | `%USERPROFILE%\Desktop\bundlesigner-0.1.13.jar`      | newer bundlesigner version              |
| `-Name`               | `bDefence`                                            | output file prefix                      |
| `-OutDir`             | `src-tauri\gen\android\app\build\outputs\bundle\universalRelease` | where the .aab/.bin land   |
| `-CopyTo`             | `%USERPROFILE%\Desktop\bDefence-bazaar`                 | extra copy of both files (`''` to skip) |

Output: `<OutDir>\bDefence-<version>.aab` and `bDefence-<version>.bin`, with a copy of
both in `C:\Users\msynk\Desktop\bDefence-bazaar` (the folder the user uploads from).

## What the script does

1. Sets `JAVA_HOME` (JDK 17 at `C:\Program Files (x86)\Android\openjdk\jdk-17.0.14`),
   `ANDROID_HOME` (`C:\Program Files (x86)\Android\android-sdk`) and `NDK_HOME`
   (newest under `C:\Android\ndk`) when they are not already set - the normal
   shell has none of them - and loads the MSVC environment (`vcvars64.bat`)
   for host-side Rust build scripts.
2. `npx tauri android build --aab` (Tauri builds the frontend, the Rust lib for
   every Android target, then Gradle `bundleUniversalRelease`).
3. Copies `app-universal-release.aab` to `bDefence-<version>.aab`.
4. Runs
   `java -jar bundlesigner-0.1.13.jar genbin -v --bundle <aab> --bin <dir> --v2-signing-enabled true --v3-signing-enabled false --ks <jks> --ks-key-alias <alias> --ks-pass env:... --key-pass env:...`
   with values from `keystore.properties` (`storeFile`, `storePassword`,
   `keyPassword`, `keyAlias`). Passwords go through env vars only.
5. Copies both `bDefence-<version>.aab` and `bDefence-<version>.bin` to `-CopyTo`
   (`C:\Users\msynk\Desktop\bDefence-bazaar`), creating the folder if needed.

## Before running

- **Version.** Bazaar rejects an upload whose `versionCode` is not higher than
  the live one. Tauri derives it from `version` in
  [package.json](../../../package.json) (referenced by `src-tauri/tauri.conf.json`)
  (`major*1000000 + minor*1000 + patch`, e.g. `0.2.0` -> `2000`) and writes it to
  `src-tauri/gen/android/app/tauri.properties` during the build. If the user
  has not bumped the version since the last upload, ask whether to bump it
  in `package.json` first.
- **Keystore.** `C:\Android\bdefence-signing\bdefence-release.jks`, alias `bdefence`.
  Never print, echo or commit `keystore.properties` or its passwords. The same
  key must be used for every Bazaar update of this app.

## Troubleshooting

- `java` not found / wrong version: bundlesigner needs Java 8+, the Android
  build needs JDK 17. Pass `$env:JAVA_HOME` before running to override.
- `fatal error C1083: Cannot open include file: 'excpt.h'` from `vswhom-sys`:
  host-side build scripts still compile C++ with MSVC, and cc-rs picks the
  newest Visual Studio (18 Insiders here), which lacks the C++ desktop headers.
  The script loads `vcvars64.bat` from the newest install that has `excpt.h`
  (VS 2022 Community here). If it fails, check with
  `vswhere -all -prerelease -property installationPath`.
- Rust targets must be installed once:
  `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`.
- bundlesigner ignores the file name in `--bin` and names the output after the
  bundle cut at its first dot (`bDefence-0.3.0.aab` -> `bDefence-0.bin`). The script
  renames it to `bDefence-<version>.bin`.
- `bundlesigner help` prints only the command list; option names follow
  `apksigner` (`--ks`, `--ks-key-alias`, `--ks-pass`, `--key-pass`, `--key`/`--cert`).

## After running

Report both output paths (build folder and `Desktop\bDefence-bazaar` copy), their sizes, the `versionName`/`versionCode`, and
remind the user to upload **both** the `.aab` and the `.bin` in the Cafebazaar
panel.
