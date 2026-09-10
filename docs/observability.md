# ログ・トレースとCodexからの調査

[索引](README.md) / [開発環境](development.md)

## 送信経路

Hono APIとTanStack StartのWorker入口を`@inference-net/otel-cf-workers`で計測する。StartのAPI proxyにもW3C trace contextを付け、APIのDrizzle D1・DO bindingと同じtraceへつなぐ。公開`@tablecast/api/telemetry`はWorker向けの設定・送信境界であり、ブラウザーからimportしない。

ローカルは公式`grafana/otel-lgtm:0.32.1`のOTLP/HTTP、previewとprodはGrafana CloudのOTLP gatewayへ送る。Cloudflare標準observabilityは既存のCloudflare調査用に維持し、同じログ・traceをCloudflare側のOTLP destinationから再送しない。

Honoは応答確定後に一つの構造化イベント`tablecast.request_completed`を出す。エラーも共通onError後のHTTP statusを記録する。既存の`X-Request-Id`とエラーJSONの`traceId`はリクエスト識別子として維持し、OTelの`trace_id`とは別に`tablecast.request.id`へ格納する。StartはAPI proxyとSSRを区別し、同じtraceにログを付ける。Honoの文字列loggerとconsole自動収集は重ねない。標準出力の構造化ログはリクエスト内で同期出力し、OTLP送信のみを後処理にする。

SDKの自動計測にはURL・SQL・ヘッダーが含まれるので、実際のexporterで許可属性のみ残す。resourceも固定した環境情報へ置換する。Authorization、Cookie、URL queryは送らない。顧客情報・SQL・例外・業務入出力は末尾の環境変数で切り替える。任意の外部fetchへtrace contextを送らず、Web→APIのservice bindingだけへ明示伝播する。検証対象は独自の送信境界と実際の注文経路であり、SDK内部の動作をテストへ複製しない。

全環境でtraceを100%収集する。ログはリクエスト単位で保持する。送信はSDKの`waitUntil`で処理し、注文結果をexportの成功に依存させない。Collector停止・再起動時の配送はbest effortであり、業務イベントの永続化は従来どおりD1が所有する。

## prod・PR番号による検索

Grafana Cloudは`beigepuma130`の一つのstackを使う。PRごとにstackやdatasourceを作らない。これは検索上の分離であり、機密性の境界ではない。Viewer tokenを持つ開発者はprodとpreviewの双方を検索できる。

| 対象       | OTel resource                                                              | Loki                                                 |
| ---------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| 共通       | `service.namespace=tablecast`                                              | `service_namespace` index label                      |
| サービス   | `service.name=tablecast-api` / `tablecast-web`                             | `service_name` index label                           |
| 本番       | `deployment.environment.name=production`                                   | `deployment_environment_name` index label            |
| PR preview | `deployment.environment.name=preview`, `tablecast.pr.number=123`（文字列） | 環境labelと`tablecast_pr_number` structured metadata |
| ローカル   | `deployment.environment.name=development`                                  | 環境label                                            |
| リリース   | `service.version=<SHA>`                                                    | `service_version` structured metadata                |

PR番号・request ID・trace IDをLoki index labelに増やさない。APIとWebの環境・PR番号・SHAは配備設定から同時に注入し、HTTP headerから決めない。

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

`bun run dev`でworktree専用のLGTMも起動する。ポートは`.local/runtime.json`の`grafana`・`otlp`・`tempo`に記録する。Docker volume `tablecast-<worktree ID>-lgtm`にデータを保持し、`dev:stop`はこのworktreeのcontainerだけを停止する。Dev ContainerはComposeの`tablecast-lgtm`を使う。

LGTMは開発用で、host公開はloopbackに限定する。Grafanaは匿名Viewer、設定変更用の初期ログインは`admin` / `admin`。Tempoの読み取りMCPは同梱設定で有効にする。

