# TableCast 実装用仕様索引

版: **0.3** / 更新日: **2026-09-06** / 状態: **実装開始用、アプリ本体は未同梱**

この一式はリポジトリ直下へ展開する。ZIP内に余分な親ディレクトリはない。既存リポジトリではAGENTS.md・ignore設定を差分マージし、既存の指示を無条件に消さない。
Codexは [AGENTS.md](../AGENTS.md) と [着手順](implementation.md) から開始する。

## 最新の決定

客向け・店側UIとも日英対応。客向けは会話領域を主役にし、会話ログ、言語選択、音声停止・再開を常設する。自由文入力は置かない。
Web/APIを2 Workersに保ち、Python音声Agentだけ別runtimeへ置く。Bun + Turborepoを使い、業務・契約・UIを名目だけの共有packageに切り出さない。
音声はInworldへ統一し、公式LiveKitプラグインへの必要最小パッチを採用する。既定ペルソナは親しみと丁寧さ、愛嬌を持つ若い成人女性の飲食店スタッフとする。

## 文書一覧

| 文書 | 所有する仕様 |
|---|---|
| [製品と業務](product.md) | 対象、認証、注文、カスタマイズ、プラン、会計、安全性 |
| [画面と国際化](ui.md) | 大きな会話領域、停止再開、日英キオスク・管理画面 |
| [構成とディレクトリ](architecture.md) | 2 Workers、依存方向、最小のファイル配置、公開契約 |
| [音声接続](voice/integration.md) | Mastra・Hono・Python LiveKit、履歴、中断、エコー |
| [発話とInworld書式](voice/speech.md) | ペルソナ、読み、つなぎ言葉、感情・非言語音・間 |
| [上流パッチ](voice/upstream-patch.md) | 公式plugin、fork、commit固定、PR、削除条件 |
| [店舗ChatGPTとMCP](mcp.md) | メニュー・翻訳・接客設定、下書きと公開 |
| [ローカル・worktree](development.md) | Bun、Wrangler、単一オリジン、ポート、秘密情報 |
| [テスト戦略](testing.md) | 最も小さい検証境界、Storybook、API、音声、E2E |
| [静的解析と設定](static-analysis.md) | Oxlint、Oxfmt、型検査、Lefthook、依存管理 |
| [Seedとデモ](demo.md) | 現実的な合成データ、録画、再現性、リセット |
| [実装の順序](implementation.md) | Codexの開始プロンプト、段階、並列担当、検証ゲート |
| [受入条件](acceptance.md) | 完成判定とリリース前の必須シナリオ |
| [参照・採否](sources.md) | 公式資料、スターターから残したものと外したもの |
| [梱包の検証](handoff-validation.md) | このZIP自体の検査と未実施範囲 |

## 0.2からの変更

| 旧仕様 | 本版 |
|---|---|
| 店側日本語固定 | 管理画面、状態、エラー、メール認証画面も日英 |
| 小さなVoice Dock | 会話と音声操作に初期表示の約60%を確保 |
| 音声停止の意味が曖昧 | 送音・認識・生成・再生を停止、カートとログは保持 |
| pnpm、tcの開発識別子 | Bun、tablecastの識別子 |
| domain/contracts/uiの共通package | 所有アプリへ集約、実在する公開境界だけ共有 |
| 独立Storybookアプリ | Web内の開発・テスト設定 |
| ローカルでもExpressive Modeを前提 | 直接plugin＋Inworld書式。Inference限定機能は必須にしない |
| 汎用スターターの多数の層・skills | 少数の目的別ファイルと4つの短いskill |

## 同梱範囲

AGENTS.md、docs、4つのrepo-local skill、.gitignore、.worktreeincludeのみを同梱する。
package.json、lockfile、アプリコード、適用済みパッチ、画像、DB、起動スクリプトはこれから実装する。旧版の実測Seed件数・テスト成功を本版の実装成果として引き継がない。
文書中のコマンドは、着手時に作る公開scriptの契約である。現段階で実行可能とは扱わない。
