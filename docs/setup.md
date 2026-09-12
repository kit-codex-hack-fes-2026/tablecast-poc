# 開発環境のセットアップ

[仕様索引](README.md) · [開発環境の仕組み](development.md) · [テスト戦略](testing.md)

macOSではHomebrewと、起動済みのOrbStackまたはDocker Desktopを使う。ホスト開発でもLiveKit・Mailpit・GrafanaにはDockerが必要である。外部APIキーなしでGUI注文・ログイン・メールを開発できる。Composeは2.24.4以降を使い、`docker compose version` で確認する（Dev Containerの[ポート置換](https://docs.docker.com/reference/compose-file/merge/#replace-value)に必要）。

> [!TIP]
> `package.json` に実行するCLI、`turbo.json` に順序と常駐タスクを記載する。WebはTurborepo、コンテナ資源はCompose、Pythonはuvで管理する。独自のdaemonや起動ラッパーは使わない。

## 1. cloneとworktree

Gitがなければ `brew install git`、GitHub CLIを使う場合は `brew install gh` を実行する。着手するIssueと担当は [AGENTS.md](../AGENTS.md#作業契約) に従って確認する。

```sh
git clone https://github.com/kit-codex-hack-fes-2026/tablecast-poc.git
cd tablecast-poc
git fetch origin
git worktree add -b codex/my-change ../tablecast-my-change origin/main
cd ../tablecast-my-change
```

`my-change` は作業内容に置き換える。既存branchは `git worktree add ../tablecast-my-change codex/my-change` で開く。以降は作業先のworktreeルートで実行する。

> [!IMPORTANT]
> `node_modules`、`livekit/.venv`、`.local` はworktree間でコピーしない。Git標準のworktree作成では環境ファイルもコピーされない。Codexの `.worktreeinclude` は `.env.local` のみを対象にする。

## 2A. Dev Containerを使う

ホストにNode・Bun・uv・Pythonは不要。Dev Containers対応エディタでworktreeを開き、Reopen in Containerを実行する。初期化が `.devcontainer/.env` を生成し、`postCreateCommand` が `bun run setup` を実行する。

コンテナのターミナルで起動する。

```sh
bun run dev:container
```

Docker CLIだけでも同じ構成を使える。

```sh
sh .devcontainer/tablecast-init.sh
docker compose -f .devcontainer/compose.yaml up -d --build
docker compose -f .devcontainer/compose.yaml exec tablecast bun run setup
docker compose -f .devcontainer/compose.yaml exec tablecast bun run dev:container
```

起動ログの `http://<worktree>.<repo>.container.localhost:<port>` をホストのブラウザーで開く。shellは `docker compose -f .devcontainer/compose.yaml exec tablecast bash` で開ける。

ホストと同じ絶対パスへworktreeとGit共通ディレクトリをmountするため、コンテナ内でもGit操作ができる。worktreeの作成・削除はホストで行う。Linux依存・Python環境・DBは専用volumeへ保存する。

```sh
docker compose -f .devcontainer/compose.yaml port tablecast 8025
docker compose -f .devcontainer/compose.yaml port tablecast-lgtm 3000
docker compose -f .devcontainer/compose.yaml port tablecast 6006
```

上からMailpit・Grafana・Storybookの公開ポートを確認できる。Storybookはコンテナ内で別途 `bun run storybook --host 0.0.0.0` を実行する。[OrbStackのHTTPS設定](devcontainer.md)も参照できる。

> [!NOTE]
> Docker socketは渡さない。Dockerを直接使うE2Eは2BのホストかCIで実行する。コンテナ内のブラウザー試験には `bunx --no-install playwright install --with-deps chromium webkit` が必要。実iPadはlocalhostへ接続できないため、[実機試験](development.md#実機公開環境)を参照する。

## 2B. ホストでmise・uv・Bunを使う

[miseの公式手順](https://mise.jdx.dev/getting-started.html)に従ってzshで有効化する。`.zshrc` への追記は未設定の場合に一度だけ行う。

```sh
brew install mise
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
eval "$(mise activate zsh)"
mise trust
mise install
bun --version
node --version
uv --version
docker info
bun run setup
bun run dev
```

[mise.toml](../mise.toml)がNode 24.7.0、Bun 1.3.13、uv 0.11.26を指定する。Python 3.13はuvが取得する。`setup` は固定lockでJS/Python依存とhooksを導入し、Paraglideを生成する。追加worktreeでも `mise trust`、`mise install`、`bun run setup` を実行する。

`dev` は `turbo run dev --filter=@tablecast/web` を実行する。`dependsOn` で設定・migration・seed・Compose起動を先に済ませ、`with` でOAuthとproxyも起動する。WebとAPI WorkerはViteのmultiworkerを使い、APIを二重起動しない。

起動ログの `http://<worktree>.<repo>.localhost:<port>` を開く。ポート・DB・Cookieホスト名はworktreeごとに分離する。起動中はターミナルを開いたままにする。

## 2C. agent開発環境

Codex Desktopでは作業するworktreeをprojectとして開き、CLIではそのルートから `codex` を起動する。以下は開発者が必要な接続だけを選ぶ手順である。`bun run setup` はアプリ依存・生成物・Git hooksを準備し、agent pluginの導入や外部サービスへのログインは行わない。

| 構成                     | 役割と正本                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`・repo skills | 作業契約と用途別の手順。cloneした [.agents/skills](../.agents/skills) を使う。外部skillの取得元は [skills-lock.json](../skills-lock.json) に記録する             |
| Agent plugins            | Cloudflare等が配布するskills・MCPのまとまり。CodexのPlugins画面または `codex plugin` で必要なものを導入する                                                      |
| MCP                      | 外部サービスやローカルツールへの接続。plugin同梱設定、または利用者の `.codex/config.toml` で管理する                                                             |
| Git hooks                | [lefthook.yml](../lefthook.yml) のcommit時検査。`bun run setup` が導入し、修復は `bun run hooks:install`。検証の分担は [静的解析](static-analysis.md) を参照する |

repo skillsは個人のglobal skillsへコピーしない。同じ外部skillをpluginとglobal配置の両方から導入済みなら、取得元と適用対象を確認して一方を選ぶ。各タスクでは `AGENTS.md` の入口から必要なskill本文と参照先を読む。skillsの所有・更新は [静的解析](static-analysis.md#skillsと追加pluginの所有) に従う。

### MCP設定の配置と確認

worktree固有の接続はGit管理外の `.codex/config.toml` に置く。個人共通の設定は `~/.codex/config.toml` に置き、既存ファイルを雛形で上書きしない。[設定例](../.codex/config.toml.example)から必要なサーバーのテーブルだけを統合する。Codexは信頼済みprojectの設定を読む。CLIの `codex mcp list` またはDesktopのMCP設定で登録状態を確認し、変更後は接続を再起動する。[公式のMCP設定](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)を参照する。

MCPはCodexが動くホストから接続する。Dev Container内でCLIを動かす場合はコンテナ内のコマンドとURL、ホストのDesktopを使う場合はホストから到達できるURLを選ぶ。設定の登録、OAuth認可、toolの読取成功を区別し、値を含むconfigや認証情報をチャットへ貼らない。

| 接続          | 導入・認証と確認                                                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare    | 公式Cloudflare pluginを導入し、同梱MCPのOAuthで対象アカウントと必要な権限を選ぶ。API仕様検索や許可した設定の読取で確認する                                        |
| Grafana local | LGTM起動後に設定例の `tablecast-grafana-local` を追加する。ホストはDocker、Dev Container内は同梱binaryを使う                                                      |
| Grafana Cloud | `tablecast-grafana-cloud` を追加する。Viewer service account tokenを `.local/tablecast-grafana-read-token` に保存し、権限を `600` にする。送信用tokenは流用しない |
| Storybook     | `bun run storybook` を起動し、[開発環境のMCP手順](development.md#storybook-mcp)に従って実際のportを登録する。`docs-list`・`docs-show`で確認する                   |
| TableCast     | 店舗メニュー操作を試すときに [製品pluginの手順](codex-plugin.md#ローカル接続)を使う。開発用skillsとは別のOAuth接続である                                          |

Cloudflare pluginはskillsと `https://mcp.cloudflare.com/mcp` のStreamable HTTP接続を同梱する。同じserverを手動で二重登録しない。pluginが利用できずMCPだけを登録する場合は設定例のコメントを参照し、`codex mcp login tablecast-cloudflare` で認可する。Wranglerのログインとは別である。CLIでpluginを導入する場合は `codex plugin list` で現在のMarketplace識別子を確認してから `codex plugin add <plugin>@<marketplace>` を使う。[Cloudflare公式手順](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/)を参照する。

Grafanaは公式 `grafana/mcp-grafana:1.3.0` をstdio・`--disable-write`で起動し、Cloud資格は `GRAFANA_SERVICE_ACCOUNT_TOKEN_FILE` から読む。設定例はホスト開発ならホスト上、Dev Container開発ならコンテナ内のCodexから使う。接続先解決とtokenの渡し方は既存の `scripts/tablecast-grafana-mcp.ts` が担う。初回のtool一覧・Loki読取と接続の詳細は [観測手順](observability.md#ローカル起動とmcp)へ進む。Cloud用資格がない場合はlocalだけを設定する。

## 3. 最初の画面確認

1. 起動URLで客向け画面を開く。
2. `/admin/live` へログインする。開発用の資格情報は、その環境の `.local/demo.json` にある。
3. 客向け画面の端末コードを卓へ割り当てる。
4. 日英表示、商品追加、確認、注文を試す。メールはMailpitで確認する。

> [!NOTE]
> `.local/demo.json` の資格情報をチャット・Issue・PR・スクリーンショットへ含めない。

## 4. envとPython音声

外部音声などを試す場合だけ、雛形をコピーして値を記入する。既存ファイルは上書きしない。

```sh
cp -n .env.example .env.local
chmod 600 .env.local
```

JSの設定生成は[Bun標準のenv読み込み](https://bun.sh/docs/runtime/environment-variables)を使う。環境変数が優先され、ファイルは `.env` → `.env.development` → `.env.local` → `.env.development.local` の順に上書きされる。開発入口は `NODE_ENV=development` を指定する。CLIラッパーや暗号化envの復号は使わない。

> [!NOTE]
> 通常の開発・setup・seedはBunの標準env読み込みを使う。`--no-env-file` はCI・配備や外部資格を必要としない独立した試験の入口で、自動読み込みを止めるために使う。既に親プロセスから継承した環境変数を消す指定ではなく、Vite・Wranglerなど別ツールの読み込みも制御しない。ローカルから配備する場合の入口は [配備手順](deployment.md) に従う。

PythonはBunを経由せず、[uvの標準env読み込み](https://docs.astral.sh/uv/reference/cli/#uv-run)を使う。`.env.local` の4項目を設定し、Web/LiveKit Serverの起動後、別ターミナルで実行する。

```sh
uv run --project livekit tablecast-voice download-files
uv run --project livekit --env-file .env.local --env-file .local/.env.voice tablecast-voice dev
```

4項目は `TABLECAST_MODEL_API_KEY`、`INWORLD_API_KEY`、日英の `TABLECAST_INWORLD_VOICE_JA/EN`。雛形の `OPENAI_API_KEY=${TABLECAST_MODEL_API_KEY}` は同じファイル内でuvが展開するSDK標準名である。Bunで資格をPythonへコピーしない。店舗のキャスト設定でも日英Voice IDを登録・公開する。

| ファイル                      | 用途                                                     |
| ----------------------------- | -------------------------------------------------------- |
| `.env.example` → `.env.local` | 人が入力する開発専用設定。実値はGit管理しない            |
| `.local/.env`                 | Bun/Composeが読む生成済みポート・パス                    |
| `.local/.env.voice`           | uvが読むworktree固有の音声接続先と鍵。外部資格は含めない |
| `.local/.dev.vars`            | Wrangler用の生成済み設定・鍵                             |
| `apps/api/.dev.vars.example`  | Wranglerのbinding型生成用。起動設定としてコピーしない    |
| `.devcontainer/.env`          | Composeのパス・公開ポート用の生成物                      |

Pythonの外部設定は `.env.local` に置く。uvは明示したファイルを読み、Bunの環境別ファイルの自動選択には依存しない。音声一覧だけの取得には `TABLECAST_INWORLD_VOICES_API_KEY` を使う。`TABLECAST_MODEL` はMastraのテキスト応答・自発接客で使うため維持する。

旧 `.env.secrets.local` は雛形に残る項目を `.env.local` へ移して削除する。ローカルGoogle認証は模擬サービスなので旧Google資格は不要。本番資格は [配備手順](deployment.md)で管理する。envの変更後は各ターミナルをCtrl+Cで止めて再起動する。

> [!WARNING]
> 実音声の利用と `tablecast-voice-check` は外部サービスの費用が発生する。通常の `check` には含めない。有料試験の明示フラグと手順は [LiveKit](../livekit/README.md)を参照する。

## 5. 日常の操作

| コマンド                                | 用途                                                    |
| --------------------------------------- | ------------------------------------------------------- |
| `bun run dev` / `bun run dev:container` | Turboで初期化・常駐タスクを起動する                     |
| `bun run dev:prepare`                   | 設定・migration・seedのみを実行する                     |
| `bun run services:status`               | ホスト開発のComposeサービスを確認する                   |
| `bun run services:down`                 | ホスト開発のcontainer・networkを片付ける。volumeは保持  |
| `bun run storybook`                     | Storybook公式CLI。DB・runtime初期化は不要               |
| `bun run check`                         | format・lint・typecheck・無課金テスト                   |
| `bun run build`                         | 配備用Workersのbuild                                    |
| `bun run dev:parity`                    | 通常開発を停止してから、local buildとVite previewを実行 |
| `bun run demo:play`                     | 背景卓を一段階進める                                    |
| `bun run demo:reset --profile demo`     | 停止済みworktreeのデモをリセットする。稼働中は拒否      |

Storybookは標準の6006番を使う。他worktreeが使用中なら `bun run storybook --port 6007` と指定する。コンテナ内では公開済みの6006番を使う。
Storybookは公式の`@storybook/tanstack-react`でStart・Routerを扱い、WorkersやDBを起動せずに利用する。環境分岐とテストの責務は [テスト戦略](testing.md) を参照する。

Composeの正本はルートの [compose.yaml](../compose.yaml) で、ホストのLGTM・Mailpit・LiveKitを定義する。[.devcontainer/compose.yaml](../.devcontainer/compose.yaml) はLGTMだけを `extends` し、開発コンテナとホスト公開ポートを定義する。ホストの `services:*` は `.local/.env`、Dev Containerは `.devcontainer/.env` の `COMPOSE_PROJECT_NAME` を使う。既存のproject名・volume名は変更しない。

GrafanaのTempo設定とダッシュボードは `infra/grafana/`、Codex設定例は [.codex/config.toml.example](../.codex/config.toml.example) に置く。接続とダッシュボードの使い方は [観測手順](observability.md) を参照する。

ホストのブラウザー試験:

```sh
bunx --no-install playwright install chromium webkit
bun run test:browser
bun run test:e2e
```

E2Eはケースごとに専用環境を作り、通常のdevは不要。テストの選び方は [テスト戦略](testing.md)を正本とする。

## 6. 終了・再開・復旧

WebはTurboを実行したターミナル、音声AgentはuvのターミナルでCtrl+Cを押す。ホストのDockerサービスは別管理なので、終了時に `bun run services:down` を実行する。コンテナ環境全体はホストで次を実行する。

```sh
docker compose -f .devcontainer/compose.yaml down
```

`down` はvolumeを保持する。再開は2A/2Bの起動コマンドを使う。旧版の独自daemonが動いているcheckoutは更新前に旧版の `bun run dev:stop` で終了する。

| 症状                           | 確認・復旧                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dockerに接続できない           | OrbStack/Docker Desktopと `docker info`、選択中のcontextを確認                                                                                    |
| コンテナの公開ポートが使用中   | 自Composeをdownし、`TABLECAST_PORT_BASE=61000 sh .devcontainer/tablecast-init.sh` で空いている7ポートへ変更してup。エディタにも同じ環境変数を渡す |
| 起動が失敗する                 | ターミナルのTurbo出力と `bun run services:status` を確認。Ctrl+Cで止めて再実行                                                                    |
| 初期化が稼働中として拒否される | 自worktreeのWebと音声AgentをCtrl+Cで止めてから実行                                                                                                |
| 依存・生成コード・hooksがない  | `bun run setup`。hooksだけなら `bun run hooks:install`                                                                                            |
| 音声が未設定になる             | envの4項目と店舗のVoice IDを確認し、uvを再起動。値をログへ出さない                                                                                |
| コンテナのGitが動かない        | ホストでinitして再作成。clone元を移動した場合はworktree配置も修復                                                                                 |

変更を保存し、関連プロセスを停止したらホストで `git worktree remove ../tablecast-my-change` を実行する。ツールの版・env・タスク・devcontainerを変更したら、この文書も同じ差分で更新する。実行済みの検証と未実施範囲は区別して報告する。

## PWAの確認

Service Workerはビルド済み環境だけで登録する。ローカルでは通常開発を停止して`bun run dev:parity`を使う。自動試験は`bun run --cwd apps/web test:e2e tablecast-pwa.spec.ts tablecast-publication.spec.ts --workers=1`で、隔離したWorkersと画像を使う。Service Workerを手動で登録して通常devへ残さない。

iPadはHTTPSの配備先をSafariで開き、客向け `/` と店側 `/admin/live` をそれぞれ共有 → ホーム画面に追加する。追加後のアプリで端末登録・ログインを行う。キャッシュが消えてもオンライン起動で再取得できること、休止からの復帰時に更新確認されることを実機で確認する。
