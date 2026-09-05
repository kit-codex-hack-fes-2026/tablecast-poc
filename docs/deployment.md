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
| `TABLECAST_GOOGLE_CLIENT_ID`, `TABLECAST_GOOGLE_CLIENT_SECRET` | Googleログインを有効にする場合のみ。callbackはWeb originの `/api/auth/callback/google` |

初回の管理者、組織、店舗team、店舗・卓、公開カタログはまだ公開用bootstrapがない。公開前に対象環境を固定した一回限りの管理スクリプトを用意し、Better AuthのサーバーAPIで認証ユーザー・組織・teamを作成する必要がある。公開HTTPの認証回避経路を追加せず、開発seedの環境制約も外さない。店舗の `team_id` と所属組織の一致、非管理者の店舗team所属、初期 `config_releases` を確認する。

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

LiveKit Cloudまたは対応するコンテナ環境へPython Agentを配置する。コンテナ定義・クラウドへの自動deployは未提供。`livekit/uv.lock` を固定した環境で `uv run --directory livekit tablecast-voice start` を起動し、[音声README](../livekit/README.md)の変数を設定する。`TABLECAST_API_URL` は公開WebのHTTPS origin、LiveKit URLはAPIの接続先と同じ環境にする。

Agent登録、health、Room dispatch、Inworld STT/TTS、APIのモデル応答、日英の標準voiceを先に確認する。`INWORLD_API_KEY` はPythonだけへ渡し、LiveKit/API内部tokenをブラウザーへ渡さない。接続前提が揃ったstagingで `TABLECAST_VOICE_ENABLED=true` を明示してAPIを再deployし、店舗の `cast.voice.ja/en` を試聴した実在IDで公開する。再生停止・送音停止・Room退出・進行turnの失効、割込み中の注文拒否をstagingと実iPadで検証する。その受入結果が揃うまではproductionのフラグを有効にしない。

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

stagingで復旧まで確認できてから、同じ手順を実際のproduction設定へ適用する。公開資格、初期bootstrap、Agent配置、実iPadと有料音声の確認が残っている間は公開受入完了としない。
