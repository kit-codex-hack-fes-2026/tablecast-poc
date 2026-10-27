---
name: tablecast-help
description: TableCastの使い方、MCP接続、メニュー設定から公開までの流れ、接続や検証の問題を説明するときに使う。説明だけでは店舗設定を変更しない。
---

# TableCastの参照資料

利用者の質問に合う章だけ読む。[日本語の目次](references/ja/index.md)と[English index](references/en/index.md)から関連する説明へ進める。本文はWebのDocsと共通で、pluginに同梱されるためオフラインでも読める。

| 質問                                         | 最初に読む章                                   |
| -------------------------------------------- | ---------------------------------------------- |
| 初めて使う、店舗や端末を準備したい           | [はじめに](references/ja/getting-started.md)   |
| agentを接続したい、権限や接続先を確かめたい  | [MCP接続とagentの使い方](references/ja/mcp.md) |
| メニュー・接客を設定したい、変更を公開したい | [設定と公開](references/ja/configuration.md)   |
| 売上や注文を分析したい                       | [統計と改善](references/ja/analytics.md)       |
| ログイン・接続・保存・音声で困っている       | [困ったとき](references/ja/troubleshooting.md) |

英語の質問には同じファイル名の`references/en/`を読む。回答に参照元を添えるときは、接続中のTableCastのoriginに`/help/ja/`または`/help/en/`と章名を続けた公開URLを使う。例は`/help/ja/mcp`。originは実際のMCP接続先を使い、stagingと本番を混同しない。Web取得が可能なら`/llms.txt`が索引、`/help/content/ja/mcp.md`がページ単位のMarkdown、`/llms-full.txt`が全章である。通常は索引から必要な章だけ読む。

Docsの閲覧は認証不要だが、店舗情報の取得・変更にはMCPのOAuth認可が必要である。toolがあるかを探索し、実際の応答を見て接続状態を判断する。説明の依頼を設定変更の許可と解釈しない。設定の依頼では設定用skillの手順を使い、保存・検証・公開申請・人による公開承認を区別する。参照資料に記載されたtool名より、接続先が公開する最新の入力schemaを優先する。
