---
name: fullstack-web-testing
description: Web・API・Agentのテスト設計・実装・レビューで、必要な保証を最も低い十分な層へ割り当てる。
---

# フルスタックWebのテスト戦略

独立した失敗リスクを、十分に保証できる最も低い層で検証する。上位層には接続・runtimeに固有の保証を残す。テスト数や固定比率を目標にしない。

## 保証と層の選び方

要求・差分・呼出し元と既存テストを確認し、追加で観測する必要がある結果を決める。実物のframework・adapter・package scriptsへ対応付け、テストのためだけに本番へ中継層を作らない。

| 保証                              | 検証する境界                                                       |
| --------------------------------- | ------------------------------------------------------------------ |
| 型・依存・構文・整形              | 既存の型検査・lint・formatter。実行時の認可やSQLの保証とは分ける。 |
| 計算・境界値・状態遷移・失敗分類  | 純粋関数や狭い副作用境界の単体テスト。                             |
| 認可・SQL・原子性・競合           | 本番HTTP/serviceと実DB・target runtimeを接続した統合テスト。       |
| フォーム・再試行・cache・focus    | 実providerと公開component/featureを接続したDOM・ブラウザー統合。   |
| SSR・Cookie・Web/API/DBの最終配線 | 実appで代表経路を確認する。下位の全分岐をE2Eで繰り返さない。       |

Storybookは状態と入力のカタログ、Vitest・Playwrightはrunnerであり、名前だけで層を分類しない。APIを差し替えた実Web試験はWeb統合で、実API接続の証明にはしない。

標準機能の内部、設定値の転記、実装の呼出し順、DB問合せ数を固定するだけの回帰テストは増やさない。設計上避けられる重複は実装時に解消する。薄い接続が型検査・既存の代表経路で保証されるなら専用テストは不要。必要な認可・競合・データ保全をこれらと同一視して省かない。

## 作業に応じた参照

必要な項目だけ読む。BDDはGiven（前提）・When（きっかけ）・Then（観測結果）で要求を整理する方法として使い、独自DSLや全スイートの命名変更は不要。

- 層の選定・再配置・重複の判断：[レイヤーの所有責務](references/layer-ownership.md)。保証の対応が複雑なら[テスト対応表](assets/test-map.md)を使う。
- ケースを追加・変更する：[ケース設計](references/case-design.md)、[コードと命名](references/test-writing.md)。前提の共有・隔離・parametrizeは[fixture・helper・each・skip](references/test-support.md)。
- ブラウザーやCIの同期・失敗を扱う：[同期と実行](references/browser-and-ci.md)。
- MCP・Mastra・AI SDK・LiveKitを扱う：[Agentのテスト戦略](references/agent-testing.md)。通常CIは固定モデル応答・イベントで所有する判断を検証し、実LLMの品質・実音声・Room疎通を分離する。temperature=0だけを決定性の根拠にしない。
- frameworkや対象版の確認：[資料と適用範囲](references/sources.md)。

## 実行・レビュー・報告

対象テストから影響する既存チェックへ進み、無関係な全体試験・有料試験を一律に要求しない。実DBの保証をquery builderのmockへ置換せず、skip・retry・型キャストで失敗を隠さない。

削除・統合では、守っていた規則と観測境界の代替を示す。同じ拒否応答でもrole・tenant・HTTP認証の独立した防御点を残す。公開結果と副作用を観測し、単独・順不同で成立する前提を作る。

報告には各層が保証すること、選んだ理由、実行結果、未実施・非自動化の範囲を含める。IssueとPRの書式・UI証拠は[Issue・PR skill](../github-issue-pr-ops/SKILL.md)へ従う。
