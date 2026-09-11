# TableCast PoC

日本酒の品揃えが多い和食居酒屋を題材にした、卓上iPad向けの音声接客・注文システム。客向けと店側の両方で日本語・英語を切り替えられる。

価格、販売可否、注文確定、店舗・卓の認可はHono APIが所有する。Mastraの業務ツールとGUI・MCPは同じ処理を使い、Python LiveKit Agentは音声接続を担当する。実決済やPOSへの接続は行わない。

## 開発を始める

[セットアップ手順](docs/setup.md)に、cloneからworktree作成、Dev Containerまたはmiseによる開発開始、env設定、動作確認、終了までをまとめている。

準備済みのworktreeでは次を実行する。

```sh
bun --no-env-file run setup
bun --no-env-file run dev
```

外部APIキーなしでGUI注文とローカル認証を利用できる。音声の設定はルートの `.env.example` を参照する。

## 構成

| 場所          | 役割                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| `apps/web`    | TanStack Start、shadcn、Base UI、Tailwind、Lucide、Simple Flags、Paraglide |
| `apps/api`    | Hono、Mastra、Better Auth、Drizzle、D1、Durable Objects、R2、Images、MCP   |
| `livekit`     | Python LiveKit Agent、OpenAI Realtime 2.1、Inworld TTS                     |
| `assets/demo` | 生成した商品画像12点、プロンプト、出所、SHA-256                            |
| `scripts`     | worktree内の開発環境と決定的な合成データ                                   |

## 検証と仕様

`bun run check` は静的解析と無課金テスト、`bun run test:browser` はUI部品、`bun run test:e2e` はケース専用環境の業務フローを検証する。必要な依存と実行条件は [セットアップ](docs/setup.md#5-日常の操作と検証)、保証の分担は [テスト戦略](docs/testing.md) を参照する。

[仕様索引](docs/README.md) · [開発環境の仕組み](docs/development.md) · [実装・検証記録](docs/progress.md) · [公開環境への配備](docs/deployment.md) · [デモ](docs/demo.md)
