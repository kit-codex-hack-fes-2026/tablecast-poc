# 卓上ゲームプラグイン

## 制作と公開

既存のOAuth付きMCPへ接続し、`get_game_spec`で現在の仕様を取得する。`register_game`で変更不可の下書き版を登録し、`validate_game`が返す管理画面で管理者が試遊する。確認した版を明示承認して店舗へ公開する。ゲーム追加で本体を再配備しない。

管理画面と卓上画面は50件ごとに続きを取得する。`list_games`は50件ごとの一覧、`get_game`は20版ごとの履歴と公開状態、`get_game_source`は指定版のソースを返す。修正は新しい版として登録する。MCPに公開・停止ツールは与えない。公開・停止・以前の版の再公開は店舗管理者の画面操作で行う。

## パッケージ

正本は`apps/api/src/modules/games/model.ts`。`apiVersion: 1`は日英の名前・説明・ルール、参加人数、要求権限を持つ`manifest`と、body内のマークアップ`html`、`css`、バンドル済みの`javascript`を受け取る。UTF-8のJSON全体で2,000,000 bytes以下とする。

ライブラリや画像・モデルも同梱する。画像・音声・フォントはdata URL等を使い、外部CDN、動的import、eval、Workerを必要としない。HTML内のscriptではなく`javascript`へ実行コードを置く。

```js
const { locale, players, state, preview } = await tablecast.ready;
await tablecast.save({ turn: 1, scores: Array(players).fill(0) });
tablecast.exit();
```

`locale`は`ja`か`en`、`players`は卓の人数、`state`はゲーム状態、`preview`は管理画面の試遊かを示す。`save`は`manifest.capabilities`へ`state`を宣言した場合だけ使える。状態はJSON objectで16KiB以下。試遊中は本番卓へ保存しない。v1はAI評価・発話・マイク権限を提供しないため、ゲーム用AIの課金も発生しない。

開始時に新しいプレイを作り、状態保存の競合を版で拒否する。画面を閉じた後の再開はv1の対象外。公開更新後もプレイ中のパッケージ版を固定する。公開停止では既存プレイも終了し、再公開しても復活させない。

## 隔離と権限

本体が認証済みAPIから取得したパッケージを、`sandbox="allow-scripts"`だけを許可した`srcdoc` iframeで実行する。ブラウザーのopaque originに隔離し、本体と同一オリジンにしない。専用公開ホストやWorkerは追加しない。

生成コードより先にCSPを適用し、外部のscript・画像・音声・fetch・WebSocket・frame・form・Workerを制限する。マイク・カメラ等を許可せず、Cookie・本体DOM・storage・認証情報を渡さない。親は`event.source`とoriginの`null`を両方確認し、許可したメッセージ形式だけを処理する。

通信制限はCSPが制御する読込・接続に対する保証である。iframe自身のnavigation、CPU/GPUの完全な隔離・実行時間上限は保証しない。自動検証はschema・容量・日英項目・要求権限を確認するもので、動作の正しさや悪意の不在を証明しない。管理者が実際に試遊した版を承認する。

APIはActorから店舗・卓を特定し、対象プレイ、卓の営業状態、公開停止、要求権限、版を確認する。ゲームから注文・価格変更の操作へ到達させない。公開停止はAPIへ直ちに反映し、前景の卓上画面は5秒間隔で検知する。通信失敗時もゲーム表示を止める。背景タブやOS停止中の即時反映は保証しない。

## データ・画面・検証

既存R2へパッケージJSON、D1へゲーム・版・公開先・プレイ状態を保存する。公開画像経路はJSONを扱わない。migration `0015_tablecast_game_plugins.sql`を通常の配備工程で適用する。既存注文schemaを変更せず、旧アプリへ戻す場合も追加テーブルを保持する。

管理画面は`/admin/stores/$storeId/games`。卓上画面でゲームを開くと音声を停止し、終了後もカート・注文と停止意思を維持する。ゲームは日英、複数人の開始・交代・結果発表、飲む演出のスキップ・ソフトドリンク参加に対応する。

- APIの実D1/R2試験: 認可・人間の承認・公開競合・版固定・停止・カート保持。
- 公式MCP SDK試験: OAuth接続から仕様取得・登録・検証。MCPだけでは公開できないこと。
- Chromium/WebKit: 親DOM・Cookie・storage・外部fetchの拒否、送信元検証、状態保存と終了。
- Playwright: 日英の管理画面で試遊・承認・公開し、iPad相当の卓で遊んでカートへ戻る。
- staging: 対象SHAと配備SHAを確認し、Codexの実MCPで新作を登録・試遊・公開・プレイする。API試験を実Codex接続の証拠に置き換えない。

## 別セッションから実ゲームを制作する

今回の基盤検証は`apps/web/e2e/tablecast-games.spec.ts`のモックを使う。実ゲームは同梱・seedせず、後からMCPで登録する。上記のstaging検証は次の制作セッションで行う。

1. 基盤をstagingへ配備後、管理画面の連携案内と[staging接続手順](codex-plugin.md#stagingのremote-mcp確認)に従ってCodexを接続する。
2. 別セッションで`get_configuration`を呼び、接続先の店舗を確認する。`get_game_spec`が使えることを確認する。
3. ゲーム内容を依頼し、仕様取得→制作→`register_game`→`validate_game`まで進める。既存ゲームの修正なら`get_game_source`で元の版を取得する。
4. 返された`reviewUrl`で日英・参加人数・開始・交代・結果・終了を試遊し、人が確認した版を公開する。卓上画面で表示とカート復帰を確認する。

依頼例: TableCastの現在の店舗向けに、2〜6人で交代して遊ぶ3Dサイコロゲームを作って。ゲーム仕様をMCPで取得し、日英・スキップ・ソフトドリンク参加に対応して、下書き登録と検証まで進めて。

参考: [iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)、[CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)、[Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)。
