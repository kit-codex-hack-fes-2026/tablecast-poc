---
name: tablecast-web
description: TableCastのTanStack Start、SSR、Query、日英UI、Skeleton、エラー復帰、画像・アニメーションを変更するときに使う。
---

# tablecast-web

[UI仕様](../../../docs/ui.md)、[構成](../../../docs/architecture.md)、[テスト戦略](../../../docs/testing.md)を読む。

1. routeはloaderとページ合成、featureは業務状態・操作、components/uiは業務非依存部品を所有する。
2. 初期queryはroute loaderで取得し、リクエスト単位のQueryClientをSSRへ引き継ぐ。Cookieやquery cacheをリクエスト間で共有しない。
3. 読込中・失敗・成功した0件を区別する。再試行、日英の支援技術向け表示、画像の寸法予約、reduced motionを確認する。
4. `bun run --cwd apps/web lint`、`typecheck`、`test`、`test:browser`を実行し、SSR/認証/注文の最終配線変更にはE2Eを加える。
5. `animate`と`emil-design-eng`は表現の判断に使い、TableCastの業務・アクセシビリティ仕様を優先する。

6. Webの配置と依存はworkspaceのboundariesルールで維持する。共通部品はfeatureへ逆依存せず、APIの公開入口だけを使う。
7. フォームは既存`components/form`のTanStack Form連携を使い、項目エラー・入力保持・非同期submitとmutationの失敗表示を揃える。
8. Motionは既存`MotionProvider`と必要な表示で使い、共通の操作結果は`ActionFeedback`を使う。初期データの取得はloader、再取得失敗は取得済みの画面内で扱う。
