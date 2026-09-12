---
name: tablecast-api
description: TableCastのAPI・認可・DB処理と、GUI・音声・MCPが共有する業務操作を実装・変更する。
---

# TableCast API

配置・依存を変えるときは[構成](../../../docs/architecture.md)、業務判断を変えるときは[製品仕様](../../../docs/product.md)の該当箇所を確認する。認証は[認証仕様](../../../docs/authentication.md)、MCPは[MCP仕様](../../../docs/mcp.md)を使う。

## 所有する境界

- 公開RPC入口から呼出し元まで確認する。`app.ts`はmiddlewareとmoduleの組立て、routeは入力検証・認可・service呼出し・HTTP出力を所有する。DB生成・SQL・業務判断はrouteへ戻さない。
- `platform/context.ts`の`requestServices`が作る`c.var.services`を渡し、同じリクエストのDrizzleと遅延生成するBetter Authを共有する。スタッフ認証は`auth/middleware.ts`で再利用し、Worker全体へbinding・認証結果をキャッシュしない。
- service・queriesは`ApiServices`、確定済みActor、検証済み入力を受け、Hono Contextへ依存しない。GUI・音声・MCPで業務操作を共有し、中継だけのservice・repositoryやDI containerを増やさない。
- 業務schemaは所有moduleの`model.ts`、consumer向けの公開契約は`schema.ts`の明示exportを正本にする。HTTP responseはHonoの推論型と既存clientで共有し、Webや音声へ業務判断・response型を複製しない。

## DB変更の設計と検証

- 新規実装もroute・認可・service・queryを通した取得経路を見る。必要なID、データの寿命、前の結果への依存を整理し、取得済みの行を渡せる箇所や重複取得を確認する。独立した読取は`db.batch()`、親子取得はjoin・subqueryを使う。D1の`Promise.all`は往復数の削減にはならない。
- 既存Drizzle schemaと型付きquery builderを使う。select・join・exists・集約・CTE・insert-select等の標準APIで表現できる処理を生SQLで書かない。条件の長さや複雑さは理由にせず、表現できない部分だけパラメーター化した`sql`断片にする。クエリ全体をSQLに残す場合はbuilderで表現できない理由を明確にする。
- 取得の統合・再読込の削除でも店舗・卓の認可条件を保つ。書込の版条件、batchの原子性、`mutation_id`による更新成立確認を維持し、D1非対応のtransactionを追加しない。snapshotとcursorの取得順も契約として扱う。
- batchやjoinへの変更では同名列のalias、LEFT JOINの不成立、NULL、Dateと公開timestampの単位を確認する。集約をJSへ移して取得行数を増やさず、既存index・ページングを維持する。問合せ数の固定テストを追加するだけで設計確認を代替しない。

## 変更範囲に応じた確認

API実装ではworkspaceの`lint`・`typecheck`と関連する既存テストを実行する。DB・認可・競合は[テスト戦略](../../../docs/testing.md)の実Bindingを使い、mockで保証した扱いにしない。公開RPCを変えたらWebの型検査、SSR・認証・注文の接続を変えたら代表経路まで確認する。

配置・依存の変更はOxlintのboundaries設定と照合する。route→DB、service→HTTP、query→更新、model→実行コードを許可するignoreを足さず、必要な新規境界は構成文書と設定へ明示する。
