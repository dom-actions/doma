#!/usr/bin/env bash
# DomA MCP installer — installs stdio + daemon + local auth into ~/.doma/mcp
# Usage:
#   curl -fsSL https://res.stayfork.app/d/install-doma-mcp.sh | bash
set -euo pipefail

BASE_URL="${DOMA_MCP_BASE_URL:-https://res.stayfork.app/d}"
INSTALL_DIR="${DOMA_MCP_HOME:-$HOME/.doma/mcp}"
STDIO_URL="${BASE_URL}/doma_mcp_stdio.py"
DAEMON_URL="${BASE_URL}/doma_bridge_daemon.py"
AUTH_URL="${BASE_URL}/bridge_auth.py"

echo "[DomA] install dir: $INSTALL_DIR"

# Git Bash / MSYS / MinGW / Cygwin on Windows (uname is e.g. MSYS_NT-10.0-26300)
is_windows() {
  case "$(uname -s 2>/dev/null)" in
    MSYS*|MINGW*|CYGWIN*|Windows_NT) return 0 ;;
  esac
  case "${OS:-}" in
    Windows_NT) return 0 ;;
  esac
  return 1
}

# Native path for Cursor / Windows MCP (Git Bash otherwise prints /c/Users/...)
to_native_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$p"
  else
    echo "$p"
  fi
}

python_ok() {
  local bin="$1"
  shift
  "$bin" "$@" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null
}

# Sets PYTHON_BIN and PYTHON_PREFIX_ARGS (e.g. py -3)
PYTHON_BIN=""
PYTHON_PREFIX_ARGS=()

resolve_python() {
  PYTHON_BIN=""
  PYTHON_PREFIX_ARGS=()
  local cand
  for cand in python3 python; do
    if command -v "$cand" >/dev/null 2>&1 && python_ok "$cand"; then
      PYTHON_BIN="$(command -v "$cand")"
      return 0
    fi
  done
  # Windows launcher (python.org / Store)
  if command -v py >/dev/null 2>&1 && python_ok py -3; then
    PYTHON_BIN="$(command -v py)"
    PYTHON_PREFIX_ARGS=(-3)
    return 0
  fi
  # Git Bash PATH often omits python.org installs
  if is_windows; then
    local exe
    for exe in \
      "${LOCALAPPDATA:-}/Programs/Python/"*/python.exe \
      "/c/Windows/py.exe" \
      "/c/Windows/System32/py.exe"; do
      [[ -e "$exe" ]] || continue
      case "$exe" in
        */py.exe)
          if python_ok "$exe" -3; then
            PYTHON_BIN="$exe"
            PYTHON_PREFIX_ARGS=(-3)
            return 0
          fi
          ;;
        *)
          if python_ok "$exe"; then
            PYTHON_BIN="$exe"
            return 0
          fi
          ;;
      esac
    done
  fi
  return 1
}

have_python() {
  resolve_python
}

install_python_macos() {
  if command -v brew >/dev/null 2>&1; then
    echo "[DomA] installing Python via Homebrew…"
    brew install python3
    return 0
  fi
  echo "[DomA] Homebrew not found. Installing Homebrew (may prompt for password)…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Apple Silicon brew path
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
  brew install python3
}

install_python_linux() {
  if command -v apt-get >/dev/null 2>&1; then
    echo "[DomA] installing Python via apt (may prompt for sudo)…"
    sudo apt-get update -y
    sudo apt-get install -y python3
    return 0
  fi
  if command -v dnf >/dev/null 2>&1; then
    echo "[DomA] installing Python via dnf…"
    sudo dnf install -y python3
    return 0
  fi
  if command -v yum >/dev/null 2>&1; then
    echo "[DomA] installing Python via yum…"
    sudo yum install -y python3
    return 0
  fi
  if command -v pacman >/dev/null 2>&1; then
    echo "[DomA] installing Python via pacman…"
    sudo pacman -Sy --noconfirm python
    return 0
  fi
  echo "[DomA] ERROR: no supported package manager. Install Python 3.9+ manually." >&2
  exit 1
}

