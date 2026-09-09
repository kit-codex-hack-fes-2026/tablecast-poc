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
