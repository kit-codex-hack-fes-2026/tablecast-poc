# 参照構成の採否

[索引](README.md) / [テスト戦略](testing.md#保証の所有層とe2eへの昇格)

確認日: 2026-10-17。参照元はenterprise-agentic-saas-starterのcommit `8d14a21c3d65f53b5ec6589011a2ba86093b7f6d`。以下は設計の採否であり、TableCastでの実行・配備・性能の証拠ではない。

## テスト戦略から採用するもの

参照元の[戦略索引](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/8d14a21c3d65f53b5ec6589011a2ba86093b7f6d/docs/testing-strategy/README.md)、[Web](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/8d14a21c3d65f53b5ec6589011a2ba86093b7f6d/docs/testing-strategy/apps/web.md)、[API](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/8d14a21c3d65f53b5ec6589011a2ba86093b7f6d/docs/testing-strategy/apps/api.md)、[E2E](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/8d14a21c3d65f53b5ec6589011a2ba86093b7f6d/docs/testing-strategy/e2e.md)をTableCastの実物へ対応付ける。

| 参照元の考え方                                   | TableCastでの採用                                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 最も低い十分な境界で保証し、統合テストを厚くする | 純粋判断はNode、業務・SQLは本番Honoと実D1/DO、Web状態は実feature/Query/RouterのBrowserへ置く        |
| Storybookで部品状態、Browserで機能の連携を扱う   | Web内に併置した既存storyとVitest Browserを使い、入力・失敗・cache・focusを実ブラウザーで観測する    |
| 実Startのライフサイクルと機能DOMを区別する       | memory Routerをloader/SSR/hydrationの保証とせず、Cookie・Service Bindingを通す代表SSRを残す         |
| Playwrightの使用だけでE2Eに分類しない            | HTTPを固定したWeb試験と、Web/API/DB/Authを接続した全構成試験を区別する                              |
| E2Eはworkspace間の代表配線へ限定する             | 注文・明示公開・OAuth/mail・QR参加・ゲーム・SW・実通知とruntime隔離を残し、下位の全分岐を反復しない |
| 有料モデルと決定的な試験を分ける                 | 通常CIは外部AI境界を固定し、GPT-Liveの実音声・実モデル品質・iPadは別の許可済み受入で確認する        |
| 公開scriptを実行環境と費用で分ける               | 既存の`test`・`test:browser`・`test:e2e`を維持し、層ごとの公開scriptは増やさない                    |

## 移植しないもの

| 参照元の具体構成                                  | TableCastでの判断                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Elysia/Eden、Turso/libSQL                         | Hono client、Cloudflare公式Vitest、実local D1/DO/R2を維持する。libSQLの成功をD1固有挙動の証明にしない                                       |
| A1/W1等の層番号と多数の文書・package              | [所有層の表](testing.md#保証の所有層とe2eへの昇格)へ集約する。domain/contracts/ui/db/auth/emailの独立workspaceや別Storybook appを追加しない |
| happy-dom等の追加DOM runner、MSW                  | 現在のVitest Node・Vitest Browser・Storybookと既存HTTP/通知境界で足りる範囲へ留め、新規依存・adapterを追加しない                            |
| 全featureへのcontroller/view/port/repository一式  | 現在の本番feature・公開client・schema・Drizzleを直接検証する。試験のためだけの中継層を作らない                                              |
| 専用Agent Worker・Mastra・実モデル用の固定journey | TableCastのAPI業務認可とGPT-Live/Responses delegationの境界に従う。別の音声/Agent構成へ置き換えない                                         |
| 参照元の固定job名・runner設定・matrix・cache      | TableCastの現在のCIを維持する。Issue #272ではworkflow・Turbo・package scriptsを変更しない                                                   |
| staged pathへの`related --run`等を含むCI/Hook設定 | 今回は差分選択を導入しない。HTTP・binding・spawn・動的ファイル入力の影響は静的import graphだけでは確定しない                                |

参照元の[CI実行契約](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/8d14a21c3d65f53b5ec6589011a2ba86093b7f6d/docs/testing-strategy/common/ci-execution.md)自体も通常PRとmainの全件実行を維持し、`related`はローカルpre-commitのunitだけに限定している。これをTableCastの差分CI実装済みの根拠にしない。

具体的な移行前spec・下位保証・残存E2Eは[移行対応](testing.md#issue-272の移行対応)、現在のCIとcacheは[CIのジョブとキャッシュ](testing.md#ciのジョブとキャッシュ)を参照する。既存の画像24/120商品予算とruntime隔離は維持し、速度改善の数値は対象SHAでの実測後に報告する。
