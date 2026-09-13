# main更新への追従検証（2026-09-13）

Issue #1の動画基盤を、保存素材の再合成と最新アプリの実収録の両方で確認する。ユーザー指示により`git pull --ff-only origin main`を実行し、`17dc3328960e653006854b6edc8d829e4063f80e`から`7d6adc7f9aa813ecdb0f3e5b5248c4ca85c8c919`へ74コミット進めた。

## 取り込みと保全

tracked変更をstashへ保存し、fast-forward後にapply。AGENTS・Compose・bun.lockの競合は最新mainの構成を基準に解消した。動画用node_modules volume、ローカル撮影用RoomService経路、コンテナ内の自己ホスト名解決、動画文書への入口を維持した。依存は通常の`bun --no-env-file install`で再解決し、コンテナでは`--frozen-lockfile`が通過した。

未commitの`apps/presentation`と既存の復旧文書は維持。stash `9c43906fff9ad03c1cadb5b5aa17892e18235377`は保全用に残した。競合マーカー・unmerged状態なし。commit・pushは未実施。

既存コンテナ`tablecast-tablecast-1`が当該checkoutをmountし、アプリが停止中であることを確認した。起動前にローカルDB状態と生成設定をコンテナ内`/tmp/tablecast-before-main-7d6adc7`へ保存。最新`bun run dev:container`がmigration 0012・0013と既存デモのseedを適用した。別worktreeやDocker全体は操作していない。

## 追従で変更したもの

- 技術説明の参照先`apps/api/src/modules/operations.ts`が削除されていた。最初の共通runは入力参照検査で失敗し、失敗記録を`output/tablecast-after-pull-preflight-v1/report.json`へ保存した。
- 最新の`orders/service.ts`と`tables/mutations.ts`へ参照・注記を更新。音声承認条件と確認失効のコード、注文APIテストの行を読み直し、[主張の根拠](claims.json)を更新した。
- 注文APIテスト25件は最新のローカルWorkers/D1で再実行し通過。[対象版と実行結果](records/tablecast-main-7d6adc7.json)を保存した。既存ナレーションの25件という説明と整合する。
- 技術紹介の実画面は旧素材の利用を注記した。商品紹介の正本・既存完成MP4・デザイン・共通描画コードは維持した。

## 最新アプリの実収録

最新Web/APIを起動し、保存済みの合成店舗の認証で管理画面へ接続。実サーバーのログは`releaseSha: 7d6adc7f9aa813ecdb0f3e5b5248c4ca85c8c919-dirty`を示した。商品詳細を開き、日本酒の容量・追加料金を表示するadmin場面を既存の録画スクリプトで撮影した。

```powershell
# apps/presentation。台本はsample.jsonのコピーに同じTableCastブランドを明示したもの。
$env:TABLECAST_PRESENTATION_PROJECT = 'output/tablecast-main-capture-project.json'
$env:TABLECAST_PRESENTATION_CAPTURE_PLAN = 'capture-plan.json'
node scripts/tablecast-record-role.ts admin tablecast-main-7d6adc7-admin-v1
```

再実行は新しいテイク名を使用する。撮影結果は[撮影証跡](assets/openscreen/tablecast-main-7d6adc7-admin-v1/tablecast-shot-admin.json)、同フォルダのevents・take・OpenScreen project・portable素材に保存した。OpenScreenで実測カーソルとズームを編集・書き出し。撮影条件・アプリ操作・共通処理の修正は不要だった。

容量4行、60ml・90ml・160円の表示と約5秒の保持を確認した。対象矩形は旧版と同じ位置・寸法だったため、この検証で位置変更への追従まで実証したとは扱わない。新しいメニュー構成を含む現行管理画面の再収録が成立したことを示す。

UI確認の初回は`networkidle`待ちがtimeoutした。開発時の通信全体の停止を待つ方法をやめ、DOMContentLoadedと実際の操作対象・撮影条件で確認した。旧コンテナにはLGTMサービスがなく、テレメトリ送信のDNS警告が出た。画面・API・収録は成功したが、現行Composeの新規構築や観測基盤の受入を完了した記録ではない。

## 検証範囲

最新依存で動画workspaceのlint・typecheck・単体43件が通過。正本2本のbuild後、ブラウザー19件が通過。Compose設定も`docker compose ... config --quiet`で検査した。

技術紹介は共通入口で63.1秒のMP4を生成。配置6件、HyperFramesの配置100時点・文字コントラスト177件、復号、音量、完成フレーム37時点、Chromeの音声あり等速全区間0〜63.1秒再生が通過した。冒頭と更新した根拠注記の完成フレームを目視した。

- [技術紹介の検証用全編](output/tablecast-main-7d6adc7-technical-v1/video.mp4)
- [技術紹介の実行記録](output/tablecast-main-7d6adc7-technical-v1/report.json)

商品紹介の検証用台本はadmin場面だけを新規素材へ差し替え、その他は既存録画を利用する。111.1秒のMP4生成、配置6件、198時点・文字コントラスト59件、復号、音量、完成フレーム42時点、Chromeの音声あり等速全区間0〜111.1秒再生が通過した。完成フレームで管理画面の対象とズーム・字幕を確認した。音量は平均−19.5dB、最大−1.1dB。全場面を最新アプリで撮り直した動画ではない。

- [商品紹介の検証用全編](output/tablecast-main-7d6adc7-product-v1/video.mp4)
- [商品紹介の実行記録](output/tablecast-main-7d6adc7-product-v1/report.json)

撮影ツールが出力したJSONの整形はMP4検査の後に行った。整形前のバイト列は`output/tablecast-main-before-format.json`へ保存し、JSONの内容が不変であることと、整形後の再build・配置／遷移検査の通過を確認した。生成HTML・timing・CSS・VTTもバイト単位で一致した。今後は撮影後・生成run前に整形する手順とした。MP4 runの入力hashを、整形後のhashで書き換えていない。

[生成・再生・正本保全の要約記録](records/tablecast-main-video-validation.json)に完成MP4のhashと実行結果を保存した。整形後の入力hashは`output/tablecast-main-7d6adc7-product-formatted-v1/report.json`にある。動画workspaceの最終format検査も通過した。

検証のために起動したTurboと当該子プロセスを停止し、コンテナ内にdevプロセスが残っていないことを確認した。既存コンテナ自体・volume・バックアップは維持した。

これらは今回のmain更新で工程が動いたという証拠である。第二の実在アプリの全行程、最新の客側音声注文・店員場面の再収録、実iPad・騒音環境、別PCでの復元、ユーザーによるデザイン採否は未確認。自動検査の成功を同品質の一般保証やIssue #1全体の完了に読み替えない。
