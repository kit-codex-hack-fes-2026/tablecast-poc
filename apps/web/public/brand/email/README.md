# メール用アイコン

Web UIと同じ図柄を、メールで表示できる透過PNGとして保存する。
操作・店舗・人物はlucide-react 1.59.0。各画像は48px・2倍解像度で、線幅2、Gray 12（#202020）または白。
Googleロゴは`src/components/google-icon.tsx`の同じSVGから生成し、4色を保持する。
人物の代替画像はWebのUserIdentityと同じ20pxのUserRound（Gray 11）をGray 2の44px背景に配置する。店舗の画像なし表示はWebのStoreIconと同じ頭文字を使う。
メールのボタン内は16px（GoogleロゴはWebと同じ20px）、見出し前は28px、役割バッジ内は12pxで表示する。店舗画像は36px、人物画像は44px。
Lucideのライセンスは隣接するLICENSE.lucideを参照する。GoogleロゴはGoogleの商標であり、Lucideには含まれない。
