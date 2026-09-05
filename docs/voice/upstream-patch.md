# 公式Inworldプラグインへの最小パッチ

[索引](../README.md)

## 決定

公式release・関連PRに必要な対応があれば無変更で使う。不足している間だけ公式pluginをforkし、最小差分のcommitへ依存を固定する。
patchは差分の形式、forkは配布元であり、どちらか一方を選ぶ話ではない。公式pluginのimport名と既定挙動を維持する。
WebSocket、認証、再接続、音声frame、リサンプリング、TTSを自作しない。site-packages書換え・非公開メソッドのmonkeypatch・moduleのshadowingは禁止する。

## 調査済み範囲と未確定事項

Inworld STT APIには実験的な話者ダイアライゼーションと単語時刻がある。確認したLiveKitのPython pluginは、それらを要求して話者・時刻として渡す処理を公開していない。[S01](../sources.md#s01) [S02](../sources.md#s02)
これは参照時点の観測であり、採用版の正確なcommitや互換性試験は未実施。着手時にreleaseと既存PRを再確認する。

## 許容する差分

| 項目         | 内容                                                                 |
| ------------ | -------------------------------------------------------------------- |
| 公開option   | diarizationと単語時刻をopt-inで要求する                              |
| request      | `enableSpeakerDiarization`、`includeWordTimestamps` を既存設定へ追加 |
| result       | 既存の公式STTイベントへspeakerと時刻を変換                           |
| capabilities | 実際に提供できる能力だけを宣言                                       |
| test/docs    | off互換性、欠損、複数話者、日英、再接続、制約                        |

TableCastの店舗、注文、キャスト設定をpluginへ混ぜない。名前は上流の既存慣例に合わせる。
`speaker == 0` と欠損を区別し、未帰属の単語を前の話者へ勝手に割り当てない。再接続で話者IDの有効範囲を分ける。
日本語の単語間へ無条件に空白を挿入しない。タイムスタンプの基準が変わる際はRMSの参照区間と合わせる。
認識結果の `alternatives` は認識候補であり、話者区間の配列ではない。上流の対応済みpluginとMultiSpeakerAdapterの契約を読んで変換する。
話者ごとに一つの発話のSTART/ENDを増やしたり、partialとfinalを重複発話として流したりしない。

## 管理と削除

`patches/livekit-inworld/` に上流URL、base SHA、fork SHA、対応core版、テスト結果、PR URL、削除条件を記録する。
uvのgit sourceはpluginのsubdirectoryと完全なcommit SHAに固定し、`livekit/uv.lock` を追跡する。branch名だけに依存しない。[S17](../sources.md#s17)
差分はforkから上流PRへそのまま出せる機能単位にし、`git format-patch` の差分を保存する。実在しないSHA・PRは記入しない。
公式releaseへ取り込まれたら回帰試験を行い、通常のrelease依存へ戻す。forkへの依存と同じpatchの二重適用をしない。
本ZIPはpatch方針のみで、適用済みpatchや作成済みPRを含まない。

## 必須検証

既定設定の入出力互換、speaker 0、欠損・不正時刻、交互二話者、日英の接合、partial再送、空final、取消、接続再開、エラーをfixtureで検査する。
LiveKitとの結合試験で、話者区間、ターン終了、RMS時刻、割り込みが破綻しないことを確認する。最後に日英の実音声で精度を別に測定する。
単語・話者の統合が成功しても、重複発話の完全分離や注文者の本人確認を保証したとは扱わない。
