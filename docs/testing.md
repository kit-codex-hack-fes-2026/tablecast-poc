# テスト戦略

[索引](README.md) / [受入条件](acceptance.md)

## 原則

ケース設計と層の選択は[fullstack-web-testing](../.agents/skills/fullstack-web-testing/SKILL.md)、この文書はTableCastの実行環境と保証の配置を扱う。既存の認可・競合・データ保全を維持し、設定値の転記や標準機能の内部を試験するだけのケースは追加しない。

Browserの仮想entryから後で読み込む外部依存は、既存の`optimizeDeps.include`に明示する。実行中の依存再最適化でtest iframeがreloadした結果を、操作の失敗や成功と混同しない。認証clientのentry追加時もBrowserとStorybookの対象設定を揃え、共有cacheを消さず隔離した`cacheDir`の初回で確認する。warm再実行だけで準備不成立を解消済みとは扱わない。

メールfixtureの`TABLECAST_EMAIL_FROM`はアドレスだけを指定する。表示名は本番の構造化メールbuilderとMailpitの双方で送信処理が別に設定するため、`TableCast <...>`をenvへ含めない。本番設定は確認済み送信元が必須であり、CLIの本番設定解決を検証する隔離試験にも架空の有効アドレスを明示する。

## UIの動きの検証

`motion-system.browser.test.tsx`はChromium・WebKit・Chromiumのreduced motionで、入退場の途中反転、focus、keepMounted入力、閉じた多言語必須項目のエラー復帰、live regionの寿命を確認する。StorybookはCSS animationを最終フレームで止めるため、共通afterEachは実行中かつ有限のMotion animationだけを待ってからa11yへ進む。ActionFeedbackとMotionProviderの成功表示は、Web Animations APIで検出できないMotionの描画もあるため、Storyのplayで成功文のopacityが1になってからa11yへ進む。無限の待機表示を待たず、動きの無効化やコントラストの除外で失敗を隠さない。

## Vitest 5とWorkersのmodule cache

