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
6. DB変更は以下の設計・検証手順を使う。店舗・卓の条件、batchの原子性、mutation_idによる更新成立確認を維持する。D1非対応のtransactionを追加しない。
7. `bun run --cwd apps/api lint`、`typecheck`、`test`を実行する。実Bindingの認可・競合テストをmockへ置換しない。公開RPC変更はWebの型検査と代表E2Eまで確認する。

Oxlintのboundaries設定がレイヤーと配置を強制する。route→DB、service→HTTP、query→更新、model→実行コードの依存を作らない。未分類ファイルや別moduleの未公開内部パスを追加するときは、責務を検討し、必要な配置・依存だけを設定と構成文書へ明示する。広い許可やignoreで迂回しない。

## DB変更の設計と検証

- **実装前に読取の依存関係を確認する。** route・認可・service・queryを通したDB往復を数え、前の結果が必要な操作と、既知のIDで取得できる操作を分ける。同じ行の再取得、卓数に比例する問合せ、不要な直列awaitを確認する。独立したD1操作は`db.batch()`、親子の一括取得はjoin・subqueryを先に使う。`Promise.all`だけではDB往復数は減らない。認可・版検証・副作用の順序を維持する。
- **長いSQLもbuilderを先に確認する。** select・join・比較・exists・inArray・集約・CTE・insert-selectは導入版の標準APIを使い、型をschemaから推論する。長い・複雑という理由だけでSQL全文と結果型を手書きしない。`sql`はJSON・ウィンドウ関数、`changes()`、行値比較、scalar subquery、列aliasなど標準APIで不足する断片へ限定する。全文を残す場合は、builderで満たせない要件を変更理由に書く。
- **まとめた結果の意味を実D1で確認する。** batchのjoinでは列名衝突を避け、未一致のLEFT JOIN、NULL、timestampのDate変換、公開JSONの日時単位を確かめる。日付をSQLへ埋め込んでschemaの変換を迂回しない。読取cursorと後続状態の順序を守り、取得中の更新をイベントで回復する。
- **重複読取の削除は更新条件まで確認する。** 価格・権限の判定に使った行と版が、条件付き更新でも同じ対象・版であることを確認する。再読取を消すだけで成立条件を緩めない。JSON処理や集約をJavaScriptへ移すために取得行を増やさず、ページング・indexの利用を保つ。
- **新規実装の段階で不要なDB操作を作らない。** 実装前と差分レビューで呼出し経路を追い、同じデータの再取得、ループ内の問合せ、独立した直列awaitを除く。実装の問合せ数を固定するためだけの回帰テストを追加しない。既存の業務・認可・競合テストで変更後の振る舞いを確認する。本番の速度改善は実測したときだけ数値で報告する。
