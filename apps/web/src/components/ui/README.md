# TableCastのUI部品

[shadcn/uiのBase UI版](https://ui.shadcn.com/docs/components/base/dialog)を基点に、Base UIが操作・フォーカス・アクセシビリティを、Tailwindが見た目を担当する。

- `components/ui`: Button、Input、NativeSelect、Badge、Dialog、Table、Checkbox、RadioGroupItem。業務schema、API、翻訳キーを参照せず、propsとchildrenで組み合わせる。共通の見た目は各TSXと既存のCVA variantへ置く。
- `components`: LanguageSwitch、ErrorNoticeなど、複数featureで使うアプリ共通部品。言語・通信エラーの表示を担当する。
- `features/kiosk`: メニュー、商品カスタマイズ、注文かご、会話、端末ペアリング。選択条件や注文状態の表示はここが所有する。
- `features/admin`: 卓タイムライン、集計、開卓、端末承認、設定、来店履歴。業務操作とqueryは各featureが所有する。

`styles.css`はTailwindの読み込み、テーマトークン、最小限の全体既定値だけを持つ。画面名のCSSクラス、`@apply`による部品クラス、別のスタイル対応表を増やさない。

余白・文字サイズ・角丸・ブレークポイントはTailwindの標準スケールを使い、色は意味のある共通トークンを使う。旧CSSの固定値を任意値へコピーしたり、数値ごとのトークンを作ったりしない。任意値は標準utilityで表せない、実際に必要な表現だけに限定する。状態はBase UIのdata属性やARIA属性で表し、classNameの文字列を動的に組み立てない。

操作部品とfeatureに隣接するStorybookで、日英・長文・停止・エラー・キーボード操作を確認する。UI部品へ業務処理を移したり、同じ見た目だけを理由に無関係な業務を統合したりしない。
