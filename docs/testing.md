# テスト戦略

[索引](README.md) / [受入条件](acceptance.md)

## 原則

テスト本数ではなく、失敗リスクを必要十分に検出する。最も小さく速い境界から始め、実際のD1・HTTP・DOMを使う統合を重視する。
同じ安全規則を単体、Component、全画面、全構成ですべて重複列挙しない。上位は接続が正しいことの代表例に絞る。
ライブラリの内部機能を再テストせず、TableCastが選んだ設定、変換、認可、状態遷移、接続を検証する。
テストはコード所有者の近くに置く。層名を理由に大量の専用パッケージやfixture frameworkを作らない。

## 実行層

| 層           | 対象・runtime                               | 主な検出対象                               |
| ------------ | ------------------------------------------- | ------------------------------------------ |
| 静的         | Oxlint・型・Oxfmt・ty・ruff                 | 型、禁止import、asyncの取り扱い、設定      |
| 純粋ロジック | Vitest / pytest                             | 価格、数量、プラン、snapshot、読上げ表記   |
| API統合      | Cloudflare公式Vitest連携、実local D1/DO     | 認証、SQL制約、原子性、失効、MCP、stream   |
| UI統合       | Storybook addon / Vitest Browser + React    | 状態、操作、日英、focus、query・通知、a11y |
| 音声接続     | pytest + 実AgentSession + 固定provider      | Realtime hook・turn・tool、取消、タグ整形  |
| 決定的E2E    | Playwright + 実Web/API/DB、外部AIのみ差替え | 音声・GUI・管理の配線、再読込、Cookie      |
| 有料・実機   | 実LLM/STT/TTS、iPad                         | 読み、演技、騒音、エコー、barge-in、実遅延 |

