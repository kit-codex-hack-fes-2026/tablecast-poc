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
elif [ "$(basename "$tablecast_root")" = "$(basename "$tablecast_repository")" ]; then
  tablecast_name=$(tablecast_label "$(basename "$(dirname "$tablecast_root")")")
else
  tablecast_name=$(tablecast_label "$(basename "$tablecast_root")")
fi
# worktreeごとにCompose資源と公開ポートを分け、再起動でも同じ値を使う。
# 衝突する場合はホストでTABLECAST_PORT_BASEを指定して再生成する。
tablecast_checksum=$(printf '%s' "$tablecast_root" | cksum | cut -d ' ' -f 1)
tablecast_base=${TABLECAST_PORT_BASE:-$((40000 + tablecast_checksum % 2000 * 10))}
case "$tablecast_base" in
  ''|*[!0-9]*) echo 'TABLECAST_PORT_BASEには整数を指定してください。' >&2; exit 1 ;;
esac
if [ "$tablecast_base" -lt 1024 ] || [ "$tablecast_base" -gt 65526 ]; then
  echo 'TABLECAST_PORT_BASEは1024から65526の範囲で指定してください。' >&2
  exit 1
fi
# Composeの単一引用符でパス中の空白・$を保持する。
tablecast_quote() { printf "%s" "$1" | sed "s/'/\\\\'/g"; }
umask 077
cat > "$tablecast_root/.devcontainer/.env" <<EOF
COMPOSE_PROJECT_NAME=tablecast-$tablecast_checksum
TABLECAST_WORKTREE_NAME=$tablecast_name
TABLECAST_REPO_NAME=$tablecast_repo
TABLECAST_WORKSPACE_FOLDER='$(tablecast_quote "$tablecast_root")'
TABLECAST_GIT_COMMON_DIR='$(tablecast_quote "$tablecast_common")'
TABLECAST_CONTAINER_ORIGIN=http://$tablecast_name.$tablecast_repo.container.localhost:$tablecast_base
TABLECAST_WEB_PORT=$tablecast_base
TABLECAST_MAILPIT_PORT=$((tablecast_base + 1))
TABLECAST_RTC_TCP_PORT=$((tablecast_base + 2))
TABLECAST_RTC_UDP_PORT=$((tablecast_base + 3))
TABLECAST_STORYBOOK_PORT=$((tablecast_base + 4))
TABLECAST_GRAFANA_PORT=$((tablecast_base + 5))
TABLECAST_TEMPO_PORT=$((tablecast_base + 6))
EOF
