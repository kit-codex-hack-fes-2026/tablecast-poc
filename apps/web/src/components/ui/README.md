# TableCastのUI部品

[shadcn/uiのBase UI版](https://ui.shadcn.com/docs/components/base/dialog)を基点に、Base UIが操作・フォーカス・アクセシビリティを、Tailwindが見た目を担当する。

- `components/ui`: Button、Input、NativeSelect、Badge、Dialog、Table、Checkbox、RadioGroupItem。業務schema、API、翻訳キーを参照せず、propsとchildrenで組み合わせる。共通の見た目は各TSXとTailwind Variantsの`tv`へ置く。
- `components`: PageHeader、LanguageSwitch、ErrorNoticeなど、複数featureで使うアプリ共通部品。ページの視覚階層、言語・通信エラーの表示を担当する。
- `features/kiosk`: メニュー、商品カスタマイズ、注文かご、会話、端末ペアリング。選択条件や注文状態の表示はここが所有する。
- `features/store`: 卓タイムライン、集計、開卓、端末承認、設定、来店履歴。業務操作とqueryは各featureが所有する。店舗一覧・アカウントは`features/account`、会員機能は`features/customer`が所有する。

`styles.css`はTailwindの読み込み、テーマトークン、最小限の全体既定値だけを持つ。画面名のCSSクラス、`@apply`による部品クラス、別のスタイル対応表を増やさない。

余白・文字サイズ・角丸・ブレークポイントはTailwindの標準スケールを使い、色は意味のある共通トークンを使う。旧CSSの固定値を任意値へコピーしたり、数値ごとのトークンを作ったりしない。任意値は標準utilityで表せない、実際に必要な表現だけに限定する。状態はBase UIのdata属性やARIA属性で表し、classNameの文字列を動的に組み立てない。

操作部品とfeatureに隣接するStorybookで、日英・長文・停止・エラー・キーボード操作を確認する。UI部品へ業務処理を移したり、同じ見た目だけを理由に無関係な業務を統合したりしない。

## 対象から操作へ進む構成

一覧では店舗・商品・カテゴリ・プラン・来店・下書きの識別名を詳細への主リンクにする。属性と状態をその対象に添え、どの行にも同じ詳細リンクを重ねない。設定やメンバー管理のように行き先が異なる副操作は残す。行全体のクリックや、リンク内へ別のボタンを入れる構成は避ける。

PageHeaderは対象名・説明・状態・操作を同じ視覚階層へ配置する表示部品とする。型付きLink、検索条件、下書きID、権限、query、mutationは呼出し元featureに保つ。対象の選択から編集・保存・明示公開へ進む既存の経路を共通部品へ移さない。

Buttonの寸法は既存のsizeで指定し、卓上の主要操作はlgを使う。親の子孫セレクターで高さを縮めず、共通variantに操作領域を保たせる。

Buttonは通常48px以上、コンパクト操作は44px以上、卓上の主要操作は56px以上とし、長い日英ラベルに応じて高さを伸ばす。Badgeは静的な状態表示として保ち、操作にはButtonまたはリンクを使う。商品名と金額は本文として読み取れる大きさを保ち、列数はメニューペインの幅に合わせる。

## 動きと開閉

`motion-variants.ts`と`styles.css`の時間トークンを使う。Base UIの入退場属性で途中反転できるようにし、閉じたsurfaceは退場中も`inert`・`aria-hidden`で操作と支援技術から外す。通知領域のDOMは固定し、内側の見た目だけを更新する。

タブは`import * as Tabs from "./tabs"`、実データ・編集欄の開閉は`import * as Disclosure from "./disclosure"`で利用する。`Root`・`Trigger`・`Panel`を組み合わせ、説明を隠すためにDisclosureを使わない。`Panel`の入力は保持し、必須項目のエラー時は該当する開閉・言語を開いて案内する。