Cloudflareのテストは採用Wranglerと対応した公式runnerで行う。通常のSQLiteだけを使ってD1の挙動を検証済みにしない。[S12](sources.md#s12)
Playwrightは実行ツールであって、全ケースをE2Eに分類する理由ではない。

## 各層で厚く検証するもの

APIの最重要条件は、未承認送信、古いsnapshot、同時変更、二重送信、他店舗アクセス、価格改ざんを拒否できることである。
D1 batchの途中失敗、条件不成立で更新件数0、古いturnの後続書込み、成功後レスポンス消失、同じidempotency keyを必ず含める。
カート・注文・会計・table eventが整合し、DO通知失敗後にもDBから再同期できることを検査する。

UIは状態をprops/既存query fixtureで再現し、Storybookから実LiveKitや本番APIへ接続しない。
外部I/Oと表示を分ける必要があるComponentだけ薄い境界を作り、単純なComponentを必ずcontroller/viewの二枚にしない。
VoicePanel、言語切替、音声停止再開、会話履歴、商品選択、確認、卓タイムライン、会計のStoryをWebに併置する。
StorybookとCloudflareのVite設定は丸ごと共有せず、React・CSS・i18n等の必要部分だけ共用する。Storybook起動だけでWorkersを起動させない。[S14](sources.md#s14)

Pythonは上流pluginのレスポンス変換と自作の接続部分を重点検査する。標準WebSocketクライアント自体はmockして再実装した挙動を試さない。
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

```python
async def test_音声停止後は新しいフレームを認識へ送らない():
    # 停止後の入力と遅延応答が、新たな処理を開始しないことを確認する。
    ...
```

上は命名例であり、空のテストを納品して合格扱いにしない。
pytest parametrizeのidsも日本語にする。Webのtest名とUI翻訳を混同せず、英語UIのテストでも説明は日本語とする。

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

`test` は外部費用なしの単体・軽量統合、`test:browser` はComponent・Web内統合、`test:e2e` は決定的な全構成、`TABLECAST_RUN_PAID_VOICE_TESTS=1 uv run --project livekit --env-file .env.local tablecast-voice-check` は有料実音声に分ける。
`bun run check` に静的解析・型・無課金テストを含める。Browser/E2EはCI別job。有料試験は手動または明示承認されたjobだけ。
Turboは `livekit` を作業ディレクトリとして `uv run pytest` を呼び、tyとruffも同じ場所で別scriptから実行する。ルートから直接試す場合は `uv run --directory livekit pytest` とする。
全体の固定カバレッジ比率やcase数を目的にしない。認可・注文・金額・中断等の分岐の抜けをレビューし、必要に応じて対象のcoverageを可視化する。
テスト結果、未実行範囲、実機条件を記録し、台本付きモデルの成功を実音声精度の証明にしない。

## CIのジョブとキャッシュ

workflow名は`CI`。job名は`検証の種類: 何を確かめるか (使用ツール)`に揃え、テストには必ず`Test`を付ける。例えば`Component Test: UI操作とアクセシビリティ (Vitest Browser, Storybook)`、`E2E Test: 注文・ログイン・会計 (Playwright)`とする。種類・目的・ツールをslashや中点で連結しない。静的解析、Web/seedのVitest unit、LiveKit Agentのpytest、API/D1/MCPのVitest、開発CLI/seed統合、Vitest Browser/StorybookのComponent・a11y、Playwright E2E、実LiveKit WebRTC、Workers build、Storybook buildを分ける。WorkersとStorybookの成果物・失敗は独立したjobで確認する。

全体の完了時間は3〜4分を目標とする。E2EはActionsのbrowser matrixでChromium・WebKitを2jobに分け、Playwrightの`--project`で対象を選び、各jobで4workersを使う。公開リポジトリで無料の標準Linux runnerを使い、ブラウザー本体・OS依存も対象browserだけ準備する。build・migration・seedは各jobで一度ずつ実行するため、待ち時間と総runner時間の両方を確認する。ケースの隔離と`retries: 0`を維持し、ローカルの`bun run test:e2e`は従来どおり両browserを実行する。

APIは1job・Cloudflare Vitestのファイル単位のstorage隔離を使い、`fileParallelism: true`・`maxWorkers: 4`とする。ファイル内は直列で、各caseのD1 reset・migrationを維持する。`parallel` stepは独立したブラウザー本体・OS依存・Mailpit取得、WebRTCのサービス起動、Webとseedのunitに使用する。各stepの失敗を通常のjob失敗へ伝え、codegenなど書込み先を共有する処理は直列に保つ。

GitHub Actionsの`actions/cache`で静的解析と2種類のbuildの`.turbo`を復元する。OS・architecture・lockfile・jobごとに分離し、コミット単位で保存する。Turbo側ではAPIソース・共有fixture・build環境変数もtask入力へ含め、Workersの`dist`・deploy configとStorybookの`storybook-static`を出力として復元する。テストtaskは`cache: false`で毎回実行する。E2E専用のorigin・資格情報を含むbuild、D1/R2/DO、メール、テスト結果は永続キャッシュへ入れない。

Playwright本体のcache keyはOS・architecture・Playwright版・ブラウザー構成を含む。Chromiumは`--only-shell`でheadless shellだけを取得する。OS依存は別の共通actionでAPT取得済みの`.deb`をcacheする。keyはrunner imageのOS/版・architecture・Playwright版・ブラウザー構成を含み、同じOS・architecture・Playwright・ブラウザー構成ならimageの更新前のarchivesも復元する。`playwright install-deps`はcache hit時も実行し、APTの最新indexによる依存解決と整合性確認、展開・設定を省略しない。追加・更新パッケージだけを取得し、インストール済みの`/usr`やdpkg状態は復元しない。cache復元・未命中時のdownload・OS依存の所要時間をActionsで個別に確認する。cache展開にも時間がかかるため、高速化を未計測のまま保証しない。[PlaywrightのCI資料](https://playwright.dev/docs/ci#caching-browsers) と[Actionsのparallel step](https://github.blog/changelog/2026-06-25-actions-steps-can-now-be-run-in-parallel/)を参照する。

## E2Eの隔離

`bun run test:e2e` はPlaywrightの`test-scoped fixture`で各ケース専用のD1・R2・DO・Googleモック・Mailpit・Web/APIを起動する。各ケースで専用のlocalhostポートと`.local/tablecast-e2e-*/tablecast-case-*`を使い、開発サーバーのDB・Cookie・`.local/demo.json`を参照しない。DockerがMailpitの起動に必要である。GitHub ActionsのLinux runnerではhost networkとケース専用のloopbackポートを使い、vethの生成・削除による他ケースのChromiumの`ERR_NETWORK_CHANGED`を避ける。SMTPは未使用のためOS割当ポートにbindし、メール保存先はケース専用container内に保つ。ローカルのDocker Desktop/OrbStackでは従来のport publishを使用する。

ビルド・migration・合成seed・画像投入はglobal setupで一度だけ実行する。seedに使った`getPlatformProxy`をdisposeし、全writerを終了したstorageを各ケースへ複製する。SQLite内部を直接編集せず、稼働中のDBをコピーしない。ビルド成果物は読み取り専用で共用し、各ケースのdeploy configから固有名のWeb/API WorkersをCloudflare Vite previewで起動する。Wranglerの`WRANGLER_REGISTRY_PATH`もケース内へ分け、別caseの登録・解除がruntime再構成を起こさないようにする。Cookie・メール・DO・認証も別環境であり、固定fixtureのIDが同じでも書込み先は共有しない。

`fullyParallel: true`、`workers: 4`、`retries: 0`で、同じspec内の言語違いも並列実行する。`support/test.ts`の`test`を全specで使用し、標準のpage/request/contextはケース専用の`baseURL`を使う。ケースの成否に関係なく自分のプロセスとcontainerとstorageを終了・削除し、最後にglobal setupのtemplateも削除する。他ケースの成功結果やcleanupの順番を前提にしない。メールとGoogleの同一アカウント試験は、前ケースの登録状態で分岐せず、毎回新規登録から確認する。

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
| 音声turnの認可とspeech/tool関連付け   | `test_realtime_session.py`、実Agent・Sessionと公開provider境界               | APIの実認可、実WebRTC smoke、別枠の有料音声  |
| Git/ファイル/CLI/seed                 | root Vitest `scripts-runtime`                                                | 他workspaceのtestから独立したCI job          |

Webの`browser` projectは `vitest-browser-react` のrender・rerender・cleanupを使用する。外部HTTPと通知を固定しても、feature、QueryClient、Hono clientを本番実装から外さない。想定外の要求は記録し、SUTのcatchの外で失敗させる。カメラはcanvasの合成映像を実MediaStreamへ流す。decoderの各フレームの通知回数を業務の承認回数と同一視しない。

Realtimeの固定provider試験は公開VAD入力→API認可→生成イベント→字幕・tool HTTPを通す。実モデル、TTS音声品質、全割込・エラー経路を保証するものではない。既存のTTS WebSocket・旧経路の試験は担当する契約を残す。

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

E2Eのready条件はWeb/API、Mailpit、OAuth discovery。各要求の期限、子プロセスの異常終了、自分のDocker containerの削除を確認する。migrationログはruntimeを削除する前に`apps/web/test-results/tablecast-runtime/`へ保存する。ケース単位の環境隔離は#40で扱い、UI契約の低い層への移行など#35の残件とは区別する。

### 型付きDB fixture

APIの通常データ投入は`test/database-fixture.ts`の`insertFixture(table, values)`を使う。引数はDrizzleの`SQLiteInsertValue<T>`から列名・必須値・enum・日時型を推論し、単一行と複数行を扱う。SQL生成・値のencodeはDrizzleへ任せ、生成済みstatementを既存の実`D1.batch`へ渡してtransactionのまとまりを保つ。単独の参照・更新・削除には同じファイルの`fixtureDb`でDrizzleの標準queryを使う。

認証は既存の`auth-schema.ts`、業務データは`business-schema.ts`のquery用定義を共用する。既存の行型は`$inferSelect`から導出する。DDL・CHECK・FK・indexの正本は既存のSQL migrationのままであり、query用定義を追加したことを理由にmigrationを再生成しない。

旧schemaからの移行データ、制約違反を直接起こす操作、SQLの読取地点を止める競合試験など、SQL自体が検証条件になる箇所にはraw SQLを残す。ドメイン操作を検証するWhen/Thenをfixture helperに置き換えない。D1/DOの初期化にはCloudflare公式resetと実migrationを使用する。

E2EのpreviewはCloudflare Vite pluginの `inspectorPort: false` でInspectorを起動しない。自動試験に不要な待受とポート割当を省き、並列caseのMailpit等との競合を避ける。通常のdevではInspectorを利用できる。
