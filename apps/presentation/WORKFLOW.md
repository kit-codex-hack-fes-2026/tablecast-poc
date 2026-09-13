# 現行の生成・再編集・再収録手順

## アプリの変更に追従する共通ワークフロー

共通コードを固定して大幅なUI変更を試した実行例は[隔離アプリでの生成試験](experiments/tablecast-mutation/BRIEF.md)。35ファイルを変更せず、題材側の台本・撮影定義・操作adapterの調整で2本を生成した。アプリ固有の手順まで自動で追従するという保証ではない。

制作の入口はこの文書。既存のHyperFrames・OpenScreen・TTSを使い、題材ごとの構成・撮影・編集判断と、共通の生成・検査をつなぐ。最初に[制作メモのひな型](BRIEF-TEMPLATE.md)を埋める。現行の2本は作例として維持する。

1. **実装と変更を確認する。** 対象のアプリ版、利用目的、成功条件、変更されたUI・APIを特定する。既存録画が今も有効か判断し、必要な場面を再撮影対象にする。
2. **題材の入力を整える。** `project.json`にブランド・構成・字幕・発話・素材・図・時刻、隣の`capture-plan.json`に撮影意図・状態・対象・保持条件を置く。TableCastの既定入力は`projects/tablecast-main-rerecord.json`とpresentationルートの`capture-plan.json`。
3. **撮影する。** アプリ固有のPlaywright操作で初期状態を用意し、成功結果を待つ。共通の`captureShot(page, sceneId, shot, out, waitForState)`で実測・保持の証跡を残す。状態名があるのに状態待ち関数を渡さない場合は失敗する。業務状態を共通処理へ追加しない。
4. **編集・音声・図を合わせる。** 採用した実応答からcutと字幕を決め、実測に合わせてズームを設定する。新しい発話だけTTSを生成し、実音声尺に合わせて図の強調を調整する。詳細は下記の既存工程を使う。
5. **生成・検査する。** 下記の`video`コマンドで、指定した台本と出力に対してbuild・Playwright配置検査・HyperFrames lint／遷移検査を実行する。`--render`指定時はMP4、形式・全編復号・音量・完成フレーム抽出・等速再生まで進む。
6. **全編をレビューする。** 完成MP4を制作メモの基準で確認し、根拠・音・見た目を評価する。修正が必要なら該当する正本へ戻り、新しいrun名で再生成する。

### 共通の生成コマンド

以下は`apps/presentation`で実行する。`--name`には未使用の英小文字・数字・ハイフンの名前を指定する。失敗テイクや完成品を上書きしない。

```powershell
# 保存済み素材で構成と検査まで。新しい録画や有料TTSは実行しない。
bun run video --project projects/tablecast-main-rerecord.json --film technical --name tablecast-technical-check-v1

# 完成MP4の書き出しと検査まで行う。
bun run video --project projects/tablecast-main-rerecord.json --film technical --name tablecast-technical-release-v1 --render

# 別ブランド・別場面名でも同じ入口。模式台本の動作確認用。
bun run video --project examples/tablecast-booking/project.json --film demo --name tablecast-booking-v1 --render
```

出力は`dist/<name>/`と`output/<name>/`。後者に入力台本、工程ごとのログ、配置テストの実結果、`report.json`を保存し、render時には`video.mp4`、確認用`player.html`、完成フレーム`frames/`も保存する。途中失敗は`status: failed`、合成検査のみは`composition-checked`、MP4検査まで完了すると`rendered-and-checked`。見た目・説明・音の採否は常に`editorialReview: pending`で始まり、制作メモへ実際のレビュー結果を残す。警告の詳細はログを確認する。

reportには入力台本・参照素材・生成コードのハッシュ、アプリHEADと作業ツリー状態、撮影証跡の適用範囲を記録する。実行中に入力が変われば失敗する。HEADだけで未commitのコードを表現できるとは扱わない。通常名への反映は全編レビュー後に対象だけをコピーする。

### 題材ごとに変えるもの

