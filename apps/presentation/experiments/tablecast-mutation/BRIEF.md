# 大きなアプリ変更に対する動画基盤の追従テスト

Issue #1。ユーザーは現行動画を評価した後、アプリを大きく変え、動画基盤を変更せず生成できるかの実証を依頼した。

## 対象と固定範囲

- 元アプリ：`tablecast-poc`、main `7d6adc7f9aa813ecdb0f3e5b5248c4ca85c8c919`。
- テスト対象：隣の独立clone `tablecast-mutation-test`、同SHAのdetached HEADに未commitのUI変更を加える。元のアプリやDBを退避・上書きせず保持する。
- 専用Compose project：`tablecast-mutation`。独立したDB・認証・依存・音声Server・Agent・観測環境。入口は`http://mutation.tablecast-poc.container.localhost:3100`。
- 固定対象：[開始時ハッシュ](../../records/tablecast-mutation-baseline.json)に列挙した既存の全scripts、styles、package.json、Playwright設定、tsconfig。共通の収録実測・音声記録・カーソル・ズーム・OpenScreen編集・描画・検査・動画CLIを変更しない。
- 変更できる入力：このフォルダの台本、撮影定義、アプリ固有の操作adapter、新しく収録した素材、字幕、切り出し時刻。アプリが変わっても旧セレクター・旧台本が自動修正されるという試験ではない。
- 維持する成果物：商品紹介v14・技術紹介v17、以前の通常名MP4、保存素材とナレーション。

## アプリの変更

| 対象           | 変更前                       | テスト用の変更後                                                             |
| -------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| 客側の領域     | 会話が左、商品が右、半分ずつ | 商品が左58%、会話が右42%                                                     |
| ナビゲーション | 商品領域の上にタブ           | 下部の大きなタブと上部の3段階表示                                            |
| 商品一覧       | 2列の縦カード                | 写真・商品名・金額を並べる横カード                                           |
| GUI確認        | 確認ボタンから直接照合画面へ | メニューからリストへ進み、その後に照合。承認前には注文しない                 |
| 店員           | 概要中心のタブと空カート     | 注文受付を先頭にし、未受付・受付済み・提供済みの実件数を表示。空カートを省略 |
| 表現           | 黒基調、既存の操作名         | 緑基調、日英の操作名を変更、Labを表示                                        |

価格・注文確定・版管理・認可・音声処理は既存の実APIを使う。新しい業種や異なるバックエンドへの移植は今回の検証範囲外。

## 実動デモ

| 場面       | 操作                               | 成功結果／撮影する情報                     |
| ---------- | ---------------------------------- | ------------------------------------------ |
| 客の相談   | 保存済みの合成音声で味を尋ねる     | 実応答と移動した会話欄                     |
| 注文追加   | 冷酒90mlを1つ依頼                  | 新しい左側リストに商品・780円・数量1       |
| 停止とGUI  | 音声停止、商品タブからリストへ進む | 停止中でも操作でき、表示だけで注文されない |
| 再開・承認 | 音声再開、読み上げ、明示承認       | 版付き確認・確定注文1件・空カート          |
| 英語       | 同じ注文の味わいを英語で説明       | 実際の英語応答                             |
| 店員       | 同じ注文を開き調理を開始           | 受付済み、状態別の実件数                   |
| 管理者     | 商品詳細を開く                     | 現行の容量と追加料金                       |

撮影意図・対象・保持時間は[capture-plan.json](capture-plan.json)、操作は[record-guest.ts](record-guest.ts)・[record-role.ts](record-role.ts)。旧adapterの最初のタブ名が存在しないことを[session.json](session.json)へ記録する。共有の状態待ち／撮影処理の代わりに成功を偽装しない。失敗テイクは保存して不採用とする。

## 編集・生成・評価

新しい実音声・イベントからカットと字幕を決め、撮影した矩形からズームを再計算する。旧素材の時刻や矩形をそのまま使わない。商品紹介と技術紹介の構成・ナレーション・BGM・SEは成立する範囲で再利用する。技術図の実装根拠はテスト対象cloneへ向ける。

```powershell
$env:TABLECAST_PRESENTATION_PROJECT = (Resolve-Path experiments/tablecast-mutation/project.json).Path
$env:TABLECAST_CAPTURE_ORIGIN = 'http://mutation.tablecast-poc.container.localhost:3100'
$env:TABLECAST_CAPTURE_STORAGE_STATE = '.local/tablecast-mutation-guest-auth.json'
node experiments/tablecast-mutation/record-guest.ts tablecast-mutation-guest-v次版
bun --no-env-file scripts/tablecast-edit-guest.ts
bun run video --project experiments/tablecast-mutation/product.json --film product --name tablecast-mutation-product-v次版 --render
bun run video --project experiments/tablecast-mutation/project.json --film technical --name tablecast-mutation-technical-v次版 --render
```

アプリのlint・型検査、実GUI・実APIの操作、撮影証跡、配置・遷移・全編復号・等速再生と開始終了の基盤ハッシュを確認する。共通コードの変更が必要になれば、固定条件での不成立として記録する。映像の品質評価はユーザーに委ねる。

## 環境の再現と不採用テイク

