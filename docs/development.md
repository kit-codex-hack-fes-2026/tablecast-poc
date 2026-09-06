# ローカル開発とworktree

[索引](README.md)

## 基本構成

BunでJS依存とタスクを管理し、Turborepoでworkspace間の順序・キャッシュを扱う。Pythonはuvで管理する。
Bunを使っても本番Workersのruntimeはworkerdであり、Wrangler/Vite/Storybookの実行要件を勝手に変更しない。
互換性のため公式CLIにNodeが必要なら使う。Bunの採用を理由にVitestをbun testへ置換しない。[S13](sources.md#s13)

ローカル対象はWeb、Hono/Mastra、D1、DO、R2、Imagesの対応範囲、LiveKit Server、Python Agent、MCP、Storybook。
外部通信はLLM、Inworld STT、Inworld TTSを基本とする。OAuthプロバイダー・ChatGPT到達性の確認は別の統合試験とする。
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

## worktree識別子

正規化したworktree実パスとrepository識別子から短いhashを作る。branch名を正本にせず、detached HEADでも一意にする。
独自リソース名には `tablecast` を含める。

| 対象              | 例・分離内容                                         |
| ----------------- | ---------------------------------------------------- |
| Webのホスト       | `tablecast-<id>.localhost`                           |
| LiveKit signaling | `livekit-tablecast-<id>.localhost`                   |
| Worker            | `tablecast-<id>-web`、`tablecast-<id>-api`           |
| 公開環境値        | `TABLECAST_PUBLIC_ORIGIN` 等                         |
| 保存先            | `<worktree>/.local/state`、生成設定とログも `.local` |
| Python            | `<worktree>/livekit/.venv`                           |
| JS依存            | worktree固有node_modules、Bunの不変cacheは共有可     |
| 認証              | worktree固有secret、正確な公開origin                 |
| LiveKit           | 専用Server、ports、Room、dispatch名、開発鍵          |

Cookieはポートでは分離されないため、単にlocalhostのポートだけを変える構成にしない。host-only Cookieとホスト分離を使う。[S18](sources.md#s18)
`.localhost` の解決・HTTPS・ブラウザー対応は環境ごとに起動診断する。iPadには到達可能なLANホスト名と信頼された証明書が別途必要。

## ポートと起動設定

小さなbootstrapでWeb、Inspector、LiveKit signaling、RTC TCP、UDP mux、Agent health、Storybookをまとめて割り当てる。
既存のポート割当て機能を先に使い、不足するUDP等だけを補う。汎用process supervisorや独自reverse proxy、独立したtopology packageは作らない。
一つのruntime manifestにホスト、port、state、PID、生成configを記録する。ポートを複数package.jsonへ直書きしない。
同時初期化時の予約はgit common directory内の小さな台帳を排他更新し、TCPとUDPの両方を確認する。秘密情報は共通台帳へ置かない。
空き確認後にも競合し得るため、bind失敗時は別の予約で起動し直す。既存プロセスをkillしてポートを奪わない。
フレームワークの自動port繰上げを無効にし、古いOAuth callbackや間違ったworktreeへ接続しないようにする。

ホストalias・TLS・proxyは既存のPortless等のツールを利用する。導入時に対応OSと公式の起動方法を確認し、参照スターターの独自topologyシステムを丸ごとコピーしない。[S19](sources.md#s19)
共有proxyを個別worktreeから強制終了・全消去しない。自分が作ったalias・process・stateだけを操作する。

Wranglerの接続台帳は `WRANGLER_REGISTRY_PATH` で `.local/tablecast-wrangler-registry` に分離する。`dev:parity` は実行ごとに自環境を停止し、`TABLECAST_LOCAL_BUILD=1` とworktree固有のconfigを渡してWebの公式buildを直接実行する。生成された `.wrangler/deploy/config.json` から2 Workersをpreviewで起動し、同じD1・R2・DOの保存先を使う。configを手製で再構築したり、APIを再bundleしたりしない。

公式pluginはpreview用の `.dev.vars` をserver成果物へコピーするため、開発プロセスのumaskを077とし、ローカルbuildはTurboの共有cacheへ入れない。通常の `bun run build` はリポジトリの配備configを使い、成果物とdeploy manifestを一緒にcacheする。公開時には通常buildを実行し、ローカルpreview成果物を配備しない。[公式previewと設定](https://developers.cloudflare.com/workers/vite-plugin/reference/api/)、[秘密情報の読込み](https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/)

## Service BindingとCookie

Webの入口から `/api`、`/mcp`、認証、画像、業務WebSocketをAPIへ内部転送する。APIへHTTP redirectしない。
PUBLIC_ORIGIN、OAuth metadata、callback、absolute URLを同じ公開originへ揃える。
CORSの全許可・Cookie Domainの共有は不要だが、通常のCSRF・SameSite・Secure・HttpOnly・認可は必要である。
LiveKitのUDPはこのWeb入口とは独立する。signalingを既存proxyで扱う場合も、メディア接続の到達性を別に検証する。

## 秘密情報と `.worktreeinclude`

ルートの `.env.secrets.local` だけをコピー対象にする。開発専用で権限と利用予算を制限したLLM/Inworld資格のみを入れる。
`INWORLD_API_KEY` のような外部SDKが要求する変数名は変更しない。独自変数にだけTABLECAST prefixを使う。
PORT、PUBLIC_ORIGIN、state path、認証secret、LiveKit開発鍵、Cloudflare本番資格、TLS秘密鍵は共有ファイルに入れない。
これらはworktree初期化で生成し `.local` に置く。envをshellとしてevalせず、標準env読込みで必要な値だけ各runtimeへ渡す。

`.worktreeinclude` はCodexのローカルworktree機能であり、Git標準ではない。通常のgit worktreeでは自動コピーされない。[S15](sources.md#s15)
.gitignoreで無視される同一ファイルだけを対象とし、node_modules、.venv、.wrangler、DB、ログ、証明書をコピーしない。
手動worktreeでは既存のsecret管理から同じファイルを安全に配置する。汎用glob同期やsymlink追跡の再実装はしない。
Bun/uvのlockfile、migration、fixtureソース、必要な上流patchはGitへ保存する。

## 提供するscript契約

以下のコマンドを実装済み。初回はDockerを起動して依存を導入する。外部音声設定が未登録でもGUI注文とローカルLiveKitは起動する。

| コマンド                                   | 役割                                                  |
| ------------------------------------------ | ----------------------------------------------------- |
| `bun install`                              | 固定方針に従ってJS依存を導入                          |
| `uv sync --project livekit`                | Python依存を導入                                      |
| `bun run dev:prepare`                      | worktree ID・ports・config・local migration・初期seed |
| `bun run dev`                              | Web/API、ローカルLiveKit、Python Agentを起動          |
| `bun run dev:parity`                       | build済みWorkersのローカル疎通                        |
| `bun run dev:status`                       | URL・port・process・stateの対応を表示。秘密情報は除外 |
| `bun run storybook`                        | Web内のStorybookだけを起動                            |
| `bun run db:seed -- --profile demo`        | 自worktreeのlocal seed                                |
| `bun run demo:reset` / `bun run demo:play` | ローカル状態の再現・進行                              |
| `bun run dev:stop`                         | 自worktreeで開始したものだけ停止                      |

実装は `scripts/tablecast-dev.ts` と `scripts/tablecast-runtime.ts`。起動時はWeb/APIとLiveKitの疎通を確認し、状態とログの場所を表示する。`bun --no-env-file scripts/tablecast-livekit-check.ts` は2つのブラウザーで合成音声の実RTP受信とRoom削除による切断を検査し、結果を `.local/livekit-check.json` に保存する。外部AIや実マイクは使用しない。

ローカルの `TABLECAST_RELEASE_SHA` は設定生成時のGit HEADを使う。追跡対象の変更や未追跡ファイルがある場合は `-dirty` を付け、commitと完全一致する実行と区別する。無視対象の `.local` や秘密設定は対象外とする。編集中の全状態を復元できる識別子ではなく、変更後は再起動して診断情報を更新する。

標準音声の一覧・検証だけを使う場合は、開発用Read権限キーを `.env.secrets.local` の `TABLECAST_INWORLD_VOICES_API_KEY` に設定して再起動する。APIの `.local/.dev.vars` へだけ渡し、ブラウザーとPythonへは渡さない。このキー単独では音声受付・Agentを起動しない。実在候補の取得には外部接続が必要で、無資格の試験はprovider境界のfixtureと区別する。
破壊的操作はlocal targetとworktree所有を検査し、remote/productionを拒否する。アプリが書込み中のDBファイルを無造作に削除しない。
同じ番号のmigrationとlockfileを並列生成しないよう統合担当を決める。Git hooksは各checkoutの現行設定を使い、共通Git設定を勝手に変更しない。

## 実機・公開環境

iPadのマイクは安全なコンテキストで試す。信頼されたローカルHTTPSと到達可能なLiveKit、またはstagingを利用する。
Cloudの強化音声処理は必要な追加比較として分離し、日常開発の成立条件にしない。
本番はWeb/APIの2 Workers、D1・DO・R2・Images、LiveKit Cloudまたは対応コンテナのPython Agentを対象とする。
公式設定を確認してデプロイし、設定・migration・secret・release SHA・ロールバック方法を記録する。音声の本番接続先もInworldのままにする。
