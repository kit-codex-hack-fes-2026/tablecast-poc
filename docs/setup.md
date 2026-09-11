# 開発環境のセットアップ

[仕様索引](README.md) · [開発環境の仕組み](development.md) · [テスト戦略](testing.md)

macOSではHomebrewと、起動済みのOrbStackまたはDocker Desktopを使う。コンテナを使わない場合も、LiveKit・Mailpit・Grafanaの起動にはDockerが必要である。外部APIキーなしでGUI注文・ログイン・メールを開発できる。

> [!TIP]
> 日常の入口は `bun run setup` と `bun run dev`。`dev` は初回の設定生成・migration・seedも実行する。UI部品だけなら `bun run storybook` で始められる。

## 1. cloneとworktree

Gitがなければ `brew install git`、GitHub CLIを使う場合は `brew install gh` を実行する。

```sh
git clone https://github.com/kit-codex-hack-fes-2026/tablecast-poc.git
cd tablecast-poc
git fetch origin
git worktree add -b codex/my-change ../tablecast-my-change origin/main
cd ../tablecast-my-change
```

`my-change` は作業内容に置き換える。既存branchを使う場合は `git worktree add ../tablecast-my-change codex/my-change`。以降はすべて作業先のworktreeルートで実行する。Issueの担当確認とbranch・PRの対応は [AGENTS.md](../AGENTS.md#githubの作業契約) に従う。

> [!IMPORTANT]
> `node_modules`、`livekit/.venv`、`.local` はworktree間でコピーしない。Git標準のworktree作成では環境ファイルもコピーされない。Codexの `.worktreeinclude` は `.env.local` のみを対象にする。

## 2A. Dev Containerを使う

ホストにNode・Bun・uv・Pythonを入れる必要はない。Dev Containers対応エディタで作業先を開き、Reopen in Containerを実行する。ホストの初期化処理が `.devcontainer/.env` を生成し、依存導入と `bun run dev` が自動で進む。

Docker CLIだけで始める場合も同じ構成を使う。

```sh
sh .devcontainer/tablecast-init.sh
docker compose -f .devcontainer/compose.yaml up -d --build
docker compose -f .devcontainer/compose.yaml exec tablecast bun run setup
docker compose -f .devcontainer/compose.yaml exec tablecast bun run dev
```

通常のコマンドを実行するためのshellを開くには次を使う。

```sh
docker compose -f .devcontainer/compose.yaml exec tablecast bash
```

起動ログに表示される `http://<worktree>.<repo>.container.localhost:<port>` を**ホストのブラウザー**で開く。Mailpit、Grafana、Storybookのホスト側ポートは次で確認する。Storybookはコンテナ内で別途 `bun run storybook` を実行する。

```sh
docker compose -f .devcontainer/compose.yaml port tablecast 8025
docker compose -f .devcontainer/compose.yaml port tablecast-lgtm 3000
docker compose -f .devcontainer/compose.yaml port tablecast 6006
```

ホストと同じ絶対パスにworktreeとGit共通ディレクトリをmountするため、コンテナ内でも `git status`、差分確認、コミットができる。新しいworktreeの作成・削除はホストで行う。Linuxの依存・Python環境・DBはworktree専用のDocker volumeに保存する。

> [!NOTE]
> コンテナはGUI・音声Agent・静的検査・unit/統合テスト・Storybookを開発する環境である。Docker socketは渡さないため、Dockerを直接使う `test:e2e` は2Bのホスト環境かCIで実行する。実iPadは別の端末なのでlocalhostには接続できない。[実機試験](development.md#実機公開環境)を参照する。

ブラウザー試験をコンテナ内で実行する場合は、一度だけLinux用ブラウザーとOS依存を導入する。

```sh
bunx --no-install playwright install --with-deps chromium webkit
bun run test:browser
```

OrbStackのHTTPSを使いたい場合、公開originの切替手順と構成の詳細は [Dev Container](devcontainer.md) を参照する。

## 2B. ホストでmise・uv・Bunを使う

[miseの公式手順](https://mise.jdx.dev/getting-started.html)に従い、zshで有効化する。下の `.zshrc` への追記は未設定の場合に一度だけ行う。

```sh
brew install mise
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
eval "$(mise activate zsh)"
mise trust
mise install
bun --version
node --version
uv --version
docker info
bun --no-env-file run setup
bun --no-env-file run dev
```

[mise.toml](../mise.toml) がNode 24.7.0、Bun 1.3.13、uv 0.11.26を指定する。Python 3.13は `uv sync` が必要に応じて取得する。`setup` はBunの固定lockで依存とGit hooksを導入し、Python依存を同期してParaglideを生成する。追加worktreeでも `mise trust`、`mise install`、`bun run setup` を実行する。

起動ログの `http://<worktree>.<repo>.localhost:<port>` を開く。ポート・DB・Cookieのホスト名はworktreeごとに分離する。OrbStack/Docker Desktopは停止しない。

## 3. 最初の画面確認

1. 起動URLで客向け画面を開く。
2. 同じURLの `/admin/live` で店舗側にログインする。開発用ログイン情報はworktree内の `.local/demo.json` にある。コンテナではその中のファイルを確認する。
3. 管理者で客向け画面の端末コードを卓へ割り当てる。
4. 日英表示、商品追加、確認、注文を試す。メールはMailpitで確認できる。

> [!NOTE]
> `.local/demo.json` は開発環境ごとの資格情報である。チャット・Issue・PR・スクリーンショットへ含めない。

## 4. envの命名と外部音声

必要な場合だけ、雛形を開発専用ファイルへコピーして値を記入する。既存ファイルは上書きしない。

```sh
cp -n .env.example .env.local
chmod 600 .env.local
```

[Bun標準のenv読み込み](https://bun.sh/docs/runtime/environment-variables)を使う。環境変数が優先され、ファイルは `.env` → `.env.development` → `.env.local` → `.env.development.local` の順に上書きされる。通常は `.env.example` を `.env.local` へコピーするだけでよい。開発入口は `NODE_ENV=development` を指定する。ファイルがなくてもGUIは起動できる。

CLIラッパーや独自のenv解析は置かない。起動所有者は必要な外部設定だけを子プロセスへ渡し、認証鍵・LiveKit鍵・ポート・DBはworktree内で生成する。親shellと汎用envには開発専用の設定だけを置く。CI・配備は既存の明示的な環境注入を使う。

| ファイル                     | 用途                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| `.env.example`               | 開発で入力する項目の一覧。Git管理する                       |
| `.env.local`                 | 開発専用資格と個人設定。Git管理しない                       |
| `.env.development`           | 任意の開発用共通値。現時点ではGit管理しない                 |
| `apps/api/.dev.vars.example` | Wranglerのbinding型生成用の一覧。コピーして起動設定にしない |
| `.local/.dev.vars`           | Wrangler用に生成したworktree固有の資格。手編集しない        |
| `.devcontainer/.env`         | Composeのパス・ポート用の生成物。アプリの秘密情報は入れない |

通常音声は `TABLECAST_MODEL_API_KEY`、`INWORLD_API_KEY`、日英の `TABLECAST_INWORLD_VOICE_JA/EN` が揃うとAgentが起動する。店舗のキャスト設定でも日英Voice IDを登録・公開する。一覧の取得だけなら `TABLECAST_INWORLD_VOICES_API_KEY` のみでよい。Mastraのテキスト応答と自発接客で使う `TABLECAST_MODEL` は現役の設定なので残している。

> [!WARNING]
> 音声を有効にした後の利用と `test:voice:live` は外部サービスの費用が発生する。通常の `check` は有料試験を実行しない。実音声試験の承認と手順は [LiveKit](../livekit/README.md) を参照する。

変更を反映するには `bun run dev:stop` → `bun run dev`。旧 `.env.secrets.local` の利用者は、上の雛形に残っている項目だけを `.env.local` へ移してから旧ファイルを削除する。ローカル認証は模擬Googleを使うため、旧ファイルのGoogle OAuth資格は不要である。本番Google資格は [配備手順](deployment.md) に従って管理する。

Bunの標準読み込みは暗号化envの復号を行わない。`.env.local` には開発専用の平文値を置き、Git管理しない。公開環境への配備はActions/Workersの既存secret経路を使う。

## 5. 日常の操作と検証

| コマンド              | 用途                                                   |
| --------------------- | ------------------------------------------------------ |
| `bun run dev`         | 初期化と通常起動。既に起動中ならそのURLを表示する      |
| `bun run dev:status`  | 自worktreeのURL・プロセス・保存先を確認する            |
| `bun run dev:stop`    | 自worktreeの開発プロセスだけを停止する                 |
| `bun run dev:prepare` | サーバーを起動せずDBとseedを準備する                   |
| `bun run storybook`   | UI部品とMCP。DBや外部キーは不要                        |
| `bun run check`       | format・lint・typecheck・無課金テスト                  |
| `bun run build`       | Workersのbuild                                         |
| `bun run dev:parity`  | worktreeの設定でbuildし、Vite previewを起動する        |
| `bun run demo:play`   | 背景卓を一段階進める                                   |
| `bun run demo:reset`  | 自worktreeの開発プロセスを停止しデモ状態をリセットする |

ホストでブラウザー検証を行う場合:

```sh
bunx --no-install playwright install chromium webkit
bun run test:browser
bun run test:e2e
```

E2Eはケースごとに専用のWeb/API・DB・メール環境を作る。通常の `dev` 起動は不要で、開発用のDBを操作しない。対象の選び方と有料試験との境界は [テスト戦略](testing.md) が正本である。

## 6. 終了・再開・困ったとき

ホスト開発は `bun run dev:stop`、コンテナ開発は次で停止する。`down` はvolumeを保持する。再開時は2Aの `up` と `dev` を使い、依存変更があれば `setup` を挟む。

```sh
docker compose -f .devcontainer/compose.yaml exec tablecast bun run dev:stop
docker compose -f .devcontainer/compose.yaml down
```

作業が完了し、変更を保存してあることを確認したら、ホストで `git worktree remove ../tablecast-my-change` を実行する。未保存の変更があればGitの拒否を解消してから削除する。

| 症状                          | 確認・復旧                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dockerに接続できない          | OrbStack/Docker Desktopを起動し、`docker info` と選択中のcontextを確認する                                                                                                |
| コンテナの公開ポートが使用中  | 先に自分のComposeを `down` し、`TABLECAST_PORT_BASE=61000 sh .devcontainer/tablecast-init.sh` で空いている7ポートへ変更して `up` する。エディタ起動時も同じ環境変数を渡す |
| 起動が失敗する                | `.local/logs/dev.log` を実行した環境の中で読む。修正後に `dev:stop` → `dev`                                                                                               |
| 依存・生成コード・hooksがない | 作業先で `bun run setup`。hookだけなら `bun run hooks:install`                                                                                                            |
| 音声が未設定になる            | 4項目と店舗のVoice IDを確認し、再起動する。値をログへ出さない                                                                                                             |
| コンテナのGitが動かない       | ホストでinitを実行してコンテナを再作成する。clone元を移動した場合はホストでworktree配置も修復する                                                                         |

開発ツールの版、依存導入、env、スクリプト、devcontainerを変更したら、この文書と関連設定を同じ差分で更新する。実行済みの検証と未実施範囲を区別して報告する。