[application.patch](application.patch)は独立cloneにだけ適用する。[compose.yaml](compose.yaml)のbind元は必須の`TABLECAST_MUTATION_CHECKOUT`で指定する。`apps/presentation`で`$env:TABLECAST_MUTATION_CHECKOUT = (Resolve-Path ../../../tablecast-mutation-test).Path`を設定してからComposeを実行する。未指定・存在しないパスでは起動せず、元checkoutを指定しない。元の開発用イメージ`tablecast-tablecast:latest`を再利用した。依存は専用volumeで`bun install --frozen-lockfile`・`uv sync --project livekit --locked`、DBは`dev:prepare`から新規作成した。

開発資格は既存の`.env.secrets.local`をGit管理外へ安全に配置し、Bunへ明示ロードした。Agentは非秘密の対応式`OPENAI_API_KEY=${TABLECAST_MODEL_API_KEY}`を置いた一時env、`.env.secrets.local`、`.local/.env.voice`の順にuvへ渡す。これは今回の旧形式の環境に合わせた起動方法。

[prepare.ts](prepare.ts)は専用コンテナの生成済みログイン情報をメモリー内で読み、実ログイン・空卓への新しい来店・端末認可を行う。秘密値は表示せず、認証状態は元checkoutの`.local/tablecast-mutation-*-auth.json`へ保存する。[configure-voice.ts](configure-voice.ts)は合成店舗の標準音声を正規のdraft作成・検証・適用APIで設定する。PR準備で実験補助スクリプトもTypeScriptと入力schema検証へ統一し、workspaceのlint・型検査へ含めた。実行には`bun --no-env-file experiments/tablecast-mutation/prepare.ts`等を使う。共有済みの台本は[author.ts](author.ts)で再初期化しない。[verify.ts](verify.ts)は当時の固定ハッシュとローカル出力を照合する履歴用であり、基盤修正後のcheckoutで一致するものではない。

- guest-v1：新規seedの店舗音声が未選択で`VOICE_NOT_CONFIGURED`。共有の起動フラグは有効だった。上記設定APIで店舗の音声を登録した。映像は不採用。
- guest-v2：GUIの照合画面→変更へ戻るところまで実操作・未送信の検査は通過した。その後の音声応答が専用読み上げを行わず、`confirmation-read`が成立しなかった。共通の状態検査が停止させ、映像は不採用。成功した注文として使わない。
- guest-v3：読み上げ済みの確認と実注文送信は成立したが、承認音声が2つの`voice.user`ターンに分かれた。題材側の待ち処理が最初のターンだけを見てタイムアウトし、テイクは不採用。専用adapterを`findLast`へ変更し、最後のユーザー発話に対応する実応答・再生終了を待つ。元の`tablecast-record-guest.ts`は固定条件に従い変更していない。
- 次の収録ではGUIによる照合と音声による読み上げを連続して混ぜず、音声停止中のリスト確認から音声の確認・承認へ進む。操作順は題材側adapterで変更し、共通の状態判定は維持する。

どのアプリ操作でも自動で成功することは保証しない。環境・業務の前提が違うときに失敗を検出し、題材側の修正で生成へ戻れるかも検証する。

## 採用した素材と編集

客側は`tablecast-mutation-guest-v4`を採用。T12、来店ID `60f01c7d-6b07-4354-8ea0-26e52364e3b2`、注文1件・空カート、英語回答の再生完了まで実施した。店員は`tablecast-mutation-staff-v1`で同じ注文を受け付け、管理者は`tablecast-mutation-admin-v1`を新規収録した。全13実録場面を変更後のアプリ素材にそろえ、8場面には共通形式の撮影証跡がある。GUI追加場面は実録・操作イベントに基づくが独立したshot証跡はない。

切り出しは[edit-decisions.json](edit-decisions.json)へ保存。商品紹介はGUI操作場面を1つ追加した15場面・122.35秒。実会話の字幕は今回の応答に合わせ、ナレーション6本・BGM・SEは保存音声を再利用した。技術紹介は6場面・63.1秒で、実画面を差し替え、実装参照はテスト用cloneへ向けた。描画・OpenScreen編集コードは変更していない。

商品紹介の初回buildは、店員素材の末尾11.833333秒に対して台本が11.842秒まで参照したため停止した。共通検査を緩めず、[商品紹介の採用台本](product.json)で開始位置を4.042秒からフレーム境界の4.0秒へ調整した。保持すべき撮影区間は変えていない。[技術紹介の入力](project.json)は同時実行の再現性のためそのまま保持する。次の制作では修正済みの`product.json`を両filmの入力として使える。

専用Compose環境は撮影後に停止し、DB・素材・独立clone・元のアプリを保持した。[保全の照合](preservation.json)で、基盤35ファイル、以前の商品紹介の入力72件、既存動画v14・v17の2本のハッシュ一致を確認した。

商品紹介のHyperFrames lintはエラー0・警告1。生成HTMLが489行になったため、`composition_file_too_large`として分割を勧める保守性の警告が出た。描画や遷移の失敗ではなく、この固定条件の試験では共通生成器を分割しない。場面数が増えたときの保守性は、今後の基盤改善の候補として残す。
