# 本番・staging・PR環境のCI/CD

[仕様索引](README.md) · [開発環境](development.md) · [残る受入](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/34)

GitHub Actionsはmainを本番、stagingを常設検証環境、同一リポジトリ内の開発PRを独立したpreviewへ配備する。release PRはstagingで確認する。配備実装は [tablecast-deploy.ts](../scripts/tablecast-deploy.ts)、URLとsecretの契約は [tablecast-deploy-config.ts](../scripts/tablecast-deploy-config.ts) にある。配備・受入の最新結果はPRとIssue #34に記録する。

## URLと実行先

| 対象       | 本番                                      | PR #123の例                                      |
| ---------- | ----------------------------------------- | ------------------------------------------------ |
| 公開Web    | `https://tablecast.kit-codex.workers.dev` | `https://tablecast-pr-123.kit-codex.workers.dev` |
| 非公開API  | `tablecast-api`                           | `tablecast-api-pr-123`                           |
| D1         | `tablecast-db`                            | `tablecast-db-pr-123`                            |
| R2         | `tablecast-media`                         | `tablecast-media-pr-123`                         |
| Google認証 | 実Google                                  | 専用Containerのemulate                           |

Cloudflare accountは `dbbd52d7d690afceea41fe920ae19f91`。WebのService BindingがAPIを呼び、APIのworkers.devと両Workerのversion preview URLは無効にする。D1/R2/DOとPRのOAuth Containerは環境ごとに分離する。音声と業務モデルのOpenAI projectを共有する場合、APIキーと割当量は独立したセキュリティ境界にはならない。

ブラウザーはGPT-Liveへ直接WebRTC接続する。API Workerが標準Responses delegationとfunction実行をつなぎ、Mastra・Python Agent・音声Containerは配備しない。OpenAI session開始時のSDP交換と業務要求は既存の認証済みAPIを使う。生音声を既定保存しない。

