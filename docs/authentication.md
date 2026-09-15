# 認証とアカウント

Better Auth がメール、Google OAuth、パスキー、組織、OAuth Provider、端末コードの認証状態を所有する。同一メールの Google アカウントは検証済みメールだけを既存ユーザーへ連携する。異なるメールへの連携と最後のログイン手段の解除は許可しない。メールとパスワードのログインにはメール確認が必要。

## ローカル

`bun run dev:parity` または `bun run dev` が vercel/emulate の Google サービスと Mailpit を起動する。実 Google アカウントや SMTP 認証情報は不要。URL・ポートは `.local/runtime.json`、メール一覧はその `ports.mailpit` の `http://127.0.0.1:<port>`。既存データは保持する。

Googleの選択画面では[デモの共通名簿](../apps/emulate/src/tablecast-demo-identities.ts)にある架空の8人と、未所属の連携確認用ユーザーを、氏名・所属役割・アイコン付きで選べる。新規のローカル管理者資格情報は名簿のメールを使い、`.local/demo.json`へ保存する。通常の再seedではパスワードと手動メールを維持し、既知の旧デモメールだけを移行する。明示リセットではownerのメールを共通名簿へ揃え、パスワードは維持する。デモseedだけが開発用管理者のメールを確認済みにする。

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

GoogleモックとDBの初期seedは[共通名簿](../apps/emulate/src/tablecast-demo-identities.ts)を使う。各店舗の組織にowner・admin・memberを1名ずつ登録し、京料理こもれび四条店・韓国食堂ハヌル三条店のownerである佐藤 晴香を共有するため、人物は8人・所属は9件となる。Westward Burgers Kyotoのownerは山本 翼、京料理こもれび四条店の伊藤 葵はmemberである。具体的な[氏名・role・メール一覧](demo/stores.md#店舗と組織)を参照する。`rin.ogawa@komorebi-shijo.com`は小川凛の未所属の連携確認専用で、店舗メンバーに数えない。

デモ店舗IDは`tablecast-komorebi`・`tablecast-koharu`・`tablecast-hanul`である。ハヌルのadminは`naoko.kobayashi@hanul-sanjo.com`、memberは`yuma.mori@hanul-sanjo.com`を使う。

各組織3所属は新規DBまたは明示リセットの初期状態である。通常のseedは既存メンバーを削除せず、編集済みの名前・画像・パスワード・手動メールを上書きしない。OAuth画面の名前・役割ラベルはデモ選択用の表示であり、権限は認証後のDB所属から判断する。

seedはユーザー画像と店舗アイコンをローカルで生成し、R2へ保存する。未設定の場合だけ補い、保存済みの画像を保持する。店舗アイコンはBetter Authの組織の`logo`を使用し、`/admin/stores/$storeId/profile`で責任者・管理者が変更できる。ユーザー画像と共通の形式・サイズ検証を行う。

emulateは起動ごとに`sub`を生成するため、開発用Googleに限りissuerを`https://tablecast-google.localhost`、subjectを確認済みメールに固定する。seedは旧localhost issuerの重複だけを統合する。実Googleのissuer・subjectは変更しない。

管理画面の店舗切替はサイドバーに集約する。未所属の場合は店舗作成へのリンクと招待メールからの参加方法を表示する。Google連携解除・パスキー削除・セッション失効・メンバー削除は対象を確認して実行する。

デモメールは[共通名簿](../apps/emulate/src/tablecast-demo-identities.ts)の名.姓@店舗名.comを使う。旧デモメールの移行は開発/PR seedだけで行い、ユーザーID・所属・資格情報を保持する。模擬Googleのメール由来subjectを同時に更新し、実Googleのsubjectは変更しない。新旧アドレスが別ユーザーに割り当て済みなら停止する。Google選択画面はemulateの標準表示を使い、メールを主行、氏名・店舗・権限を副行に表示する。

## 管理画面の初期取得

管理画面の初回読込は `/api/admin/initial` でセッションと所属店舗を同時に取得する。フロアURLの場合は `storeId` を付け、所属店舗の照会結果から権限を確認したうえで既存のフロア状態を取得する。戻り先指定のないメールログイン後のクライアント遷移では、`/admin/live` に対して `defaultFloor=true` を付け、active organizationの所属店舗、なければ先頭の所属店舗のフロアも取得する。PWA起動など `/admin/live` への新規ドキュメント要求では、転送後にSSRのQueryClientが作り直されるためフロアを先読みしない。転送元はセッション・所属店舗のみを取得し、フロアは転送先で取得する。認証結果やbindingをWorker全体へキャッシュしない。Better Authが返す更新CookieはAPIからSSR応答まで引き継ぐ。

Webは初期結果をリクエスト単位のQueryClientの既存session・stores・floor queryへ設定し、loaderと画面で再利用する。セッション単独の再取得はBetter Authのget-sessionを使い、店舗一覧を再取得しない。以降のフロア再取得は既存の店舗APIを通り、その都度認可する。未認証の初期取得は空の店舗一覧とnullのsession・floorを返し、Webがログインへ戻す。所属外のstoreIdは403にする。

直接のフロアURLとログイン後のクライアント遷移の初期取得はOAuth resource・session/user・所属店舗・フロアbatchの4往復。従来の3 API合計9往復から削減する。セッション更新など追加書込のある要求は別に数える。これはDB往復数の変更であり、本番の表示時間や初回起動遅延の改善率を保証するものではない。

PWAの新規ドキュメント起動は転送元のセッション・所属店舗3往復と転送先のフロア初期取得4往復を合わせた7往復。転送を伴う起動全体を4往復とは数えない。

## stagingの認証

stagingはPR previewと共通のGoogle emulatorを専用Containerで利用する。固定originと環境名を照合し、本番へのemulator混入は拒否する。通常配備ではD1と認証secretを保持するためログイン・MCP認可が維持される。全体リセット後は旧tokenを拒否し、再ログインと再認可が必要。[stagingの公開](deployment.md#stagingの公開とremote-mcp)を参照する。

## 客向け会員

`/member`は共通のBetter Authログインから利用する。`customer_memberships`の店舗別会員はスタッフの組織所属と別で、入会で管理権限を付与しない。初回同意の版と各許可・更新版を保存する。入会の再送は既存の同意撤回を変更しない。設定の更新・退会は会員本人と店舗・更新版を確認する。会員APIとSSRはprivate/no-storeで応答する。[会員仕様](membership.md)を参照する。
