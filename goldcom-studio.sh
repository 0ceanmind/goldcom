#!/usr/bin/env bash
# Goldcom Studio launcher (Linux; macOS uses "Goldcom Studio.command", which runs this file).
# Installs components / builds the editor when needed, starts the studio, opens the browser,
# and starts the studio again after an in-app update (the server exits with code 75).

cd "$(dirname "$0")/studio" 2>/dev/null || { echo "Could not find the studio folder next to this launcher."; exit 1; }
[ -t 1 ] && printf '\033]0;Goldcom Studio\007'

pause() {
  { : </dev/tty; } 2>/dev/null && read -r -p "  Press Enter to close this window. " _ </dev/tty
}

# Started from Finder or an app menu, PATH may miss the usual Node.js locations.
export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
fi

major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)"
case "$major" in '' | *[!0-9]*) major=0 ;; esac
if [ "$major" -lt 20 ]; then
  echo
  echo "  Goldcom Studio needs Node.js 20 or newer."
  if [ "$(uname)" = "Darwin" ]; then
    echo "  Install the LTS version from https://nodejs.org (or run: brew install node),"
  else
    echo "  Install the LTS version from https://nodejs.org or your package manager,"
  fi
  echo "  then start Goldcom Studio again."
  echo
  pause
  exit 1
fi

node scripts/launcher.mjs prepare
rc=$?
[ "$rc" -eq 3 ] && exit 0 # already running: the browser was opened
if [ "$rc" -ne 0 ]; then
  echo
  echo "  Goldcom Studio could not start. See the messages above."
  pause
  exit 1
fi

node scripts/launcher.mjs open >/dev/null 2>&1 &
opener=$!
trap 'kill "$opener" 2>/dev/null' EXIT

export GOLDCOM_LAUNCHER=1
while :; do
  node server/index.mjs
  code=$?
  [ "$code" -ne 75 ] && break
  echo
  echo "  Restarting Goldcom Studio..."
  node scripts/launcher.mjs prepare --restart || { pause; exit 1; }
done

[ "$code" -eq 0 ] && exit 0
echo
echo "  Goldcom Studio stopped unexpectedly (code $code)."
pause
exit "$code"
