#!/usr/bin/env bash
# Cross-platform entry point for Unix (Linux / macOS).
# Prefer python3; only use python if it is actually Python 3.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v python3 >/dev/null 2>&1; then
  exec python3 "$ROOT/install_host.py"
fi

if command -v python >/dev/null 2>&1; then
  if python -c 'import sys; raise SystemExit(0 if sys.version_info[0] >= 3 else 1)'; then
    exec python "$ROOT/install_host.py"
  fi
  echo "The \"python\" command on PATH is Python 2. Install/use python3 instead." >&2
  exit 1
fi

echo "Python 3 was not found on PATH." >&2
exit 1
