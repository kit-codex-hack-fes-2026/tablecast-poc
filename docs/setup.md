# 開発環境のセットアップ

[仕様索引](README.md) · [開発環境の仕組み](development.md) · [テスト戦略](testing.md)

macOSではHomebrewと、起動済みのOrbStackまたはDocker Desktopを使う。ホスト開発でもMailpit・GrafanaにはDockerが必要である。外部APIキーなしでGUI注文・ログイン・メールを開発できる。Composeは2.24.4以降を使い、`docker compose version` で確認する（Dev Containerの[ポート置換](https://docs.docker.com/reference/compose-file/merge/#replace-value)に必要）。

> [!TIP]
> `package.json` に実行するCLI、`turbo.json` に順序と常駐タスクを記載する。WebはTurborepo、コンテナ資源はComposeで管理する。独自のdaemonや起動ラッパーは使わない。

## 1. cloneとworktree

Gitがなければ `brew install git`、GitHub CLIを使う場合は `brew install gh` を実行する。着手するIssueと担当は [AGENTS.md](../AGENTS.md#作業契約) に従って確認する。

手動の配備・削除はGitHub CLI `gh` と対象repositoryを読めるGitHub認証も必要になる。Dev Containerには `gh` を同梱しないため、通常の再配備・削除はGHAを使い、手動復旧は `gh auth status` が成功するホスト側のセットアップ済み環境で行う。Cloudflare権限と復旧条件は[配備手順](deployment.md#prのstorybookメールカタログ)を参照する。

```sh
git clone https://github.com/kit-codex-hack-fes-2026/tablecast-poc.git
cd tablecast-poc
git fetch origin
git worktree add -b codex/123-my-change ../tablecast-my-change origin/staging
cd ../tablecast-my-change
```

`123` は着手するIssue番号、`my-change` は作業内容に置き換える。既存branchは `git worktree add ../tablecast-my-change codex/123-my-change` で開く。以降は作業先のworktreeルートで実行する。

> [!IMPORTANT]
> `node_modules`、`.local` はworktree間でコピーしない。Git標準のworktree作成では環境ファイルもコピーされない。Codexの `.worktreeinclude` は `.env.local` のみを対象にする。

## 2A. Dev Containerを使う

動画素材は`.lfsconfig`により通常のclone・pullでは取得しない。動画を扱う場合だけGit LFSを導入し、[動画の共有と復元](../apps/presentation/SHARING.md)に従って取得範囲と`--exclude=`を指定した`git lfs pull`を実行する。通常の動画生成にはアプリ起動・APIキーは不要。現在の再収録・OpenScreen編集手順はWindows環境を対象とする。共有projectの再編集は、projectのあるフォルダーでOpenScreenの`pack`を実行して作業用bundleを作る。UI変更試験は[当時の検証記録と完成動画](../apps/presentation/experiments/tablecast-mutation/BRIEF.md)を共有する。

ホストにNode・Bunは不要。Dev Containers対応エディタでworktreeを開き、Reopen in Containerを実行する。初期化が `.devcontainer/.env` を生成し、`postCreateCommand` が `bun run setup` を実行する。

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

ホストと同じ絶対パスへworktreeとGit共通ディレクトリをmountするため、コンテナ内でもGit操作ができる。worktreeの作成・削除はホストで行う。Linux依存・DBは専用volumeへ保存する。

```sh
docker compose -f .devcontainer/compose.yaml port tablecast 8025
docker compose -f .devcontainer/compose.yaml port tablecast-lgtm 3000
docker compose -f .devcontainer/compose.yaml port tablecast 6006
```

上からMailpit・Grafana・Storybookの公開ポートを確認できる。Storybookはコンテナ内で別途 `bun run storybook --host 0.0.0.0` を実行する。[OrbStackのHTTPS設定](devcontainer.md)も参照できる。

> [!NOTE]
> Docker socketは渡さない。Dockerを直接使うE2Eは2BのホストかCIで実行する。コンテナ内のブラウザー試験には `bunx --no-install playwright install --with-deps chromium webkit` が必要。実iPadはlocalhostへ接続できないため、[実機試験](development.md#実機公開環境)を参照する。

動画のbuildでもFFprobeを使うため、Dev ContainerイメージはFFmpeg/FFprobeを含む。既存コンテナはイメージを再buildする。動画の配置検査・完成MP4再生はH.264/AAC対応のGoogle Chromeを使うため、Linux amd64のコンテナでは依存導入後に次を追加実行する。通常アプリのChromium/WebKit導入とは別の前提である。

```sh
bunx --no-install playwright install --with-deps chrome
ffmpeg -version
ffprobe -version
```

Linux arm64へのGoogle Chrome導入はこの手順の対象外。動画制作は[Windowsの生成環境](../apps/presentation/SHARING.md#新しいcheckoutで生成する)を使う。OpenScreenによる実収録・再編集もWindowsホストで行う。

## 2B. ホストでmise・Bunを使う

[miseの公式手順](https://mise.jdx.dev/getting-started.html)に従ってzshで有効化する。`.zshrc` への追記は未設定の場合に一度だけ行う。

```sh
brew install mise
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
eval "$(mise activate zsh)"
mise trust
mise install
bun --version
node --version
docker info
bun run setup
# 初回だけ共有proxyを起動する。必要に応じて管理者権限の認証が求められる。
bunx --no-install portless proxy start --no-tls --port 80
bun run dev
```

[mise.toml](../mise.toml)がNode 24.22.0、Bun 1.4.3を指定する。`setup` は固定lockでJS依存とhooksを導入し、Paraglideを生成する。追加worktreeでも `mise trust`、`mise install`、`bun run setup` を実行する。

Webのアプリ操作ショートカットは`@tanstack/react-hotkeys`を使う。依存はWebのpackageとrootのlockで固定し、追加のブラウザー拡張やOS設定は不要。フォームの保存可否と同じ制約で動作し、コンポーネント固有の矢印キー操作は既存部品へ任せる。

CIのNodeは`>=24.22.0 <25`を指定し、`setup-node`がrunnerのtoolcacheから適合する24系を選ぶ。収録版があればNodeの取得・展開・コピーを省き、なければ取得する。ローカルとDev Containerの24.22.0固定、Bunと依存lockは維持する。CIのminor・patch版はrunner image更新に追従するため、CI固有の問題を再現するときは`setup-node`ログの実行版とrunner imageを照合する。[setup-nodeの版選択](https://github.com/actions/setup-node/blob/49933ea5288caeca8642d1e84afbd3f7d6820020/README.md#supported-version-syntax)

CIのBun取得cacheは各jobが復元し、静的検査jobだけが固定依存の導入後に保存する。全jobでfrozen installを実行し、取得cacheを試験成功の代わりに使わない。Turboを使うjobはcodegen前にcacheを復元する。APIではWeb生成物を使わず、Componentは直前に専用形式を生成するため、この2jobでは共通setupのcodegenだけを省く。実行範囲と費用の測定は[CIのジョブとキャッシュ](testing.md#ciのジョブとキャッシュ)を参照する。

ブラウザーのOS依存導入は公式Playwright CLIを使う。GitHub-hostedの使い捨てVMだけ、導入中のdpkgの展開ファイル同期を省き、終了時に専用設定を除去する。self-hostedやローカルの設定には適用しない。境界と計測は[CIのジョブとキャッシュ](testing.md#ciのジョブとキャッシュ)に従う。

PR初回投入用の固定JSONは`bunx --no-install turbo run seed:template`で生成し、`.local/tablecast-seed-template/seed.json`へ保存する。Turboはseedのscript・API schema・migration・共通名簿・デモ画像・依存設定を入力としてcacheを管理する。生成物には架空店舗・商品構成・スタッフ名簿だけを入れ、実DB・所有情報・認証account・パスワード・時刻・tokenを保存しない。buildで検証して`apps/web/.cloudflare/output/tablecast-seed.json`へコピーし、同じrunの既存Workers artifactへ同梱する。公開assetsやproduction成果物には含めず、seed専用の転送step・job・依存導入も増やさない。配備時も同梱JSONの`sourceHash`と`payloadHash`を検証する。手動検証は`bun --no-env-file run seed:template --verify`を使う。壊れたcacheはTurboのコマンドに`--force`を付けて一度再生成し、検証し直す。適用対象と再開時の境界は[初期データと再実行](deployment.md#初期データと再実行)を参照する。

`dev` はPortlessから `turbo run dev --filter=@tablecast/web` を実行する。Webの名前衝突を準備前に拒否し、`dependsOn` で設定・migration・seed・Compose起動を先に済ませ、`with` でOAuthも起動する。空きポートとrouteの登録はPortlessへ任せる。ローカルmigrationは `CI=1` で確認入力を省き、Turboから実行できる。WebとAPI WorkerはViteのmultiworkerを使い、APIを二重起動しない。

`dev:prepare` は認証secretを維持して通常のenvとSDK用API設定を生成する。rootのPortlessから渡された実Webポートを `.local/.env` に保存し、起動中の初期化・resetを拒否する。Cloudflare設定はenvから直接読み、ローカル用の `TABLECAST_CONFIG` JSONや `runtime.json` は作らない。Mailpit・OTLPはPortless aliasへ接続する。seedの引数はNode標準の `parseArgs` で読む。

起動ログの `http://web.<worktree名>.tablecast-poc.localhost` を開く。branch末尾を正規化して先頭47文字へ切り取り、branchがない場合は短いcommit SHAを使う。Issue番号やホスト名の入力は不要。ポート・DB・Cookieホスト名はworktreeごとに分離する。起動中はターミナルを開いたままにする。

Portlessの共有stateを利用し、個別worktreeから `portless proxy stop` や `portless clean` を実行しない。80番が使用中の場合は `bunx --no-install portless doctor` と待受プロセスを確認する。初回のproxy起動はTurboの外で行い、非対話のdevタスクから管理者認証を要求しない。名前を変更する場合は自worktreeのWeb・Composeを停止し、`demo:reset`で設定と開発データを作り直す。

## 2C. agent開発環境

Codex Desktopでは作業するworktreeをprojectとして開き、CLIではそのルートから `codex` を起動する。以下は開発者が必要な接続だけを選ぶ手順である。`bun run setup` はアプリ依存・生成物・Git hooksを準備し、agent pluginの導入や外部サービスへのログインは行わない。

| 構成                     | 役割と正本                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`・repo skills | 作業契約と用途別の手順。cloneした [.agents/skills](../.agents/skills) を使う。外部skillの取得元は [skills-lock.json](../skills-lock.json) に記録する             |
| Agent plugins            | Cloudflare等が配布するskills・MCPのまとまり。CodexのPlugins画面または `codex plugin` で必要なものを導入する                                                      |
| MCP                      | 外部サービスやローカルツールへの接続。plugin同梱設定、または利用者の `.codex/config.toml` で管理する                                                             |
| Git hooks                | [lefthook.yml](../lefthook.yml) のcommit時検査。`bun run setup` が導入し、修復は `bun run hooks:install`。検証の分担は [静的解析](static-analysis.md) を参照する |

repo skillsは個人のglobal skillsへコピーしない。同じ外部skillをpluginとglobal配置の両方から導入済みなら、取得元と適用対象を確認して一方を選ぶ。各タスクでは `AGENTS.md` の入口から必要なskill本文と参照先を読む。skillsの所有・更新は [静的解析](static-analysis.md#skillsと追加pluginの所有) に従う。

動画制作のHyperFrames Core・Animation・Creativeもrepo skillsとして共有する。導入時のHyperFrames 0.8.33の公開元コミットへ固定しており、通常はcloneだけで参照できる。[動画制作スキルの取得元・復元コマンド](../apps/presentation/TOOLS.md#制作スキルの固定と復元)に従い、描画ライブラリの更新とは分けて管理する。

### MCP設定の配置と確認

worktree固有の接続はGit管理外の `.codex/config.toml` に置く。個人共通の設定は `~/.codex/config.toml` に置き、既存ファイルを雛形で上書きしない。[設定例](../.codex/config.toml.example)から必要なサーバーのテーブルだけを統合する。Codexは信頼済みprojectの設定を読む。CLIの `codex mcp list` またはDesktopのMCP設定で登録状態を確認し、変更後は接続を再起動する。[公式のMCP設定](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)を参照する。

MCPはCodexが動くホストから接続する。Dev Container内でCLIを動かす場合はコンテナ内のコマンドとURL、ホストのDesktopを使う場合はホストから到達できるURLを選ぶ。設定の登録、OAuth認可、toolの読取成功を区別し、値を含むconfigや認証情報をチャットへ貼らない。

| 接続            | 導入・認証と確認                                                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare      | 公式Cloudflare pluginを導入し、同梱MCPのOAuthで対象アカウントと必要な権限を選ぶ。API仕様検索や許可した設定の読取で確認する                                                         |
| Grafana local   | LGTM起動後に設定例の `tablecast-grafana-local` を追加する。ホストはDocker、Dev Container内は同梱binaryを使う                                                                       |
| Grafana Cloud   | `tablecast-grafana-cloud` を追加する。Viewer service account tokenを `.local/tablecast-grafana-read-token` に保存し、権限を `600` にする。送信用tokenは流用しない                  |
| Storybook       | `bun run storybook` を起動し、[開発環境のMCP手順](development.md#storybook-mcp)に従って実際のportを登録する。`docs-list`・`docs-show`で確認する                                    |
| TableCast local | [ローカルMCP手順](codex-plugin.md#ローカル接続)でworktreeのURLを`tablecast-local`へ登録し、OAuth後に`get_configuration`とローカルfixtureを照合する。plugin生成は配布検証時だけ行う |

Cloudflare pluginはskillsと `https://mcp.cloudflare.com/mcp` のStreamable HTTP接続を同梱する。同じserverを手動で二重登録しない。pluginが利用できずMCPだけを登録する場合は設定例のコメントを参照し、`codex mcp login tablecast-cloudflare` で認可する。cfのCLI認証とは別である。CLIでpluginを導入する場合は `codex plugin list` で現在のMarketplace識別子を確認してから `codex plugin add <plugin>@<marketplace>` を使う。[Cloudflare公式手順](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/)を参照する。

Grafanaは公式 `grafana/mcp-grafana:2.0.2` をstdio・`--disable-write`で起動し、Cloud資格は `GRAFANA_SERVICE_ACCOUNT_TOKEN_FILE` から読む。設定例はホスト開発ならホスト上、Dev Container開発ならコンテナ内のCodexから使う。接続先解決とtokenの渡し方は既存の `scripts/tablecast-grafana-mcp.ts` が担う。初回のtool一覧・Loki読取と接続の詳細は [観測手順](observability.md#ローカル起動とmcp)へ進む。Cloud用資格がない場合はlocalだけを設定する。

### Codex CloudのPRレビュー

PRを作成する各開発者は[Codex Cloudの公式セットアップ](https://learn.chatgpt.com/docs/cloud#set-up-codex-cloud)に従い、自分のChatGPTアカウントへGitHubを接続し、このrepositoryへのアクセスを許可する。

各自が[Code review設定](https://chatgpt.com/codex/settings/code-review)でこのrepositoryのCode reviewが有効か確認し、自分のPRを自動レビューする `Review my pull requests` を有効にする。この個人設定はチームで有効にしたrepositoryに適用される。全PRを自動レビューする `Automatic reviews` はrepository側の設定であり、変更にはGitHubのpushまたはadmin権限が必要となる。[公式PRレビュー手順](https://learn.chatgpt.com/docs/third-party/github)を参照する。

手動でレビューを依頼するときは、対象PRのコメントへ次を投稿する。

```text
@codex review
```

Codexの受付反応とレビュー結果を確認する。指摘への対応と再レビューは[PR運用のレビュー対応](../.agents/skills/github-issue-pr-ops/references/pr-and-merge.md#レビュー対応)に従う。

## 3. 最初の画面確認

1. 起動URLで客向け画面を開く。
2. `/admin/live` へログインする。開発用の資格情報は、その環境の `.local/demo.json` にある。
   `emulate@0.11.1`は未改変の配布物を使い、選択画面の写真表示・表示順は拡張しない。E2Eでは[指定ポートの設定](testing.md)を使用する。ランダムスタッフ生成を廃止し、Fakerへの依存を削除した。
   プロフィールは[生成WebP](demo/identities.md)を共通名簿から読み込む。`apps/emulate/Dockerfile`は実行ファイルを`apps/emulate/dist/index.js`へ配置し、`assets/demo/identities/*.webp`と同じ相対位置を維持する。フォントは実行ファイル隣の`fonts`へ同梱する。`.dockerignore`でも12点のWebPをビルドコンテキストに含める。
   新規seedのGoogle選択画面では、店舗・氏名・役割から8人のデモメンバーを選べる。各組織は3所属で、共通ownerが2店舗を担当する。名簿と動画シナリオは[デモ資料](demo/README.md)を参照する。新規local/PR seedのownerメールは共通名簿に揃え、既存DBの既知の旧デモメールだけを通常の再seedで人名@店舗名.comへ移行し、DB投入成功後に`.local/demo.json`も更新する。パスワード・手動のメール・所属は保持する。古い構成から今回のデモへ切り替える場合は、必要なデータを保全して対象worktreeを停止し、既存の`demo:reset`手順を使う。明示リセットはownerのメールも共通名簿へ戻し、パスワードを保持する。
3. 客向け画面の端末コードを卓へ割り当てる。
4. 日英表示、商品追加、確認、注文を試す。メールはMailpitで確認する。

> [!NOTE]
> `.local/demo.json` の資格情報をチャット・Issue・PR・スクリーンショットへ含めない。

## 4. envと音声接続

外部音声などを試す場合だけ、雛形をコピーして値を記入する。既存ファイルは上書きしない。

```sh
cp -n .env.example .env.local
chmod 600 .env.local
```

JSの設定生成は[Bun標準のenv読み込み](https://bun.sh/docs/runtime/environment-variables)を使う。環境変数が優先され、ファイルは `.env` → `.env.development` → `.env.local` → `.env.development.local` の順に上書きされる。開発入口は `NODE_ENV=development` を指定する。暗号化envの復号は使わない。

料金設定のJSONは一重引用符で囲んで入力する。生成するdotenvも引用符をエスケープせず、Bun・Node・Wranglerで同じ値を読む。Bunは引用符内でも変数を展開するため、生成対象の設定値に`$`は使用できない。

> [!NOTE]
> 通常の開発・setup・seedはBunの標準env読み込みを使う。`--no-env-file` はCI・配備や外部資格を必要としない独立した試験の入口で、自動読み込みを止めるために使う。既に親プロセスから継承した環境変数を消す指定ではなく、Vite・cfなど別ツールの読み込みも制御しない。ローカルから配備する場合の入口は [配備手順](deployment.md) に従う。商品画像の一覧照合・不足分の限定並列投入と件数ログ、DB準備とイメージ送信の並行処理、区間時間の確認は [CDの処理](deployment.md#actionsの処理) を参照する。

`.env.local` に `TABLECAST_MODEL_API_KEY` と `TABLECAST_MODEL` を設定して `bun run dev` を起動する。別の音声プロセスは不要である。APIが公式SDKでGPT-LiveのResponses delegationを設定し、ブラウザーはSDP answerを使ってGPT-Liveと直接WebRTC接続する。

OpenAI projectにはGPT-Liveの利用権限に加え、Responses delegationの `api.responses.write` が必要である。`TABLECAST_MODEL` は業務委任モデルで、雛形は `gpt-5.6-luna`。音声モデルは `gpt-live-1` に固定する。モデルが利用できない場合の自動切替は行わない。

業務応答はSSEで本文差分と完了・失敗を分ける。Webの解析には `eventsource-parser` 3.1.1を使い、`bun run setup` で導入する。途中の切断を正常完了として扱わず、失敗時は音声を停止してGUIを維持する。

| ファイル                      | 用途                                                |
| ----------------------------- | --------------------------------------------------- |
| `.env.example` → `.env.local` | 人が入力する開発専用設定。実値はGit管理しない       |
| `.local/.dev.vars.web`        | Web専用の生成設定。OpenAI・Stripeの秘密値を含めない |
| `.local/.env`                 | Bun/Composeが読む名前・origin・パス・実Webポート    |
| `.local/.dev.vars`            | cf/ViteとSDKが読む生成済み設定・鍵                  |
| `apps/api/.dev.vars.example`  | SDK互換の型参照。起動設定としてコピーしない         |
| `.devcontainer/.env`          | Composeのパス・公開ポート用の生成物                 |

旧 `OPENAI_API_KEY` の別名、LiveKitの鍵、`TABLECAST_VOICE_API_TOKEN`、Mastra Observabilityの設定は不要になった。共有キーの開発は `TABLECAST_MODEL_API_KEY` を使う。組織キー発行とStripe Sandboxは [課金・請求](billing.md#開発と導入) のAPI専用設定を使う。標準音声Marin・Cedarは管理画面から日英それぞれ選び、旧Voice IDは起動時にMarinへ対応付ける。Inworld TTSのキーは任意の有料試験で入力音声を作るときだけ使用し、製品の設定には入れない。

旧 `.env.secrets.local` は雛形に残る項目を `.env.local` へ移して削除する。ローカルGoogle認証は模擬サービスなので旧Google資格は不要。本番資格は [配備手順](deployment.md)で管理する。envの変更後は各ターミナルをCtrl+Cで止めて再起動する。

> [!WARNING]
> 実音声の利用はGPT-LiveとResponses delegationの費用が発生する。通常の `check` には含めない。[音声接続の検証境界](voice/integration.md#観測と検証)に従い、許可された専用卓で実行する。

## 5. 日常の操作

| コマンド                                    | 用途                                                          |
| ------------------------------------------- | ------------------------------------------------------------- |
| `bun run dev` / `bun run dev:container`     | Turboで初期化・常駐タスクを起動する                           |
| `bun run dev:prepare`                       | 設定・migration・seedのみを実行する                           |
| `bun run services:status`                   | ホスト開発のComposeサービスを確認する                         |
| `bun run services:down`                     | ホスト開発のalias・container・networkを片付ける。volumeは保持 |
| `bun run storybook`                         | Storybook公式CLI。DB・runtime初期化は不要                     |
| `bun run check`                             | format・lint・typecheck・無課金テスト                         |
| `bun run build`                             | 配備用Workersのbuild                                          |
| `bunx --no-install turbo run seed:template` | PR初回投入用の固定JSONを生成・cacheする                       |
| `bun run dev:parity`                        | 通常開発を停止してから、local buildとVite previewを実行       |
| `bun run demo:play`                         | 背景卓を一段階進める                                          |
| `bun run demo:reset --profile demo`         | 停止済みworktreeのデモをリセットする。稼働中は拒否            |
| `bun run demo:audio --verify`               | 保存済みデモ音声の台本・声・SHAと音声形式を無料で検査する     |

デモ音声の作成にはホストの`ffmpeg`・`ffprobe`とInworldキーを使う。`bun run demo:audio`は生成予定の表示だけで、`bun --env-file=.env.local run demo:audio --generate`を明示した場合に有料TTSを呼ぶ。同じ台本・声・音声SHAの素材は再利用し、通常CIでは合成しない。台本、US/UK/India/Chinaを含む声の指定と実有料E2Eの判定方法は[合成音声素材](demo/audio.md)を参照する。

Storybookは標準の6006番を使う。他worktreeが使用中なら `bun run storybook --port 6007` と指定する。コンテナ内では公開済みの6006番を使う。
Storybookは公式の`@storybook/tanstack-react`でStart・Routerを扱い、WorkersやDBを起動せずに利用する。環境分岐とテストの責務は [テスト戦略](testing.md) を参照する。

PRの公開カタログは通常のpushでは生成しない。PR通知の表内でStorybook・React Emailのビルド・デプロイをチェックして最新headを要求する。write/admin権限を持つ利用者だけが起動できる。workflowの統合前は、Actionsの`CI`からRun workflowを開き、通常PRの作業branchと`catalog_pr`・`catalog`を指定する。main/stagingからのカタログ専用起動は拒否する。対象SHAの照合・再配備・削除は[カタログ配備](deployment.md#prのstorybookメールカタログ)を参照する。

Composeの正本はルートの [compose.yaml](../compose.yaml) で、ホストのLGTM・Mailpitを定義する。[.devcontainer/compose.yaml](../.devcontainer/compose.yaml) はLGTMだけを `extends` し、開発コンテナとホスト公開ポートを定義する。ホストの `services:*` は `.local/.env`、Dev Containerは `.devcontainer/.env` の `COMPOSE_PROJECT_NAME` を使う。Dev Containerのproject名・volume名は変更しない。

GrafanaのTempo設定とダッシュボードは `infra/grafana/`、Codex設定例は [.codex/config.toml.example](../.codex/config.toml.example) に置く。接続とダッシュボードの使い方は [観測手順](observability.md) を参照する。

ホストのブラウザー試験:

```sh
bunx --no-install playwright install chromium webkit
bun run test:browser
bun run test:e2e
```

`test:browser`は実行前にParaglideの`locale-modules`を公式CLIで生成し、翻訳のmodule数を減らす。通常のcodegenと公開buildは`message-modules`を使い、`build:storybook`も自身でこの形式へ戻してからbuildする。同じ`src/paraglide`を共有するため、Browser試験・codegen・dev/watch・buildを同じcheckoutで重ねない。テストだけを直接`vitest`で起動する場合は、先に`bun run --cwd apps/web i18n:compile --output-structure locale-modules`で準備する。

ローカルの`check`と各`test`コマンドは通常どおり全件を実行する。PRのCIはGitHub Compare APIで検証した差分から対象を選び、通常のWeb変更にはVitest標準の`related --run`を使う。共有入口や不明な差分、選択結果が0件のソース変更は全件へ戻す。選択範囲と実行しないjobの扱いは[CIの実行対象](testing.md#ciのジョブとキャッシュ)を参照する。

E2Eはworkerごとに専用環境を作り、ケース間でWebを停止してD1・R2・DOの状態をtemplateから復元する。通常のdevは不要。入口とWorkerのTCPポートは実起動時にOSが割り当てる。LinuxのMailpitはDocker imageから抽出したバイナリをworker単位で起動し、macOSはworker単位のDockerコンテナと動的ポート公開を使う。`bun install --frozen-lockfile`でOAuth emulatorの管理パッチも適用される。E2E専用の`TABLECAST_OAUTH_READY_FILE`はfixtureが設定し、手動設定は不要。global setupが`TABLECAST_BUILD_DIRECTORY`で実行ごとのbuild出力を指定する。この変数を省略した通常buildは`apps/web/dist`を使う。同じworktree内ではcodegenやdeploy metadataを共有する別buildと重ねない。失敗したケースの診断ログと画像は`apps/web/test-results/`へ残り、fixtureが専用プロセス群・container・storageを片付ける。テストの選び方と隔離の範囲は [テスト戦略](testing.md#e2eの隔離)を正本とする。

## 6. 終了・再開・復旧

WebはTurboを実行したターミナルでCtrl+Cを押す。ホストのDockerサービスは別管理なので、終了時に `bun run services:down` を実行する。コンテナ環境全体はホストで次を実行する。

```sh
docker compose -f .devcontainer/compose.yaml down
```

`down` はvolumeを保持する。再開は2A/2Bの起動コマンドを使う。旧版の独自daemonが動いているcheckoutは更新前に旧版の `bun run dev:stop` で終了する。

| 症状                           | 確認・復旧                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dockerに接続できない           | OrbStack/Docker Desktopと `docker info`、選択中のcontextを確認                                                                                    |
| コンテナの公開ポートが使用中   | 自Composeをdownし、`TABLECAST_PORT_BASE=61000 sh .devcontainer/tablecast-init.sh` で空いている7ポートへ変更してup。エディタにも同じ環境変数を渡す |
| 起動が失敗する                 | ターミナルのTurbo出力と `bun run services:status` を確認。Ctrl+Cで止めて再実行                                                                    |
| 初期化が稼働中として拒否される | 自worktreeのWebをCtrl+Cで止めてから実行                                                                                                           |
| 依存・生成コード・hooksがない  | `bun run setup`。hooksだけなら `bun run hooks:install`                                                                                            |
| 音声が未設定になる             | OpenAI projectの権限、envの2項目と店舗のVoice IDを確認し、Web/APIを再起動。値をログへ出さない                                                     |
| コンテナのGitが動かない        | ホストでinitして再作成。clone元を移動した場合はworktree配置も修復                                                                                 |

変更を保存し、関連プロセスを停止したらホストで `git worktree remove ../tablecast-my-change` を実行する。ツールの版・env・タスク・devcontainerを変更したら、この文書も同じ差分で更新する。実行済みの検証と未実施範囲は区別して報告する。

## PWAの確認

Service Workerはビルド済み環境だけで登録する。ローカルでは通常開発を停止して`bun run dev:parity`を使う。自動試験は`bun run --cwd apps/web test:e2e tablecast-pwa.spec.ts tablecast-publication.spec.ts`で、隔離したWorkersと画像を使う。Service Workerを手動で登録して通常devへ残さない。

iPadはHTTPSの配備先をSafariで開き、客向け `/` と店側 `/admin/live` をそれぞれ共有 → ホーム画面に追加する。追加後のアプリで端末登録・ログインを行う。キャッシュが消えてもオンライン起動で再取得できること、休止からの復帰時に更新確認されることを実機で確認する。

### メールプレビュー依存

メールカタログはAPIで既に利用しているReact Emailのrender/componentsで静的HTMLを生成する。追加workspace・依存・patch・サービス契約は不要。ビルドとローカル確認は[メールカタログの検証](development.md#メールカタログの検証)、限定公開は[カタログ配備](deployment.md#prのstorybookメールカタログ)を参照する。

## stagingと本番release

開発の標準branchはstaging。stagingのWeb・模擬ログイン・MCPはCloudflare Access資格なしで公開し、PR previewはAccess保護を維持する。本番はmainへのrelease PRで更新する。常設環境・ActionsのPR作成許可・手動リセットは[配備手順](deployment.md#stagingとreleaseの運用)を参照する。ローカル終了処理で常設stagingを停止しない。

### 接客エディターの依存

Webの接客方針エディターはTiptap 3.31.3のcore・react・pm・starter-kit・suggestionを使用する。rootの `bun.lock` と通常の `bun install --frozen-lockfile` で導入する。追加の環境変数・外部サービス・ライセンスキーは不要。保存形式を読めるAPIを先に配備する。互換性とロールバック条件は[接客エディター設計](prompt-editor-design.md#読取互換と展開)を参照する。

### 店舗テーマの開発依存

追加CSSの検証にはAPI workspaceの`css-tree`を使う。通常の`bun install --frozen-lockfile`で導入する。ネイティブ実行や別サーバーは不要で、WorkersとWebが同じ入力契約を使う。製品pluginのテーマskill変更後は`bun --no-env-file scripts/tablecast-plugin.ts --skills-only`で配布コピーを同期する。接続先やOAuth設定は変更しない。

## 型検査の実行版

`bun install --frozen-lockfile`で、型検査用の`@tablecast/typescript-native`をTypeScript 7.0.2のnpm aliasとして導入する。`bun run typecheck`と各workspaceの同scriptは、root相対の公開CLI `node_modules/@tablecast/typescript-native/bin/tsc`を`node`で明示実行する。追加の手動導入や環境変数は不要。

TanStack・Storybook等が利用するJavaScript APIには既存の`typescript@6.0.3`を残す。CLIのbin名が重なるため、裸の`tsc`や`bunx tsc`の版から実行版を判断せず、各manifestのscriptを使う。lintの対象分担と互換性の理由は[静的解析](static-analysis.md)を参照する。

## Cloudflare CLIと設定の移行

`cf@1.0.0-beta.18`を固定する。API・Webの開発はcfが対応する公式Vite plugin `2.0.0-beta.v.1`、Workers試験はVitest `5.0.5`とVitest plugin `1.4.4`、SDKはWrangler `4.151.1`を使う。APIのmodule cache互換設定は[テスト戦略](testing.md#vitest-5とworkersのmodule-cache)を参照する。Node.jsは24.22.0以上が必要である。遠隔proxyのローカルpatchは撤去済みで、SDKのMiniflareを使う。Vite plugin v2はTypeScript設定とBuild Outputを標準で読み込み、通常開発ではAPIをauxiliary Workerとして、previewではbuild済みAPI・Webを一緒に起動する。

API・WebのWorkerとbindingは各workspaceの`cloudflare.config.ts`へ直接定義する。環境・資源名・採用済みID・Access設定は既存の`scripts/tablecast-deploy-config.ts`に置く。公開配備の入力は`TABLECAST_CONFIG`で両workspaceへ渡し、ローカルは通常のenvから直接読む。cf設定からSDK接続用の`.local/api.wrangler.json`だけを一方向に生成する。Web用・build用の中間JSONは作らず、生成物を手編集しない。`bun run dev:config`はworkspaceの`.dev.vars`を自worktreeの`.local/.dev.vars`へ接続する。既存の手編集ファイルや別worktreeへのリンクがある場合は上書きせず停止する。必要な値を自worktreeの入力へ移してから再開する。

旧hash名からの切替やbranch名の変更時は、自worktreeのdevをCtrl+Cで停止し、旧設定のまま`bun run services:down`を実行する。その後`bun run demo:reset`でこのworktreeのD1・R2・DOを削除・再seedする。認証secretとデモ資格情報は保持する。旧資源名・旧D1形式の自動移行は行わず、通常起動で名前の変更を検知したらresetを案内して停止する。保存先は常に`.local/state`とし、名前別ディレクトリや移行履歴を作らない。

beta.14のlocal D1 CLIは処理・dispose後もregistry監視が残って終了しないため、`cf:local`はcfの公開`main()`完了後にstdout/stderrをflushして終了する互換入口である。migration・試験だけが使い、遠隔操作は通常のcf CLIを使う。上流で終了処理が修正されたらこの入口を削除する。

## 依存更新に伴う認証DBの移行

Better Auth 1.7.3以降は`account.issuer`を書き込まない。`0025_tablecast_auth_account_compat.sql`は既存のissuer・資格情報を保持してNOT NULL制約と旧複合unique indexを外す。新しいAPIを配備する前に既存のmigration経路で適用する。migrationの冒頭で一時的なunique indexを作成し、`provider_id, account_id`が重複すれば既存行・制約を変更する前に停止する。正常時は検査用indexを削除して移行する。異なるissuerで同じ識別子を使う行がある場合は、ユーザーを統合せずproviderの対応を整理してから再実行する。[公式移行ガイド](https://www.better-auth.com/docs/guides/1-7-upgrade-guide#account-identity-keeps-the-provider-key)

`emulate@0.12.2`の標準待受はloopbackである。ローカルOAuthは`127.0.0.1`、preview/stagingのContainer内だけは`0.0.0.0`を明示してService Bindingから到達できるようにする。bind失敗の検査も同じIPv4 loopbackへ既存serverを置き、別address familyの同じport番号と区別する。

React DoctorとOxlintの更新は通常のfrozen installへ含む。追加の実行手順やReact Compiler導入は不要で、診断モードと対象は[静的解析](static-analysis.md#webの追加ルール)を参照する。

組織課金を開発する場合は [課金・請求の導入手順](billing.md#開発と導入) を参照する。`bun run dev:config` はAPI用の `.local/.dev.vars` とWeb用の `.local/.dev.vars.web` を分け、従来のWeb symlinkが同じworktreeのAPI設定を指す場合だけ生成先を更新する。

Viteの開発起動ではAPIを補助Workerとして同時実行するため、`envDir`を自worktreeの`.local`に揃える。Cloudflare Viteプラグインは同じローカル設定を全Workerで参照し、各Workerが宣言したbindingだけを渡す。APIの認証・決済のsecretをWebのbindingへ追加しない。build・previewはこの開発用envDir切替の対象外とし、配備用のsecret管理を維持する。
