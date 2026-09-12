---
name: tablecast-web
description: TableCastのWeb画面・SSR・データ取得・フォーム・日英UIを実装・変更する。
---

# TableCast Web

利用者の操作・表示は[UI仕様](../../../docs/ui.md)、配置・依存は[構成](../../../docs/architecture.md)の該当箇所を確認する。表現を設計するときは`animate`・`emil-design-eng`を使い、業務・アクセシビリティ仕様を優先する。

## 取得と状態の寿命

- routeはloaderとページ合成、featureは業務状態・操作、`components/ui`は業務非依存部品を所有する。共通部品はfeatureへ逆依存せず、APIは公開schema・Hono推論型・既存clientから使う。
- loaderから表示まで取得経路を追い、必要な初期queryをloaderで取得する。SSRはリクエスト単位のQueryClientを引き継ぎ、Cookie・cacheをリクエスト間で共有しない。取得済みデータを渡し、loader・component・認証処理で同じ取得を重ねない。
- 初回読込と再取得を区別する。初回はpending/error境界を使い、再取得の失敗では取得済み画面と入力を保持して再試行できるようにする。読込中・失敗・成功した0件を同じ状態にしない。
- 性能は初期表示までの依存と待ち時間で判断し、SSR対応だけで高速化済みとしない。独立した取得の直列化や不要なhydration後の再取得を確認する。

## 部品と操作

- フォームは既存`components/form`のTanStack Form連携を使い、項目エラー、入力保持、非同期submit、mutationの失敗表示を揃える。
- 標準Tailwind utilityを優先し、同じ意味の見た目は既存Tailwind Variantsの`tv`・`VariantProps`へまとめる。業務状態を持つ部品をUIプリミティブへ移さず、未使用のvariantや独自フォーム・query wrapperを増やさない。
- Motionは既存`MotionProvider`、共通の操作結果は`ActionFeedback`を使う。日英の支援技術向け表示、画像の寸法予約、reduced motionを確認する。

## 変更範囲に応じた確認

Web実装ではworkspaceの`lint`・`typecheck`と関連テストを実行する。操作・focus・layoutは`test:browser`等の実ブラウザー、SSR・認証・注文の最終配線は代表E2Eで確認する。部品のみの変更に全E2Eを一律に要求しない。保証の分担は[テスト戦略](../../../docs/testing.md)、PRの実動作証拠は[Issue・PR skill](../github-issue-pr-ops/SKILL.md)を使う。