全workspaceのrunnerをVitest 5.0.5へ揃える。APIのbindings projectだけ`fsModuleCache: false`を指定する。5系のwarm module一括転送は大きなWorkerのmodule graphでWebSocket上限を超え、先頭の試験が成功しても後続Workerが終了する。[上流Issue #16331](https://github.com/cloudflare/workers-sdk/issues/16331)を参照する。公開設定で転送方法を戻し、setupのmigration・storage reset、各fileのisolation、4 workerでの並列実行を維持する。単独の認証試験だけでは再現しないため、解除時には実D1・DO・R2を使うAPI全件を確認する。

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

## 保証の所有層とE2Eへの昇格

runner名ではなく、接続した実物と観測結果で分類する。純粋計算はunit、認可・金額・SQL・競合はAPIの実binding、フォーム・Query・再試行はWebの機能統合を主担当とする。Storybookは表示状態と部品操作のカタログであり、HTTPを差し替えた画面成功を実API・DBの成功として報告しない。

| 所有層            | 実物として接続するもの                                                                                   | 差し替え・固定する境界                  | 観測する結果                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 純粋unit          | 本番の計算・schema・状態遷移。Vitest Node                                                                | 必要な時刻・乱数・ID                    | 価格・期限・数量の境界、入力と失敗分類                                                                 |
| API統合           | 本番Hono/Worker HTTP入口・認可・service・Drizzle・実local D1/DO/R2。Cloudflare公式Vitest連携             | 外部モデル・IdP・メール配送等の外側だけ | status・本文・header、別店舗/卓/roleの拒否、永続状態、原子性・競合・通知からの回復                     |
| UI部品・Storybook | 本番component・CSS・i18n・実ブラウザー、storyのplay/a11y                                                 | props・表示fixture・部品外のcallback    | 日本語のloading/empty/error、入力・focus・寸法・reduced motion                                         |
| Web機能統合       | 本番feature・QueryClient・memory Router・provider・Hono client・必要なiframe/MediaStream。Vitest Browser | HTTP応答・通知接続先・外部media境界     | payload、送信中、失敗後の入力保持・再試行、cache再取得、URL状態、遅着、unmount後の保存値               |
| 実StartのWeb統合  | 実TanStack Startのroute loader・SSR・hydration・ブラウザー履歴                                           | Web内に限定できる場合は下流API等        | documentとclientの接続、直接URL・戻る・pending/error境界。memory Routerだけでは証明しない              |
| 全構成E2E         | 実browser→build済みStart→Service Binding→本番API→D1/DO/R2・Better Auth、必要なMailpit/OAuth emulator/SW  | 有料AIや外部providerのみ決定的な応答へ  | 代表操作の永続化・再読込、Cookie・外部redirect・メールURL、実WebSocket・Service Worker・配信資産の配線 |
| runtime基盤       | rootのscripts-runtimeと隔離した実Git/ファイル/TCP/子プロセス、E2E専用fixture                             | 外部費用と本番資源                      | 起動/停止・待受保持・ケース隔離・異常終了・後片付け。業務規則とは分ける                                |

Cloudflareの試験には採用SDKと対応する公式runnerを使い、通常のSQLiteやDB mockを実D1の代わりにしない。[S12](sources.md#s12) APIのservice直呼びは実DBの業務保証にはなるが、HTTP認可・validation・serializationまで通した証拠にはならない。独立したrole・tenant・HTTP認証の拒否を省かない。

実Startの独立した試験環境は今回追加しない。現在は`api-fetch.test.ts`の実dev変換と代表SSR E2Eを使い、実loader・Cookie・Service Bindingの接続が必要な部分を残す。テストだけのための本番wrapper・controller/viewの一律分割・別workspaceを作らない。

### 昇格の条件と移行の手順

1. 守る規則と利用者から観測する結果を特定し、既存unit・API・story・Browserに同じ保証があれば再利用する。
2. 不足する下位保証を本番の公開feature/HTTP入口へ追加し、実行成功を確認してから上位の重複を除く。移行前の観測結果・代替テスト・残す接続を対応付ける。
3. 実SSR/loader・Cookie属性・Service Binding・外部redirect・メールURL・SW・実WebSocket・build資産など、下位で再現できない具体的な失敗リスクだけを実Startまたは全構成E2Eへ上げる。
4. E2Eではその境界を一巡する最小の代表操作を残す。日英・viewport・失敗・retry・価格/権限の全分岐を全構成で反復しない。WebKit固有のfocus・media・iframe等は既存Browserの対象構成と代表E2Eへ残す。

カメラの比率・サイズ変更は実MediaStreamとvideo metadataで確認する。Chromiumは描画を継続するcanvas.captureStream、WebKitはPlaywrightが標準で有効にするmock capture devicesを使い、隔離したWebKit Browser contextだけに`camera`権限を付与する。物理カメラは使わず、失敗・遅着はgetUserMedia境界で制御する。映像metadataを検証するfixtureは、アプリの明示ON・機器切替によるgetUserMedia呼び出し時に映像を取得し、WebKitのユーザー操作開始条件を保つ。Linux WebKitのcanvas.captureStreamはmetadata到着が不安定なため、この保証の映像供給には使わない。試験後は全trackを停止する。

有料・実機では実LLM/STT/TTS、iPad、騒音・エコー・barge-in・実遅延を別途確認する。決定的なモデル応答や合成カメラの成功を、実モデル品質・実機カメラの受入と同一視しない。

### 大量データと背景取得失敗の境界

`voice-realtime.test.ts`は実D1に2,000商品を保存し、公開toolの先頭・隣接ページ・1,000件を超えるoffset・末尾・終端でID、価格、版、続きを示す値、6,000byteの応答上限を確認する。個別詳細の必須選択と不正入力の拒否も残す。ページングはoffsetからの切り出しで状態を持たないため、全250ページで認可・イベント記録・catalog parseを繰り返す負荷試験にはしない。HTTP認証・tenant境界とDB往復予算は既存のAPI試験が所有する。

Accountの保存後再取得失敗は、実QueryClientとHTTP gateを接続したBrowser試験で、保存中の入力停止、保存後の次の入力、既存cacheの保持を確認する。エラー通知は失敗した取得領域の名前付きregionで観測する。ページ全体の通知数やアニメーションの切替時刻を保存成功の条件にしない。

### localeの保証とComponentの実行

Component jobのBrowser統合とStorybook自動試験は日本語で実行する。Chromium/WebKitの対象とworker枠は従来どおりで、localeとengineを同じ軸にしない。英語Storyは閲覧用カタログに残し、標準の`tags: ["!test"]`で自動実行から除く。英語だけに存在する失敗・再送・読取専用・長文操作は、日本語の自動試験へ移してから除外する。

| 以前のlocale別Component保証                            | 現在の所有先                                                                                                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 日英の翻訳キー、空欄、補間入力                         | Nodeの`i18n/messages.test.ts`と既存Paraglide compile。公開メッセージ関数の日英日呼出しを確認する                                                                        |
| JPY、日時の日跨ぎ・年越し、店舗timezone                | 本番`money`・`time`・`dateTime`を呼ぶNodeの`i18n/format.test.ts`                                                                                                        |
| フォームエラーの日英再翻訳と項目対応                   | 既存`form-validation.test.ts`、本番HTTP clientの失敗解析と純粋変換を接続する`server-field-errors.test.ts`。修正済み項目を言語切替で復活させず、新しい失敗では再付与する |
| フォームの入力保持・再送・対象への表示                 | 日本語のCreateStore・PaymentForm・ConfigurationWorkflow Browser。実provider・Router・HTTP clientを使う                                                                  |
| 音声の次ページ503→再送・候補と入力の保持               | `JapanesePagedVoices` Story。日本語UIから英語の接客指示と音声IDを保存する                                                                                               |
| 未設定／利用不可音声の読取専用表示、下書きなしの公開版 | `JapaneseReadOnlyAndUnavailable`・`WithoutDraft` Story                                                                                                                  |
| 商品名150文字・説明3000文字のスクロール・Tab操作       | `JapaneseLongDescription` Story。英語版は閲覧用に残す                                                                                                                   |
| 8件の長い英語会話原文と最終行の中断状態                | `JapaneseLongHistory` Story。原文を英語のまま保持し、日本語UIで履歴を表示する                                                                                           |
| 同名反復行・長文・追加削除・エラー時focus              | ConfigurationLayoutの`RepeatedRows`へ3グループ×5選択肢を残す。通常状態と空白IDは同名の2グループ×2選択肢で確認する                                                       |

日本語UIで扱う英語の入力値・会話原文・来店locale・API payloadは別の業務データとして保持する。幅1280/390、縦横、別名31件／101文字、商品単位と65商品・65,536ノードの上限はlocaleから分離した日本語ケースへ残す。APIの二言語データ保存や、代表E2Eの客英語・店側日本語の接続は維持する。

この変更前の日英試験と件数は過去の実施記録であり、現在のComponent実行対象を示すものではない。削減した件数そのものやローカルの成功だけでCIのtimeoutを解消済みと判断せず、対象SHAのcold/warm・通常順・shuffleを記録する。15秒のcase予算とretry 0を維持し、一時診断のtraceを恒久のComponent artifactへ追加しない。

### 全E2Eの現在の責務（Issue #288）

16 specの全ケースを下位保証と照合した。接続が異なるケースは件数を保ち、重複する準備・表示分岐・操作を削る。以下のBrowserは`apps/web/src/`、APIは`apps/api/test/`を起点とする。Issue #272の表は移行時の記録であり、現在の待機と対象はこの表と実specを参照する。

| E2E spec（`tablecast-`を省略） | 下位へ置く保証・短縮する操作                                                                                                        | 残す接続と観測結果                                                                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `account`                      | CreateStore Browserの入力/保持、API auth-linking・store-membership。パスキーcaseのGoogleログインは実API Given                       | Google redirect/Cookie→実招待メールURL→別利用者の所属。実WebAuthn登録→旧session消失→同userの新session                                                                    |
| `customer`                     | CustomerFeatures/Consistency BrowserとAPI customer-visits/membershipsの同意・競合・冪等性                                           | 会員QR→ログイン復帰→同意→別Cookieの二人参加→閉卓/再来店。対象visit・参加者数/別user・customer manifestを確認                                                             |
| `order`                        | Kiosk/ProductDialog/PaymentForm Browser、API orders/table-lifecycleの入力・価格・版・原子性                                         | 店側日本語・客英語のUI端末承認→代表modifier→明示注文→提供→会計→対象sessionの閉卓                                                                                         |
| `admin-publication`            | ConfigurationWorkflow Browserの下書き再開/保存競合/公開確認、API configurationの公開隔離                                            | 代表価格の編集→保存/再読込→明示公開→別Cookieの客画面/再読込へ新しいcatalog版を反映                                                                                       |
| `option-images`                | ConfigurationImageField/MenuItem Browser、API image-upload/mediaの失敗・容量・cache                                                 | SSR file入力の無効→hydration→代表画像upload/保存/再読込→実画像decode                                                                                                     |
| `games`                        | Store/Kiosk Games BrowserとAPI games。管理previewの反復を除き、GameFrame Browserで実iframe/SDKの遅延したsave応答二回→exit順序を検査 | preview ready→人の試遊確認→公開→客の配信iframeで代表save→runのrevision/状態→終了/カート保持                                                                              |
| `demo`                         | Demo/Viewport Browserの回転UI・寸法・全設定、API demoの実営業/通知/認可分離                                                         | popup→実iframeの客言語→回転search付きreload。別demoの言語と元iframe/店側の言語が独立する結果                                                                             |
| `oauth`                        | Nodeの翻訳契約、API authのPKCE/consent/token/MCP接続。表示言語の反復を除く                                                          | ログイン/同意→登録した外部callbackのorigin/path・state/code・errorなしを確認                                                                                             |
| `resize`                       | AdminShell BrowserのCookie保存/remount・mobile開閉/focus/入力保持                                                                   | 実windowのdesktop→mobile→desktopでPanelを再登録し、保存幅を復元                                                                                                          |
| `ssr`                          | Account Browserで保存後session再取得一回・floor/stores再取得なし。各feature Browserが表示分岐を所有                                 | 代表URL各一回のSSR/hydration、JSなし・匿名非漏出、実root/redirect・focus/stale、route pending/error/retry。対象商品の画像decode/font完了後に計測可能なCLS 0.01未満を検査 |
| `realtime`                     | Kiosk Browserの古い通知/遅着/unmount、API realtimeの実DO                                                                            | 実WS切断→HTTP回収→再接続通知で同じカート行だけを更新                                                                                                                     |
| `publication`                  | Kiosk Browserの通知後表示、API configurationの版/店舗分離                                                                           | WS拒否中の実公開→HTTP回復だけで価格更新、document再読込なし                                                                                                              |
| `admin-realtime`               | TableDetail/Floor Browser、ActivityLog Story、API realtime                                                                          | 支払前に対象sessionのHTTP events待ちを登録し、payment cursorまで回収→実WS復帰、表示重複なし                                                                              |
| `image-performance`            | ProductImage Browserの枠/失敗/hydration、API mediaのR2/Images/cache                                                                 | 24/120商品・3標本・DPR 2・cold 500,000byte以下・warm転送0・計測可能なCLS 0.1未満・cart 112px幅・角丸の正方形枠・画像の比率を維持。viewport内の実画像成功を待つ           |
| `pwa`                          | pwa-update unitで3manifestの静的値/実icon、Pwa Browserで通常/会員の案内開閉。Query/更新拒否分岐もBrowser                            | build資産のHTTP配信、実SW control/cache/offline/quota、二画面の未保存保護→controller交代→各一回reload                                                                    |
| `runtime-isolation`            | root scriptsの実TCP/OAuth・APIのbinding reset                                                                                       | 意図したserial二ケースで、case内restartはD1/assetsを保持し、次caseで閉じたtemplateから復元                                                                               |

`approveGuestDevice()`は実request→staff承認→guest pollとCookie発行だけを共通化し、pollのHTTP 200に加えて`ready: true`を要求する。注文journeyのUI端末承認、各specの公開・注文・保存とThenはhelperへ隠さない。

OAuthの同意は採用Better Authのprovider/redirect pluginが所有する。店舗選択のCookie更新後の自動再開と、許可/拒否後の転送に独自の`continue`や`location.assign`を重ねない。E2Eは旧documentにも現れるボタンや転送後に破棄されるresponse本文を根拠にせず、client/state付きの転送先documentと外部callbackの読込を待つ。

待機は対象の結果へ結び付ける。role/nameで領域を特定し、保存後はフォームreset・dialog消失・版/値の反映、メールは宛先、認証はuser/session、ゲームはrun版/状態を観測する。HTTP通知待ちは変更操作より先に登録し、要求counter/listenerは`finally`で解除する。固定sleep・`force`・操作retry・広い`.first()`で競合を隠さない。複数候補から合成fixtureの先頭を測る場合は、その意味と件数を明示する。

runtime再起動はlisten markerだけで完了とせず、入口の実API・Mailpit・OAuth readinessまで待つ。下位テストの成功・E2Eの件数・過去の実行時間を現在SHAの接続成功や高速化の証拠にせず、全件/選択実行、engine、cold/warm、所要時間をPRへ残す。

### Issue #272の移行対応

移行時点のspec名と所有先を示す。locale別Componentの現在の分担は上節を参照する。新旧の件数やこの表自体を実行成功の証拠にせず、対象SHA・実行範囲・未実施項目をIssue/PRへ記録する。以下のBrowserは`apps/web/src/`、APIは`apps/api/test/`に併置する。

| 移行前のE2E                                                   | 既存・追加した下位保証                                                                                                                                                                       | 残す全構成の代表経路                                                                                                                      |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| accountの名前保存・送信中・メール/Google同一user              | `account.browser.test.tsx`、実auth handler+D1の`auth-linking.test.ts`。カタログ読込は既存MenuCollection/DataTable                                                                            | Google→SSR→店舗作成→招待メール→別userの参加、実WebAuthn登録/再ログイン                                                                    |
| form・device-qr・loading-layout・accessibility・ssrの表示分岐 | `email-access.browser.test.tsx`、`devices.browser.test.tsx`、Account/Floor/VisitHistory/MenuCollection、既存Form/DataTable。実decoder・合成MediaStream・日英の通常表示・keyboard/focusを確認 | ログイン復帰、端末Cookie発行、代表SSR/hydration。実生成routeと既定pending/error/retryの接続、reduced motionの実media/CSSだけ代表1件へ残す |
| integrations・resizeの画面操作                                | `admin-shell.browser.test.tsx`、`store-profile.browser.test.tsx`、既存IntegrationSetup、`mcp-sessions.browser.test.tsx`、Kiosk                                                               | 店舗の代表SSR、OAuth同意、画像upload→保存→配信。Cookie保存/再表示とmobile操作はBrowser、管理sidebarの実window幅を跨ぐ復元は短いresize E2E |
| customerの設定・記憶・ポイント・クーポン                      | `customer-features.browser.test.tsx`、`rewards.browser.test.tsx`、既存会員APIと実HTTP/D1の`customer-rewards-http.test.ts`                                                                    | QR→login returnTo→同意→別Cookieの二人参加→卓への反映→閉卓/再来店の自動参加                                                                |
| gamesの日英反復・poll失敗・開始遅着・停止                     | 店側/客側の`games.browser.test.tsx`、既存GameFrame BrowserとAPI games                                                                                                                        | 人の試遊確認/公開→卓の実iframe/SDK保存→終了→カート画面復帰を1言語                                                                         |
| configuration・menu-navigation・cast-overview・voice-config   | 既存ConfigurationWorkflow/MenuCollection Browserを補完。CastOverview/ConfigurationChanges stories、API configuration/voices/mcp                                                              | `tablecast-admin-publication.spec.ts`の価格編集→保存/再読込→人の公開→別Cookieの客画面への反映                                             |
| option-conditions・missing-choice                             | 既存OptionConditionsEditor/ProductPage/Kiosk Browser、API configuration/orders。Kioskへ同じ未完了行の409と入力保持を補完                                                                     | modifier選択→版付き明示確認→注文→提供→会計→閉卓                                                                                           |
| theme・theme-art                                              | `store-design.browser.test.tsx`、既存StoreTheme/Kiosk Browser、API appearance/media/image-upload                                                                                             | 画像の取込/配信と公開通知の代表接続を再利用                                                                                               |
| option-imagesの多数の画像/選択肢/価格操作                     | 既存ConfigurationImageField/MenuItem/ProductPage Browser、API image-upload/configuration/media                                                                                               | 商品画像1枚を画面で取込→保存→再読込→実画像decode                                                                                          |
| history・floor-timelineの操作                                 | `visit-history.browser.test.tsx`、既存FloorTimeline/TableDetail Browserを補完、API history/table-lifecycle                                                                                   | フロアの代表SSRと、注文E2Eの来店/会計/閉卓                                                                                                |
| demoの全設定組合せ                                            | `demo.browser.test.tsx`、既存DemoViewport、API demo                                                                                                                                          | 店側popup→実iframeで客言語だけ変更→再読込→別demo ID/Cookieの分離                                                                          |
| realtime・publicationの期限/版分岐                            | Kiosk Browser、API orders/configurationと実DO                                                                                                                                                | 実WebSocket切断→HTTP回収→再接続、公開価格の反映とdocument非再読込                                                                         |
| pwaの背景GET差替え・接客中の更新保護                          | Pwa Browserの実Queryと更新可否。実Kioskを接続し、接客中の拒否と閉卓後の許可をMessageChannelで確認                                                                                            | 実SWのcache/offline、複数clientの未保存入力/更新適用                                                                                      |
| ssrの無予算の4標本反復・Worker restart                        | 各featureの取得/操作はBrowserへ。計測回数自体は保証にしない                                                                                                                                  | 代表URLを各1回のSSR/hydration、JS無効・匿名隔離・session/PWA redirect                                                                     |
| image-performance・runtime-isolation                          | 既存予算とruntime fixtureの実物を維持                                                                                                                                                        | 下記の画像予算とケース間の配信資産隔離を引き続き実E2Eで検証                                                                               |

画像性能は[`tablecast-image-performance.spec.ts`](../apps/web/e2e/tablecast-image-performance.spec.ts)の24/120商品で、取得済みURLの再訪転送0、cold画像転送合計500,000byte以下、計測可能なCLS 0.1未満、実画像の縦横比・カート画像112pxの角丸枠と元の比率を保つ。WebKitでbyte値が取得できない場合は制限を記録し、Chromiumの予算検証で補う。件数の多いfixtureや上限を緩和して高速化済みにはしない。Resource Timingの収集枠は1,000件を確保し、満杯になった標本は転送量が欠けるため失敗とする。記録の収集枠と画像転送の予算を区別する。

[`tablecast-runtime-isolation.spec.ts`](../apps/web/e2e/tablecast-runtime-isolation.spec.ts)は、同じworkerでケース内の再起動がassets変更を保持し、次のケースで変更・追加ファイルを復元する保証を維持する。稼働中stateのcopyやfixture共有で業務テストを速くしない。

動画基盤のVitestはCIの`unit-web`ジョブでWeb・seedと並列に実行する。保存音声やLFS素材を取得せず、台本・時間計算・ズーム・収録完了判定と保存素材への個人パス再混入を検査する。動画全編の生成・OpenScreen収録・有料音声は含めず、[共有と復元](../apps/presentation/SHARING.md)へ実施記録を残す。

## 各層で厚く検証するもの

APIの最重要条件は、未承認送信、古いsnapshot、同時変更、二重送信、他店舗アクセス、価格改ざんを拒否できることである。
D1 batchの途中失敗、条件不成立で更新件数0、古いturnの後続書込み、成功後レスポンス消失、同じidempotency keyを必ず含める。
カート・注文・会計・table eventが整合し、DO通知失敗後にもDBから再同期できることを検査する。

UIは状態をprops/既存query fixtureで再現し、Storybookから実OpenAIや本番APIへ接続しない。通常のStoryはdemo seedと同じ生成関数から店舗設定・商品・価格・選択肢・画像キーを取得する。画像はassets/demoの同じ素材をseedと同じidentityの/mediaへ配信し、画像なし・失敗・長文等の専用ケースだけ小さいtest-supportのfixtureを使う。通常StoryとPRの代表画面を画像なしの試験fixtureで代用しない。
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
Browser統合で期限そのものを検証するcaseは、実featureへAPIの期限を渡した後の待ちを局所的なclock制御へ置き換えられる。Kioskは`Date`・`setTimeout`・`clearTimeout`だけを固定し、Queryの0ms通知を解放した上で期限1ms前の表示と期限到達時の消失、注文未送信を観測する。`finally`で時計を戻し、RAF・`setInterval`・MessageChannelや実SW/WebSocketの接続検査は実ブラウザーへ残す。
最低限必要な入力だけのfixtureを使う。大規模デモseedを全unit testへ読み込まない。
上限の保証に必要な大きいデータは減らさず、検証する責務と編集対象を分ける。条件全体の上限は65商品・65,536ノードを保持して小さい商品を編集し、商品単位の上限は大きい条件DOMで検査する。削減後の保存では編集外のデータも含めてHTTP payloadを照合する。
固定sleepで成功を待たず、状態、イベント、画面の役割と名称、promiseの完了を待つ。
ライブラリ内のprivate stateやDOM構造へ過度に依存せず、公開APIと利用者に見える結果を観測する。

Browserの速度は全件の準備・実行・終了を含む経過時間で比較し、Vitestの`setup`・`import`・`tests`は並列fileの集計として分ける。Storybookの自動setupや初回依存変換も含むため、同じ環境・cache条件・対象・worker枠を記録する。workspaceの本番sourceを事前bundleする案は、source変更時のcache失効とwatch時の再読込を確認してから採用する。

`test:browser`はParaglide公式CLIの[`locale-modules`](https://paraglidejs.com/compiler-options#outputstructure)を先に生成する。1,024個のmessage moduleを日英2つのlocale moduleへまとめ、既存の`messages.js`・`m`・単一runtimeを使う。本番sourceや生成物を手編集せず、通常codegenと公開buildはtree shaking向けの`message-modules`を保つ。公開Storybookもbuild前にこの形式を生成し直す。生成先を共有するBrowser試験・codegen・dev/watch・buildは同じcheckoutで並走させない。

## 公開scriptとCI

`test` は外部費用なしの単体・軽量統合、`test:browser` はComponent・Web内統合、`test:e2e` は決定的な全構成、GPT-Live・Responses delegationの実通信は許可された有料実音声に分ける。
`bun run check` に静的解析・型・無課金テストを含める。Browser/E2EはCI別job。有料試験は手動または明示承認されたjobだけ。
全体の固定カバレッジ比率やcase数を目的にしない。認可・注文・金額・中断等の分岐の抜けをレビューし、必要に応じて対象のcoverageを可視化する。
テスト結果、未実行範囲、実機条件を記録し、台本付きモデルの成功を実音声精度の証明にしない。

## CIのジョブとキャッシュ

通常PRの[種類別行数レポート](static-analysis.md#prの種類別行数レポート)は、他の検証・配備を待たない独立jobで実行する。必須チェックの集約には含めず、失敗を0行で補わない。分類・表生成と実Git snapshot/clocの接続はrootの`scripts/tablecast-cloc.test.ts`が所有し、`scripts-runtime`で実行する。runtime全件を選んだCIとDev Containerには、計測jobと同じcloc 2.10を固定導入する。ローカルの導入は[セットアップ](setup.md#種類別行数のローカル確認)を参照する。

コメントの初回作成・追随commitでの同一コメント更新・古いrun再実行の投稿抑止は、変更したworkflowを持つDraft PRで確認する。比較元/head SHA、run URL、コメントIDを記録し、古いrunの成功だけを現在のheadに対する検証と扱わない。製品Browser/E2Eへ分類規則の保証を重ねない。

静的解析ジョブは依存導入・codegen後にformat・lint・型検査と`bun run fallow`を実行する。fallowは比較元に依存せず全コードの構造errorを必須にし、未変更ファイルに残ったerrorも失敗させる。複雑度・重複は警告として報告する。parse・設定・解析自体が失敗した場合もjobを失敗させる。fallowのbranch・作業ツリー依存の結果はTurbo cacheへ載せない。ローカルのcommit前検査と部分stage時の影響は[静的解析](static-analysis.md#fallow)を参照する。

Issue #272のテスト再配置ではworkflow・差分CIを変更しなかった。Issue #275では、通常PRの既知の変更だけを選択実行する。対象のjobはcheckout直後の共通actionでGitHub Compare APIが返すmerge-baseから最新headまでの差分を調べ、実行計画と対象外の理由を各jobのActions summaryへ記録する。静的検査は分類せず開始する。Containerイメージの検査・artifact生成も差分選択の対象外とし、通常CIで常に実行する。jobごとの比較結果が異なりWorkers buildだけが全件へ戻っても、同じSHAのContainer artifactを取得できるようにする。比較APIの呼出しは重複するが、分類専用のrunner・jobと全job共通の開始待ちを増やさない。集約チェックは従来の各必須jobの成功を要求する。staging/mainへのpushとカタログ以外の手動CIは全件実行する。

Webの通常のTS/TSX変更はVitestの`related --run`で本番feature・provider・clientへの静的importを辿り、Web unitとBrowser/Storybookの関連fileを選ぶ。テストだけの差分は既存projectのincludeに従い、対象層へ絞る。

| Web内の変更                               | Web unit        | Component Test  |
| ----------------------------------------- | --------------- | --------------- |
| 通常の製品TS/TSX                          | `related --run` | `related --run` |
| `*.test.ts`のみ                           | `related --run` | 対象外          |
| `*.browser.test.tsx`・`*.stories.tsx`のみ | 対象外          | `related --run` |
| route・SSR・CSS・翻訳等の共有入口         | 全件            | 全件            |

例えば`api-fetch.test.ts`だけの変更はWeb unit、`kiosk.browser.test.tsx`やKioskのStoryだけの変更はComponent Testを選ぶ。いずれも、ファイルを複製して別プロセスのresolverを起動するrootのimport規則検査を残す。Web製品コードの変更ではWorkers buildとE2Eを全件実行する。E2E specだけの変更、動画制作の変更、文書だけの変更は、それぞれが所有する試験へ絞る。対象のないjobも実行理由を記録して成功で終了し、集約チェックは全jobの成功を引き続き要求する。対象外の記録を試験の実行成功と扱わない。

静的importに載らないHTTP・binding・ファイル読取・spawnを推測で選別しない。API・migration・binding・開発script・環境・依存・実行設定・未分類path、削除・rename、比較取得の失敗は全件へ戻す。Web内でもroute・SSR・Service Worker・CSS・翻訳と生成入力・public・Storybook設定はWeb全件へ戻す。差分を選べる場合でも、関連テストが合計0件になった場合は、そのCLIに指定したprojectを全件実行する。選択した試験が失敗した場合の再試行ではなく、実行前の対象判定に対するfallbackである。[Vitestの関連試験](https://vitest.dev/guide/cli.html#vitest-related)

workflow名は`CI`。job名は`検証の種類: 何を確かめるか (使用ツール)`に揃え、テストには必ず`Test`を付ける。例えば`Component Test: UI操作とアクセシビリティ (Vitest Browser, Storybook)`、`E2E Test: 注文・ログイン・会計 (Playwright)`とする。種類・目的・ツールをslashや中点で連結しない。静的解析、API/D1/MCP、Component・a11y、Playwright E2Eを別jobで確認する。Web・seed・動画基盤・開発CLIのVitestはunit-webへ統合する。通常CIのbuildはWorkersを担当し、Storybook・React Emailの公開ビルドとデプロイは[手動カタログ](deployment.md#prのstorybookメールカタログ)へ分ける。Storybookのinteraction・a11y試験はComponent Testへ残す。

全体の完了時間は3〜4分を目標とする。E2EはActionsのbrowser・shard matrixを使う。PRはChromiumを2分割の計2job、staging/mainへのpushと手動実行はChromium・WebKitを各2分割の計4jobで検査する。Playwrightの`--project`と`--shard=1/2`・`--shard=2/2`で対象を選び、各jobで4workersを使う。既存の`fullyParallel: true`によりケース単位で分配し、イベントごとに選ばれた全shardの成功を集約チェックの条件とする。PRの製品プレビューはbuild・images成功後に先行配備する。静的検査・API・Browser・E2Eはマージ条件に残し、プレビュー到達を検査完了とは扱わない。staging・本番配備は両browserを含む全必須検査の成功を待つ。失敗時のtrace・画像artifact名にはbrowserとshard番号を含める。公開リポジトリで無料の標準Linux runnerを使い、ブラウザー本体・OS依存も対象browserだけ準備する。build・migration・seedは各jobで一度ずつ実行するため、待ち時間と総runner時間の両方を確認する。分割は[Playwright標準のsharding](https://playwright.dev/docs/test-sharding)を使い、ローカルで分配だけを確認する場合は`bun run test:e2e --project=tablecast-chromium --shard=1/2 --list`を実行する。ケースの隔離と`retries: 0`を維持し、ローカルの`bun run test:e2e`は従来どおり両browserを実行する。

Component Testは準備・実行・終了と集約を含む待ち時間を3分以下にする。全件実行だけVitest標準の`--shard=1/3`〜`--shard=3/3`で別runnerへ分配し、全shardの成功を従来名の必須チェックへ集約する。失敗・取消・準備失敗は成功にせず、`fail-fast: false`で全shardの診断を残す。PRの`related --run`はshard 1だけで実行し、対象0件なら既存の全件fallbackを使う。少数の関連fileを分割して、空shardが全件fallbackを起こす重複を避ける。ローカルの`test:browser`は分割しない。Component jobは約900MBのBun取得cacheの復元を省き、固定lockから直接依存を取得する。試験成功結果のcacheではなく、依存準備の展開待ちを除く変更である。

UIの保証はChromiumのfeature統合とStorybookのplay/a11yを主担当とする。WebKitはnative日付入力、QR decode、カメラ、focusとportal、ペインの縦横切替、会話のscroll、画像decode、ゲームiframeへ絞る。reduced motionは共通Motion・RouteMotion・商品画像と注文の動き・会話候補の所有部品で確認し、同じ業務操作の全fileを繰り返さない。API応答・cache・通知順・検索・注文承認・スタッフ呼出の全分岐はChromiumで保持する。

4言語×3寸法×2engineで成功画面を撮るだけの`kiosk-seed-preview.browser.test.tsx`は削除する。多言語の商品名は`product-name.browser.test.tsx`、seedの商品カードは`product-menu.stories.tsx`、実画像decode・転送量・CLSは既存の`tablecast-image-performance.spec.ts`、Dialog・カート操作は`kiosk-order-ui.browser.test.tsx`、縦横・狭幅は`kiosk-layout.browser.test.tsx`が所有する。同じ配置になる1512pxと1180px、224pxと240pxの反復も除き、横配置・縦配置・狭幅・最小会話欄・広い会話欄の代表を残す。成功時PNGの収集は全Browser試験から除き、失敗時の標準撮影を維持する。pixel比較をしない画像収集を独立した回帰保証と扱わない。

PRのマージ前に保証するE2EはChromiumであり、WebKit固有の回帰はstaging統合後のpush CIで検出する。stagingのWebKitが失敗した場合はstaging配備へ進めず、修正後の両browser成功を確認してからreleaseの受入判定を行う。PR CI成功をiPad実機やWebKitの確認済みと扱わない。

Component Testの失敗PNGは従来の`test-results/browser`とVitestの`test-results/attachments/failure-screenshots`から`tablecast-components-<SHA>-<shard>`、E2Eの失敗資料は`tablecast-e2e-<browser>-<shard>`へ1日保存する。Component Testは標準の`screenshotFailures: true`、E2Eは`screenshot: "only-on-failure"`を使う。pixel比較や観測に使わない成功時のPNG・動画を明示的に毎回生成せず、標準の失敗診断用の一時撮影は維持する。表示・focus・寸法・画像読込・転送量・CLSのassertionは維持し、viewport変更後の寸法は撮影を暗黙の待機にせず`expect.poll`で確認する。Component TestのartifactへCookieを含む可能性のあるtraceは追加しない。目視確認用の画像・動画は必要な作業で別途取得する。

Playwrightのreport用git差分収集は`captureGitInfo.diff: false`とし、浅いcheckoutの不足baseをmetadataのために取得しない。コミット情報と試験本体の`--only-changed`用の履歴取得は維持する。CIが先行取得したMailpit imageはglobal setupの`docker create --pull=missing`で再利用し、同じtagを再度pullしない。ローカルでimageがない場合はcreateが取得する。

APIは2 shardのjob・Cloudflare Vitestのファイル単位のstorage隔離を使い、`fileParallelism: true`・`maxWorkers: 4`とする。Vitestの標準shardはfile単位であり、一つの長いcaseを分割しない。shardを増やす前に、最遅file、runnerとruntimeの準備、総runner時間、全必須jobの完了時刻を比較する。ファイル内は直列で、各caseのD1 reset・migrationを維持する。導入済みCloudflare pluginにはmigration済みbindingのsnapshot復元APIがないため、caseごとの初期化を`beforeAll`へ持ち上げない。

共通setupはstorageのreset・migrationに必要な依存だけを読み込み、業務の認証fixtureを全fileへ持ち込まない。bindingを使わないHTTP応答の変換・入力検証は既存のNode unitへ置く。認証・メールの保証は本番handlerと実bindingで維持する。メール描画は実送信時に読み込み、メールを送らないAPI操作の初期化へ描画依存を含めない。setupからimportへ時間を移しただけで改善と扱わず、準備・case実行・終了のwall timeを確認する。

APIのbindings projectはVitest標準の`deps.optimizer.ssr`で認証ライブラリの公開入口を事前変換する。`node:`・`cloudflare:`・`workerd:`はnative moduleのまま解決し、DB・DOやWorkerをNodeの代替実装へ置換しない。再利用するのは依存コードの変換成果物だけであり、テストの成否・storage・caseの実行は再利用しない。Viteの通常の失効規則を使い、独自のbundle同期や実装sourceの事前bundleは追加しない。

rootのVitestは`maxWorkers: 2`とする。CIのunit-webではruntimeを2枠、scripts-unit・Web unit・動画の各CLIを1枠にし、同じrunner内のVitest fileを最大5件に制限する。枠はCLIごとに適用され、rootの値だけで別processの枠まで制限できるとは扱わない。`parallel` stepは独立したブラウザー本体・OS依存・Mailpit取得にも使用する。各stepの失敗を通常のjob失敗へ伝え、codegenなど書込み先を共有する処理は直列に保つ。

GitHub Actionsの`actions/cache`で静的解析・Workers buildと手動カタログbuildの`.turbo`を復元する。OS・architecture・lockfile・jobごとに分離し、コミット単位で保存する。静的検査のlintはrootとworkspaceへ重複なく分担し、workspaceのlint・typecheckをTurboでcacheする。root lintはCLIで`apps/**`を除外して毎回実行し、各workspaceは直下のconfigを含む`.`全体を型付き解析する。formatはrootから全体を一度だけ確認する。対象と設定の責務は[静的解析](static-analysis.md#検査範囲とキャッシュの分担)を参照する。Turbo側ではAPIソース・共有fixture・build環境変数もtask入力へ含め、WorkersのBuild OutputとStorybookの`storybook-static`を出力として復元する。選択したテストtaskは`cache: false`で実行する。E2E専用のorigin・資格情報を含むbuild、D1/R2/DO、メールと個々のテスト成果物は永続キャッシュへ入れない。

型検査は各manifestの`typecheck` scriptから明示したネイティブCLIを実行する。TanStack・Storybook用の既存TypeScript APIとの併存と実行版の解決は[型付き解析と型検査](static-analysis.md#型付き解析と型検査)に従う。

Bunの取得cacheは全jobが`actions/cache/restore`で復元し、`static`だけがfrozen install成功後に標準の`actions/cache/save`で保存する。新しいlockの同じcacheを全jobが圧縮・保存し直す競合を避け、保存専用jobや共通の開始待ちを作らない。保存されなくても各jobは固定依存を導入してから検査する。Turboを使うjobはcodegenより先にcacheを復元し、生成済みParaglideを復元できる場合は再生成を避ける。lock更新時の取得・圧縮費用と、同じlockのwarm実行を区別して測る。

共通setupの既定codegenは、Webの生成物を参照しないAPI jobでは実行しない。Component jobも既定形式の生成を省き、試験直前の`locale-modules`だけを生成する。他の呼出しは既定のcodegenを維持する。生成の省略は実際のimportと後続の生成経路で判断し、生成済みのローカルfileや前jobの出力に依存させない。

Vitestの`results.json`によるduration metadata cacheはAPI・Componentで試行し、短縮効果を確認できなかったためCIでは採用しない。保存される時間はsetup・import・Worker準備を含まず、この構成の準備負荷を表さない。標準shardのfile分配もdurationでは変わらない。Bun・Turbo・ブラウザー・seedの既存cacheは維持し、選択した試験は毎回実行する。対象SHA・環境・計測結果はPRへ残す。[Vitestの実行順](https://vitest.dev/config/sequence.html#sequence-sequencer)

Playwright本体のcache keyはOS・architecture・Playwright版・ブラウザー構成を含む。Chromiumは`--only-shell`でheadless shellだけを取得する。OS依存は別の共通actionでAPT取得済みの`.deb`をcacheする。keyはrunner imageのOS/版・architecture・Playwright版・ブラウザー構成を含み、同じOS・architecture・Playwright・ブラウザー構成ならimageの更新前のarchivesも復元する。`playwright install-deps`はcache hit時も実行し、APTの最新indexによる依存解決と整合性確認、展開・設定を省略しない。追加・更新パッケージだけを取得し、インストール済みの`/usr`やdpkg状態は復元しない。cache復元・未命中時のdownload・OS依存の所要時間をActionsで個別に確認する。cache展開にも時間がかかるため、高速化を未計測のまま保証しない。[PlaywrightのCI資料](https://playwright.dev/docs/ci#caching-browsers) と[Actionsのparallel step](https://github.blog/changelog/2026-06-25-actions-steps-can-now-be-run-in-parallel/)を参照する。

ComponentとE2Eのbrowser取得・OS依存導入は、通常の連続stepで実行する。runner 2.337.0では並列compositeの後処理で非並行collectionの破損を観測したため、cache等のpost actionを登録するcomposite同士を同時実行しない。失敗ログにstackはなくrunner内部の特定箇所までは断定しない。試験job・shard・workerの並列実行、取得cache、case予算とretry 0は維持する。テスト成功と準備・後処理の成功は別に確認する。

`RUNNER_ENVIRONMENT=github-hosted`の使い捨てVMでは、公式CLIのOS依存導入中だけAPTに`--force-unsafe-io`を渡す。展開ファイルのfsyncを省き、dpkg DBの同期・依存解決・署名確認は維持する。専用の一時configは`EXIT` trapで除去し、試験中のD1やアプリのI/Oへ適用しない。クラッシュしたVMは失敗として破棄し、そのOS状態を復元しない。self-hostedではこの設定を使わない。[Debianのdpkg FAQ](https://wiki.debian.org/Teams/Dpkg/FAQ)の範囲に限定し、展開・設定の時間と全必須チェックを実CIで比較する。

## E2Eの隔離

`bun run test:e2e` はPlaywrightの`worker-scoped fixture`でworkerごとにGateway・OAuth・Mailpit・Web/APIを一度起動し、ケース開始時にtemplateのD1/R2/DO stateを差し替えて隔離する。各workerは専用のlocalhostポートと`.local/tablecast-e2e-*/tablecast-worker-*`を使い、開発サーバーのDB・Cookie・`.local/demo.json`を参照しない。Linux（CI含む）ではglobal setupでDocker image `axllent/mailpit:v1.31.6`から抽出したバイナリを直接起動する。macOS等では同imageのLinuxバイナリを実行できないため、Mailpit containerをworker寿命で1回だけ起動する。送信はHTTP API（`/api/v1/send`）のみを使う。ケース間ではWeb/APIを止めてからstateを`cp`し、MailpitのメッセージをDELETEしてから再起動する。稼働中のSQLiteはコピーしない。

ビルド・migration・合成seed・画像投入はglobal setupで一度だけ実行する。APIのcf buildとWebのVite/Serwistで公式Build Outputを作り、`TABLECAST_BUILD_DIRECTORY`へ`.cloudflare`を複製する。通常buildの出力は一時生成するが、E2E終了後の実行資源は専用directoryへ隔離される。Webのdev・Storybook build・他のE2E buildを同じworktreeで同時実行しない。ローカル秘密値を含む成果物はTurbo cacheへ書き込まない。seedの`getPlatformProxy`をdisposeし、全writerを終了したstorageを各workerへ複製する。SQLite内部を直接編集せず、稼働中のDBをコピーしない。各workerはAPI・WebをVite plugin v2の公式previewで一緒に起動し、Service Bindingで接続する。D1/R2/DOのstateとregistryをworker内へ分ける。Cookie・メール・DO・認証をworker間で共有せず、ケース間は両Workersを停止してstate・assetsを復元し、Mailpitをクリアする。

`fullyParallel: true`、`workers: 4`、`retries: 0`で、独立したcaseを同じspec内でも並列実行する。`support/test.ts`の`test`を全specで使用し、標準のpage/request/contextはworker専用の`baseURL`を使う。worker終了時に自分のプロセスとstorageを終了・削除し、最後にglobal setupのtemplateも削除する。他ケースの成功結果やcleanupの順番を前提にしない。メールとGoogleの同一アカウント連携はAPIの実auth handler/D1で毎回新規登録から確認し、メール・OAuthの実配線は代表E2Eで確認する。

DBはケース開始時のtemplate差し替えで初期化するため、後処理でプロフィール・公開版・下書きをAPI経由で元へ戻さない。閉卓後の更新適用など製品の保証はケース本体で確認し、fixtureは取得したBrowserContext・プロセス群・storageの解放を担う。後処理の一つが失敗しても残りを実行し、元の失敗と後処理の失敗を区別する。

会員E2Eの追加BrowserContextはspec専用の `tablecast-customer.fixture.ts` が生成直後から所有し、操作本体の終了後に逆順で一つずつ閉じる。操作の固定phaseと本体終了、各closeの開始・完了・失敗、経過時間と結果状態だけを最大64行へ記録し、入力値・URL・Cookie・会員情報を出さない。closeの例外は集約して再送出し、Playwrightの標準reporterが保持する本体の失敗と区別する。

会員の代表経路はQRから実ログイン・同意・別Cookieの二人参加・閉卓・再来店の自動参加・退出・PWAのログイン復帰を接続する。記憶の編集は`customer-features.browser.test.tsx`とAPIの`customer-memory`、ポイント・券の発行/申請/適用/取消は既存のCustomer/Rewards Browserと実HTTP・D1の`customer-rewards-http.test.ts`で検証する。これらの独立した操作と端末寸法の全組合せを同じE2Eへ重ねず、90秒内で最後の再来店と退出まで確認する。

操作本体・追加context用fixture setup・beforeEachは既存の90秒、個別assertionは15秒、retryは0を維持する。[Playwright標準の時間管理](https://playwright.dev/docs/test-timeouts#test-timeout)により、本体終了後のfixture teardownとafterEachには別枠の90秒が共有される。各contextへ90秒を追加したり、本体の期限を延長したりしない。既存runtime fixtureの個別期限は変更しない。

ケース間では配信clientディレクトリもビルド成果物から復元し、PWA試験が変更したService Workerや追加ファイルを持ち越さない。ケース内の`restartWeb()`は変更を維持する。

通常CIはWorkersだけをbuildし、手動カタログworkflowでStorybook・Emailを生成する。TurboキャッシュはSHA付きのキーで保存し、共通prefixで以前の成果物を復元する。

同じworktree内の別buildは、Paraglide・route生成とCloudflareのdeploy metadataの書込み先を共有するため同時に開始しない。CIのbrowser matrixは別runnerであり、ケース間の並列実行とは区別する。ケースの入口はVite標準proxyを`port: 0`で一度だけ起動し、終了まで待受を保持する。実originをOAuth callbackとAPI varsへ設定後、Cloudflare previewも`port: 0`で起動し、listen完了時の実ポートへ転送する。空き番号を取得して解放する処理は使わない。OAuthとWorkerのreadyファイルは一時ファイルからrenameして公開し、異常終了と起動期限を確認する。bind失敗の自動再試行はしない。

通常操作は、保存済み表示・有効化・反映後の値を観測してから次の操作へ進む。HTTP応答の受信だけでフォームのresetやiframeへの反映を完了と扱わない。意図した競合は下位層の明示barrierで確認する。会話注文デモは客の初期言語を明示し、言語・表示の保持と設定・注文の保持を別ケースへ分ける。端末寸法の全組合せは既存の`demo-viewport.browser.test.tsx`が担当する。[#116](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/116)は当時のspecと対象SHAの実施記録であり、現在の保証は上記の移行対応と最新PRの検証結果を参照する。

macOSのWebKitでは [Appleの標準操作](https://support.apple.com/en-gb/guide/safari/cpsh003/mac) に合わせ、リンクを含むキーボード移動をOption+Tabで検証する。OS設定やDOMのtabindexをテストだけの都合で変更しない。

開発用seedは3店舗と36卓、京料理店60商品・バーガー店12商品・韓国料理店30商品の計102商品を持つ。各組織はowner/admin/member各1名の3所属で、2店舗を兼任するownerを含め8人9所属を用意する。名簿は`apps/emulate/src/tablecast-demo-identities.ts`をGoogle OAuth emulatorと共有する。再実行で既存プロフィール、カート、注文、公開メニューを上書きしない。E2Eの操作対象はfixtureで空席にしているT10を使う。

## #35に基づく所有先の分離

[全件監査と残件](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/35) の判定に沿い、先に低い層へ契約を置いてから上位の重複を除く。テストのretry・反復実行をflakyの検出や対策に使わない。失敗時はコードと保存した証跡から原因を調べ、修正した契約を確認する。UIの再試行ボタンや製品の再接続そのものを検証するケースとは区別する。

| 契約                                 | 主担当と入口                                                                                             | 上位へ残す保証                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 価格・プランの期限と数量境界         | APIのVitest `unit`、純粋configuration fixture                                                            | `bindings`で価格正本・未承認・DB原子性を検証 |
| 読取中の更新、前版からのmigration    | APIのVitest `bindings`、実D1と明示barrier                                                                | 実HTTPの代表経路                             |
| 縦横画面・音声失敗後のカート         | `kiosk.browser.test.tsx`、実Kiosk・QueryClient                                                           | 代表modifier→注文→提供→会計→閉卓のE2E        |
| 店舗切替の古いHTTP・通知とunmount    | 同Browser test、実useRealtime、通知境界だけ固定                                                          | 実WebSocketの切断・HTTP回復E2E               |
| QR decodeと送像停止、URL入力・卓保持 | `device-qr-reader.browser.test.tsx`と`devices.browser.test.tsx`、実decoder・MediaStream、Chromium/WebKit | 端末の明示承認・Cookie→代表注文の実接続E2E   |
| 音声turnの認可とspeech/tool関連付け  | APIの実D1・公式SDK HTTP境界とWebのmedia境界                                                              | APIの実認可と別枠の有料WebRTC音声            |
| Git/ファイル/CLI/seed                | root Vitest `scripts-runtime`                                                                            | unit-web内で他workspaceと別CLIを実行         |

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
bun run --cwd apps/web test
bun run test:browser
bun run test:e2e --project=tablecast-chromium
```

E2Eのready条件はWeb/API、Mailpit、OAuth discovery。各要求の期限、子プロセスの異常終了、自分のDocker containerの削除を確認する。fixtureが起動した専用process groupと入口を終了し、Viteの子孫のworkerd、接続済みsocketも残さない。失敗時は資格を除去した最大65,536文字のruntimeログを`testInfo.outputPath()`へ保存して添付する。画像・計測値も同じcase別の保存先を使う。migrationログはruntime削除前に`apps/web/test-results/tablecast-runtime/<run>/`へ保存する。テスト結果には認証情報を含むtraceを追加しない。

下書き作成のPOSTは本番Hono clientと同じくbodyなしで送る。入力を取らないAPIへ空のJSONを付けない。以前のMiniflare `5.20261006.1-alpha`には、未読のstream bodyの次の要求が`ECONNRESET`になる[上流報告](https://github.com/cloudflare/workers-sdk/issues/16199)がある。previewのtransport errorはcauseもruntimeログへ渡す。bodyなしへの整合を上流の接続不具合全体の修正とは扱わず、認可で拒否するAPI等の試験も維持する。

### 並列実行と順番に依存しないfixture

並列性は資源の所有範囲を分けて確保する。同じデータにUUIDを足すだけでDB独立とせず、他ケースの成功・作成済み行・Cookie・メール・前回の出力へ依存しない。通常のケースは単独でも全件内でも実行できるGivenを持ち、`beforeAll`へ可変の業務状態を持ち上げない。

| 実行単位                     | 資源の所有と初期化                                                                         | 守る条件                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API bindingsのfile/case      | Cloudflare公式の隔離binding内で、各caseの`resetFixtureStorage()`→実migration→型付きfixture | file並列を使う。同じbindingをresetする同一fileの`it.concurrent`は使わない。競合は一つのcase内で明示barrierと`Promise.all`により作る                              |
| Vitest Browserのcase         | 実feature/QueryClientとDOMをcaseで作り、unmount・query clear・mock/時計/通知を復元         | 同一fileのDOMとglobal clientを共有するcaseはconcurrent化しない。deferredは失敗時もfinallyで解放し、進行中mutationの終了を待つ                                    |
| Vitest Browserのfile/session | fileごとiframe/moduleを作り直すが、同じsessionのBrowserContextは再利用され得る             | `cleanup()`や`isolate=true`をCookie/storage初期化と扱わない。永続化を試さない`LocaleProvider`は`persist={false}`、永続化caseは自分のキーの初期値と復元を所有する |
| E2Eのworker/case             | worker専用D1/R2/DO・registry・配信資産と、case単位の標準BrowserContext/Cookie jar          | writer停止後に閉じたtemplateからstate/assetsを復元し、Mailpitを消去する。追加contextはcaseがcloseし、自分のprocess/containerだけを停止する                       |

Browserの同時file数は`browser`・`storybook`各projectの`maxWorkers: 2`で制限する。全件CIの3shardは別runner・別cache・別出力先で実行し、同じcheckoutで複数CLIを同時起動しない。Vitestの版によっては既定のCPU由来の枠がpoolごとに適用されるため、CLIの値だけで全poolを制限できると仮定しない。版更新時は実効scopeと準備・実行・全体時間を確認し、contextの過剰生成による操作待ちをtimeoutやretryで隠さない。

Kioskのカート・通知統合では、起動時の`enumerateDevices()`も外部I/Oとして固定し、実端末のマイク列挙を業務caseへ持ち込まない。本番Kiosk・VoiceConnection・Query・HTTP clientは維持し、デバイス一覧・選択・切替の保証は`voice-connection-track.test.ts`が所有する。不要I/Oを除いた局所成功だけで、CIの描画・操作待ちが解消したとは判断しない。

`tablecast-runtime-isolation.spec.ts`の2件だけは、前caseで実D1と配信ファイルを変更し、worker再利用後に復元されたことを観測するためserialとする。これはfixture自体の回帰検査であり、通常の注文・公開journeyの順序依存を許可する例ではない。APIの`storage-isolation.test.ts`も実bindingの初期化を検査する。

遅い応答はHTTP到達を確認してから途中状態を観測し、gateを解放して最終状態・入力・副作用を確認する。actionは一度だけ行い、assertionを待つ。APIの成功応答だけで画面反映完了とせず、Service Worker・hydration・保存・通知の対象状態を待つ。タイマー待ち・汎用networkidle・force click・timeout増加・retryで順序や準備不足を隠さない。

viewport・文字倍率・media設定を変更するcaseは開始時の値を記録し、失敗時もfinallyで復元する。固定の既定値へ戻して後続caseの条件を変えない。同名の操作がsidebarと本文にある場合は、対象のlandmarkへlocatorを絞り、`first()`で曖昧さを隠さない。

実SSRの文言・manifestの表示だけをhydration完了と扱わない。document遷移後の操作は、その画面で既存のButtonがenabledになる等の利用者から観測できる条件を待つ。PWA案内は店側のログインButtonが操作可能になってからsummaryを一度クリックし、手順の可視状態を確認する。任意のsleep・クリック反復・timeout延長で同期しない。

ModキーのE2Eは製品と同じTanStack Hotkeysの`detectPlatform`をブラウザー内で評価し、MetaまたはControlを送る。Playwrightの`ControlOrMeta`はrunner側のOSを使うため、Linux runner上でMacintoshのUser-Agentを使うWebKitと一致するとは限らない。[Playwrightの修飾キー](https://playwright.dev/docs/api/class-keyboard)、[TanStackのplatform判定](https://tanstack.com/hotkeys/latest/docs/reference/functions/detectPlatform)を参照する。

既存の`fixtureDb`/`insertFixture`とCloudflareのreset/migrationを使い、DB wrapperや汎用test frameworkを足さない。E2Eのスタッフ認証Givenは`e2e/support/session.ts`の`signInStaff()`を再利用する。helperは型付きの小さな準備と失敗検出を所有し、検証対象のHTTP・注文確定・明示公開とThenはspecに残す。直接DB更新で認可や公開操作の代わりを作らない。

商品公開のE2Eでは、既存の実APIでスタッフ認証・端末request/approve/pollを準備し、独立したスタッフと客のCookieを使う。ログイン・端末登録画面と5秒pollを各journeyで反復せず、注文の代表journeyに残す。公開試験自身は`/admin/live`からの復帰、商品編集・再読込・明示承認・公開・実通知後の客画面の価格更新を観測する。

通常のfile並列と、順序を変えた対象試験を別々に確認する。例えばAPIの対象fileを`--sequence.shuffle --sequence.seed=272`で実行し、seed・対象版・結果を残す。単回のshuffle成功を全順序の証明とは扱わず、資源所有と復元の設計で独立性を担保する。画像・trace・bounded logはcaseとengineで分け、同じ出力先へ書き込まない。ケース準備の失敗もruntimeログを添付し、worker起動の失敗は`test-results`のworkerログへ保存する。添付失敗で元のerrorを上書きしない。

### 型付きDB fixture

APIの通常データ投入は`test/database-fixture.ts`の`insertFixture(table, values)`を使う。引数はDrizzleの`SQLiteInsertValue<T>`から列名・必須値・enum・日時型を推論し、単一行と複数行を扱う。SQL生成・値のencodeはDrizzleへ任せ、生成済みstatementを既存の実`D1.batch`へ渡してtransactionのまとまりを保つ。単独の参照・更新・削除には同じファイルの`fixtureDb`でDrizzleの標準queryを使う。

認証は既存の`auth-schema.ts`、業務データは`business-schema.ts`のquery用定義を共用する。既存の行型は`$inferSelect`から導出する。DDL・CHECK・FK・indexの正本は既存のSQL migrationのままであり、query用定義を追加したことを理由にmigrationを再生成しない。

旧schemaからの移行データ、制約違反を直接起こす操作、SQLの読取地点を止める競合試験など、SQL自体が検証条件になる箇所にはraw SQLを残す。ドメイン操作を検証するWhen/Thenをfixture helperに置き換えない。D1/DOの初期化にはCloudflare公式resetと実migrationを使用する。

E2EのpreviewはCloudflare Vite pluginの `inspectorPort: false` でInspectorを起動しない。自動試験に不要な待受とポート割当を省き、並列caseのMailpit等との競合を避ける。通常のdevではInspectorを利用できる。

### PWAとHTTP差し替え

実Service WorkerはPWA specで有効にし、制御・cache・offline・複数画面更新を検査する。runtime隔離の二ケースを除く他のspecは`test.use({ serviceWorkers: "block" })`でSW登録を止め、実API/Cookie/WS/配信の責務へ絞る。追加BrowserContextにも同じ設定を渡す。`page.route()`で503応答・ページサイズ・OAuth callbackを制御する場合もSWを止める。SWがあるとPlaywrightの通信差し替えや要求観測を迂回する場合があるためであり、アプリ側に試験専用の分岐は作らない。[Playwright公式の制約](https://playwright.dev/docs/network#missing-network-events-and-service-workers)

複数画面のSW更新は、2つの実ログイン画面で一方の未保存入力と他方の空フォームを用意し、追加画面のcontrollerと初回登録の完了を確認してから次版を配信する。Kioskの接客中・閉卓後の更新可否は実KioskとPwaのBrowser統合が所有する。定期取得のない画面を使い、入力保護の試験へ未接続Kioskの卓pollとnative Worker終了の競合を混ぜない。この実Kioskとの競合は[#274](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/274)で別に追跡し、フォーム試験の通過を製品側の解消とは扱わない。

更新の拒否・準備応答だけでactivationとreloadの完了を推測せず、CANCEL・waiting/active/controller・各画面の可視状態を区別して証跡へ残す。Chromium内部の待機はServiceWorkerの状態traceで、旧Workerの終了途中の再起動・通信・新旧版の遷移を照合する。診断を追加した後の単回成功を根因の修正と扱わない。

ログイン後のSSR画面から次のdocument navigationへ進む場合は、見出しやURLだけでなく既存の操作部品が有効になるまで待つ。これによりhydrationとredirectの完了前に次の遷移を競合させない。

SSRのfile入力も、既存Button・NativeSelect等と同様に`useHydrated()`で操作開始を制御する。Playwrightの`setInputFiles`自体は有効化を待たないため、先に`toBeEnabled()`を確認し、選択後はfilenameと候補の表示を観測する。画像配信の代表E2Eではclient JSをgateで止め、SSRでは無効・解放後は有効になることを同じjourney内で検証する。gateは`finally`で解放し、入力前の固定sleepや失敗時の再試行へ置き換えない。

### E2Eの通信停止とOAuthの動的ポート

`runtime.setOnline(false)`は入口の待受を保持し、既存接続と新しい要求を切断する。`true`で同じoriginへ復帰する。ブラウザーのオフライン設定はWebKitのService Workerキャッシュ取得も止めるため使わない。通信障害の検証であり、Workerプロセスの再起動・DB復旧の証明とは区別する。Service Workerの更新試験はcase専用`client/sw.js`を書き換え、`runtime.restartWeb()`でWorker側のアセット情報を再読込してから`registration.update()`で配信を確認する。入口の待受は閉じず、再起動後のWorkerの実ポートへ転送先を更新する。最小の静的Workerでは再起動なしで本文が変わるが、実アプリの更新判定にはアセット情報の再構築が必要だった。

`emulate@0.11.1`はpatchを適用せず、標準APIの指定ポートで起動する。OAuth・Gateway・Mailpitはworker寿命で再利用し、case間はメールだけを消去する。同一invocation内はPlaywrightのparallelIndexをOAuth 24000、Linux Mailpit HTTP 25000、SMTP 26000へ加算して分離する。別worktreeでE2Eコマンドを同時に起動する場合は`TABLECAST_E2E_OAUTH_BASE_PORT`・`TABLECAST_E2E_MAILPIT_BASE_PORT`・`TABLECAST_E2E_SMTP_BASE_PORT`の3範囲すべてを分ける。CI matrixは別runnerで独立する。同一checkoutの複数buildは生成物も共有するため重ねない。OAuth起動のscripts試験は`TABLECAST_TEST_OAUTH_PORT`（既定23999）を使う。bind失敗は再試行せず所有者と設定を確認する。

`scripts/tablecast-e2e-runtime.test.ts`は実TCPとOAuth子プロセスで、ケース分離、停止中のポート保持、復帰、discoveryのURL一致、bind失敗の拒否を確認する。HTTP・OAuth・メール・DB・PWAの最終配線は既存Chromium/WebKit E2Eが確認する。

## 音声の性能回帰

`apps/api/test/voice-performance.test.ts` は実D1のbinding往復とSQL実行数を計測する。8件・200件の商品で検索とカード表示を実行し、表示が保存され、最大8件の出力とページ情報が返ることを確認する。上限は業務関数の往復5回、HTTP認証・所有卓確認・通知を含む経路の往復7回、出力6000byteとする。外部モデル時間は含まない。実音声の1秒目標とは分けて評価する。

性能変更ではSQL時間、binding待ち、通知、モデル、実再生を区別し、既存性能予算を超えたら原因を修正する。データ量と同時実行を変えてN+1や不要な直列待ちを検出し、単なるquery数一致やsleep・retryでの成功を証拠にしない。

## stagingとreleaseの受入

環境・secret分離、release本文の対象PR・取消・重複排除・編集保全・確認待ちは既存Vitestで検証する。全体リセットはAPI統合の実D1で全業務・OAuthデータ削除と所有台帳保持を確認する。実stagingでは通常再配備のデータ・画像・認可保持、リセット後の旧token拒否、Access資格なしでのWeb到達と未認証MCPのOAuth拒否、ChatGPT/CodexのOAuth・MCP読取・下書き更新を確認する。CI成功だけで実クライアント確認や本番公開を完了としない。対象SHAと未実施範囲をrelease PRへ記録する。

PR本文の編集だけではCIを再実行しない。base変更後に新しい統合先の検査が必要な場合は、作業branchへ最新stagingを取り込んだheadをpushする。releaseは保護されたstagingのCI・配備SHAとmainとの合成treeを照合する。

cf設定・IaCの試験はmode解決、秘密値の宣言、Build Outputの別環境・別SHA・別PRの拒否、D1の採用ID、Worker所有情報、Accessの再適用と既存token欠落時の拒否を確認する。local D1のID移行は実SDKでデータ・migration履歴・再実行を検証する。遠隔namespaceの保持・Access拒否と許可・再配備後のデータ保持は最新PR headの配備で別途確認する。

文字サイズを200%へ書き換える試験は利用者の指定により廃止した。日英・縦横・狭幅・長文・keyboard/focus・通常の主要操作を検証し、CSSによる文字拡大を受入条件や画像証拠へ含めない。

## 組織課金

`billing-pricing.test.ts`で秒数・cached token・実際のtier・料金精度・期間境界を確認する。`billing*.test.ts`は実D1/DOと本番HTTPを使い、組織作成、発行の競合・回収、暗号化、同じ鍵での停止、利用量再送、Costsの全ページ・置換・失敗、署名済みStripe Webhook、Metersの送信不明期限、role認可を確認する。OpenAI/Stripeの外部I/Oだけ固定し、DBやDOは差し替えない。

通常のAPIテストでは実接続用のローカルenvを継承せず、Vitestのbindingで課金・組織キー・音声の有効化と外部secretを初期化する。必要なケースだけfixture内で有効化する。

Webの`billing-page.browser.test.tsx`と隣接Storyは、日本語でrole・無料GUIと有料AIの区別・申込み/解約の入口・解約予約・失敗再試行・組織切替の遅い応答・縦横・狭幅・長文・keyboard/focusを確認する。通常時のAI準備完了通知と無料プランの管理者向けAI設定通知がなく、準備中・準備失敗では音声利用不可とGUI継続を説明することも確認する。日英の翻訳・日時・通貨の保証と英語Storyの扱いは、前述の共通戦略に従う。

`billing-usage-chart.browser.test.tsx`は日別のキーボード操作・数値表・料金の権限・ゼロと負数調整を確認する。`billing-overview.test.ts`は実D1/HTTPで現在の契約期間とUTC暦月集計の分離・期間境界・完全なUTC日別系列・memberの金融情報非漏出を確認する。`tablecast-billing.spec.ts`は実Web/API/D1、Google emulatorのmemberログイン、JSなしSSRと匿名分離を確認する。実Service Account発行とStripe SandboxのCheckout/Meters/請求書/Portalは [課金の接続確認](billing.md#外部接続の確認) として別に行う。

### 公開ヘルプの確認

`tablecast-help.spec.ts`は実Web/APIへ接続し、未認証のHTML・日英切替・相対リンク・Markdown・LLM索引と、管理画面・MCP・業務APIの認証境界を確認する。本文の配信とリンクの解決はビルド後の成果物で確認し、原稿の文言を固定するunitテストは追加しない。サイドバーのグループ開閉は既存のBrowser統合、画面の証拠はこの代表E2Eで扱う。

ヘルプ検索は日英別の実ZBSearchで全半角・英字大小文字・日本語の空白なし・英語の語形変化を確認する。Browser統合は番号付きショートカット、IME確定、遅い旧応答、MarkdownのDOMと語形変化後のハイライト、共通ヘッダーを所有する。実WebのE2Eは公開検索API・言語別SSR・同章の言語URLへの遷移とモバイルの目次へ限定する。

### 注文操作の性能計測

APIの`performance` projectは本番Hono・Cookie・実D1で8操作、8／120商品・カゴと履歴1／100件を測る。通常の`bun run --cwd apps/api test`に含め、Vitest標準の`sequence.groupOrder: 1`で他のAPI検査の終了後に1 workerで実行する。並列の別fileのworkerd起動待ちを性能の比較へ混ぜないための測定環境であり、300ms予算と初回を含む全31標本は変えない。個別診断は`bun run --cwd apps/api test -- --project performance`を使う。単独成功でpreviewや負荷中の達成と扱わず、失敗した元の全標本も残す。

### CIで観測した初期描画と性能の競合

会話のスクロール領域はSSRからoverflowを設定する。hydration後のeffectだけでscrollbarを出すと、常時表示するOSでは有効幅と折返しが変わり、歓迎案内が動く。実SSRの試験はJSをgateで止めた初期描画も通し、初期状態とlayout-shiftの要素・時刻をartifactへ残す。CLSの予算0.01は維持する。

空の会話案内は、SSRのイラストの後でHTMLを分割し、説明・開始ボタンと下部操作が後から届く経路を同じ代表SSR試験で確認する。分割中・hydration前後の画面を残し、先に描画した案内が後続chunkで上へ移動しないことを保証する。日英・最小幅・縦配置の余白と位置はBrowserで確認し、カメラのON/OFF・映像比率・リサイズ・会話のスクロールは既存のBrowser保証を保つ。

HTMLがvisibleでもCSS適用済みとは限らない。JSを保留したSSRのスタイルはPlaywrightのtoHaveCSSで待ち、computed styleの単発取得を描画準備の同期に使わない。

英語の日付はIntlのformatToPartsから曜日・日・月・年を組み立て、ICUの版で曜日の後のカンマが変わらないようにする。店舗会員の代表E2Eは日英ともreload直後のリンク操作を維持し、hydrationのpageerrorも失敗にする。

会員SSR試験のpageerror監視は、文言不一致によるhydrationの再描画を対象にする。WebKitが再読込中に報告する旧documentの先読み通信の破棄とは区別する。リンク操作を遅らせたり、遷移先の見出し・復帰操作の検証を外したりしない。

カートのDOM応答100msは`browser-performance` projectへ割り当て、`sequence.groupOrder: 1`と1 workerでBrowser・Storybookの終了後に測る。通常の`test:browser`と差分CIに含め、他画面の並列マウント負荷を計測へ混ぜない。実Kiosk・QueryClient・HTTP clientと1.5秒の応答保留、3回の連打・版付き直列送信は維持する。実ネットワークの300ms目標や実機の負荷試験とは区別する。

実R2の4枠試験は最初の4書込みが到達するまでgateで保留し、その後に最初の1枚以外を解放して進行を確認する。ファイルの読込速度から最大並列数を推定しない。finallyで全gateを解放して実R2の終了を待つ。

Browserの色判定へ渡すCSSプロパティは`background-color`等の標準CSS名を使う。camelCaseをCSSStyleDeclarationへ渡した際のengine差に依存させず、色の期待値は維持する。

## 画像配信の変更の検証

既存`media`・`image-upload`・`customer-rewards-http`の実Workers/D1/R2/Images統合で、取込・保存・再送・索引移行・同一店舗認可を確認する。匿名・別店舗・端末失効は内部cache hitと条件付き要求でも拒否し、共有業務カタログには表示情報を追加しない。`ProductImage` BrowserでSSRのinline背景、hydration、成功・失敗・透過・差替え、実寸の予約と元画像幅の制限を確認する。

新しいE2Eを作らず、既存`image-performance`の24/120商品・cold 500,000byte以下・取得済みURLのwarm転送0・CLS 0.1未満を維持する。HTML・カタログJSON・追加JS容量、SSR時間とLCPを対象SHA・同じfixtureで比較する。既存`pwa`で認可済み画像の通信なし再利用と401/404の非保存を確認し、権限失効後の即時消去は要求しない。ローカル・CIと実Cloudflareの性能は区別する。

## 食事制限情報の保証

集合・判定優先順位・根拠・具材参照・旧設定変換はAPIの`food.test.ts`、保存・店舗境界・履歴・注文snapshotは実D1/HTTPの`food-bindings.test.ts`で所有する。MCPは既存の実OAuth/SDK契約試験で全設定の往復と増減の消失拒否を、音声は固定ツール呼出しで読取り専用照会を確認する。Browserでは日英の編集・根拠の言語切替・失敗と再取得・遅着応答を確認し、Playwrightの`tablecast-food.spec.ts`だけがseed・実Web/API/DBを通した具材変更から注文と管理画面保存までを接続する。実モデルのツール選択や実音声の説明品質はこの決定的な試験の保証に含めない。
