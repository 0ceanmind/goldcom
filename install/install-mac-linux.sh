#!/usr/bin/env bash
# Goldcom Studio installer for macOS and Linux (run once). Paste this line into Terminal:
#   curl -fsSL https://raw.githubusercontent.com/0ceanmind/goldcom/claude/friendly-ritchie-ou0783/install/install-mac-linux.sh | bash
# It downloads Goldcom into ~/Goldcom, adds a shortcut (Desktop on macOS, app menu on Linux) and starts it.
# Running it again updates the install. Options: GOLDCOM_BRANCH (update channel), GOLDCOM_DIR (install folder).

BRANCH="${GOLDCOM_BRANCH:-claude/friendly-ritchie-ou0783}"
REPO="0ceanmind/goldcom"
DIR="${GOLDCOM_DIR:-$HOME/Goldcom}"

say() { printf '  %s\n' "$*"; }
is_mac() { [ "$(uname)" = "Darwin" ]; }

node_ok() {
  local major
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)"
  case "$major" in '' | *[!0-9]*) return 1 ;; esac
  [ "$major" -ge 20 ]
}

git_ok() {
  command -v git >/dev/null 2>&1 || return 1
  # macOS: /usr/bin/git is a stub that pops up an "install developer tools" dialog
  if is_mac && [ "$(command -v git)" = "/usr/bin/git" ]; then xcode-select -p >/dev/null 2>&1 || return 1; fi
  git --version >/dev/null 2>&1
}

# Without git: download the channel as a tarball and record its version for the studio's updater.
download_archive() {
  local meta sha tmp
  meta="$(curl -fsSL -H 'User-Agent: goldcom-installer' "https://api.github.com/repos/$REPO/commits/$BRANCH" 2>/dev/null)"
  sha="$(printf '%s' "$meta" | node -e 'let s = ""; process.stdin.on("data", (d) => { s += d; }).on("end", () => { try { process.stdout.write(JSON.parse(s).sha || ""); } catch {} });')"
  mkdir -p "$(dirname "$DIR")" || return 1
  tmp="$(mktemp -d "$(dirname "$DIR")/.goldcom-download.XXXXXX")" || return 1
  if ! curl -fsSL "https://codeload.github.com/$REPO/tar.gz/${sha:-refs/heads/$BRANCH}" | tar -xzf - -C "$tmp"; then
    rm -rf "$tmp"
    return 1
  fi
  rmdir "$DIR" 2>/dev/null
  if ! mv "$tmp"/* "$DIR"; then
    rm -rf "$tmp"
    return 1
  fi
  rm -rf "$tmp"
  [ -n "$sha" ] && printf '%s' "$meta" | node -e '
    const fs = require("fs"), path = require("path");
    const [file, repo, branch] = process.argv.slice(1);
    let s = "";
    process.stdin.on("data", (d) => { s += d; }).on("end", () => {
      try {
        const c = JSON.parse(s);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const info = { repo, branch, sha: c.sha, date: c.commit.committer.date, message: c.commit.message.split("\n")[0], updatedAt: new Date().toISOString() };
        fs.writeFileSync(file, JSON.stringify(info, null, 2) + "\n");
      } catch {}
    });' "$DIR/studio/data/install.json" "$REPO" "$BRANCH"
  return 0
}

# Everything runs inside main() so `curl | bash` has read the whole script before anything starts.
main() {
  echo
  say "Goldcom Studio installer"
  echo

  # 1. Node.js (required)
  export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"
  if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; fi
  if ! node_ok && is_mac && command -v brew >/dev/null 2>&1; then
    say "Installing Node.js with Homebrew..."
    brew install node </dev/null
  fi
  if ! node_ok; then
    say "Goldcom Studio needs Node.js 20 or newer."
    if is_mac; then
      say "Install the LTS version from https://nodejs.org (or run: brew install node),"
      open "https://nodejs.org/en/download" 2>/dev/null
    else
      say "Install the LTS version from https://nodejs.org or your package manager,"
    fi
    say "then paste the install line again."
    exit 1
  fi

  # 2. Download, or update an existing install (git makes updates fast; without it a tarball is used)
  if [ -f "$DIR/studio/package.json" ]; then
    if curl -fsS --noproxy '*' --max-time 2 "http://127.0.0.1:${PORT:-5177}/api/health" 2>/dev/null | grep -q goldcom-studio; then
      say "Goldcom Studio is already running. Use the Update button inside the studio to update it."
    else
      say "Updating Goldcom in $DIR ..."
      (cd "$DIR/studio" && node scripts/launcher.mjs update) </dev/null || say "The update did not finish; starting the current version."
    fi
  elif [ -d "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then
    say "The folder $DIR already exists and is not a Goldcom install."
    say "Rename or remove it (or set GOLDCOM_DIR to another folder), then run the installer again."
    exit 1
  elif git_ok; then
    say "Downloading Goldcom into $DIR ..."
    git clone --quiet --branch "$BRANCH" "https://github.com/$REPO.git" "$DIR" </dev/null || { say "Download failed. Check your internet connection and run the installer again."; exit 1; }
  else
    say "Downloading Goldcom into $DIR ..."
    download_archive || { say "Download failed. Check your internet connection and run the installer again."; exit 1; }
  fi
  chmod +x "$DIR/goldcom-studio.sh" "$DIR/Goldcom Studio.command" 2>/dev/null

  # 3. Shortcut, then start
  (cd "$DIR/studio" && node scripts/launcher.mjs shortcut) </dev/null || say "Could not add the shortcut. Start Goldcom Studio with: $DIR/goldcom-studio.sh"
  echo
  if is_mac; then
    say "Starting Goldcom Studio in a new Terminal window (the first start can take a few minutes)..."
    open "$DIR/Goldcom Studio.command"
    say "Done. Next time, double-click \"Goldcom Studio\" on your Desktop."
    echo
  else
    say "Done. Next time, open \"Goldcom Studio\" from your applications menu."
    say "Starting Goldcom Studio now (the first start can take a few minutes; keep this window open)..."
    echo
    if { : </dev/tty; } 2>/dev/null; then exec bash "$DIR/goldcom-studio.sh" </dev/tty; fi
    exec bash "$DIR/goldcom-studio.sh"
  fi
}

main "$@"
