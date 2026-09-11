# ローカル開発とworktree

[索引](README.md) · [cloneからのセットアップ](setup.md)

## 基本構成

BunでJS依存とタスクを管理し、Turborepoでworkspace間の順序・キャッシュを扱う。Pythonはuvで管理する。
Bunを使っても本番Workersのruntimeはworkerdであり、Wrangler/Vite/Storybookの実行要件を勝手に変更しない。
互換性のため公式CLIにNodeが必要なら使う。Bunの採用を理由にVitestをbun testへ置換しない。[S13](sources.md#s13)

ローカル対象はWeb、Hono/Mastra、D1、DO、R2、Imagesの対応範囲、LiveKit Server、Python Agent、MCP、Storybook。
通常音声の外部通信はOpenAI Realtime 2.1とInworld TTSを使う。Pythonのenvはuv自身が `.env.local` と生成済みの `.local/.env.voice` から読む。Bunによる資格の転送は行わない。`TABLECAST_MODEL` はMastraのテキスト応答・自発接客用で、通常音声モデルは `gpt-realtime-2.1` に固定する。OAuthプロバイダー・ChatGPT到達性の確認は別の統合試験とする。
ローカルの従業員認証には実Better Authとローカルメール受信箱等の最小の開発経路を使い、常設の認証bypassを作らない。

## 通常開発と本番相当試験

| モード   | 起動方式                                                       | 用途                                             |
| -------- | -------------------------------------------------------------- | ------------------------------------------------ |
| 通常     | TanStack Start + Cloudflare Vite Plugin、APIをauxiliary Worker | UIのHMRと実Binding                               |
| 本番相当 | build済みWebとAPIをCloudflare Vite previewで起動               | Service Binding、build、stream、Cookieの接続確認 |
| UI部品   | apps/web内のStorybook                                          | 固定状態とブラウザー操作検証                     |
| 音声     | ローカルLiveKit ServerとPython Agent                           | AEC、ターン、Inworld、Mastra                     |

Cloudflareはmultiworkerのローカル起動と資源の永続化を提供する。公式の対応版を揃え、同じAPI WorkerをVite補助と独立Wranglerで二重起動しない。[S11](sources.md#s11)
DB用の常駐サーバーや別のImages Workerを必要なく追加しない。Images bindingのローカル実装は全機能の完全エミュレーションではない。[S16](sources.md#s16)
D1 migration・seedのCLIにも同じローカル保存先と同じ生成configを渡す。別ディレクトリの空DBへ投入する事故を防ぐ。

## checkoutの準備とGit hooks

新しいclone・worktreeでは `bun install --frozen-lockfile` を実行する。rootの `prepare` が `lefthook install` を実行するため、依存キャッシュを再利用する場合もhookを導入する。Dev Containerの `postCreateCommand` も同じ経路を使う。`--ignore-scripts` はCIの依存導入専用で、通常のworktree初期化には使わない。

hookは各checkoutの `bunx --no-install lefthook` を使う。グローバル版や別OSの絶対パスに依存せず、依存がなければコミットを失敗させる。型付きlint前にはParaglideを生成する。既存checkoutの修復は `bun run hooks:install` を使い、`core.hooksPath` の上書きや検査回避は行わない。

`commit-msg` はcommitlintでConventional Commits、件名先頭のGitmoji、本文・Issue番号必須を検査する。Issue番号は件名末尾の `(#123)`、または本文・footerの `Refs #123` 等で記載する。メッセージは英語で書き、[コミット規約](../.agents/skills/conventional-commit/SKILL.md)に従う。`wip`で始まる作業途中のメッセージとcommitlint標準のmerge・revert等の除外は維持する。保存済みメッセージは `bunx --no-install commitlint --edit <ファイル>`、直前のコミットは `bunx --no-install commitlint --last --verbose` で確認できる。

## worktree識別子

ブラウザー用のドメインは `<worktree>.<repo>.localhost`。メインcheckoutは `main.tablecast-poc.localhost`、`voice-ui` という追加worktreeは `voice-ui.tablecast-poc.localhost` になる。repo名はGit共通ディレクトリの親フォルダー名から取得し、detached HEADでも変わらない。各ラベルを小文字化し、英数字・ハイフン以外をハイフンに置換する。名前の重複は起動時に拒否する。
内部リソースの識別子は正規化したworktree実パスとrepository識別子から作る短いhashを維持し、ドメイン変更で保存済みD1・R2を失わない。Git commitが変わってもドメインは変わらない。
独自リソース名には `tablecast` を含める。

| 対象              | 例・分離内容                                         |
| ----------------- | ---------------------------------------------------- |
| Webのホスト       | `<worktree>.<repo>.localhost`                        |
| LiveKit signaling | `livekit-<worktree>.<repo>.localhost`                |
| Worker            | `tablecast-<id>-web`、`tablecast-<id>-api`           |
| 公開環境値        | `TABLECAST_PUBLIC_ORIGIN` 等                         |
| 保存先            | `<worktree>/.local/state`、生成設定とログも `.local` |
| Python            | `<worktree>/livekit/.venv`                           |
| JS依存            | worktree固有node_modules、Bunの不変cacheは共有可     |
| 認証              | worktree固有secret、正確な公開origin                 |
| LiveKit           | 専用Server、ports、Room、dispatch名、開発鍵          |

Cookieはポートでは分離されないため、worktreeごとにホスト名を分ける。同一worktreeのコンテナは `<worktree>.<repo>.container.localhost` とし、通常起動とのCookie共有を防ぐ。host-only Cookieを維持する。[S18](sources.md#s18)
`.localhost` の解決・HTTPS・ブラウザー対応は環境ごとに起動診断する。iPadには到達可能なLANホスト名と信頼された証明書が別途必要。

## ポートと起動設定

### Storybook MCP

ルートで `bun install --frozen-lockfile`、`bun run codegen`、`bun run storybook` を順に実行する。Storybookだけを起動し、runtime未作成なら既存のポート予約処理でworktree専用ポートを確保する。DBの準備やWorkers・音声Agentの起動は不要である。

Storybookの起動ログのURLへ `/mcp` を付け、Git管理外の `.codex/config.toml` に登録する。標準ポートは6006で、他worktreeが使う場合は `bun run storybook --port 6007` などで指定する。既存のCodex設定は保持して次のテーブルを統合する。

```toml
[mcp_servers.tablecast-storybook]
url = "http://127.0.0.1:<port>/mcp"
```

CodexのMCP接続を再起動して設定を読み直す。Storybookを起動したまま `docs-list` でコンポーネント一覧、`docs-show` で対象のpropsとStory、`stories-preview` でプレビューURL、`test-run` で代表Storyのテスト結果を確認する。対象IDや入力形式はサーバーのツール一覧から取得する。ブラウザーで同じ `/mcp` を開くと利用可能なツールも確認できる。

`@storybook/addon-mcp` と `componentsManifest` を使い、既存のVitest・a11y設定で検証する。接続先はStorybook開発サーバー専用で、製品APIの `/mcp` や静的なStorybook buildとは別である。APIはpreview段階のため、更新時には実際のツール一覧と呼び出しを再確認する。

公式資料: [Storybook MCP](https://storybook.js.org/docs/ai/mcp/overview)、[Codex MCP設定](https://developers.openai.com/codex/mcp)。

### 共通の割当て

小さなbootstrapでWeb、Inspector、LiveKit signaling、RTC TCP、UDP mux、Agent health、Storybookをまとめて割り当てる。
既存のポート割当て機能を先に使い、不足するUDP等だけを補う。汎用process supervisorや独自reverse proxy、独立したtopology packageは作らない。
一つのruntime manifestにホスト、port、state、生成configを記録する。ポートを複数package.jsonへ直書きしない。
同時初期化時の予約はgit common directory内の小さな台帳を排他更新し、TCPとUDPの両方を確認する。秘密情報は共通台帳へ置かない。
空き確認後にも競合し得るため、bind失敗時は別の予約で起動し直す。既存プロセスをkillしてポートを奪わない。
フレームワークの自動port繰上げを無効にし、古いOAuth callbackや間違ったworktreeへ接続しないようにする。

ホストalias・TLS・proxyは既存のPortless等のツールを利用する。導入時に対応OSと公式の起動方法を確認し、参照スターターの独自topologyシステムを丸ごとコピーしない。[S19](sources.md#s19)
共有proxyを個別worktreeから強制終了・全消去しない。自分が作ったalias・process・stateだけを操作する。

Wranglerの接続台帳は `WRANGLER_REGISTRY_PATH` で `.local/tablecast-wrangler-registry` に分離する。通常開発をCtrl+Cで停止してから `dev:parity` を実行し、`TABLECAST_LOCAL_BUILD=1` とworktree固有のconfigを渡してWebの公式buildを直接実行する。生成された `.wrangler/deploy/config.json` から2 Workersをpreviewで起動し、同じD1・R2・DOの保存先を使う。configを手製で再構築したり、APIを再bundleしたりしない。

公式pluginはpreview用の `.dev.vars` をserver成果物へコピーするため、開発プロセスのumaskを077とし、ローカルbuildはTurboの共有cacheへ入れない。通常の `bun run build` はリポジトリの配備configを使い、成果物とdeploy manifestを一緒にcacheする。公開時は[CI/CD手順](deployment.md)で生成した環境別configをbuildへ渡し、ローカルpreview成果物を配備しない。[公式previewと設定](https://developers.cloudflare.com/workers/vite-plugin/reference/api/)、[秘密情報の読込み](https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/)

## Service BindingとCookie

Webの入口から `/api`、`/mcp`、認証、画像、業務WebSocketをAPIへ内部転送する。APIへHTTP redirectしない。
PUBLIC_ORIGIN、OAuth metadata、callback、absolute URLを同じ公開originへ揃える。
CORSの全許可・Cookie Domainの共有は不要だが、通常のCSRF・SameSite・Secure・HttpOnly・認可は必要である。
LiveKitのUDPはこのWeb入口とは独立する。signalingを既存proxyで扱う場合も、メディア接続の到達性を別に検証する。

## 秘密情報と `.worktreeinclude`

ルートの `.env.local` だけをコピー対象にする。開発専用の資格と設定項目は `.env.example` に揃える。Bunの読込順と旧ファイルからの移行は [セットアップ](setup.md#4-envとpython音声) に従う。
`INWORLD_API_KEY` のような外部SDKが要求する変数名は変更しない。独自変数にだけTABLECAST prefixを使う。
PORT、PUBLIC_ORIGIN、state path、認証secret、LiveKit開発鍵、Cloudflare本番資格、TLS秘密鍵は共有ファイルに入れない。
これらはworktree初期化で生成し `.local` に置く。envをshellとしてevalせず、標準env読込みで必要な値だけ各runtimeへ渡す。

`.worktreeinclude` はCodexのローカルworktree機能であり、Git標準ではない。通常のgit worktreeでは自動コピーされない。[S15](sources.md#s15)
.gitignoreで無視される同一ファイルだけを対象とし、node_modules、.venv、.wrangler、DB、ログ、証明書をコピーしない。
手動worktreeでは既存のsecret管理から同じファイルを安全に配置する。汎用glob同期やsymlink追跡の再実装はしない。
Bun/uvのlockfile、migration、fixtureソース、必要な上流patchはGitへ保存する。

## 提供するscript契約

以下のコマンドを実装済み。初回はDockerを起動して依存を導入する。外部音声設定が未登録でもGUI注文とローカルLiveKitは起動する。

| コマンド                                   | 役割                                                      |
| ------------------------------------------ | --------------------------------------------------------- |
| `bun install`                              | 固定方針に従ってJS依存を導入                              |
| `uv sync --project livekit`                | Python依存を導入                                          |
| `bun run dev:prepare`                      | worktree ID・ports・config・local migration・初期seed     |
| `bun run dev`                              | TurboでWeb/API・OAuth・proxy、Composeで周辺サービスを起動 |
| `bun run dev:parity`                       | build済みWorkersのローカル疎通                            |
| `bun run services:status`                  | Composeサービスの状態と公開port                           |
| `bun run storybook`                        | Web内のStorybookだけを起動                                |
| `bun run db:seed -- --profile demo`        | 自worktreeのlocal seed                                    |
| `bun run demo:reset` / `bun run demo:play` | ローカル状態の再現・進行                                  |
| Ctrl+C / `bun run services:down`           | Web・音声とDockerサービスをそれぞれ停止する               |

起動順は `turbo.json`、実行するCLIは各 `package.json` に定義する。worktree固有設定だけを `scripts/tablecast-runtime.ts` で生成する。`bun --no-env-file scripts/tablecast-livekit-check.ts` は2つのブラウザーで合成音声の実RTP受信とRoom削除による切断を検査し、結果を `.local/livekit-check.json` に保存する。外部AIや実マイクは使用しない。

ローカルの `TABLECAST_RELEASE_SHA` は設定生成時のGit HEADを使う。追跡対象の変更や未追跡ファイルがある場合は `-dirty` を付け、commitと完全一致する実行と区別する。無視対象の `.local` や秘密設定は対象外とする。編集中の全状態を復元できる識別子ではなく、変更後は再起動して診断情報を更新する。

標準音声の一覧・検証だけを使う場合は、開発用Read権限キーを `.env.local` の `TABLECAST_INWORLD_VOICES_API_KEY` に設定して再起動する。APIの `.local/.dev.vars` へ渡し、ブラウザーへ公開しない。Python AgentではこのRead専用キーを使用しない。このキー単独では音声受付・Agentを起動しない。実在候補の取得には外部接続が必要で、無資格の試験はprovider境界のfixtureと区別する。
破壊的操作はlocal targetとworktree所有を検査し、remote/productionを拒否する。アプリが書込み中のDBファイルを無造作に削除しない。
同じ番号のmigrationとlockfileを並列生成しないよう統合担当を決める。Git hooksは各checkoutの現行設定を使い、共通Git設定を勝手に変更しない。

## 実機・公開環境

iPadのマイクは安全なコンテキストで試す。信頼されたローカルHTTPSと到達可能なLiveKit、またはAccessで保護したPR環境を利用する。
Cloudの強化音声処理は必要な追加比較として分離し、日常開発の成立条件にしない。
本番はWeb/APIの2 Workers、D1・DO・R2・Images、LiveKit Cloudまたは対応コンテナのPython Agentを対象とする。
公式設定を確認してデプロイし、設定・migration・secret・release SHA・ロールバック方法を記録する。音声の本番接続先もInworldのままにする。

## タスクの所有者

`package.json` はCLI、`turbo.json` は依存と同時実行を所有する。Webのdevは `dependsOn` で初期化とCompose起動を待ち、`with` でOAuthとproxyを併走させる。常駐タスクは `persistent: true` / `cache: false`、データを書き込む初期化とlocal buildもcacheしない。Paraglide生成は入力と出力を指定してcacheする。Turborepoのstrict envを維持し、各workspaceのBunが生成された `.local/.env` を読む。API WorkerはViteの補助Workerとして一度だけ起動する。

独自のdev daemonは持たない。WebはCtrl+C、PythonはuvのターミナルでCtrl+C、ホストのDockerサービスは `bun run services:down` で終了する。Python用のenvをJS側で解決しない。具体的なコマンドは [setup.md](setup.md) にまとめる。
