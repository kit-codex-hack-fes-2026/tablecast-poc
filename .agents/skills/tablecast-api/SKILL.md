---
name: tablecast-api
description: TableCastのHono、Drizzle D1、業務操作、認可、MCP・音声共有操作を変更するときに使う。
---

# tablecast-api

[構成](../../../docs/architecture.md)、[製品仕様](../../../docs/product.md)、[テスト戦略](../../../docs/testing.md)を読む。

1. 公開RPC入口と操作の呼出し元を確認し、HTTP検証と業務操作の所有者を維持する。
2. `apps/api/src/db`のDrizzle schemaを使う。店舗・卓の条件、batchの原子性、mutation_idによる更新成立確認を維持する。
3. 通常queryは型付きbuilder、複雑な条件はパラメーター化した`sql`を使う。D1の非対応transactionを追加しない。
4. `bun run --cwd apps/api lint`、`typecheck`、`test`を実行する。実Bindingの認可・競合テストをmockへ置換しない。