`infra/grafana/codex.toml.example`のMCP項目をローカル`.codex/config.toml`へ追加する。既存設定は維持する。Codexは信頼済みプロジェクトの設定を読むため、設定追加後はMCPを再接続する。公式`grafana/mcp-grafana:1.3.0`をstdio・`--disable-write`で動かす。Dev Containerでは同じイメージのbinaryを直接実行し、localはCompose内の`tablecast-lgtm:3000`へ接続する。ホストではDockerから起動する。Dockerfile変更後はDev Containerをrebuildする。

CloudはGrafanaで作成したViewer service account tokenを`.local/tablecast-grafana-read-token`へ改行なしで保存し、`chmod 600`を設定する。送信用Cloud access policy tokenと読み取り用service account tokenを共用しない。Cloudの送信AuthorizationはGitHub Actions secret `TABLECAST_OTEL_AUTHORIZATION`からAPIとWebへ渡す。Viteの公開varsやGitには含めない。今回の送信tokenは90日で失効するため、期限前にGrafanaで更新して同じsecretを入れ替える。

Codexと同じMCPをCLIで確認できる:

```sh
bun --no-env-file scripts/tablecast-grafana-query.ts local
bun --no-env-file scripts/tablecast-grafana-query.ts cloud
bun --no-env-file scripts/tablecast-grafana-query.ts local query_loki_logs '{"datasourceUid":"loki","logql":"{service_namespace=\"tablecast\"} | http_route=\"/api/table/orders\"","limit":5}'
bun --no-env-file scripts/tablecast-grafana-query.ts local tempo_traceql-search '{"datasourceUid":"tempo","query":"{name=\"tablecast.order.submit\"}"}'
```

Cloud datasource UIDは`grafanacloud-logs`・`grafanacloud-traces`。MCPはTempo内蔵MCPを自動検出し、`tempo_traceql-search`と`tempo_get-trace`を公開する。LokiはLogQLであり、LogsQL/SQLとは別の言語である。

## 商品注文のクリティカルパス

GUIで商品をカートへ入れ、確認画面を経て明示承認する。`/api/table/orders`のログから`trace_id`を取り、`tempo_get-trace`でウォーターフォールを取得する。認可・確認版・冪等性の判定を迂回する測定用endpointは作らない。

注文serviceには`tablecast.order.submit`の下に`session`・`catalog`・`plan`・`commit`・`notify`のspanがある。Web→service binding→API→注文serviceの親子関係とstart/endを確認する。`commit`配下のD1 batch子spanは時間が重なるため、子spanのdurationを足した値を応答時間としない。通知は注文確定後にawaitするので応答のクリティカルパスへ含まれる。

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

`infra/grafana/tablecast-operations.json`をGrafanaのImport dashboardで読み込む。Loki datasource、環境、PR番号、サービスを選ぶ。PR番号の`.*`は全件、`123`はそのPRだけを対象にする。APIを既定サービスとし、Web proxyとAPIの件数を重複合算しない。

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

## 顧客情報・会話本文の収集切替

`TABLECAST_OTEL_CAPTURE_CONTENT=true`で業務操作の入出力、顧客情報、会話、SQLと例外の詳細を収集する。`false`または未設定では従来の許可した運用属性だけを送る。認証資格・Cookie・APIキー・bindingの秘密値は常に除去する。previewとprodはユーザー指定により有効とし、prodの設定は暫定運用である。

GitHub Environmentの`preview`または`production`に同名のActions variableを設定すれば、次の配備で切り替わる。未指定の配備値は`true`。ビルド済み成果物にも配備時の値を反映する。既に保存されたデータは切替では削除されず、各観測先の保持期間に従う。停止時には新しい音声sessionにも新設定を適用する。

大きな入出力はLokiの64 KiB structured metadata上限を超えるため、`tablecast.content`のJSONログ本文へ分割する。元の完了ログは一件のまま維持する。同じtrace ID・span IDの`part`順に`content`を連結するとJSON属性へ復元できる。各行を256 KiB未満にし、本文を切り捨てない。Grafanaのtrace表示が長い属性を省略する場合は、相関する本文ログを使う。

## 音声とLiveKit Agent Insights

