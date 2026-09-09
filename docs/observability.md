# ログ・トレースとCodexからの調査

[索引](README.md) / [開発環境](development.md)

## 送信経路

Hono APIとTanStack StartのWorker入口を`@inference-net/otel-cf-workers`で計測する。StartのAPI proxyにもW3C trace contextを付け、APIのDrizzle D1・DO bindingと同じtraceへつなぐ。公開`@tablecast/api/telemetry`はWorker向けの設定・送信境界であり、ブラウザーからimportしない。

ローカルは公式`grafana/otel-lgtm:0.32.1`のOTLP/HTTP、previewとprodはGrafana CloudのOTLP gatewayへ送る。Cloudflare標準observabilityは既存のCloudflare調査用に維持し、同じログ・traceをCloudflare側のOTLP destinationから再送しない。

Honoは応答確定後に一つの構造化イベント`tablecast.request_completed`を出す。エラーも共通onError後のHTTP statusを記録する。既存の`X-Request-Id`とエラーJSONの`traceId`はリクエスト識別子として維持し、OTelの`trace_id`とは別に`tablecast.request.id`へ格納する。StartはAPI proxyとSSRを区別し、同じtraceにログを付ける。Honoの文字列loggerとconsole自動収集は重ねない。標準出力の構造化ログはリクエスト内で同期出力し、OTLP送信のみを後処理にする。

SDKの自動計測にはURL・SQL・ヘッダーが含まれるので、実際のexporterで許可属性のみ残す。resourceも固定した環境情報へ置換する。SQL本文、bind値、Authorization、Cookie、URL query、生の例外・stack、リクエスト本文、音声・会話・promptを送らない。任意の外部fetchへtrace contextを送らず、Web→APIのservice bindingだけへ明示伝播する。検証対象は独自の送信境界と実際の注文経路であり、SDK内部の動作をテストへ複製しない。

preview/localはtraceを100%、prodは親の判断を引き継ぐ10%のhead samplingにする。ログはリクエスト単位で保持するため、prodではtraceのないログもある。送信はSDKの`waitUntil`で処理し、注文結果をexportの成功に依存させない。Collector停止・再起動時の配送はbest effortであり、業務イベントの永続化は従来どおりD1が所有する。

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

`infra/grafana/codex.toml.example`のMCP項目をローカル`.codex/config.toml`へ追加する。既存設定は維持する。Codexは信頼済みプロジェクトの設定を読むため、設定追加後はMCPを再接続する。公式`grafana/mcp-grafana:1.3.0`をstdio・`--disable-write`で動かす。

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
