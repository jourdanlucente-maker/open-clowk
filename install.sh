#!/usr/bin/env bash

set -euo pipefail

REPO_URL="https://github.com/jourdanlucente-maker/open-clowk.git"
ARCHIVE_URL="https://github.com/jourdanlucente-maker/open-clowk/archive/refs/heads/main.tar.gz"
SOURCE_DIR="${OPEN_CLOWK_SOURCE_DIR:-${HOME}/.local/share/open-clowk/source}"

say() {
  printf '%s\n' "$*"
}

die() {
  printf 'Open Clowk install: %s\n' "$*" >&2
  exit 1
}

run() {
  say "+ $*"
  "$@"
}

node_major() {
  node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null
}

offer_brew_node() {
  command -v brew >/dev/null 2>&1 || return 1
  if { exec 3<>/dev/tty; } 2>/dev/null && [ -t 3 ]; then
    say "Homebrew is already installed. Open Clowk can ask it to install Node.js."
  else
    return 1
  fi

  local answer=""
  printf 'Run brew install node now? [y/N] ' >&3
  IFS= read -r answer <&3 || answer=""
  exec 3>&-
  case "$answer" in
    y|Y|yes|YES|Yes)
      local brew_status=0
      run brew install node || brew_status=$?
      [ "$brew_status" -eq 0 ] || die "brew install node failed with exit status $brew_status. Homebrew was invoked, so system packages may have changed; read the Homebrew output above, fix the reported problem, then rerun."
      ;;
    *)
      die "Node.js installation declined. Install Node.js 18+ and rerun this script."
      ;;
  esac
}

require_node() {
  local major=""
  if command -v node >/dev/null 2>&1; then
    major="$(node_major || true)"
  fi

  if [ -n "$major" ] && [ "$major" -ge 18 ] 2>/dev/null; then
    command -v npm >/dev/null 2>&1 || die "npm is missing. Install Node.js 18+ with npm, then rerun. See https://nodejs.org/en/download"
    say "Using Node.js $(node --version) and npm $(npm --version)."
    return
  fi

  if [ -n "$major" ]; then
    say "Node.js $(node --version) is too old; Open Clowk requires Node.js 18 or newer."
  else
    say "Node.js was not found; Open Clowk requires Node.js 18 or newer."
  fi

  if ! offer_brew_node; then
    die "Install Node.js 18+ (including npm) from https://nodejs.org/en/download, then rerun. No system packages were changed."
  fi

  command -v node >/dev/null 2>&1 || die "Homebrew finished but node is still unavailable. Open a new shell and rerun."
  major="$(node_major || true)"
  [ -n "$major" ] && [ "$major" -ge 18 ] 2>/dev/null || die "Homebrew did not provide Node.js 18+. Fix Node.js, then rerun."
  command -v npm >/dev/null 2>&1 || die "Homebrew finished but npm is unavailable. Fix Node.js, then rerun."
}

require_platform() {
  local platform
  platform="$(uname -s)"
  case "$platform" in
    Darwin) ;;
    Linux)
      if [ "${XDG_SESSION_TYPE:-}" = "wayland" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
        die "Linux/Wayland is unsupported. Use an X11 session; this script does not add a fallback."
      fi
      ;;
    *) die "unsupported platform: $platform. This installer supports macOS and Linux/X11 only." ;;
  esac
}

is_open_clowk_origin() {
  local url="${1:-}"
  url="${url%/}"
  url="${url%.git}"
  case "$url" in
    https://github.com/jourdanlucente-maker/open-clowk) return 0 ;;
    git@github.com:jourdanlucente-maker/open-clowk) return 0 ;;
    ssh://git@github.com/jourdanlucente-maker/open-clowk) return 0 ;;
  esac
  return 1
}

prepare_with_git() {
  if [ ! -e "$SOURCE_DIR" ]; then
    run mkdir -p "$(dirname "$SOURCE_DIR")"
    run git clone --branch main --single-branch "$REPO_URL" "$SOURCE_DIR"
    return
  fi

  [ -d "$SOURCE_DIR/.git" ] || die "destination already exists and is not a Git checkout: $SOURCE_DIR. Move it aside or choose OPEN_CLOWK_SOURCE_DIR. Nothing was changed."
  local origin
  origin="$(git -C "$SOURCE_DIR" remote get-url origin 2>/dev/null || true)"
  is_open_clowk_origin "$origin" || die "destination is an unknown Git checkout (origin: ${origin:-missing}): $SOURCE_DIR. Only this repository's own HTTPS or SSH GitHub origin is updated. Nothing was changed."
  [ -z "$(git -C "$SOURCE_DIR" status --porcelain)" ] || die "destination has local changes: $SOURCE_DIR. Commit, move, or clean them yourself; nothing was stashed, reset, or overwritten."

  say "Existing clean Open Clowk checkout found. Updating it with a fast-forward only."
  run git -C "$SOURCE_DIR" fetch origin main
  run git -C "$SOURCE_DIR" merge --ff-only origin/main
}

prepare_from_archive() {
  command -v curl >/dev/null 2>&1 || die "Git is unavailable and curl is missing. Install Git, or download the source archive manually from $ARCHIVE_URL."
  command -v tar >/dev/null 2>&1 || die "Git is unavailable and tar is missing. Install Git, or unpack the GitHub source archive manually."
  [ ! -e "$SOURCE_DIR" ] || die "destination already exists: $SOURCE_DIR. Without Git, this installer will not overwrite or update it. Move it aside or choose OPEN_CLOWK_SOURCE_DIR."

  local temp_dir archive extracted
  temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/open-clowk-install.XXXXXX")"
  archive="$temp_dir/open-clowk.tar.gz"
  extracted="$temp_dir/open-clowk-main"
  trap 'rm -rf "$temp_dir"' EXIT
  run curl -fL "$ARCHIVE_URL" -o "$archive"
  say "+ tar -xzf $archive -C $temp_dir"
  tar -xzf "$archive" -C "$temp_dir"
  [ -d "$extracted" ] || die "GitHub archive did not contain the expected open-clowk-main directory."
  run mkdir -p "$(dirname "$SOURCE_DIR")"
  run mv "$extracted" "$SOURCE_DIR"
  rm -rf "$temp_dir"
  trap - EXIT
}

main() {
  require_platform
  require_node
  say "Source destination: $SOURCE_DIR"
  if command -v git >/dev/null 2>&1; then
    prepare_with_git
  else
    say "Git was not found; using the official GitHub source archive."
    prepare_from_archive
  fi
  say "+ cd $SOURCE_DIR"
  cd "$SOURCE_DIR"
  run npm ci
  say "Dependencies installed. Open Clowk will remain attached to this terminal; Ctrl-C stops it."
  run npm start
}

main "$@"
