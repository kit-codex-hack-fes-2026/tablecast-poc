# ローカル開発とworktree

[索引](README.md) · [cloneからのセットアップ](setup.md)

## 基本構成

BunでJS依存とタスクを管理し、Turborepoでworkspace間の順序・キャッシュを扱う。
Bunを使っても本番Workersのruntimeはworkerdであり、cf/Vite/Storybookの実行要件を勝手に変更しない。
互換性のため公式CLIにNodeが必要なら使う。Bunの採用を理由にVitestをbun testへ置換しない。[S13](sources.md#s13)

ローカル対象はWeb、Hono、D1、DO、R2、Imagesの対応範囲、MCP、Storybook。
通常音声はブラウザーからGPT-Live 1へ直接WebRTC接続し、業務委任はGPT-Liveの標準Responses delegationからLunaへ接続する。外部キーはAPIだけが持つ。業務モデルはgpt-5.6-luna、、音声モデルはgpt-live-1に固定する。OAuthプロバイダー・ChatGPT到達性の確認は別の統合試験とする。
ローカルの従業員認証には実Better Authとローカルメール受信箱等の最小の開発経路を使い、常設の認証bypassを作らない。

## 通常開発と本番相当試験

| モード   | 起動方式                                         | 用途                                             |
| -------- | ------------------------------------------------ | ------------------------------------------------ |
| 通常     | cf dev + Cloudflare Vite PluginでWeb/APIを起動   | UIのHMRと実Binding                               |
| 本番相当 | build済みWebとAPIをCloudflare Vite previewで起動 | Service Binding、build、stream、Cookieの接続確認 |
| UI部品   | apps/web内のStorybook                            | 固定状態とブラウザー操作検証                     |
| 音声     | ブラウザーWebRTCとHonoのtool HTTP接続            | 字幕、取消、業務委任                             |

Cloudflareはmultiworkerのローカル起動と資源の永続化を提供する。公式の対応版を揃え、WebのVite pluginがAPIをauxiliary Workerとして一度だけ起動し、Service Bindingでつなぐ。[S11](sources.md#s11)
DB用の常駐サーバーや別のImages Workerを必要なく追加しない。Images bindingのローカル実装は全機能の完全エミュレーションではない。[S16](sources.md#s16)
D1 migration・seedのCLIにも同じローカル保存先と同じ生成configを渡す。別ディレクトリの空DBへ投入する事故を防ぐ。

## checkoutの準備とGit hooks

新しいclone・worktreeでは `bun install --frozen-lockfile` を実行する。rootの `prepare` が `lefthook install` を実行するため、依存キャッシュを再利用する場合もhookを導入する。Dev Containerの `postCreateCommand` も同じ経路を使う。`--ignore-scripts` はCIの依存導入専用で、通常のworktree初期化には使わない。

hookは各checkoutの `bunx --no-install lefthook` を使う。グローバル版や別OSの絶対パスに依存せず、依存がなければコミットを失敗させる。型付きlint前にはParaglideを生成する。既存checkoutの修復は `bun run hooks:install` を使い、`core.hooksPath` の上書きや検査回避は行わない。

`commit-msg` はcommitlintでConventional Commits、件名先頭のGitmoji、本文・Issue番号必須を検査する。Issue番号は件名末尾の `(#123)`、または本文・footerの `Refs #123` 等で記載する。メッセージは英語で書き、[コミット規約](../.agents/skills/conventional-commit/SKILL.md)に従う。`wip`で始まる作業途中のメッセージとcommitlint標準のmerge・revert等の除外は維持する。保存済みメッセージは `bunx --no-install commitlint --edit <ファイル>`、直前のコミットは `bunx --no-install commitlint --last --verbose` で確認できる。

## worktree識別子

ホスト開発のURLは `<service>.<worktree名>.tablecast-poc.localhost`。branch末尾を小文字・英数字・ハイフンへ正規化し、先頭47文字へ切り取り、末尾のハイフンを除く。branchがない場合は `git rev-parse --short=8 HEAD` を使う。たとえば `codex/268-portless-dev` のWebは `http://web.268-portless-dev.tablecast-poc.localhost`。名前の衝突はPortlessで拒否し、自動suffixや上書きを使わない。
Dev Containerは引き続き `<worktree>.<repo>.container.localhost:<port>` とCaddyを使う。コンテナの命名と公開ポートは [Dev Containerの構成](devcontainer.md) を参照する。
Worker・D1・R2・Composeもworktree名を使う。保存先は常にこのworktreeの `.local/state` とし、名前別ディレクトリを作らない。branch名の変更やdetachedのcommit更新で名前が変わった場合、通常起動は自動消去せず停止する。変更前に `bun run services:down` で旧Composeを停止し、変更後に `bun run demo:reset` で開発データを作り直す。認証secretとデモ資格情報は維持する。
独自リソース名には `tablecast` を含める。

| 対象        | 例・分離内容                                               |
| ----------- | ---------------------------------------------------------- |
| Webのホスト | `web.<worktree名>.tablecast-poc.localhost`                 |
| Worker      | `tablecast-<worktree名>-web`、`tablecast-<worktree名>-api` |
| 公開環境値  | `TABLECAST_PUBLIC_ORIGIN` 等                               |
| 保存先      | `<worktree>/.local/state`、生成設定とログも `.local`       |
| JS依存      | worktree固有node_modules、Bunの不変cacheは共有可           |
| 認証        | worktree固有secret、正確な公開origin                       |

Cookieはポートでは分離されないため、worktreeごとにホスト名を分ける。同一worktreeのコンテナは `<worktree>.<repo>.container.localhost` とし、通常起動とのCookie共有を防ぐ。host-only Cookieを維持する。[S18](sources.md#s18)
`.localhost` の解決・HTTPS・ブラウザー対応は環境ごとに起動診断する。iPadには到達可能なLANホスト名と信頼された証明書が別途必要。

## ポートと起動設定

### Storybook MCP

ルートで `bun run setup`、`bun run storybook` を順に実行する。Storybook公式CLIを直接使い、DB・runtimeの準備やWorkersの起動は不要である。

Storybookの起動ログのURLへ `/mcp` を付け、Git管理外の `.codex/config.toml` に登録する。標準ポートは6006で、他worktreeが使う場合は `bun run storybook --port 6007` などで指定する。既存のCodex設定は保持して次のテーブルを統合する。

```toml
[mcp_servers.tablecast-storybook]
url = "http://127.0.0.1:6006/mcp"
```

実際のportが6006以外ならURLを合わせる。Dev Container内のStorybookへホストのCodexから接続する場合は、[setupの公開ポート確認](setup.md#2a-dev-containerを使う)で得たホスト側のportを使う。設定の配置と他MCPとの併用は[agent開発環境](setup.md#2c-agent開発環境)を参照する。

CodexのMCP接続を再起動して設定を読み直す。Storybookを起動したまま `docs-list` でコンポーネント一覧、`docs-show` で対象のpropsとStory、`stories-preview` でプレビューURL、`test-run` で代表Storyのテスト結果を確認する。対象IDや入力形式はサーバーのツール一覧から取得する。ブラウザーで同じ `/mcp` を開くと利用可能なツールも確認できる。

`@storybook/addon-mcp` と `componentsManifest` を使い、既存のVitest・a11y設定で検証する。接続先はStorybook開発サーバー専用で、製品APIの `/mcp` や静的なStorybook buildとは別である。APIはpreview段階のため、更新時には実際のツール一覧と呼び出しを再確認する。

公式資料: [Storybook MCP](https://storybook.js.org/docs/ai/mcp/overview)、[Codex MCP設定](https://developers.openai.com/codex/mcp)。

### 共通の割当て

ホストではrootのpackage scriptがPortlessからTurboを起動し、名前の衝突を設定生成・Compose起動前に拒否する。Portlessが `PORT` を割り当て、route登録とプロセスの終了を所有する。共有proxyはHTTPの80番を使い、worktree固有のproxy・ポート台帳・予約ロックを作らない。WorkersのInspectorは0番を指定して実行時の割当てを使う。
LGTM・Mailpitの公開ポートはComposeの `127.0.0.1::コンテナポート` でDockerへ任せる。`services:aliases` が公式の `docker compose port` と `portless alias` でGrafana・Mailpit・Tempo・OTLPの名前を登録する。APIからMailpit・OTLPへの通信もこの名前を使う。
`.local/.env` に名前・origin・実Webポートを通常のenvとしてまとめる。Portlessが渡したWebポートを `dev:prepare` で保存し、起動前の0は未起動を表す。`runtime.json` とローカル用 `TABLECAST_CONFIG` は生成しない。保存先・configパスは実worktreeから決め、seed・demo・pluginは設定の名前と所属を確認する。Cloudflare設定はenvから直接読み、SDK用API設定だけを正本から生成する。
通常の起動前に [setupのPortless初期設定](setup.md) を済ませる。別のproxyを全消去・停止せず、停止時はこのworktreeのrouteだけを片付ける。[S19](sources.md#s19)

cf・SDKの接続台帳は`CLOUDFLARE_REGISTRY_PATH`・`MINIFLARE_REGISTRY_PATH`・`WRANGLER_REGISTRY_PATH`を同じ`.local/tablecast-wrangler-registry`へ設定してworktree間を分離する。通常開発をCtrl+Cで停止してから`dev:parity`を実行する。`dev:prepare`が生成した設定をbuildへ渡し、build・起動時に設定を再生成しない。APIは`cf build`、WebはViteの公式buildで`.cloudflare/output/v0`を生成し、Web側へAPIの成果物を集める。Vite plugin v2のpreviewはこのBuild OutputからAPI・Webを一緒に起動する。APIをpreview時に再bundleしない。cf beta.14のTanStack Start検出は`--mode`を転送できないため、Webのbuildだけはpackage scriptからViteへ明示する。

公式pluginはpreview用dotenvを成果物へコピーするため、local buildのumaskは077とし、Turbo cacheへの書込みを無効にする。E2Eは成果物を実行固有の`build/.cloudflare`へ複製する。公開buildは各workspaceのtaskが終了する前にdotenvを除外し、公式Build Output全体をcache・CI artifactへ保存する。環境・PR・SHA・DB・Container参照を配備前に再検査し、local preview成果物を公開配備しない。[公式Build Output](https://developers.cloudflare.com/cf/ci/)

## Service BindingとCookie

Webの入口から `/api`、`/mcp`、認証、画像、業務WebSocketをAPIへ内部転送する。APIへHTTP redirectしない。
PUBLIC_ORIGIN、OAuth metadata、callback、absolute URLを同じ公開originへ揃える。
CORSの全許可・Cookie Domainの共有は不要だが、通常のCSRF・SameSite・Secure・HttpOnly・認可は必要である。
GPT-Liveの音声はこのWeb入口を中継しない。ブラウザーからOpenAIまでのメディア接続を別に検証する。

## 秘密情報と `.worktreeinclude`

ルートの `.env.local` だけをコピー対象にする。開発専用の資格と設定項目は `.env.example` に揃える。Bunの読込順と旧ファイルからの移行は [セットアップ](setup.md#4-envと音声接続) に従う。
OpenAI SDKへTABLECAST_MODEL_API_KEYを明示的に渡し、ブラウザーへキーを公開しない。
PORT、PUBLIC_ORIGIN、state path、認証secret、Cloudflare本番資格、TLS秘密鍵は共有ファイルに入れない。
これらはworktree初期化で生成し `.local` に置く。envをshellとしてevalせず、標準env読込みで必要な値だけ各runtimeへ渡す。

`.worktreeinclude` はCodexのローカルworktree機能であり、Git標準ではない。通常のgit worktreeでは自動コピーされない。[S15](sources.md#s15)
.gitignoreで無視される同一ファイルだけを対象とし、node_modules、.cloudflare、.wrangler、DB、ログ、証明書をコピーしない。
手動worktreeでは既存のsecret管理から同じファイルを安全に配置する。汎用glob同期やsymlink追跡の再実装はしない。
Bunのlockfile、migration、fixtureソース、必要な上流patchはGitへ保存する。

## 提供するscript契約

以下のコマンドを実装済み。初回はDockerを起動して依存を導入する。外部音声設定が未登録でもGUI注文は起動する。

| コマンド                                   | 役割                                                         |
| ------------------------------------------ | ------------------------------------------------------------ |
| `bun install`                              | 固定方針に従ってJS依存を導入                                 |
| `bun run dev:prepare`                      | worktree名・env・DB migration・初期seed                      |
| `bun run dev`                              | TurboとPortlessでWeb/API・OAuth、Composeで周辺サービスを起動 |
| `bun run dev:parity`                       | build済みWorkersのローカル疎通                               |
| `bun run services:status`                  | Composeサービスの状態と公開port                              |
| `bun run storybook`                        | Web内のStorybookだけを起動                                   |
| `bun run db:seed -- --profile demo`        | 自worktreeのlocal seed                                       |
| `bun run demo:reset` / `bun run demo:play` | ローカル状態の再現・進行                                     |
| Ctrl+C / `bun run services:down`           | Web・音声とDockerサービスをそれぞれ停止する                  |

起動順は `turbo.json`、実行するCLIは各 `package.json` に定義する。 ホストの外部サービスはルート `compose.yaml`、Dev Container固有の構成は `.devcontainer/compose.yaml` に置く。worktree固有設定だけを `scripts/tablecast-runtime.ts` で生成する。

ローカルの `TABLECAST_RELEASE_SHA` は設定生成時のGit HEADを使う。追跡対象の変更や未追跡ファイルがある場合は `-dirty` を付け、commitと完全一致する実行と区別する。無視対象の `.local` や秘密設定は対象外とする。編集中の全状態を復元できる識別子ではなく、変更後は再起動して診断情報を更新する。

標準音声Marin・CedarはAPIの固定候補から選ぶ。外部の音声一覧用キーは不要。GPT-Liveの利用資格と実音声試験は無課金の境界試験と区別する。
破壊的操作はlocal targetとworktree所有を検査し、remote/productionを拒否する。アプリが書込み中のDBファイルを無造作に削除しない。
同じ番号のmigrationとlockfileを並列生成しないよう統合担当を決める。Git hooksは各checkoutの現行設定を使い、共通Git設定を勝手に変更しない。

## 実機・公開環境

iPadのマイクは安全なコンテキストで試す。信頼されたローカルHTTPSとOpenAIへ到達可能なネットワーク、またはAccessで保護したPR環境を利用する。
Cloudの強化音声処理は必要な追加比較として分離し、日常開発の成立条件にしない。
本番はWeb/APIの2 Workers、D1・DO・R2・ImagesとOpenAIの外部APIを対象とする。
公式設定を確認してデプロイし、設定・migration・secret・release SHA・ロールバック方法を記録する。GPT-Live・Lunaのモデルとprojectの利用権限を確認する。

## タスクの所有者

`package.json` はCLI、`turbo.json` は依存と同時実行を所有する。Webのdevは `dependsOn` で初期化とCompose起動を待ち、`with` でOAuthを併走させる。WebはrootのPortlessから起動し、OAuthだけを別のPortlessで併走させる。常駐タスクは `persistent: true` / `cache: false`、データを書き込む初期化とlocal buildもcacheしない。Paraglide生成は入力と出力を指定してcacheする。Turborepoのstrict envを維持し、各workspaceのBunが生成された `.local/.env` を読む。API WorkerはViteの補助Workerとして一度だけ起動する。

独自のdev daemonは持たない。WebはCtrl+C、ホストのDockerサービスは `bun run services:down` で終了する。具体的なコマンドは [setup.md](setup.md) にまとめる。

## メールカタログの検証

既存APIのReact Emailテンプレートから、一覧と招待・メール確認・パスワード再設定の静的HTMLを生成する。`TABLECAST_RELEASE_SHA=$(git rev-parse HEAD) bun --no-env-file run build:email`で`apps/api/email-static`へ出力する。`cd apps/api`の後に`bun ../web/node_modules/.bin/vite preview --outDir email-static --port 6007`で静的HTMLを確認し、終了時はViteを停止する。

生成HTMLは編集せず、レイアウト・日英文言はAPIのメール実装、架空データと一覧は`apps/api/scripts/tablecast-email-build.ts`を変更する。編集・診断・送信機能は持たない。追加の依存導入やDev ContainerのRebuildは不要。

## 統合先とrelease

作業branchは`origin/staging`から作成し、stagingへPRを出す。共用stagingは[配備手順](deployment.md#stagingとreleaseの運用)に従って利用し、ローカル終了処理で停止・リセットしない。実装Issueの開発完了とmainへの本番releaseを区別する。

## Renovateによる依存更新

設定は[Renovate設定](../.github/renovate.json5)で管理し、標準Mend Renovate GitHub Appをこのリポジトリへ接続する。botが作成・更新するDependency Dashboardに検出した依存、PR、保留・エラー・再実行を集約する。手動の追跡Issueや専用のIssue作成workflowは使わない。`.agents/skills/**`は更新対象から除き、skill内の参考workflowを実際のCI依存として更新しない。

通常更新は日本時間の月曜6〜12時、非majorは一つのPR、majorはReact・Vitest・Storybook等の互換単位で分ける。lockfileも週次で更新する。セキュリティ更新は通常の時間帯制限から除外する。PRはstaging向けDraft、buildラベル、日本語の4項目の本文とし、自動マージしない。

commitは英語のConventional CommitsとGitmoji一つ、英語本文を維持する。標準テンプレートはDashboardの数値IDをcommitへ展開しないため、規約の根拠として導入Issue #292をRefsで参照する。更新の管理はDashboardが所有し、導入IssueとDashboardは自動更新PRで閉じない。commitlintの免除は追加しない。

TypeScriptのJavaScript API用6系とCLI用安定7系を分け、Nodeと型定義は24系を使う。cfとCloudflare Vite plugin v2だけは既採用betaを追跡し、新しい先行版系列を導入しない。設定の検証とAppの稼働は別に確認し、実PRの作成は設定がstagingへ入った後のApp実行で確認する。

RenovateのPRタイトルは、推奨設定に従って英語のcommit件名から生成する。`prTitle`は個別指定せず、`commitMessageAction`や`commitMessageTopic`でcommitと共通の表現を設定する。自動更新PRは日本語タイトル規約の例外とし、本文は既存の日本語4項目を維持する。
