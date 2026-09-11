# TableCast PoC

TableCastは飲食店の卓上iPad向け音声接客・注文システム。目的と対象は [製品仕様](docs/product.md)、現在の構成は [構成仕様](docs/architecture.md) を正本とする。

## 最初に読む

[セットアップ](docs/setup.md)で作業環境を確認し、[仕様索引](docs/README.md) → [着手順](docs/implementation.md) → 変更対象の仕様を読む。実施済みの検証と残件は [進捗](docs/progress.md)、完了判定は [受入条件](docs/acceptance.md) を参照する。
実装・修正・レビューでは [.agents/skills/minimum-impl/SKILL.md](.agents/skills/minimum-impl/SKILL.md) を適用する。
本仕様は実装前の契約であり、ファイルの存在、検証成功、デプロイ完了を意味しない。既存コードがある場合は実物と差分を先に確認する。

## GitHubの作業契約

全ての作業はIssue起点にする。機能追加・修正・調査・文書・設定変更だけでなく、新規バグ発見、障害対応、暫定復旧、再発防止も含む。着手前に既存Issueを確認し、なければ起票する。作業中に別の問題を見つけた場合もIssueへ記録し、現在の受け入れ条件に含まれるかを判断してから対応する。

[Issue・PR運用skill](.agents/skills/github-issue-pr-ops/SKILL.md) を適用し、次を省略しない。

- 一つの利用可能な成果と確認方法でレビューできる粒度へ分割する。大きい成果はepicとsub-issueにし、実依存にはGitHubのblocked by／blockingを設定する。本文のリンクだけで関係を代用しない。
- 原則 `1 実装Issue = 1 branch = 1 PR`。依存する変更は [stacked PR](.agents/skills/github-issue-pr-ops/references/stacked-prs.md) とし、下段のheadを上段のbaseにする。独立した変更は通常PRにする。sub-issueは成果の階層、blocked byは作業を妨げる実依存、Stackはレビューと統合の順序として使い分ける。
- 着手・再開時にAssigneeと既存branch・PRを取得する。未割当なら自分を割り当てて再確認し、他の担当がいる場合は明示された引き継ぎに従う。依存変更・障害・中断・再開・引き継ぎの判断は [ライフサイクル](.agents/skills/github-issue-pr-ops/references/lifecycle-comments.md) に沿ってIssueへ残す。
- IssueとPRの両方に主目的の既存ラベルを付ける。Issue本文に背景・成果・受け入れ条件・確認方法、PR本文に具体的な問題・変更後の動作・採用理由・検証結果・未実施範囲を書く。日本語は常体、CLIでは `--body-file` を使う。[Issue本文](.agents/skills/github-issue-pr-ops/references/issue-authoring.md) と [PR本文](.agents/skills/github-issue-pr-ops/references/pr-and-merge.md) に従う。
- 画像・動画・ログ等は [添付手順](.agents/skills/github-issue-pr-ops/references/attachments.md) に従ってGitHubへアップロードする。UI・利用者の操作が変わる場合は実動作の画像か動画を関連説明に埋め込み、短いキャプションを付ける。秘密情報を除き、投稿後の表示・再生まで確認する。
- リポジトリに紐付く既存ProjectsへIssue・epicを追加し、全件のPriorityと実態に合うStatusを設定・更新する。関連PRはIssueから参照し、同じ作業の項目を重複作成しない。[Projects skill](.agents/skills/github-project-ops/SKILL.md) に従い、既存フィールドの意味・選択肢を確認する。
- 新規PRはDraft。対応する実装Issueだけを `Closes #123` 等で関連付け、epicや参照Issueを一括で閉じない。書き込み後に本文・ラベル・担当・sub/依存・Projects・Stackのbase/headを再取得して確認する。Draft解除とマージは許可された範囲で行う。

## 目的と実装規模

TableCastは飲食店の卓上iPad向け音声接客・注文システム。客向けと店側UIの両方を日本語・英語に対応させる。
PoCでも、このリポジトリを継続して本実装に使う。安全性、認可、移行、必要なテストを削って短くしない。
標準機能、既存実装、公式プラグインを先に使い、要件を満たした最初の手段で止める。将来用の抽象化は作らない。

## 文体と命名

- 自作のコメント、docstring、Markdown文書、テスト名・ケース説明・parametrizeの表示名は日本語で書く。識別子は原則英語。pytestのテスト名には日本語を使用してよい。
- APIのキー、ライブラリ固有名、Inworldの英語演技タグ、利用客向け英語文言はその仕様の言語を使う。上流既存コードを翻訳するだけの変更をしない。
- 英語UI・接客文はイギリス英語を基本とする。コードの識別子は一般的な米国英語の綴りでよい。
- 開発用リソース、ホスト、環境変数、workspace名、独自スクリプトは `tablecast` を含める。`tc` に省略しない。通常の `cartId` 等まで冗長に改名しない。
- 日本語文書で強調のためにかぎ括弧・二重引用符を使わない。引用、コード、API構文には必要な記号を使う。

## 固定する構成

