# 🚀 Enterprise Agentic SaaS Starter

組織, 権限, 監査, 認証付きファイル, メール, 可観測性, 製品Agentを備えた、
マルチテナントSaaSのスターターです。デモの業務領域は小さく保ちながら、本番運用を
前提とした境界と品質検査を実装しています。

開発環境, 設計, セキュリティ, テスト, デプロイの詳細は
[`docs/README.md`](docs/README.md)から参照できます。

> [!IMPORTANT]
> このリポジトリはUIのサンプルだけではありません。テナント分離, サーバー側認可,
> 監査, 機密情報の非漏洩, 決定的なテストを製品要件として扱います。

## ✨ 主な機能

- 🔐 Better Authによるマジックリンク, パスキー, GitHub OAuth, 組織セッション
- 🏢 組織を境界とするIssue, メンバー, 添付ファイル, 監査
- 🤖 非公開のMastra Agent Workerと、ストリーミング対応のAgent UI
- 🛠️ 読み取りツール, 明示的な承認を伴うIssue書き込み, Web検索, 画像入力
- 🔌 OAuth認証付きremote MCPと、業務ツール, prompt, resource, MCP Inspector
- 💬 Agentの会話, メンション, ページコンテキスト, 使用量, コンテキスト上限の表示
- 🗄️ Cloudflare R2, Images, Cacheを使う認証付きファイル配信
- ✉️ React Email, Mailpit, Cloudflare Email Sendingによるメール配送
- 📈 OpenTelemetryとGrafana LGTMによる、開発用のログ・メトリクス・トレース
- ✅ Oxlint, Oxfmt, Knip, jscpd, Vitest, Storybook, Playwrightによる品質検査

## 🏗️ システム構成

製品Agentは公開APIの内側に置きます。ブラウザーからAgent Workerへ直接接続せず、
Service Bindingだけを認証・認可の根拠にしません。

```text
ブラウザー
  └─ Web Worker
       TanStack Start / Agent UI
       └─ 認証付きHTTP
          API Worker
          Better Auth / 認可 / DB / R2 / 使用量
            ├─ AGENT_RUNTIME Service Binding
            │    Agent Worker
            │    Mastra / モデル / ツール / ストリーム
            └─ AGENT_INTERNAL_API named entrypoint
                 非公開Elysia / Drizzle / ドメインサービス
```

Agent WorkerはTurso, Better Auth, R2, Webを直接参照しません。APIが短命な権限証票,
現在有効な組織メンバーシップ, ツール権限, 冪等性, 監査を毎回検証します。Issueを変更する
ツールは、利用者の承認後もAPI側の認可を通過した場合だけ実行されます。詳細は
[`apps/agent`の設計](docs/architecture/apps/agent.md)と
[製品Agentのセキュリティ](docs/agent/architecture-security.md)を参照してください。

## 🧰 技術構成

| 領域         | 採用技術                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| ランタイム   | Bun `1.3.13`, Cloudflare Workers                                                                             |
| モノレポ     | Bun workspaces, Turborepo                                                                                    |
| Web          | TanStack Start `1`, Vite `8`, React `19`, Tailwind CSS `4`, shadcn/Base UI, TanStack Query/Form/Table, Jotai |
| API          | Elysia, Eden, Valibot Standard Schema, envin                                                                 |
| Agent        | Mastra, Vercel AI SDK, OpenRouter, Cloudflare Service Binding                                                |
| 認証         | Better Auth, マジックリンク, パスキー, 組織プラグイン, GitHub OAuth                                          |
| データベース | Turso/libSQL, Drizzle ORM, Drizzle Kit                                                                       |
| ファイル     | Cloudflare R2, Images, Workers Cache                                                                         |
| メール       | React Email, Mailpit, Cloudflare Email Sending                                                               |
| 可観測性     | OpenTelemetry, Grafana LGTM, Grafana MCP                                                                     |
| 品質         | Oxlint, Oxfmt, Knip, jscpd, Vitest, Storybook, Playwright                                                    |

依存関係の版はルートの`workspaces.catalog`で固定しています。外部依存には`catalog:`、
リポジトリ内の依存には`workspace:*`を使います。

## 🗂️ ワークスペース

```text
apps/
  web/                 TanStack Start, Cloudflare Workers, ドメインUI, Agent UI
  api/                 公開API, 非公開Agent制御面, 認可, 業務トランザクション
  agent/               Mastra Agent, モデル, ツール, ストリーム
  emulate/             ローカルとE2E用の外部サービスemulator

packages/
  agent-contracts/     Agent, API, Webが共有するValibot業務contract
  auth/                Better Authのサーバー, ブラウザークライアント
  db/                  Drizzleスキーマ, マイグレーション, DBクライアント
  email/               React Emailテンプレート, 配送`adapter`
  ui/                  ドメイン非依存の共通UI
  typescript-config/   共通TypeScript設定
```