Pythonも `TABLECAST_OTEL_ENDPOINT` と `TABLECAST_OTEL_AUTHORIZATION` でOTLP/HTTPのtraceとlogを送る。localはworktree専用LGTM、preview/productionのContainerはAPIと同じGrafana Cloudへ接続する。Providerとバッチ送信器はプロセスごとに一度作り、job終了時にflushする。送信エラー自身のログをGrafanaへ再送して循環させない。

LiveKit Cloud接続時はAgent Insightsのtrace/logを有効にする。`TABLECAST_OTEL_CAPTURE_CONTENT=true` では会話本文と字幕も収集し、falseではSDKの `allow_pii=False`、sessionの `redaction=True`、`transcript=False` とログフィルターで除去する。録音は両設定とも `audio=False`。プロジェクト全体でPII除去が強制されている場合は、この環境変数で解除できない。localのself-hosted media serverではAgent Insightsへ送られない。

LiveKitの標準spanでモデル、TTS、再生、中断を追い、`tablecast.voice.api` でAPIツールの待ち時間を分ける。Realtimeのtext出力にaudio TTFTを流用しない。APIリクエストにはW3C traceparentを伝播する。APIからjobを開始する非同期境界はspan linkと `tablecast.voice.session.id` で結び、`tablecast.voice.turn.id`、`lk.speech_id`、`tablecast.request.id` で区間を照合する。UUIDの要求IDをOTel trace IDとして扱わない。

```traceql
{ resource.service.name = "tablecast-voice" && resource.tablecast.pr.number = "対象PR番号" }
```

PR番号は調査対象へ置き換える。LogQLでは `{service_name="tablecast-voice"} | voiceSessionId="調査対象のセッションID"`、HTTP処理のtraceでは `span.tablecast.voice.session.id` を使う。Agent Insightsは同じroom/jobとsession IDで照合する。

## Mastra Platformとの併用

Mastraを実行するcascade経路は`OtelBridge`で現在のWorker traceに参加し、`MastraPlatformExporter`で同じtrace IDをhostedへ送る。通常のLiveKit Realtime経路には架空のMastra実行を作らない。Agent・モデル・toolの時間、使用量、環境・PR・SHA、voice session・turnを両画面で照合する。

Workersのsecretに`TABLECAST_MASTRA_ACCESS_TOKEN`、設定に`TABLECAST_MASTRA_PROJECT_ID`を指定する。`TABLECAST_MASTRA_ENDPOINT`の既定は`https://observability.mastra.ai`。GitHub Actionsは同名のrepository secretとvariableから配備する。localでは`.env.secrets.local`に同名を設定して開発環境を再起動する。StudioサーバーやMastraへのアプリ配備は不要。

requestごとにObservabilityを所有し、生成終了・失敗・中断の全経路で`waitUntil(observability.shutdown())`を待つ。SDKのbus、exporter、bridgeをflushし、共有するWorker providerをshutdownしない。hosted送信の失敗は業務結果を変えない。導入版の`maxRetries`は初回を含むため1を指定する。無限再試行や重複したshutdownは行わない。

`TABLECAST_OTEL_CAPTURE_CONTENT`を共用する。falseではinput/output、prompt、tool payload、request context、例外本文を送信前processorで除去し、両宛先に反映する。trueではこれらも収集するが、`SensitiveDataFilter`とbindingの秘密値除去は維持する。フレームワークの無加工consoleログは無効にし、業務の完了ログとtraceのエラーをGrafanaで調べる。

CLIでもhostedを照会できる。credentialはshell historyに書かず環境から渡す。SDK用のTableCast変数をCLI標準の`MASTRA_PLATFORM_ACCESS_TOKEN`・`MASTRA_PROJECT_ID`へ対応付ける。

```sh
bunx mastra@1.28.0 api trace list '{"page":0,"perPage":10}'
bunx mastra@1.28.0 api trace get TRACE_ID --verbose
```

