# Codex プラグイン

この文書は店舗メニュー・接客設定を操作する製品プラグインを扱う。TableCastを開発するagentのskills・Cloudflare・Grafana等の導入は[setup](setup.md#2c-agent開発環境)を参照する。

## 管理画面からの導入

`/account/integrations/plugins` にMarketplace、ChatGPT開発者モード、ローカルリポジトリの導入手順を置く。`/account/integrations/manual` は任意のMCPクライアント向けのStreamable HTTP・OAuth 2.1/PKCE/DCR設定と、同梱SKILL.mdのダウンロードを提供する。スキルを配置するだけでは接続や権限を付与しない。`/account/mcp-sessions` はOAuth接続の日時・scope・有効期限と解除を扱う。

ChatGPT開発者モードの入口はSettings → Security and login。PluginsでMCPを登録し、接続の`plugin_asdk_app` IDをplugin-creatorへ渡してスキル付きパッケージへ組み込む。クラウドからの接続には公開HTTPSまたはSecure MCP Tunnelが必要。ローカル配布元を追加した後はアプリを再起動し、Plugins DirectoryからTableCastをインストールする。[公式パッケージガイド](https://developers.openai.com/plugins/build/plugins)、[接続ガイド](https://developers.openai.com/plugins/deploy/connect-chatgpt)を参照する。

現時点で公開Plugins Directoryには未掲載で、GitHubパッケージはlocalhost向けである。この状態を導入ページにも表示する。ローカルの生成手順は現在のworktree URLを使い、公開URLと混同しない。

`plugins/tablecast` にMCP接続とメニュー設定用のスキルをまとめ、`.agents/plugins/marketplace.json` から配布する。OAuth Provider は `/api/auth/oauth2/*`、MCP は `/mcp`。認可コードとPKCE、組織選択、明示同意を経て発行したアクセストークンだけを受け付ける。クライアントの初回接続には未認証の動的クライアント登録を使用する。登録だけでは店舗へのアクセス権を持たない。

## ローカル接続

開発サーバーを起動してから実行する。

```sh
bun --no-env-file scripts/tablecast-plugin.ts
codex plugin marketplace add "$PWD/.local/tablecast-plugin-marketplace"
codex plugin add tablecast@tablecast
```

生成先は `.local/tablecast-plugin-marketplace` だけで、そのcheckoutの現在のURLを持つ。`.codex/config.toml` は作成・更新しないため、GrafanaやStorybook等の接続設定を維持したまま再生成できる。pluginに同梱したMCPを使い、同じ接続を設定ファイルへ重複登録しない。

Marketplaceの `ON_INSTALL` に従ってCodexのOAuth接続画面で組織とscopeを確認して同意する。認証情報の保管はCodexに任せる。新しいCodexタスクでプラグインを読み込み、`get_configuration` が対象店舗のIDと名前を返すことを確認する。認証や接続が済んでいない状態をインストール成功だけで判定しない。

ローカルのポートが変わった場合は生成とプラグインの再インストール、必要に応じてOAuthログインを再実行する。

### MCPを手動登録する場合

pluginを使わずCodex CLIからMCPだけを確認する場合は、Git管理外の `.codex/config.toml` へ次のテーブルだけを追加する。`<origin>` をこのworktreeの起動URLへ置き換え、他のMCP設定は保持する。

```toml
[mcp_servers.tablecast]
url = "<origin>/mcp"
```

```sh
codex mcp login tablecast --scopes tablecast:read --oauth-client-registration dcr
```

書込みが必要な場合は `--scopes tablecast:read,tablecast:write` で再認可する。plugin経由でも手動接続でも、設定の公開には管理画面での明示承認が必要である。複数店舗では接続URLの `?storeId=...` で対象を指定する。省略時は許可された組織内の最初の店舗となる。

旧生成物に `# TableCast generated local MCP` が残る場合も自動削除しない。pluginへ切り替える利用者は重複する `[mcp_servers.tablecast]` だけを取り除き、他サーバーの設定を保持する。[CodexのMCP設定とOAuth](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)を参照する。

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
