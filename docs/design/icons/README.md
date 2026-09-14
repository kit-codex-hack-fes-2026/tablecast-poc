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

Apple用のファイル名・サイズは[AppleのWeb Clip仕様](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)を参照した。Webのhead・manifest・公開ファイルにも組み込む。

## 実装への配布

正本はこのディレクトリと`../logos`で維持し、以下は配布用コピーとする。正本を変更した場合は同じ差分でコピーと派生PNGを更新する。

| 配布先                                              | 素材                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `apps/web/public/brand`                             | 黒・白のシンボルSVG、黒・白の文字付きSVG、メール用の黒文字付きPNG |
| `apps/web/public/favicon.svg`・`favicon.ico`        | 同名の正本をコピー                                                |
| `apps/web/public/icons/tablecast-{180,167,152}.png` | 対応するApple用PNGをコピー                                        |
| `apps/web/public/icons/tablecast-{192,512}.png`     | 下記条件で正本シンボルSVGから直接生成                             |
| `plugins/tablecast/assets`                          | 黒・白の透過シンボルPNG、192px白背景のcomposer用PNG               |
| `apps/api/email-static/assets`                      | メールカタログのビルド時に正本の文字付きPNGをコピー               |

PWA用は正本SVGのviewBoxを`-24 -24 168 168`へ拡張し、同じ領域に白の背景rectを追加する。幅・高さを168としてSharpで192px・512pxへ直接ラスタライズする。線幅・pathを変更せず、角丸を焼き込まない。composer用は192px版をそのままコピーする。[W3Cのmaskable仕様](https://www.w3.org/TR/appmanifest/#icon-masks)の中央・半径40%の円内に図形全体を収める。

Webの`Brand`部品は文字付き160px幅、シンボル32px幅を基本とし、明るい背景は黒、暗い背景は白を指定する。SVG・PNG・faviconは既存Serwistでプリキャッシュし、オフライン画面にも同じ素材を使う。PWAのIDと起動先は維持する。インストール済みOSアイコンの更新時期はOSに依存するため、配信確認と実端末での反映確認を区別する。

メール送信では`TABLECAST_PUBLIC_ORIGIN`を基準に`/brand/tablecast-logo.png`の絶対URLを使う。プレビューは同梱PNGを相対URLで参照し、CSPは同一originの画像を許可する。画像の代替文字とプレーンテキスト本文にTableCastの名前を保持する。
