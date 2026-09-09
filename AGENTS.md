# TableCast PoC

> アイディア名 TableCast — 声で注文と接客を支える卓上AIキャスト テーマ ビジネス向けソリューション 公式サイトの現行表記では、企業向けAIエージェントに該当します。OpenAI 大学生向け 夏の Codex 開発祭 2026 現時点のプロジェクト案 TableCastは、飲食店の卓上iPadに導入し、注文、商品説明、接客を会話形式で支援するAIエージェントです。 一般的なモバイル・タブレット注文は画面操作を前提としており、デジタル機器に不慣れな人、酔って操作が難しい人、外国人観光客にとって使いにくい場合があります。また、食べ飲み放題の複雑なルール、アレルギーやヴィーガンへの対応、料理の成分や文化的背景の説明は、店舗スタッフにとっても大きな負担です。 本プロダクトは、騒音や複数人の会話がある店内でも発話者を区別し、利用客が声だけで注文できる体験を目指します。AIが希望や条件を聞き取り、商品を提案・説明し、注文確定前には必ず内容を読み上げて確認します。音声操作が難しい場合には、従来のタッチ式メニューも利用できます。 希望する店舗では、会話が途切れた際の商品紹介や話題提供を行う接客モードも有効化でき、来店客同士の交流と追加注文を促します。店舗向けWebダッシュボードでは、卓ごとの注文状況をリアルタイムに確認できるほか、匿名化した質問・注文ログから、人気商品、よくある質問、メニューや接客上の課題を把握できます。 主な想定ユーザーは、居酒屋、食べ飲み放題店、訪日客の多い飲食店や和菓子店などです。将来は、店舗情報と商品情報を登録するだけで導入できる仕組みを整え、話者ごとの注文管理や個別会計、ドライブスルー、電話注文などにも展開します。

## 最初に読む

[仕様索引](docs/README.md) → [着手順](docs/implementation.md) → 変更対象の仕様だけを読む。
実装・修正・レビューでは [.agents/skills/minimum-impl/SKILL.md](.agents/skills/minimum-impl/SKILL.md) を適用する。
本仕様は実装前の契約であり、ファイルの存在、検証成功、デプロイ完了を意味しない。既存コードがある場合は実物と差分を先に確認する。

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
Bunから公式CLIを起動する。Bunを採用してもWorkersの本番runtimeはworkerd、音声はPythonである。
実装後は対象のformat/lint/typecheck/testを実行し、必要な統合・ブラウザー試験へ広げる。
テスト失敗をskip、型キャスト、広いignore、恒久mockで隠さない。実モデル試験は明示的な有料テストとして分離する。
受入条件、未実施の検証、残るリスクを短く報告する。架空のPR番号、commit SHA、計測値を作らない。

## MCP/Agent付きフルスタックWebアプリの技術構成の参考

設計や設定の参考にすること。
https://github.com/ReoHakase/enterprise-agentic-saas-starter
[README](docs/enterprise-agentic-saas-starter.md)

API変更には `tablecast-api`、Web変更には `tablecast-web`、静的設定・skills変更には `tablecast-quality` を追加適用する。このリポジトリのskillsは `.agents/skills` に直接置く。外部skillsは `skills-lock.json` で取得元を管理する。

## タスク別入口

| 変更                   | 読むもの                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| UI・言語・音声停止     | [UI仕様](docs/ui.md)                                                |
| API・DB・認証          | [製品仕様](docs/product.md)、[構成](docs/architecture.md)           |
| 音声・Mastra接続・演技 | [接続](docs/voice/integration.md)、[発話仕様](docs/voice/speech.md) |
| fork・上流PR           | [パッチ方針](docs/voice/upstream-patch.md)                          |
| ローカル・worktree     | [開発環境](docs/development.md)                                     |
| 品質設定・テスト       | [静的解析](docs/static-analysis.md)、[テスト戦略](docs/testing.md)  |
