# Dev Container

Node 24.7、Bun 1.3.13、uv 0.10.9、Python 3.13.12 と LiveKit・Mailpit・Caddy を固定した開発イメージを使用する。ホストのDocker socketは渡さない。コンテナ内の音声Agentも同じPython lockを利用する。

ホスト側にはDockerとGitが必要。Dev Containers対応エディタでこのフォルダーを開くと、依存の導入後に `bun run dev` が起動する。Docker CLIからも同じ構成を起動できる。

```sh
sh .devcontainer/tablecast-init.sh
docker compose -f .devcontainer/compose.yaml up -d --build
docker compose -f .devcontainer/compose.yaml exec tablecast sh -c 'bun --no-env-file install --frozen-lockfile && uv sync --project livekit --frozen && bun run dev'
```

Docker Desktopでは `http://<worktree>.<repo>.container.localhost:3000`（このcheckoutでは `http://main.tablecast-poc.container.localhost:3000`）、メール一覧は `http://localhost:8025`。パスキーやマイクに必要なsecure contextはlocalhostとそのサブドメインの例外を使用する。通常起動とは `.container.` でホスト名を分け、Cookieの共有を防ぐ。ホストでの `.local`、`node_modules`、Python仮想環境とコンテナのものは別ボリュームに保存する。

## OrbStack

```sh
sh .devcontainer/tablecast-init.sh
. .devcontainer/.env
TABLECAST_CONTAINER_ORIGIN="https://${TABLECAST_WORKTREE_NAME}.${TABLECAST_REPO_NAME}.orb.local" docker compose -f .devcontainer/compose.yaml up -d --build
```

エディタの `initializeCommand`、または上記の初期化コマンドがホストのworktree名とrepo名を `.devcontainer/.env` へ保存する。メインcheckoutのworktree名は `main`、追加worktreeはフォルダー名を使う。Gitのbranch名やcommit hashには依存しない。

コンテナの `dev.orbstack.domains` と `dev.orbstack.http-port` ラベルにより `https://<worktree>.<repo>.orb.local`（このcheckoutでは `https://main.tablecast-poc.orb.local`） で開く。OrbStackのHTTPSプロキシを使用する。起動コマンドは上と同じ。originを変更したら `bun run dev:stop` の後で再起動する。Googleの模擬OAuthとLiveKitのシグナリングはCaddyを経由し、同一originのHTTPS/WSSで提供する。

複数checkoutの同時起動ではComposeのproject名、公開ポート、OrbStackドメインを別のoverrideファイルで割り当てる。ホスト側の通常起動では従来通りworktree別のポート予約を使用する。

## 停止とデータ

```sh
docker compose -f .devcontainer/compose.yaml exec tablecast bun run dev:stop
docker compose -f .devcontainer/compose.yaml down
```

`down` はデータボリュームを保持する。リセットしたい場合だけコンテナ内の `bun run demo:reset` を使用する。ホスト側のデモ状態には影響しない。

外部音声サービスを使用するには既存の `.env.secrets.local` を用意する。未設定ならGUIと認証・メールの開発は利用でき、音声Agentは停止する。公開環境のGoogle・Cloudflare送信ドメインとは別設定になる。

OrbStackのHTTPSをNode製クライアントから検証する場合、macOSの証明書ストアを参照する `NODE_OPTIONS=--use-system-ca` を設定する。TLS検証自体は無効化しない。
