# TableCast PoC

日本酒の品揃えが多い和食居酒屋を題材にした、卓上iPad向けの音声接客・注文システム。客向けと店側の両方で日本語・英語を切り替えられる。

価格、販売可否、注文確定、店舗・卓の認可はHono APIが所有する。Mastraの業務ツールとGUI・MCPは同じ処理を使い、Python LiveKit Agentは音声接続を担当する。実決済やPOSへの接続は行わない。

## ローカル起動

Bun 1.3.13、Node.js 24.7以上、uv 0.11.26、Python 3.13、稼働中のDocker互換エンジンが必要。

```sh
bun --no-env-file install --frozen-lockfile --ignore-scripts
uv sync --project livekit --locked
bun --no-env-file run dev:prepare
bun --no-env-file run dev
```

初回準備で、このworktree専用のポート・秘密情報・D1・R2・デモを作る。表示されたURLが客向け画面で、店舗側は同じURLの `/admin/live`。ログイン情報は生成された `.local/demo.json` にある。管理者でログインし、客向け画面の端末コードを対象の卓へ割り当てる。

外部資格なしでGUI注文、受付・提供、模擬会計、設定の下書き・公開を試せる。音声は未設定として扱い、勝手に外部サービスへ接続しない。既存の `.env.local` は開発ランタイムへ引き継がない。

```sh
bun --no-env-file run dev:status
bun --no-env-file run demo:play
bun --no-env-file run demo:reset
bun --no-env-file run dev:stop
```

`demo:play` は背景卓を一段階だけ進める。T01は人の操作、T12はブラウザー試験に残す。`demo:reset` はこのworktreeのプロセスを止め、同じプロファイルの営業初期状態へ戻す。デモ管理者のパスワードは維持する。

`demo:reset --profile smoke|demo|history` でプロファイルを切り替えられる。

## 構成

| 場所          | 役割                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| `apps/web`    | TanStack Start、shadcn、Base UI、Tailwind、Lucide、Simple Flags、Paraglide |
| `apps/api`    | Hono、Mastra、Better Auth、Drizzle、D1、Durable Objects、R2、Images、MCP   |
| `livekit`     | Python LiveKit Agent、Inworld公式STT/TTSプラグイン                         |
| `assets/demo` | 生成した商品画像12点、プロンプト、出所、SHA-256                            |
| `scripts`     | worktree内の開発環境と決定的な合成データ                                   |

## 検証

```sh
bun --no-env-file run check
bun --no-env-file run build
bun --no-env-file apps/web/node_modules/.bin/playwright install chromium webkit
bun --no-env-file run test:browser
bun --no-env-file run test:e2e
bun --no-env-file run dev:parity
bun --no-env-file run test:e2e
```

`test:e2e` は起動済みのローカル環境を使い、T12を実際の業務APIから操作する。`dev:parity` は開発モードを終了し、ビルド済みWebとAPIをWranglerのService Bindingで接続する。通常モードへ戻すには `bun --no-env-file run dev`。

```sh
bun --no-env-file run hooks:install
bun --no-env-file run storybook
```

Lefthookはstageされたファイルだけを検査し、自動stageは行わない。CIも無課金の静的解析、実D1・DOの試験、UI部品、日英のブラウザー試験を実行する。有料の実音声試験はCIに含めない。

## 外部音声の設定

後続の実音声受入では `.env.secrets.local.example` を参照し、ルートの `.env.secrets.local` へ開発専用のInworld・モデル資格を配置する。秘密値はGitやチャットへ記録しない。カタログのキャスト設定に日英のVoice IDを登録・公開してから、開発環境を再起動する。

実モデル試験には明示的な有料実行フラグが必要。[音声の起動と試験](livekit/README.md)に従う。Inworld公式版の話者情報には不足があり、[固定SHAのパッチ](patches/livekit-inworld/README.md)はまだ公開fork依存として採用していない。

[仕様索引](docs/README.md) · [実装・検証記録](docs/progress.md) · [構成の実現可能性と技術課題](docs/feasibility.md) · [デモのデータと画像](docs/demo.md)
