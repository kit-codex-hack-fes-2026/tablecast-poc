# PRの実アプリのデモ動画

Issue #139の[専用workflow](../../.github/workflows/tablecast-demo-videos.yml)は、同一リポジトリのPR作成・追加push・再オープンで実行する。Draftも対象。PRのheadからWeb・APIを新しくビルドし、隔離D1に合成店舗を用意して実際のGUI操作を録画する。

## 収録範囲

- 客向け：今回のアプリのおしながき、商品詳細、注文確認、明示承認による注文確定、会計依頼。
- 店側：客側で確定した同じ注文の確認、受付、提供、会計登録。実DBで注文内容・残額を検査する。
- 音声接客は無効で動画は無音。保存済みのデモ録画・ナレーション・旧構成の技術紹介は使用しない。有料モデル・TTS、外部の実決済も呼ばない。
- 固定シナリオ外の変更を自動で発見・撮影する機能ではない。変更した画面がこの経路に含まれないときは、同じPRで[撮影シナリオ](capture/tablecast-pr.spec.ts)を更新する。全画面・全言語・実音声の保証は既存の各テストへ分担する。
- 商品紹介・技術紹介の編集済み作品はIssue #1の別の制作物として維持する。PRの変更確認は今回の実録で行い、旧作品の再出力を代用しない。

## 実装と実行環境

`apps/web/e2e/support`の既存の起動・migration・seed・認証・終了処理を再利用する。業務APIのmockや録画の差し替えは行わない。認証・端末登録は録画前に済ませ、認証stateをファイルへ保存せずにブラウザーcontext間で引き継ぐ。traceは無効とする。

収録にはPlaywright標準の`recordVideo`、MP4変換と全編復号にはFFmpegを使用する。Chromeで先頭から末尾まで等速再生し、対象アプリの`/api/health`のSHAを照合する。成功時だけ完成Artifactを保存し、途中失敗を以前の動画で埋めない。

Ubuntu 24.04、Node.js 24.7.0、Bun 1.3.13、lock固定のPlaywrightを使用する。Chromeは`playwright install --with-deps chrome`、FFmpegはAPT、Mailpitは既存fixtureの固定Dockerイメージ。通常CIと動画CIのどちらもLFSを取得しない。専用jobの上限は20分、Artifactは7日保存。同じPRの旧実行はキャンセルするが、すでに保存された成果物は期限まで残る。

## 取得と再収録

1. PRのChecksから`TableCast Demo Videos`の実行サマリーを開く。生成・検査と保存の両方が成功したことを確認する。
2. `tablecast-pr-<PR番号>-<head SHA>-<run ID>-<attempt>-demo`をダウンロードして展開する。GitHubへのログインとrepositoryの閲覧権限が必要。
3. `customer/video.mp4`と`staff/video.mp4`が今回の実録。`report.json`には対象SHA・配信SHA・ローカルでの未commitアプリ差分・操作時刻・動画ハッシュ・尺が入る。`sourceSha`と`servedSha`がPRのheadと一致し、`dirtyApplicationFiles`が空、`status`が`recorded-and-checked`であることを確認する。確認用の画面画像も同梱する。
4. 同じSHAで再収録するならActionsの`Re-run all jobs`。コード変更後はPRへpushする。異なるrun・attemptは上書きしない。

失敗時は`-diagnostics`のPlaywright結果・起動ログを確認する。画面・ラベル・業務フローが変わった場合は撮影シナリオを修正し、再実行する。runner強制終了では後処理を完了できないためActionsのステップログも参照する。fork PRはskipする。

CLIでは`gh run download <run ID> --dir <保存先>`で取得し、`gh run rerun <run ID>`で再収録できる。

## ローカル実行と検証

LinuxまたはmacOSのDockerを利用できる環境で、rootの固定依存とcodegenを準備し、Chrome・FFmpegを導入して実行する。WindowsはDockerホストと同じネットワークを利用する専用Linux環境で検証する。既存fixtureがMailpitへloopback接続するため、Docker socketだけを共有するbridge接続のコンテナでは動かない。

```sh
bun --no-env-file run codegen
bunx --no-install playwright install --with-deps chrome
bun run --cwd apps/presentation tablecast:pr-demo
```

出力は`apps/presentation/output/tablecast-pr-capture/`、結果JSONは`output/tablecast-pr-capture-results.json`。Playwright標準の出力ディレクトリなので再実行前に必要な前回結果を退避する。起動とDBは毎回新規で、既存worktreeの開発サーバーやDBは利用しない。終了処理は当該試験の資源だけを破棄する。

検証では実アプリの画面変更が録画にも反映されること、対象SHA、実DBでの操作結果、全編復号・再生、失敗時に完成Artifactを出さないことを確認する。機械検査は人による見た目の承認ではない。

## 時間と容量

LFS転送は0。実行時間はActionsのjob、保存容量はArtifact APIの`size_in_bytes`、期限は`expires_at`で確認する。APIは`gh api repos/kit-codex-hack-fes-2026/tablecast-poc/actions/runs/<run ID>/artifacts`。実測値と対象SHAはPRへ記録する。

保存済み素材を再編集していた旧実装の約69.8 MB/回という値は、新しい実録の容量として扱わない。収録尺・画面内容で容量は変わる。7日間に完了した各runの容量が合計され、最新の1件だけを残す仕組みではない。
