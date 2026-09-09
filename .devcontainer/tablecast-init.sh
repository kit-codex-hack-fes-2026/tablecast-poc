#!/bin/sh
set -eu

# ホスト側のGit配置から命名し、ホストのNode/Bunには依存しない。
tablecast_root=$(CDPATH= cd -- "${1:-.}" && pwd -P)
tablecast_common=$(git -C "$tablecast_root" rev-parse --path-format=absolute --git-common-dir)
tablecast_repository=$(CDPATH= cd -- "$(dirname "$tablecast_common")" && pwd -P)
tablecast_label() {
  tablecast_value=$(printf '%s' "$1" | LC_ALL=C tr '[:upper:]' '[:lower:]' | LC_ALL=C sed 's/[^a-z0-9-][^a-z0-9-]*/-/g; s/^-*//; s/-*$//')
  if [ -z "$tablecast_value" ] || [ "${#tablecast_value}" -gt 63 ]; then
    echo 'worktree名とrepo名には短い英数字の名前を使用してください。' >&2
    exit 1
  fi
  printf '%s' "$tablecast_value"
}
tablecast_repo=$(tablecast_label "$(basename "$tablecast_repository")")
if [ "$tablecast_root" = "$tablecast_repository" ]; then
  tablecast_name=main
else
  tablecast_name=$(tablecast_label "$(basename "$tablecast_root")")
fi
printf 'TABLECAST_WORKTREE_NAME=%s\nTABLECAST_REPO_NAME=%s\nTABLECAST_CONTAINER_ORIGIN=http://%s.%s.container.localhost:3000\n' "$tablecast_name" "$tablecast_repo" "$tablecast_name" "$tablecast_repo" > "$tablecast_root/.devcontainer/.env"
