# Goldcom Studio installer for Windows (run once). Paste this line into PowerShell:
#   irm https://raw.githubusercontent.com/0ceanmind/goldcom/claude/friendly-ritchie-ou0783/install/install-windows.ps1 | iex
# It installs Node.js (and Git when possible), downloads Goldcom into your user folder (Goldcom),
# adds a "Goldcom Studio" shortcut to the Desktop and starts it. Running it again updates the install.
# Options, set before running: $env:GOLDCOM_BRANCH (update channel), $env:GOLDCOM_DIR (install folder).

& {
  $Branch = 'claude/friendly-ritchie-ou0783'
  if ($env:GOLDCOM_BRANCH) { $Branch = $env:GOLDCOM_BRANCH }
  $Repo = '0ceanmind/goldcom'
  $Dir = Join-Path $HOME 'Goldcom'
  if ($env:GOLDCOM_DIR) { $Dir = $env:GOLDCOM_DIR }

  $ProgressPreference = 'SilentlyContinue' # the progress bar makes downloads very slow in Windows PowerShell 5
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  function Say([string]$Text) { Write-Host "  $Text" }
  function Has([string]$Name) { [bool](Get-Command $Name -ErrorAction SilentlyContinue) }
  function Refresh-Path {
    # programs installed a moment ago are not on this window's PATH yet
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    $nodeDir = Join-Path $env:ProgramFiles 'nodejs'
    if (Test-Path (Join-Path $nodeDir 'node.exe')) { $env:Path = "$nodeDir;$env:Path" }
  }
  function Node-Major {
    if (-not (Has 'node')) { return 0 }
    try { return [int]((& node -v) -replace '^v(\d+).*$', '$1') } catch { return 0 }
  }
  function Winget-Install([string]$Id) {
    if (-not (Has 'winget')) { return }
    & winget install -e --id $Id --accept-source-agreements --accept-package-agreements | Out-Host
    Refresh-Path
  }
  function Get-Zip {
    # without Git: download the channel as a ZIP and record its version for the studio's updater
    $commit = $null
    try { $commit = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/commits/$Branch" -UserAgent 'goldcom-installer' } catch { }
    $ref = "refs/heads/$Branch"
    if ($commit) { $ref = $commit.sha }
    $parent = Split-Path $Dir -Parent
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    $tmp = Join-Path $parent ('.goldcom-download-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp | Out-Null
    try {
      $zip = Join-Path $tmp 'goldcom.zip'
      Invoke-WebRequest -Uri "https://codeload.github.com/$Repo/zip/$ref" -OutFile $zip -UserAgent 'goldcom-installer' -UseBasicParsing -ErrorAction Stop
      Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $tmp 'x') -Force -ErrorAction Stop
      $top = Get-ChildItem -LiteralPath (Join-Path $tmp 'x') -Directory | Select-Object -First 1
      if (Test-Path -LiteralPath $Dir) { Remove-Item -LiteralPath $Dir -Recurse -Force } # empty folder, checked before
      Move-Item -LiteralPath $top.FullName -Destination $Dir -ErrorAction Stop
    } finally {
      Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($commit) {
      $date = $commit.commit.committer.date
      if ($date -is [datetime]) { $date = $date.ToUniversalTime().ToString('o') }
      $data = Join-Path $Dir 'studio\data'
      New-Item -ItemType Directory -Force -Path $data | Out-Null
      $info = [ordered]@{ repo = $Repo; branch = $Branch; sha = $commit.sha; date = [string]$date; message = ([string]$commit.commit.message -split "`n")[0]; updatedAt = (Get-Date).ToUniversalTime().ToString('o') }
      [IO.File]::WriteAllText((Join-Path $data 'install.json'), ($info | ConvertTo-Json)) # UTF-8 without BOM
    }
  }

  Write-Host ''
  Write-Host '  Goldcom Studio installer' -ForegroundColor Yellow
  Write-Host ''

  # 1. Node.js (required)
  if ((Node-Major) -lt 20) { Refresh-Path }
  if (((Node-Major) -lt 20) -and (Has 'winget')) {
    Say 'Installing Node.js (Windows may ask for permission: click Yes)...'
    Winget-Install 'OpenJS.NodeJS.LTS'
  }
  if ((Node-Major) -lt 20) {
    Say 'Goldcom Studio needs Node.js 20 or newer. Install the LTS version from https://nodejs.org'
    Say '(opening it in your browser now), then paste the install line again.'
    Start-Process 'https://nodejs.org/en/download'
    return
  }

  # 2. Git (optional: makes updates small and fast; without it updates download a ZIP)
  if (-not (Has 'git') -and (Has 'winget')) {
    Say 'Installing Git (for fast updates)...'
    Winget-Install 'Git.Git'
  }

  # 3. Download, or update an existing install
  $studio = Join-Path $Dir 'studio'
  if (Test-Path (Join-Path $studio 'package.json')) {
    $running = $false
    $port = 5177
    if ($env:PORT) { $port = $env:PORT }
    try { $running = (Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 2).name -eq 'goldcom-studio' } catch { }
    if ($running) {
      Say 'Goldcom Studio is already running. Use the Update button inside the studio to update it.'
    } else {
      Say "Updating Goldcom in $Dir ..."
      Push-Location $studio
      try { & node scripts/launcher.mjs update | Out-Host } finally { Pop-Location }
      if ($LASTEXITCODE -ne 0) { Say 'The update did not finish; starting the current version.' }
    }
  } elseif ((Test-Path -LiteralPath $Dir) -and (Get-ChildItem -LiteralPath $Dir -Force | Select-Object -First 1)) {
    Say "The folder $Dir already exists and is not a Goldcom install."
    Say 'Rename or remove it (or set $env:GOLDCOM_DIR to another folder), then run the installer again.'
    return
  } elseif (Has 'git') {
    Say "Downloading Goldcom into $Dir ..."
    & git clone --quiet --branch $Branch "https://github.com/$Repo.git" $Dir | Out-Host
    if ($LASTEXITCODE -ne 0) { Say 'Download failed. Check your internet connection and run the installer again.'; return }
  } else {
    Say "Downloading Goldcom into $Dir ..."
    try { Get-Zip } catch { Say "Download failed: $($_.Exception.Message)"; return }
  }

  # 4. Desktop shortcut (with the Goldcom icon), then start
  Push-Location $studio
  try { & node scripts/launcher.mjs shortcut | Out-Host } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { Say "Could not add the Desktop shortcut. Start Goldcom Studio with: $Dir\Goldcom Studio.cmd" }
  Say 'Starting Goldcom Studio (the first start installs a few components and can take a few minutes)...'
  Start-Process -FilePath (Join-Path $Dir 'Goldcom Studio.cmd') -WorkingDirectory $Dir
  Write-Host ''
  Say 'Done. Next time, double-click "Goldcom Studio" on your Desktop.'
  Write-Host ''
}
