# 認証とアカウント

Better Auth がメール、Google OAuth、パスキー、組織、OAuth Provider、端末コードの認証状態を所有する。同一メールの Google アカウントは検証済みメールだけを既存ユーザーへ連携する。異なるメールへの連携と最後のログイン手段の解除は許可しない。メールとパスワードのログインにはメール確認が必要。

## ローカル

`bun run dev:parity` または `bun run dev` が vercel/emulate の Google サービスと Mailpit を起動する。実 Google アカウントや SMTP 認証情報は不要。URL・ポートは `.local/runtime.json`、メール一覧はその `ports.mailpit` の `http://127.0.0.1:<port>`。既存データは保持する。

Google の選択画面では `tablecast-owner@example.test` と `tablecast-member@example.test` を利用できる。これらは実在ユーザーを表さない。デモ管理者の認証情報は `.local/demo.json`。デモ seed だけが開発用管理者のメールを確認済みにする。

`/account` で名前・画像・ログイン中の端末・Google連携・パスキーを管理する。店舗とBetter Authの組織は1対1で、チーム階層を使わない。`/organisations` は店舗一覧、`/stores/new` は店舗作成、`/admin/stores/:storeId/members` はその店舗のメンバー、`/admin/stores/:storeId/invitations` は招待一覧である。

端末QRは `/device?user_code=...` から店舗を選び、`/admin/stores/:storeId/devices/new?user_code=...&tableId=...` へ進む。コード・割当先はURLから再現できる。コードの読取りや卓の選択だけでは登録せず、明示操作で承認する。

端末登録ページでは `qr-scanner` でカメラまたはQR画像からコードを読み取れる。背面カメラを優先し、成功・中止・ページ移動で映像を停止する。現在のオリジンの `/device` URLだけを受け付け、読取結果のURLへ直接遷移しない。権限拒否や読取失敗時にもコード入力を継続できる。カメラはHTTPSまたはブラウザーが安全と認めるlocalhostと、利用者のカメラ許可を必要とする。

## 外部アプリへのOAuth

`@better-auth/oauth-provider@1.7.2` はBetter Auth公式のOAuth 2.1 Providerである。2.1は規格名で、npmパッケージのバージョンではない。認可コード・PKCE・同意・トークン検証はこのプラグインを使う。

MCP連携は `/account/mcp-sessions` でアプリ・承認対象の店舗・scope・承認日時・更新日時・アクセストークンとリフレッシュトークンの有効期限を確認し、取り消せる。有効なトークンが残る接続と期限切れを区別する。取消は同じユーザー・アプリ・店舗のアクセストークンとリフレッシュトークンを失効させ、同意を削除する。即時失効が必要なため、公式の `disableJwtPlugin: true` でDB管理のopaqueアクセストークンを発行する。以前のJWTを発行していた環境では外部アプリを再連携する。

TanStack Routerには参照スターターのflat query処理を採用する。OAuthの署名付きクエリに含まれる繰り返しの `ba_param` や文字列をJSONへ変換しない。署名検証を省略せず、元のクエリを保持して公式クライアントへ渡す。

## 公開環境

### Better Auth Dashboard

本番だけで `@better-auth/infra` の `dash` とActivity Trackingを有効にする。API Workerの `TABLECAST_BETTER_AUTH_API_KEY` を `dash({ apiKey })` へ渡し、Webは公式 `dashClient` を既存認証クライアントへ追加する。鍵が未設定の場合はプラグインを読み込まず、本番のCI/CDは鍵の欠落を配備前に拒否する。preview・ローカルへ本番の鍵を渡さない。

Activity Trackingは `user.lastActiveAt` を記録する。Drizzleの `last_active_at` はnullableな `timestamp_ms` で、既存ユーザーの値は列追加後の `NULL` から始まる。セッション作成と公式プラグインが対象にする認証操作で更新し、既定の更新間隔は5分とする。ページを開いたままの時間や業務APIの全リクエストを測る機能ではない。認証イベント送信と日時更新はBetter Authの `advanced.backgroundTasks.handler` からリクエストの `executionCtx.waitUntil` へ登録する。

無料Starterを使い、Directory Sync、Sentinel、Better Authの有料メール・SMSは有効化しない。2026-09-11時点の無料枠はDashboard管理者1席、監査ログ月10,000件・保持1日。最終利用日時はTableCastのD1へ保存するため、この監査ログ保持期間とは別である。料金・利用量はDashboardで確認する。[公式料金](https://better-auth.com/pricing)・[Dashboard仕様](https://better-auth.com/docs/infrastructure/plugins/dashboard)

### 新規登録の制限

店舗招待は所属を追加する機能であり、招待がない人のアカウント作成自体は制限しない。無料Dashboardで招待コードによる登録制限を設定する機能は公式資料で確認できていない。招待制にする場合は、Better Authの `databaseHooks.user.create.before` で有効な招待先メールまたは許可メールを照合し、メール登録とGoogle初回登録の両方へ適用する。メール所有の確認、既存ユーザーのログイン、最初の管理者の登録手順も合わせて設計する。現時点ではこの制限を実装していない。[公式Database Hooks](https://better-auth.com/docs/concepts/database#database-hooks)

### Googleとメール

Google Cloud の OAuth Web クライアントのリダイレクトURIを `TABLECAST_PUBLIC_ORIGIN/api/auth/callback/google` に登録し、`TABLECAST_GOOGLE_CLIENT_ID` と `TABLECAST_GOOGLE_CLIENT_SECRET` を Wrangler の secret として設定する。`TABLECAST_GOOGLE_EMULATOR_URL` と `TABLECAST_MAILPIT_URL` は公開環境で設定しない。開発環境以外での利用はAPIが拒否する。

Cloudflare Email Service で送信ドメインを検証し、送信可能なメールアドレスを `TABLECAST_EMAIL_FROM` に設定する。`apps/api/wrangler.jsonc` の `TABLECAST_EMAIL` binding で React Email の HTML とテキストを送信する。招待、メール確認、パスワード再設定は同じテンプレートを使用する。

パスキーは origin/RP ID に結びつく。localhost と本番ドメイン間では再登録が必要。HTTPSで提供し、実機の認証器でも公開前に登録とログインを確認する。

## デモの所属とローカルID

Googleモックでは佐藤 晴香（`tablecast-owner@example.test`、こもれびの管理者）、田中 蓮（`tablecast-member@example.test`、こもれび担当）、小林 直子（`tablecast-akari@example.test`、あかり担当）、山本 翼（`tablecast-koharu@example.test`、こはるの管理者）を選べる。伊藤 葵（`tablecast-link@example.test`）は未所属からの導線確認用。すべて架空の人物である。名前・画像を変更した既存ユーザーのプロフィールはseedで上書きしない。

seedはユーザー画像と店舗アイコンをローカルで生成し、R2へ保存する。未設定の場合だけ補い、保存済みの画像を保持する。店舗アイコンはBetter Authの組織の`logo`を使用し、`/admin/stores/$storeId/profile`で責任者・管理者が変更できる。ユーザー画像と共通の形式・サイズ検証を行う。

emulateは起動ごとに`sub`を生成するため、開発用Googleに限りissuerを`https://tablecast-google.localhost`、subjectを確認済みメールに固定する。seedは旧localhost issuerの重複だけを統合する。実Googleのissuer・subjectは変更しない。

管理画面の店舗切替はサイドバーに集約する。未所属の場合は店舗作成へのリンクと招待メールからの参加方法を表示する。Google連携解除・パスキー削除・セッション失効・メンバー削除は対象を確認して実行する。