Cloudflare GitHub連携の標準previewはContainerイメージを更新せず、DO付きWorkerのpreview URLも生成しない。PRごとの全資源作成・削除と配備を一か所で管理するため、GitHub Actionsから公式cfを呼ぶ。PRプレビューの製品配備はWorkers/イメージ成果物の準備後に開始する。静的検査・API・Browser・E2Eはマージ条件として維持し、本番・staging配備は全必須検査の成功後に行う。[Workers BuildsとContainers](https://developers.cloudflare.com/containers/guides/deploy/#deploy-with-workers-builds)

## 最初に登録するもの

CloudflareのWorkers Paid・Containersの利用条件、D1、R2、Images、Accessを対象accountで利用可能にする。R2とAccessが未有効の場合、配備は失敗して止まる。API tokenは対象accountだけに限定し、Workers Scripts、D1、Workers R2 Storage、Containers、Access Apps and Policies・Access Service Tokensの管理権限と、cfが要求するaccount・DO namespaceの読取り権限を付ける。実際の権限名はtoken作成画面で照合する。

| GitHub保存先                     | 名前                                                           | 内容                                                     |
| -------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| Repository secret                | `CLOUDFLARE_API_TOKEN`                                         | 上記の配備用token                                        |
| Repository secret                | `TABLECAST_RUNTIME_SECRETS`                                    | 下記の許可キーだけを含むJSON                             |
| Repository secret                | `TABLECAST_DEPLOY_SECRET`                                      | 32文字以上のランダムな固定値                             |
| Environment `production` secrets | `TABLECAST_GOOGLE_CLIENT_ID`, `TABLECAST_GOOGLE_CLIENT_SECRET` | 提供されたWeb applicationの資格                          |
| Environment `production` secret  | `TABLECAST_BETTER_AUTH_API_KEY`                                | Better Auth Dashboardで発行した本番プロジェクトのAPI key |
| Repository secrets               | `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`               | PRの機械通信用Access service token                       |

`TABLECAST_RUNTIME_SECRETS`には公開環境用の `TABLECAST_MODEL_API_KEY` と `TABLECAST_MODEL` を入れる。GPT-Live 1とResponses delegationの利用権限があるprojectを使い、配備jobは `TABLECAST_MODEL=gpt-6.1-terra` を明示指定し、JSON内の旧モデル名より優先する。委譲先はFast mode（`service_tier: "priority"`）とreasoning lowを使う。この選択は自動fallbackではなく配備版の固定設定である。JSONはActions secretから一時ファイルを経てAPI Worker secretへ渡し、Git・イメージ・ブラウザーへ含めない。旧 `OPENAI_API_KEY`、LiveKit鍵、音声内部token、Mastra観測設定は利用しない。

認証secretは固定masterからAPI Worker名・用途別にHMACで導出する。再配備で変化せず、PR間では異なる。masterの変更は全環境の認証に影響するため通常のキー追加時に再生成しない。

Better Auth Dashboardの鍵は `production` Environmentから本番API Worker secretへだけ渡す。`TABLECAST_RUNTIME_SECRETS`、buildジョブ、公開config、Web、previewへ含めない。本番配備はこの鍵が空なら資源変更前に停止する。鍵の登録・変更後も既存の認証masterは変更しない。

初回の本番配備では `0012_tablecast_auth_activity.sql` を既存migration工程で適用した後にWorkerを配備する。Dashboardの接続先は `https://tablecast.kit-codex.workers.dev`、認証パスは `/api/auth` とし、無料Starterの本番プロジェクトから接続する。接続には公開Web WorkerからAPIへの既存Service Bindingを使用する。配備後はhealthのrelease SHAに加え、Dashboardのユーザー・セッション表示、ログインイベント、最終利用日時を確認する。Dashboardの接続設定とこの本番確認はPRのCI成功だけでは完了としない。

アプリのrollbackではnullableな `last_active_at` 列を残す。旧版でも既存ユーザーとセッションを使用でき、列を削除する破壊的なdown migrationは行わない。

Access applicationはPRホスト名に対してWeb公開前に作成する。`scripts/tablecast-deploy-config.ts`の採用済み2 policyを参照し、配備疎通確認はservice tokenヘッダーを付ける。許可されたPR利用者はエミュレーター上の架空ユーザーを選べる。[WorkersのAccess保護](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)

## Google Cloud Console

Web applicationの設定を次と完全一致させる。

| 項目                          | 値                                                                        |
| ----------------------------- | ------------------------------------------------------------------------- |
| Authorized JavaScript origins | `https://tablecast.kit-codex.workers.dev`（リダイレクト方式では省略可能） |
| Authorized redirect URIs      | `https://tablecast.kit-codex.workers.dev/api/auth/callback/google`        |
| API `TABLECAST_PUBLIC_ORIGIN` | `https://tablecast.kit-codex.workers.dev`                                 |

本番configには`TABLECAST_GOOGLE_EMULATOR_URL`と`TABLECAST_GOOGLE_AUTHORIZE_URL`を生成しない。Google資格も`production` Environmentから本番だけへ渡す。以前に手動で同名secretを登録していた場合は、実Googleへの切替前にemulator関連secretを削除する。PRは環境固有のcallbackへ戻る専用emulateを利用し、ローカルのエミュレーターと`/organisations`等の既存callbackURLを維持する。Google側へのlocalhost・PR URL追加は不要。

## Actionsの処理

1. format/lint/typecheck、単体・実Binding、Workers build、UI部品、Chromium/WebKit E2E、OAuth Dockerイメージを確認する。PRの実行対象と全件へ戻す条件は[テスト戦略](testing.md#ciのジョブとキャッシュ)に従う。検証と配備は同じPR head SHAまたはmain SHAを使う。環境別Workers buildと検証済みDockerイメージを同じrunのSHA付きartifactに保存し、1日で削除する。production以外は初回seedの固定JSONを既存のWorkers artifactへ同梱する。固定JSONはTurboで一度生成・検証し、壊れたcacheは一度だけ強制再生成してから検証し直す。buildジョブには配備secretを渡さない。Storybook・Emailの公開buildと配備は手動カタログworkflowが担当する。
2. 同一repoのPRだけにsecretを渡す。fork PRは通常の検証のみ。配備とclose cleanupは環境単位の同じconcurrency groupで直列化し、実行途中の配備を新しいpushでキャンセルしない。
3. 現在のmain/PR SHA・PR状態・repoをGitHub APIで照合する。独立したD1・R2・DO・Worker一覧、既存Workerの設定、Accessのapplication・policy・tokenを並行取得し、必要な所有情報・設定の検証が揃ってから変更へ進む。D1/R2が揃った通常配備では、同じ排他・呼出し内で所有確認した資源を再利用し、一覧と所有情報の4要求を重複取得しない。欠落時の作成・cleanup・resetは再確認する従来経路を維持し、Binding接続後のR2所有照合も残す。Access、D1、R2を作成し、所有情報を記録する。名前だけが一致する既存DB/R2は自動採用しない。
4. 製品の配備jobは自身の前提検査が成功してからartifactを取得する。PRではWorkers build・Container検査を待ち、静的検査・API・Browser・E2Eはマージ条件で確認する。本番・staging配備は全必須検査の成功を待つ。同じjob内で依存準備を`background`実行し、artifactのネットワーク取得を重ねる。`wait: setup`で依存準備の成功とPATHの反映を待ち、`docker load`、配備の順に進む。依存cacheとDockerの同時展開は計測で遅くなったため重ねない。WorkersはbuildジョブのVite成果物をそのまま使い、生成configの環境・SHAを照合して実D1 IDとRegistryのイメージ参照だけを補完する。seedの固定JSONも形式・生成元・payloadのhashを検証し、不一致なら遠隔資源の変更前に停止する。Turborepoの入力には生成configの内容も含める。`--env`をbuild後に付けて別環境へ転用せず、配備ジョブではViteとDockerを再buildしない。
5. DB準備・migration・初回seedと検証済みContainerイメージのRegistry送信を並行する。どちらかが失敗しても開始済み処理の終了を待ち、両方成功した場合だけ最新SHAを再確認してWorker配備へ進む。cfはDocker認証設定を共有するためimage同士の送信は直列にする。D1 migration、初回PR seed、APIとPRのOAuth Container、Webの順で配備する。既存のDO namespace ID・クラス名・SQLite storageを前後で検査し、過去のDO migrationタグを再適用しない。未知のクラスを検出したら停止して照合する。
6. Web経由の`/api/health`が返すrelease SHAを照合する。配備直後の反映遅延は5秒間隔で最大12回、各HTTP要求は5秒まで再試行し、対象SHAと一致した場合だけ配備成功とする。製品の配備job自身がPRコメントとActions summaryへ通知し、失敗時も処理結果と取得できた現在の配備SHAを分けて表示する。手動カタログの生成や終了は待たない。

D1 migrationは追加型で旧APIとも互換にする。配備時もGUIの営業書込みを止めない。破壊的なDB変更は別の計画移行が必要。main更新・PR closeと配備APIの間には分散トランザクションがないため、直前の再確認後にGitHubが更新された場合は次の直列run/cleanupが最終状態を反映する。

ビルドの入口は`bun --no-env-file run build:deploy`、配備・cleanupの入口は`bun --no-env-file run deploy`。実Bindingを使うseed・bootstrap・配備のSDK互換処理はWranglerを残し、既存tsx経由のNode.js 24系で実行する。ローカルは24.22.0固定、CIは最低要件とmajor上限を`>=24.22.0 <25`で指定し、runnerに収録された適合版を優先して毎jobのNode取得を省く。性能比較にはログの実行版とrunner imageも残す。同じ遠隔D1接続がBun 1.3.13では45秒以内に完了せず、Node 24.7.0では約4秒で成功した。Bun内部の原因までは未特定。Wranglerの公式サポートruntimeはNodeであり、独自の通信互換処理は追加しない。依存管理、config生成、build、公式CLIの起動はBunを維持する。[Wranglerの実行要件](https://developers.cloudflare.com/workers/wrangler/install-and-update/#install-wrangler)

DockerイメージはActionsのUbuntu runnerの`images` jobでDockerfileからlinux/amd64へ一度buildし、起動検査後に`docker save`でartifactへ保存する。配備ジョブは`docker load`と公式`cf containers push`で同じイメージをCloudflare Registryへ送り、Registry参照を設定した`cf deploy --prebuilt`で配備する。cfのversion・image digest出力と対象SHAを同じrunで追跡する。OAuth emulatorの依存は既存Dockerfileのbuild段階で準備する。[Containersのイメージ](https://developers.cloudflare.com/containers/image-management/)

PR配備の高速化は、jobの実行時間に加えて前提検査・排他の待機から製品URLとSHAの通知までを測る。カタログは手動要求から対象URLのSHA確認・通知までを別に測る。checkout・依存準備・artifact取得・Docker load・DB準備・イメージ送信・Worker配備・公開SHA確認を分け、初回資源作成と既存資源の更新を区別する。手動カタログが同じPRの排他を先に取得した場合も、製品の待機時間へ含める。単独区間の短縮だけで判断せず、計測のSHA・run・標本数はPRへ残す。[backgroundとwaitの仕様](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsbackground)

GitHubの照合は`gh api --jq`でbranchのSHA、PRのstate・head SHA・head repositoryだけを子プロセスから返す。commitのpatchやPR本文は出力せず、大きな統合commitでもNodeの標準出力buffer上限に依存しない。取得・形式検証の失敗、SHA不一致、別repository、配備時のclosed・cleanup時のopenは引き続き拒否する。

## 初期データと再実行

PRは所有情報を確認した空DBへ架空3店舗・商品画像を一度だけ投入する。固定JSONは架空店舗・商品構成・スタッフ名簿を決定的に生成したfixtureで、rootのTurbo task `seed:template`が`.local/tablecast-seed-template/seed.json`へ出力する。cache入力は`scripts/**`、APIの`src/**`と`migrations/**`、emulateの共通名簿、`assets/demo/**`、依存lock・package・Turbo設定を明示する。認証account、パスワード・hash、実行時刻、token、所有marker、実DBはcacheへ含めない。`sourceHash`と`payloadHash`をbuild・配備で照合する。

buildは検証済みJSONを`apps/web/.cloudflare/output/tablecast-seed.json`へコピーし、既存の`tablecast-workers-<SHA>` artifactへ同梱する。`v0`内の公開assetsへは入れず、production buildではこのJSONを取り除く。配備は取得済みWorkers artifact内の同じpathを明示して検証する。seed専用のartifact転送step・job・依存導入は増やさない。

固定JSONの適用は、所有確認済みで`seeded=0`の空DBへ標準demoを初回投入する場合に限定する。時刻は配備時に生成し、パスワードとhashを作らず、認証・組織・所属・店舗・公開設定・卓の行を既存Drizzle schemaによる一つの`db.batch()`で投入する。営業中の卓の注文・イベントは続くbatchへ分け、D1の制限に合わせて分割する。固定JSONは任意SQLやDB dumpとして実行しない。

商品画像は最大4件の処理枠を使い、完了した枠へ次を投入する。条件付きput・内容照合・既存のretry上限を保ち、失敗後は新規投入を止め、開始済みI/Oの終了を回収する。ログの`商品画像の投入`、`固定seedのDrizzle batch`、`営業中の卓のseed`、`DB・画像の配備準備`、`検証済みイメージの送信`で区間時間を確認する。旧経路での初回配備はDB・画像準備102.189秒、そのうち商品画像40.157秒だった。固定JSONの生成はローカル約200ms、cache hitは約22msであり、初回投入の主な短縮対象は認証API・DBとの直列往復をDrizzle batchへまとめる部分である。cacheだけで初回R2への31,068,514 Bの転送は省けない。新経路の遠隔初回配備はローカル資格のD1権限不足により未計測で、短縮量は確定していない。

`seeded=1`の再配備では店舗設定・注文を再投入せず、追加された画像を補完する。プロフィール画像は空欄または旧seedのSVG URLだけを[生成WebP](demo/identities.md)へ更新し、手動設定した画像を保持する。既知の旧デモメールと模擬Googleのsubjectも、ユーザーID・所属・資格情報を保ったまま人名@店舗名.comへ移行する。移行先に別ユーザーが存在する場合は停止する。`db:seed`のdevelopment制限は維持し、公開PR専用入口が対象originと所有情報を検査する。初期voiceは未設定で、管理画面で実在voiceを確認して明示公開するまで音声開始できない。

資源作成から所有情報記録、DB seed、画像登録の全体は原子的ではない。所有テーブルの`seeded`は`0`が未投入、`2`がDB投入済み・画像待ち、`1`が全投入完了を表す。DBはDrizzleの型付きschemaと`db.batch()`で投入する。`2`からの再配備は営業データを変更せず、未投入画像と上記プロフィール画像の更新だけを再開する。

認証fixtureの作成中に停止したPRは、運用者が所有情報・ユーザー一覧と、組織・店舗・注文・セッションが未作成であることを確認した場合だけ、対象PRの`seeded=0`を`3`へ変更して再開できる。既存ユーザーのID・名前・認証情報を保持する。`3`でも組織・店舗が存在すれば停止する。営業データがあるDBや本番にこの復旧手順を使わない。

通常の初回投入・再配備は、seedの店舗構成が参照する商品・選択肢の画像だけを対象とする。旧固定キーの復旧では旧構成を保つため全素材を対象にする。商品画像は`tablecast/images/`をR2の`list`で一括照合し、`truncated`と`cursor`で全ページを辿る。旧固定キーの復旧時だけ`tablecast/demo/`も照合する。既存objectのMD5 ETagとサイズが一致すればHEAD・PUTを省略し、異なる内容は上書きせず失敗する。不足画像は最大4件を並列投入する。成功ログは投入件数・既存件数・送信byte数へ集約する。初回投入では必要な画像本体の送信は残る。2026-09-15の素材では全201枚・110,991,441 Bから、デモ参照164枚・31,068,514 Bへ絞る（約72%減）。現在のデモ参照164枚の画像群では、通常の照合は一覧1要求で済むが、保存数が増えればページ数に応じて増える。LISTはR2のClass A操作、HEADはClass B操作なので、料金は要求数だけで比較しない。PUTにはMD5と未存在条件を付ける。R2内部エラー`10001`と、bindingがHTTP分類を失った未分類の応答`0`だけを1秒・2秒待って最大3回試し、再度HEADで保存済みか確認する。`0`はCF-R2-Error headerがない応答から生じ、HTTP500だけでなく未知の4xxも含むため一時的な5xxとは断定しない。上限後は失敗し、既知の権限・恒久codeや整合性エラーは即時失敗する。同時に始めた処理が完了してから接続を破棄する。[R2エラー仕様](https://developers.cloudflare.com/r2/api/error-codes/)と[workerdの未分類応答処理](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/r2-rpc.c++#L194-L207)を根拠に、既存の条件付きPUTと内容照合の範囲へ限定する。これは配備時の外部サービス障害への対応であり、テストのretryではない。

記録前の中断、`0`のまま残った部分seed、所有情報の欠落は失敗として止め、自動修復しない。管理者が該当PRの所有情報・D1全件数・外部キー・配備ログを照合し、DB投入完了が証明できる場合だけ`0`から`2`へ進捗を補正する。未証明のデータや営業中データへresetを流用しない。

本番はmigrationのみ自動適用し、実在管理者のメールと店舗設定を確定してから既存bootstrapで初期化する。PRの架空ユーザーは本番へ投入しない。実Googleログイン、パスキー登録と初期組織への所属確認は公開受入に残る。

### 本番bootstrap

正本の`apps/api/cloudflare.config.ts`を`--env production`で解決する。bootstrapは`scripts/tablecast-deploy-config.ts`の採用済み実D1 IDから公開入力を生成する。`TABLECAST_RELEASE_SHA`には確認対象のHEAD、`TABLECAST_EMAIL_FROM`には配備と同じ確認済み送信元を実行環境で指定する。build前の検証用UUIDや別の手編集configを使わない。

初回の管理者・組織・店舗・卓・公開カタログは、migration適用後に管理CLI `db:bootstrap` で作る。Better AuthのサーバーAPIを使い、公開HTTPへ管理用の認証回避経路は追加しない。開発seedは公開環境で使えないままにする。

TypeScript設定から解決したaccount ID・Worker名・`TABLECAST_ENV`・HTTPSの`TABLECAST_PUBLIC_ORIGIN`・`TABLECAST_DB`を検査する。開発bindingの暗黙継承は拒否する。DB名とWorker名は`tablecast`を含める。

入力は所有者だけが読める通常JSONファイル（例: `.local/tablecast-production-bootstrap.json`、mode `0600`）として作る。次の項目を持ち、秘密を含むためGit・チャット・コマンド引数へ内容を貼らない。

| JSON項目       | 内容                                                                                    |
| -------------- | --------------------------------------------------------------------------------------- |
| `authSecret`   | 対象APIへ登録したものと同じ認証secret。32文字以上                                       |
| `admin`        | `name`、`email`、`locale`（`ja` または `en`）。旧入力の `password` は任意で、保存しない |
| `organization` | `name`、新規の `slug`                                                                   |
| `store`        | 新規の `id`、`name`、レビュー済みの `configuration`                                     |
| `tables`       | 新規の `{ "id": "...", "name": "T01" }` の配列                                          |

`configuration` は [APIの正本schema](../apps/api/src/schema.ts) と同じ日英カテゴリ・商品・プラン・キャスト設定である。初期voiceは `ja`、`en` とも `null` にする。実音声の確認後に通常の下書き検証・明示公開で設定する。価格・参照関係・卓IDの重複も書込み前に検証する。

次の一つ目は入力検査と対象表示だけで、DB接続や書込みを行わない。表示したaccount ID・DB ID・origin・店舗IDが配備対象と一致してから、同じ入力へ `--apply` を付ける。遠隔の接続にはWranglerの認証と公式remote D1 bindingを使用する。[Wrangler API](https://developers.cloudflare.com/workers/wrangler/api/)

```sh
TABLECAST_RELEASE_SHA="$(git rev-parse HEAD)" bun --no-env-file run db:bootstrap --config apps/api/cloudflare.config.ts --env production --input .local/tablecast-production-bootstrap.json --remote
TABLECAST_RELEASE_SHA="$(git rev-parse HEAD)" bun --no-env-file run db:bootstrap --config apps/api/cloudflare.config.ts --env production --input .local/tablecast-production-bootstrap.json --remote --apply
```

ローカルでのリハーサルは `--remote` を `--local --persist-to /absolute/path/tablecast-bootstrap-state` へ置き換える。対象の実D1 UUIDを指定した`bun run cf:local d1 migrations apply <UUID> --dir apps/api/migrations --local --persist-to ...` を先に実施し、開発デモとは別の保存先を使う。CLIはD1だけの一時configを作り、周辺の `.dev.vars` や `.env.local` を読まない。入力ファイルやD1の内容は実行後も保存される。

既存email・組織slug・店舗ID・卓IDが一つでもあれば、成功済みの再実行を含めて変更せず拒否する。認証ユーザーや組織の作成は複数のBetter Auth APIをまたぐため全体の原子性はない。中途失敗時は作成段階と判明したIDを確認し、対象DBの状態を管理者が調査する。IDの `null` は未取得を意味し、資源が作られなかった証明にはならない。自動削除や既存資源の再採用はしない。店舗・初期 `config_releases`・卓は一つのD1 batchで反映する。成功後は店舗と組織の一致、ログイン、初期公開版、別店舗へのアクセス拒否を確認する。

R2へ商品画像を登録する場合は `tablecast/` 配下のkeyをカタログに設定する。生成画像は `imageKind=illustration` とし、[画像の出所](../assets/demo/README.md)を保持する。DB・Cookie・実来店ログをローカルから移植しない。

## 音声とContainerの停止・復旧

音声の送受信はブラウザーとGPT-Live、業務生成は標準Responses delegationが所有する。停止時にはAPIのvoice session失効に加え、GPT-Live sessionと委任処理を明示終了する。HTTP切断だけで生成の停止を保証しない。再開は利用者の明示操作で新しい接続を作り、D1のGUI・カート・注文状態を継続する。

PR・stagingのOAuth emulatorを`basic`・最大1台のContainerに置き、公式SDKの5分activity期限で停止する。本番はContainerを持たない。`worker.exports`に`StoreEvents`・`TablecastEmulate`のSQLite storageを定義し、既存namespaceを採用する。旧`TablecastVoice`の退役は適用済みであり、この移行で再実行しない。

PR closeのworkflowは`pull_request_target: closed`から既定ブランチだけをcheckoutし、PRコードを特権実行しない。D1/R2の所有情報を確認後、Web、Container application、DOを退役させたAPI、R2、D1、Access applicationを削除する。対象は終了した同一repo PRだけ。本番・他PRは削除しない。Registryの過去imageはこのcleanupの対象外なので保存量を別途確認する。最初の導入PRでは、このworkflowがmainへ入ってからcleanupが使える。

cleanup途中で所有markerだけが削除された場合も、自動採用せず手動確認で再開する。Container/DOの遠隔削除、配備途中の中断、複数PRでの分離は実環境の受入が必要。

## ローカル確認

通常は`bun run dev:prepare`、`bun run dev`、`bun run dev:parity`を使う。公開buildはsecret・遠隔書込みなしに生成できる。

```sh
TABLECAST_DEPLOY_ENV=staging TABLECAST_RELEASE_SHA=$(git rev-parse HEAD) bun --no-env-file run build:deploy
cd apps/web
bunx --no-install cf deploy --prebuilt --mode staging --dry-run
bunx --no-install cf workers check --prebuilt --mode staging --worker tablecast-api-staging --outfile ../../.local/tablecast-startup.cpuprofile
```

productionは`TABLECAST_DEPLOY_ENV=production`、previewは`TABLECAST_DEPLOY_ENV=preview TABLECAST_PR_NUMBER=<PR>`を明示する。Build OutputのD1 UUIDは検証用であり、配備時に所有確認済みの実IDへ置換する。Container参照は検証済み同SHAのRegistry imageだけを受け入れる。API→Webの順に`cf deploy --prebuilt --mode <環境> --worker <名前>`で反映する。deploy時に環境設定を再解決・再bundleしない。[公式CI手順](https://developers.cloudflare.com/cf/ci/)

## Cloudflare設定のIaC

API・Webの正本は各workspaceの`cloudflare.config.ts`、Access・常設資源の採用情報は`scripts/tablecast-deploy-config.ts`である。Worker、binding、D1、R2、Images、Email、DO、Container、cron、placement、観測はworkspaceの設定から解決し、PRカタログは既存のカタログ配備処理で定義する。buildは配備環境・PR・SHAを検査して公開入力を`TABLECAST_CONFIG`へ渡し、中間JSONを作らない。Accessの既存許可条件・policy ID・service token IDは2026-10-11の読取りで照合した。個人のメール・秘密値・取得したAPI応答はGitへ含めない。PR・カタログは保護し、stagingは公開を維持する。

```sh
TABLECAST_DEPLOY_ENV=staging TABLECAST_RELEASE_SHA=$(git rev-parse HEAD) bun --no-env-file run infra:plan
TABLECAST_DEPLOY_ENV=preview TABLECAST_PR_NUMBER=<PR> TABLECAST_RELEASE_SHA=$(git rev-parse HEAD) bun --no-env-file run infra:apply
```

planには`CLOUDFLARE_API_TOKEN`の読取り権限が必要である。D1/R2の所有marker、常設D1/DOの採用ID、Workerの環境・PR番号、DO storage、Access policy/tokenと設定差分を読み取り、値を出さず変更対象の設定名を表示する。applyには上表の配備資格・書込み権限、GitHub最新head、同環境・同PR・同SHAのBuild Outputが必要である。既存配備処理でmigration・未seed時の投入・Container送信・Workers・カタログを反映する。再実行で資源とauth secretを作り直さず、既存service tokenのclient secretも再発行しない。通常deployは共有Access policyの差分があれば停止し、明示したinfra:applyでのみ設定を更新する。

常設資源の採用IDや未知のDOクラスが違う場合は推測で変更しない。Cloudflare account・契約有効化とsecret値は外部入力であり、GitHub・Google OAuthの設定はこのIaCの管理対象に含めない。旧JSONから戻す場合も既存資源を作り直さず、保存した同SHAのWorker成果物とDO namespaceを照合する。

## 切り戻しと残る受入

配備runのWorker version ID・image digestと、移行前D1のTime Travel bookmarkを保存する。Web/APIが互換であればWorkerのrollbackと、旧SHAのDockerイメージ再配備を計画的に実施する。現行SHA検査があるため古いActions runの再実行では旧版へ戻せない。通常はmainへrevert PRを作り、新しいSHAとして同じCIを通す。Containerが旧imageに戻ったことをRegistry digestと起動後healthで確認する。

WorkerのrollbackはD1/R2/DOを戻さない。DB復元が必要なら営業書込みを停止し、失われる注文・支払を確認した復元点だけを使う。旧音声ContainerのDO削除はrollbackでは復元されない。移行前のPython構成へ戻す場合は別のDO移行と資源の再準備が必要になる。[Worker rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)・[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)

公開先のGoogleログイン、Access拒否、初期組織、端末承認、注文の冪等性、DO再接続、画像、MCP認証を確認する。有料音声では実iPadの日英発話・割込み・停止・明示再開、30分通話、強制終了と履歴復元を確認する。初回接続、最初の字幕・音声、業務ツール待ち、停止・復旧と複数sessionの切断率は別途測定する。

月額約30 USD未満は目標であり、上限保証はない。Workers Paid、PRのOAuth Container、D1/R2/DO/Images、GPT-Live・Responses delegation、Actionsを集計する。旧LiveKit・音声Containerの費用を新構成の費用として数えない。各サービスの実使用量を10分試験前後で取り、月300分想定へ外挿する費用受入はIssue #34に残る。

## PWAの配備と更新

既存のWeb配備成果物に`sw.js`、二つのmanifest、アイコン、`_headers`、オフラインHTMLを含める。`sw.js`とmanifestは`no-cache`、ハッシュ付きJS/CSSは`immutable`で配信する。`sw.js`を長期固定キャッシュするCDNルールを追加しない。配備後は`/sw.js`がJavaScriptとして返ることとCache-Controlを確認する。

更新は前景で最大60秒間隔と復帰時に検知し、全画面が安全な時点で適用する。旧版で接客している間は旧precacheを維持し、新版を有効化してから旧precacheを整理する。画像キャッシュはWeb配備ごとに消さず、内容の変わった画像だけ新キーで公開する。休止・オフライン中の端末への即時反映や、OSのHTTPキャッシュの遠隔削除は保証しない。

デモ画像は投入完了後にハッシュ付きキーを初期構成へ保存する。既存PRのseeded=2から再開する場合は、旧DBに残る固定キーも補完する。既存店舗の画像キーを配備だけで書き換えず、画像変更は新しいキーを下書きへ設定して明示公開する。R2の同じキーへの上書き運用は新画像に使わない。

## D1とWorkerの配置

D1作成時は `primary_location_hint: apac` を指定する。これはアジア太平洋への希望で、Tokyo固定や配置保証ではない。既存DBの再配備では作成場所を変更しない。previewも専用の通常D1を使用し、previewという環境名自体を遅延原因としない。[D1のデータ配置](https://developers.cloudflare.com/d1/configuration/data-location/)

API Workerは `placement.region: aws:ap-southeast-1` でSingaporeに近い拠点を指定し、Webは受信側でSSRと静的配信を行う。2026-10-28のPR #392ではD1 metadataがAPAC/SINだった。通常カゴの31標本でSingaporeのp50 / p95は623 / 2295ms、Tokyo指定 `aws:ap-northeast-1` は1029 / 1909msだった。両方とも目標未達で、観測したCloudflare拠点も異なるため配置だけの効果とは断定しない。既存DBに近く通常時のDB待ちが少ないSingaporeを採用し、[性能記録](guest-order-performance.md)へ条件を残す。Tokyo指定も利用できるがD1を移転する指定ではない。Web→APIのService Bindingの `fetch` は維持する。D1が別拠点になった場合はmetadataとHTTPを再測定して指定を見直す。[Workers Placement](https://developers.cloudflare.com/workers/configuration/placement/)

配備後はCloudflareのWorker設定でplacement状態を確認し、Grafanaで同一経路のwarm要求を比較する。APIの `cloudflare.placement` はCloudflareの `cf-placement` ヘッダー（例: `remote-SIN`）、SDKの `cloudflare.colo` は要求の `request.cf.colo` を表す。後者だけを移動先の証拠にしない。配置設定は生成・ビルド済みconfigを通じて配備し、効果がない場合はこの設定を戻せる。既存DB・Cookie・認証secretは維持する。

## PRのStorybook・メールカタログ

同一repositoryのPRでは、要求されたカタログを`tablecast-storybook-pr-番号.kit-codex.workers.dev`と`tablecast-email-pr-番号.kit-codex.workers.dev`へ配信する。通常のPR更新では生成・再配備しない。StorybookはWorkers Static Assets、React Emailは公式`email build`が生成したNext.jsプレビューをOpenNextの標準WorkerとStatic Assetsへ変換して配信する。SSGの読取専用キャッシュを使い、R2・DB・Queueは追加しない。架空の店舗名と`example.invalid`だけを使い、独自renderer・一覧アプリを持たない。公式サイドバー・コード表示・端末幅切替とbuild時の診断を利用し、送信キーは渡さない。アプリのJSとRSCを配信するため、旧静的メール専用のscript禁止CSPは適用しない。

PR通知の表内でStorybook・React Emailのビルド・デプロイをチェックすると、`catalog-preview.yml`が選択した種別だけを実行する。コメントコマンドは受け付けない。起動した利用者のwrite/admin権限、同一repositoryのopenな通常PR、最新head SHAを確認する。チェック操作はgithub-actionsの固定通知と対象SHAが一致する場合だけ受け付け、受付後に選択を戻す。古い通知からの要求は拒否する。

`issue_comment`はdefault branchのworkflowを使うため、表内のチェック操作はこのworkflowがstagingへ統合された後に有効になる。対象PRのheadにも手動カタログ機能が必要であり、共通通知actionがない古いPRは最新stagingを取り込んでから再要求する。統合前の検証や手動復旧は、Actionsの`CI`からRun workflowを開き、通常PRの作業branch、`catalog_pr`にPR番号、`catalog`に`all`・`storybook`・`email`を指定する。main/stagingを選んだカタログ専用起動は拒否する。同じ再利用workflowが認可・最新headの照合を行う。手動カタログは全CIの終了を待たず、明示要求したheadから生成する。必須検査の代わりにはせず、製品の本番・staging配備条件も変更しない。

製品配備・手動カタログ配備・cleanupは同じ`tablecast-deploy-PR番号`のconcurrencyで直列化する。`queue: max`で最大100件の待機を保持し、開始済み処理と待機中の別配備を新しいpushで取り消さない。上限を超えたrunはキャンセルされるため再実行が必要となる。排他取得後と公開直前にPRのopen状態・head SHA・同一repositoryを再確認する。再確認と外部API操作は原子的ではなく、その間の更新は後続runが収束させる。

カタログjobは依存準備を一度だけ行い、要求されたStorybookとメールの公開成果物を生成する。Storybookと製品のParaglide生成先は共有するため、同じcheckout内でbuildを重ねない。両方を要求した場合の配備は、別Worker・別出力先を使って並行する。共有Access policy・service tokenは参照だけにし、各Workerの所有・公開前後のAccess・現在SHAをそれぞれ検証する。片方が失敗しても開始済みの子プロセスと検証の終了を回収してからjobを失敗にする。

既存の2つのAccess policyを参照する専用applicationを作り、初回はhostname保護の後、workers.devとpreview URLを無効にしてWorkerを作る。Worker IDの`worker` destinationで全経路を保護したことを管理APIで再確認してから正規workers.devを有効にする。既存Workerの更新は、配備前に同じWorker IDのAccess保護を確認し、workers.devを無効化せず維持する。配備後は管理APIから公開有効・preview URL無効を読み戻し、実HTTPのSHA・Accessと併せて検証する。独自認証やaccount全体のAccess変更は行わない。必要権限は既存のWorkers ScriptsとAccess Apps and Policies・Access Service Tokensの管理権限で、Worker ID取得APIも読取り可能であることを確認する。

Storybookは`html_handling: none`でHTMLを配信し、`_redirects`でトップを`/index.html`へ書き換える。メールは`/`に公式の一覧、`/preview/テンプレート名`に各言語のプレビューを配信する。旧`/*.html`の39個の直リンクは対応する公式プレビューへ302転送する。メール配備はOpenNext公式deployを使い、生成した`wrangler.json`の名前・PRを照合する。初回のworkers.dev無効化と公開前後のAccess検査はStorybookと共通である。release manifestはNextのprerender manifestから39例と配信JSを列挙し、配備処理自身が生成する。

製品メールの送信元はrepository variable `TABLECAST_EMAIL_FROM`をbuild・deployの両方で指定する。APIの`cloudflare.config.ts`は同じ値をWorkerのtext bindingとEmail bindingの`allowedSenderAddresses`へ渡す。本番では未設定・不正なアドレスを資源変更前に拒否し、Build Outputの送信元と配備時の入力が異なる場合も再buildを要求する。送信ドメインはWorkersと同じアカウントの[Email Sending](https://developers.cloudflare.com/email-service/get-started/send-emails/)で有効化する。Cloudflare DNS上の独自ドメインが必要であり、workers.devだけでは実送信できない。ドメイン・From・実受信の設定確認は別途行う。

`/_tablecast/release.json`にrepository・PR・種別・SHA・確認対象パスを記録する。メールのrelease・headers・redirectsは配備処理自身が公式CLIの出力から作り、呼出し側workflowの事前準備stepへ依存しない。既定ブランチのチェックボックス起動でも、対象PRの配備処理が同じ成果物を用意する。配備後はservice tokenでreleaseと全ページを確認し、未認証の同じパスがAccessで拒否されることを検査する。製品と手動カタログの各配備jobが、公式`actions/github-script`を使う共通actionで同じ固定コメント1件を更新する。製品buildを必要としない文書・テストだけのPR更新は軽量の通知jobから同じactionを使い、最新headの要求欄と確認できた現在版を表示する。いずれも手動カタログの終了は待たない。TableCast・Storybook・React Emailを同じ表にまとめ、ビルド・デプロイの操作、確認できたデプロイ版とJSTのデプロイ日時を表示する。日時はCloudflareの最新deploymentの`created_on`を使い、通知時刻やビルド時刻で代用しない。デプロイ版が対象SHAと同じ場合は緑、前の版は黄、現在版や日時を取得できない場合は`—`を表示する。投稿直前にPR/headを照合し、古い実行からの更新を防ぐ。forkはsecretなしの検証だけを実施し、配備・コメント要求の対象外とする。

製品の再配備は最新headのCI runを再実行し、カタログは表内のチェック項目・Run workflowから再要求する。古いrunの再実行は公開前のSHA検査で止まる。close/merge時の`pull_request_target`は既定ブランチだけをcheckoutし、カタログを製品D1/R2の有無と独立して削除する。Workerを削除できないときはAccessを残す。カタログ削除が失敗しても、セットアップが成功しworkflowがキャンセルされていなければ製品側の削除を試行する。カタログ側の失敗はjob結果に残す。削除後の再実行は安全に終了する。reopen後は製品を通常CIで、カタログを手動要求で再作成する。手動復旧はセットアップ済みのホスト環境で行い、GitHub CLI `gh` と対象repositoryを読める認証（`gh auth status`）、配備用のCloudflare tokenを用意する。Dev Containerには `gh` を同梱しない。対象PRがclosedであることを確認し、同じ排他が空いている状態で`TABLECAST_PR_NUMBER=番号 bun --no-env-file run deploy:catalog --cleanup`を使う。他PR・本番・共有policyを削除しない。

追加資源は要求した種別ごとのWorkerと専用Access applicationで、両方を生成したPRは2 Workersを使う。メール用D1/R2/KV/DO/Containerは作らない。既存Workers Paidの契約を共有するため、Workerごとの追加基本料はない。両カタログの静的配信は無料で、メール用のWorker実行課金は発生しない。含有枠とAccessの人数・application数、accountのWorker数、Actions artifact容量を監視する。含有枠内なら追加費用0を想定できるが、超過料金まで0とは保証しない。標準GitHub hosted runnerは公開repositoryでは無料で、artifact等は別枠となる。[Workers料金](https://developers.cloudflare.com/workers/platform/pricing/)・[Static Assets料金](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)・[Worker上限](https://developers.cloudflare.com/workers/platform/limits/)を契約時点で確認する。

## stagingとreleaseの運用

開発の標準経路は作業branch → staging → main。default branchはstagingとする。stagingは `https://tablecast-staging.kit-codex.workers.dev`、MCPは同originの`/mcp`。資源名は`tablecast-staging`、`tablecast-api-staging`、`tablecast-db-staging`、`tablecast-media-staging`。D1/R2/DO/Containerは本番・previewから分離する。

配備CLIでは`TABLECAST_DEPLOY_ENV`を必須とし、未指定なら資源変更前に停止する。値は`production`、`staging`、`preview`のいずれか。previewだけ`TABLECAST_PR_NUMBER`を必須にし、他環境との併用を拒否する。CIはpush先branchから配備環境を選び、検査成功後に同じSHAの成果物を配備する。通常配備はmigrationと未投入時の共通demo seedだけを行う。既存のデータ・画像・認証secretは保持する。fixture変更を取り込み直す場合は全体リセットを明示実行する。

### GitHubの初期設定

- Environment `staging`を作り、配備branchをstagingに限定する。既存のrepository配備secretを使う。stagingはAccess資格なしで公開し、PR previewだけ既存Access policyで保護する。実GoogleとBetter Auth Dashboardの資格はproductionだけに保存する。
- ActionsのWorkflow permissionsでAllow GitHub Actions to create and approve pull requestsを有効にする。workflow既定権限はreadのままとし、release更新jobだけContents/Actions読取・Pull requests書込を指定する。既存の`GITHUB_TOKEN`を使い、専用App・PAT・秘密鍵を追加しない。PRレビューの自動承認やマージは行わない。
- `GITHUB_TOKEN`で作ったPRの追加workflowは[GitHubの仕様](https://docs.github.com/en/actions/concepts/security/github_token)により承認待ちになる場合がある。その実行に依存せず、main宛のPRは通常CIの対象から外し、staging pushの`TableCast CI`と同SHAの配備をrelease gateで検査する。通常のstaging宛PRとmain pushの本番CIは維持する。
- main/stagingのrulesetはbranch名を明示し、PR、`TableCast CI`、削除禁止、force push禁止、merge commitを必須にする。mainにはさらに`TableCast release`を要求する。既存の管理者bypassは緊急対応用に維持する。
- stagingの配備とチェックが実在してからdefault branchを変更し、main宛の通常PRをstaging宛へ変更する。stack上段のbaseは直下のbranchを維持する。

### stagingの公開とremote MCP

stagingのWeb・模擬ログイン・同意・MCPをAccess資格なしで公開する。配備時は旧staging専用のWeb・MCP Access applicationの所有先を確認して解除し、PR previewのapplicationと共有policyは維持する。stagingへAccess service tokenは渡さない。アプリのOAuth・PKCE・resource・scope・組織／店舗認可は維持する。未認証のWebが200を返し、discoveryがstagingを参照し、未認証MCPがOAuthの401を返すことを配備後に検証する。模擬Googleログインの架空ユーザー選択も公開されるため、stagingはデモ・検証データで運用する。

### staging全体のリセット

GitHub ActionsのCIからRun workflowを開き、branchにstaging、`staging_reset`に`tablecast-staging`を指定する。検査・ビルド後、通常配備と同じ排他制御下で全体リセットする。初回は現在のstaging headと配備SHAの一致が必要。対象SHA・workflow結果を記録する。

D1とR2の資源ID・所有台帳・migration履歴は保持し、schemaに定義された全業務・認証データとR2画像を消去する。D1はDrizzleの同一batch内で外部キー検証を遅延し、全削除後に再検証する。WebとAPIをメンテナンス応答へ切り替え、OAuth Container applicationだけを退役して再作成する。DO namespace ID・SQLite storage・Worker名は保持し、StoreEventsには業務データを保存しない。最新demoを投入し、同じSHAを配備・疎通確認後に完了する。全アカウント、OAuthクライアント、セッション、MCP tokenが失われるため、ログインとMCP認可をやり直す。

R2の`tablecast/staging-reset.json`へ対象SHAとメンテナンス・runtime退役・画像消去・DB消去の到達工程を記録する。記録が残る間、通常配備は停止する。CIの手動リセットを再実行すると、所有情報を再確認し、現在のCI成功版で初期化を再開する。記録を手で消して部分状態を公開しない。固定URL、本番・PR資源は削除しない。データのdown migrationは行わない。

### release PR

pushとCI完了時に現在のmainとの差分を集約し、Draft release PRを1本作成・更新する。差分がない場合は開いた集約PRを閉じ、新規作成しない。関連PRは各commitの関連付けを保ち、差分内のmerge SHAを持つマージ済みPRで補完する。同じmerge SHAで統合されたStackも、元commitを未関連扱いに変えず全段を集約する。関連PR・元PR冒頭の要約・SHA・CI・配備状況は自動領域へ書き、概要・主な変更・移行手順・実クライアント検証はagentが編集する。[本文・確認手順](../.agents/skills/github-issue-pr-ops/references/pr-and-merge.md#stagingとrelease-pr)を使う。

mainへの通常マージには同一repoの最新staging、stagingの最新pushまたは手動リセットCIの成功、同SHAの疎通、mainとの合成treeとstaging treeの一致が必要。mainに緊急修正がある場合はstagingへ戻して再検証する。集約はmerge commitを使い、stagingを削除・rebaseしない。本番の配備確認はmain pushのCIとhealthで別に行う。

## 組織課金の段階導入

[課金・請求](billing.md#開発と導入)に従い、0026 migration、API Workerのsecret、既存組織のキー準備、切替、Stripeの順で有効化する。初期値は無効。GitHub variable `TABLECAST_BILLING_CONFIG` は環境名ごとの非秘密vars、`TABLECAST_RUNTIME_SECRETS`はAPIの秘密値を保持する。CIは両方を配備設定へ渡す。Web WorkerへOpenAI管理キー・暗号化鍵・Stripe鍵を渡さない。`TablecastVoiceUsage`はAPI WorkerのSQLite DOとして追加され、Cronは5分間隔で発行再試行・Meters送信と日次Costs同期を行う。

作業branchから`CI`を手動実行し、`catalog_pr`を空欄にすると全検査を実行する。Workersはstaging設定でbuildし、productionの送信元などの資格を必要としない。作業branchからの全検査は配備jobを起動しない。mainはproduction、stagingはstaging、通常PRはPR専用previewの設定を使い、本番の入力検証を省略しない。

## Squareの配備設定

Squareの接続環境は`TABLECAST_SQUARE_ENVIRONMENT`で選び、未指定は`production`とする。GitHub Repository variablesへ同名の環境と`TABLECAST_SQUARE_APPLICATION_ID`を設定し、Workers buildと配備jobへ同じ値を渡す。Application IDが空なら未設定として扱い、Squareのsecret bindingを要求せず資格なしの通常CIを継続する。環境またはIDをbuild後に変更した場合は再buildする。

接続環境・Application IDはAPI Workerの非秘密varsへ、`TABLECAST_SQUARE_APPLICATION_SECRET`・`TABLECAST_SQUARE_WEBHOOK_SIGNATURE_KEY`・`TABLECAST_POS_ENCRYPTION_SECRET`は既存のActions secret `TABLECAST_RUNTIME_SECRETS`のJSONからAPI Workerのsecretへ渡す。Web Workerへ5項目を渡さず、秘密値を公開assets・イメージへ含めない。有効な配備では環境に一致したApplication ID・application secretと秘密値3つが必要で、欠落や32文字未満の暗号化secretは遠隔資源を変更する前に拒否する。

`TABLECAST_POS_ENCRYPTION_SECRET`は保存済みOAuth tokenの復号に使う固定値とし、通常の再配備や認証master変更で再生成しない。値や接続環境を変更するときは既存の会計を照合し、切替先で管理者が接続し直す。APIの既存migrationでPOSテーブル・会計固定triggerを適用し、同じアプリ・環境・署名鍵に対応する公開HTTPSのcallbackとWebhookをSquare側へ登録する。URLと操作は[セットアップ](setup.md#square接続)に従う。

本番接続のコード対応と外部の実施結果は分ける。実資格が未設定の現時点では本番の実決済・実機試験・配備を行わず、実施するときは対象と実行範囲を別途確定する。通常CIは明示的なSandbox設定とHTTP差替えを使い、資格付きSandbox確認も本番受入の証拠へ置き換えない。

## 開発用Langfuse

preview/stagingでLangfuse Cloud日本リージョンを使う場合は、同じ開発用projectの`TABLECAST_LANGFUSE_PUBLIC_KEY`・`TABLECAST_LANGFUSE_SECRET_KEY`をActions secretへ設定する。送信先は`https://jp.cloud.langfuse.com`で、配備時にAPI Workerへだけ注入する。既存のGrafana送信は継続し、LangfuseはLLM関連Observationだけを受け取る。資格未設定ではLangfuse送信を無効にし、API・音声・Grafanaを継続する。productionへは追加しない。本文は既存の`TABLECAST_OTEL_CAPTURE_CONTENT`で制御する。SDK/OTLPはv4対応を使い、詳細とCodexからの調査は[観測手順](observability.md#langfuseとcodexの改善ループ)を参照する。

## 画像の表示情報の移行

`0030_tablecast_media_assets.sql`を適用してから、既存の配備準備・seedの`migrateImageAssets`を実行する。公開設定・下書き・過去release・デモ・クーポンの参照と既存索引を集め、R2に保存済みの画像から実寸とBlurHashを生成する。店舗とキーの複合主キーで所有関係を分離し、設定JSONと共有されているR2本体は書き換えない。R2のアップロード所有者と異なる店舗への索引化は拒否する。旧4×3の28文字の行は6×4の52文字へ再生成して更新し、更新済みの行は再利用する。同じ物理キーの解析は一実行中に一度だけ行う。失敗後は同じ処理を再実行する。

索引移行の`tablecast.media_migration`ログに追加・更新件数とR2に存在しない参照を記録する。欠損画像は配信404のままとし、架空の寸法・BlurHashで埋めない。配備前に欠損が既知の削除済み下書きなのか公開中の画像なのか確認する。productionでもseedの初期投入とは独立して索引移行を実施する。画像配信を切り替える前に索引生成を完了させる。旧`/media/*`は再開せず、rollback時も匿名公開へ戻さない。既存の端末キャッシュは一括削除しない。
