# 共通ワークフローの実装・検証記録

2026-09-13。対象は`apps/presentation`の作業ツリー。アプリHEAD：`17dc3328960e653006854b6edc8d829e4063f80e`。presentationは未commit。Windows、Node 25.0.0、Bun 1.3.13、既存のChrome／FFmpeg／HyperFramesを使用。

## 今回整えたもの

- WORKFLOW.mdとBRIEF-TEMPLATE.md：実装変更の確認、題材の目的・根拠、撮影、編集、音声・図、生成、完成品レビューまでの入口。
- `tablecast-project.ts`／`tablecast-build.ts`：ブランド・表示名の入力、台本と同じ場所からの撮影定義読み込み。従来のsample.jsonはそのまま使える。
- `tablecast-shot.ts`／`tablecast-app-capture.ts`：対象の実測とTableCastの業務状態待ちを分離。状態待ちがないのに撮影成立にはしない。TableCastの収録origin・店舗IDを指定可能にした。
- `tablecast-video.ts`：指定台本・filmを未使用名へbuild、対象出力の配置検査、HyperFrames検査、任意でMP4出力・復号・音量・完成フレーム・等速全編再生。入力のハッシュと実結果を記録し、途中失敗を成功にしない。有料TTSや実アプリ操作はこのコマンドに含めない。
- Playwright：共通検査は対象出力とtimingを参照し、TableCast固有の内容検査を保持。検証件数を実際のJSONレポートから取得する。

## 実行結果

| 検証                              | 結果                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| workspace format／lint／typecheck | 通過。format対象118ファイル                                                                                                                             |
| 単体                              | 8ファイル・43件通過                                                                                                                                     |
| 通常ブラウザー検査                | 19件通過。注文成立待ちを維持し、別業務の状態待ち・UI移動後の再実測を追加                                                                                |
| 商品紹介の共通コマンド            | `tablecast-product-workflow-v1`、111.1秒、配置10件・HyperFrames検査通過。MP4再出力は不要として未実施                                                    |
| 技術紹介の共通コマンド            | `tablecast-technical-workflow-v2`、63.1秒、配置6件・HyperFrames検査・H.264/AAC出力・全編復号・音量検査・37フレーム抽出・音声あり等速0〜63.1秒再生を完了 |
| 別ブランドの模式台本              | `tablecast-booking-workflow-v2`、12秒、配置6件・HyperFrames検査・MP4出力・全編復号・7フレーム抽出・等速0〜12秒再生を完了。音声なし                      |
| 出力保全                          | 使用済みrun名への再実行を拒否し、既存report・動画を上書きしなかった                                                                                     |
| 欠けた音声                        | `tablecast-missing-audio-check-v1` は生成前にexit 1、reportはfailed、成功工程0。TTSは呼ばない                                                           |
| 既存作品との互換性                | 2本のindex.html・timing.json・captions.vttが既存distと一致                                                                                              |
| 正本の保全                        | sample.json・styles.css・両timing・両通常名MP4のSHA-256が監査前と一致                                                                                   |

技術編の再出力ピークは−1.2 dB、MP4 SHA-256は`578c344e84aa22f8e35d7476b9e3ac81f657e8e2144f446f460c4101675a873d`。これは共通コマンドの動作検証用出力で、v16の通常名は置き換えていない。

別ブランド入力ではヘッダーとHTMLタイトルがBookFlowへ変わり、TableCastのヘッダーが残らないことを確認した。検証用模式図の完成MP4から抽出したフレーム：

![別ブランド入力を共通基盤で生成した模式図](output/tablecast-booking-workflow-v2/frames/3.png)

個別の実結果は各`output/<run>/report.json`、工程ログ、`layout.json`にある。互換性比較は`output/tablecast-workflow-comparison.json`。outputはignore対象なので、今回の要点を本書に保存した。

## 完了の範囲

制作工程の入口、題材と共通処理の境界、生成から検査までの実行コマンドを整備した。既存の品質を支える構成・編集・音声・図の判断は制作メモに残し、共通ツールへ引き渡す。任意のアプリをJSONだけで自動操作する仕組みにはしていない。

第二の実在アプリをOpenScreenで収録して完成させる試験、新しい客側音声注文の全工程再収録、別PC／新規checkoutからの復元、LFS uploadは今回未実施。模式台本とテスト用DOMの成功をそれらの代わりにしない。技術編のrenderログにはHyperFramesによる追加フォントのキャッシュ利用もあり、別環境・オフラインでの同一結果は未検証。Issue全体の完了・動画のデザイン採用とは分けて扱う。
