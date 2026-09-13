# ログ・トレースとCodexからの調査

音声をブラウザー直結のGPT-Liveと標準Responses delegationへ移行しても、APIのOTel/GrafanaとD1の業務イベントを維持する。GPT-Liveの字幕は雑談を含めて保存し、backend回答を発話済み本文として二重保存しない。以下に残る旧音声構成の検証履歴は、新構成の遅延・再生完了の証拠にしない。生音声の既定保存は無効のままとする。

[索引](README.md) / [開発環境](development.md)

## 送信経路

Hono APIとTanStack StartのWorker入口を`@inference-net/otel-cf-workers`で計測する。StartのAPI proxyにもW3C trace contextを付け、APIのDrizzle D1・DO bindingと同じtraceへつなぐ。公開`@tablecast/api/telemetry`はWorker向けの設定・送信境界であり、ブラウザーからimportしない。

span送信はOpenTelemetry標準の`BatchSpanProcessor`を使い、待機queueを512件、送信batchを64件に制限する。Worker入口の`waitUntil`で送信を完了し、完了済みtraceを保持し続けず、別要求のflushで実行中の音声spanを強制終了しない。秘匿化は既存exporter境界を通す。

ローカルは公式`grafana/otel-lgtm:0.32.1`のOTLP/HTTP、previewとprodはGrafana CloudのOTLP gatewayへ送る。Cloudflare標準observabilityは既存のCloudflare調査用に維持し、同じログ・traceをCloudflare側のOTLP destinationから再送しない。

