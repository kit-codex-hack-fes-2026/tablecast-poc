#!/bin/sh
set -eu

# 実行設定をworktree外へ保存し、元のcheckoutを削除してもComposeで管理できる。
tablecast_source=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)
tablecast_directory=${TABLECAST_OBSERVABILITY_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/tablecast/observability}
tablecast_action=${1:-status}
case "$tablecast_action" in
  up)
    umask 077
    mkdir -p "$tablecast_directory"
    if [ ! -f "$tablecast_directory/.env" ]; then
      cat > "$tablecast_directory/.env" <<EOF
TABLECAST_GRAFANA_PORT=${TABLECAST_GRAFANA_PORT:-3300}
TABLECAST_OTLP_PORT=${TABLECAST_OTLP_PORT:-4318}
TABLECAST_TEMPO_PORT=${TABLECAST_TEMPO_PORT:-3320}
TABLECAST_LANGFUSE_PORT=${TABLECAST_LANGFUSE_PORT:-3301}
TABLECAST_LANGFUSE_PUBLIC_KEY=pk-lf-$(openssl rand -hex 16)
TABLECAST_LANGFUSE_SECRET_KEY=sk-lf-$(openssl rand -hex 32)
TABLECAST_LANGFUSE_PASSWORD=$(openssl rand -hex 24)
TABLECAST_LANGFUSE_AUTH_SECRET=$(openssl rand -hex 32)
TABLECAST_LANGFUSE_SALT=$(openssl rand -hex 32)
TABLECAST_LANGFUSE_ENCRYPTION_KEY=$(openssl rand -hex 32)
TABLECAST_STORAGE_SECRET=$(openssl rand -hex 32)
EOF
    fi
    cp "$tablecast_source/infra/observability/compose.yaml" "$tablecast_directory/compose.yaml"
    cp "$tablecast_source/infra/grafana/tempo.yaml" "$tablecast_directory/tempo.yaml"
    ;;
  down|status) ;;
  *) echo 'up / down / statusを指定してください。' >&2; exit 1 ;;
esac
if [ ! -f "$tablecast_directory/compose.yaml" ]; then
  echo '先にtablecast:observability:upで共有観測基盤を準備してください。' >&2
  exit 1
fi
case "$tablecast_action" in
  up) set -- up --detach --wait --wait-timeout 300 ;;
  down) set -- down --timeout 10 ;;
  status) set -- ps ;;
esac
# Compose環境変数がworktree固有のproject名を継承しないように明示する。
exec docker compose --project-name tablecast-observability-local --project-directory "$tablecast_directory" --env-file "$tablecast_directory/.env" -f "$tablecast_directory/compose.yaml" "$@"
