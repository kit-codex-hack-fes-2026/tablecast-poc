# TableCast PoC

TableCastは飲食店の卓上iPad向け音声接客・注文システム。客向け・店側とも日本語と英語に対応する。目的は[製品仕様](docs/product.md)、責務と採用構成は[構成仕様](docs/architecture.md)を正本とする。

## 作業の入口

変更に関係する入口を選ぶ。誤字修正などで全仕様や全skillを読む必要はない。仕様は契約であり、実装・検証・配備の証拠ではないため、対象の実物と現在の差分を確認する。

| 作業                                     | 判断と参照先                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| コードの実装・設計・リファクタ・レビュー | [minimum-impl](.agents/skills/minimum-impl/SKILL.md)                                                                                                                                 |
| API・DB・業務操作                        | [tablecast-api](.agents/skills/tablecast-api/SKILL.md)。認証は[authentication.md](docs/authentication.md)、MCPは[mcp.md](docs/mcp.md)、デモは[demo.md](docs/demo.md)                 |
| Web・SSR・フォーム・UI                   | [tablecast-web](.agents/skills/tablecast-web/SKILL.md)と[UI仕様](docs/ui.md)                                                                                                         |
| テストの設計・変更                       | [fullstack-web-testing](.agents/skills/fullstack-web-testing/SKILL.md)。runnerと環境は[テスト戦略](docs/testing.md)                                                                  |
| 静的設定・skills・hooks                  | [tablecast-quality](.agents/skills/tablecast-quality/SKILL.md)                                                                                                                       |
| Issue・PRの作成・更新                    | [github-issue-pr-ops](.agents/skills/github-issue-pr-ops/SKILL.md)。PR本文の正本は[PRテンプレート](.github/pull_request_template.md)                                                 |
| Projectsの登録・更新                     | [github-project-ops](.agents/skills/github-project-ops/SKILL.md)                                                                                                                     |
| 環境構築・agent plugins・MCP接続         | [セットアップ](docs/setup.md)。worktree・起動は[開発環境](docs/development.md)、コンテナは[Dev Container](docs/devcontainer.md)、製品pluginは[codex-plugin.md](docs/codex-plugin.md) |
| 音声接続・Mastra・演技                   | [接続](docs/voice/integration.md)と[発話仕様](docs/voice/speech.md)。上流変更は[パッチ方針](docs/voice/upstream-patch.md)                                                            |
| 性能診断・公開配備                       | [観測手順](docs/observability.md)、配備時は[deployment.md](docs/deployment.md)                                                                                                       |
| 計画・完了判定                           | [着手順](docs/implementation.md)、[進捗](docs/progress.md)、[受入条件](docs/acceptance.md)。他の仕様は[索引](docs/README.md)から探す                                                 |

## 作業契約

全ての作業はIssue起点とする。既存Issue・Assignee・branch・PRを確認し、なければ起票する。新しく見つけた問題もIssueへ記録し、依頼範囲に含まれるか判断する。分割・担当・ラベル・Projects・Draft・本文・添付・マージの運用は上記GitHub skillsへ集約する。

依頼範囲内の実装、検証、そこで見つかった不備の修正まで進める。既に許可された可逆的な作業や隔離されたローカル検証のたびに確認を挟まない。デプロイ・有料モデル・Draft解除・マージは許可された範囲で行う。

他worktreeの生成状態・プロセス・コンテナは、下記のマージ後の終了処理を除き操作しない。ロックファイルとDBマイグレーションは統合担当が調整する。変更に関係しない作業ツリーの差分を保つ。

## 製品とデータの不変条件

- 価格・売切・プラン・権限・注文確定はAPIで判断する。LLM入力を権限や金額の根拠にしない。
- GUI・音声・MCPで同じ業務操作を共有する。Pythonへ業務ツールや価格計算を複製しない。
- 注文は版付きスナップショットと明示承認が必要。中断はDBのロールバックではない。
- 音声停止は再生・送音・STT・応答生成を止め、明示再開まで再接続しない。GUI・カート・会計状態は維持し、客向けの自由文テキスト入力は作らない。
- 店舗・卓の境界を認可する。秘密情報をログへ出さず、生音声を既定保存しない。
- D1の読み書きとfixtureは既存schemaとDrizzleを使う。直接の`prepare()`を新設せず、複数操作は`db.batch()`、生SQLはmigration・PRAGMA・query builderで不足する部分に限る。
- 上流pluginの不足は最小パッチとSHA固定で補う。独自STTクライアント、private monkeypatch、site-packages編集をしない。
- ゲーム、Custom Voice、別モデルへの自動切替、実決済、POS本接続、本人識別は対象外。初期構成に汎用のdomain/contracts/ui packageや別Storybook appを追加しない。

## 配置と表現

Bun workspacesとTurborepoを使う。`apps/api`がDBと業務判断、`apps/web`がTanStack StartとUI、`livekit`がPython音声を所有する。依存の正本はrootの`bun.lock`と`livekit/pyproject.toml`・`uv.lock`。実CLIはpackage scripts、順序・並列・cacheはTurbo、資源はCompose、Pythonの実行とenvはuvへ任せる。

Webは標準Tailwind utilityをTSXへ置き、`styles.css`はトークンと最小限の全体既定値に限定する。`components/ui`は業務非依存、`components`は共通表示、`features`は業務状態・操作を所有し、共通の見た目は既存部品・Tailwind Variantsを使う。StorybookはWeb内、Storyは部品へ隣接させる。

自作skillは`.agents/skills`に直接置き、外部skillの取得元は`skills-lock.json`で管理する。外部の本文を翻訳・整形するだけの変更をしない。参考構成の採否は[参照リポジトリ](docs/enterprise-agentic-saas-starter.md)に記載する。

- 自作コメント・docstring・文書・テスト名は日本語、識別子は原則英語。APIキー・ライブラリ固有名・利用客向け英語は各仕様の言語を使う。
- 英語UI・接客文はイギリス英語、コード識別子は一般的な米国英語の綴りでよい。
- 開発用リソース・ホスト・環境変数・workspace・独自script名は`tablecast`を含め、`tc`へ略さない。通常の`cartId`等は冗長に改名しない。
- 日本語文書で強調のためにかぎ括弧・二重引用符を使わない。引用・コード・API構文には必要な記号を使う。

## 完了の確認

PRのマージ完了を確認したら、対応worktreeのdev・preview・Storybook・watch・音声Agentと子プロセス、開発用Compose/Dev Containerを[終了手順](docs/setup.md#6-終了再開復旧)に従って停止してから完了報告する。別の場所でマージされたPRも、再開時にマージ済みと判明したら同じ終了処理を行う。ユーザーが継続稼働を明示したものだけを除外する。

停止前にPR・branch・worktreeの対応と、作業ディレクトリ・起動元・PIDの親子関係・Compose projectで所属を確認する。停止後は子プロセス・待受ポート・containerが残っていないことを確認し、停止結果や残存理由を報告する。対象外のworktree、共有proxy、Docker/OrbStack全体は停止せず、停止のためにvolume・worktree・未commit差分を削除しない。

変更に関係するformat・lint・型・実行境界を[テスト戦略](docs/testing.md#変更に応じた検証)で選ぶ。成功済みの検証は、追加変更・失敗・未解決の懸念があるときに広げる。skip、型キャスト、広いignore、恒久mockで失敗を隠さない。

ツールの版、依存導入、envとexample、dev scripts、devcontainerを変えたら[setup.md](docs/setup.md)と関連する手順を同じ差分で更新する。受入条件、実施した検証と対象版、未実施範囲、残るリスクを成果物とともに報告する。
