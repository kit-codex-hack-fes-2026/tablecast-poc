# 認証とアカウント

Better Auth がメール、Google OAuth、パスキー、組織、OAuth Provider、端末コードの認証状態を所有する。同一メールの Google アカウントは検証済みメールだけを既存ユーザーへ連携する。異なるメールへの連携と最後のログイン手段の解除は許可しない。メールとパスワードのログインにはメール確認が必要。

## ローカル

`bun run dev:parity` または `bun run dev` が vercel/emulate の Google サービスと Mailpit を起動する。実 Google アカウントや SMTP 認証情報は不要。URL・ポートは `.local/runtime.json`、メール一覧はその `ports.mailpit` の `http://127.0.0.1:<port>`。既存データは保持する。

Google の選択画面では `tablecast-owner@example.test` と `tablecast-member@example.test` を利用できる。これらは実在ユーザーを表さない。デモ管理者の認証情報は `.local/demo.json`。デモ seed だけが開発用管理者のメールを確認済みにする。

`/account` で名前・画像・セッション・Google連携・パスキーを管理する。`/organisations` で組織作成、招待、役割変更、退会処理を行う。一般メンバーの店舗アクセスは店舗に紐づくチームへの所属が必要。端末のQRは `/device?user_code=...` を開き、ログイン済みスタッフが店舗と卓を選んで承認する。コードの読取りだけでは承認しない。

## 公開環境

Google Cloud の OAuth Web クライアントのリダイレクトURIを `TABLECAST_PUBLIC_ORIGIN/api/auth/callback/google` に登録し、`TABLECAST_GOOGLE_CLIENT_ID` と `TABLECAST_GOOGLE_CLIENT_SECRET` を Wrangler の secret として設定する。`TABLECAST_GOOGLE_EMULATOR_URL` と `TABLECAST_MAILPIT_URL` は公開環境で設定しない。開発環境以外での利用はAPIが拒否する。

Cloudflare Email Service で送信ドメインを検証し、送信可能なメールアドレスを `TABLECAST_EMAIL_FROM` に設定する。`apps/api/wrangler.jsonc` の `TABLECAST_EMAIL` binding で React Email の HTML とテキストを送信する。招待、メール確認、パスワード再設定は同じテンプレートを使用する。

パスキーは origin/RP ID に結びつく。localhost と本番ドメイン間では再登録が必要。HTTPSで提供し、実機の認証器でも公開前に登録とログインを確認する。

## デモの所属とローカルID

Googleモックでは佐藤 晴香（`tablecast-owner@example.test`、こもれびの管理者）、田中 蓮（`tablecast-member@example.test`、こもれび担当）、小林 直子（`tablecast-akari@example.test`、あかり担当）、山本 翼（`tablecast-koharu@example.test`、こはるの管理者）を選べる。伊藤 葵（`tablecast-link@example.test`）は未所属からの導線確認用。すべて架空の人物である。名前・画像を変更した既存ユーザーのプロフィールはseedで上書きしない。

emulateは起動ごとに`sub`を生成するため、開発用Googleに限りissuerを`https://tablecast-google.localhost`、subjectを確認済みメールに固定する。seedは旧localhost issuerの重複だけを統合する。実Googleのissuer・subjectは変更しない。

管理画面の組織切替はサイドバーに集約する。未所属の場合は組織作成と招待メールからの参加方法を表示し、所属済みの場合はメンバー管理を優先する。Google連携解除・パスキー削除・セッション失効・メンバー削除は対象を確認して実行する。
