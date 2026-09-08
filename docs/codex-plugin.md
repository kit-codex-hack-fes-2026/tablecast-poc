# Codex プラグイン

`plugins/tablecast` にMCP接続とメニュー設定用のスキルをまとめ、`.agents/plugins/marketplace.json` から配布する。OAuth Provider は `/api/auth/oauth2/*`、MCP は `/mcp`。認可コードとPKCE、組織選択、明示同意を経て発行したアクセストークンだけを受け付ける。クライアントの初回接続には未認証の動的クライアント登録を使用する。登録だけでは店舗へのアクセス権を持たない。

## ローカル接続

開発サーバーを起動してから実行する。

```sh
bun --no-env-file scripts/tablecast-plugin.ts
codex plugin marketplace add "$PWD/.local/tablecast-plugin-marketplace"
codex plugin add tablecast@tablecast
codex mcp login tablecast --scopes tablecast:read --oauth-client-registration dcr
```

生成した `.codex/config.toml` はGit管理外で、そのcheckoutの現在のURLを持つ。既存の手書き設定は上書きしない。秘密値は含まない。認証情報の保管はCodexに任せる。新しいCodexタスクでプラグインが読み込まれる。

書込みが必要な利用者は `tablecast:read,tablecast:write` を指定して再認可する。設定の公開はMCPだけでは完了せず、管理画面での明示承認を要求する。複数店舗では接続URLの `?storeId=...` で対象を指定する。省略時は許可された組織内の最初の店舗となり、`get_configuration` が店舗IDと名前を返す。

ローカルのポートが変わった場合は生成とプラグインの再インストール、必要に応じてOAuthログインを再実行する。

## デプロイ後のGitHub配布

実際のHTTPS originを渡すと、公開対象の `plugins/tablecast/.mcp.json` を更新する。

```sh
bun --no-env-file scripts/tablecast-plugin.ts "$TABLECAST_PUBLIC_ORIGIN"
```

変更を確認してプラグインのversionとともにコミット・pushした後、利用者はGitHubリポジトリを指定して導入する。

```sh
codex plugin marketplace add kit-codex-hack-fes-2026/tablecast-poc
codex plugin add tablecast@tablecast
```

公開URL未確定の現在、リポジトリ内パッケージはDev Containerの `http://localhost:3000/mcp` を向く。実デプロイの完了を表さない。ローカル生成物と公開パッケージを別にし、checkout固有のポートや認証情報を公開しない。
