#Requires -Version 5.1
# Install Token Speed Counter for OpenCode Desktop 2.2.1 on Windows.
$ErrorActionPreference = "Stop"

$help = @"
Install Token Speed Counter for OpenCode Desktop 2.2.1.
Requires Node.js 24+, npm and Git. Quit OpenCode Desktop first.
Downloads/builds the extension and adds it to your global OpenCode configuration.
Existing settings are preserved; changed configuration files are backed up.
Run again to update. No administrator is needed.

Optional: TOKEN_SPEED_INSTALL_DIR, XDG_DATA_HOME, XDG_CONFIG_HOME.
For custom OpenCode configuration overrides, use the manual README instructions.
"@

if ($args.Count -gt 0) {
  if ($args[0] -eq "--help") { Write-Output $help; exit 0 }
  Write-Error "Unknown argument. Use --help."
  exit 1
}

foreach ($tool in @("node", "npm", "git")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Write-Error "Missing prerequisite: $tool. Install Node.js 24 LTS, npm and Git, then rerun this installer."
    exit 1
  }
}
# No string literals here: PowerShell 5.1 strips double quotes inside single-quoted native arguments.
node -e 'process.exit(Number(process.versions.node.match(/[0-9]+/)[0])<24?1:0)'
if ($LASTEXITCODE -ne 0) {
  Write-Error "Node.js 24+ is required. Please upgrade Node.js and rerun."
  exit 1
}

if ($env:OPENCODE_CONFIG -or $env:OPENCODE_CONFIG_DIR -or $env:OPENCODE_CONFIG_CONTENT) {
  Write-Error "Custom OpenCode configuration overrides detected. Use the manual installation instructions in README.md."
  exit 1
}

$installDir = $env:TOKEN_SPEED_INSTALL_DIR
if (-not $installDir) {
  if ($env:XDG_DATA_HOME) { $installDir = Join-Path $env:XDG_DATA_HOME "opencode-token-speed-counter" }
  else { $installDir = Join-Path $env:LOCALAPPDATA "opencode-token-speed-counter" }
}
if (-not [System.IO.Path]::IsPathRooted($installDir)) {
  Write-Error "The installation directory must be an absolute path."
  exit 1
}

$repository = "https://github.com/Kxrbx/opencode-token-speed-counter.git"
$repositoryBase = $repository
if ($repositoryBase.EndsWith(".git")) { $repositoryBase = $repositoryBase.Substring(0, $repositoryBase.Length - 4) }

if (Test-Path $installDir) {
  if (-not (Test-Path (Join-Path $installDir ".git"))) {
    Write-Error "The destination already exists and is not an extension checkout: $installDir"
    exit 1
  }
  $origin = (git -C $installDir remote get-url origin)
  if ($LASTEXITCODE -ne 0) { $origin = "" }
  if ($origin -ne $repository -and $origin -ne $repositoryBase) {
    Write-Error "The destination has a different Git origin. Nothing was overwritten."
    exit 1
  }
  $status = @(git -C $installDir status --porcelain)
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  if ($status.Count -gt 0) {
    Write-Error "The extension checkout has local changes. Preserve them before updating; nothing was overwritten."
    exit 1
  }
  $branch = (git -C $installDir branch --show-current)
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  if ("$branch".Trim() -ne "main") {
    Write-Error "The extension checkout is not on main. Switch branches explicitly before updating."
    exit 1
  }
  git -C $installDir pull --ff-only origin main
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
else {
  $parent = Split-Path $installDir -Parent
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  git clone --branch main --single-branch $repository $installDir
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Set-Location $installDir
npm ci --include=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run install:local
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output "Installation complete. Restart OpenCode Desktop 2.2.1 and open a main conversation."
