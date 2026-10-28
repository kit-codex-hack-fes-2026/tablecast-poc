# ログ・トレースとCodexからの調査

音声をブラウザー直結のGPT-Liveと標準Responses delegationへ移行しても、APIのOTel/GrafanaとD1の業務イベントを維持する。GPT-Liveの字幕は雑談を含めて保存し、backend回答を発話済み本文として二重保存しない。以下に残る旧音声構成の検証履歴は、新構成の遅延・再生完了の証拠にしない。生音声の既定保存は無効のままとする。

[索引](README.md) / [開発環境](development.md)

SSRの取得依存・DB往復予算・cold/warmの比較結果は[SSR初期取得の調査と計測](ssr-initial-performance.md)を参照する。

注文画面のGUI反映と操作APIの比較は[注文画面の操作応答とHTTP性能](guest-order-performance.md)を参照する。表示の即時反映と、previewのHTTP p95未達を分けて記録する。

## 送信経路

Hono APIとTanStack StartのWorker入口を`@inference-net/otel-cf-workers`で計測する。StartのAPI proxyにもW3C trace contextを付け、APIのDrizzle D1・DO bindingと同じtraceへつなぐ。公開`@tablecast/api/telemetry`はWorker向けの設定・送信境界であり、ブラウザーからimportしない。

span送信はOpenTelemetry標準の`BatchSpanProcessor`を使い、待機queueを512件、送信batchを64件に制限する。Worker入口の`waitUntil`で送信を完了し、完了済みtraceを保持し続けず、別要求のflushで実行中の音声spanを強制終了しない。秘匿化は既存exporter境界を通す。

ローカルは公式`grafana/otel-lgtm:0.37.0`のOTLP/HTTP、previewとprodはGrafana CloudのOTLP gatewayへ送る。Cloudflare標準observabilityは既存のCloudflare調査用に維持し、同じログ・traceをCloudflare側のOTLP destinationから再送しない。

