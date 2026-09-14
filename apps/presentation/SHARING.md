# 動画基盤の共有と復元

PRごとの自動生成・Artifactsの取得・再実行・素材不足時の対応は[PRのデモ動画](CI.md)を参照する。

Issue #1の動画基盤として、生成コード・台本・採用素材・原録画・編集project・撮影証跡を共有する。通常の再生成は保存済みの音声と映像を使い、アプリ起動・認証・有料TTSを必要としない。

## 共有するもの

- 現行作例は`projects/tablecast-main-rerecord.json`。mainの`7d6adc7`に追従して再収録した商品紹介v14・技術紹介v17に対応する。
- 保存済みv17は描画修正前の比較用。現行コードでの再生成は前の矢印の強調を消し、説明対象の線だけを滑らかに描くため、強調表示の見た目が異なる。完成MP4は置換せず、修正版の採用はユーザー評価後に判断する。
- `sample.json`は単体テストが読む構造fixtureとして維持する。旧版専用の録画・画像は共有せず、この台本からの動画再生成は対象外。
- `examples/tablecast-booking/project.json`は別ブランド・場面名の模式台本。別アプリの実収録の証拠ではない。
- UI変更試験は完成動画・アプリ差分・当時の台本・検証記録を共有する。原録画と再実行専用スクリプトは共有しないため、保存素材だけで試験動画を再生成することはできない。[試験結果](experiments/tablecast-mutation/BRIEF.md)を参照。
- 現行の共有範囲は[素材一覧](records/tablecast-current-share-inventory.json)。過去の `tablecast-share-inventory.json` と各検証記録は、縮小前の素材を含む実行時点の証拠として保持する。
- 失敗テイク・未参照の旧バイナリ・画面全文・作業ログはローカルで保持し、`.gitignore`で公開から除外する。新しい素材を採用するときは参照ファイルとignoreの許可一覧も更新する。

| 動画                 | 共有ファイル                                            | 台本                                                    |
| -------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| 商品紹介v14          | [MP4](assets/films/tablecast-product-v14.mp4)           | `projects/tablecast-main-rerecord.json` / product       |
| 技術紹介v17          | [MP4](assets/films/tablecast-technical-v17.mp4)         | 同上 / technical                                        |
| UI変更試験・商品紹介 | [MP4](assets/films/tablecast-mutation-product-v2.mp4)   | `experiments/tablecast-mutation/product.json` / product |
| UI変更試験・技術紹介 | [MP4](assets/films/tablecast-mutation-technical-v1.mp4) | 同上 / technical                                        |

完成動画は既存成果物からコピーしたもので、コード整理後の再生成物による置換ではない。見た目の評価状態は[引き継ぎ](HANDOFF.md)に従う。BGM・SEの出典と加工は[音源記録](assets/audio/README.md)、フォントのライセンスは`assets/fonts/LICENSE`、カーソル画像のMITライセンスは[OpenScreenのライセンス](assets/openscreen/tablecast-cursor-LICENSE)に含む。

ルートの `bun run build` はアプリのビルド。動画だけを生成する場合はpresentationで `bun run build:videos`、通常の制作・検査・MP4化には `bun run video` を使う。既定の台本は現行作例。

## Dev Containerで生成する

