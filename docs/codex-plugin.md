# Codex プラグイン

この文書は店舗メニュー・接客設定を操作する製品プラグインを扱う。TableCastを開発するagentのskills・Cloudflare・Grafana等の導入は[setup](setup.md#2c-agent開発環境)を参照する。

## 管理画面からの導入

店舗の利用者は、公開MCP `https://tablecast.kit-codex.workers.dev/mcp` へOAuthで接続する。リポジトリのclone、開発サーバー、pluginの生成は不要である。

`/account/integrations/plugins` はGitHub Marketplaceからの導入とリモートMCPへのOAuth接続を案内する。`/account/integrations/manual` は任意のMCPクライアント向けの接続URL・Streamable HTTP・OAuth 2.1/PKCE/DCR設定と、同梱SKILL.mdの任意ダウンロードを提供する。画面の接続URLは公開pluginの`plugins/tablecast/.mcp.json`を直接参照し、ローカル画面でも本番を案内する。スキルの追加だけでは接続や権限を付与しない。

`/account/mcp-sessions` ではOAuth接続の日時・scope・有効期限を確認し、不要な接続を解除する。認可コードとPKCE、組織選択、明示同意を経て発行したアクセストークンだけを受け付ける。クライアントの初回接続には動的クライアント登録を使用する。登録だけでは店舗へのアクセス権を持たない。認可・scopeの契約は[MCP仕様](mcp.md)を参照する。

### GitHub Marketplaceから導入する

公開Plugins Directoryには未掲載のため、CodexへGitHubの配布元を追加し、TableCastをインストールする。利用者がリポジトリをcloneする必要はない。

```sh
codex plugin marketplace add kit-codex-hack-fes-2026/tablecast-poc
codex plugin add tablecast@tablecast
```

`.agents/plugins/marketplace.json`が`plugins/tablecast`のMCP接続とメニュー設定用skillを配布する。配布元の`source: local`は同じリポジトリ内のplugin配置を示し、接続するMCPはCloudflare本番のHTTPS URLである。

インストール時のOAuth画面でTableCastへログインし、対象の組織とscopeを確認して同意する。認証情報の保管はクライアントに任せる。新しいチャットを開始し、`get_configuration`が対象店舗のIDと名前を返すことを確認する。インストール成功だけで接続済みと判定しない。[公式のplugin導入ガイド](https://learn.chatgpt.com/docs/plugins)を参照する。

### リモートMCPを直接登録する

クライアントのMCP接続設定で公開URLを追加し、OAuth認証を選ぶ。Codex DesktopではSettings → MCP servers → Add serverからStreamable HTTPのURLを設定し、再起動後にAuthenticateからログインする。CLIでは次を実行する。

```sh
codex mcp add tablecast --url https://tablecast.kit-codex.workers.dev/mcp
codex mcp login tablecast --scopes tablecast:read --oauth-client-registration dcr
```

書込みが必要な場合は`--scopes tablecast:read,tablecast:write`で再認可する。plugin経由でも手動接続でも、設定の公開には管理画面での明示承認が必要である。複数店舗では接続URLの`?storeId=...`で対象を指定する。省略時は許可された組織内の最初の店舗となる。

pluginを導入済みなら同じMCPを手動で重複登録しない。ChatGPT WebはローカルのCodex設定を参照しないため、利用できるplugin経由で接続する。クライアントごとの対応と操作は[公式MCPガイド](https://learn.chatgpt.com/docs/extend/mcp)を参照する。

## ローカル接続

ここからは開発者向けの検証手順であり、製品のWeb画面には掲載しない。開発サーバーを[setup](setup.md)に従って起動してから実行する。

```sh
bun --no-env-file scripts/tablecast-plugin.ts
codex plugin marketplace add "$PWD/.local/tablecast-plugin-marketplace"
codex plugin add tablecast@tablecast
```

生成先は`.local/tablecast-plugin-marketplace`だけで、そのcheckoutの現在のURLを持つ。リポジトリの公開pluginと`.codex/config.toml`は更新せず、GrafanaやStorybook等の既存設定を維持したまま再生成できる。pluginに同梱したMCPを使い、同じ接続を設定ファイルへ重複登録しない。OAuth認証と最小読取は上記の接続確認に従う。

ローカルのポートが変わった場合は生成とプラグインの再インストール、必要に応じてOAuthログインを再実行する。管理画面の案内は本番URLのため、ローカル検証には生成したpluginのURLを使う。

### 開発用MCPを手動登録する場合

pluginを使わずMCPだけを検証する場合は、Git管理外の`.codex/config.toml`へ次のテーブルだけを追加する。`<origin>`をこのworktreeの起動URLへ置き換え、他のMCP設定は保持する。OAuthログインの手順はリモート接続と共通である。

```toml
[mcp_servers.tablecast]
url = "<origin>/mcp"
```

旧生成物に`# TableCast generated local MCP`が残る場合も自動削除しない。pluginへ切り替える開発者は重複する`[mcp_servers.tablecast]`だけを取り除き、他サーバーの設定を保持する。

## 公開接続先の更新

保守担当は[本番の配備先](deployment.md)と照合したHTTPS originを指定して、公開対象の`plugins/tablecast/.mcp.json`を更新する。

```sh
bun --no-env-file scripts/tablecast-plugin.ts "$TABLECAST_PUBLIC_ORIGIN"
```

pluginのversionも更新し、Marketplaceからplugin・MCP・skillへの参照と本番接続先を確認してコミット・pushする。公開設定の変更と実際のデプロイ・OAuth疎通は別に確認する。ローカル生成物と公開パッケージを分け、checkout固有のポートや認証情報を公開しない。