- `brand.name/title`でヘッダー・画面枠・末尾・HTMLタイトルを変える。任意の`brand.roles`（customer/staff/admin）と`brand.speakers`（narrator/customer/cast/instruction）で表示名を変える。これらのキーはレイアウト用の枠として維持する。1920×1080・30fps・日本語と既存スタイルは標準プリセット。
- 画像・録画・音声は引き続きpresentationルートの`assets/`へ置く。台本の場所を変えても素材パスの基準は変わらない。別アプリの実装根拠はリポジトリ内の相対パスで管理する。外部リポジトリならこのworkspaceをその開発環境へ配置し直し、素材・出典の参照を合わせる。
- `TABLECAST_PRESENTATION_PROJECT`を指定すると、TTS・既存編集・収録もその台本を使う。TableCastの既定台本はpresentationルートの`capture-plan.json`、別題材は台本と同じフォルダの`capture-plan.json`を読む。`TABLECAST_PRESENTATION_CAPTURE_PLAN`を指定すると、どちらの場合もそのファイルを優先する。指定パスはpresentationルートからの相対パスまたは絶対パス。
- TableCastの収録スクリプトには注文・音声・管理画面の操作がある。接続先は`TABLECAST_CAPTURE_ORIGIN`、店舗IDは`TABLECAST_CAPTURE_STORE`で指定する。業務状態の待機は`tablecast-app-capture.ts`が所有する。別アプリではそのアプリ用のPlaywright操作と状態待ちを作り、`tablecast-shot.ts`の実測、既存の録画・編集方法を利用する。JSONの変更だけで任意のアプリを自動操作する仕様ではない。
- TableCastの内容に対する回帰テストは維持する。共通の配置・字幕・比率・技術図の検査は出力先と生成されたtimingから検査し、別題材にはTableCast固有の場面名を要求しない。Playwrightの[project／tag](https://playwright.dev/docs/test-annotations)と既存の[HyperFrames CLI](https://hyperframes.heygen.com/packages/cli)を使い、新しい描画基盤は追加していない。

### 素材の更新と引き渡し

再撮影したら`capture`と`media.shot`、take・events・OpenScreen projectを新テイクへ対応させる。buildはその定義・実測と編集を照合する。旧素材に証跡がなければreportに未適用と出る。これは旧作品の再生成を残すためであり、新しい実装への追従を証明しない。新規に撮る場面では証跡を残す。実装変更後の素材の鮮度は制作メモで確認し、撮影定義のハッシュだけで判断しない。

録画ツールが書いたJSONは証跡として生バイトを保存し、formatter対象から除外する。台本・撮影定義・ソース・設定は整形する。runは入力の生バイトをhash化するため、実行中に入力を変更しない。main更新から根拠の更新・現行管理画面の再収録・全編生成までの実例は[main追従検証](records/tablecast-main-video-validation.json)を参照する。

コード・入力・制作メモ・採用素材・必要な証跡を引き継ぐ。素材は既存`.gitattributes`のLFS対象を確認する。公開前に[共有手順](SHARING.md)に従い原録画とカーソル証跡を同梱し、原本を非公開で保全してからproject・ログの個人パスを整理する。採用runのreportや根拠として参照するテスト結果は、ignore対象のoutputだけに放置せず、採用記録として保存または成果物と一緒に共有する。新しいcheckoutでは依存とLFS素材を取得し、まず保存素材の`video`検査を通し、再撮影時にのみアプリ・認証・OpenScreen・画面寸法を確認する。

以下はTableCastの既存素材を扱う詳細手順。手動のbuild／renderは原因調査や工程単独の再実行に使い、通常は上記の共通入口を優先する。

生成ルートの正本は [GENERATION.md](GENERATION.md)、現在の成果物・環境・残件は [HANDOFF.md](HANDOFF.md)。この手順は商品紹介v14（117.3秒）／技術紹介v17（63.1秒）を起点とする。採用素材と完成MP4は[共有と復元](SHARING.md)を参照する。

## 必要な工程を選ぶ

| 変更                           | 必要な工程                                                         |
| ------------------------------ | ------------------------------------------------------------------ |
| 確認・レビューだけ             | 保存済みの対象MP4を開く                                            |
| 見出し・配置・図の文字や強調   | 正本を変更→対象build→検査→対象render→全編確認                      |
| ナレーション                   | 発話変更→必要分だけTTS→音声尺・強調時刻を調整→build以降            |
| 保存済み実録のズーム・カーソル | 台本の対象・時刻を更新→FFmpeg前処理・OpenScreen再export→build以降  |
| アプリや必要な表示内容         | 実装根拠と撮影定義を更新→必要な場面を新規収録→採用・編集→build以降 |

以下はリポジトリ内の `apps/presentation` で実行する。PowerShellでは前のコマンドが失敗しても次の行が動くため、各工程の終了コード0を確認してから進む。

## 保存済み素材から再生成

Node.js、Bun、Chrome、FFmpeg/FFprobeと既存依存を用意する。通常のbuild/renderにはアプリ起動・Docker操作・秘密値・新規TTSは不要。

技術紹介の例：

```powershell
bun run build:film --film technical
if ($LASTEXITCODE -ne 0) { throw 'build失敗' }
bun run test:layout --project=technical
if ($LASTEXITCODE -ne 0) { throw '配置検査失敗' }
bun x hyperframes lint dist/technical
if ($LASTEXITCODE -ne 0) { throw 'lint失敗' }
bun x hyperframes check dist/technical --at-transitions
if ($LASTEXITCODE -ne 0) { throw '遷移検査失敗' }
```

警告も対象runごとに内容を確認する。過去版の検証結果を、新しい図の不具合を無視する理由にしない。

検査通過後、次版は新しいファイル名で保存する。現行の技術紹介v17は生成済み。以下のv18は次版の命名例であり、使用済みなら未使用の版番号へ変更する。

```powershell
bun x hyperframes render dist/technical --output output/tablecast-technical-evaluation-v18.mp4 --experimental-fast-capture=false
if ($LASTEXITCODE -ne 0) { throw 'render失敗' }
```

商品紹介を変更する場合は、上記の `technical` を `product`、出力名を `tablecast-product-demo-v次版.mp4` に対応させる。指定のない側は再生成しない。通常名へ反映するのは、完成MP4の確認後に対象ファイルだけをコピーする。

`render:product`／`render:technical` は配置検査付きの既存簡易コマンドだが、高速描画オプションを明示せず通常名を上書きする。版を保管する最終出力には上記の明示コマンドを使う。v15は台本・技術図の描画・配置検査を更新し、既存依存を維持した。

実装を変更した時は対象のformat・lint・typecheck・単体検査も実行する。共通の配置処理を変えた場合は両動画のブラウザー検査を行う。検査のためだけに無関係な動画をrenderしない。

```powershell
bun run lint
bun run typecheck
bun run test
bun run test:layout
```

結果を個別に確認する。全体formatによる無関係な変更を避け、編集対象だけにOxfmtを実行する。

## ナレーションを更新

`projects/tablecast-main-rerecord.json` の `cues[].speech`（省略時は表示用text）を更新する。必要な発話だけを生成し、保存済みWAVは保持する。

```powershell
$env:TABLECAST_PRESENTATION_ENV_FILE = (Resolve-Path ../../.env.secrets.local).Path
bun run tts:live --film technical
if ($LASTEXITCODE -ne 0) { throw 'TTS生成失敗' }
```

`INWORLD_API_KEY` を環境から渡す方法もある。秘密値を表示しない。この入口は有料APIを使う。保存済み音声は発話・声・モデル等のハッシュで再利用する。破損時にキャッシュを一括削除して再課金しない。

技術編の尺は実音声＋末尾0.8秒をフレーム単位で計算する。生成後は `technical.focus` のcue・offsetを実際の発話へ合わせる。音声を変更しても古い強調時刻が自動的に正しくなるわけではない。実会話の `media.audio: true` 区間へ別TTSを重ねない。

## 保存済み実録を再編集

`projects/tablecast-main-rerecord.json` の `media.file/project/zoom` を確認し、新しい版の保存先を用意する。現行素材は [HANDOFF.md](SHARING.md) の表を参照。入力の編集projectや媒体へ書き込む処理なので、採用済みの比較用素材を先に保持する。

```powershell
bun --no-env-file scripts/tablecast-edit-guest.ts
bun --no-env-file scripts/tablecast-edit-role.ts
```

必要な方だけを実行する。店舗側スクリプトは台本内のstaff・admin両方を処理する。限定して試す場合は `TABLECAST_PRESENTATION_PROJECT` で編集用台本を指定する。

元録画・実DOMイベント→FFmpegでcrop・scale・padとカーソル合成→標準OpenScreen v2 projectでズーム・export→表示用余白の除去、の順序。OpenScreenのカーソルsidecarは空にして二重描画を防ぐ。出力は30fps・1秒間隔のキーフレームにする。編集終了後にbuildへ進む。

Windowsの客録画は元ウィンドウ1026×850、client領域 `crop=1024:768:1:81` を実測済み。DPI・ウィンドウ寸法が違う場合は流用せず計測する。助走・保持・引き・倍率は [ZOOM.md](ZOOM.md)、カーソルの先端と表示区間は [POINTER.md](POINTER.md) に従う。

## 新しく撮影

[CAPTURE.md](CAPTURE.md)から始める。必要な情報を `capture-plan.json` で定義し、成功後に採用済み台本へ反映する。実UI・API・実応答を使い、失敗テイクを成功扱いにしない。

アプリのローカル起動と認証状態を確認する。収録先の既定はmain。別ブランチ・別worktreeでは`TABLECAST_CAPTURE_ORIGIN`を設定し、doctorにも同じoriginを指定する。他作業のDockerやプロセスを再起動しない。

```powershell
bun run doctor
bun run capture:check --storage-state ../../.local/tablecast-ipad-fresh-auth.json
```

capture:checkは短い録画・ズームの確認で、会話・注文全行程の受入ではない。

新しい撮影の例（保存名は未使用名へ変更）：

```powershell
node scripts/tablecast-record-guest.ts tablecast-guest-new-take
if ($LASTEXITCODE -ne 0) { throw '客側収録失敗' }
node scripts/tablecast-record-role.ts admin tablecast-admin-new-take
if ($LASTEXITCODE -ne 0) { throw '管理者収録失敗' }
$env:TABLECAST_GUEST_CAPTURE_EVENTS = (Resolve-Path assets/openscreen/tablecast-guest-new-take/tablecast-events.json -ErrorAction Stop).Path
node scripts/tablecast-record-role.ts staff tablecast-staff-new-take
if ($LASTEXITCODE -ne 0) { throw '店員収録失敗' }
```

確定注文が1件あり注文かごが空の同じ合成来店で、英語応答だけを追加撮影する場合は`node scripts/tablecast-record-guest.ts tablecast-english-new-take english`を使える。別テイクの実音声・字幕・カットとして対応付ける。[最新mainの再収録記録](records/tablecast-rerecord-validation.json)を参照する。

必要な役割だけを実行する。客は認可済みの新しい合成来店・空カート／注文0件が必要で、有料の実会話と注文操作を行う。店員は同じ注文を参照する。認証状態は `TABLECAST_CAPTURE_STORAGE_STATE` で指定する。店員収録では `TABLECAST_GUEST_CAPTURE_EVENTS` に今回成功した客側テイクのイベントファイルを必ず指定する（リポジトリルートからの相対パスまたは絶対パス）。上の客側保存名を変えた場合はこのパスも合わせる。管理者収録には不要。既定の認証ファイル名だけで、現在も有効とは判断しない。

成功時のtake・shot・イベント・音声・元録画を保持する。字幕・cut・zoom・必要な静止画を新テイクへ合わせ、旧発話の時刻を流用しない。GUI編集では各素材フォルダのportable projectを優先し、絶対パスを確認する。

## 完成MP4の確認と提示

1. FFprobeで解像度・fps・映像／音声・尺を確認し、FFmpegで全編復号する。
2. 完成MP4から冒頭、切替、ズームの移動・保持・引き、図の注目先、末尾を抽出して確認する。HTMLの検査だけで終えない。
3. 音声の切れ、字幕と強調の時刻、BGM・SE、ピークを確認する。Chromeで音声あり・等速で全編を再生し、再生エラー・終端までの到達を記録する。
4. 版付きMP4と検証記録を保存し、指定外の成果物・台本が変わっていないことを照合する。
5. 対象の全編を個別に提示する。見た目の採否はユーザーに委ねる。

短い試写は `bun run build:film --film technical --scenes tech-evidence --out dist/reuse-check` のように別ディレクトリへ生成できる。レビュー成果物は最終的に全編へ戻す。
