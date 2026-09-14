# 依存パッチ

## Miniflareのremote binding

`miniflare@5.20260903.0-alpha.patch` は [workers-sdk #15432](https://github.com/cloudflare/workers-sdk/pull/15432) のRPC接続の遅延生成を、採用中バージョンの配布JavaScriptへ適用する。上流のマージcommitは `f45b5968bac153d6f436f8408968573aecb44a94`。

D1・R2のHTTP操作だけでも不要なWebSocket RPC接続が生成され、処理成功後に `internal error; reference = …` が出る不具合への対応である。実際のRPC呼出しやプロパティ取得時にだけ接続を生成し、同じ接続を再利用する。ログや失敗を抑制しない。

Bunの `patchedDependencies` でインストール時に適用する。`node_modules` の手修正や起動時のmonkeypatchは不要。修正を含む公式リリースへ依存を更新するときに、このパッチと `patchedDependencies` の登録を削除する。Wrangler 4.130.0は上流修正のマージ前に公開されており、修正を含まない。

Node.js 24.7.0と実Miniflareを用い、ローカルHTTPサーバーでfetchだけのremote bindingを確認した。HTTP応答は前後とも200、HTTP要求は1回で、WebSocket upgradeは修正前1回から修正後0回になった。HTTP/RPCメソッド・プロパティ取得の回帰テストは上流PRが所有する。
