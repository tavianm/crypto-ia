#!/usr/bin/env bash
# One implementation for Windows, Linux, hooks and initial filesystem checks.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bun "$ROOT/tools/secret-scan.ts" "$@"
