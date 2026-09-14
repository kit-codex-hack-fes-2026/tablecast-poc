# テスト戦略

[索引](README.md) / [受入条件](acceptance.md)

## 原則

ケース設計と層の選択は[fullstack-web-testing](../.agents/skills/fullstack-web-testing/SKILL.md)、この文書はTableCastの実行環境と保証の配置を扱う。既存の認可・競合・データ保全を維持し、設定値の転記や標準機能の内部を試験するだけのケースは追加しない。

## 変更に応じた検証

変更した契約と実行境界から確認対象を選ぶ。使える全コマンドを毎回実行する手順にはしない。

| 変更                  | ローカルで確認するもの                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| 文書の誤字・リンク    | 対象のOxfmt、変更した記述・リンク。アプリの全テストは不要                                                |
| skill・PRテンプレート | 対象の整形、metadata、参照先。導線や判断を変えた場合は代表依頼から必要な資料と成果へ到達できるか確認     |
| 設定・開発CLI         | 対象のlint・型・設定解決、関連する既存試験。生成や起動の振る舞いは隔離環境で実行して確認                 |
| API・DB               | APIのlint・typecheckと変更に関係するVitest。認可・原子性・cursor等のD1固有挙動は実bindingで確認          |
| Web                   | Webのlint・typecheckと関連するVitest／Storybook。SSR・認証・注文等の最終配線を変える場合は代表E2E        |
| 音声                  | API・Webのlint・型と関連するVitest。音声送受信は許可された有料試験                                       |
| 動画基盤              | presentationのlint・型・Vitest。描画変更は両filmの配置検査、配布素材変更は新規checkoutで保存素材から生成 |

共通設定・依存・複数workspaceの契約を変えた場合は、その影響範囲へ検証を広げる。無課金の全体検査はCIが担い、ローカルでも全体確認が必要な場合に`bun run check`を使う。成功後の再実行は追加変更・失敗・未解決の懸念がある場合に行う。有料モデルと実機の確認は通常CIと分ける。

問合せ数を固定するだけの回帰テストや、skillの語句を照合する独自validatorは追加しない。新規実装時の重複読取・標準機能の再実装は該当skillの設計判断で除く。指示変更の確認は代表依頼で行い、専用の常設評価runnerを増やさない。結果は確認したcommitとともにPRへ残し、未実施の範囲を成功扱いにしない。

## 実行層

PRの実操作動画は通常CIと独立した`TableCast Demo Videos`で生成する。headからビルドした実Web・API・D1と既存E2E fixtureを使い、注文・提供・会計のGUI操作を新規収録する。SHA照合、実DBの結果、MP4全編復号・等速再生を検査する。無音・有料モデルなしで、保存録画や旧構成の技術紹介は使わない。[PRのデモ動画](../apps/presentation/CI.md)を参照する。通常CIも動画CIもLFSを取得しない。

動画基盤のVitestはCIの`unit-web`ジョブでWeb・seedと並列に実行する。保存音声やLFS素材を取得せずに、台本検証・時間計算・ズーム・収録の完了判定と、通常Git管理のOpenScreen project・収録ログへの個人パス再混入を検査する。動画全編の生成・再生、OpenScreen収録、有料音声の確認はこのジョブには含めず、[共有と復元](../apps/presentation/SHARING.md)に従って実施記録を残す。

| 層           | 対象・runtime                               | 主な検出対象                               |
| ------------ | ------------------------------------------- | ------------------------------------------ |
| 静的         | Oxlint・型・Oxfmt                           | 型、禁止import、asyncの取り扱い、設定      |
| 純粋ロジック | Vitest                                      | 価格、数量、プラン、snapshot、読上げ表記   |
| API統合      | Cloudflare公式Vitest連携、実local D1/DO     | 認証、SQL制約、原子性、失効、MCP、stream   |
| UI統合       | Storybook addon / Vitest Browser + React    | 状態、操作、日英、focus、query・通知、a11y |
| 音声接続     | Vitest + 公式SDKのHTTP境界                  | GPT-Live委任・字幕保存、取消、業務turn     |
| 決定的E2E    | Playwright + 実Web/API/DB、外部AIのみ差替え | 音声・GUI・管理の配線、再読込、Cookie      |
| 有料・実機   | 実LLM/STT/TTS、iPad                         | 読み、演技、騒音、エコー、barge-in、実遅延 |