ensure_python() {
  if have_python; then
    echo "[DomA] Python OK: $PYTHON_BIN ${PYTHON_PREFIX_ARGS[*]} ($("$PYTHON_BIN" "${PYTHON_PREFIX_ARGS[@]}" -V 2>&1))"
    return 0
  fi
  if is_windows; then
    echo "[DomA] ERROR: Python 3.9+ not on PATH in this shell ($(uname -s))." >&2
    echo "[DomA] Official Windows installer provides 'python' or 'py -3', not always 'python3'." >&2
    echo "[DomA] Fix: close this terminal, reopen Git Bash from a session where" >&2
    echo "[DomA]   python -V    or    py -3 -V" >&2
    echo "[DomA] works, then re-run this installer. Or add Python to PATH and retry." >&2
    exit 1
  fi
  echo "[DomA] Python 3.9+ not found; installing…"
  case "$(uname -s)" in
    Darwin) install_python_macos ;;
    Linux) install_python_linux ;;
    *)
      echo "[DomA] ERROR: unsupported OS $(uname -s). Install Python 3.9+ manually." >&2
      exit 1
      ;;
  esac
  if ! have_python; then
    echo "[DomA] ERROR: Python still missing after install." >&2
    exit 1
  fi
  echo "[DomA] Python OK: $PYTHON_BIN ${PYTHON_PREFIX_ARGS[*]} ($("$PYTHON_BIN" "${PYTHON_PREFIX_ARGS[@]}" -V 2>&1))"
}

download() {
  local url="$1"
  local out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$out"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$out" "$url"
  else
    echo "[DomA] ERROR: need curl or wget" >&2
    exit 1
  fi
}

ensure_python
mkdir -p "$INSTALL_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "[DomA] downloading stdio…"
download "$STDIO_URL" "$TMP/doma_mcp_stdio.py"
echo "[DomA] downloading daemon…"
download "$DAEMON_URL" "$TMP/doma_bridge_daemon.py"
echo "[DomA] downloading local auth helper…"
download "$AUTH_URL" "$TMP/bridge_auth.py"

# basic sanity
"$PYTHON_BIN" "${PYTHON_PREFIX_ARGS[@]}" -m py_compile "$TMP/doma_mcp_stdio.py" "$TMP/doma_bridge_daemon.py" "$TMP/bridge_auth.py"

install -m 644 "$TMP/bridge_auth.py" "$INSTALL_DIR/bridge_auth.py"
install -m 755 "$TMP/doma_mcp_stdio.py" "$INSTALL_DIR/doma_mcp_stdio.py"
install -m 755 "$TMP/doma_bridge_daemon.py" "$INSTALL_DIR/doma_bridge_daemon.py"

STDIO_ABS="$(cd "$INSTALL_DIR" && pwd)/doma_mcp_stdio.py"
STDIO_NATIVE="$(to_native_path "$STDIO_ABS")"
PY_NATIVE="$(to_native_path "$PYTHON_BIN")"

echo ""
echo "[DomA] installed successfully."
echo "[DomA] Paste the following into your MCP client config (e.g. Cursor ~/.cursor/mcp.json):"
echo ""
# Machine-readable block for UIs that scrape between markers
echo "-----BEGIN DOMA_MCP_JSON-----"
DOMA_MCP_CMD="$PY_NATIVE" DOMA_MCP_STDIO="$STDIO_NATIVE" DOMA_MCP_PREFIX="${PYTHON_PREFIX_ARGS[*]}" \
"$PYTHON_BIN" "${PYTHON_PREFIX_ARGS[@]}" - <<'PY'
import json, os
cmd = os.environ["DOMA_MCP_CMD"]
stdio = os.environ["DOMA_MCP_STDIO"]
prefix = [p for p in os.environ.get("DOMA_MCP_PREFIX", "").split() if p]
print(json.dumps({
  "mcpServers": {
    "DomA": {
      "command": cmd,
      "args": prefix + [stdio],
    }
  }
}, indent=2, ensure_ascii=False))
PY
echo "-----END DOMA_MCP_JSON-----"
echo ""
