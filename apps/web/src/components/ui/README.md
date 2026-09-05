# TableCastのデザインシステム

[shadcn/uiのBase UI版](https://ui.shadcn.com/docs/installation/manual)、base-novaの公式registryを使用する。Button、Input、Badgeは公式部品を基点に、卓上iPadで押す標準ボタンを48px、主操作を56pxに設定した。Dialog、Tabs、Radio、Checkboxは同じBase UIのプリミティブで動作する。

色・角丸は`src/styles.css`のshadcn互換semantic tokenを正本とし、Tailwind CSS 4のViteプラグインで部品のutilitiesへ反映する。落ち着いた紙色、濃緑の主操作、朱色の注意を使う。アイコンはLucide、言語補助の日本・英国旗は`public/flags`のSimple Flagsで統一する。

操作部品と状態は隣接するStorybookで確認する。メニュー、会話、卓タイムラインのStoryも利用部品に隣接する。Storybookは日本語・英語とアクセシビリティ検査を備える。客向け画面には自由文入力を置かず、装飾目的の副題を追加しない。