Honoは公式の[Middleware execution order](https://hono.dev/docs/guides/middleware#execution-order)に従い、`await next()`後の`c.error`と最終レスポンスを読む。`HTTPException.getResponse()`で4xxの本文・ヘッダーを維持し、5xxの内部本文だけを汎用JSONへ置換する。Better Authは`onAPIError.throw`で共通onErrorへ渡す。4xxはwarn、5xxはerror、通常応答はinfoにする。

Honoは応答確定後に一つの構造化イベント`tablecast.request_completed`を出す。エラーも共通onError後のHTTP statusを記録する。既存の`X-Request-Id`とエラーJSONの`traceId`はリクエスト識別子として維持し、OTelの`trace_id`とは別に`tablecast.request.id`へ格納する。StartはAPI proxyとSSRを区別し、同じtraceにログを付ける。Honoの文字列loggerとconsole自動収集は重ねない。標準出力の構造化ログはリクエスト内で同期出力し、OTLP送信のみを後処理にする。

SDKの自動計測にはURL・SQL・ヘッダーが含まれるので、実際のexporterで許可属性のみ残す。resourceも固定した環境情報へ置換する。Authorization、Cookie、URL queryは送らない。顧客情報・SQL・例外・業務入出力は末尾の環境変数で切り替える。例外診断は`platform/diagnostics.ts`で秘密値を除去し、message、ファイル名と行・列、最大5段のcauseを保持する。本文収集が無効ならSQL wrapper・URL・引用値・メールアドレスを伏せ、providerのcauseは型と位置だけを残す。有効ならproviderのmessage・顧客情報も収集するが、資格情報は常に除く。未知の自由文すべてを自動検出する仕組みではない。送信境界は本文収集が無効でも処理済みの診断属性とexception eventを保持する。任意の外部fetchへtrace contextを送らず、Web→APIのservice bindingだけへ明示伝播する。検証対象は独自の送信境界と実際の注文経路であり、SDK内部の動作をテストへ複製しない。

全環境でtraceを100%収集する。ログはリクエスト単位で保持する。送信はSDKの`waitUntil`で処理し、注文結果をexportの成功に依存させない。Collector停止・再起動時の配送はbest effortであり、業務イベントの永続化は従来どおりD1が所有する。

## prod・PR番号による検索

Grafana Cloudは`beigepuma130`の一つのstackを使う。PRごとにstackやdatasourceを作らない。これは検索上の分離であり、機密性の境界ではない。Viewer tokenを持つ開発者はprodとpreviewの双方を検索できる。

| 対象       | OTel resource                                                              | Loki                                                                    |
| ---------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 共通       | `service.namespace=tablecast`                                              | `service_namespace` index label                                         |
| サービス   | `service.name=tablecast-api` / `tablecast-web`                             | `service_name` index label                                              |
| 本番       | `deployment.environment.name=production`                                   | `deployment_environment_name` index label                               |
| PR preview | `deployment.environment.name=preview`, `tablecast.pr.number=123`（文字列） | 環境labelと`tablecast_pr_number` structured metadata                    |
| ローカル   | `deployment.environment.name=development`                                  | 環境label                                                               |
| リリース   | `service.version=<SHA>`                                                    | `service_version` structured metadata                                   |
| worktree   | `tablecast.worktree.id` / `tablecast.worktree.name`                        | `tablecast_worktree_id` / `tablecast_worktree_name` structured metadata |

worktree IDは実worktreeのrealpathのSHA-256先頭16桁で、branch・commitに依存しない。パス自体を送らず、API/Webの起動設定から注入する。worktree・PR番号・request ID・trace IDをLoki index labelに増やさない。APIとWebの環境・PR番号・SHAは配備設定から同時に注入し、HTTP headerから決めない。

prodのLogQL:

```logql
{service_namespace="tablecast", deployment_environment_name="production"}
```

PR 123の商品注文のLogQL:

```logql
{service_namespace="tablecast", deployment_environment_name="preview"}
  | tablecast_pr_number="123" | http_route="/api/table/orders"
```

PR 123の注文確定のTraceQL:

```traceql
{ resource.service.namespace = "tablecast" && resource.deployment.environment.name = "preview" && resource.tablecast.pr.number = "123" && name = "tablecast.order.submit" }
```

prodは環境を`production`へ変えてPR条件を外す。ローカルは`development`で同じ検索を使う。時間範囲と必要ならSHAを必ず確認する。検索index反映まで少し待つ場合があり、ログにあるtrace IDによる取得と検索を区別する。

## ローカル起動とMCP

LGTMとLangfuseは開発ホストにつき一組を共有する。初回に`bun run tablecast:observability:up`、状態確認に`bun run tablecast:observability:status`を使う。ホストにBunがないDev Container開発では`sh scripts/tablecast-observability.sh up`を先に実行する。通常のdevと`services:up`はworktree固有のMailpitとアプリを起動し、共有観測先へ接続する。

共有Composeの正本は`infra/observability/compose.yaml`。実行用Compose、Tempo設定、資格情報は`${XDG_DATA_HOME:-$HOME/.local/share}/tablecast/observability`へ保存する。`TABLECAST_OBSERVABILITY_DIR`で変更できる。実行時のmount元はworktreeへ依存しない。データは固定project `tablecast-observability-local`のnamed volumeへ永続化する。

既定のホストURLはGrafana `http://127.0.0.1:3300`、Tempo `http://127.0.0.1:3320`、OTLP `http://127.0.0.1:4318`、Langfuse `http://127.0.0.1:3301`。初回up前に`TABLECAST_GRAFANA_PORT`・`TABLECAST_TEMPO_PORT`・`TABLECAST_OTLP_PORT`・`TABLECAST_LANGFUSE_PORT`で変更でき、以後は共有`.env`の値を使う。Dev ContainerとGrafana MCPのDocker clientは外部network `tablecast-observability-local`へ接続する。

`services:down`とDev Containerのdownは共有基盤を止めない。共有基盤を止める場合だけ`bun run tablecast:observability:down`を使う。volumeは保持する。旧worktree別LGTMのvolumeは削除・自動取り込みせず、新しいログから共有先へ切り替える。Tempo設定の正本は`infra/grafana/tempo.yaml`、手動importするdashboardは`infra/grafana/dashboards/`にある。

LGTMは開発用で、host公開はloopbackに限定する。Grafanaは匿名Viewer、設定変更用の初期ログインは`admin` / `admin`。Tempoの読み取りMCPは同梱設定で有効にする。

`.codex/config.toml.example`のMCP項目をローカル`.codex/config.toml`へ追加する。既存設定は維持する。Codexは信頼済みプロジェクトの設定を読むため、設定追加後はMCPを再接続する。公式`grafana/mcp-grafana:2.0.2`をstdio・`--disable-write`で動かす。Dev Containerでは同じイメージのbinaryを直接実行し、localはCompose内の`tablecast-lgtm:3000`へ接続する。ホストではDockerから起動する。Dockerfile変更後はDev Containerをrebuildする。

CloudはGrafanaで作成したViewer service account tokenを`.local/tablecast-grafana-read-token`へ改行なしで保存し、`chmod 600`を設定する。送信用Cloud access policy tokenと読み取り用service account tokenを共用しない。Cloudの送信AuthorizationはGitHub Actions secret `TABLECAST_OTEL_AUTHORIZATION`からAPIとWebへ渡す。Viteの公開varsやGitには含めない。今回の送信tokenは90日で失効するため、期限前にGrafanaで更新して同じsecretを入れ替える。

専用のクエリscriptを置かず、[公式MCP Inspector CLI](https://github.com/modelcontextprotocol/inspector/blob/main/clients/cli/README.md)で同じMCPを確認する。`local` を `cloud` に変えるとCloudを対象にする。

```sh
bunx @modelcontextprotocol/inspector@2.6.0 --cli bun --no-env-file scripts/tablecast-grafana-mcp.ts local -- --method tools/list
bunx @modelcontextprotocol/inspector@2.6.0 --cli bun --no-env-file scripts/tablecast-grafana-mcp.ts local -- --method tools/call --tool-name query_loki_logs --tool-arg datasourceUid=loki --tool-arg 'logql={service_namespace="tablecast"}' --tool-arg limit=5
```

Cloud datasource UIDは`grafanacloud-logs`・`grafanacloud-traces`。Grafana MCPの`tempo` tool groupを明示して有効にし、`search_tempo_traces`と`get_tempo_trace`で検索・取得する。LokiはLogQLであり、LogsQL/SQLとは別の言語である。

## 商品注文のクリティカルパス

画像取得は`tablecast.image.deliver`配下の`metadata`・`r2_head`・`cache`・`r2_get`・`transform`で確認する。画像の幅・形式・品質・変換版とHIT/MISS/NOT_MODIFIEDを属性へ残し、認可spanと分ける。`transform`はImages bindingのoutput取得までで、本文の全転送・ブラウザーdecode・描画完了ではない。Server-TimingとResource Timing、画像のdecode後の描画frameを照合する。端末cacheでは保存時のServer-Timingも再利用されうるため、それを今回の待ち時間として集計しない。画像のキー・Cookie・認証情報を新しい計測属性へ含めない。

GUIで商品をカートへ入れ、確認画面を経て明示承認する。`/api/table/orders`のログから`trace_id`を取り、`get_tempo_trace`でウォーターフォールを取得する。認可・確認版・冪等性の判定を迂回する測定用endpointは作らない。

認可は`tablecast.authentication.authorise`とデモの`tablecast.authentication.demo`、カゴは`tablecast.cart.update`配下の`session`・`pricing`・`commit`と`tablecast.table.read`を確認する。注文serviceは`tablecast.order.submit`配下の`session`・`prerequisites`・`commit`・`notify`を使う。Web→service binding→API→業務serviceの親子関係とstart/endを確認する。`commit`配下のD1 batch子spanは時間が重なるため、子spanのdurationを足した値を応答時間としない。SQL時間はD1の`cloudflare.d1.response.sql_duration_ms`、binding往復は親のD1 spanのwall timeで分ける。

通知はDBとイベント確定後に`waitUntil`へ渡し、配送そのものは`tablecast.notification.deliver`で別計測する。操作側の`notify`は登録までであり、配送完了時間ではない。通知失敗も既存の`tablecast.notification_failed`へ記録し、WebSocket再接続とイベントpollで回復する。HTTPはレスポンス本文の受信完了、UIは操作イベントから件数・商品行など目的の表示更新までを別々に測る。応答サイズはHTTP本文のUTF-8 byte数で記録する。

`Server-Timing`の`api`はHono内の応答確定までを示す。認可済みの成功要求には同じ要求の`measured`で完了したspanの所要時間も最大32件付ける。SQL・入力値・資格・店舗識別子は含めず、別originへの読取許可は追加しない。更新結果から取得できたD1のSQL時間・読取／書込行数・region／colo・primary・total_attemptsもspanへ残す。未提供のmetadataを0で補わない。親子の時間は重なるため合算しない。応答後の通知・OTLP送信、API入口前のWorker初期化・Service Binding・HTTP転送は含まない。ローカルLGTMのtraceと対応させ、ブラウザーのHTTP時間との差をすべてDB時間として扱わない。

`api`のdescriptionにはCloudflareが返した有効なplacementを付け、カゴの`tablecast.d1.update.sql`はD1 metadataの更新SQL実行時間と、取得できたregion／coloを示す。これは状態読取を含むbatch全体のSQL時間ではない。Webの`web`はAPI Service Bindingの応答取得までで、ブラウザーへの転送・本文受信完了とは分ける。WebSocketの101応答はこの応答変換を通さない。 API入口の`bootstrap`はHonoの動的import待ち、`worker`はその待ちとHono処理・完了ログを含む。`bootstrap`の`first-fetch`はそのisolateでの最初のfetch、`reused`はそれ以降であり、実際のcold startはSDKの`faas.coldstart`と照合する。`web - worker`にはService Bindingの往復とSDK入口の処理が含まれ、純粋なネットワークRTTとは断定しない。

`table-operation-performance.test.ts`は本番Hono入口・Cookie認証・実D1で、通常卓とデモの8/120商品、1/100行のカゴと履歴を比較する。GUIの`view=core`で操作ごとに初回1標本と再利用30標本を分け、初回を含む全31標本のp95を300ms未満とする。通常操作は通常端末2往復／playground3往復、注文送信は3／4往復を上限とする。binding往復、statement数、batchのSQL時間、通知後処理、本文サイズと業務結果も残す。ローカルの初回要求をCloudflareのcold isolateと同一視しない。previewの比較では対象SHA・環境・標本数を付け、実際のcold startは`faas.coldstart`のtraceが取得できる場合に別集計する。

ローカルの一例は全体24ms、注文service17ms、通知5ms、商品設定取得4ms、DB確定3ms。単発のローカル測定であり、previewの性能値やp95を示さない。CPU処理だけの小さい区間はWorkersの時計の制約で0msになりうる。

## Issue #58に残る範囲

このPRの受入経路はlocal・PR previewのWeb/APIログ・traceと注文調査。Cloudflare ContainersのCPU・メモリ等のGraphQL集計、Python LiveKitのOTLPとcontext伝播、container内部stdout・lifecycle、アラートは別の実装単位として#58で追跡する。DO bindingの呼出し時間だけでcontainer内部まで監視済みとは扱わない。

## 参照

- [Grafana LGTM開発container](https://github.com/grafana/docker-otel-lgtm)
- [Grafana MCP](https://github.com/grafana/mcp-grafana)
- [Tempo MCP](https://grafana.com/docs/tempo/latest/api_docs/mcp-server/)
- [Workers用SDK](https://github.com/context-labs/otel-cf-workers)
- [Codex MCP設定](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

## 全体の性能集計

`infra/grafana/dashboards/tablecast-operations.json`をGrafanaのImport dashboardで読み込む。Loki datasource、環境、PR番号、worktree ID、サービスを選ぶ。PR番号の`.*`は全件、`123`はそのPRだけを対象にする。APIを既定サービスとし、Web proxyとAPIの件数を重複合算しない。

HTTPは全ルートの完了ログ、業務処理は`tablecast.operation_completed`から件数・失敗率・p50/p95を集計する。カタログ取得、卓状態、カート、注文確認・確定・状態変更、スタッフ呼出、卓の開始・終了、会計要求・入金、設定公開を同じ操作名で追える。処理内訳の子spanは完了イベントを重ねず、共有操作のネストは操作名別に集計する。業務拒否の`rejected`と障害の`error`を区別する。ログ配送はbest effortなので、これを売上帳簿や厳密な監査件数にしない。

`tablecast.channel`はAPI入口で`http`・`voice`・`mcp`を設定する。通常HTTPをGUI利用の証明とはせず、外部HTTP clientも同じ区分に含む。呼出経路・結果・操作名もstructured metadataであり、新しいLoki index labelは作らない。SSR loaderのService Bindingにも現在のW3C contextだけを渡し、任意baggageは転送しない。

例: PR 123のカート更新のp95を5分窓で比較する。

```logql
quantile_over_time(0.95,
  {service_namespace="tablecast",service_name="tablecast-api",deployment_environment_name="preview"}
  | tablecast_pr_number="123" |~ "^tablecast[.]operation_completed$"
  | tablecast_operation="tablecast.cart.update"
  | unwrap tablecast_duration_ms | __error__="" [5m]
) by (tablecast_channel)
```

```traceql
{resource.deployment.environment.name="preview" && resource.tablecast.pr.number="123" && span.tablecast.operation="tablecast.cart.update"}
```

PR #63の基盤に続く集計は#64、音声とLiveKit hostedは#65、Mastra hostedは#66、Containersインフラ指標は#67で管理する。

## Container指標の環境選択

PR previewとstagingのAPIは5分ごとにContainer指標を収集する。配備設定が生成する対象は `tablecast-api-pr-<PR番号>-tablecastemulate` と `tablecast-api-staging-tablecastemulate` で、収集処理はこの命名規約だけを受け付ける。従来のproduction名とvoice名の検証も維持する。現在のproduction設定はContainerと収集Cronを生成しない。

`tablecast-containers.json` と `tablecast-operations.json` の環境選択から `staging` を選ぶ。更新したJSONはGrafanaへ再importする。stagingのPR番号属性は `prod` なので、PR番号の絞り込みは既定の `.*` または `prod` を使い、環境属性でproductionと区別する。

## 顧客情報・会話本文の収集切替

`TABLECAST_OTEL_CAPTURE_CONTENT=true`で業務操作の入出力、顧客情報、会話、SQLと例外の詳細を収集する。`false`または未設定では従来の許可した運用属性だけを送る。認証資格・Cookie・APIキー・bindingの秘密値は常に除去する。previewとprodはユーザー指定により有効とし、prodの設定は暫定運用である。

GitHub Environmentの`preview`または`production`に同名のActions variableを設定すれば、次の配備で切り替わる。未指定の配備値は`true`。ビルド済み成果物にも配備時の値を反映する。既に保存されたデータは切替では削除されず、各観測先の保持期間に従う。停止時には新しい音声sessionにも新設定を適用する。

大きな入出力はLokiの64 KiB structured metadata上限を超えるため、`tablecast.content`のJSONログ本文へ分割する。元の完了ログは一件のまま維持する。同じtrace ID・span IDの`part`順に`content`を連結するとJSON属性へ復元できる。各行を256 KiB未満にし、本文を切り捨てない。Grafanaのtrace表示が長い属性を省略する場合は、相関する本文ログを使う。

秘匿化に使う秘密値は本文全体につき一度だけ環境設定から取得する。計測済みの環境設定を各文字列で列挙すると、D1などのbindingのProxyを大量に生成するためである。JSONオブジェクト・配列の候補だけを解析し、通常文での例外生成も避ける。入れ子のJSON文字列と通常文の資格除去、本文の保持は共通の送信境界で検証する。

## GPT-LiveとResponsesの相関

voice session / アプリのturn / tool call IDとHTTP traceを区別して記録する。tablecast.voice.tool spanはHonoでの認可・SQL・実行・結果保存の区間であり、OpenAI内部の推論時間ではない。tool.output_bytesは実際に返したJSONのbyte数で、token数の推測値として使わない。

ブラウザーでsession.delegation.createdとresponse.created / response.completed、tool HTTP、入力音声終了、出力音声を同じ時計で測る。モデルusageはresponseイベントのusageから取得し、cached・cache write・outputを分ける。推論完了・字幕到着・実再生は異なる。

D1はspanとsql_duration_msを分け、取得できる場合にserved_by_region / served_by_primary / total_attemptsも残す。差分を純粋なネットワークRTTと断定しない。属性の許可だけでは、bindingやadapterが返さないmetadataを取得できた証拠にはならない。

## worktreeと会話の調査

共有localの検索は環境・worktree・時間範囲を指定し、必要に応じてSHAを絞る。表示名は現在の開発設定の名前、IDはcheckoutの安定した識別子である。同じbranch名の別checkoutを表示名だけで判定しない。

```logql
{service_namespace="tablecast", deployment_environment_name="development"}
  | tablecast_worktree_id="<worktree-id>"
```

```traceql
{ resource.deployment.environment.name="development" && resource.tablecast.worktree.id="<worktree-id>" }
```

運用dashboardのworktree欄にはIDを入力し、全件は`.*`にする。LangfuseのSessionも環境・worktreeまたはPR・来店IDを組み合わせ、別worktreeの同じfixture IDを混ぜない。metadataの`tablecast_worktree_id`・`tablecast_pr_number`・`service_version`から絞り、voice session・turn・delegation・response・tool callのIDで対応を追う。HTTP traceは別の区間であり、長時間のモデルspanをWorker内で保持しない。

## LangfuseとCodexの改善ループ

localはLangfuse v4.71.0、評価SDKはJS 6.0.2とOTel trace SDK 2.12.0・exporter 0.223.0、CLIは固定依存の公式`@langfuse/cli`を使う。localの初期ユーザーは`developer@tablecast.localhost`。初期passwordとproject API keyは共有`.env`へ権限600で生成する。資格情報をチャット・Git・ブラウザーの公開設定へ貼らない。

preview/stagingは日本リージョンの同じCloud開発用projectを使い、environmentで分ける。GitHub Actionsのpreview/stagingで使用するsecret `TABLECAST_LANGFUSE_PUBLIC_KEY`と`TABLECAST_LANGFUSE_SECRET_KEY`を登録する。productionはLangfuse送信対象に含めない。CodexからCloudを読む場合は共有ディレクトリの`cloud.env`に同じ二つの変数を保存し、権限600にする。Cloud無料枠は50k units/月、履歴アクセス30日。unitsは会話数ではなくObservationやscoreも含む。

```sh
bun run tablecast:langfuse local api observations list --help
bun run tablecast:langfuse cloud api observations list --help
```

リポジトリの`.codex/config.toml.example`には`tablecast-langfuse-local`と`tablecast-langfuse-cloud`も用意する。必要なテーブルをGit管理外の`.codex/config.toml`へ統合し、MCPを再接続する。公式のデータ用MCPへ直接接続し、`http_headers_helper`が共有資格情報を実行時に読む。helperの標準出力は秘密値なので手動表示しない。localのportを変更した場合はURLも合わせ、Dev Container内のCodexでは`http://tablecast-langfuse-web:3000/api/public/mcp`を使う。Cloudは日本リージョンのURLへ固定する。登録後は`codex mcp get tablecast-langfuse-local`と`listPrompts`・`listObservations`の実読取を区別して確認する。履歴調査用MCPは`enabled_tools`で読取に限定し、評価やscoreなどの変更は対象を明示したCLIから行う。[Langfuse公式MCP](https://langfuse.com/docs/api-and-data-platform/features/mcp-server)、[Codex header helper](https://learn.chatgpt.com/docs/extend/mcp)を参照する。

実際の引数とschemaは公式CLIの`api __schema`と`--help`で確認する。Observations API v2を使い、廃止されるlegacy traces/sessions APIへ新規依存しない。公式Langfuse Skillは`.agents/skills/langfuse`、取得元は`skills-lock.json`で管理する。Grafana公式の`loki`・`tempo`・`promql`・`dashboarding`・`assistant-mcp`も同じリポジトリに導入する。外部skillの一般例より、この文書の固定版・接続先・秘匿化・worktree条件を優先する。skillは次のターンから利用でき、global配置へのコピーは不要である。

収集はsession開始時のprompt・店舗設定・tool定義・モデル設定とhash、字幕、委任、公開response event、APIのtool引数・結果を対象にする。promptの正本はGitと店舗設定である。`TABLECAST_OTEL_CAPTURE_CONTENT=false`では本文を送らず、取得できたモデル名・usage等だけを残す。会員参加後は診断本文を収集しない。認証資格の秘匿化は両exporterへ適用する。生音声・画像は収集しない。

ブラウザーの診断は最大20件・240KiB未満のbatchで認可済み`voice/observations`へ送る。最大100件の待機queueと重複event IDの抑制を持ち、送信失敗は再試行せず音声状態を変えない。容量超過は`tablecast.observation.dropped_events`、本文上限は`tablecast.observation.content_truncated`で示す。停止・会員切替との競合、タブ終了時は欠落しうる。providerが公開しない委任入力は再現済みと扱わない。usageは公開event由来の診断値で、課金ledgerではない。

Codexへの依頼では、環境・期間・worktreeまたはPR・対象SHAと問題の動作を指定する。失敗例と成功例を確認し、ケース化してからprompt・tool説明・実装を変更する。PRへ匿名化した再現手順・trace参照・検証結果を残す。

### 手動再評価

`infra/observability/tablecast-eval-cases.json`は日英の注文確認・売切・必須選択・言語切替・停止の10件を持つ合成draftで、人が期待動作をレビューするための出発点である。自動の品質合格判定や本番会話由来のground truthではない。

```sh
# draftの確認のみ。外部接続・有料モデル実行は行わない。
bun run tablecast:eval
# Langfuseで収集したconfigurationの入力JSONを.local/tablecast-configuration.jsonへ保存する。
# 記録済み応答はcase IDをkeyにしたJSON objectを用意する。
bun run tablecast:eval --target local --configuration .local/tablecast-configuration.json --replay .local/tablecast-recorded-responses.json --output .local/tablecast-baseline.json
# 実モデルを明示起動する。初期値は最大10件・並列1・最大出力1024token。
bun run tablecast:eval --target local --configuration .local/tablecast-configuration.json --live --output .local/tablecast-candidate.json
```

snapshotと同じ言語のケースだけを実行し、実tool定義と店舗設定に現在コードのprompt生成を組み合わせる。比較には同じ評価方式で作成した結果JSONを`--baseline`へ渡す。データセットhashが異なる比較は拒否する。`--dataset`でレビュー済みの独自ケースへ差し替えられる。`--limit`は1〜20、`--concurrency`は1〜2、`--max-output-tokens`は128〜4096に制限する。

結果JSONにはExperiment ID・URL・SHA・dataset hash・比較前後の出力を保存し、LangfuseのExperiments画面でも比較できる。SDK task内のtool callを実店舗へ実行することはなく、Responsesのテキスト出力と呼出し要求をレビューする。GPT-Liveの実音声・割り込み・再生開始の検証とは区別する。実モデル実行には`.env.local`か実行環境の`TABLECAST_MODEL_API_KEY`を使う。
