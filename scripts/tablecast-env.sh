#!/bin/sh
set -eu
[ "${TABLECAST_CONTAINER:-0}" != 1 ] || exec bun exec "$@"
tablecast_branch=$(git branch --show-current)
tablecast_name=${tablecast_branch##*/}
[ -n "$tablecast_name" ] || tablecast_name=$(git rev-parse --short=8 HEAD)
export TABLECAST_WORKTREE_NAME=$(printf '%s' "$tablecast_name" | LC_ALL=C tr '[:upper:]' '[:lower:]' | LC_ALL=C sed 's/[^a-z0-9-][^a-z0-9-]*/-/g; s/^-*//; s/-*$//' | cut -c1-47 | sed 's/-*$//')
[ -n "$TABLECAST_WORKTREE_NAME" ] || { echo 'branch名に英数字を含めてください。' >&2; exit 1; }
export TABLECAST_HOST="$TABLECAST_WORKTREE_NAME.tablecast-poc"
export COMPOSE_PROJECT_NAME="tablecast-$TABLECAST_WORKTREE_NAME"
export PORTLESS_HTTPS=0 PORTLESS_PORT=${PORTLESS_PORT:-80}
exec bun exec "$@"
