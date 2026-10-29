#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "--help" ]; then
  cat <<'HELP'
Install Token Speed Counter for OpenCode Desktop 2.2.1.
Requires Node.js 24+, npm and Git. Quit OpenCode Desktop first.
Downloads/builds the extension and adds it to your global OpenCode configuration.
Existing settings are preserved; changed configuration files are backed up.
Run again to update. No sudo is needed.

Optional: TOKEN_SPEED_INSTALL_DIR, XDG_DATA_HOME, XDG_CONFIG_HOME.
For custom OpenCode configuration overrides, use the manual README instructions.
HELP
  exit 0
fi
if [ "$#" -ne 0 ]; then
  echo 'Unknown argument. Use --help.' >&2
  exit 1
fi
for tool in node npm git; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing prerequisite: $tool. Install Node.js 24 LTS, npm and Git, then rerun this installer." >&2
    exit 1
  fi
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) { console.error("Node.js 24+ is required. Please upgrade Node.js and rerun."); process.exit(1) }'
if [ -n "${OPENCODE_CONFIG:-}" ] || [ -n "${OPENCODE_CONFIG_DIR:-}" ] || [ -n "${OPENCODE_CONFIG_CONTENT:-}" ]; then
  echo 'Custom OpenCode configuration overrides detected. Use the manual installation instructions in README.md.' >&2
  exit 1
fi

install_dir="${TOKEN_SPEED_INSTALL_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/opencode-token-speed-counter}"
case "$install_dir" in
  /*) ;;
  *) echo 'The installation directory must be an absolute path.' >&2; exit 1 ;;
esac
repository='https://github.com/Kxrbx/opencode-token-speed-counter.git'
if [ -e "$install_dir" ]; then
  if [ ! -d "$install_dir/.git" ]; then
    echo "The destination already exists and is not an extension checkout: $install_dir" >&2
    exit 1
  fi
  origin="$(git -C "$install_dir" remote get-url origin)"
  if [ "$origin" != "$repository" ] && [ "$origin" != "${repository%.git}" ]; then
    echo 'The destination has a different Git origin. Nothing was overwritten.' >&2
    exit 1
  fi
  if [ -n "$(git -C "$install_dir" status --porcelain)" ]; then
    echo 'The extension checkout has local changes. Preserve them before updating; nothing was overwritten.' >&2
    exit 1
  fi
  if [ "$(git -C "$install_dir" branch --show-current)" != 'main' ]; then
    echo 'The extension checkout is not on main. Switch branches explicitly before updating.' >&2
    exit 1
  fi
  git -C "$install_dir" pull --ff-only origin main
else
  mkdir -p "$(dirname "$install_dir")"
  git clone --branch main --single-branch "$repository" "$install_dir"
fi

cd "$install_dir"
npm ci --include=dev --no-audit --no-fund
npm run build
npm run install:local
echo 'Installation complete. Restart OpenCode Desktop 2.2.1 and open a main conversation.'