Cloudflareのテストは採用Wranglerと対応した公式runnerで行う。通常のSQLiteだけを使ってD1の挙動を検証済みにしない。[S12](sources.md#s12)
Playwrightは実行ツールであって、全ケースをE2Eに分類する理由ではない。

## 各層で厚く検証するもの

APIの最重要条件は、未承認送信、古いsnapshot、同時変更、二重送信、他店舗アクセス、価格改ざんを拒否できることである。
D1 batchの途中失敗、条件不成立で更新件数0、古いturnの後続書込み、成功後レスポンス消失、同じidempotency keyを必ず含める。
カート・注文・会計・table eventが整合し、DO通知失敗後にもDBから再同期できることを検査する。

UIは状態をprops/既存query fixtureで再現し、Storybookから実OpenAIや本番APIへ接続しない。
外部I/Oと表示を分ける必要があるComponentだけ薄い境界を作り、単純なComponentを必ずcontroller/viewの二枚にしない。
VoicePanel、言語切替、音声停止再開、会話履歴、商品選択、確認、卓タイムライン、会計のStoryをWebに併置する。
StorybookとCloudflareのVite設定は丸ごと共有せず、React・CSS・i18n等の必要部分だけ共用する。Storybook起動だけでWorkersを起動させない。[S14](sources.md#s14)
共有モジュールのserver/client分岐はTanStack Startの`createIsomorphicFn`を使う。Storybookは公式の`@storybook/tanstack-react`でStartとRouterを扱う。Vitest Browserには公式Vite pluginを適用し、`installDevServerMiddleware: false`でアプリのサーバー起動を抑える。`api-fetch.test.ts`は実ソースのdev変換でserver importの除去を検証する。Cookie・Service Binding・認証の挙動は既存のSSR・OAuth E2Eで検証し、Nodeの音声状態テストは`apiFetch`をHTTP境界として差し替える。

音声は公式SDKのHTTPイベント境界とWebのmedia境界を重点検査する。標準WebRTCそのものの内部処理を再実装したテストは作らない。
外部AIの決定的な差替えはテスト起動時だけに限定し、本番にモデル選択frameworkやfallbackを持ち込まない。

## テスト名と構造

自作テスト名、説明、fixtureの説明コメントは日本語で書く。assertや変数名は通常の識別子を使う。
命名は条件・操作・観測結果を表し、内部メソッドを呼んだというだけのテストを増やさない。

```ts
it("確認後にカートが変わった場合は古い承認で注文を送信できない", async () => {
  // 確認済みのカートに別の商品を追加する。
  // 古い確認IDの要求が失敗し、注文が一件も増えないことを確認する。
});
```

上は命名例であり、空のテストを納品して合格扱いにしない。
Webのtest名とUI翻訳を混同せず、英語UIのテストでも説明は日本語とする。

## 新要件の必須シナリオ

- 客・店側それぞれの日英UI。別の管理者が別言語でも同じイベントと金額を見る。
- 自由文の入力欄がなく、キーボードを開かずに商品カスタマイズと注文ができる。
- 会話領域が広く、長い日英の履歴を読んでもメニューと停止ボタンが使える。
- 停止中に言語を変更してもマイクが再開しない。明示再開後だけ新しい音声sessionを作る。
- 二重クリック、接続中の停止、停止直後の古い応答、ネットワーク回復時も停止意思を優先する。
- 停止後もカートとログを保持する。再開時に前の未再生音声を流さない。
- 日本語でCalifornia、oat milk等の入力を与えても、読み上げは自然な日本語表記になる。
- 通常の嬉しさ・謝罪・笑いと、注文確認の抑制を区別する。未知のアレルギーで笑わない。
- タグがchunk途中で分断されても字幕へ漏れず、日本語やUTF-8の文字を壊さない。

## テストデータ・時刻・非同期

時刻と乱数は必要なテスト境界で固定する。seed、再生シナリオ、通常アプリのclockを不用意に一つのグローバルmockへしない。
最低限必要な入力だけのfixtureを使う。大規模デモseedを全unit testへ読み込まない。
固定sleepで成功を待たず、状態、イベント、画面の役割と名称、promiseの完了を待つ。
ライブラリ内のprivate stateやDOM構造へ過度に依存せず、公開APIと利用者に見える結果を観測する。

## 公開scriptとCI

`test` は外部費用なしの単体・軽量統合、`test:browser` はComponent・Web内統合、`test:e2e` は決定的な全構成、GPT-Live・Responses delegationの実通信は許可された有料実音声に分ける。
`bun run check` に静的解析・型・無課金テストを含める。Browser/E2EはCI別job。有料試験は手動または明示承認されたjobだけ。
全体の固定カバレッジ比率やcase数を目的にしない。認可・注文・金額・中断等の分岐の抜けをレビューし、必要に応じて対象のcoverageを可視化する。
テスト結果、未実行範囲、実機条件を記録し、台本付きモデルの成功を実音声精度の証明にしない。

## CIのジョブとキャッシュ

workflow名は`CI`。job名は`検証の種類: 何を確かめるか (使用ツール)`に揃え、テストには必ず`Test`を付ける。例えば`Component Test: UI操作とアクセシビリティ (Vitest Browser, Storybook)`、`E2E Test: 注文・ログイン・会計 (Playwright)`とする。種類・目的・ツールをslashや中点で連結しない。静的解析、Web/seedのVitest unit、API/D1/MCPのVitest、開発CLI/seed統合、Vitest Browser/StorybookのComponent・a11y、Playwright E2E、Workers build、Storybook buildを分ける。WorkersとStorybookの成果物・失敗は独立したjobで確認する。

全体の完了時間は3〜4分を目標とする。E2EはActionsのbrowser・shard matrixでChromium・WebKitを各2分割の計4jobに分け、Playwrightの`--project`と`--shard=1/2`・`--shard=2/2`で対象を選び、各jobで4workersを使う。既存の`fullyParallel: true`によりケース単位で分配し、全shardの成功を配備の条件とする。失敗時のtrace・画像artifact名にはbrowserとshard番号を含める。公開リポジトリで無料の標準Linux runnerを使い、ブラウザー本体・OS依存も対象browserだけ準備する。build・migration・seedは各jobで一度ずつ実行するため、待ち時間と総runner時間の両方を確認する。分割は[Playwright標準のsharding](https://playwright.dev/docs/test-sharding)を使い、ローカルで分配だけを確認する場合は`bun run test:e2e --project=tablecast-chromium --shard=1/2 --list`を実行する。ケースの隔離と`retries: 0`を維持し、ローカルの`bun run test:e2e`は従来どおり両browserを実行する。

APIは1job・Cloudflare Vitestのファイル単位のstorage隔離を使い、`fileParallelism: true`・`maxWorkers: 4`とする。ファイル内は直列で、各caseのD1 reset・migrationを維持する。`parallel` stepは独立したブラウザー本体・OS依存・Mailpit取得、Webとseedのunitに使用する。各stepの失敗を通常のjob失敗へ伝え、codegenなど書込み先を共有する処理は直列に保つ。

GitHub Actionsの`actions/cache`で静的解析と2種類のbuildの`.turbo`を復元する。OS・architecture・lockfile・jobごとに分離し、コミット単位で保存する。Turbo側ではAPIソース・共有fixture・build環境変数もtask入力へ含め、Workersの`dist`・deploy configとStorybookの`storybook-static`を出力として復元する。テストtaskは`cache: false`で毎回実行する。E2E専用のorigin・資格情報を含むbuild、D1/R2/DO、メール、テスト結果は永続キャッシュへ入れない。

Playwright本体のcache keyはOS・architecture・Playwright版・ブラウザー構成を含む。Chromiumは`--only-shell`でheadless shellだけを取得する。OS依存は別の共通actionでAPT取得済みの`.deb`をcacheする。keyはrunner imageのOS/版・architecture・Playwright版・ブラウザー構成を含み、同じOS・architecture・Playwright・ブラウザー構成ならimageの更新前のarchivesも復元する。`playwright install-deps`はcache hit時も実行し、APTの最新indexによる依存解決と整合性確認、展開・設定を省略しない。追加・更新パッケージだけを取得し、インストール済みの`/usr`やdpkg状態は復元しない。cache復元・未命中時のdownload・OS依存の所要時間をActionsで個別に確認する。cache展開にも時間がかかるため、高速化を未計測のまま保証しない。[PlaywrightのCI資料](https://playwright.dev/docs/ci#caching-browsers) と[Actionsのparallel step](https://github.blog/changelog/2026-06-25-actions-steps-can-now-be-run-in-parallel/)を参照する。

## E2Eの隔離

`bun run test:e2e` はPlaywrightの`test-scoped fixture`で各ケース専用のD1・R2・DO・Googleモック・Mailpit・Web/APIを起動する。各ケースで専用のlocalhostポートと`.local/tablecast-e2e-*/tablecast-case-*`を使い、開発サーバーのDB・Cookie・`.local/demo.json`を参照しない。DockerがMailpitの起動に必要である。LinuxではMailpitをhost networkで起動し、HTTPは`127.0.0.1:0`へbindする。同梱BusyBoxの`netstat -ltnp`でcontainer内の`1/mailpit`が所有するHTTP待受を一つに特定する。host networkの他プロセスのポートは採用しない。port 0へ接続してしまうイメージの既定healthcheckは無効にし、fixtureが実URLのHTTP成功と子プロセスの生存を確認する。SMTPはcontainer内のUnix socketを使う。TCPポートの事前確保とvethの生成・削除をなくし、メール保存先はケース専用container内に保つ。Mailpit 1.29.2のHTTP Unix socketはGETできるが送信APIが接続元アドレスの解析で失敗するため使わない。macOSのDocker Desktop/OrbStackではDockerの動的port publishを使い、inspectで実ポートを取得する。

ビルド・migration・合成seed・画像投入はglobal setupで一度だけ実行する。ViteとSerwistの出力先は`TABLECAST_BUILD_DIRECTORY`で実行ごとの`build/`へ揃え、通常開発の`apps/web/dist`を上書きしない。seedに使った`getPlatformProxy`をdisposeし、全writerを終了したstorageを各ケースへ複製する。SQLite内部を直接編集せず、稼働中のDBをコピーしない。ビルド成果物をtemplateとし、各ケースのassets・deploy configから固有名のWeb/API WorkersをCloudflare Vite previewで起動する。Wranglerの`WRANGLER_REGISTRY_PATH`もケース内へ分け、別caseの登録・解除がruntime再構成を起こさないようにする。Cookie・メール・DO・認証も別環境であり、固定fixtureのIDが同じでも書込み先は共有しない。

`fullyParallel: true`、`workers: 4`、`retries: 0`で、同じspec内の言語違いも並列実行する。`support/test.ts`の`test`を全specで使用し、標準のpage/request/contextはケース専用の`baseURL`を使う。ケースの成否に関係なく自分のプロセスとcontainerとstorageを終了・削除し、最後にglobal setupのtemplateも削除する。他ケースの成功結果やcleanupの順番を前提にしない。メールとGoogleの同一アカウント試験は、前ケースの登録状態で分岐せず、毎回新規登録から確認する。

DBはケースの終了とともに破棄するため、後処理でプロフィール・公開版・下書きをAPI経由で元へ戻さない。閉卓後の更新適用など製品の保証はケース本体で確認し、fixtureは取得したBrowserContext・プロセス群・container・storageの解放を担う。後処理の一つが失敗しても残りを実行し、元の失敗と後処理の失敗を区別する。

同じworktree内の別buildは、Paraglide・route生成とCloudflareのdeploy metadataの書込み先を共有するため同時に開始しない。CIのbrowser matrixは別runnerであり、ケース間の並列実行とは区別する。ケースの入口はVite標準proxyを`port: 0`で一度だけ起動し、終了まで待受を保持する。実originをOAuth callbackとAPI varsへ設定後、Cloudflare previewも`port: 0`で起動し、listen完了時の実ポートへ転送する。空き番号を取得して解放する処理は使わない。OAuthとWorkerのreadyファイルは一時ファイルからrenameして公開し、異常終了と起動期限を確認する。bind失敗の自動再試行はしない。

通常操作は、保存済み表示・有効化・反映後の値を観測してから次の操作へ進む。HTTP応答の受信だけでフォームのresetやiframeへの反映を完了と扱わない。意図した競合は下位層の明示barrierで確認する。会話注文デモは客の初期言語を明示し、言語・表示の保持と設定・注文の保持を別ケースへ分ける。端末寸法の全組合せは既存の`demo-viewport.browser.test.tsx`が担当する。全specと共通環境の確認結果は[#116](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/116)に置く。

macOSのWebKitでは [Appleの標準操作](https://support.apple.com/en-gb/guide/safari/cpsh003/mac) に合わせ、リンクを含むキーボード移動をOption+Tabで検証する。OS設定やDOMのtabindexをテストだけの都合で変更しない。

開発用seedは3店舗と36卓、固定の商品・利用場面にFakerのスタッフ36名を加える。再実行で既存プロフィール、カート、注文、公開メニューを上書きしない。E2Eの操作対象はfixtureで空席にしているT10を使う。

## #35に基づく所有先の分離

[全件監査と残件](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/35) の判定に沿い、先に低い層へ契約を置いてから上位の重複を除く。テストのretry・反復実行をflakyの検出や対策に使わない。失敗時はコードと保存した証跡から原因を調べ、修正した契約を確認する。UIの再試行ボタンや製品の再接続そのものを検証するケースとは区別する。

| 契約                                  | 主担当と入口                                                                 | 上位へ残す保証                               |
| ------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------- |
| 価格・プランの期限と数量境界          | APIのVitest `unit`、純粋configuration fixture                                | `bindings`で価格正本・未承認・DB原子性を検証 |
| 読取中の更新、前版からのmigration     | APIのVitest `bindings`、実D1と明示barrier                                    | 実HTTPの代表経路                             |
| 文字2倍・縦横画面・音声失敗後のカート | `kiosk.browser.test.tsx`、実Kiosk・QueryClient                               | 代表modifier→注文→提供→会計→閉卓のE2E        |
| 店舗切替の古いHTTP・通知とunmount     | 同Browser test、実useRealtime、通知境界だけ固定                              | 実WebSocketの切断・HTTP回復E2E               |
| QR decodeと送像停止                   | `device-qr-reader.browser.test.tsx`、実decoder・MediaStream、Chromium/WebKit | QR URL→卓保持→再読込→明示承認E2E             |
| 音声turnの認可とspeech/tool関連付け   | APIの実D1・公式SDK HTTP境界とWebのmedia境界                                  | APIの実認可と別枠の有料WebRTC音声            |
| Git/ファイル/CLI/seed                 | root Vitest `scripts-runtime`                                                | 他workspaceのtestから独立したCI job          |

Webの`browser` projectは `vitest-browser-react` のrender・rerender・cleanupを使用する。外部HTTPと通知を固定しても、feature、QueryClient、Hono clientを本番実装から外さない。想定外の要求は記録し、SUTのcatchの外で失敗させる。カメラはcanvasの合成映像を実MediaStreamへ流す。decoderの各フレームの通知回数を業務の承認回数と同一視しない。

GPT-Liveは公開委任イベント・SDK字幕とHTTPの境界を無課金で検証する。APIでは実D1と公式OpenAI SDKを使い、確認準備後の本文生成と次の発話の注文確定を通す。モデルの意味判断、実際の音声品質、全割込・エラー経路は有料・実機試験として区別する。

個別の実行例:

```sh
# API: 純粋unit / 実binding統合
cd apps/api
bunx --no-install vitest run --project unit
bunx --no-install vitest run --project bindings
```

```sh
# リポジトリルート
bunx --no-install vitest run --project scripts-unit
bunx --no-install vitest run --project scripts-runtime
bun run test:browser
bun run test:e2e --project=tablecast-chromium
```

E2Eのready条件はWeb/API、Mailpit、OAuth discovery。各要求の期限、子プロセスの異常終了、自分のDocker containerの削除を確認する。fixtureが起動した専用process groupと入口を終了し、Viteの子孫のworkerd、接続済みsocketも残さない。失敗時は資格を除去した最大65,536文字のruntimeログを`testInfo.outputPath()`へ保存して添付する。画像・計測値も同じcase別の保存先を使う。migrationログはruntime削除前に`apps/web/test-results/tablecast-runtime/<run>/`へ保存する。テスト結果には認証情報を含むtraceを追加しない。

### 型付きDB fixture

APIの通常データ投入は`test/database-fixture.ts`の`insertFixture(table, values)`を使う。引数はDrizzleの`SQLiteInsertValue<T>`から列名・必須値・enum・日時型を推論し、単一行と複数行を扱う。SQL生成・値のencodeはDrizzleへ任せ、生成済みstatementを既存の実`D1.batch`へ渡してtransactionのまとまりを保つ。単独の参照・更新・削除には同じファイルの`fixtureDb`でDrizzleの標準queryを使う。

認証は既存の`auth-schema.ts`、業務データは`business-schema.ts`のquery用定義を共用する。既存の行型は`$inferSelect`から導出する。DDL・CHECK・FK・indexの正本は既存のSQL migrationのままであり、query用定義を追加したことを理由にmigrationを再生成しない。

旧schemaからの移行データ、制約違反を直接起こす操作、SQLの読取地点を止める競合試験など、SQL自体が検証条件になる箇所にはraw SQLを残す。ドメイン操作を検証するWhen/Thenをfixture helperに置き換えない。D1/DOの初期化にはCloudflare公式resetと実migrationを使用する。

E2EのpreviewはCloudflare Vite pluginの `inspectorPort: false` でInspectorを起動しない。自動試験に不要な待受とポート割当を省き、並列caseのMailpit等との競合を避ける。通常のdevではInspectorを利用できる。

### PWAとHTTP差し替え

PWA・メニュー公開・注文などの実動作試験はService Workerを有効にする。`page.route()`で503応答・ページサイズ・OAuth callbackを制御する試験は、そのファイルの`test.use({ serviceWorkers: "block" })`でSW登録を止める。SWがあるとPlaywrightの通信差し替えや要求観測を迂回する場合があるためであり、アプリ側に試験専用の分岐は作らない。[Playwright公式の制約](https://playwright.dev/docs/network#missing-network-events-and-service-workers)

ログイン後のSSR画面から次のdocument navigationへ進む場合は、見出しやURLだけでなく既存の操作部品が有効になるまで待つ。これによりhydrationとredirectの完了前に次の遷移を競合させない。

### E2Eの通信停止とOAuthの動的ポート

`runtime.setOnline(false)`は入口の待受を保持し、既存接続と新しい要求を切断する。`true`で同じoriginへ復帰する。ブラウザーのオフライン設定はWebKitのService Workerキャッシュ取得も止めるため使わない。通信障害の検証であり、Workerプロセスの再起動・DB復旧の証明とは区別する。Service Workerの更新試験はcase専用`client/sw.js`を書き換え、`runtime.restartWeb()`でWorker側のアセット情報を再読込してから`registration.update()`で配信を確認する。入口の待受は閉じず、再起動後のWorkerの実ポートへ転送先を更新する。最小の静的Workerでは再起動なしで本文が変わるが、実アプリの更新判定にはアセット情報の再構築が必要だった。

`emulate@0.11.1`の公開APIは動的ポートの実URLを返さないため、`patches/emulate@0.11.1.patch`をBunの`patchedDependencies`で適用する。bind完了後の実ポートからdiscovery・issuer・seedのURLを構築し、初期化失敗ではlistenerを閉じる。明示baseUrlは保持する。固定ポートの既存dev/previewと動的ポートのE2Eを同じ公開APIで扱い、previewでのport 0は許可しない。上流で同じ契約が提供された版へ移行するときにパッチを外す。

`scripts/tablecast-e2e-runtime.test.ts`は実TCPとOAuth子プロセスで、ケース分離、停止中のポート保持、復帰、discoveryのURL一致、bind失敗の拒否を確認する。HTTP・OAuth・メール・DB・PWAの最終配線は既存Chromium/WebKit E2Eが確認する。

## 音声の性能回帰

`apps/api/test/voice-performance.test.ts` は実D1のbinding往復とSQL実行数を計測する。8件・200件の商品で検索とカード表示を実行し、表示が保存され、最大8件の出力とページ情報が返ることを確認する。上限は業務関数の往復5回、HTTP認証・所有卓確認・通知を含む経路の往復7回、出力6000byteとする。外部モデル時間は含まない。実音声の1秒目標とは分けて評価する。

性能変更ではSQL時間、binding待ち、通知、モデル、実再生を区別し、既存性能予算を超えたら原因を修正する。データ量と同時実行を変えてN+1や不要な直列待ちを検出し、単なるquery数一致やsleep・retryでの成功を証拠にしない。
