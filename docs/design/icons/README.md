# favicon・Apple touch icon

TableCastロゴの[1:1正本SVG](../logos/tablecast-icon.svg)から直接書き出した。黒の図形と白背景を使い、線幅・形状・縦横比を維持する。虹色や影は加えない。

| 用途             | ファイル                        | サイズ             |
| ---------------- | ------------------------------- | ------------------ |
| favicon          | [SVG](favicon.svg)              | ベクター           |
| favicon          | [ICO](favicon.ico)              | 16・32・48pxを内包 |
| Apple touch icon | [PNG](apple-touch-icon.png)     | 180×180px          |
| iPad Retina      | [PNG](apple-touch-icon-167.png) | 167×167px          |
| iPad             | [PNG](apple-touch-icon-152.png) | 152×152px          |

faviconは正本の120×120 viewBoxに白背景を追加する。Apple用はviewBoxを`-12 -12 144 144`に広げて保護余白を取り、不透明な正方形PNGとして出力する。角丸のマスクはOSへ任せ、画像には焼き込まない。SVGをSharpで各サイズへ直接ラスタライズし、ICOは各サイズのPNGを格納する。

Apple用のファイル名・サイズは[AppleのWeb Clip仕様](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)を参照した。ここでは素材を配布し、アプリのhead・manifest・公開ファイルへの組み込みは別途行う。
