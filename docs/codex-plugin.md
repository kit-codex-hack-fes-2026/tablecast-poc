# Codex プラグイン

卓上ゲームの制作依頼も同梱skillで扱う。実行基盤はTableCast側が所有し、Codexは`get_game_spec`・`register_game`・`validate_game`等のMCPを制作入口として使う。[ゲームプラグイン仕様](game-plugins.md)を参照する。stagingでは既存の`tablecast-staging`接続を使い、配備済みツール一覧にゲーム操作が含まれることを確認してから制作する。

この文書は店舗メニュー・接客設定と卓上ゲームを操作する製品プラグインを扱う。TableCastを開発するagentのskills・Cloudflare・Grafana等の導入は[setup](setup.md#2c-agent開発環境)を参照する。

## 管理画面からの導入

店舗の利用者は、公開MCP `https://tablecast.kit-codex.workers.dev/mcp` へOAuthで接続する。リポジトリのclone、開発サーバー、pluginの生成は不要である。

`/account/integrations/plugins` はGitHub Marketplaceからの導入とリモートMCPへのOAuth接続を案内する。`/account/integrations/manual` は任意のMCPクライアント向けの接続URL・Streamable HTTP・OAuth 2.1/PKCE/DCR設定と、同梱SKILL.mdの任意ダウンロードを提供する。staging以外の画面の接続URLは公開pluginの`plugins/tablecast/.mcp.json`を直接参照し、ローカル画面でも本番を案内する。スキルの追加だけでは接続や権限を付与しない。

`/account/mcp-sessions` ではOAuth接続の日時・scope・有効期限を確認し、不要な接続を解除する。認可コードとPKCE、組織選択、明示同意を経て発行したアクセストークンだけを受け付ける。クライアントの初回接続には動的クライアント登録を使用する。登録だけでは店舗へのアクセス権を持たない。認可・scopeの契約は[MCP仕様](mcp.md)を参照する。

### GitHub Marketplaceから導入する

公開Plugins Directoryには未掲載のため、CodexへGitHubの配布元を追加し、TableCastをインストールする。利用者がリポジトリをcloneする必要はない。

```sh
codex plugin marketplace add kit-codex-hack-fes-2026/tablecast-poc
codex plugin add tablecast@tablecast
```

`.agents/plugins/marketplace.json`が`plugins/tablecast`のMCP接続と店舗設定・ゲーム制作用skillを配布する。配布元の`source: local`は同じリポジトリ内のplugin配置を示し、接続するMCPはCloudflare本番のHTTPS URLである。

インストール時のOAuth画面でTableCastへログインし、対象の組織とscopeを確認して同意する。認証情報の保管はクライアントに任せる。新しいチャットを開始し、`get_configuration`が対象店舗のIDと名前を返すことを確認する。インストール成功だけで接続済みと判定しない。[公式のplugin導入ガイド](https://learn.chatgpt.com/docs/plugins)を参照する。

### リモートMCPを直接登録する

クライアントのMCP接続設定で公開URLを追加し、OAuth認証を選ぶ。Codex DesktopではSettings → MCP servers → Add serverからStreamable HTTPのURLを設定し、再起動後にAuthenticateからログインする。CLIでは次を実行する。

```sh
codex mcp add tablecast --url https://tablecast.kit-codex.workers.dev/mcp
codex mcp login tablecast --scopes tablecast:read
```

登録方式はCodexの自動選択を使う。TableCastは認証サーバーのmetadataでDCRの登録先を公開するため、ログイン時に方式を固定する追加オプションは不要である。[公式のOAuthクライアント登録](https://learn.chatgpt.com/docs/extend/mcp#oauth-client-registration)を参照する。

書込みが必要な場合は`--scopes tablecast:read,tablecast:write`で再認可する。plugin経由でも手動接続でも、設定の公開には管理画面での明示承認が必要である。複数店舗では接続URLの`?storeId=...`で対象を指定する。省略時は許可された組織内の最初の店舗となる。

商品画像の設定には`upload_image`を使い、返された画像キーと出所を`update_draft`へ渡す。[入力制限・画像データの受渡し・失敗時の再開](mcp.md#商品画像の取り込み)を参照する。ChatGPTでは公式fileParamsによる生成・添付ファイルの受渡しを使う。架空店の一括試作は同梱skillの手順に沿って店名・日英商品・画像・カスタマイズを検証済み下書きへ保存する。クライアントで実データの受渡しまで確認する。

pluginを導入済みなら同じMCPを手動で重複登録しない。ChatGPT WebはローカルのCodex設定を参照しないため、利用できるplugin経由で接続する。クライアントごとの対応と操作は[公式MCPガイド](https://learn.chatgpt.com/docs/extend/mcp)を参照する。

## ローカル接続

ここからは開発者向けの検証手順であり、製品のWeb画面には掲載しない。日常のMCP動作確認では、対象worktreeの`.codex/config.toml`へ`tablecast-local`として直接登録する。本番pluginの導入や再生成は不要である。

1. [setup](setup.md)に従って対象worktreeの開発サーバーを起動する（ホストは`bun run dev`、Dev Containerは`bun run dev:container`）。別ターミナルを同じworktreeで開き、起動ログのURL、または次の読取でMCP URLを確認する。

   ```sh
   bun --no-env-file -e 'import { readRuntime } from "./scripts/tablecast-runtime"; console.log(`${(await readRuntime()).origin}/mcp`)'
   ```

2. Git管理外の`.codex/config.toml`へ次のテーブルだけを追加し、`<local-origin>`を確認したURLのoriginへ置き換える。既存のGrafana・Storybook・本番MCP設定は保持する。Dev Container利用時は[接続元ホストの選択](setup.md#mcp設定の配置と確認)も確認する。

   ```toml
   [mcp_servers.tablecast-local]
   url = "<local-origin>/mcp"
   ```

3. そのworktreeのルートで登録先を確認してOAuthログインする。ブラウザーの接続先もローカルoriginであることを確かめ、その環境の`.local/demo.json`にある開発用アカウントで対象店舗と読取権限に同意する。

   ```sh
   codex mcp get tablecast-local
   codex mcp login tablecast-local --scopes tablecast:read
   ```

4. Codex Desktopではこのworktreeを開いてMCP接続を再起動し、CLIでは同じルートから新しい`codex`セッションを開始する。tool一覧を確認し、`tablecast-local`の`get_configuration`を呼び、店舗ID・名前がローカル管理画面のfixtureと一致することを確認する。登録成功やHTTP応答だけで完了としない。書込みの検証が必要なときだけ`tablecast:read,tablecast:write`で再認可する。

ローカル画面の利用者向け導入案内は本番URLのため、この開発手順で接続先を選ぶ。ポートが変わったら`tablecast-local`のURLとOAuth接続を更新する。検証後は[終了手順](setup.md#6-終了再開復旧)に従って起動したプロセスを停止する。

### ローカルpluginの配布を検証する場合

pluginの同梱MCP・skill・インストール時のOAuthを確認するときだけ、開発サーバー起動後に生成する。

```sh
bun --no-env-file scripts/tablecast-plugin.ts
codex plugin marketplace add "$PWD/.local/tablecast-plugin-marketplace"
codex plugin add tablecast@tablecast
```

生成先は`.local/tablecast-plugin-marketplace`だけで、そのcheckoutの現在のURLを持つ。リポジトリの公開pluginと`.codex/config.toml`は更新せず、既存設定を維持したまま再生成できる。公開・ローカルともplugin名は`tablecast@tablecast`のため、導入前に`codex plugin marketplace list`で登録元を、導入後にMCP接続設定で実URLを確認する。別worktreeや本番向けの登録がある場合は、上記の直接接続を使う。配布自体の検証は、既存の登録元を切り替えてよい開発環境で行う。

同じローカル接続をpluginと`tablecast-local`の両方で同時に有効にしない。OAuth認証と最小読取は上記と同じローカルorigin・fixtureで確認する。ポートが変わった場合は生成とプラグインの再インストール、必要に応じてOAuthログインを再実行する。

旧生成物に`# TableCast generated local MCP`が残る場合も自動削除しない。接続を切り替える開発者は旧`[mcp_servers.tablecast]`の接続先を確認して重複分だけを取り除き、他サーバーの設定を保持する。

## ブランド画像の配布

`plugins/tablecast/assets`に正本ロゴの黒・白透過PNGと白背景composerアイコンを同梱する。`plugin.json`の`interface.composerIcon`・`logo`・`logoDark`はpluginルートからの相対パスを使う。[素材の更新手順](design/icons/README.md#実装への配布)に従い、画像変更時もversionを更新する。ローカル生成は既存のディレクトリコピーで画像を含める。生成・manifest検証と、インストール済みクライアントへの反映は別々に確認する。

## 公開接続先の更新

保守担当は[本番の配備先](deployment.md)と照合したHTTPS originを指定して、公開対象の`plugins/tablecast/.mcp.json`を更新する。

```sh
bun --no-env-file scripts/tablecast-plugin.ts "$TABLECAST_PUBLIC_ORIGIN"
```

pluginのversionも更新し、Marketplaceからplugin・MCP・skillへの参照と本番接続先を確認してコミット・pushする。公開設定の変更と実際のデプロイ・OAuth疎通は別に確認する。ローカル生成物と公開パッケージを分け、checkout固有のポートや認証情報を公開しない。

## stagingのremote MCP確認

stagingの管理画面に表示される固定URLを`tablecast-staging`名で直接登録する。本番pluginとローカル接続は維持する。ブラウザーでAccessへログインし、模擬Google認証・組織選択・scope同意を経て接続する。ChatGPT・Codexそれぞれで設定取得と下書き更新を確認し、公開は管理画面の明示承認で行う。再配備後の認可保持と、全体リセット後の旧token拒否・再認可を区別して記録する。[環境・リセット](deployment.md#stagingとreleaseの運用)を参照する。