- Bun workspaces + Turborepo。JS依存はルート `bun.lock`、Pythonは `livekit/pyproject.toml` と `livekit/uv.lock`。
- `apps/web`: TanStack Start、Base UI、日英UI。Storybookは `apps/web/.storybook`、Storyは部品に隣接。
- `apps/api`: Hono、Mastra、Better Auth、Drizzle、D1、DO、R2、Images、MCP。DBと業務判断の所有者。
- `livekit`: Python LiveKit Agent、OpenAI Realtime 2.1音声入力・テキスト出力 + Inworld TTSのhalf-cascade。uv、ty、ruff、pytestを使用。
- 初期実装では `packages/domain`、`packages/contracts`、`packages/ui`、`apps/storybook` を作らない。
- ゲーム、Custom Voice、別モデルへの自動切替、実決済、POS本接続、本人識別は対象外。

## UIのスタイルと責務

- 原則Tailwindの標準utilityをコンポーネントTSX内に記述する。`styles.css`はトークンと最小限の全体既定値に限定する。
- 固定値を任意値へ写すだけの移行や、値ごとのトークン化をしない。標準の余白・文字サイズ・角丸・ブレークポイント、意味のある共通色を先に使う。
- `components/ui`は業務を知らないプリミティブ、`components`はアプリ共通表示、`features`は業務状態・操作を所有する。実際に共有する見た目は部品や既存CVAのvariantへまとめる。

## 破ってはいけない条件

- 価格・売切・プラン・権限・注文確定はAPIで判断する。LLM入力を権限や金額の根拠にしない。
- GUI・音声・MCPで同じ業務操作を共有する。Pythonへ業務ツールや価格計算を複製しない。
- 注文は版付きスナップショットと明示承認が必要。中断はDBのロールバックではない。
- 音声停止は再生停止だけでなく送音・STT・応答生成の停止を含む。明示再開まで勝手に再接続しない。
- 音声が停止してもGUI・カート・会計状態を維持する。客向けの自由文テキスト入力は作らない。
- 店舗・卓の境界を必ず認可する。ログに秘密情報を出さず、生音声を既定保存しない。
- D1の読み書きとfixtureは既存schemaを使ったDrizzleに統一する。`env.TABLECAST_DB.prepare()`などの直接操作を新設しない。複数操作は`db.batch()`を使う。生SQLはmigration・PRAGMA・query builderで表現できないクエリに限定する。
- Inworld公式プラグインの不足は最小パッチとSHA固定で補う。独自STTクライアント、private monkeypatch、site-packages編集は禁止。

## 作業と検証

変更前に対象workspaceのmanifest、公開入口、呼出し元、関連テスト、現在のGit差分を確認する。
ロックファイルとDBマイグレーションは統合担当が調整し、他worktreeの生成状態やプロセスを操作しない。
標準CLIと実行内容をpackage.jsonへ直接記述する。タスクの順序・並列・常駐・cacheはTurborepo、コンテナ資源はDev Container/Composeで管理する。標準機能を包むだけの.sh・.ts、独自daemon・汎用runnerを増やさない。Pythonはuvから直接起動し、envもuv --env-fileで読む。Bunのenv解決や資格の転送に依存させない。Workersの本番runtimeはworkerd、音声はPythonである。
実装後は対象のformat/lint/typecheck/testを実行し、必要な統合・ブラウザー試験へ広げる。
開発ツールの版、依存導入、envとexample、dev scripts、devcontainerを変更したら [setup.md](docs/setup.md) を同じ差分で更新する。READMEからの導線と関連文書も確認し、手順の重複を増やさない。
テスト失敗をskip、型キャスト、広いignore、恒久mockで隠さない。実モデル試験は明示的な有料テストとして分離する。
受入条件、未実施の検証、残るリスクを短く報告する。架空のPR番号、commit SHA、計測値を作らない。

## MCP/Agent付きフルスタックWebアプリの技術構成の参考

設計や設定の参考にすること。
https://github.com/ReoHakase/enterprise-agentic-saas-starter
[README](docs/enterprise-agentic-saas-starter.md)

API変更には `tablecast-api`、Web変更には `tablecast-web`、静的設定・skills変更には `tablecast-quality` を追加適用する。このリポジトリのskillsは `.agents/skills` に直接置く。外部skillsは `skills-lock.json` で取得元を管理する。

## タスク別入口

| 変更                   | 読むもの                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| UI・言語・音声停止     | [UI仕様](docs/ui.md)                                                                                  |
| API・DB・認証          | [製品仕様](docs/product.md)、[構成](docs/architecture.md)                                             |
| 音声・Mastra接続・演技 | [接続](docs/voice/integration.md)、[発話仕様](docs/voice/speech.md)                                   |
| fork・上流PR           | [パッチ方針](docs/voice/upstream-patch.md)                                                            |
| ローカル・worktree     | [セットアップ](docs/setup.md)、[開発環境](docs/development.md)、[Dev Container](docs/devcontainer.md) |
| 品質設定・テスト       | [静的解析](docs/static-analysis.md)、[テスト戦略](docs/testing.md)                                    |

認証は [authentication.md](docs/authentication.md)、デモは [demo.md](docs/demo.md)、MCPは [mcp.md](docs/mcp.md)、Codex接続は [codex-plugin.md](docs/codex-plugin.md)、ログ・traceは [observability.md](docs/observability.md)、公開環境は [deployment.md](docs/deployment.md) を読む。