Honoは公式の[Middleware execution order](https://hono.dev/docs/guides/middleware#execution-order)に従い、`await next()`後の`c.error`と最終レスポンスを読む。`HTTPException.getResponse()`で4xxの本文・ヘッダーを維持し、5xxの内部本文だけを汎用JSONへ置換する。Better Authは`onAPIError.throw`で共通onErrorへ渡す。4xxはwarn、5xxはerror、通常応答はinfoにする。

Honoは応答確定後に一つの構造化イベント`tablecast.request_completed`を出す。エラーも共通onError後のHTTP statusを記録する。既存の`X-Request-Id`とエラーJSONの`traceId`はリクエスト識別子として維持し、OTelの`trace_id`とは別に`tablecast.request.id`へ格納する。StartはAPI proxyとSSRを区別し、同じtraceにログを付ける。Honoの文字列loggerとconsole自動収集は重ねない。標準出力の構造化ログはリクエスト内で同期出力し、OTLP送信のみを後処理にする。

SDKの自動計測にはURL・SQL・ヘッダーが含まれるので、実際のexporterで許可属性のみ残す。resourceも固定した環境情報へ置換する。Authorization、Cookie、URL queryは送らない。顧客情報・SQL・例外・業務入出力は末尾の環境変数で切り替える。例外診断は`platform/diagnostics.ts`で秘密値を除去し、message、ファイル名と行・列、最大5段のcauseを保持する。本文収集が無効ならSQL wrapper・URL・引用値・メールアドレスを伏せ、providerのcauseは型と位置だけを残す。有効ならproviderのmessage・顧客情報も収集するが、資格情報は常に除く。未知の自由文すべてを自動検出する仕組みではない。送信境界は本文収集が無効でも処理済みの診断属性とexception eventを保持する。任意の外部fetchへtrace contextを送らず、Web→APIのservice bindingだけへ明示伝播する。検証対象は独自の送信境界と実際の注文経路であり、SDK内部の動作をテストへ複製しない。

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

`bun run dev`でworktree専用のLGTMも起動する。ポートは`.local/runtime.json`の`grafana`・`otlp`・`tempo`に記録する。Docker volume `tablecast-<worktree ID>-lgtm`にデータを保持し、WebはTurboのターミナルでCtrl+C、Dockerサービスは `bun run services:down` で停止する。この操作は自worktreeのcontainerとnetworkを片付け、volumeを保持する。Dev ContainerはComposeの`tablecast-lgtm`を使う。

LGTMのサービス定義はルート `compose.yaml` を正本とし、Dev Containerからも参照する。`infra/grafana/tempo.yaml` はTempoの実行設定、`infra/grafana/dashboards/` はGrafanaへimportするJSONである。

LGTMは開発用で、host公開はloopbackに限定する。Grafanaは匿名Viewer、設定変更用の初期ログインは`admin` / `admin`。Tempoの読み取りMCPは同梱設定で有効にする。

`.codex/config.toml.example`のMCP項目をローカル`.codex/config.toml`へ追加する。既存設定は維持する。Codexは信頼済みプロジェクトの設定を読むため、設定追加後はMCPを再接続する。公式`grafana/mcp-grafana:1.3.0`をstdio・`--disable-write`で動かす。Dev Containerでは同じイメージのbinaryを直接実行し、localはCompose内の`tablecast-lgtm:3000`へ接続する。ホストではDockerから起動する。Dockerfile変更後はDev Containerをrebuildする。

CloudはGrafanaで作成したViewer service account tokenを`.local/tablecast-grafana-read-token`へ改行なしで保存し、`chmod 600`を設定する。送信用Cloud access policy tokenと読み取り用service account tokenを共用しない。Cloudの送信AuthorizationはGitHub Actions secret `TABLECAST_OTEL_AUTHORIZATION`からAPIとWebへ渡す。Viteの公開varsやGitには含めない。今回の送信tokenは90日で失効するため、期限前にGrafanaで更新して同じsecretを入れ替える。

専用のクエリscriptを置かず、[公式MCP Inspector CLI](https://github.com/modelcontextprotocol/inspector/blob/main/clients/cli/README.md)で同じMCPを確認する。`local` を `cloud` に変えるとCloudを対象にする。

```sh
bunx @modelcontextprotocol/inspector@2.6.0 --cli bun --no-env-file scripts/tablecast-grafana-mcp.ts local -- --method tools/list
bunx @modelcontextprotocol/inspector@2.6.0 --cli bun --no-env-file scripts/tablecast-grafana-mcp.ts local -- --method tools/call --tool-name query_loki_logs --tool-arg datasourceUid=loki --tool-arg 'logql={service_namespace="tablecast"}' --tool-arg limit=5
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

`infra/grafana/dashboards/tablecast-operations.json`をGrafanaのImport dashboardで読み込む。Loki datasource、環境、PR番号、サービスを選ぶ。PR番号の`.*`は全件、`123`はそのPRだけを対象にする。APIを既定サービスとし、Web proxyとAPIの件数を重複合算しない。

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

秘匿化に使う秘密値は本文全体につき一度だけ環境設定から取得する。計測済みの環境設定を各文字列で列挙すると、D1などのbindingのProxyを大量に生成するためである。JSONオブジェクト・配列の候補だけを解析し、通常文での例外生成も避ける。入れ子のJSON文字列と通常文の資格除去、本文の保持は共通の送信境界で検証する。

## GPT-LiveとResponsesの相関

voice session / アプリのturn / tool call IDとHTTP traceを区別して記録する。tablecast.voice.tool spanはHonoでの認可・SQL・実行・結果保存の区間であり、OpenAI内部の推論時間ではない。tool.output_bytesは実際に返したJSONのbyte数で、token数の推測値として使わない。

ブラウザーでsession.delegation.createdとresponse.created / response.completed、tool HTTP、入力音声終了、出力音声を同じ時計で測る。モデルusageはresponseイベントのusageから取得し、cached・cache write・outputを分ける。推論完了・字幕到着・実再生は異なる。

D1はspanとsql_duration_msを分け、取得できる場合にserved_by_region / served_by_primary / total_attemptsも残す。差分を純粋なネットワークRTTと断定しない。属性の許可だけでは、bindingやadapterが返さないmetadataを取得できた証拠にはならない。
