# 動画基盤の共有と復元

Issue #1のドラフトPR向けに、生成コード・台本・採用素材・原録画・編集project・撮影証跡を共有する。通常の再生成は保存済みの音声と映像を使い、アプリ起動・認証・有料TTSを必要としない。

## 共有するもの

- 現行作例は`projects/tablecast-main-rerecord.json`。mainの`7d6adc7`に追従して再収録した商品紹介v14・技術紹介v17に対応する。
- `sample.json`は以前の商品紹介v13・技術紹介v16の再生成と回帰検査用に維持する。
- `examples/tablecast-booking/project.json`は別ブランド・場面名の模式台本。別アプリの実収録の証拠ではない。
- `experiments/tablecast-mutation/product.json`はUI変更試験の修正済み入力。技術紹介の参照元は隣の`tablecast-mutation-test`なので、再生成時には[試験の再現手順](experiments/tablecast-mutation/BRIEF.md)に従い独立cloneとアプリ差分を用意する。
- [共有素材一覧](records/tablecast-share-inventory.json)に入力台本・採用テイク・完成動画のハッシュを記録する。採用テイク10件は原録画も含めて保存する。
- 失敗テイク・未参照の旧バイナリ・画面全文・作業ログはローカルで保持し、`.gitignore`で公開から除外する。新しい素材を採用するときは参照ファイルとignoreの許可一覧も更新する。

| 動画                 | 共有ファイル                                            | 台本                                                    |
| -------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| 商品紹介v14          | [MP4](assets/films/tablecast-product-v14.mp4)           | `projects/tablecast-main-rerecord.json` / product       |
| 技術紹介v17          | [MP4](assets/films/tablecast-technical-v17.mp4)         | 同上 / technical                                        |
| UI変更試験・商品紹介 | [MP4](assets/films/tablecast-mutation-product-v2.mp4)   | `experiments/tablecast-mutation/product.json` / product |
| UI変更試験・技術紹介 | [MP4](assets/films/tablecast-mutation-technical-v1.mp4) | 同上 / technical                                        |

完成動画は既存成果物からコピーしたもので、コード整理後の再生成物による置換ではない。見た目の評価状態は[引き継ぎ](HANDOFF.md)に従う。BGM・SEの出典と加工は[音源記録](assets/audio/README.md)、フォントのライセンスは`assets/fonts/LICENSE`に含む。

## 新しいcheckoutで生成する

WindowsでBun 1.3.13、Node.js 24.7以降、Git LFS、Chrome、FFmpeg/FFprobeを用意する。依存はルートの`bun.lock`とworkspace manifestで固定する。OpenScreen 1.11は再収録・再編集時だけ必要。

リポジトリルートで実行し、各コマンドの成功を確認する。

```powershell
git lfs install --local
# 保存素材からの動画生成に必要なものだけ取得する（原録画・完成動画は含めない）。
git lfs pull --include="apps/presentation/assets/audio/**,apps/presentation/assets/demo/**,apps/presentation/assets/fonts/**,apps/presentation/assets/images/**" --exclude=
git lfs fsck
bun --no-env-file install --frozen-lockfile --ignore-scripts
bun run --cwd apps/presentation test
cd apps/presentation
bun run video --project projects/tablecast-main-rerecord.json --film product --name tablecast-restored-product-v1 --render
bun run video --project projects/tablecast-main-rerecord.json --film technical --name tablecast-restored-technical-v1 --render
```

`--name`には未使用名を指定する。`output/<name>/report.json`の`rendered-and-checked`と各工程の結果を確認する。これは配置・形式・音量・復号・Chrome全編再生の検査であり、見た目の承認とは別。MP4のバイト単位の一致や別OSでの録画は保証しない。

ルートの`.lfsconfig`で動画素材を既定の取得対象から除外する。通常のclone・pullではLFS pointerを保持し、アプリ開発者と単体テストのCIは動画素材を取得しない。ユーザー・ローカルGit設定の`lfs.fetchinclude/fetchexclude`があれば、そちらが優先される。

LFSの実体がない場合はMP4やWAVを利用できない。動画制作時は上記のように`--include`で範囲を選び、`--exclude=`で既定の除外も解除する。`--include`だけでは取得できない。完成品を見る場合は`git lfs pull --include="apps/presentation/assets/films/**" --exclude=`、採用原録画を含む全素材が必要なら`git lfs pull --include="apps/presentation/assets/**" --exclude=`を使う。取得範囲の指定は[Git LFSの標準機能](https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-pull.adoc)を使う。

`.gitattributes`はpresentation内で有効であり、ルートに重複定義する必要はない。新素材は通常の`git add`後に`git lfs ls-files`と`git lfs fsck`で確認する。全素材のローカル配置は約914MB。転送量は重複するLFS objectと取得範囲により異なる。リモート転送前にリポジトリ所有者のLFS利用量を確認する。

`.openscreen`は小さいJSONとして通常Git管理し、改行変換を止めて差分を表示する。`bun run test`はGit管理対象のprojectと収録ログを読み、メディアの絶対参照と個人ディレクトリの再混入を検出する。LFS未取得のCIでも同じ検査を実行する。共有ポリシーの検証結果は[公開ポリシーの検証記録](records/tablecast-sharing-policy-validation.json)を参照する。

収録証跡JSONは原本のバイトを保持する。共有用の収録ログとOpenScreen projectは個人の保存先だけを置換し、時刻・イベント・編集設定を保持する。変更前原本はGit対象外のローカル保存先へ保全し、変更前後のハッシュは[パス整理の検証記録](records/tablecast-share-path-validation.json)へ残した。巨大な実測列はGitのテキスト差分へ展開しないが、通常のGit blobとして取得・閲覧できる。原配布ライセンスとアプリ差分patchの空白も保持する。これらの属性は自動変換と差分表示を制御するもので、手動編集を防ぐものではない。

## 再編集と再収録

共有projectの`media.screenVideoPath`はprojectファイルからの相対パス。同じフォルダーの素材はファイル名だけ、テイク直下のraw projectは`original/recording-….mp4`を参照する。採用10テイクの原録画とカーソル証跡を同梱する。通常のHyperFrames生成は編集済みMP4を使う。客側の編集スクリプトは`original/`を優先し、編集後projectへ現在の参照を書き込む。店員・管理者は同じテイク内の`tablecast-source.mp4`から編集する。

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

新しいテイクの共有前にも、原録画を`original/`へpackして同梱し、projectのメディア参照を上記の相対パスへ直す。ログのユーザーディレクトリは`[USERPROFILE]`等の記号へ置換する。原本をGit対象外へ保全した上で変更前後のハッシュ・参照先の存在・復元結果を記録する。OpenScreenで保存・packすると絶対パスが再び入るため、再編集後の共有時にも確認する。

再編集は素材・編集projectを更新するので、保存版を維持する場合は作業用checkoutで行う。新規収録はWindowsのChrome実測配置1026×850とOpenScreenの標準インストール先に依存する。台本・操作adapterの更新方法は[ワークフロー](WORKFLOW.md)を参照する。

UI変更試験の35ファイル固定は試験時点の履歴。今回の基盤修正後のファイルを当時のハッシュと比較して、一致すると主張してはいけない。試験記録のcheckoutだけをリポジトリルート基準の`../tablecast-mutation-test`へ匿名化し、当時の結果・ハッシュは保持する。新しい検査は別の記録へ残す。
