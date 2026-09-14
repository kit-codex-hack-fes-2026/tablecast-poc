# PRのデモ動画

Issue #139の[動画専用workflow](../../.github/workflows/tablecast-demo-videos.yml)は、同一リポジトリのPR作成・追加push・再オープンで実行する。Draftも対象。PRのhead SHAをcheckoutし、既定の`projects/tablecast-main-rerecord.json`から商品紹介と技術紹介の全編MP4を別々に生成する。

## 対象と実行環境

- runnerは`ubuntu-24.04`のx64。Node.js 24.7.0、Bun 1.3.13、lock固定のHyperFrames・Playwrightを使用する。FFmpegはAPT、Google ChromeはPlaywrightの`install --with-deps chrome`で導入し、実際の版を`tools.log`へ残す。`HYPERFRAMES_BROWSER_PATH=/usr/bin/google-chrome`で同じChromeを描画にも使う。H.264/AACの再生検査が必要なので、Chromium headless shellだけでは代用しない。
- 実行上限は1ジョブ30分、Artifactsは7日保存。同じPRへの追加pushは古い動画workflowをキャンセルする。動画ごとに検査成功直後に保存し、後続の生成がタイムアウトしても保存済みの動画は取得できる。商品紹介の生成・保存が失敗しても技術紹介の生成と診断保存を試み、失敗したジョブを成功扱いにしない。
- 通常のアプリCIは変更しない。動画workflowだけがcheckout内でGit LFSを初期化し、`audio`・`demo`・`fonts`・`images`を明示取得する。原録画の`openscreen`と既存完成品の`films`は取得しない。通常Git管理の編集project・撮影証跡はcheckoutに含まれる。
- 秘密値・アプリ起動・有料TTS・LLM・OpenScreenを必要としない。既存の`bun run video ... --render`を利用し、保存音声がない場合は失敗する。音声を自動生成するfallbackはない。
- **変更後アプリの再収録は行わず、アプリだけを変えても保存録画は更新されない。** 台本・素材の鮮度は[制作手順](WORKFLOW.md)に従って確認する。この制約を毎回のActionsサマリーにも表示する。
- 技術紹介は収録版`7d6adc7`の旧構成・当時のテスト結果を説明する。削除済みコードを現行実装の根拠へ置き換えず、[収録版の出典](records/tablecast-technical-source-evidence.md)を入力として保持する。各章の注記とActionsサマリーに旧構成であることを明示する。図とナレーションの最新化は別の制作工程とする。
- fork PRはジョブをskipし、LFSや動画生成を実行しない。必要なら管理者がコードと素材を確認し、同一リポジトリの作業ブランチへ取り込んだPRで実行する。`pull_request_target`でforkのコードを実行する経路は設けない。
- 動画ジョブをマージ必須チェックにする設定は含めない。

## 取得・再実行

1. PRのChecksから`TableCast Demo Videos`を開く。Actionsの実行サマリーに動画別の生成・検査結果と保存結果、Artifactへのリンクが表示される。生成が成功しても保存に失敗した場合は取得できないため、保存結果も確認する。ダウンロードにはリポジトリへの閲覧権限とGitHubへのログインが必要。
2. `tablecast-pr-<PR番号>-<head SHA>-<run ID>-<attempt>-product`または`-technical`をダウンロードして展開する。`video.mp4`が全編、`player.html`がローカル再生用。`report.json`の`applicationRevision`が対象SHAと一致し、`status`が`rendered-and-checked`であることを確認する。
3. `report.json`には入力ハッシュ、配置検査、映像・音声形式、全編復号、音量、等速再生の結果を記録する。工程ログ、配置テストJSON、完成フレームも同梱する。字幕は映像に合成される。機械検査の通過は内容・デザイン・聞きやすさの人による承認ではない。
4. 同じSHAを再確認するときはActionsの`Re-run all jobs`を使う。attemptが変わるため以前のArtifactを上書きしない。新しいコードを確認するときはPRブランチへpushする。再実行可能期間を過ぎた場合も新しいpushで生成する。

CLIは`gh run list --workflow tablecast-demo-videos.yml --branch <PRブランチ>`で実行IDを調べ、`gh run download <run ID> --name <Artifact名> --dir <保存先>`、再実行は`gh run rerun <run ID>`を使う。別PR・別SHA・別attemptの結果を混ぜず、生成記録と照合する。

## 失敗と素材不足

失敗・キャンセル時も`-diagnostics`へLFS取得ログ、生成コマンドのログ・検査JSON・配置失敗画像と`ci/metrics.json`を保存する。キャンセルやrunner強制終了では後処理が完了せず、Artifactが残らない場合がある。その場合はActionsのステップログを確認する。MP4のArtifactは、その動画の全検査を通過した場合だけ保存する。

LFSエラーは`ci/lfs-pull.log`と`ci/lfs-fsck.log`、音声・画像・台本エラーは`ci/product.log`・`ci/technical.log`と動画別の`report.json`を確認する。台本が壊れてreport作成前に止まっても外側のログが残る。取得範囲の中なら、欠けた実体をLFSへpushし、台本の参照と保存音声を揃えて再実行する。新しい素材ディレクトリを導入するときは取得範囲も明示的に更新する。新規音声生成や再収録は[WORKFLOW.md](WORKFLOW.md)の別工程で行う。

ローカルでは[SHARING.md](SHARING.md)の固定依存・LFS取得手順の後に、未使用名で次を実行する。Windowsの保存素材からの生成も同じ入口を使う。Linuxでは上記の`HYPERFRAMES_BROWSER_PATH`を設定する。検証したSHA・環境・結果・実測値は対応PRへ記録する。

```sh
cd apps/presentation
bun run test
bun run video --project projects/tablecast-main-rerecord.json --film product --name tablecast-pr-local-product-v1 --render
bun run video --project projects/tablecast-main-rerecord.json --film technical --name tablecast-pr-local-technical-v1 --render
```

## 時間・転送量・容量

`ci/metrics.json`はcheckoutしたSHA、動画別の終了状態、素材取得前から診断保存前までの秒数、新規LFSオブジェクトのバイト数、動画別出力ディレクトリの圧縮前バイト数を保存する。サマリーにも同じ値を表示する。LFSキャッシュを復元しない新規runnerなので、オブジェクト増分を取得ペイロード量として測る。通信ヘッダー・再送・課金上の転送量は含まず、厳密な利用額はGitHubの請求画面で確認する。

全ジョブ時間はActionsのジョブ表示、実際の保存容量は各Artifactのsize（ZIP圧縮後）で確認する。APIで記録する場合は`gh api repos/kit-codex-hack-fes-2026/tablecast-poc/actions/runs/<run ID>/jobs`の`started_at`・`completed_at`、`gh api repos/kit-codex-hack-fes-2026/tablecast-poc/actions/runs/<run ID>/artifacts`の`size_in_bytes`・`expires_at`を使う。初回の実行IDと値を対応PRへ追記する。保存容量には成功した2本と診断Artifactを合計する。

イベントの仕様は[GitHub Actions公式資料](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)、保存形式・期間・URLは[採用版upload-artifact](https://github.com/actions/upload-artifact/tree/ea165f8d65b6e75b540449e92b4886f43607fa02)、Chrome導入は[Playwright公式資料](https://playwright.dev/docs/browsers#google-chrome--microsoft-edge)に従う。