Linux amd64では[Dev Containerの導入手順](../../docs/setup.md#2a-dev-containerを使う)でFFmpeg/FFprobeとGoogle Chromeを用意してから、以下と同じ素材取得・build・検査を行う。Chromiumの導入だけでは動画検査に必要なChromeは入らない。再収録・OpenScreen編集はWindowsホストで行う。

## 新しいcheckoutで生成する

WindowsでBun 1.3.13、Node.js 24.7以降、Git LFS、Chrome、FFmpeg/FFprobeを用意する。依存はルートの`bun.lock`とworkspace manifestで固定する。OpenScreen 1.11は再収録・再編集時だけ必要。

リポジトリルートで実行し、各コマンドの成功を確認する。

```powershell
git lfs install --local
# 保存素材からの動画生成に必要なものだけ取得する（原録画・完成動画は含めない）。
git lfs pull --include="apps/presentation/assets/audio/**,apps/presentation/assets/demo/**,apps/presentation/assets/fonts/**,apps/presentation/assets/images/**" --exclude=
# fsckはpullの--exclude=を引き継がない。取得しなかった原録画・完成動画だけを除外する。
git -c lfs.fetchexclude="apps/presentation/assets/openscreen/**,apps/presentation/assets/films/**" lfs fsck
bun --no-env-file install --frozen-lockfile --ignore-scripts
bun run --cwd apps/presentation test
cd apps/presentation
bun run video --project projects/tablecast-main-rerecord.json --film product --name tablecast-restored-product-v1 --render
bun run video --project projects/tablecast-main-rerecord.json --film technical --name tablecast-restored-technical-v1 --render
```

`--name`には未使用名を指定する。`output/<name>/report.json`の`rendered-and-checked`と各工程の結果を確認する。これは配置・形式・音量・復号・Chrome全編再生の検査であり、見た目の承認とは別。MP4のバイト単位の一致や別OSでの録画は保証しない。

ルートの`.lfsconfig`で動画素材を既定の取得対象から除外する。通常のclone・pullではLFS pointerを保持し、アプリ開発者と単体テストのCIは動画素材を取得しない。ユーザー・ローカルGit設定の`lfs.fetchinclude/fetchexclude`があれば、そちらが優先される。

LFSの実体がない場合はMP4やWAVを利用できない。動画制作時は上記のように`--include`で範囲を選び、`--exclude=`で既定の除外も解除する。`--include`だけでは取得できない。完成品を見る場合は`git lfs pull --include="apps/presentation/assets/films/**" --exclude=`、採用原録画を含む全素材が必要なら`git lfs pull --include="apps/presentation/assets/**" --exclude=`を使う。取得範囲の指定は[Git LFSの標準機能](https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-pull.adoc)を使う。

`fsck`にも`lfs.fetchexclude`が適用される。上の検査は取得済みのaudio・demo・fonts・imagesを対象とし、未取得のopenscreen・filmsだけを除外する。単に`git lfs fsck`を実行すると、既定の除外によりpresentation素材を検査せず成功するので使わない。

`.gitattributes`はpresentation内で有効であり、ルートに重複定義する必要はない。共有前は全素材を取得し、通常の`git add`後に`git lfs ls-files`と`git -c lfs.fetchexclude= lfs fsck`で除外なしの整合性検査を行う。共有素材の実体は約342MB（326MiB）。転送量は重複するLFS objectと取得範囲により異なる。リモート転送前にリポジトリ所有者のLFS利用量を確認する。

現行の採用素材と完成例4本は、同じ版の確認・再生成に使うためGit LFSに保持する。制作途中のrunやPRごとの新しい書き出しは追加しない。PR単位の動画配布は[動画専用workflow](CI.md)のActions Artifactsで扱い、保存期限のある検証用成果物と採用版の保管を分ける。

`.openscreen`は小さいJSONとして通常Git管理し、改行変換を止めて差分を表示する。`bun run test`はGit管理対象のprojectと収録ログを読み、メディアの絶対参照と個人ディレクトリの再混入を検出する。LFS未取得のCIでも同じ検査を実行する。共有ポリシーの検証結果は[公開ポリシーの検証記録](records/tablecast-sharing-policy-validation.json)を参照する。

収録証跡JSONは原本のバイトを保持する。共有用の収録ログとOpenScreen projectは個人の保存先だけを置換し、時刻・イベント・編集設定を保持する。変更前原本はGit対象外のローカル保存先へ保全し、変更前後のハッシュは[パス整理の検証記録](records/tablecast-share-path-validation.json)へ残した。巨大な実測列はGitのテキスト差分へ展開しないが、通常のGit blobとして取得・閲覧できる。原配布ライセンスとアプリ差分patchの空白も保持する。これらの属性は自動変換と差分表示を制御するもので、手動編集を防ぐものではない。

## 再編集と再収録

共有projectの`media.screenVideoPath`はprojectファイルからの相対パス。同じフォルダーの素材はファイル名だけ、テイク直下のraw projectは`original/recording-….mp4`を参照する。現行4テイクの原録画とカーソル証跡を同梱する。通常のHyperFrames生成は編集済みMP4を使う。客側の編集スクリプトは`original/`を優先し、編集後projectへ現在の参照を書き込む。店員・管理者は同じテイク内の`tablecast-source.mp4`から編集する。

OpenScreen 1.11の[公式CLI手順](https://github.com/getopenscreen/openscreen/blob/v1.11.0/docs/cli.md)では、保存されたパスが見つからなければ同じフォルダーの同名素材を探す。任意の相対サブフォルダーをproject基準で解決する仕様とは異なるため、再編集ではprojectのあるフォルダーから標準の`pack`を実行し、現在の絶対パスを持つ作業用bundleを作る。`info`もカレントフォルダー基準なので同じ場所で実行する。

```powershell
# apps/presentationから。OpenScreenの配置が異なる場合は実際のexeを指定する。
$tablecastOpenScreen = Join-Path $env:LOCALAPPDATA 'Programs/Openscreen/Openscreen.exe'
$tablecastBundle = Join-Path (Get-Location) 'output/tablecast-edit-restored-v1'
Push-Location assets/openscreen/tablecast-main-rerecord-guest-v5
try {
  & $tablecastOpenScreen info tablecast-raw.openscreen --json | Out-Host
  if ($LASTEXITCODE -ne 0) { throw '原録画の参照が解決できません' }
  & $tablecastOpenScreen pack tablecast-raw.openscreen --out $tablecastBundle --json | Out-Host
  if ($LASTEXITCODE -ne 0) { throw '素材の再接続に失敗しました' }
} finally { Pop-Location }
```

編集済みprojectを復元する場合は`tablecast-raw.openscreen`を`tablecast-edit.openscreen`へ変更する。作成したbundle内のprojectをOpenScreenで開くか、`export <bundle内のproject> --out <新しいMP4> --json`で書き出す。bundle名・出力名は未使用のものにする。原録画のpackだけでは、別保存の実会話音声の同期やカーソル合成は行わない。それらをやり直す場合は既存の編集スクリプトを使う。

新しいテイクの共有前にも、原録画を`original/`へpackして同梱し、projectのメディア参照を上記の相対パスへ直す。ログのユーザーディレクトリやUNCのサーバー・共有名は`[USERPROFILE]`等の記号へ置換する。原本をGit対象外へ保全した上で変更前後のハッシュ・参照先の存在・復元結果を記録する。OpenScreenで保存・packすると絶対パスが再び入るため、再編集後の共有時にも確認する。

再編集は素材・編集projectを更新するので、保存版を維持する場合は作業用checkoutで行う。新規収録はWindowsのChrome実測配置1026×850とOpenScreenの標準インストール先に依存する。台本・操作adapterの更新方法は[ワークフロー](WORKFLOW.md)を参照する。

UI変更試験の35ファイル固定は試験時点の履歴。今回の基盤修正後のファイルを当時のハッシュと比較して、一致すると主張してはいけない。試験記録のcheckoutだけをリポジトリルート基準の`../tablecast-mutation-test`へ匿名化し、当時の結果・ハッシュは保持する。新しい検査は別の記録へ残す。
