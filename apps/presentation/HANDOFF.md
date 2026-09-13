# 次のセッションへの引き継ぎ

## 最新：動画素材の取得範囲と公開前検査（2026-09-13）

動画素材はルートの`.lfsconfig`で既定取得から除外し、制作する人が[共有手順](SHARING.md)の`--include`と`--exclude=`で選んで取得する。OpenScreen projectは通常Git管理へ切り替え、LFSを取得しないCIでも共有project・収録ログの個人パスを検査する。PR準備だけに使った文書は非公開で保管し、差分・採用理由・検証範囲はPR本文、実行証拠は`records/`へ置く。以下の207等の件数・公開前状態は、その時点の履歴である。

## 最新：第2版レビューの公開前修正（2026-09-13）

共有51ファイルの個人パスを整理し、旧3テイクで共有から漏れていた原録画・カーソル証跡を追加した。原本はGit対象外へ保全。OpenScreen projectはprojectからの相対パスとし、再編集時はprojectのあるフォルダーから標準の`pack`で作業用bundleを作る。実験Composeのbind元は必須の`TABLECAST_MUTATION_CHECKOUT`へ変更した。

新規cloneからLFS207ファイルを復元し、素材・証跡293ファイルのバイト一致、OpenScreenの37 projectの参照解決、10 raw projectのpack、編集済み30秒・原録画18秒のexportと全編復号を確認した。詳細と追加検査は[パス整理の検証記録](records/tablecast-share-path-validation.json)を参照する。既存の完成動画4本は変更していない。下記の204ファイル・83証跡の検査はパス整理前の履歴として保持する。元checkoutのcommit・push・PR作成は引き続き未実施。

## 最新：ドラフトPR向けの共有・品質検査を整備（2026-09-13）

ユーザーの依頼はレビュー指摘を踏まえた修正と公開準備までで、PRは作成しない。作業branchは`codex/1-presentation-workflow`。現行作例はmain追従の商品紹介v14・技術紹介v17、台本は`projects/tablecast-main-rerecord.json`。完成動画は`assets/films/`へコピーし、元の成果物を保持する。

分割発話の完了待ち、実験スクリプトの型・入力検証、旧分岐・旧無音script、CIのpresentationテスト、収録証跡のformat・改行変換を修正した。採用素材と原録画をLFSの共有対象にし、失敗テイクはローカル保持とする。最終設定からの新規cloneで固定依存導入・LFS204ファイルの復元、証跡83ファイルのバイト一致、商品紹介117.3秒・技術紹介63.1秒の生成と全編再生まで確認した。公開対象はステージ済みで、元checkoutのcommit・push・PR作成は未実施。

当時の実施結果と未実施範囲は[検証記録](records/tablecast-pr-validation.json)、新規checkoutの手順は[共有と復元](SHARING.md)。以下の35ファイル固定・v13等の記載は当時の試験履歴であり、今回の修正後の基盤のハッシュ一致を意味しない。

## 最新：UIを大きく変更し、基盤を固定した生成試験が完了（2026-09-13）

ユーザーはv14・v17を好意的に評価した後、アプリを大きく変更して基盤を変えずに生成できるか試すよう依頼した。隣の独立clone `tablecast-mutation-test`と専用Compose `tablecast-mutation`を作成。客側の左右配置・ナビゲーション・商品カード・確認導線・日英文言、店員の受付画面、配色を変更した。API・データモデルは同じ実装を使用し、DBと認証は分離した。

共通基盤35ファイルを開始時のハッシュで固定し、変更なしで実収録・OpenScreen編集・HyperFrames生成・検査まで完了した。変更した入力は台本・字幕・カット・撮影定義・新素材と題材専用の操作adapter。以前の商品紹介の入力72件、既存v14・v17のMP4もハッシュ一致を確認した。

- [商品紹介のテスト版・122.35秒](output/tablecast-mutation-product-v2/video.mp4)：15場面、GUI操作を1場面追加。
- [技術紹介のテスト版・63.1秒](output/tablecast-mutation-technical-v1/video.mp4)：6場面、実画面と実装参照を差し替え。
- [制作・変更・失敗条件・再現手順](experiments/tablecast-mutation/BRIEF.md)、[検証記録](records/tablecast-mutation-validation.json)、[アプリ差分](experiments/tablecast-mutation/application.patch)。差分は現在の隔離cloneへ逆適用するread-only検査も通過。

