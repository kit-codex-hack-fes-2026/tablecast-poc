---
title: MCP接続とagentの使い方
description: 公開MCPへのOAuth接続、店舗・scopeの確認、作業別のtool入口を説明します。
---

## 接続する

[プラグイン導入](/account/integrations/plugins)または[手動導入](/account/integrations/manual)を開きます。この案内画面にはログインが必要です。表示された接続先をMCPクライアントに追加し、OAuthでログインして対象組織と権限に同意します。リポジトリのcloneや開発サーバーは不要です。

本番とstagingは別環境です。stagingの画面では`tablecast-staging`の接続先を使い、利用中の画面とMCPのoriginを照合してください。pluginを導入済みなら同じ接続先を手動で重複登録しません。

## 権限と対象店舗を確認する

読取りには`tablecast:read`、下書きの変更には`tablecast:write`が必要です。権限が不足するときは必要なscopeで再認可します。複数店舗では接続URLの`storeId`で対象を選び、省略時は許可された組織内の最初の店舗が対象です。IDを推測せず、`get_configuration`の店舗名・IDで確かめてください。

[OAuth接続一覧](/account/mcp-sessions)では接続先・権限・期限を確認し、不要な接続を解除できます。ドキュメントが読めることは、業務操作の認可を意味しません。

## 作業に合う入口を選ぶ

| 目的                           | 最初に使うtool・次に読む章                                         |
| ------------------------------ | ------------------------------------------------------------------ |
| 現在のメニュー・接客を確認する | `get_configuration` → [設定と公開](./configuration.md)             |
| メニューを変更する             | `create_draft`・`update_draft` → [設定と公開](./configuration.md)  |
| 統計を調べる                   | `get_statistics` → [統計と改善](./analytics.md)                    |
| 店舗デザインを制作する         | `get_configuration`・`get_theme_spec`と同梱`tablecast-theme` skill |
| 卓上ゲームを制作する           | `get_game_spec`と同梱`tablecast` skill                             |
| Squareの商品を対応付ける       | `get_pos_settings`・`get_pos_catalog`と同梱`tablecast` skill       |

## Squareの商品対応

管理者がPOS設定画面でSquareへ接続した後、agentへ商品の対応付けを依頼できます。owner/adminと`tablecast:read`で`get_pos_settings`・`get_pos_catalog`・`list_pos_devices`を読み、保存には`tablecast:write`も必要です。各一覧はページ単位なので、続きがある間は同じ条件で取得します。

agentは商品名・バリエーション・容量・価格を照合し、商品の下のカスタマイズも、そのSquare商品に属する候補から対応付けます。Squareの登録名は日本語なら英語UIでも原文です。名前だけで曖昧な対応を確定せず、確認できる行を進めて保留事項を示します。

`save_pos_mappings`は最大5,000件の対応全体を置き換えるため、変更しない現存する有効な対応も取得・保持します。分割保存ではありません。廃止・消失したIDの行は黙って解除せず、修正や解除が必要な行として示します。商品対応はメニューと同じ下書きへ保存し、検証と差分確認の後、人が管理画面で公開を承認します。保存だけでは営業へ反映されません。Square店舗・端末は`save_pos_connection_settings`で営業時の接続設定として分けます。旧接続の対応は明示的な取込候補であり、過去注文へ自動適用しません。OAuth接続や端末登録、会計は管理画面で行い、対応の保存だけを実決済の確認済みとは扱いません。[設定と公開](./configuration.md)も参照してください。

## agentが作業するとき

まず実際のtoolを探索し、接続先の最新schemaを読みます。未探索の段階で未接続と決めつけません。説明や提案の依頼は読取りに留め、設定してという依頼は下書きへの反映まで進めます。公開は[人の明示承認](./configuration.md)で行います。価格や安全情報を資料から読めない場合は創作しません。

接続できないときは[困ったとき](./troubleshooting.md)へ進めます。[目次へ戻る](./index.md)。
