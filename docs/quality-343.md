# 業務境界・品質ゲート・性能の検証

[構成図と公開入口](architecture.md) / [静的解析](static-analysis.md) / [Issue #343](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/343)

## 対象と判定

最初の性能改善は、最新stagingへrebaseした `75d752a8deacbd95202f59c4b48f5b9e547313b4` と `065382ec0e37ddfe8f48e4610e092c0e91c074ed` を比較した。その後、分割と中継の整理前の `0b3ff9613ce11b929201771b7cb2ee7bc21531fa` と最終実装も同じfixtureで再比較した。各比較の生データを分け、提出commitとCIの対応はDraft PR #344を正本とする。環境はmacOS arm64、Node 24.22.0、Bun 1.4.3、Vitest 5.0.5、Playwright 1.64.1。外部モデルや有料TTSは呼んでいない。

packagesを追加せず、操作のbatchを所有業務へ置いた。DBの公開入口はschema・生成・型、bootstrapは既存運用CLIが必要な認証・料金計算・初期化の限定入口にする。Webは業務featureと表示shellを分け、字幕購読と商品選択の状態寿命を分離した。同じ状態を中継するhook・view・callback型は所有者へまとめ、外部protocolとメールtemplateの独立した境界は残した。価格・版・認可・snapshot・冪等性・既存のUIを維持する。

`apps/presentation`はPR base `31ffb6f6d1e1a342990c42f0b5089edbec96fa9d`と同じ内容へ復元した。今回追加した分割ファイルを除き、未追跡素材・生成物は削除していない。動画リファクタリングと専用の検証成果物は今回のPRに含めない。

## 実装量と責務の整理

行数はclocのcode行で数え、空行・コメントを含めない。対象拡張子はts・tsx・js・jsx・mts・cts、実装は`apps/api/src`・`apps/web/src`・`apps/emulate`・rootの`scripts`とする。test/tests/e2e/test-support/testing配下、test/spec/storiesとfixtureは検証用として別集計し、生成型・route tree・Paraglide・assets・第三者skillを除く。設定ファイルも別集計であり、削除した動画コードを今回の実装削減に算入しない。

| 実装code行 | 導入前 `75d752a8` | 整理前 `0b3ff961` |   最終実装 | 整理による削減 |
| ---------- | ----------------: | ----------------: | ---------: | -------------: |
| API        |            18,007 |            18,564 |     18,113 |            451 |
| Web        |            31,694 |            32,373 |     31,443 |            930 |
| root CLI   |             6,128 |             6,382 |      6,252 |            130 |
| emulate    |               162 |               162 |        162 |              0 |
| 合計       |            55,991 |            57,481 | **55,970** |      **1,511** |

[実測と分類](performance/quality-343/implementation-lines.json)を保存した。導入前に対しても21行の純減となる。RC移行前の55,990行からはさらに20行減った。RCのprotocol対応でCLIは37行、型付きcache・guardの共有でWebは20行増えたが、APIの77行削減を含めて全体で純減を保った。新しい認可・原子性・性能経路も加えたため、領域ごとにすべて減ったとは扱わない。productionの300行を必須上限からレビュー目安に変え、複雑度・型安全性・業務境界・整列とテスト500行のgateは維持する。

APIは同じ業務のquery・statementとschema由来の型を再利用し、注文確認と確定、ポイント配分と訂正等の所有者をまとめた。公開schemaは明示exportを保ち、公開操作・batchの所有を増やしていない。WebはKioskと項目編集の状態を一箇所で所有し、VoiceConnectionの停止意思・接続世代・取消をprivateメソッドへ整理した。字幕の購読、商品一覧のmemo、項目ごとのmountと画像staging、URL同期hookは実際の境界として維持する。Formは既存TanStack Formの登録機能を使い、native属性と外部submit、明示した場合だけの伝播停止を保つ。

CLIはseed・配備・releaseの同じ用途のデータと一度だけ使う中継をまとめた。初回seedと既存データの補修、配列の意味が異なるserializer、秘密設定と公開設定は統合しない。releaseの子プロセスは標準のpromisify/execFileへ寄せ、JSONはstdin、引数は配列で渡し、大きな応答と失敗時の秘密非表示も検証した。

## RCと標準factoryによる全体整理

Drizzle ORM・Kitを`1.0.0-rc.5`へ揃え、認証のRelations v2とBetter Authの対応adapterへ移行した。DB生成は既存factoryへ統一し、request・認証の単独生成・bootstrapのいずれも同じrelationsを使う。認証のjoinを保ち、既存D1のテーブル・SQL migration履歴は変更していない。配備CLIのSQLite proxyは同版のexecutors形式とarray/objectのrowModeへ対応する。

Honoはrootの2 appとApiEnvの26 route file・CustomerEnvの5 route fileへ公式factoryを適用した。本人sessionのguardを8入口、卓Actorのscopeを10入口で再利用する。入力検証と認証の順、共通middlewareのrootだけでの登録、Hono Clientの入出力推論を維持する。GUI・音声・MCPから呼ぶ業務側の認可とbatch所有は変えていない。

9業務moduleの23の手書き入力・query型を所有するZod schemaから推論し、下書き更新・公開・卓開始の入力もHTTPとuse-caseで共有した。入金のfieldと注文状態は`drizzle-orm/zod`から生成し、許可fieldと従来の制約を重ねる。公開schemaの明示exportは保ち、WebにはDBやORMのruntime依存を追加していない。JSON内容、金額・承認・版の規則、ページングの空文字許容等は意味が異なる契約として維持する。

Web全体の型取得だけのload関数をHonoの成功応答推論へ置き換え、親routeの店舗lookupをloaderで共有した。画面の背景更新は既存のquery購読を保つ。下書きの共通RPCとcache反映をconfigurationの`mutationOptions`と`receiveDraft`へまとめ、版・検証・店舗別cache・画面固有の入力resetとfocusを維持する。店舗作成・会員設定等のフォーム型もAPIのZodから推論する。通常取得・引数付き取得・ページングのいずれも標準のQuery定義で足りるため、追加の汎用Query factoryは作っていない。SSRのCookieとQueryClientの要求単位の寿命、home専用key・cursor・signalも維持する。

## 全体解析と静的fixture

fallow 3.34.1は、rebase後のfrozen install・codegenから既存の構造error42件を0件へ修正した。実入口を確認し、unused export/typeはlocal化・削除、未使用のeventsource-parser、rootの重複MCP SDKとAPIのWrangler宣言を整理した。独立したUI namespaceのRoot/Panelはファイルと名前を限定して認識させ、テストtransportの反射呼出しはmember単位で理由を残した。生成物・取得済み外部skill以外のsrc全体やbaselineによる除外は追加していない。

| 項目               | 変更前 | 変更後 |
| ------------------ | -----: | -----: |
| 構造error          |     42 |      0 |
| unused export      |     36 |      0 |
| unused type        |      3 |      0 |
| unused依存候補     |      3 |      0 |
| 未解決import・循環 |      0 |      0 |

[全体の集計](performance/quality-343/fallow-summary.json)には複雑度・重複の残件も含める。rootの開発CLIに対するdev-dependency-in-productionの2警告（@cloudflare/config・zod）は残る。両依存は実際に開発・配備CLIが使うため、削除や本番依存への移動で解析結果だけを変えない。複雑度・重複は警告として継続改善し、構造errorは全体gateで拒否する。最終実装の閾値超過の関数は216→210件、clone groupは77→75群、重複行率は小数2桁で2.28%を維持した。整理前の206関数・85群・2.66%も集計に残す。同じ責務を統合したため関数の大きさに関する警告は増えており、警告をすべて改善した結果とは扱わない。残る警告は集計を正本にする。

`bun run fallow`は標準の `dead-code` によるerror gate後、複雑度・重複を報告する。引数なしの報告CLIをそのままCIの成否にしない。Lefthookだけはcodegenを一度完了してからlintとHEAD比較auditを実行し、自動修正・自動stage・pre-pushを追加しない。

[静的fixture結果](performance/quality-343/static-fixtures.json)と[部分stage・audit結果](performance/quality-343/audit-fixtures.json)は隔離Git workspaceで実CLIを実行した結果である。

- 実装301行はレビュー目安として許可し、501行のテスト、unsafe argument/member、defaultのみの不足switch、natural順の違反を拒否した。空行・コメントは数えず、整列後もCSS副作用import同士の順序を保った。presentationには今回の整列ルールを適用せず、従来のunsafe assignment検査を維持することも隔離fixtureで確認した。
- Webの実tsconfigを継承し、配列添字のundefinedを型検査で拒否した。exactOptionalPropertyTypesは追加していない。
- 全体gateは既存の未使用ファイルも失敗させ、複雑度警告のみなら成功し、不正設定で失敗した。
- 部分stageの同一fileはLefthookが未stage差分を退避・復元する。別fileの未stageエラーはauditへ影響する。成功・失敗ともindexと未stage差分が一致した。
- `scripts/tablecast-import-rules.test.ts`は実設定と実Oxlintを接続し、privateな別module、外部integrationからDB/Auth/Hono、shellから業務query、WebからDB/bootstrap等を拒否し、公開契約・明示route合成を許可した。

[MCP記録](performance/quality-343/mcp.json)ではローカル固定版の起動・初期化、43 tools、project_infoの4 workspacesを確認した。登録のcwdは対象worktreeへ固定し、ネットワークから別版を取得しない。

## APIの実経路

次の表は初回の`75d752a8`→`065382ec`比較である。HTTP入口・認証・業務・D1・通知を含め、実migration済みD1/DOで比較した。1件と100件の各fixtureを使い、各版5回の独立runner/Worker起動で初回＋warm30標本を取得した。各経路・規模・版のwarmは計150標本、初回は5標本。計1,860標本の[生CSV](performance/quality-343/api-samples.csv)と[集計](performance/quality-343/api-summary.json)を残す。p50は中央値、p95はnearest rankである。

| 100件規模 | D1往復 | SQL文数 | 応答bytes           | harness時間 p50 / p95（ms） |
| --------- | ------ | ------- | ------------------- | --------------------------- |
| ホーム    | 12 → 5 | 21 → 13 | 80,825 → 1,491      | 15 / 24 → 7 / 15            |
| 注文確定  | 9 → 5  | 14 → 12 | 30,590–30,592を維持 | 6 / 8 → 5 / 8               |
| 卓状態    | 2 → 2  | 8 → 8   | 86,930を維持        | 4 / 7 → 4 / 8               |

100件規模は、ホームが商品・端末それぞれ100件、注文確定が100行、卓状態が注文履歴100件である。ホームの基準harnessはinitial・catalog・devicesの3 HTTP要求を直列実行し、変更後はinitial?view=homeの1要求を実行する。表のwall timeには応答の検証・bytes計算も含む。旧Web loaderのcatalog/device並列取得や実利用者のページ表示時間を再現した値ではなく、往復数・応答量の削減と分けて解釈する。

ホームは後方互換のview=homeで存在判定を取得し、完全なcatalog/device一覧を埋め込まない。home専用Query keyを使い、商品公開と端末更新で失効する。一般スタッフの複合initial取得は200でfloor等を保ち、管理者限定のhome summaryはnullにする。DBによる権限判定も保持する。

注文は冪等再送の早期returnを維持し、依存関係が確定した独立読取をbatchへまとめた。更新成功batchのcursorと認可済みscopeを通知へ渡し、scope/cursorの再読取を削減した。payment・visit・demo・transcript・final-turn・config publish等、今回変更していない通知fallbackは残る。全書込みの再読取をなくした結果ではない。

入会・ポイント確定・通常入金・会計調整・券取消に伴う券発行も、所有use-caseの更新batchへstatement契約として含める。発行eventが失敗した場合は業務更新・版・配分・台帳・券をまとめてrollbackし、同一入力の再送で一度だけcommitする実D1試験を追加した。既にcommit済みの旧データに対する冪等再送では、同じ所有use-caseが発行漏れを補修するbatchを実行する。他moduleの独立commitするuse-caseを連鎖させない。

卓・フロア投影はsnapshotの検証・変換を一度にし、表示とplan集計で再利用する。価格計算用の読取では取消・却下をsnapshot解析前に除外し、公開履歴は全注文を従来どおり検証・表示する。応答時間はばらつき内であり、高速化したとは判定しない。

bindingMsはD1呼出し全体のwall timeで、SQL実行時間や公開ネットワークのRTTではない。SQL durationとrows_readはbatchのmetadataが返る範囲だけを集計し、raw()等の取得不能値を0msの証明にしない。nonBindingWallMsにはHTTP・通知・serializationを含み、純粋なCPU時間ではない。各指標を生CSVと集計で分けた。

初回はfixture/auth・module準備後の当該HTTP経路の最初の観測である。100件fixtureは同Worker内でresetしており、5標本すべてをprocess coldと扱わない。公開Cloudflareのcold start・モデル推論・実音声再生開始の時間は未計測である。

既存の性能予算を緩和せず、home・注文・卓状態はそれぞれ5/5/2往復と13/12/8 SQL文以下、利用者へ返る結果を同時に確認する。既存のcatalog・音声tool・複雑な条件式・統計の予算と認可・版・冪等性・原子性・通知回復の実Binding試験を維持する。

## 整理前後のAPI再比較

`0b3ff961`とRC移行後の最終実装を同じ経路・fixture・cache条件で再比較し、さらに1,860標本の[生CSV](performance/quality-343/reduction-api-samples.csv)と[集計](performance/quality-343/reduction-api-summary.json)を保存した。変更前は0.45.4、変更後は1.0.0-rc.5のlockfileと依存をそれぞれ独立して復元し、計測中は他の重い試験を起動していない。各規模・版の独立runner/Worker起動5回で、初回5標本とwarm150標本を取得した。100件fixtureは同Worker内のreset後であり、process coldを5回測ったとは扱わない。

| 100件規模 | D1往復 / SQL文数 | 応答bytes           | warm時間 p50 / p95（ms） | binding待ち p50 / p95（ms） | batch SQL時間 p50（ms） |
| --------- | ---------------- | ------------------- | ------------------------ | --------------------------- | ----------------------- |
| ホーム    | 5 / 13を維持     | 1,491を維持         | 6 / 12 → 5 / 12          | 3 / 9 → 3 / 9               | 1 → 1                   |
| 注文確定  | 5 / 12を維持     | 30,590–30,592を維持 | 4 / 7 → 4 / 6            | 2 / 4 → 2 / 4               | 0 → 0                   |
| 卓状態    | 2 / 8を維持      | 86,930を維持        | 3 / 6 → 3 / 6            | 1 / 3 → 2 / 3               | 0 → 0                   |

予算と出力を維持したことを確認する比較であり、1ms程度の中央値差を追加の速度向上とは判定しない。SQLの0はmetadataの分解能・取得範囲による値であり、SQL処理がなかったことを意味しない。

## Webの計測

次の表は初回の`75d752a8`→`065382ec`比較である。Kioskは24/120商品、管理メニューは120/2,000商品で、同じconfiguration・locale・HTTP境界・cache条件を使用した。各条件・版のwarm30標本と、独立Browser/Vite起動後の最初の操作5標本、計280標本の[生CSV](performance/quality-343/web-samples.csv)と[集計](performance/quality-343/web-summary.json)を残す。性能測定は414×896のCSS viewport、画像添付は別途402×874で撮影する。

| warm30標本        | DOM更新待ち p50 / p95（ms） | React描画時間 p50 / p95（ms） |
| ----------------- | --------------------------- | ----------------------------- |
| Kiosk 24商品      | 6.4 / 28.3 → 3.05 / 5       | 2.8 / 12.4 → 2 / 3.2          |
| Kiosk 120商品     | 15.3 / 36.1 → 2.6 / 3.6     | 6.5 / 25.6 → 0.6 / 0.9        |
| メニュー120商品   | 33.3 / 34 → 33.6 / 34.2     | 7.55 / 9.5 → 3.5 / 9.6        |
| メニュー2,000商品 | 33.35 / 33.9 → 33.3 / 50.4  | 12.8 / 16.2 → 10.95 / 17.9    |

React描画時間はProfilerのonRender第3引数actualDurationの合計で、commit phase自体の時間やBrowser全体のCPU時間ではない。Kioskのwall timeは字幕deltaの通知からDOM文字列更新のassert成立までで、アニメーション完了や実返答の再生開始ではない。両版ともMotionProviderを使い、画像撮影前には別途字幕opacity=1を確認する。字幕を購読するVoicePanelと商品一覧の境界を分け、最初の接続status更新でも商品選択callbackを安定させた。

Browser起動後5標本のKiosk120商品では、DOM更新待ちの中央値43.5→12.9ms、React描画時間32.6→7.4msだった。fixture準備・mount後の最初の操作であり、Workerや公開HTTPのcold startではない。

メニューのwall timeはrouter.navigate後に2回のrequestAnimationFrameで待つため、フレーム待ちを含む。描画時間の中央値は減ったが、2,000商品のp95は増えており、一律に操作が高速化したとは判定しない。索引・行モデルの再利用は検索順位・件数・金額・locale・URL・入力保持を維持する。

ホームのAPI表はAPI応答量であり、HTML量とは別に扱う。同じ60商品のdemo seed・固定baseTime・staff Cookieを使ったproduction buildのlocal Workerで、次のHTML量も比較した。[9標本と条件](performance/quality-343/ssr-summary.json)を保存し、比較値はChromium同士の各3応答である。WebKitの変更後3応答も追加観測として記録した。

| ホームSSRのサイズ                 |  変更前 |  変更後 |
| --------------------------------- | ------: | ------: |
| HTML全体のUTF-8 bytes             | 406,209 | 148,991 |
| Router hydration用script本文bytes | 304,242 |  44,584 |
| HTMLのgzip level6計算値・中央値   |  56,436 |  22,445 |

script本文はserialized router/query stateにSeroval等のbootstrap・stream終了処理を含み、純粋なdehydrated JSONだけのサイズではない。gzipは比較のための計算値で、実際のwire圧縮・転送量ではない。TTFB/FCP・公開環境のlatencyは未計測であり、サイズ削減を応答時間の短縮に置き換えない。

最終RC実装も同じ60商品・固定baseTime・staff認証を使うproduction Workerで、Chromium/WebKit各3応答を[別途採取](performance/quality-343/ssr-rc-observation.json)した。ChromiumのHTMLは149,016bytes、hydration scriptは44,609bytes、gzip計算の中央値は22,455bytesだった。WebKitは149,005・44,598・22,451bytes。初回改善時の標本を新headの結果に流用せず、元の大きさへ戻っていないことを確認した。

## 整理前後のWeb再比較

`0b3ff961`と最終実装を同じ条件で再比較し、各条件warm30標本と独立Browser/Vite起動後の初回5標本、計280標本を採取した。[集計](performance/quality-343/reduction-web-summary.json)からdataset列で元280標本と補助60標本を区別した生CSV、全runtimeの一致manifestを参照できる。変更前379ファイル・変更後354ファイルが対象版と一致し、計測中の別試験は停止した。

| warm30標本        | DOM更新待ち p50 / p95（ms）   | React描画時間 p50 / p95（ms） |
| ----------------- | ----------------------------- | ----------------------------- |
| Kiosk 24商品      | 3.05 / 5.32 → 2.75 / 4.75     | 1.90 / 3.43 → 1.80 / 3.27     |
| Kiosk 120商品     | 2.40 / 3.54 → 2.35 / 3.43     | 0.60 / 1.41 → 0.60 / 1.34     |
| メニュー120商品   | 33.30 / 34.01 → 33.45 / 34.11 | 4.25 / 9.49 → 8.55 / 10.09    |
| メニュー2,000商品 | 33.40 / 42.66 → 33.40 / 34.00 | 11.45 / 15.80 → 11.60 / 16.76 |

メニュー120商品の元30標本ではReact描画時間の中央値が増えた。JIT等のwarmup条件の影響を調べるため、両版とも30回の未記録warmup後に追加30標本を採取し、元標本と分けて保存した。この補助測定のReact中央値は4.25→4.50ms、DOM更新待ちは33.30→33.40msだった。これを元標本の置換や統計的同等性の証明には使わず、追加の高速化とも判定しない。

初回5標本のメニュー120商品ではDOM更新待ちの中央値19.3→25.3ms、p95は27.22→46.66ms、2,000商品のp95も30.34→52.56msと増加した。少数標本のばらつきを含むため、初回性能が改善したとは判定しない。Kiosk120商品の初回React中央値は7.0→7.2msだった。元標本・補助標本・初回を混ぜず、frame待ち、Profilerの描画時間とアニメーション完了を区別する。

402×874の変更前後画像では、字幕opacity=1、停止操作・カート状態と商品検索の配置を確認した。実機・公開環境・実音声の性能比較ではない。

## 変更後の確認

- RC移行後の最終実装に対し、frozen installで固定依存を復元し、codegen後の`bun run check`が成功した。root185件・API543件・Web162件と、復元したpresentationの既存136件、計1,026テストとformat・typed lint・型検査・fallow全体gateを含む。
- WebのBrowser/Storybookは162ファイル・622テストが成功した。Chromium・WebKit・reduced-motion・Storybookで、入力保持・focus・再試行・cache失効・字幕購読・停止を確認した。MotionProviderを含むKiosk fixtureで字幕opacity=1も検証する。単体側では保存版・検証・409・cache更新順序・店舗分離・親lookupの権限・SSRのsignalも確認した。
- CLIの管理API adapterは実SQLiteとHTTP契約fixtureの12ケースでarray/object/get/run・空結果・不正応答・秘密非表示・D1/R2の所有確認を検証した。本番Cloudflareアカウントへ書込みは行っていない。成果物のdotenv除去も公式Build Output fixtureと実Node CLI入口で確認した。
- 最終RC実装を直接buildし、既存のSSR・Cookie・PWA起動・再試行と日英注文〜会計を、実D1/DOとChromium/WebKitの代表12ケースで確認した。HTML量採取2ケースも含め14件が成功した。開始・終了のsource hashが一致し、所有する28 process group・Mailpit containerの[残存0](performance/quality-343/runtime-cleanup.json)を確認した。試験用runtimeだけを削除し、既存の別runtimeを保全した。
- 通常のcommitでcodegen→lint/HEAD比較auditとcommitlintが成功した。自動stageやfixは行っていない。
- 最新headのCI・代表E2E・配備状態は[Draft PR #344](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/pull/344)に記録する。過去の別commitの成功・配備を新headの結果として扱わない。
