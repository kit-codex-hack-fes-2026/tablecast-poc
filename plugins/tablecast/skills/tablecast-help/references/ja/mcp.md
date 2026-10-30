---
title: MCP接続とagentの使い方
description: 公開MCPへのOAuth接続、店舗・scopeの確認、作業別のtool入口を説明します。
---

## 接続する

[プラグイン導入](/account/integrations/plugins)または[手動導入](/account/integrations/manual)を開きます。この案内画面にはログインが必要です。表示された接続先をMCPクライアントに追加し、OAuthでログインして対象組織と権限に同意します。リポジトリのcloneや開発サーバーは不要です。

接続画面の名前は`tablecast`、URLは利用中の画面のoriginに`/mcp`を付けたものです。本番と検証環境は別のデータを持つため、画面とMCPのoriginを照合してください。公開pluginは本番へ接続します。同じ接続先を手動で重複登録する必要はありません。

## 権限と対象店舗を確認する

読取りには`tablecast:read`、下書きの変更には`tablecast:write`が必要です。権限が不足するときは必要なscopeで再認可します。複数店舗では接続URLの`storeId`で対象を選び、省略時は許可された組織内の最初の店舗が対象です。IDを推測せず、`get_configuration`の店舗名・IDで確かめてください。

[OAuth接続一覧](/account/mcp-sessions)では接続先・権限・期限を確認し、不要な接続を解除できます。ドキュメントが読めることは、業務操作の認可を意味しません。

## 同梱skillを選ぶ

| skill                 | 依頼すること                                                   |
| --------------------- | -------------------------------------------------------------- |
| `tablecast`           | 資料からの初期設定、メニュー・店舗資料・特典の設定、ゲーム制作 |
| `tablecast-advisor`   | 現在設定と業務メモから具体的な接客・説明を提案                 |
| `tablecast-analytics` | 期間と母数を揃えた統計比較と改善案                             |
| `tablecast-theme`     | 店舗ロゴ・背景・チラシ・会員カードなどの制作                   |
| `tablecast-help`      | 目的に合う公開ドキュメントの説明                               |

Pluginは5つのskillとヘルプの参照資料を同梱します。手動導入画面では4つの操作skillを個別に取得でき、ヘルプはこのドキュメントを使います。skillの追加だけではMCP接続や店舗の権限は付与されません。

## 作業に合う入口を選ぶ

| 目的                           | 最初に使うtool・次に読む章                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| 現在のメニュー・接客を確認する | `get_configuration` → [設定と公開](./configuration.md)                                             |
| メニューを変更する             | `create_draft`・`update_draft` → [設定と公開](./configuration.md)                                  |
| 店舗全体の初期設定を確認する   | `get_store_onboarding` → [はじめに](./getting-started.md)                                          |
| 店舗資料を編集する             | `list_store_skills`・`read_store_skill_file` → [店舗資料とSkill](./store-skills.md)                |
| 特典の設定や対象者を確認する   | `get_point_policy`・`list_coupon_rules`・`preview_coupon_audience` → [会員と特典](./membership.md) |
| 統計を調べる                   | `get_statistics` → [統計と改善](./analytics.md)                                                    |
| 店舗デザインを制作する         | `get_configuration`・`get_theme_spec` → [店舗デザインと画像](./theme.md)                           |
| 卓上ゲームを制作する           | `get_game_spec` → [卓上ゲーム](./games.md)                                                         |

## agentが作業するとき

まず実際のtoolを探索し、接続先の最新schemaを読みます。未探索の段階で未接続と決めつけません。説明や提案の依頼は読取りに留め、設定してという依頼は下書きへの反映まで進めます。メニュー等の公開は[人の明示承認](./configuration.md)で行います。[ポイント・クーポン](./membership.md)は下書きを使わず保存時に適用されるため、対象と採用条件を確認した依頼の範囲で操作します。価格や安全情報を資料から読めない場合は創作しません。

接続できないときは[困ったとき](./troubleshooting.md)へ進めます。[目次へ戻る](./index.md)。
