---
name: tablecast-api
description: TableCastのHono、Drizzle D1、業務操作、認可、MCP・音声共有操作を変更するときに使う。
---

# tablecast-api

[構成](../../../docs/architecture.md)、[製品仕様](../../../docs/product.md)、[テスト戦略](../../../docs/testing.md)を読む。

1. 公開RPC入口と全呼出し元を確認する。`app.ts`は共通middlewareとmoduleの組立てに限定し、業務を`modules/<業務>`へ置く。
2. routeは入力検証、認可middleware、service呼出し、HTTP出力を所有する。DB生成・SQL・業務判断をrouteへ戻さない。
3. `platform/context.ts`の`requestServices`が作る`c.var.services`を渡す。同じHTTPリクエストのDrizzleと遅延生成するBetter Authを共有し、スタッフ認証は`auth/middleware.ts`で再利用する。Worker全体へbinding・認証結果をキャッシュしない。
4. service・queriesは`ApiServices`と確定済みActor・検証済み入力を受け、Hono Contextやrouteへ依存しない。GUI・音声・MCPで業務操作を共有する。処理を中継するだけの層やDI containerは追加しない。
5. 業務schemaは所有moduleの`model.ts`へ置く。`schema.ts`はWebなどに必要な公開契約だけを明示exportする。API内部は定義の所有moduleを参照する。
6. `db`のDrizzle schemaを使い、通常queryは型付きbuilder、複雑な条件はパラメーター化した`sql`を使う。店舗・卓の条件、batchの原子性、mutation_idによる更新成立確認を維持する。D1非対応のtransactionを追加しない。
7. `bun run --cwd apps/api lint`、`typecheck`、`test`を実行する。実Bindingの認可・競合テストをmockへ置換しない。公開RPC変更はWebの型検査と代表E2Eまで確認する。

Oxlintのboundaries設定がレイヤーと配置を強制する。route→DB、service→HTTP、query→更新、model→実行コードの依存を作らない。未分類ファイルや別moduleの未公開内部パスを追加するときは、責務を検討し、必要な配置・依存だけを設定と構成文書へ明示する。広い許可やignoreで迂回しない。