2本とも配置・遷移・復号・音量・全編の音声あり等速再生を確認。商品紹介45枚・技術紹介37枚のフレームを保存。商品紹介のHyperFrames lintには生成HTML489行への保守性警告1件があるが、エラーなし。映像の採否はユーザー待ち。別業務・別APIへ移植した検証ではない。

共通の検査が不成立を検出したテイクも保持した。店舗の音声設定、GUI照合と音声承認を混ぜる操作順、分割された承認発話の待ち、素材末尾のフレーム丸めを題材側で調整した。専用adapterの`findLast`による分割発話待ちは、固定試験のため元の`tablecast-record-guest.ts`には反映していない。次の制作には修正済みの[product.json](experiments/tablecast-mutation/product.json)を使える。技術紹介の生成時入力[project.json](experiments/tablecast-mutation/project.json)も保存した。

専用の2コンテナは停止済み。隔離clone・DB・素材を保持し、元のidleコンテナとアプリは維持。commit・pushは未実施。この結果を全アプリへの自動追従やIssue全体の完了と読み替えない。

## 最新：現行アプリを再収録し、評価用の2本を生成（2026-09-13）

ユーザーの「再収録・動画生成まで。評価はこちら」に従い、main `7d6adc7`の客側の相談・注文・停止再開・承認・英語回答と、同じ注文の店員受付を実収録した。管理者は直前の同じmainでの実録を使用。今回の台本は[projects/tablecast-main-rerecord.json](projects/tablecast-main-rerecord.json)。既存の商品紹介v13・技術紹介v16と通常名MP4は維持した。

- [商品紹介v14・全編117.3秒](output/tablecast-product-demo-v14/video.mp4)
- [技術紹介v17・全編63.1秒](output/tablecast-technical-evaluation-v17/video.mp4)
- [再収録・再現手順](RERECORD-20260913.md)、[検証記録](records/tablecast-rerecord-validation.json)

2本とも配置・遷移・MP4復号・音量・フレーム抽出・音声あり等速全区間再生が通過。映像と説明の評価はユーザー待ち。撮影処理はSSRによるタイトル更新、Agent音声の準備待ち、発話ごとの完了待ちを修正し、英語のみの追加撮影を可能にした。lint・typecheck・単体43件が通過。今回起動した開発・AgentプロセスとLGTMは停止済み。commit・pushは未実施。この再収録を別アプリへの適用実証やIssue全体の完了とは扱わない。

## 最新：mainを更新し、現行管理画面の再収録を検証（2026-09-13）

ユーザー指示によりmainを`17dc332`から`7d6adc7f9aa813ecdb0f3e5b5248c4ca85c8c919`へpullし、未commitの動画基盤を適用した。競合は最新のAGENTS・Composeを基準に動画用設定を維持して解消、bun.lockを再解決した。保全stashは残している。commit・pushは未実施。

[更新と検証の記録](MAIN-UPDATE-VALIDATION.md)。技術説明で削除された`operations.ts`への参照を共通入口が検出したため、分割先の実装とテストへ根拠を更新した。最新注文API25件、動画単体43件、正本2本のブラウザー19件が通過。技術紹介63.1秒を再生成し、完成MP4を全編検査した。

最新のWeb/APIを起動し、管理者の商品詳細・容量・追加料金を新規収録。既存の撮影定義・録画・編集処理で成立した。商品紹介の検証用コピーはadmin場面だけ新素材へ差し替え、111.1秒の全編生成・復号・音量・42フレーム抽出・Chrome等速全区間再生が通過した。完成フレームで新しい画面とズーム・字幕も確認した。

- [商品紹介の検証用全編](output/tablecast-main-7d6adc7-product-v1/video.mp4)と[実行記録](output/tablecast-main-7d6adc7-product-v1/report.json)。最新実録はadminのみ。
- [技術紹介の検証用全編](output/tablecast-main-7d6adc7-technical-v1/video.mp4)と[実行記録](output/tablecast-main-7d6adc7-technical-v1/report.json)。実画面は旧素材と明記。

