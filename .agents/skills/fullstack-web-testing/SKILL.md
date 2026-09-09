---
name: fullstack-web-testing
description: TypeScriptフルスタックWebアプリのテスト戦略、BDDによるケース設計、テスト実装・レビュー・整理に使う。static・unit・integration・E2Eの責務と比重、Vitest・Storybook・Playwright、Given/When/Thenの命名と記述、fixture・helper・each・skipの運用を扱う。MCP・Mastra・AI SDK・LiveKitのAgentテストを低い層で決定的に設計し、実モデル品質評価と分離する。Next.js/TanStack Start、Hono/Elysia、Vercel/Cloudflare Workers等の違いを実行境界へ対応付ける。
---

# フルスタックWebのテスト戦略

**一つの規則を、十分に保証できる最も低い層で厚く検証する。上位層には、その接続やランタイムでしか検出できないリスクを残す。** テスト数や行数の削減を、安全性・振る舞いの保証より優先しない。

BDDを要求とコードをつなぐ設計方法として使う。Gherkin、Cucumber、独自のシナリオDSLは必要としない。既存のテストに新規・変更分から適用し、命名だけを目的に全スイートを書き換えない。

## 最初に確認するもの

- 対象の要求・受け入れ条件、既存のテスト方針、変更差分と関連する呼出し元
- workspace、公開entrypoint、DB・認証・外部サービスの境界
- 実際のframework・runtime・adapter・テストツールの版と設定
- package scripts、Vitest projects、Storybook設定、Playwright projects、CIの必須チェック

参照元の固有ディレクトリ、レイヤー番号、並列数、coverage閾値は移植しない。対象プロジェクトで同じ責務を持つ場所へ対応付ける。テストのためだけにserviceやrepository等の層を新設しない。

## レイヤーと比重

| 分類                                            | 主に使う道具・境界                                                       | 比重と責務                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 静的検査（TypeScript / Oxlint / Oxfmt / build） | TypeScript、Oxlint、Oxfmt、build                                         | 全変更の土台。型、構文、await漏れ、禁止依存、整形、bundleの成立。実行時の認可・SQL・UI動作の代用にはしない。 |
| 単体テスト（Vitest）                            | Vitest、純粋関数、狭い副作用境界                                         | 規則・境界値・状態遷移・失敗分類を細かく。巨大mockで統合を単体に見せない。                                   |
| 統合テスト（Vitest / Storybook / Playwright）   | DOM、実ブラウザーcomponent、QueryClient、HTTP app、実DB、runtime adapter | 戦略の中心。複数の本番部品を接続し、利用者・公開API・永続化先から観測する。                                  |
| E2E（Playwright）                               | Playwright + Web + API + DB/Auth等の全構成                               | 少数の重要journeyと最終配線。下位の全入力・全失敗分岐を繰り返さない。                                        |
| 配備先smoke（Playwright / HTTP client）         | Preview/staging上の代表疎通                                              | 配備設定、Cookie、binding、環境差を必要最小限で確認。ローカルE2Eと区別する。                                 |

固定の件数比率は設けない。統合を厚くし、純粋規則の多い場所はunitも多くする。判断単位はテスト関数数ではなく、独立した失敗リスクと検出費用である。

**Storybookは状態カタログとテスト入力、PlaywrightとVitestはランナーであり、単独でレイヤー名ではない。** 実Webとブラウザーを使ってもAPIを差し替えていればWebアプリ統合である。細かい分担は [レイヤーの所有責務](references/layer-ownership.md) を読む。

## Agent・MCP・音声

MCP・Mastra・AI SDK・LiveKit等では、toolの業務判断は直接、Agent/workflowの接続は固定したモデル応答・イベント列で検証する。通常CIは実LLMなしの単体・統合を厚くし、実モデルの品質評価と実音声・Roomの疎通を別枠にする。temperature=0だけで決定的とは扱わない。具体的なレイヤー（ランナー）、fixture、GWT例、実接続へ残す保証は [Agentのテスト戦略](references/agent-testing.md) を読む。

## ケース設計から実装まで

1. 要求を自然言語のGiven（前提）・When（きっかけ）・Then（観測結果）へ分ける。
2. [ケース設計](references/case-design.md) に従い、規則、失敗リスク、同値分割、境界、必要な組合せを整理する。
3. 規則ごとに最低十分な所有層、代表ケース、上位固有の検証を決める。複雑な変更には [テスト対応表](assets/test-map.md) を使う。
4. [コードと命名](references/test-writing.md) に従って実装する。テスト名の「保存する」「拒否する」等の主張を、実際の観測で裏付ける。
5. [fixture・helper・each・skip](references/test-support.md) で前提、隔離、実行対象を管理する。
6. 対象テストから必要な依存範囲とCIチェックへ進む。ブラウザーでは [同期と実行](references/browser-and-ci.md) に従う。

削除・統合する既存テストは、守っていた規則と観測境界の置換先を示してから削除する。「同じ値をassertしている」だけで重複と判断しない。認可・テナント・トランザクションの異なる防御点はそれぞれ残す。

## レビューと報告

- 規則・リスクに漏れがなく、同じ失敗原因を不要に複数層で保証していないか
- 実DB、HTTP、ブラウザー等が必要な主張をmockや型だけで済ませていないか
- Givenが見え、Whenが一つの意味を持ち、Thenが公開された結果を観測しているか
- テストが単独・順不同で成立し、skip・retry・coverage除外で失敗を隠していないか

報告では追加・変更・削除した保証、実行した確認と結果、未実施・非自動化の理由を分ける。Issueには予定のケース設計、PRには実装した保証と実測結果を書く。UI・エンドユーザーの振る舞いを変更した場合は撮ったままの画像か動画を関連説明中へキャプション付きで埋め込む。専用見出しや装飾編集は不要で、自動テストの代替としない。

設計の参照元と対象版を確認する公式資料は [資料と適用範囲](references/sources.md) に置く。
