# 音声素材・v8の採用記録

通常のbuild・renderはこのディレクトリの保存済み音声を使う。v8ではTTSを追加生成していない。日付は2026-09-12。

## フリー素材

| 用途・ファイル                             | 作者・取得元                                                                                                                                                                                                                         | ライセンス・加工                                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BGM `tablecast-carefree-kevin-macleod.wav` | Kevin MacLeod「Carefree」、ISRC USUAN1400037。[作者の曲ページ](https://incompetech.com/music/royalty-free/index.html?gt=&isrc=USUAN1400037)、[配布MP3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3)      | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。48kHzステレオWAV化、音量調整（FFmpeg loudnorm I=-20 / TP=-2 / LRA=9）。動画では抜粋し、発話中に音量を下げ、開始・終了をフェード |
| 章転換SE `tablecast-kenney-switch.wav`     | Kenney「Interface Sounds 1.0」の `Audio/switch_004.ogg`。[配布ページ](https://kenney.nl/assets/interface-sounds)、[配布ZIP](https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/)。48kHzステレオWAV化。[同梱ライセンス](kenney-license.txt)を保存                                                                  |

音楽の作者・曲名・ライセンス・編集使用を2本の末尾に表示する。Web公開時の説明欄にも、上表の曲ページ・作者・CC BY 4.0と加工内容を記載する。SEは動画の章転換用であり、アプリが鳴らした実音ではない。

無料利用条件は作者の表示で確認した。CC BY 4.0はクレジット、ライセンスへのリンク、変更した旨を条件とする。作者によるTableCastの推奨・関与を示すものではない。

原配布物はリポジトリの `.local/tablecast-free-audio/`、採用WAVと本書は再生成用素材。旧 `tablecast-ambient-master.wav` と `tablecast-transition-master.wav` は比較用に保存するが、現行台本から参照しない。

SHA-256:

```text
carefree.mp3: 8433B770A630D9B1594FD484442C677907ECE899A4D149954CD2E74FD733E311
kenney-interface.zip: F2193D072726D6758A5F7871B2DCC54DCCE0D5C35C6F0A62F92549B327C81232
tablecast-carefree-kevin-macleod.wav: 0517764173BDAA7BFEB64DC73CF76AB8387D7D0DB3D8C571EB1065E29C52FA1F
tablecast-kenney-switch.wav: 1F3F2EBB8DC4F65A6404C02A939909E8FE55A14B231B8288AE878CA6ADA3DEC2
```

## 発話

`voice-*` は発話内容・声・モデルのハッシュに対応する取得済みInworldナレーション。客とキャストの実会話は収録MP4に含まれ、別TTSで置換しない。`tablecast-input-*` は収録に使った合成の客入力。今回の話者名・図・端末枠の変更では既存の音声キーを維持する。
