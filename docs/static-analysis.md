# 静的解析・設定・品質フック

[索引](README.md) / [テスト戦略](testing.md)

## スターターからの採用範囲

参照リポジトリのBun/Turbo、明示的な公開入口、型・import境界、統合テスト中心の考え方を採用する。
同じ巨大なworkspace一覧、固定行数budget、全アプリ共通の抽象層、全種類の品質ツールはコピーしない。[参照と採否](sources.md#reference-repositories)
安全性を保つルールは強制し、好みの構文をそろえるためだけにファイル分割・ラッパー・型キャストを増やさない。

## 初期設定ファイル

| ファイル                                         | 意図                                                     |
| ------------------------------------------------ | -------------------------------------------------------- |
| root package.json / bun.lock                     | Bun workspaces、正確なpackageManager、再現可能な依存     |
| turbo.json                                       | build/test/checkの依存関係、devはpersistentかつcache無効 |
| oxlint.config.ts                                 | 小さな共通ルールとWeb/API/testのoverride                 |
| oxfmt.config.ts                                  | TS/JSON/Markdown等の統一した整形                         |
| lefthook.yml                                     | 段階的な検証、部分stageの保全                            |
| apps/webのtsconfig / Vite / Storybook            | クライアントとSSR、部品試験                              |
| apps/apiのtsconfig / Wrangler / Vitest / Drizzle | workerd、実Binding、migration                            |
| livekit/pyproject.toml / uv.lock                 | Python依存、ruff、ty、pytest                             |

このZIPは設定の意図を規定する。依存バージョン未確定の実行用設定を先に大量生成しない。
固定された互換組合せで公式exampleを通してから設定をcommitする。config共有packageは初期不要。

## Oxlintの必須方針

全ルールを一括有効化せず、correctness・suspiciousを基礎に必要なものを明示する。各rule名・option・対応状況は導入版のschemaで確認する。[S20](sources.md#s20)

| 目的             | ルール候補・設定方針                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------- |
| 非同期処理の脱落 | `typescript/no-floating-promises`、`typescript/no-misused-promises` を型付き解析で検査    |
| 不明な入力の扱い | `typescript/no-explicit-any`、危険なassignment/call/returnの検査。外部値はunknownから絞る |
| 型の強制         | `typescript/no-non-null-assertion`、危険な型assertion。`as unknown as` で不整合を隠さない |
| 型だけのimport   | `typescript/consistent-type-imports`、type-only export                                    |
| 循環・自己参照   | `import/no-cycle`、`import/no-self-import`、重複import                                    |
| runtime境界      | `no-restricted-imports` でWebからAPI内部DB/auth/agentを禁止                               |
| 危険な実行       | eval、動的Function生成、予期しないthrow/catchや比較を検出                                 |
| React            | hooksの正しい呼出しと依存、key、使用するJSXアクセシビリティ規則                           |
| テスト           | exclusive test、不正なexpect、未awaitの非同期テストを検出                                 |
| 無効化の管理     | 不要なdisable directiveを報告し、広いファイル・フォルダーignoreを避ける                   |

採用版で未対応のルール名を置いて通ったことにしない。必要な安全性をTypeScript・testで補い、代替策と理由を記録する。
`void promise` だけでエラー処理を省略しない。意図した非同期処理にはcatchと記録、Workersでは必要に応じてctx.waitUntilを使う。
モデル・Hono・DBの公開契約を `any` でつながない。第三者の型不足の回避は一箇所へ限定し、根拠と除去条件を残す。

### import境界

Webで許すAPI側のimportは `@tablecast/api/client` と、必要な公開schema/typeだけ。型だけならruntime評価させない。
APIからWebのfeature・UIをimportしない。PythonはHTTPで接続し、TypeScriptの私有実装の構造をコピーしない。
`Bun.*` は開発scriptに限り、本番Workerやブラウザーで使わない。Node専用APIも実runtimeに合う範囲へ限定する。
既存の設定によるimport制限で足りる限り、独自の境界チェッカーを作らない。

### 強制しないもの

すべての関数をarrowへ変更するルール、interface/typeの好み、すべての `as const` / satisfies禁止、固定の非常に短い行数budgetは採用しない。
単純な関数をbudget回避のため複数ファイルへ分割しない。複雑さは分岐・責務・テスト難度で判断する。
行数や複雑度を導入する場合もレビュー用の目安から始め、業務の明瞭さを壊す例外回避を誘発しない。

## 型付き解析と型検査

TypeScriptはstrictを基本に、noUncheckedIndexedAccess、exactOptionalPropertyTypes、noImplicitOverride等を実ライブラリと合わせて確認する。
unsafeな外部境界は実行時schemaで検証する。型検査だけでは認可やJSON入力の安全性を証明できない。
Oxlintの型付き解析は必要なエンジンとTypeScriptの互換条件がある。参照スターターの古いTypeScript pinと現行Oxlintを無検証で混ぜない。[S20](sources.md#s20)
型付きルールが実際に実行されることを小さい失敗例で確認する。`tsc --noEmit` を初期の型ゲートに残し、Oxlintだけで完全代替できると仮定しない。
ルールのためだけに本番とテストで異なる型契約を作らない。

## Oxfmt・Python

Oxfmtは追跡対象のコード・Markdown・設定に使用し、生成物・node_modules・uv.lock等の適切な対象外を設定する。
日本語文書やコメントを英語へ変換しない。文書の折返しを目的に説明を省略しない。
Pythonはruff check、ruff format、ty check、pytest。Bun側と同じルールを無理に一対一で再現しない。
ruffは基本エラー、import、未使用、安全な修正から始める。日本語のdocstring・テスト名を禁止するASCII限定ルールは有効にしない。
第三者pluginの既存文体は無関係に書き換えない。patchに必要な自作の説明・テストは日本語で書き、上流へ提出する際の規約調整は別の差分として明示する。

## Lefthook

pre-commitは変更ファイルへのformat/lint、必要な関連テストまで。重い全ブラウザー試験・有料音声試験を毎commitへ入れない。
部分stageを壊さない。`git add .` や無関係な差分の自動stageは禁止。formatterの自動stageを使う場合は部分stageを保全できる挙動を先に検証する。
pre-pushは設定せず、push時に全体検証を繰り返さない。無課金の全体検証はCIで実行し、ローカルで必要な場合は `bun run check` を使う。
commit-msgはrootの `commitlint.config.ts` を使う。公式の `@commitlint/config-conventional` と本文・Issue参照必須の組込みルールを採用し、Gitmojiの先頭検査だけを追加する。CIの静的解析ジョブは履歴を取得し、PRではbaseからheadまで、mainへのpushでは直前のコミットを同じ設定で検査する。
失敗時の `--no-verify`、skip、全ignoreを通常手順にしない。起動した別worktreeのGit設定を変更しない。

## 依存・CI

Bun/Node/Pythonの必要バージョン、lockfile、Wrangler/Vite/Cloudflare Vitestの互換組合せを最初の接続ゲートで固定する。
CIはbun.lockとuv.lockの存在を検査し、frozen指定で導入する。未知の最新バージョンを毎回bunxで取得して検査を変えない。
通常はroot scriptからローカル導入済みCLIを起動する。workspace同士はworkspace依存を使い、同じ依存の不要な二重pinを増やさない。
Knipや重複検知は必要が生じた場合の追加とし、初期PoCで複数の同種静的ツールを一括必須化しない。
生成型・migrationの差分を確認する。デプロイ、seed、reset、外部モデルの実行はTurbo cacheの再利用対象にしない。

## Webの追加ルール

`apps/web/oxlint.config.ts` でReact Doctor、jsx-a11y、TanStack Query/Router、Tailwindを有効にする。TailwindのCSS入口は設定ファイルから絶対パスへ解決し、ルートとworkspaceのどちらから実行しても同じ検査になる。`--deny-warnings` により警告も検証失敗にする。React Compilerを採用していないため、その導入を前提に手動memo化を禁止するルールは適用しない。

## CIの実行単位

GitHub Actionsでは静的解析、単体・実Binding・音声接続テスト、Workers・Storybookビルド、UI部品試験、Chromium/WebKitのE2E、合成音声WebRTCを独立ジョブで実行する。matrixは失敗時にも他の検証を継続する。ブラウザーごとのrunnerとfixtureでDB・プロセスを分離する。通常CIは外部の有料モデルを呼ばない。

共通actionは固定版のNode/Bunと、必要なジョブだけPythonを導入する。Bunの取得cacheとuvの公式cacheをlockfileで更新し、node_modulesやDBは共有しない。Playwrightはジョブに必要なブラウザーだけ導入する。Paraglideは型付きlintの前に生成し、ローカルの生成済みファイルに依存しない。失敗したE2Eのtraceと画像は7日間保持する。

## skillsと追加pluginの所有

このリポジトリでは自作・外部skillsを `.agents/skills` に直接置く。外部の `animate`、`emil-design-eng`、`mastra` は `bunx skills` で導入し、`skills-lock.json` に取得元を残す。上流本文は整形対象外とする。

Oxlintの [JS plugin機能](https://oxc.rs/docs/guide/usage/linter/js-plugins.html)で、WebのStorybook・Playwright、APIの [Drizzle](https://orm.drizzle.team/docs/eslint-plugin) とコミュニティの [Hono plugin](https://github.com/ouka-lab/eslint-plugin-hono) を使う。Storybookはstoryのみ、PlaywrightはE2Eのみへ適用する。Drizzleのwhere欠落、Honoの応答return漏れ・next重複・param不一致・process.env依存を検出する。HonoのDomainErrorは共通onErrorが処理するためHTTPExceptionへの一律置換は要求しない。

APIは`eslint-plugin-boundaries`の`boundaries/files`で、`modules/<業務>`のroute・service・query・modelとplatform・DB・公開入口を分類する。`boundaries/dependencies`は既定で依存を拒否し、`apps/api/oxlint.config.ts`の対応表だけを許可する。`no-unknown-files`と`no-unknown-dependencies`により、未分類のファイル配置や内部パスへの依存も失敗させる。TypeScript resolverとworkspaceの絶対rootを指定し、ルート・workspace・エディターから同じ解決結果を使う。

routeからDB・Drizzle、serviceからHono・route、queryから更新・Agent、modelから実行コードへの依存を拒否する。modelは他のmodelとZodのみ、DBはDB schemaとDrizzleのみを参照する。Contextへの依存は型だけ許可し、moduleでのAuth再生成も禁止する。route合成は`app.ts`と`stores/routes.ts`の明示した子moduleに限定する。

配置や依存の追加時は、この対応表と構成文書を同じ差分で更新する。`scripts/tablecast-import-rules.test.ts`は隔離workspaceへ実設定を複製し、導入済みOxlint CLIで禁止・許可importと未知の配置を検証する。標準機能への対応は[JS BoundariesのOxlint統合](https://www.jsboundaries.dev/docs/guides/oxlint-integration/)に従う。

### Webのimport・配置

`apps/web/oxlint.config.ts`はeslint-plugin-boundariesとTypeScript resolverで実ファイルを分類する。route、feature画面、query、model、共通shell、components、UI、lib、transport、server、i18nと生成物・テストの位置を定義する。未分類ファイルもエラーにする。

UIから業務やAPIへの参照、共通部品からfeatureへの参照、query/modelから画面への参照、featureからrouteや別featureの内部画面への参照を拒否する。WebはAPI内部・Drizzle・Hono・Bun runtimeへ依存しない。新しい役割・配置を追加するときは、同じ差分でこの契約とルールを更新する。

`scripts/tablecast-import-rules.test.ts`はAPIとWebそれぞれの実設定を隔離workspaceへ複製し、実Oxlintで禁止・許可のimportと未分類の配置を確認する。
