# 実録静止画

v13は修正後のカーソルを含む素材から次の静止画を再取得した。冒頭・締めに古い巨大な手のカーソルが残らないよう、台本の画像参照も更新している。

| PNG                               | 元映像                                       | 時刻                              |
| --------------------------------- | -------------------------------------------- | --------------------------------- |
| `tablecast-guest-screen-v13.png`  | `assets/demo/tablecast-guest-v13.mp4`        | 8.5秒                             |
| `tablecast-recap-consult-v13.png` | 同上                                         | 27秒                              |
| `tablecast-recap-confirm-v13.png` | 同上                                         | 122秒                             |
| `tablecast-recap-staff-v13.png`   | `assets/demo/tablecast-iphone-staff-v13.mp4` | 6.7秒（受付済み・操作表示終了後） |

以下は比較用に保持する旧素材の記録。

生成画像は現在の台本から参照しない。次のPNGは既存の実録MP4からFFmpegで取得した静止フレーム。表示用の文字と配置はHyperFramesのHTML/CSSで描画する。v7では端末外形を付けない。元の縦横比は変えない。

| PNG                           | 元映像                                         | 元映像内の時刻 | 用途                 |
| ----------------------------- | ---------------------------------------------- | -------------- | -------------------- |
| `tablecast-guest-screen.png`  | `assets/demo/tablecast-ipad-guest-ready.mp4`   | 8.5秒          | 冒頭・実演の接続     |
| `tablecast-recap-consult.png` | 同上                                           | 27秒           | 相談の実応答         |
| `tablecast-recap-confirm.png` | 同上                                           | 122秒          | 注文内容の確認       |
| `tablecast-recap-staff.png`   | `assets/demo/tablecast-iphone-staff-ready.mp4` | 4.2秒          | 同じ注文を店員が確認 |

取得例（`apps/presentation`から実行）:

```sh
ffmpeg -v error -y -ss 27 -i assets/demo/tablecast-ipad-guest-ready.mp4 -frames:v 1 assets/images/tablecast-recap-consult.png
```

再収録では新しい応答・注文状態に合う時刻を選び直す。この時刻を他の収録へそのまま流用しない。現在はこの選定・更新が手動で残っている。
