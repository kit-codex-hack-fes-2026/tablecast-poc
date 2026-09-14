# TableCastロゴ

[1:1アイコンSVG](tablecast-icon.svg) · [文字付きSVG](tablecast-logo.svg)

TableCastロゴのベル、短・長・短の3本波形、2本の台座をベクターで固定した。全線幅は9、端部と接続は丸形。中央の波形は左右より長く、左右は対称。白抜きの目やほっぺたは追加しない。文字はInter Boldのアウトライン。

## 配置

- アイコンは正方形のviewBox、文字付きは500×120のviewBoxを保持する。
- `preserveAspectRatio="xMidYMid meet"`で縦横比を維持する。Webは幅と`height: auto`、または`object-fit: contain`を使う。
- Figma・スライド・動画でも縦横比をロックし、一方向へ伸ばさない。
- 参考画像のロゴを切り抜いて正本にせず、常にこのSVGを配置する。画像生成にロゴを描き直させない。
- SVGのstrokeも図形と同じ倍率で拡大縮小する。線幅だけを固定する`non-scaling-stroke`は使わない。
- 明るい背景は黒版、暗い背景は白版。陰影・虹色・光沢をロゴに加えない。

同名PNGはSVGから直接書き出した透過画像。黒版・白版のアイコンと文字付きロゴを配布する。[favicon・Apple touch icon](../icons/README.md)は、この正本から背景と用途別の余白を付けて書き出す。旧案と重複プレビューは削除した。