商品紹介の正本・採用済み通常名MP4の2本は維持。技術編sample.jsonとclaims.jsonは最新根拠へ更新した。撮影のために起動した当該コンテナ内のdevプロセスと子プロセスは停止済み。コンテナ自体は元のidle状態で残る。次は必要に応じて最新の客側・店員側の撮影を行う。今回の追従確認を別アプリ全行程・音声受入・デザイン承認・Issue全体の完了と読み替えない。

## 最新：アプリ変更に追従する制作ワークフローを整備（2026-09-13）

ユーザー指示に従い、監査から実装へ進めた。入口は[WORKFLOW.md](WORKFLOW.md)冒頭と[制作メモ](BRIEF-TEMPLATE.md)。`bun run video --project ... --film ... --name ... --render`で指定台本の生成・配置／遷移検査・MP4・復号／音量／フレーム抽出／全編再生を新しい保存先へ行い、実結果をreport.jsonに残す。

台本・ブランド・撮影定義の差し替え、TableCastの業務状態待ちと共通の撮影実測の分離、撮影origin・店舗IDの指定、出力に対応するPlaywright検査を実装。既存のsample.json・styles.css・通常名MP4は不変。新規TTSや実アプリの有料会話を行っていない。

[実装・検証記録](WORKFLOW-VALIDATION.md)：format／lint／typecheck、単体43件、ブラウザー19件通過。共通入口で商品紹介の合成検査、技術紹介63.1秒のMP4検査、別ブランドの模式台本12秒のMP4検査が完了。技術編の検証用runは`output/tablecast-technical-workflow-v2/`、別ブランドは`output/tablecast-booking-workflow-v2/`。完成品の通常名は置き換えていない。

次の制作はアプリの変更内容を確認して制作メモと撮影条件を更新し、必要な場面を撮り直す。別アプリの実操作はそのアプリ用のPlaywright操作・状態待ちを用意する。第二の実在アプリの収録、新しい客側一式、別PC復元、commit・push・LFS uploadは未実施。今回のワークフロー整備をIssue全体や映像デザインの承認と読み替えない。

## 最新方針：動画の仕上げを区切り、基盤の再利用性を監査（2026-09-13）

ユーザーは動画の完成度を一旦ここまでとし、アプリが変わっても同等の品質を作れるかの確認へ移った。商品紹介v13・技術紹介v16を維持する。デザインの最終承認やIssue完了を意味しない。

[基盤監査](FOUNDATION-AUDIT.md)に所見・検証・次の受入条件を記録した。単体40件、ブラウザー18件、2本の隔離buildと80時点の配置検査が通過。別名の模式台本は生成できるが旧ブランドが残り、撮影定義の読み込みはTableCastの場面名で停止した。現行実録12場面のうち新しい撮影証跡の検査対象はadminの1場面。保存素材の合成基盤はあるが、変更後の実アプリ・第二アプリで工程全体と同品質を再現する検証は残る。実装・台本・完成MP4は変更していない。

## 最新：技術紹介v16（2026-09-13）

ユーザーは01〜03を「いい感じ」、04以降を「分かりにくく見づらい」と評価し、技術資料で使う図・グラフを参照するよう指定した。01〜03と商品紹介を維持し、後半を状態遷移図・条件別検査表・応答時間の測定区間図へ変更した。[技術紹介v16の全編](output/tablecast-technical-evaluation-v16.mp4) が最新（63.1秒）。通常名もv16へ更新。後半のデザインはユーザーレビュー待ち。

