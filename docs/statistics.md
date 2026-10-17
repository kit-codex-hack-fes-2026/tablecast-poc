# 店舗統計

店舗のowner/adminは管理API `GET /api/admin/stores/:storeId/statistics` とMCP `get_statistics` から同じ集計を取得する。MCPは `tablecast:read` で利用できる。設定の書込み権限とは独立して実行時の所属とroleを確認する。

## 入力と期間

`from`・`to`はUTC offset付きISO日時で、開始以上・終了未満に閉卓した `kind=table` の来店を対象にする。日跨ぎの来店は閉卓側の期間へ一括計上する。未閉卓と `kind=demo` は除外する。注文・入金の発生日時で集計する日報ではない。

`timeZone`はIANA timezone（既定 `Asia/Tokyo`）で表示・解釈のために返す。境界はfrom/toのoffsetで確定し、timezoneで再変換しない。夏時間のある地域でも日付ごとに正しいoffsetを指定する。期間の選択はクライアントが行い、未指定なら直近28完了日と直前28日を比較する。

`view`は `summary`（既定）・`products`・`modifiers`、`locale`は `ja`（既定）・`en`。`limit`は既定30・最大100。HTTPでは同名のquery parameter、MCPでは同名の入力を使用する。

## 指標

| 出力                                | 定義                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| sessions / guests                   | 対象来店数 / 保存された客数の合計。同一来店の追加注文で重複しない                          |
| planSessions                        | プラン設定のある対象来店数                                                                 |
| orders / excludedOrders             | 取消・拒否を除いた注文レコード数 / 取消・拒否の件数                                        |
| orderedAmount                       | 有効注文の注文時合計。現在のカタログ価格を使わない                                         |
| paidAmount                          | 対象来店の `payment` の符号付き合計（JPY）                                                 |
| positivePayments / negativePayments | 正の支払額 / 負の支払額。外部決済で返金された証明ではない                                  |
| planSessionPaidAmount               | プラン利用来店の支払合計。プラン料金と追加注文を含むため、プラン料金だけの売上とは呼ばない |
| adjustments                         | `adjustment` の符号付き合計。支払額とは別に返す                                            |
| staffCalls / billCalls              | 対象来店の `staff.called` / `bill.requested` の記録数。現在の未対応件数ではない            |
| quantity                            | 商品数量、または商品数量×選択肢数量                                                        |
| orderingSessions / orderRate        | その商品・選択肢を注文した来店数 / 全対象来店数。注文しなかった来店も分母に含む            |
| planCoveredQuantity                 | 注文時snapshotでプラン内と記録された数量。料金を商品へ配賦しない                           |

商品ID、選択肢IDを集計キーにし、名前は同じキーの最新注文の指定言語から取得する。現在削除された商品も含む。商品価格・名称・プランの変更を現在カタログで上書きしない。プランの追加料金・調整を商品へ配賦した粗利や実売上は返さない。

0件は0、対象来店がない場合の行は空、分母0の率はnullとする。名称の欠損はnull、lines配列のない注文数は `incompleteSnapshots` に返し、その注文の商品明細は集計しない。欠損を0件の保証として扱わない。取消・返金等の外部システム記録や未取得の比較条件は推測しない。

## ページと出力の範囲

各応答には母数を含むsummary、定義、制約、取得日時、期間、通貨、timezoneを含める。商品・選択肢の行はID順であり、先頭ページだけを人気順位と呼ばない。`nextCursor` があれば同じ店舗・期間・view・locale・timezoneでcursorを渡す。limitだけは変更できる。必要な範囲を取り終えてからクライアントで並べ替える。

cursorは最初の取得時刻 `asOf` を引き継ぎ、以後に閉卓した来店を追加しない。履歴全体のimmutable snapshotを作成する機能ではなく、DBへの直接修正まで固定するものではない。生の注文snapshot、会話本文、個人識別子は返さない。

国籍・観光目的、原価、売切期間、外部決済の返金は取得していない。種別が通常来店の合成seedを実来店と区別する保存項目もない。環境・資料の出所を確認し、合成履歴から実店舗の人気・需要予測・因果効果を断定しない。

## 実装・検証

集計の正本はAPIのstatistics module。店舗別の閉卓履歴indexを使い、注文・会計・呼出の `(store_id, table_session_id, …)` 索引をmigrationで追加する。既存Drizzleでjoin・集約し、JSON配列の行展開だけSQLite `json_each` を使う。独立した集計は1つの `db.batch()` で実行する。

実D1テストでは期間境界、日跨ぎ、未注文の母数、取消・拒否、負の支払、プラン、画像等を含むsnapshotの非出力、欠損、他店舗・role・scope、cursorを確認する。小規模と111商品の履歴で集計結果と1batch、既定30行の応答が16KB以内になることを確認する。API認可とMCPのOAuth経路はそれぞれ検証する。
