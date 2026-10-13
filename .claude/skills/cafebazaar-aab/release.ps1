<#
.SYNOPSIS
  Builds the Android App Bundle (.aab) and generates the Cafebazaar signature
  file (.bin) with bundlesigner, ready to upload to the Bazaar developer panel.

.DESCRIPTION
  1. Points JAVA_HOME / ANDROID_HOME / NDK_HOME at the local toolchain when unset.
  2. Runs `npx tauri android build --aab`.
  3. Copies the bundle to <OutDir>\<Name>-<version>.aab.
  4. Runs `bundlesigner genbin` with the release keystore, producing
     <Name>-<version>.bin next to it.
  5. Copies both files to -CopyTo (Desktop\bDefence-bazaar by default).

  Passwords are read from keystore.properties and handed to bundlesigner via
  environment variables, so they never appear on a command line or in output.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .claude\skills\cafebazaar-aab\release.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .claude\skills\cafebazaar-aab\release.ps1 -SkipBuild
#>
[CmdletBinding()]
param(
  [string]$KeystoreProperties = 'C:\Android\bdefence-signing\keystore.properties',
  [string]$BundleSigner = (Join-Path $env:USERPROFILE 'Desktop\bundlesigner-0.1.13.jar'),
  [string]$Name = 'bDefence',
  [string]$OutDir,
  [string]$CopyTo = (Join-Path $env:USERPROFILE 'Desktop\bDefence-bazaar'),
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$bundleDir = Join-Path $repo 'src-tauri\gen\android\app\build\outputs\bundle\universalRelease'
if (-not $OutDir) { $OutDir = $bundleDir }

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

function First-Existing([string[]]$paths) {
  foreach ($p in $paths) { if ($p -and (Test-Path $p)) { return (Resolve-Path $p).Path } }
  return $null
}

# --- Toolchain -----------------------------------------------------------------
Step 'Toolchain'
if (-not $env:JAVA_HOME) {
  $env:JAVA_HOME = First-Existing @(
    'C:\Program Files (x86)\Android\openjdk\jdk-17.0.14',
    'C:\Program Files\Android\openjdk\jdk-17*',
    'C:\Program Files\Android\Android Studio\jbr')
}
if (-not $env:ANDROID_HOME) {
  $env:ANDROID_HOME = First-Existing @(
    'C:\Program Files (x86)\Android\android-sdk',
    (Join-Path $env:LOCALAPPDATA 'Android\Sdk'))
}
if (-not $env:NDK_HOME) {
  $ndk = Get-ChildItem 'C:\Android\ndk', (Join-Path "$env:ANDROID_HOME" 'ndk') -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | Select-Object -First 1
  if ($ndk) { $env:NDK_HOME = $ndk.FullName }
}
foreach ($v in 'JAVA_HOME', 'ANDROID_HOME', 'NDK_HOME') {
  $val = [Environment]::GetEnvironmentVariable($v)
  if (-not $val -or -not (Test-Path $val)) { throw "$v is not set and could not be found." }
  Write-Host "$v = $val"
}
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

# Host-side build scripts (e.g. vswhom-sys) compile C++ with MSVC. cc-rs picks the
# newest Visual Studio, which may lack the C++ desktop headers (excpt.h), so load
# vcvars64 from the newest install that actually has them.
if (-not $env:VCINSTALLDIR) {
  $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
  $vcvars = $null
  if (Test-Path $vswhere) {
    foreach ($vs in (& $vswhere -all -prerelease -products * -property installationPath)) {
      $hasHeaders = Get-ChildItem (Join-Path $vs 'VC\Tools\MSVC\*\include\excpt.h') -ErrorAction SilentlyContinue
      $bat = Join-Path $vs 'VC\Auxiliary\Build\vcvars64.bat'
      if ($hasHeaders -and (Test-Path $bat)) { $vcvars = $bat; break }
    }
  }
  if (-not $vcvars) { throw 'No Visual Studio install with the C++ desktop workload (excpt.h) was found.' }
  foreach ($line in (& cmd.exe /c "`"$vcvars`" >nul && set")) {
    if ($line -match '^([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2]) }
  }
}
Write-Host "VCINSTALLDIR = $env:VCINSTALLDIR"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$java = Join-Path $env:JAVA_HOME 'bin\java.exe'

if (-not (Test-Path $BundleSigner)) { throw "bundlesigner jar not found: $BundleSigner" }
if (-not (Test-Path $KeystoreProperties)) { throw "keystore.properties not found: $KeystoreProperties" }

# --- Keystore --------------------------------------------------------------------
$props = @{}
foreach ($line in Get-Content $KeystoreProperties) {
  if ($line -match '^\s*([^#=\s]+)\s*=\s*(.*?)\s*$') { $props[$Matches[1]] = $Matches[2] }
}
foreach ($k in 'storeFile', 'storePassword', 'keyAlias') {
  if (-not $props[$k]) { throw "keystore.properties is missing '$k'." }
}
$storeFile = $props['storeFile']
if (-not [IO.Path]::IsPathRooted($storeFile)) {
  $storeFile = Join-Path (Split-Path $KeystoreProperties) $storeFile
}
if (-not (Test-Path $storeFile)) { throw "Keystore not found: $storeFile" }

# --- Version ---------------------------------------------------------------------
$conf = Get-Content (Join-Path $repo 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json
$version = $conf.version
# tauri.conf.json points "version" at ../package.json; read the real version from it.
if ($version -like '*.json') {
  $version = (Get-Content (Join-Path $repo "src-tauri\$version") -Raw | ConvertFrom-Json).version
}
Write-Host "version = $version"

# --- Build -----------------------------------------------------------------------
$builtAab = Join-Path $bundleDir 'app-universal-release.aab'
if (-not $SkipBuild) {
  Step 'Building AAB (tauri android build --aab)'
  $started = Get-Date
  Push-Location $repo
  try {
    & npx tauri android build --aab
    if ($LASTEXITCODE -ne 0) { throw "android build failed (exit $LASTEXITCODE)." }
  } finally { Pop-Location }
  if (-not (Test-Path $builtAab) -or (Get-Item $builtAab).LastWriteTime -lt $started) {
    throw "Build finished but no fresh bundle at $builtAab"
  }
} elseif (-not (Test-Path $builtAab)) {
  throw "-SkipBuild given but no bundle at $builtAab"
}

$props2 = Join-Path $repo 'src-tauri\gen\android\app\tauri.properties'
if (Test-Path $props2) {
  Get-Content $props2 | Where-Object { $_ -match '^tauri\.android\.version' } | ForEach-Object { Write-Host $_ }
}

# --- Copy + sign -----------------------------------------------------------------
New-Item -ItemType Directory -Force $OutDir | Out-Null
$aab = Join-Path $OutDir "$Name-$version.aab"
$bin = Join-Path $OutDir "$Name-$version.bin"
Copy-Item $builtAab $aab -Force
if (Test-Path $bin) { Remove-Item $bin -Force }

Step 'Generating Cafebazaar .bin (bundlesigner genbin)'
$env:BUNDLESIGNER_KS_PASS = $props['storePassword']
$env:BUNDLESIGNER_KEY_PASS = if ($props['keyPassword']) { $props['keyPassword'] } else { $props['storePassword'] }
try {
  & $java -jar $BundleSigner genbin -v `
    --bundle $aab `
    --bin $OutDir `
    --v2-signing-enabled true `
    --v3-signing-enabled false `
    --ks $storeFile `
    --ks-key-alias $props['keyAlias'] `
    --ks-pass env:BUNDLESIGNER_KS_PASS `
    --key-pass env:BUNDLESIGNER_KEY_PASS
  if ($LASTEXITCODE -ne 0) { throw "bundlesigner genbin failed (exit $LASTEXITCODE)." }
} finally {
  Remove-Item Env:BUNDLESIGNER_KS_PASS, Env:BUNDLESIGNER_KEY_PASS -ErrorAction SilentlyContinue
}

# bundlesigner names the .bin after the bundle cut at its first dot
# (bDefence-0.3.0.aab -> bDefence-0.bin), so move the newest .bin to the expected name.
if (-not (Test-Path $bin)) {
  $found = Get-ChildItem $OutDir -Filter '*.bin' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $found) { throw "genbin reported success but no .bin was written to $OutDir" }
  Move-Item $found.FullName $bin -Force
}

$outputs = @($aab, $bin)
if ($CopyTo) {
  Step "Copying to $CopyTo"
  New-Item -ItemType Directory -Force $CopyTo | Out-Null
  Copy-Item $aab, $bin $CopyTo -Force
  $outputs += (Join-Path $CopyTo (Split-Path $aab -Leaf)), (Join-Path $CopyTo (Split-Path $bin -Leaf))
}

Step 'Done - upload both files to the Cafebazaar developer panel'
Get-Item $outputs | Select-Object FullName, @{ n = 'MB'; e = { [math]::Round($_.Length / 1MB, 2) } }, LastWriteTime |
  Format-Table -AutoSize | Out-String -Width 200 | Write-Host
