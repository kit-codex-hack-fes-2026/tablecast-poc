# 依存パッチ

## Miniflareのremote binding

`miniflare@5.20260903.0-alpha.patch` は [workers-sdk #15432](https://github.com/cloudflare/workers-sdk/pull/15432) のRPC接続の遅延生成を、採用中バージョンの配布JavaScriptへ適用する。上流のマージcommitは `f45b5968bac153d6f436f8408968573aecb44a94`。

D1・R2のHTTP操作だけでも不要なWebSocket RPC接続が生成され、処理成功後に `internal error; reference = …` が出る不具合への対応である。実際のRPC呼出しやプロパティ取得時にだけ接続を生成し、同じ接続を再利用する。ログや失敗を抑制しない。

Bunの `patchedDependencies` でインストール時に適用する。`node_modules` の手修正や起動時のmonkeypatchは不要。修正を含む公式リリースへ依存を更新するときに、このパッチと `patchedDependencies` の登録を削除する。Wrangler 4.130.0は上流修正のマージ前に公開されており、修正を含まない。

Node.js 24.7.0と実Miniflareを用い、ローカルHTTPサーバーでfetchだけのremote bindingを確認した。HTTP応答は前後とも200、HTTP要求は1回で、WebSocket upgradeは修正前1回から修正後0回になった。HTTP/RPCメソッド・プロパティ取得の回帰テストは上流PRが所有する。

## emulate 0.11.1 のGoogleユーザー画像

[emulate@0.11.1.patch](emulate@0.11.1.patch)は、Google OAuthのユーザー選択画面で標準seedの`picture`を表示する。氏名・店舗・役割と同じ名簿のアイコンを選べるようにするため、#118で追加した。画像なしの既存HTMLは維持し、画像読込失敗時はイニシャル表示へ戻す。属性値には上流の`escapeAttr`を使う。氏名・店舗・権限を主行、メールを副行へ表示し、デモ人物が存在するときは既定のTest Userを一覧から外す。

対象版は`emulate@0.11.1`、上流タグ`v0.11.1`のSHAは`037ffc1ae13b477ee0eb0733b60b912a128e9375`。対応する上流ソースは[共通ユーザー部品](https://github.com/vercel-labs/emulate/blob/037ffc1ae13b477ee0eb0733b60b912a128e9375/packages/%40emulators/core/src/ui.ts)と[Google OAuth](https://github.com/vercel-labs/emulate/blob/037ffc1ae13b477ee0eb0733b60b912a128e9375/packages/%40emulators/google/src/routes/oauth.ts)。配布物のGoogle専用bundleだけを変更し、他providerの画面を変えない。

導入は既存の`bun install --frozen-lockfile`で適用する。更新時は上流の`picture`描画対応を確認し、対応済みならpatchと`patchedDependencies`を削除してlockfileを更新する。継続が必要なら`bun patch emulate@<version>`で新しい配布物へ同じ最小変更を適用し、Google chooserの画像・名前・役割と画像なし表示を確認する。手でキャッシュや共有worktreeのnode_modulesを修正しない。
