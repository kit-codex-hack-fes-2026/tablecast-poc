# 画像を使ったラーメン店テーマ作例

2026-09-15に組込みのimagegenで素材を個別生成した。店舗の提供済み公式ロゴや実料理写真ではなく、参考画像の黒・生成り・朱と筆文字を基にした架空店の表示検証用素材。価格980円は隔離E2Eの試作値であり実店舗の価格を示さない。素材の直接加工はしていない。

| ファイル       | 寸法                | 用途                                           |
| -------------- | ------------------- | ---------------------------------------------- |
| background.png | 1536×1024           | 中央に余白を残した和紙・墨の背景               |
| logo.png       | 1832×859、alphaあり | 生成案の筆文字。店舗ロゴの独立した画像枠へ配置 |
| banner.png     | 1536×1024           | 商品チラシ。全体を商品詳細へリンク             |

当時の実R2アップロード、出所登録、下書き保存、デザイン編集、実注文プレビューは[固定SHAのE2E](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/blob/cd15eb6dfbfa3f70cbc482aff46f4f69af15264d/apps/web/e2e/tablecast-theme-art.spec.ts)で検証した。公開済み設定を変更せず、商品名・店名・出所を日本語と英語のHTMLにも残す試験だった。

現在は[デザイン編集のBrowser統合](../../../../apps/web/src/features/store/store-design.browser.test.tsx)、店舗テーマ・KioskのBrowser統合、APIのappearance・media・image-uploadテストへ保証を分け、実画像のアップロードと配信は[選択肢画像の代表E2E](../../../../apps/web/e2e/tablecast-option-images.spec.ts)で確認する。素材はskillの完成例を確認する開発用データで、利用者がこのリポジトリをcloneする必要はない。

## 生成プロンプト

### 背景

```text
Create a production-ready standalone decorative background asset for a bold Japanese ramen restaurant ordering interface. Landscape 1536x1024. Warm ivory handmade washi paper, subtle tactile fibres, irregular hand-brushed sumi black dry ink accents at extreme bottom left and extreme top right corners, a few restrained deep vermilion flecks at edges. Central 80% almost empty warm ivory, extremely low contrast so black HTML conversation text and product cards stay legible. Authentic contemporary ramen-shop graphic identity, energetic yet professionally restrained. Flat scan, no perspective, no lettering, no logo, no bowl, no food, no UI, no border frame. This is a separate background texture, not a screenshot. Save as a reusable image asset.
```

### チラシ

```text
Generate one polished Japanese ramen restaurant promotional banner image, wide landscape 1536x1024, poster art only, no tablet or UI. Brand art direction warm ivory washi, almost-black sumi brushwork and vermilion red seals, bold genuine Japanese hand-lettering. Dramatic hero bowl on right lower 60%, Jiro-inspired thick noodles, shiny thick sliced chashu pork, abundant bean sprouts, garlic, rich amber broth, illustrated appetising realism matching high-end food advertising. On left upper/centre very large beautifully composed exact Japanese text '剛麺ラーメン', small exact text '一乗寺 剛麺研究所', red stamp exact text 'おすすめ'. No prices, no additional claims, no other text. Keep all lettering within 8% safe margins and bowl entirely inside image. Background black with subtle circular brush pattern, cream paper label behind title, tasteful energetic print poster composition. It is a fictional demonstration illustration, not a claim of actual food photography. The whole banner will be clickable to an existing product and all functional UI labels stay HTML.
```

### ロゴ案

```text
Create a standalone transparent PNG logo asset for a fictional Japanese ramen restaurant demo. Exact Japanese lettering '剛麺研究所' in masterful powerful black sumi brush calligraphy, with smaller '一乗寺' above the main line and tiny vermilion square seal containing '麺' at the right. Horizontal wordmark, landscape canvas, lettering fills 85% width and 65% height with clear transparent breathing room. Strong thick expressive strokes remain legible scaled to 280px wide. Entire background truly transparent alpha, no white rectangle, no texture, no photograph, no mockup, no shadow, no UI. Black ink and restrained red seal only. Treat this as a newly generated illustrative sample, not an official existing logo.
```

ロゴは希望した横長比率より背が高い出力だったため、画像は加工せずobject-containで透明な余白と縦横比を保持する。実店舗の提供ロゴをこの生成案で置き換えない。
