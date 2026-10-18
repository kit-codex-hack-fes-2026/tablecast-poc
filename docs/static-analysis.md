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
| .fallowrc.json                                   | 未使用コード・依存・複雑度・重複の解析と差分gate         |
| apps/webのtsconfig / Vite / Storybook            | クライアントとSSR、部品試験                              |
| apps/apiのtsconfig / Wrangler / Vitest / Drizzle | workerd、実Binding、migration                            |

採用版と実行内容は各manifestと設定ファイルを正本とする。標準ルールを追加・変更するときは導入版の対応と実効性を確認し、config共有packageは実際に必要になるまで作らない。

## 検査範囲とキャッシュの分担

`bun run lint`はrootとworkspaceで対象を分け、同じファイルを二度lintしない。rootはCLIの`--ignore-pattern 'apps/**'`で開発script・root設定等を検査し、`apps/api`・`apps/web`・`apps/presentation`・`apps/emulate`はTurboから各workspaceの`oxlint . --type-aware --deny-warnings`を実行する。workspace直下の設定ファイルも含め、従来のroot全体検査と同じ対象を保つ。共通configへ`apps/**`のignoreを置くと子へ継承されるため、除外はroot CLIだけに指定する。

Oxlintのnested configと各workspaceの既存ルールを維持する。範囲を変えるときは、導入済みCLIの`--debug files`で変更前後の対象集合を照合し、欠落・重複がないことを確認する。ルールの無効化や型付き解析の省略で時間を短くしない。

