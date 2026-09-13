# 説明する情報から撮影する

現行作例はmain追従の商品紹介v14・技術紹介v17。採用済み収録と完成MP4は[共有と復元](SHARING.md)、再収録の結果は[検証記録](records/tablecast-rerecord-validation.json)を参照する。下記のv13の実行記録は更新前の経過であり、現在の残件ではない。

Issue #1の動画生成基盤として、操作の完了ではなく「見せたい情報が撮れたこと」を編集の前提にする。撮影対象の正本は `capture-plan.json`。端末と話者、発話、採用済み素材は `projects/tablecast-main-rerecord.json`。

## 撮影定義

各場面に意図 `intent`、必要なアプリ状態 `state`、画面を開く `steps`、対象 `subject`、保持秒数 `hold` を指定する。CSSセレクターは画面の意味のある要素を選び、`required` は必要な表示内容を正規表現で指定する。固定座標を撮影定義へ書かない。

| 場面                | 撮る情報・状態                                           |
| ------------------- | -------------------------------------------------------- |
| consult-answer      | 相談への商品の味・香りの回答                             |
| order-added         | 注文かごの商品、冷酒、90ml、数量1、780円                 |
| pause               | 音声停止中も残る商品と金額                               |
| readback / approval | 内容確認カードと、読み上げ完了状態                       |
| approval-result     | 注文成立・かごが空になったことを確認してから開く注文履歴 |
| staff               | 受け付けた商品の容量・金額                               |
| admin               | 容量の選択肢と追加料金の表のセル                         |

必要な状態を待ち、画面操作、対象のスクロール、文字と矩形の600ms安定確認、保持時間の検査の順に行う。対象の欠け、必要文言の消失、保持中の移動は失敗。スクロール領域に隠れた要素はDOMに存在しても成立としない。複数セルを一つの情報のまとまりとして測れる。

`tablecast-shot-場面.json` には定義のハッシュ、実測矩形、表示開始・終了の絶対時刻、実際の文字列を保存し、PNGも残す。`tablecast-events.json` の録画開始時刻から素材内の時刻へ変換する。これは機械的な撮影条件の検査であり、デザインや説明の良し悪しの承認ではない。

## 撮影と編集

1. `capture-plan.json` の意図・対象・表示条件を更新する。
2. 認証済みの合成来店で `node scripts/tablecast-record-guest.ts 新しい保存名`、店舗側は `node scripts/tablecast-record-role.ts admin 新しい保存名` または `staff` を実行する。認証・有料音声の扱いは [WORKFLOW.md](WORKFLOW.md) に従う。店員収録では `TABLECAST_GUEST_CAPTURE_EVENTS` に今回成功した客側テイクの `tablecast-events.json` を必ず指定する。パスはリポジトリルート基準または絶対パスとし、WORKFLOWのコマンド例で引き渡す。
3. 成功した録画だけに `tablecast-take.json` を作る。失敗理由は `tablecast-rejected.json`。保存先は毎回新規作成し、失敗した録画を採用済み台本へ書き込まない。録画時間の上限は客300秒、店舗30秒。Windowsでstdin停止が効かない場合にも上限で保存が終了する。上限までの余白を完成動画へ足すものではない。
4. 店舗側は実測開始の1.8秒前から全体表示を確保し、対象が安定してから寄り、保持終了後に引く。ズーム対象とタイミングは `bindShotZoom` で実測から設定し、OpenScreenで書き出した後に採用する。
5. 客側は実際の応答・音声に合わせた切り出しと字幕が必要。収録時に保存する `tablecast-capture-plan.json` を編集用台本の出発点にし、各 `media.file/project/shot` を新しい保存先へ、`offset/duration` と `cues` をそのテイクの実音声へ合わせる。旧テイクの発話や秒数は流用しない。`TABLECAST_PRESENTATION_PROJECT` でこの台本を指定し `node scripts/tablecast-edit-guest.ts` を実行すると、撮影証跡からズームを配置する。必要な保持区間・引きが切り出しに入らない場合は再編集を要求する。音声の意味に沿ったカットと字幕の決定は自動化していない。
6. `build` でも採用可能なテイク、撮影定義の一致、表示時間、実測位置・時刻と編集の一致を検査する。撮影条件を変更したのに古い素材を新定義として採用することはできない。`capture-plan.json` の変更だけでは旧完成版を壊さず、再撮影成功後に `projects/tablecast-main-rerecord.json` の `capture` と素材を更新する。

ズームは [ZOOM.md](ZOOM.md) の倍率・余白・動きの規則を引き続き使う。対象全体が最小倍率にも収まらない場合は、撮影する情報を分割する。無理な倍率や固定座標で補正しない。

## v13制作時の実行記録（2026-09-13・履歴）

管理画面は `tablecast-macbook-admin-v12b` で実収録・実測・OpenScreen書き出しまで成功。`output/tablecast-v12-capture-admin.mp4` はその場面の試写。

客側の再撮影では、最初は承認結果より先に履歴を開いてしまう撮影順の問題、その後は空の音声入力と `VOICE_INTERNAL_ERROR` を検出した。履歴を開く条件と音声中の操作順を修正し、失敗したテイクは不採用。この時点では注文成立までの新しい客側一式は未完成で、商品紹介v13には成功済みの客・店員素材と再撮影した管理画面を組み込んだ。現行版の保存先・残件は [HANDOFF.md](HANDOFF.md) を参照する。