- 参考資料・判断・場面ごとの主張：[TECHNICAL-DIAGRAMS.md](TECHNICAL-DIAGRAMS.md)。根拠：[claims.json](claims.json)。未測定の性能値は作っていない。
- 内容の正本はsample.json、後半専用のCSSはstyles.css、図形式はtablecast-technical-schema.ts。描画関数・アプリ実装・依存を変更していない。
- 後半3場面のナレーションを生成。前半3場面の台本、素材、音声ファイル、開始時刻と尺の一致を保存済みv15と照合した。商品紹介MP4のSHA-256と台本も一致。
- 単体40件、技術編ブラウザー6件、lint・typecheck・対象formatが通過。後半専用スタイルの追加なので商品紹介の再renderはしていない。
- HyperFrames lint/runtime/motionはエラー・警告0。配置100時点で問題0、文字コントラスト177/177通過。v15のシーケンス図を置き換えたため、接続警告も0。
- 完成MP4は1920×1080 / 30fps / H.264＋AAC / 1893フレーム。全編復号、21時点抽出、後半の主要図と冒頭末尾の目視、Chromeで音声あり・等速の全区間0〜63.1秒再生を確認。平均−19.7 dB、最大−1.0 dB。
- [検証記録](output/tablecast-v16-verification.json)、[描画検査](output/tablecast-v16-hyperframes-check.log)、[出力ログ](output/tablecast-v16-render.log)。API25件は同日v15の実行記録を参照し、今回再実行していない。
- v16 SHA-256：`8691DD9175B68897D0D12AC7DE453A8FD46B0558AB3F464F794B6AF0F5E1A9DC`。商品紹介：`AF1F3077B0B0099457D255E54BE9934B8BA4DFF12BAC45AE87E0FFE4376C32BB`。

次はこの全編のユーザーレビュー。次回の書き出しは未使用のv17等へ保存。commit・pushは未実施。

## v15の制作記録：技術紹介v15（2026-09-13）

ユーザーの「動画生成に移って」に従い、技術編を6場面・60.8秒で生成した。[技術紹介v15の全編](output/tablecast-technical-evaluation-v15.mp4) が最新。通常名もv15へ更新。商品紹介v13のMP4と台本・音声設定は変更していない。見た目はユーザーレビュー待ち。

ユーザー指定の3領域構成図と生成見本v2を基に、実画面・ロゴ・編集可能な文字と矢印を配置した。成果→全体構成→音声方式→注文成立と変更→API検証→店舗設定と次の検証の順。音声Agent、Realtime text/tool出力、Inworld TTS、共通APIの役割を示す。画像・ロゴの出典と図の省略は [素材記録](assets/images/tablecast-v15-assets.md) を参照。

- 正本：sample.json、styles.css、scripts/tablecast-technical.ts / tablecast-technical-schema.ts / tablecast-build.ts。配置検査のラベル衝突判定は背景領域ではなく本文・画像を照合する。
- Inworldナレーション6本を必要分のみ生成。保存済み実録を使用し、新規アプリ収録・依存追加はしていない。
- 単体40件、ブラウザー18件（商品12＋技術6）、ローカルWorkers/D1の注文API25件が通過。API実行は2026-09-13、HEAD 17dc332、49.89秒。依存のsourcemap警告はあるが検査は終了コード0。
- HyperFrames lintは0エラー・0警告。checkのRuntime/Motionは0エラー・0警告、文字コントラスト155/155通過。シーケンス図のライフライン接続に汎用判定の警告20件（detached 8、orphan 12）が残る。これはtech-order内の6経路と強調用パスに限り、対象x座標への接続を専用ブラウザー検査と完成映像で確認した。3領域図には接続警告なし。
- 最終出力：1920×1080 / 30fps / H.264＋AAC / 1824フレーム。全編復号、21時点の静止画抽出、主要場面の目視、Chromeで音声あり・等速の末尾到達を確認。音量平均−19.3 dB、最大−1.7 dB。
- [検証記録](output/tablecast-v15-verification.json)、[描画ログ](output/tablecast-v15-render.log)、[音声検査](output/tablecast-v15-audio-check.log)。検査の通過は、実機受入・デザイン承認・Issue #1全体の完了を意味しない。
- v15 SHA-256：`F772C64A6E2DE2DCCB70EB5B601AF4D544B3DB3305BAC3930D8677148E010FC3`。商品紹介のハッシュは従来どおり `AF1F3077B0B0099457D255E54BE9934B8BA4DFF12BAC45AE87E0FFE4376C32BB`。