root側のlintとformatは毎回実行し、workspaceのlint・typecheckはTurboの決定的なtask cacheを使う。rootと各workspaceのtsconfig、APIの公開型、共有script等の実依存をcache入力から外さない。WebのtypecheckはAPIのtypecheckとParaglide生成を前提とする。cache hit時に再生される過去のCLI時間を、今回の所要時間へ加算しない。CIのcacheと検証境界は[テスト戦略](testing.md#ciのジョブとキャッシュ)を参照する。

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
APIからWebのfeature・UIをimportしない。モデルはAPIの公式SDKを使い、ブラウザーへAPIキーや実行コードを含めない。
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
型付きルールが実際に実行されることを小さい失敗例で確認する。型ゲートは各manifestの`typecheck` scriptを正本とし、Oxlintだけで完全代替できると仮定しない。
ルールのためだけに本番とテストで異なる型契約を作らない。

型検査CLIはrootの`@tablecast/typescript-native`へaliasしたTypeScript 7.0.2のネイティブ版を使う。各scriptはroot相対の`node_modules/@tablecast/typescript-native/bin/tsc`を`node`で明示実行し、同名binの解決順に依存しない。単独の`tsc`コマンドで使用版を判断せず、`bun run typecheck`または対象workspaceのscriptを使う。TanStack・Storybookが参照する既存のTypeScript JavaScript APIには`typescript` 6.0.3を維持する。CLIとライブラリAPIの用途を分け、互換aliasで既存APIを置き換えない。

## Oxfmt

Oxfmtは追跡対象のコード・Markdown・設定に使用し、生成物・node_modules等の適切な対象外を設定する。
rootの`format`・`format:check`はリポジトリ全体を一度だけ処理し、その後にworkspaceの同じ処理を重ねない。workspace単独のformat scriptは部分作業の入口として残す。
日本語文書やコメントを英語へ変換しない。文書の折返しを目的に説明を省略しない。
第三者pluginの既存文体は無関係に書き換えない。patchに必要な自作の説明・テストは日本語で書き、上流へ提出する際の規約調整は別の差分として明示する。

## Lefthook

pre-commitは変更ファイルへのformat/lintとfallowの差分検査、commit-msgはコミット規約を検査する。formatと解析のgroupを並列実行し、解析はcodegenを一度完了してからlintとfallowを並列実行する。生成中のParaglideを読まず、codegenの失敗もcommitを止める。実行内容は[lefthook.yml](../lefthook.yml)が正本であり、重い全ブラウザー試験・有料音声試験を毎commitへ入れない。変更別の確認範囲は[テスト戦略](testing.md#変更に応じた検証)に従う。
部分stageを壊さない。`git add .` や無関係な差分の自動stageは禁止。formatterの自動stageを使う場合は部分stageを保全できる挙動を先に検証する。
pre-pushは設定せず、push時に全体検証を繰り返さない。無課金の全体検証はCIで実行し、ローカルで必要な場合は `bun run check` を使う。
commit-msgはrootの `commitlint.config.ts` を使う。公式の `@commitlint/config-conventional` と本文・Issue参照必須の組込みルールを採用し、Gitmojiの先頭検査だけを追加する。CIの静的解析ジョブは履歴を取得し、PRではbaseからheadまで、mainへのpushでは直前のコミットを同じ設定で検査する。
失敗時の `--no-verify`、skip、全ignoreを通常手順にしない。起動した別worktreeのGit設定を変更しない。

## fallow

rootの開発依存へ固定したfallowを、CLI・Lefthook・CI・Codex MCPで共有する。解析設定の正本は[.fallowrc.json](../.fallowrc.json)とする。Oxfmt・Oxlint・型検査を維持し、fallowはリポジトリ全体のimport graphから未使用コード・依存・循環参照を検出する。型付き解析、有料のruntime解析、モデルを使う類似コード検出は初期導入では有効化しない。

```sh
# 全体の指摘を調べる。commit・CIの成否はauditで判定する。
bun run fallow
# branchの変更と現在の作業ツリーを統合先と比較する。
bun run fallow:audit --base origin/staging
# 今回のcommit前の変更を検査する。pre-commitもこの比較を使う。
bun run fallow:audit --base HEAD --quiet
```

auditは`gate: new-only`で比較元にも同じ解析を行い、新規のerrorだけを失敗させる。既存の指摘は文脈として残す。複雑度のcyclomatic・cognitive・CRAPは`warn`、重複は標準の報告のみとし、予算超過による失敗閾値を設定しない。他のruleは導入版の標準severityを使う。終了コード0はpass/warn、1は新規エラー、2等は設定・実行の不備であり、`|| true`で解析失敗を隠さない。[audit](https://fallow.tools/docs/cli/audit/)と[severity](https://fallow.tools/docs/configuration/rules/)を参照する。

fallowを直接実行すると作業ツリーを解析するため、未stage差分も判定へ影響する。Lefthookは部分stageされたファイルの未stage差分を標準機能で一時退避して復元するが、stage対象外のファイルの未stage変更はauditへ影響する。pre-commit全体がindexだけのsnapshot検査になるわけではない。自動修正・baselineの自動更新・自動stageは行わず、実行後のindexと未stage差分を維持する。CIはcheckoutしたcommitを対象とし、PRはbase SHA、pushは変更前SHA、手動実行は`HEAD^`を比較元にする。比較元が存在しない場合も検査を失敗させる。

TanStack Router・Storybook・Vitest等の入口は標準pluginに任せる。静的importに現れないService Worker、CLI設定、shell経由の開発CLI、コピーして使う動画CSS、ローカルMCPの入口だけを`entry`へ補う。WorkersのDurable Object RPCで使う`start`・`notify`は、呼出し元を確認したうえで`DurableObject`継承に限定した`usedClassMembers`に登録する。生成型・route tree・Paraglideは解析対象から除き、第三者skillsは標準の隠しディレクトリ除外に従う。`.fallow/`のcacheはGit管理しない。

設定の名前から動的にロードする`eslint-import-resolver-typescript`、実ファイルパスで呼ぶ`@tablecast/typescript-native`、shellへ渡すコマンド文字列の`portless`は、実際の設定・package scriptsに使用があるため`ignoreDependencies`へ限定登録する。名前を消すときは使用側も確認し、他の未使用依存を一括除外しない。

削除・依存整理の前に`bunx --no-install fallow list --format json`でworkspaceと入口を確認し、`dead-code --trace`やMCPのtrace系toolで利用元を追う。誤検知は実入口や具体的なframework呼出しを補い、手書きのsrc全体をentryやignoreへ追加して通さない。既存の指摘はIssueへ記録して別途判断する。Codexからの起動は[セットアップ](setup.md#mcp設定の配置と確認)へ進む。

## 依存・CI

Bun/Nodeの必要バージョン、lockfile、Wrangler/Vite/Cloudflare Vitestの互換組合せを最初の接続ゲートで固定する。
CIはbun.lockの存在を検査し、frozen指定で導入する。未知の最新バージョンを毎回bunxで取得して検査を変えない。
通常はroot scriptからローカル導入済みCLIを起動する。workspace同士はworkspace依存を使い、同じ依存の不要な二重pinを増やさない。
未使用コード・重複の解析はfallowへ集約し、同じ目的でKnipやjscpdを重ねない。
生成型・migrationの差分を確認する。デプロイ、seed、reset、外部モデルの実行はTurbo cacheの再利用対象にしない。

## Webの追加ルール

`apps/web/oxlint.config.ts` でReact Doctor、jsx-a11y、TanStack Query/Router、Tailwindを有効にする。TailwindのCSS入口は設定ファイルから絶対パスへ解決し、ルートとworkspaceのどちらから実行しても同じ検査になる。`--deny-warnings` により警告も検証失敗にする。React Compilerを採用していないため、その導入を前提に手動memo化を禁止するルールは適用しない。

React Doctor 0.9.18は[公式CLIの設定生成](https://github.com/millionco/react-doctor/blob/84ad0c8d0df7a3ab7d26946367fae3bc39c100d0/packages/core/src/runners/oxlint/config.ts#L294)と同じ`portedRuleMode: "curated"`を使う。推奨ルールのseverityは維持する。ported ruleはmemoされないnative要素・部品に一律memo化を要求せず、Fast Refreshは実際のVite・Start構成を認識する。missing keyとmemo部品へ渡す毎回新しいobjectは引き続き検出する。新しい複雑度の推奨には、表示部品と状態・イベント集計の責務を分けて対応し、予算値を緩和しない。

## CIの実行単位

GitHub Actionsでは静的解析、単体・実Binding・音声接続テスト、Workers build、UI部品試験、イベントに応じたChromium/WebKitのE2Eを独立ジョブで実行する。Storybookのinteraction・a11yはUI部品試験に残し、Storybook・React Emailの公開ビルドとデプロイは[手動カタログ](deployment.md#prのstorybookメールカタログ)で要求された場合に実行する。matrixは失敗時にも他の検証を継続する。ブラウザーごとのrunnerとfixtureでDB・プロセスを分離する。通常CIは外部の有料モデルを呼ばない。

共通actionはmanifestとworkflowで指定したNode/Bunを導入する。Bunの取得cacheをlockfileで更新し、node_modulesやDBは共有しない。Playwrightはジョブに必要なブラウザーだけ導入する。Paraglideは型付きlintの前に生成し、ローカルの生成済みファイルに依存しない。失敗したE2Eのtraceと画像は1日間保持する。

## skillsと追加pluginの所有

| 正本            | 所有する情報                                             |
| --------------- | -------------------------------------------------------- |
| AGENTS.md       | 共通の不変条件と作業別入口                               |
| 自作skill       | 標準機能・責務・検証範囲を選ぶ判断、該当作業で読む参照先 |
| docs            | 現行の製品仕様・構成・運用手順                           |
| lint・hooks・CI | 導入済みの標準ルールと実行依存・cache・検証              |
| Issue・PR       | 要求と判断の根拠、実装差分と対象commitの検証結果         |

過去の修正履歴はIssueへ残し、同じ原因・類似構造に効く判断だけをskillへ反映する。descriptionは用途が判別できる短い文にし、全作業への発動や全文書読込を要求しない。実際に使うPR本文は[PRテンプレート](../.github/pull_request_template.md)を正本とし、skill内へコピーを持たない。[Astra向けの公式指針](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)をこの分担へ適用する。

自作・外部skillsは `.agents/skills` に直接置く。外部の `animate`、`emil-design-eng`、`mastra`、動画用の `hyperframes-core`・`hyperframes-animation`・`hyperframes-creative` の取得元は `skills-lock.json` で管理し、これらの上流本文・同梱スクリプトは整形・lintの対象外とする。動画スキルの固定版と採用範囲は[TOOLS.md](../apps/presentation/TOOLS.md#制作スキルの固定と復元)に記録する。導入は[セットアップ](setup.md#2c-agent開発環境)、更新は[tablecast-quality](../.agents/skills/tablecast-quality/SKILL.md)を参照する。個人設定やplugin同梱の同名skillをリポジトリから自動削除しない。

Oxlintの [JS plugin機能](https://oxc.rs/docs/guide/usage/linter/js-plugins.html)で、WebのStorybook・Playwright、APIの [Drizzle](https://orm.drizzle.team/docs/eslint-plugin) とコミュニティの [Hono plugin](https://github.com/ouka-lab/eslint-plugin-hono) を使う。Storybookはstoryのみ、PlaywrightはE2Eのみへ適用する。Drizzleのwhere欠落、Honoの応答return漏れ・next重複・param不一致・process.env依存を検出する。HonoのDomainErrorは共通onErrorが処理するためHTTPExceptionへの一律置換は要求しない。Drizzle pluginはSQLリテラルの必要性や不要な直列読取を判定しない。これらは[API skill](../.agents/skills/tablecast-api/SKILL.md#db変更の設計と検証)に従い、新規実装時と差分レビューで呼出し経路・読取の依存関係・標準APIの採用を確認する。意味を推測するregexや独自の監査runnerを追加しない。

APIは`eslint-plugin-boundaries`の`boundaries/files`で、`modules/<業務>`のroute・service・query・modelとplatform・DB・公開入口を分類する。`boundaries/dependencies`は既定で依存を拒否し、`apps/api/oxlint.config.ts`の対応表だけを許可する。`no-unknown-files`と`no-unknown-dependencies`により、未分類のファイル配置や内部パスへの依存も失敗させる。TypeScript resolverとworkspaceの絶対rootを指定し、ルート・workspace・エディターから同じ解決結果を使う。

routeからDB・Drizzle、serviceからHono・route、queryから更新・Agent、modelから実行コードへの依存を拒否する。modelは他のmodelとZodのみ、DBはDB schemaとDrizzleのみを参照する。Contextへの依存は型だけ許可し、moduleでのAuth再生成も禁止する。route合成は`app.ts`と`stores/routes.ts`の明示した子moduleに限定する。

配置や依存の追加時は、この対応表と構成文書を同じ差分で更新する。`scripts/tablecast-import-rules.test.ts`は隔離workspaceへ実設定を複製し、導入済みOxlint CLIで禁止・許可importと未知の配置を検証する。標準機能への対応は[JS BoundariesのOxlint統合](https://www.jsboundaries.dev/docs/guides/oxlint-integration/)に従う。

### Webのimport・配置

`apps/web/oxlint.config.ts`はeslint-plugin-boundariesとTypeScript resolverで実ファイルを分類する。route、feature画面、query、model、共通shell、components、UI、lib、transport、server、i18nと生成物・テストの位置を定義する。未分類ファイルもエラーにする。

UIから業務やAPIへの参照、共通部品からfeatureへの参照、query/modelから画面への参照、featureからrouteや別featureの内部画面への参照を拒否する。WebはAPI内部・Drizzle・Hono・Bun runtimeへ依存しない。新しい役割・配置を追加するときは、同じ差分でこの契約とルールを更新する。

`scripts/tablecast-import-rules.test.ts`はAPIとWebそれぞれの実設定を隔離workspaceへ複製し、実Oxlintで禁止・許可のimportと未分類の配置を確認する。

### デザインシステムの再発防止

Webの既存 `oxlint-tailwindcss` の `no-hardcoded-colors` と `no-restricted-classes` をerrorにする。原色名と数字のutility、純白/純黒の直接utilityを拒否し、`styles.css` の意味別色へ誘導する。店舗テーマの利用者入力・QRの描画契約は既存境界に残し、業務状態色へ流用しない。StorybookとBrowserでコントラスト・hover・寸法・focus・狭幅を検証する。説明の関連性や色の意味そのものは静的規則で推測せず、実画面の監査で判断する。
