#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PID="${1:-$(pgrep -n -f '[o]utwars.exe' || true)}"
if [[ -z "${PID}" ]]; then
  echo "Outwars is not running. Start it under Wine, load into a mission, then run this script." >&2
  echo "List candidate processes with: pgrep -af outwars.exe" >&2
  exit 2
fi
if ! command -v gdb >/dev/null 2>&1; then
  echo "GDB is required. On Ubuntu/Debian: sudo apt install gdb" >&2
  exit 2
fi
echo "Attaching GDB to Outwars PID ${PID}"
echo "Use the male Scout for 15-30 seconds. Then Ctrl-C here, type detach, then quit."
exec gdb -q -p "${PID}" -x "${SCRIPT_DIR}/capture-scout-runtime-links.gdb"