次はこの全編のユーザーレビュー。再編集時は [WORKFLOW.md](WORKFLOW.md) に沿って次版v16など未使用名へ出力する。commit・pushは未実施。

## 以下はv14以前の引き継ぎ記録（履歴）

更新：2026-09-13 JST。ユーザーは「ここまでを一区切りとして生成ルートを固定し、工程・使用技術・重要事項をまとめ、引き継ぎ書を作成する」と指示した。この区切りでは文書を整理し、新たな映像改修・再撮影・TTS生成は行っていない。

追記（同日・内容の再定義）：ユーザーは商品紹介を現状維持とし、技術紹介について一般的な技術デモを調査したうえで構成・提示内容を定義し直すよう指示した。[TECHNICAL-BRIEF.md](TECHNICAL-BRIEF.md) を更新し、結果→全体像→音声方式の選択→注文の実行例→検証→展開と限界の6場面、約1分を次版の設計とした。台本JSON・音声・動画・描画コードは未変更。以下のv14の内容・検査結果は保存済み旧版の記録として読む。次版の内容設計とv14の映像を混同しない。

## 最初に把握すること

1. 目的は [Issue #1](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/1) の動画生成基盤。個別動画は制作ルートを検証する作例。
2. [GENERATION.md](GENERATION.md) が生成ルートの正本。[WORKFLOW.md](WORKFLOW.md) が現行コマンド。過去のv5〜v13技術図の方針へ戻さない。
3. 商品紹介と技術紹介は**必ず別々の全編**として扱う。商品紹介v13はいったん採用。技術紹介v14は提示済みで、見た目のレビュー結果はまだ得ていない。
4. ユーザーが評価する。検査通過をデザイン承認と扱わない。「レビュー」だけの指示を実装指示に変えない。再開時は次のユーザー指示を受けて対象を決める。

## 作業場所と保存状態

```text
ユーザー側の親ディレクトリ:
<workspace>

リポジトリ:
<workspace>/tablecast-poc

動画workspace:
<workspace>/tablecast-poc/apps/presentation

記録時のブランチ: main
記録時のHEAD: 17dc3328960e653006854b6edc8d829e4063f80e
```

`apps/presentation/` 全体は記録時点でGit未追跡。**ローカルに保存した状態であり、commit・push・PR作成は行っていない。** `.gitattributes` は動画workspace内にあり、素材のmp4/webm/wav/openscreen/ttf/pngをLFS対象にしているが、設定の存在は素材のリモート保存完了を意味しない。

`dist/` と `output/` はGit対象外。この引き継ぎ書は `output/` の外に置いた。別PC・別cloneに移る場合、ソースだけでなくLFS素材・元録画・保存音声・必要な完成動画と検証記録も移行対象。認証状態と秘密値は通常のGit保存に含めない。

他作業の変更として `.devcontainer/Caddyfile`、`.devcontainer/compose.yaml`、ルート `AGENTS.md`、`bun.lock`、未追跡 `docs/windows-docker-recovery.md` がある。破棄・一括整形・巻き戻しをしない。現在値は再開時に `git status --short` で確認する。

## 成果物

| 動画        | 状態・尺                                  | 全編                                                         |
| ----------- | ----------------------------------------- | ------------------------------------------------------------ |
| 商品紹介v13 | いったん採用、111.1秒                     | [商品紹介v13](output/tablecast-product-demo-v13.mp4)         |
| 技術紹介v14 | 生成・検査済み、レビュー待ち、60.733333秒 | [技術紹介v14](output/tablecast-technical-evaluation-v14.mp4) |

通常名 `output/tablecast-product-demo.mp4` は商品紹介v13と一致、`output/tablecast-technical-evaluation.mp4` は技術紹介v14と一致する。以前の `tablecast-full-review-v13.mp4` は結合して提示してしまった比較用ファイルであり、主成果物ではない。

今回確認したSHA-256（別エンコード時の一致を要求する値ではなく、保存済み成果物の識別値）：

```text
商品紹介v13:
AF1F3077B0B0099457D255E54BE9934B8BA4DFF12BAC45AE87E0FFE4376C32BB
技術紹介v14:
1ADE258786B4D0CDE478C3751FF41C176E66B52216D19143D08959B8C30FD181
```

## 現行内容と採用素材

商品紹介は14場面。実画面のサムネ→客・端末→相談→注文→停止と保持→読み上げ・承認→結果→英語→店員受付→管理画面→まとめ。役割は客＝iPad、店員＝iPhone、管理者＝MacBook＋ウィンドウ枠。

| 役割   | `sample.json` が参照する編集済み素材          | 編集projectのフォルダ                            |
| ------ | --------------------------------------------- | ------------------------------------------------ |
| 客     | `assets/demo/tablecast-guest-v13.mp4`         | `assets/openscreen/tablecast-guest-v13/`         |
| 店員   | `assets/demo/tablecast-iphone-staff-v13.mp4`  | `assets/openscreen/tablecast-iphone-staff-v13/`  |
| 管理者 | `assets/demo/tablecast-macbook-admin-v13.mp4` | `assets/openscreen/tablecast-macbook-admin-v13/` |

客・店員は成功済みの旧収録を再編集。管理者はv12bで再撮影した素材をv13へ組み込んだ。全役割を最新アプリで新規再撮影したわけではない。管理者は採用済みの撮影証跡付き。客側の撮影条件を定義し直した後の全行程の再撮影には未完了部分がある。

保存済みの技術紹介v14は、当時の定義に沿った以下の5場面。更新後の [TECHNICAL-BRIEF.md](TECHNICAL-BRIEF.md) は次版の6場面を定義している：

| ID                  | 内容・図                                                            |
| ------------------- | ------------------------------------------------------------------- |
| `tech-intro`        | 会話と業務判断の責務分離。実画面と主張                              |
| `tech-architecture` | Web・API・Python Agent、外部音声サービス、D1・DOの責務と通信        |
| `tech-order`        | 版付き確認→読み上げ→読了通知→新しい発話で承認→検証→保存のシーケンス |
| `tech-change`       | カート変更による古い確認の失効と、対応する実テスト抜粋              |
| `tech-evidence`     | APIテスト25件、Python実装抜粋、未検証事項、今回のIssue #1制作工程   |

図は `technical.view/panels/connections/lifelines/focus/sources` から生成。旧 `diagram.columns` の4列カードではない。構成図は矩形境界、シーケンス図は主体のライフラインへ矢印を接続する。音声の読了が必要なのは説明中の音声承認経路で、GUI承認は独立経路。

導入の `assets/images/tablecast-technical-confirm-v14.png` は客の元素材122秒から余白を除去した実画面。架空の画面合成・人物イラストは使用していない。ナレーションは5本を新規生成し、そのWAVを保存済み。音源は既存BGM・SEを継続。

## 検証済みの範囲

- 動画workspace：型検査・lint・変更対象のformat・単体40件が通過。
- ブラウザー検査：商品紹介12件、技術紹介6件が通過。全場面、長文はみ出し、字幕切替、図の端点・ラベル、注目先と逆方向seekを含む。
- アプリ側：`apps/api` で `bun run test test/orders.test.ts` を実行し25件通過。ローカルWorkers・D1での検査であり、実機・会場の音声受入ではない。
- 技術紹介v14：全編復号成功、Chromeで音声あり・1倍速・0秒から60.733333秒まで再生完了、再生エラーなし。音声平均−19.5dB、最大−1.7dB。完成MP4から冒頭・構成・処理順・例外・根拠・末尾を抽出して確認。
- 商品紹介の台本・音声設定・MP4を変更していないことを照合。

根拠ファイル：

- [完成動画の検証結果](output/tablecast-v14-verification.json)
- [API検査の実行範囲](output/tablecast-api-evidence-v14.json)
- [HyperFrames検査ログ](output/tablecast-v14-check.log)
- [最終renderログ](output/tablecast-v14-render-final.log)
- [音声検査ログ](output/tablecast-v14-audio-check.log)

## 障害と対処を引き継ぐ

| 事項                     | 現在の対処・再発時の判断                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenScreenのカーソル設定 | CLIでサイズ・visibleが期待どおり反映されないため、FFmpegで実測カーソルを前処理。OpenScreen側のsidecarは空にして重複を防ぐ                                                                 |
| OpenScreenのズーム       | 1.11のv2移行でcustomScaleが落ちるため標準depthを使う。助走・着地・引きをcut内に確保。HyperFramesで二重ズームしない                                                                        |
| 描画の高速化             | v14中にdrawElementの自己検証が失敗し、ツールが自動フォールバックした。最終出力は `--experimental-fast-capture=false` を明示して成功。高速経路を復旧済みとは扱わない                       |
| HyperFramesの接続警告    | lint/runtime/motionはエラー・警告0。配置にはシーケンスのライフラインを接続先と認識しないdetached/orphan警告22件が残る。専用検査で主体・端点・ラベルを確認済み。新しい警告を一括無視しない |
| GSAPの巻き戻し           | 後続のautoAlpha操作を巻き戻すと囲みが再表示される問題を、CSSのvisibilityとopacityの初期化で修正。逆方向seekのテストを維持                                                                 |
| 尺の誤差                 | フレーム境界の浮動小数点誤差で1フレーム増えるケースを修正。音声尺追従テストを維持                                                                                                         |
| 客側の再収録             | 新テイクで空の音声入力・VOICE_INTERNAL_ERROR等を検出し、不採用にした。成功済み旧素材を利用中。原因全体の解消や新規一式の収録完了とは報告しない                                            |
| 別マシン                 | OpenScreen projectの絶対パス、Chrome・フォントキャッシュ、認証状態、ローカルURL等への依存が残る。portable素材と実環境を確認する                                                           |

## 未完了・次に判断すること

1. 技術紹介は内容の再定義指示を受領済み。[TECHNICAL-BRIEF.md](TECHNICAL-BRIEF.md) に次版の構成と根拠を整理した。映像への反映は未実施。次の制作では技術編だけを対象とする。
2. アプリ変更へ追従する制作では、字幕・カット・図・根拠・注目対象の選択を人が行う。アプリのdiffから自動的に正しい動画へ更新する仕組みは未完成。
3. 更新した撮影定義で客側の注文成立まで収録し、必要なら店員側も同じ注文で撮り直す。これは新規撮影が必要になった時の作業で、引き継ぎ直後に勝手に実行しない。
4. Codexによる過去のアプリ実装の改善事例は未選定。v14の末尾は今回の動画制作工程だけであり、過去のIssue→失敗検査→修正を実証する事例ではない。
5. 別マシン・新cloneでの再生成、素材のGit/LFS保存・共有、Issue #1全体の受入は未完了。今回の文書化だけで完了扱いしない。

## 再開方法

`AGENTS.md`（親と動画workspace）→この文書→[GENERATION.md](GENERATION.md)→[WORKFLOW.md](WORKFLOW.md)を読む。実装箇所は `sample.json`、`styles.css`、対象の `scripts/`。実アプリの技術内容を変える場合は `docs/architecture.md`、`docs/voice/integration.md`、実コード・テストを読み直す。

確認だけなら成果物を開く。保存済み素材からの再生成はアプリ起動・Docker変更・有料TTSを必要としない。撮影を行う場合だけ、起動状態・認証・新規保存先・有料音声を使う範囲を確認する。秘密値の本文をツール出力へ出さない。

`output/tablecast-verify-v14.mjs` はv14の固定名・固定hashを使い、成功すると通常名MP4へコピーする一回用検証スクリプト。次版へそのまま流用しない。通常手順は [WORKFLOW.md](WORKFLOW.md) を使う。

次のセッションへ渡す短い指示：

> `tablecast-poc/apps/presentation/HANDOFF.md`、`GENERATION.md`、`TECHNICAL-BRIEF.md` を読み、Issue #1の続きとして作業してください。商品紹介v13は現状維持です。技術紹介v14は保存済みで、次版は調査を踏まえた6場面へ内容を再定義済み、映像化は未実施です。2本を分離し、確定した生成ルートと既存素材を引き継いでください。自動化済みと手動判断が残る範囲を混同せず、今回依頼した範囲だけを更新してください。
