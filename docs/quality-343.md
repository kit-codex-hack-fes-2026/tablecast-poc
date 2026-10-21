# 業務境界・品質ゲート・性能の検証

[構成図と公開入口](architecture.md) / [静的解析](static-analysis.md) / [Issue #343](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/343)

## 対象と判定

検証した実装commitは `065382ec0e37ddfe8f48e4610e092c0e91c074ed`。基準は最新stagingへrebaseした `75d752a8deacbd95202f59c4b48f5b9e547313b4`。変更後は同branchの最終実装を隔離snapshotまたは実workerdで検証した。提出commitとCIの対応はDraft PR #344を正本とする。環境はmacOS arm64、Node 24.22.0、Bun 1.4.3、Vitest 5.0.5、Playwright 1.64.1。外部モデルや有料TTSは呼んでいない。

packagesを追加せず、操作のbatchを所有業務へ置いた。DBの公開入口はschema・生成・型、bootstrapは既存運用CLIが必要な認証・料金計算・初期化の限定入口にする。Webは業務featureと表示shellを分け、字幕購読と商品選択の状態寿命を分離した。外部protocolとメール描画・送信もapp内の役割へ分けた。価格・版・認可・snapshot・冪等性・既存のUIを維持する。

## 全体解析と静的fixture

fallow 3.34.1は、rebase後のfrozen install・codegenから既存の構造error42件を0件へ修正した。実入口を確認し、unused export/typeはlocal化・削除、未使用のeventsource-parser、rootの重複MCP SDKとAPIのWrangler宣言を整理した。独立したUI namespaceのRoot/Panelはファイルと名前を限定して認識させ、テストtransportの反射呼出しはmember単位で理由を残した。生成物・取得済み外部skill以外のsrc全体やbaselineによる除外は追加していない。

| 項目               | 変更前 | 変更後 |
| ------------------ | -----: | -----: |
| 構造error          |     42 |      0 |
| unused export      |     36 |      0 |
| unused type        |      3 |      0 |
| unused依存候補     |      3 |      0 |
| 未解決import・循環 |      0 |      0 |

[全体の集計](performance/quality-343/fallow-summary.json)には複雑度・重複の残件も含める。rootの開発CLIに対するdev-dependency-in-productionの2警告（@cloudflare/config・zod）は残る。両依存は実際に開発・配備CLIが使うため、削除や本番依存への移動で解析結果だけを変えない。複雑度・重複は警告として継続改善し、構造errorは全体gateで拒否する。閾値超過の関数は216→206件、clone groupは77→85群、重複行率は2.28→2.66%である。分割・fixture・原子性試験追加を含む全体値であり、重複まで改善した結果とは扱わない。残る警告は集計を正本にする。

`bun run fallow`は標準の `dead-code` によるerror gate後、複雑度・重複を報告する。引数なしの報告CLIをそのままCIの成否にしない。Lefthookだけはcodegenを一度完了してからlintとHEAD比較auditを実行し、自動修正・自動stage・pre-pushを追加しない。

[静的fixture結果](performance/quality-343/static-fixtures.json)と[部分stage・audit結果](performance/quality-343/audit-fixtures.json)は隔離Git workspaceで実CLIを実行した結果である。

- 301行の実装、501行のテスト、unsafe argument/member、defaultのみの不足switch、natural順の違反を拒否した。空行・コメントは数えず、整列後もCSS副作用import同士の順序を保った。
- Webの実tsconfigを継承し、配列添字のundefinedを型検査で拒否した。exactOptionalPropertyTypesは追加していない。
- 全体gateは既存の未使用ファイルも失敗させ、複雑度警告のみなら成功し、不正設定で失敗した。
- 部分stageの同一fileはLefthookが未stage差分を退避・復元する。別fileの未stageエラーはauditへ影響する。成功・失敗ともindexと未stage差分が一致した。
- `scripts/tablecast-import-rules.test.ts`は実設定と実Oxlintを接続し、privateな別module、外部integrationからDB/Auth/Hono、shellから業務query、WebからDB/bootstrap等を拒否し、公開契約・明示route合成を許可した。

[MCP記録](performance/quality-343/mcp.json)ではローカル固定版の起動・初期化、43 tools、project_infoの4 workspacesを確認した。登録のcwdは対象worktreeへ固定し、ネットワークから別版を取得しない。

## APIの実経路

HTTP入口・認証・業務・D1・通知を含め、実migration済みD1/DOで比較した。1件と100件の各fixtureを使い、各版5回の独立runner/Worker起動で初回＋warm30標本を取得した。各経路・規模・版のwarmは計150標本、初回は5標本。計1,860標本の[生CSV](performance/quality-343/api-samples.csv)と[集計](performance/quality-343/api-summary.json)を残す。p50は中央値、p95はnearest rankである。

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

## Webの計測

Kioskは24/120商品、管理メニューは120/2,000商品で、同じconfiguration・locale・HTTP境界・cache条件を使用した。各条件・版のwarm30標本と、独立Browser/Vite起動後の最初の操作5標本、計280標本の[生CSV](performance/quality-343/web-samples.csv)と[集計](performance/quality-343/web-summary.json)を残す。性能測定は414×896のCSS viewport、画像添付は別途402×874で撮影する。

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

## 動画と残件

CLIと動画generatorは入口・処理・I/O・用途別データを分離し、子moduleまで入力hashへ含める。商品動画buildとChrome配置検査17件は成功した。rebase直後のgeneratorと変更後のindex.html・timing.json・captions.vttは[SHA256が一致](performance/quality-343/video-bytes.json)した。

保存済みの技術紹介全体は、削除済みLiveKit/Python/Mastra/Inworldの参照と説明が残るためbuildできない。[既存入力不備の記録](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/343#issuecomment-6323652010)を参照する。収録済み台本・音声・素材を保全し、根拠が異なる現行ソースへの付替えや有料再収録で成功扱いにしていない。独立したtechnical render fixtureは成功している。技術版の再構成・再収録は残件である。

## 変更後の確認

- frozen installで固定依存を復元し、codegen後の`bun run check`が成功した。root170件・API542件・Web156件・動画136件、計1,004テストとformat・typed lint・型検査・fallow全体gateを含む。
- Webの`bun run test:browser`は160ファイル・618テストが成功した。Chromium・WebKit・reduced-motion・Storybookで、入力保持・focus・再試行・cache失効・字幕購読・停止を確認した。MotionProviderを含むKiosk fixtureで字幕opacity=1も検証する。
- 既存のSSR・Cookie・PWA起動・再試行と日英注文〜会計を、実D1/DOとChromium/WebKitの代表12ケースで確認した。HTML量採取2ケースも含め14件が成功し、試験用runtime・process・Mailpit containerの[残存0](performance/quality-343/runtime-cleanup.json)を確認した。
- 通常のcommitでcodegen→lint/HEAD比較auditとcommitlintが成功した。自動stageやfixは行っていない。
- 最新headのCI・代表E2E・配備状態は[Draft PR #344](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/pull/344)に記録する。過去の別commitの成功・配備を新headの結果として扱わない。
