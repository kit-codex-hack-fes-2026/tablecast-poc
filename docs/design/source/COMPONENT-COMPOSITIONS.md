# 部品を組み合わせたUI参照の生成記録

2026-09-14。内蔵画像生成を使用。ユーザー添付のカード構成例をレイアウトの入力、既存代表画像を配色と質感の入力として、新しい部品構成の画像1枚を作る。

色・角丸・フォントの個別画像と数値注記は作らない。汎用の部品とサンプル文言を使い、実際の業務仕様を追加しない。グラデーションと明暗の影、浅い凹凸を従来より見えるようにする。

以下は生成プロンプト原文。

```text
Use case: ui-mockup. Create ONE high resolution UI component COMPOSITION reference image, landscape about 10:7, inspired by Image 1's asymmetrical four-column masonry collage of usable UI cards. Image 2 gives TableCast's restrained white/black palette and satin/frosted material direction ONLY. This new image must contain actual composite UI examples, NOT a design-token board. Do not include colour swatches, isolated circles/radius samples, typography specimens, font names, colour codes, weight annotations, dimensions, logos, marketing slogan, material sculptures or architecture. No real product feature specification; use generic neutral sample content.

Art direction: refined approachable Japanese SaaS with Inter and Noto Sans CJK JP appearance, regular body + bold headings. Stronger and clearly visible GRADIENTS AND SHADOWS than Image 1, moderate neumorphism: luminous ivory-white to cool light-gray satin surface gradients, diffuse upper-left white highlights paired with lower-right soft graphite shadows on raised buttons and card edges, softly recessed input fields and sliders with inset shadows, frosted floating dialogs with subtle edge reflections. Keep crisp black text, dark primary actions with charcoal-to-black gradients, readable flat text areas. Rich layered depth yet practical UI; not mirror chrome, no hard specular glares, not chalk/clay, not bulky extruded 3D. Consistent modest rounding at comparable component sizes; spacious padding and meaningful alignment. Monochrome throughout, except small muted semantic status badges and ONE Agent-only rainbow waveform. Never decorative rainbow elsewhere.

Composition: four masonry columns with varied-height cards, narrow even gutters. Avoid gigantic page title or equal-size textbook specimen grid. Fully frame the board with all card bottoms visible; no accidental crop. Visually dense like supplied reference but with breathing room. Around ten complete cards:
Column A top: combined controls card with black「保存 →」button, soft raised「プレビュー」secondary, outlined「閉じる」; an inset search field「検索」with search icon; inset textarea「メモを入力」; small badges「下書き」「完了」; radio, checkbox, switch; grouped buttons. Below: two slim side-by-side navigation cards with neutral labels「概要」「ファイル」「履歴」「設定」and「ヘルプ」「ガイド」「通知」, Lucide line icons; current nav item shallow inset well. Below: a compact accordion with「セクションA」expanded, short sample text,「セクションB」collapsed.
Column B top: a generic「アクティビティ」card with monochrome gradient bar chart labelled 月 火 水 木 金, two tiny summary tiles「今週」「更新済み」and black「詳細を見る」action. Below: a table card titled「一覧」headers 名称 / 状態 / 更新日, rows サンプルA/B/C, subdued neutral/green badges, pagination. No financial, restaurant, staff-assignment content.
Column C top: a form card「新しい項目」, short「内容を入力してください。」, fields「項目名」filled「サンプルA」, side-by-side「カテゴリ」select 選択肢A and「日付」, primary「作成」and secondary「キャンセル」. Below: dialog/setting card「表示設定」with close icon, select「表示形式」, slider「表示件数」, textarea「メモ」, black「保存」. It must read as reusable form/dialog primitives, not a new TableCast app feature.
Column D top: file preview/upload card「ファイル」with simple monochrome document thumbnail, filename sample.pdf, slim progress bar and「アップロード済み」, small overflow menu floating with 開く / ダウンロード. NO QR codes or photos.
Column D bottom: tall generic「チャット」card, no avatar/no profile/no face. Plain neutral message bubbles「サンプルを表示してください。」「こちらがサンプルです。」. Small clearly labelled「Agent」response strip with the only subtle rainbow horizontal waveform, label「応答中」. Bottom inset generic composer「メッセージを入力」, plus button and black send arrow. This is a GENERIC chat primitive example, not the guest voice ordering screen; do not insert restaurant, guest, cast, order or staff terms.
Tiny semantic success toast overlapping lower corner「保存しました」with check, readable and subtle.
Keep business data and design measurements out. Output one cohesive polished component composition image.
```
