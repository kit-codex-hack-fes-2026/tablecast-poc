# 本番・PR環境のCI/CD

[仕様索引](README.md) · [開発環境](development.md) · [残る受入](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/34)

GitHub Actionsはmainを本番、同一リポジトリ内のPRを独立したpreviewへ配備する。常設stagingは追加しない。配備実装は [tablecast-deploy.ts](../scripts/tablecast-deploy.ts)、URLとsecretの契約は [tablecast-deploy-config.ts](../scripts/tablecast-deploy-config.ts) にある。配備・受入の最新結果はPRとIssue #34に記録する。

## URLと実行先

| 対象           | 本番                                      | PR #123の例                                      |
| -------------- | ----------------------------------------- | ------------------------------------------------ |
| 公開Web        | `https://tablecast.kit-codex.workers.dev` | `https://tablecast-pr-123.kit-codex.workers.dev` |
| 非公開API      | `tablecast-api`                           | `tablecast-api-pr-123`                           |
| D1             | `tablecast-db`                            | `tablecast-db-pr-123`                            |
| R2             | `tablecast-media`                         | `tablecast-media-pr-123`                         |
| Python agent名 | `tablecast-voice`                         | `tablecast-voice-pr-123`                         |
| Google認証     | 実Google                                  | 専用Containerのemulate                           |

Cloudflare accountは `dbbd52d7d690afceea41fe920ae19f91`。WebのService BindingがAPIを呼び、APIのworkers.devと両Workerのversion preview URLは無効にする。D1/R2/DO/Containersは環境ごとに分離する。LiveKit Cloudは共有1 projectであり、APIがRoom名とagent名に環境名を付ける。共有APIキーと割当量は独立したセキュリティ境界にはならない。

PythonはCloudflare Containersへ置き、LiveKit CloudにはSFU・Room・dispatchを任せる。WebRTCはWorkersを経由しない。MastraはAPI Worker内の既存実装を使い、別のStudioサーバーやhosted o11y exporterは追加しない。LiveKitの`record=False`を維持する。

