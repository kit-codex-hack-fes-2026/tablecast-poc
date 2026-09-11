# Dev Containerの構成

cloneから起動までの手順は [セットアップ](setup.md#2a-dev-containerを使う) が正本である。

## runtimeと分離

Node 24.7.0、Bun 1.3.13、uv 0.11.26、Python 3.13.12を使用する。LiveKit・Mailpit・Caddyはイメージ内の実行ファイル、Grafana LGTMはComposeの別サービスとして起動する。Docker socketを渡さず、コンテナ内でDockerを必要とするE2EはホストまたはCIで行う。

`tablecast-init.sh` はホストのGit共通ディレクトリとworktree実パスからCompose設定を生成する。メインcheckoutは `main`、追加worktreeはフォルダー名、Codexの同名repoフォルダーでは親のIDを使う。branch名やcommitには依存しない。Compose project・volumeと公開ポートを実パスごとに分離する。

workspaceとGit共通ディレクトリをホストと同じ絶対パスへmountする。依存、仮想環境、`.local`、Webのbuild出力とWrangler状態はLinux用のvolumeで覆い、ホストのmacOS用依存と分ける。Git共通ディレクトリは共有されるため、他worktreeのbranch・設定・indexを変更しない。

コンテナ内のWeb入口はCaddyの3000、Viteは3001。模擬OAuthとLiveKit signalingをCaddy経由の同一originへ集約する。LiveKitのRTC TCP/UDPには公開側と同じポートを渡す。Storybookは6006の全interfaceで待ち受け、ホストにはloopbackだけで公開する。

起動時にWeb/API・LiveKit・OAuth・Mailpitのreadyを確認する。Grafanaの初期化は別に時間がかかることがある。ホストのブラウザーから開発URLへアクセスする。`*.localhost` は同じホスト内の開発用で、実iPad向けのネットワーク構成ではない。

## OrbStackのHTTPS

OrbStackの標準proxyと [自動ドメイン](https://docs.orbstack.dev/docker/domains) を使える。まずinitし、`.devcontainer/.env` の `TABLECAST_CONTAINER_ORIGIN` を `https://<worktree>.<repo>.orb.local` に変更する。具体的なドメインはComposeの `dev.orbstack.domains` ラベルと合わせる。

```sh
sh .devcontainer/tablecast-init.sh
# .devcontainer/.env の TABLECAST_CONTAINER_ORIGIN を編集する
docker compose -f .devcontainer/compose.yaml up -d --build
docker compose -f .devcontainer/compose.yaml exec tablecast bun run setup
docker compose -f .devcontainer/compose.yaml exec tablecast bun run dev
```

エディタのinitializeCommandは生成ファイルを再生成する。エディタでもHTTPSを使う場合は `TABLECAST_CONTAINER_ORIGIN` をホストの起動環境に設定する。Composeでは環境変数が生成ファイルより優先される。originを切り替える前に `bun run dev:stop` を実行し、コンテナを再作成する。

Node製クライアントがmacOSの証明書ストアを使うには `NODE_OPTIONS=--use-system-ca` を指定する。TLS検証を無効化しない。Linuxコンテナはホストの証明書ストアを共有しないため、コンテナ内の試験は既定のlocalhost経路を使う。
