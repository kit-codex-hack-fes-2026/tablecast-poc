# 公開環境の準備と更新

[仕様索引](README.md) · [ローカル起動](../README.md) · [残る実機検証](feasibility.md)

この手順は未実行。現在のWrangler設定はローカル用であり、公開用のアカウント・DB ID・ホスト・資格は登録されていない。以下は資格が揃った後にstagingで実施し、確認した同じreleaseを本番へ進める手順である。`dev:prepare`、`db:seed`、`demo:reset`は公開環境には使わない。

## 公開設定を確定する

まず `bun --no-env-file x wrangler whoami` で利用アカウントを確認する。必要なD1とR2をWranglerの `d1 create`、`r2 bucket create` で作り、その出力にある実在ID・名前だけを設定へ転記する。秘密やアカウント権限を開発用 `.env.secrets.local` へ入れない。[D1の公式CLI](https://developers.cloudflare.com/d1/wrangler-commands/)、[R2の公式CLI](https://developers.cloudflare.com/r2/reference/wrangler-commands/)

`apps/api/wrangler.jsonc` と `apps/web/wrangler.jsonc` にそれぞれ `env.staging` を追加する。環境ごとに必要なbinding・varsを明示する。名前は `tablecast-api-staging` と `tablecast-web-staging` を使い、実際のアカウントで重複していないことを確認する。

| 設定                          | stagingで確定する値                                         |
| ----------------------------- | ----------------------------------------------------------- |
| Webの公開先                   | 所有するHTTPSホスト。Webだけを公開する                      |
| Web `TABLECAST_API`           | `tablecast-api-staging` へのService Binding                 |
| API `workers_dev`             | `false`。APIへ直接の公開routeを付けない                     |
| API `TABLECAST_ENV`           | `staging`。本番では `production`                            |
| API `TABLECAST_PUBLIC_ORIGIN` | Webの正確なHTTPS origin。末尾slashなし                      |
| API `TABLECAST_RELEASE_SHA`   | 今回検証した `git rev-parse HEAD` の実値                    |
| API `TABLECAST_VOICE_ENABLED` | 初期値は文字列 `false`。音声の準備完了後だけ `true`         |
| API `TABLECAST_DB`            | この環境専用のD1 ID。`migrations_dir` は既存の `migrations` |
| API `TABLECAST_EVENTS`        | `StoreEvents` のSQLite DO。既存migration tagを維持する      |
| API `TABLECAST_MEDIA`         | この環境専用のR2 bucket                                     |
| API `TABLECAST_IMAGES`        | Cloudflare Images binding。利用可能な契約を確認する         |

`compatibility_date` と `nodejs_compat` は検証済み設定を維持する。Workersのサイズと起動CPU制限は公開時の公式値を確認する。ローカルのdry-run成功は遠隔の起動時間検証を代替しない。[Workersの制限](https://developers.cloudflare.com/workers/platform/limits/)

## 秘密情報と初期管理データ

秘密は `bun --no-env-file x wrangler secret put KEY --config apps/api/wrangler.jsonc --env staging` の対話入力で登録する。`KEY` は次の表の実際の変数名へ置き換える。秘密値をコマンド引数やGitへ保存しない。[Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

| APIの秘密                                                      | 用途                                                                                   |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `TABLECAST_AUTH_SECRET`                                        | staging専用の強い認証secret。通常の再deployで変更しない                                |
| `TABLECAST_VOICE_API_TOKEN`                                    | APIとPythonだけが共有する内部HTTP token                                                |
| `TABLECAST_LIVEKIT_URL`                                        | ブラウザーとAgentから到達可能なLiveKitの `wss://` URL                                  |
| `TABLECAST_LIVEKIT_API_KEY`, `TABLECAST_LIVEKIT_API_SECRET`    | この環境専用のLiveKit資格                                                              |
| `TABLECAST_MODEL`, `TABLECAST_MODEL_API_KEY`                   | 検証対象モデルとその資格                                                               |
| `TABLECAST_INWORLD_VOICES_API_KEY`                             | 標準音声metadataの一覧・実在性確認用。Read権限だけを持つ別のInworldキー                |
| `TABLECAST_GOOGLE_CLIENT_ID`, `TABLECAST_GOOGLE_CLIENT_SECRET` | Googleログインを有効にする場合のみ。callbackはWeb originの `/api/auth/callback/google` |

初回の管理者・組織・店舗team・店舗・卓・公開カタログは、migration適用後に管理CLI `db:bootstrap` で作る。Better AuthのサーバーAPIを使い、公開HTTPへ管理用の認証回避経路は追加しない。開発seedは公開環境で使えないままにする。

WranglerのJSON/JSONC設定に実在する `account_id` を明示し、`env.staging` または `env.production` にWorker名、`TABLECAST_ENV`、HTTPSの `TABLECAST_PUBLIC_ORIGIN`、対象の `TABLECAST_DB` を明示する。rootの開発bindingを暗黙に継承する入力は拒否する。DB名とWorker名は `tablecast` を含める。

入力は所有者だけが読める通常JSONファイル（例: `.local/tablecast-staging-bootstrap.json`、mode `0600`）として作る。次の項目を持ち、秘密を含むためGit・チャット・コマンド引数へ内容を貼らない。

| JSON項目       | 内容                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| `authSecret`   | 対象APIへ登録したものと同じ認証secret。32文字以上                      |
| `admin`        | `name`、`email`、12文字以上の `password`、`locale`（`ja` または `en`） |
| `organization` | `name`、新規の `slug`                                                  |
| `store`        | 新規の `id`、`name`、レビュー済みの `configuration`                    |
| `tables`       | 新規の `{ "id": "...", "name": "T01" }` の配列                         |

`configuration` は [APIの正本schema](../apps/api/src/schema.ts) と同じ日英カテゴリ・商品・プラン・キャスト設定である。初期voiceは `ja`、`en` とも `null` にする。実音声の確認後に通常の下書き検証・明示公開で設定する。価格・参照関係・卓IDの重複も書込み前に検証する。

次の一つ目は入力検査と対象表示だけで、DB接続や書込みを行わない。表示したaccount ID・DB ID・origin・店舗IDが配備対象と一致してから、同じ入力へ `--apply` を付ける。遠隔の接続にはWranglerの認証と公式remote D1 bindingを使用する。[Wrangler API](https://developers.cloudflare.com/workers/wrangler/api/)

```sh
bun --no-env-file run db:bootstrap --config apps/api/wrangler.jsonc --env staging --input .local/tablecast-staging-bootstrap.json --remote
bun --no-env-file run db:bootstrap --config apps/api/wrangler.jsonc --env staging --input .local/tablecast-staging-bootstrap.json --remote --apply
```

ローカルでのリハーサルは `--remote` を `--local --persist-to /absolute/path/tablecast-bootstrap-state` へ置き換える。同じ設定・環境を指定した `wrangler d1 migrations apply TABLECAST_DB --local --persist-to ...` を先に実施し、開発デモとは別の保存先を使う。CLIはD1だけの一時configを作り、周辺の `.dev.vars` や `.env.local` を読まない。入力ファイルやD1の内容は実行後も保存される。

既存email・組織slug・店舗ID・卓IDが一つでもあれば、成功済みの再実行を含めて変更せず拒否する。認証ユーザーや組織の作成は複数のBetter Auth APIをまたぐため全体の原子性はない。中途失敗時は作成段階と判明したIDを確認し、対象DBの状態を管理者が調査する。IDの `null` は未取得を意味し、資源が作られなかった証明にはならない。自動削除や既存資源の再採用はしない。店舗・初期 `config_releases`・卓は一つのD1 batchで反映する。成功後は店舗のteamと組織の一致、ログイン、初期公開版、別店舗へのアクセス拒否を確認する。

R2へ商品画像を登録する場合は `tablecast/` 配下のkeyをカタログに設定する。生成画像は `imageKind=illustration` とし、[画像の出所](../assets/demo/README.md)を保持する。DB・Cookie・実来店ログをローカルから移植しない。

## ビルド、移行、公開

1. `bun --no-env-file run check`、`bun --no-env-file run build`、ローカルのブラウザー試験と `dev:parity` を通す。rootのbuildはWebのCloudflare Vite pluginでWeb/API両方を生成する。APIを別のesbuild設定で再bundleしない。
2. staging設定を含む状態で `CLOUDFLARE_ENV=staging bun --no-env-file run --cwd apps/web build` を実行する。Cloudflare Vite pluginの環境選択はbuild時に行われる。生成後に `--env` を足して別環境へ転用しない。[Viteの環境選択](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/)
3. `rg --files apps/web/dist | rg '/wrangler.json$'` でWebと補助APIの生成configを確認する。現在のローカル出力は `dist/server/wrangler.json` と `dist/tablecast_api/wrangler.json` だが、stagingの補助API名に応じて後者は変わる。生成configのWorker名・D1 ID・R2名・origin・release SHAを照合する。
4. APIの生成configの実パスを `TABLECAST_API_BUILD_CONFIG`、Web側を `TABLECAST_WEB_BUILD_CONFIG` に設定する。生成configの `no_bundle` とmodule rulesを保持し、`bun --no-env-file x wrangler deploy --dry-run --config "$TABLECAST_API_BUILD_CONFIG"` とWeb側の同じ確認を行う。補助Workerはそれぞれ個別にdeployする。[複数Workerのbuild出力](https://developers.cloudflare.com/workers/vite-plugin/reference/api/)
5. 既存環境ならWeb/API双方の現行version IDとD1のTime Travel bookmarkを記録する。後述の互換性条件を確認してからD1 migrationを適用する。

以降のコマンドはアカウント・環境・生成configを確認した後に実行する公開操作である。

```sh
bun --no-env-file x wrangler d1 migrations list TABLECAST_DB --remote --config apps/api/wrangler.jsonc --env staging
bun --no-env-file x wrangler d1 time-travel info TABLECAST_DB --config apps/api/wrangler.jsonc --env staging
bun --no-env-file x wrangler d1 migrations apply TABLECAST_DB --remote --config apps/api/wrangler.jsonc --env staging
bun --no-env-file x wrangler d1 execute TABLECAST_DB --remote --config apps/api/wrangler.jsonc --env staging --command 'PRAGMA foreign_key_check'
bun --no-env-file x wrangler deploy --config "$TABLECAST_API_BUILD_CONFIG"
bun --no-env-file x wrangler deploy --config "$TABLECAST_WEB_BUILD_CONFIG"
```

移行は追加型を基本にし、先に旧Web/APIでも動くD1変更、次にAPI、最後にWebの順で進める。適用済みSQLを編集しない。互換性を維持できない変更は営業書込みを停止した計画移行に分ける。[D1 migration](https://developers.cloudflare.com/d1/reference/migrations/)

公開後はWeb経由でhealth、スタッフログイン、端末承認、別組織・別店舗の拒否、注文確認と冪等再送、受付・提供・会計、DO再接続、画像WebP、設定の下書きと公開を確認する。version ID、migration一覧、release SHA、試験結果を同じrelease記録へ保存する。

## MCPの接続

現実装のDCRは認証付き事前登録で使う。スタッフとしてログインした同一originから `/api/auth/oauth2/register` へ登録し、返ったpublic client IDをInspectorへ設定する。callback URIはInspector側の実設定と完全一致させる。public clientは `token_endpoint_auth_method=none`、`application_type=native`、scopeは `tablecast:read tablecast:write` とする。

その後のPKCE、スタッフログイン、組織選択、scope同意、店舗の再認可を省略しない。ローカルではChromium/WebKitからこの経路を検証している。ChatGPT接続は実際のワークスペースと公開HTTPS環境で別途確認する。未認証登録を有効にする設定変更は実施していない。[Better Auth OAuth Provider](https://better-auth.com/docs/plugins/oauth-provider)

## 音声の有効化

LiveKit Cloudまたは対応するコンテナ環境へPython Agentを配置する。[Dockerfile](../livekit/Dockerfile)は公式uv/Pythonのdigestと `livekit/uv.lock` を使い、既存の `tablecast-voice start` を非rootで起動する。[音声README](../livekit/README.md)のbuild・検査手順と対象環境の変数を使う。コンテナを使わない場合は固定したuv環境で `uv run --directory livekit tablecast-voice start` を起動する。`TABLECAST_API_URL` は公開WebのHTTPS origin、LiveKit URLはAPIの接続先と同じ環境にする。クラウドへの自動deployは未提供。

linux/amd64の実イメージをbuildし、ネットワーク無しのCLI・import・VAD読込みとUID 10001を確認した。外部へ通信できない専用Dockerネットワーク内のLiveKitへ待受登録し、health 200も確認した。AI資格とRoom jobは使わず、検証後は専用コンテナ・ネットワーク・鍵ファイルを片付けた。これは公開Agent dispatchや日英音声往復の受入を代替しない。

Agent登録、health、Room dispatch、OpenAI Realtime 2.1の音声入力・テキスト出力、Inworld TTS、API業務ツール、日英の標準voiceを先に確認する。Pythonへ `OPENAI_API_KEY` を配備し、`gpt-realtime-2.1` へのアクセスを検証する。`INWORLD_API_KEY` はPythonだけへ渡し、LiveKit/API内部tokenをブラウザーへ渡さない。接続前提が揃ったstagingで `TABLECAST_VOICE_ENABLED=true` を明示してAPIを再deployし、店舗の `cast.voice.ja/en` を試聴した実在IDで公開する。再生停止・送音停止・Room退出・進行turnの失効、割込み中の注文拒否をstagingと実iPadで検証する。その受入結果が揃うまではproductionのフラグを有効にしない。

APIの一覧確認用キーは `TABLECAST_INWORLD_VOICES_API_KEY` として別に登録し、GETのmetadata取得だけに使う。このキーだけではAgentや音声受付を有効化しない。標準音声の一覧と単体確認は現行の `/voices/v1/voices` を使い、独自のSTT/TTSクライアントを追加しない。[Inworld一覧とRead権限](https://docs.inworld.ai/api-reference/voiceAPI/voiceservice/list-voices)

停止中でもGUI注文を使えることを確認する。APIの有効フラグは稼働監視を代替しない。プロバイダー障害・Agent停止時は新しい開始を無効化して既存Roomを終了させる。

## 戻し方

コードだけの問題でDB・DOが旧版と互換なら、保存した実際のversion IDを使って `wrangler rollback` を実行する。WebからAPIの順に戻し、health・認証・注文を再確認する。version ID用の変数はrelease記録から設定し、見本のUUIDを使わない。

```sh
bun --no-env-file x wrangler rollback "$TABLECAST_PREVIOUS_WEB_VERSION" --config "$TABLECAST_WEB_BUILD_CONFIG"
bun --no-env-file x wrangler rollback "$TABLECAST_PREVIOUS_API_VERSION" --config "$TABLECAST_API_BUILD_CONFIG"
```

WorkerのrollbackはD1・R2・DOの内容を戻さない。DO classのmigrationやbinding先の変更をまたぐrollbackには制限があるため、変更前に実際の復旧経路を確認する。認証secretの不用意な切替も避ける。[Worker rollbackの制限](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)

D1を復元する必要がある場合は、営業書込みと音声を停止し、復元点以降の注文・支払が失われる影響を確認する。対象bookmarkを決めた後だけ次を実行する。復元後はmigration履歴と公開設定版も照合し、互換なWorkerへ揃えてから営業を再開する。[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)

```sh
bun --no-env-file x wrangler d1 time-travel restore TABLECAST_DB --bookmark "$TABLECAST_RESTORE_BOOKMARK" --config apps/api/wrangler.jsonc --env staging
```

stagingで復旧まで確認できてから、同じ手順を実際のproduction設定へ適用する。公開資格、対象環境でのbootstrap実行、Agent配置、実iPadと有料音声の確認が残っている間は公開受入完了としない。