Cloudflare GitHub連携の標準previewはContainerイメージを更新せず、DO付きWorkerのpreview URLも生成しない。PRごとの全資源作成・削除と全CI成功後の配備を一か所で管理するため、GitHub Actionsから公式Wranglerを呼ぶ。[Workers BuildsとContainers](https://developers.cloudflare.com/containers/guides/deploy/#deploy-with-workers-builds)

## 最初に登録するもの

CloudflareのWorkers Paid・Containersの利用条件、D1、R2、Images、Accessを対象accountで利用可能にする。R2とAccessが未有効の場合、配備は失敗して止まる。API tokenは対象accountだけに限定し、Workers Scripts、D1、Workers R2 Storage、Containers、Access Apps and Policiesの管理権限と、Wranglerが要求するaccountの読取り権限を付ける。実際の権限名はtoken作成画面で照合する。

| GitHub保存先                     | 名前                                                           | 内容                                                                               |
| -------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Repository secret                | `CLOUDFLARE_API_TOKEN`                                         | 上記の配備用token                                                                  |
| Repository secret                | `TABLECAST_RUNTIME_SECRETS`                                    | 下記の許可キーだけを含むJSON                                                       |
| Repository secret                | `TABLECAST_DEPLOY_SECRET`                                      | 32文字以上のランダムな固定値                                                       |
| Environment `production` secrets | `TABLECAST_GOOGLE_CLIENT_ID`, `TABLECAST_GOOGLE_CLIENT_SECRET` | 提供されたWeb applicationの資格                                                    |
| Environment `production` secret  | `TABLECAST_BETTER_AUTH_API_KEY`                                | Better Auth Dashboardで発行した本番プロジェクトのAPI key                           |
| Repository secrets               | `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`               | PRの機械通信用Access service token                                                 |
| Repository variable              | `TABLECAST_PREVIEW_ACCESS_POLICY_ID`                           | 許可するCloudflare accountメンバーだけがログインできる再利用可能なAllow policyのID |
| Repository variable              | `TABLECAST_PREVIEW_SERVICE_POLICY_ID`                          | 上記service tokenだけを許可するService Auth policyのID                             |

`TABLECAST_RUNTIME_SECRETS`には`.env.local`と同じ `OPENAI_API_KEY`、`INWORLD_API_KEY`、`LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`、`TABLECAST_MODEL`、`TABLECAST_MODEL_API_KEY`、`TABLECAST_INWORLD_VOICES_API_KEY` を入れる。JSONはActions secretから一時ファイルを経てAPI Worker secretへ渡し、Git・イメージ・ブラウザーへ含めない。Pythonに必要な値はContainer起動時に注入する。ブラウザーへ返すLiveKit接続URLと限定JWTを除き、資格はサーバー側に留める。

認証secretと内部tokenは固定masterからAPI Worker名・用途別にHMACで導出する。再配備で変化せず、PR間では異なる。masterの変更は全環境の認証と内部通信に影響するため通常のキー追加時に再生成しない。

Better Auth Dashboardの鍵は `production` Environmentから本番API Worker secretへだけ渡す。`TABLECAST_RUNTIME_SECRETS`、buildジョブ、公開config、Web、Python、previewへ含めない。本番配備はこの鍵が空なら資源変更前に停止する。鍵の登録・変更後も既存の認証masterは変更しない。

初回の本番配備では `0012_tablecast_auth_activity.sql` を既存migration工程で適用した後にWorkerを配備する。Dashboardの接続先は `https://tablecast.kit-codex.workers.dev`、認証パスは `/api/auth` とし、無料Starterの本番プロジェクトから接続する。接続には公開Web WorkerからAPIへの既存Service Bindingを使用する。配備後はhealthのrelease SHAに加え、Dashboardのユーザー・セッション表示、ログインイベント、最終利用日時を確認する。Dashboardの接続設定とこの本番確認はPRのCI成功だけでは完了としない。

アプリのrollbackではnullableな `last_active_at` 列を残す。旧版でも既存ユーザーとセッションを使用でき、列を削除する破壊的なdown migrationは行わない。

Access applicationはPRホスト名に対してWeb公開前に作成する。上記2 policyを参照し、Pythonと配備疎通確認はservice tokenヘッダーを付ける。許可されたPR利用者はエミュレーター上の架空ユーザーを選べる。[WorkersのAccess保護](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)

## Google Cloud Console

Web applicationの設定を次と完全一致させる。

| 項目                          | 値                                                                        |
| ----------------------------- | ------------------------------------------------------------------------- |
| Authorized JavaScript origins | `https://tablecast.kit-codex.workers.dev`（リダイレクト方式では省略可能） |
| Authorized redirect URIs      | `https://tablecast.kit-codex.workers.dev/api/auth/callback/google`        |
| API `TABLECAST_PUBLIC_ORIGIN` | `https://tablecast.kit-codex.workers.dev`                                 |

本番configには`TABLECAST_GOOGLE_EMULATOR_URL`と`TABLECAST_GOOGLE_AUTHORIZE_URL`を生成しない。Google資格も`production` Environmentから本番だけへ渡す。以前に手動で同名secretを登録していた場合は、実Googleへの切替前にemulator関連secretを削除する。PRは環境固有のcallbackへ戻る専用emulateを利用し、ローカルのエミュレーターと`/organisations`等の既存callbackURLを維持する。Google側へのlocalhost・PR URL追加は不要。

## Actionsの処理

1. format/lint/typecheck、単体・実Binding・Python、Workers/Storybook build、UI部品、Chromium/WebKit E2E、合成音声WebRTC、両Dockerイメージを確認する。検証と配備は同じPR head SHAまたはmain SHAを使う。環境別Workers buildと検証済みDockerイメージを同じrunのSHA付きartifactに保存し、1日で削除する。buildジョブには配備secretを渡さない。
2. 同一repoのPRだけにsecretを渡す。fork PRは通常の検証のみ。配備とclose cleanupは環境単位の同じconcurrency groupで直列化し、実行途中の配備を新しいpushでキャンセルしない。
3. 現在のmain/PR SHA・PR状態・repoをGitHub APIで照合する。Access、D1、R2を作成し、所有情報を記録する。名前だけが一致する既存DB/R2は自動採用しない。
4. 配備ジョブは全検証成功後にartifactを取得する。WorkersはbuildジョブのVite成果物をそのまま使い、生成configの環境・SHAを照合して実D1 IDとRegistryのイメージ参照だけを補完する。Turborepoの入力には生成configの内容も含める。`--env`をbuild後に付けて別環境へ転用せず、配備ジョブではViteとDockerを再buildしない。
5. 既存Webがある場合は内部認証付きdrainを実施する。開始予約・実jobがあれば失敗して止まり、終了後にActionsを再実行する。drain成功後にD1 migration、初回PR seed、API/Container、Webの順で配備し、最後に新規音声受付を再開する。
6. Web経由の`/api/health`が返すrelease SHAを照合する。配備直後の反映遅延は5秒間隔で最大12回、各HTTP要求は5秒まで再試行する。正しいSHAを確認した場合だけPRコメントとActions summaryへURL・SHAを記録する。

D1 migrationは追加型で旧APIとも互換にする。drainは音声だけで、GUIの営業書込みを止めない。破壊的なDB変更は別の計画移行が必要。main更新・PR closeと配備APIの間には分散トランザクションがないため、直前の再確認後にGitHubが更新された場合は次の直列run/cleanupが最終状態を反映する。

ビルドの入口は `bun --no-env-file run build:deploy`、配備・cleanupの入口は `bun --no-env-file run deploy`。Wranglerの遠隔bindingを使う配備・cleanupだけを既存tsx経由のNode.js 24.7.0で実行する。同じ遠隔D1接続がBun 1.3.13では45秒以内に完了せず、Nodeでは約4秒で成功した。Bun内部の原因までは未特定。Wranglerの公式サポートruntimeはNodeであり、独自の通信互換処理は追加しない。依存管理、config生成、build、公式CLIの起動はBunを維持する。[Wranglerの実行要件](https://developers.cloudflare.com/workers/wrangler/install-and-update/#install-wrangler)

DockerイメージはActionsのUbuntu runnerの`images` jobでDockerfileからlinux/amd64へ一度buildし、起動検査後に`docker save`でartifactへ保存する。配備ジョブは`docker load`と公式`wrangler containers push`で同じイメージをCloudflare Registryへ送り、Registry参照を設定した`wrangler deploy`で配備する。Wranglerのversion・image digest出力と対象SHAを同じrunで追跡する。uv依存・VADモデルは既存Dockerfileのbuild段階で準備し、cold startでpip/uv installしない。[Containersのイメージ](https://developers.cloudflare.com/containers/image-management/)

## 初期データと再実行

PRは所有情報を確認した空DBへ架空3店舗・商品画像を一度だけ投入する。投入済みフラグがある再配備ではDB・注文・画像を変更しない。`db:seed`のdevelopment制限は維持し、公開PR専用入口が対象originと所有情報を検査する。初期voiceは未設定で、管理画面で実在voiceを確認して明示公開するまで音声開始できない。

資源作成から所有情報記録、DB seed、画像登録の全体は原子的ではない。所有テーブルの`seeded`は`0`が未投入、`2`がDB投入済み・画像待ち、`1`が全投入完了を表す。DBはDrizzleの型付きschemaと`db.batch()`で投入する。`2`からの再配備はDBを変更せず、未投入画像だけを再開する。

認証fixtureの作成中に停止したPRは、運用者が所有情報・ユーザー一覧と、組織・店舗・注文・セッションが未作成であることを確認した場合だけ、対象PRの`seeded=0`を`3`へ変更して再開できる。既存ユーザーのID・名前・認証情報を保持する。`3`でも組織・店舗が存在すれば停止する。営業データがあるDBや本番にこの復旧手順を使わない。

商品画像は最大4件を並列投入する。既存objectのMD5 ETagとサイズが一致すれば省略し、異なる内容は上書きせず失敗する。PUTにはMD5と未存在条件を付ける。R2の一時障害`10001`だけを1秒・2秒待って最大3回試し、結果不明の場合も再度HEADで保存済みか確認する。権限エラーや整合性エラーは即時失敗し、同時に始めた処理が完了してから接続を破棄する。これは配備時の外部サービス障害への対応であり、テストのretryではない。

記録前の中断、`0`のまま残った部分seed、所有情報の欠落は失敗として止め、自動修復しない。管理者が該当PRの所有情報・D1全件数・外部キー・配備ログを照合し、DB投入完了が証明できる場合だけ`0`から`2`へ進捗を補正する。未証明のデータや営業中データへresetを流用しない。

本番はmigrationのみ自動適用し、実在管理者のメールと店舗設定を確定してから既存bootstrapで初期化する。PRの架空ユーザーは本番へ投入しない。実Googleログインと初期組織への所属確認は公開受入に残る。

### 本番bootstrap

自動生成configは平坦なconfigなので、既存bootstrap CLI用に以下の形で`.local/tablecast-bootstrap-config.json`を作る。配備済みの実D1 IDだけを使う。planが出力する検証用UUIDは使えない。

```js
const api = await Bun.file(".local/tablecast-deploy/api.json").json();
await Bun.write(
  ".local/tablecast-bootstrap-config.json",
  JSON.stringify({
    account_id: api.account_id,
    compatibility_date: api.compatibility_date,
    compatibility_flags: api.compatibility_flags,
    env: { production: api },
  }),
);
```

初回の管理者・組織・店舗・卓・公開カタログは、migration適用後に管理CLI `db:bootstrap` で作る。Better AuthのサーバーAPIを使い、公開HTTPへ管理用の認証回避経路は追加しない。開発seedは公開環境で使えないままにする。

WranglerのJSON/JSONC設定に実在する `account_id` を明示し、`env.production` にWorker名、`TABLECAST_ENV`、HTTPSの `TABLECAST_PUBLIC_ORIGIN`、対象の `TABLECAST_DB` を明示する。rootの開発bindingを暗黙に継承する入力は拒否する。DB名とWorker名は `tablecast` を含める。

入力は所有者だけが読める通常JSONファイル（例: `.local/tablecast-production-bootstrap.json`、mode `0600`）として作る。次の項目を持ち、秘密を含むためGit・チャット・コマンド引数へ内容を貼らない。

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
bun --no-env-file run db:bootstrap --config .local/tablecast-bootstrap-config.json --env production --input .local/tablecast-production-bootstrap.json --remote
bun --no-env-file run db:bootstrap --config .local/tablecast-bootstrap-config.json --env production --input .local/tablecast-production-bootstrap.json --remote --apply
```

ローカルでのリハーサルは `--remote` を `--local --persist-to /absolute/path/tablecast-bootstrap-state` へ置き換える。同じ設定・環境を指定した `wrangler d1 migrations apply TABLECAST_DB --local --persist-to ...` を先に実施し、開発デモとは別の保存先を使う。CLIはD1だけの一時configを作り、周辺の `.dev.vars` や `.env.local` を読まない。入力ファイルやD1の内容は実行後も保存される。

既存email・組織slug・店舗ID・卓IDが一つでもあれば、成功済みの再実行を含めて変更せず拒否する。認証ユーザーや組織の作成は複数のBetter Auth APIをまたぐため全体の原子性はない。中途失敗時は作成段階と判明したIDを確認し、対象DBの状態を管理者が調査する。IDの `null` は未取得を意味し、資源が作られなかった証明にはならない。自動削除や既存資源の再採用はしない。店舗・初期 `config_releases`・卓は一つのD1 batchで反映する。成功後は店舗と組織の一致、ログイン、初期公開版、別店舗へのアクセス拒否を確認する。

R2へ商品画像を登録する場合は `tablecast/` 配下のkeyをカタログに設定する。生成画像は `imageKind=illustration` とし、[画像の出所](../assets/demo/README.md)を保持する。DB・Cookie・実来店ログをローカルから移植しない。

## Containerの停止と復旧

初期値は環境ごとに`standard-1`の音声Container 1個・同時1 session。DOの開始予約を記録し、ContainerのHTTP portとLiveKit `/worker`を確認してから限定JWTを返す。予約が埋まっている場合、音声開始は503となりGUIを維持する。これは未計測の最大性能ではなく入場上限。

公式SDKの5分activity期限でLiveKitのactive jobsを確認する。job数が不明なら稼働を継続し、0件と扱わない。JWTは5分、未開始予約は10分まで保護する。実jobを確認済みの予約は全job終了時に解放する。期限確認は定期的なので、終了直後の正確な5分停止は保証しない。更新時には新規予約を止め、既存予約・jobが残れば更新を拒否する。

SIGTERM時のPython drain timeoutは600秒。ただし基盤の強制終了猶予を延長する設定ではない。基盤障害・メンテナンス・killやPR closeは通話中でも停止し得る。別Containerへの無切断移送は実装しない。停止後は利用者が明示再開し、APIに保存した会話・GUI・カート・注文状態を使用する。未保存発話とモデル内部状態は復元できない場合がある。

PR closeのworkflowは`pull_request_target: closed`から既定ブランチだけをcheckoutし、PRコードを特権実行しない。D1/R2の所有情報を確認後、Web、Container application、DOを退役させたAPI、R2、D1、Access applicationを削除する。対象は終了した同一repo PRだけ。本番・他PR・共有LiveKit projectは削除しない。Registryの過去imageはこのcleanupの対象外なので保存量を別途確認する。最初の導入PRでは、このworkflowがmainへ入ってからcleanupが使える。

cleanup途中で所有markerだけが削除された場合も、自動採用せず手動確認で再開する。Container/DOの遠隔削除、配備途中の中断、複数PRでの分離は実環境の受入が必要。

## ローカル確認

通常は既存の`bun run dev:prepare`、`bun run dev`、`bun run dev:parity`を使い、ホストのPythonとローカルLiveKitを維持する。公開用configは次でsecret・遠隔書込みなしに生成できる。

```sh
TABLECAST_RELEASE_SHA=$(git rev-parse HEAD) bun --no-env-file run deploy --plan
TABLECAST_PR_NUMBER=123 TABLECAST_RELEASE_SHA=$(git rev-parse HEAD) bun --no-env-file run deploy --plan
TABLECAST_API_CONFIG="$PWD/.local/tablecast-deploy/api.json" TABLECAST_WEB_CONFIG="$PWD/.local/tablecast-deploy/web.json" bun --no-env-file run --cwd apps/web build
```

`apps/web/dist/*/wrangler.json`のWorker名を調べ、対応する生成configへ`bun --no-env-file x wrangler deploy --dry-run --config <生成config>`を実行する。planのDB IDは検証用であり、遠隔配備には使わない。

Docker Engineを起動した環境では、`wrangler dev`が実Containerをローカルでbuild・起動できる。Container用のDO bindingと`containers`設定を持つ専用configを使い、LiveKitはDockerから到達できるローカル接続先へ向ける。通常のbase configにはイメージ設定を追加せず、日常のローカル起動でContainerを二重起動しない。[Containersのローカル開発](https://developers.cloudflare.com/containers/local-dev/)

## 切り戻しと残る受入

配備runのWorker version ID・image digestと、移行前D1のTime Travel bookmarkを保存する。Web/APIが互換であればWorkerのrollbackと、旧SHAのDockerイメージ再配備を計画的に実施する。現行SHA検査があるため古いActions runの再実行では旧版へ戻せない。通常はmainへrevert PRを作り、新しいSHAとして同じCIを通す。Containerが旧imageに戻ったことをRegistry digestと起動後healthで確認する。

WorkerのrollbackはD1/R2/DOを戻さない。DB復元が必要なら営業書込みを停止し、失われる注文・支払を確認した復元点だけを使う。強制キャンセルでdrainが残った場合は対象URLへ内部token付き`POST /internal/deploy/resume`を送る。PRではAccess service tokenも必要。[Worker rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)・[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)

公開先のGoogleログイン、Access拒否、初期組織、端末承認、注文の冪等性、DO再接続、画像、MCP認証を確認する。有料音声では実iPadの日英発話・割込み・停止・明示再開、30分通話、強制終了と履歴復元を確認する。cold/warm start、初回音声、shutdown、復旧、1/2/4 sessionのCPU/RSSと切断率は未計測。1 sessionの初期上限を最適値として扱わない。

月額約30 USD未満は目標であり、上限保証はない。Workers Paid、Containersの起動・待機とOAuth稼働、D1/R2/DO/Images、LiveKitのparticipant-minutes・転送量、OpenAI、Inworld、Actionsを集計する。Mastra hosted o11yやLiveKit managed Agent hostingの追加契約はこの変更では行わない。各サービスの実使用量を10分試験前後で取り、月300分想定へ外挿する費用受入はIssue #34に残る。