[公式のObservability単独利用](https://mastra.ai/docs/mastra-platform/observability)と[OtelBridge](https://mastra.ai/reference/observability/tracing/bridges/otel)を参照。

## Cloudflare Containersのインフラ指標（#67）

API WorkerのCronが5分ごとに、配備先のvoiceとpreviewのemulateだけを収集する。追加の常時起動Containerは作らず、監視からContainerへのHTTP要求も行わない。localのCronは登録しない。本番・previewでは`TABLECAST_CONTAINER_METRICS_TOKEN`とGrafana送信資格`TABLECAST_OTEL_AUTHORIZATION`を必須とし、欠けた配備はWorkerへ書き込む前に拒否する。

- `TABLECAST_CONTAINER_METRICS_TOKEN`: 当該アカウントのAccount Analytics ReadとWorkers Containers Readだけを持つ専用トークン。GitHub Actions secretからAPIのsecretへ渡す。今回のトークン有効期限は2026年12月10日。更新後に配備して反映する。
- `TABLECAST_CLOUDFLARE_ACCOUNT_ID`と`TABLECAST_CONTAINER_METRICS_APPLICATIONS`: 配備設定から生成する。後者は当該Workerのapplication名のJSON配列。Containers REST APIの名前検索でIDを解決し、GraphQLの`applicationId_in`で絞る。
- Grafanaへの送信は既存`TABLECAST_OTEL_ENDPOINT`と`TABLECAST_OTEL_AUTHORIZATION`を使用する。トークンには`metrics:write`が必要。

公式の[`containersMetricsAdaptiveGroups`](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-container-metrics/)を使用し、課金用`containersUsageAdaptiveGroups`、DOの呼出し時間、Pythonのアプリspanとは区別する。CPU・メモリ・受信/送信bpsは5分窓の平均、ディスクと稼働時間は最大値。稼働時間はGraphQLスキーマのmsを秒へ変換する。Cloudflareが返す0は保持するが、空集合やnullを0に置き換えない。

例として14:30のCronは14:20以上14:25未満を取得する。5分遅延させた重ならない窓を使い、OTLPの時刻は元の窓の開始時刻を維持する。同じ窓を再実行しても別時刻へ複製しない。取得失敗や遅延到着を後から自動で埋め戻すことはしない。API要求は各10秒で打ち切り、1000行上限やGraphQLの部分失敗も失敗として扱う。

`infra/grafana/tablecast-containers.json`をGrafanaへimportし、Prometheus datasource・環境・PR番号（本番は`prod`）・Container名を指定する。CPU等にはCloudflare application・instance・placement・deployment IDを保持する。OTLPの`service.version`は収集WorkerのSHAであり、過去のContainerイメージのSHAを推測しない。過去の実行はCloudflare deployment IDで照合する。

```promql
# PRごとのメモリ。サンプルの元時刻で描画し、欠測を0で埋めない。
tablecast_container_memory_bytes{deployment_environment_name="preview",tablecast_pr_number="123"}
# 本番
 tablecast_container_cpu_utilization_ratio{deployment_environment_name="production",tablecast_pr_number="prod"}
# 収集停止またはGrafanaへの送信断（10分間heartbeatなし）
absent_over_time(tablecast_container_collector_success{deployment_environment_name="preview",tablecast_pr_number="123"}[10m])
# 収集自体が成功しても、Containerが停止中・無通信ならデータは来ない。
time() - last_over_time(tablecast_container_observed_timestamp_seconds{tablecast_pr_number="123"}[1h])
```

`collector_success=0`はCloudflare取得失敗、`collector_samples=0`は正常に取得した窓にサンプルがない状態。OTLPのHTTP失敗・部分拒否はCronを失敗させる。Grafana停止時にはsuccess=0自体も送れないため、heartbeat欠測とCloudflareのCron失敗を併用する。データ鮮度も表示し、値が来ないだけでContainer停止と断定しない。欠測検出クエリを提供するが通知先へのアラート登録は行っていない。

Grafana MCPの`query_prometheus`で同じPromQLを実行できる。Cloudのdatasource UIDは`grafanacloud-prom`、過去の窓を見るときは`queryType=range`と明示的なstart/end・stepを指定する。
