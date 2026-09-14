# 統合リファレンスの制作記録

2026-09-14。部品構成の画像、従来の代表画像、利用場面の写真調画像を1枚へまとめる。画像本体は内蔵画像生成で制作し、TableCastロゴは正本SVGを縦横比固定で埋め込む。色・角丸・フォントの個別見本と数値注記は入れない。

## 音声表示の形状

根拠は`apps/web/src/features/kiosk/audio-waveform.tsx`と`voice-panel.tsx`。波形はcanvasに描く細い連続線であり、独立した縦棒の集合ではない。orbは白い円形面のSmokeRingと中央の小さな状態アイコンで構成する。orb左、ラベルと横長波形が右、音声操作が下という関係を維持する。色・影は資料の質感に合わせるが、輪郭・構成・比率は変更しない。統合画像では無音・トラックなし時の細い水平線を採用し、棒状の波形にしない。

実装上の寸法は円形面80、中央アイコン16、canvas内部240×48・表示高さ28。これらの値は生成条件の根拠として本Markdownにだけ記載し、画像には載せない。画像は静止した見た目の参考で、実装の動画や描画ピクセルの一致を示すものではない。

## 写真とロゴ

写真は来店客が卓上端末へ話しかけ、注文前に商品説明を聞く場面。役割と行動をキャプションで示す。暖かい映画調のカラーグレーディングと細かなフィルムグレインを写真部分だけへ適用する。実店舗で撮影した導入事例の証拠ではない。

ロゴは画像生成で再描画せず、`logos/tablecast-logo.svg`の図形を縦横比固定で合成してPNGへ書き出した。制作時に使った合成用SVGと外部公式素材のSVGは配布しない。最終画像は`references/representative.png`、ロゴ正本は`logos/`に保存する。

## 生成プロンプト

```text
Create ONE unified high resolution landscape 3:2 TableCast UI DESIGN REFERENCE board combining the two supplied boards and ONE new photorealistic usage photograph. Use first image for conversation UI and compact labelled architecture, second for reusable component compositions. Keep white/black Japanese SaaS visual language, regular/bold Noto Sans CJK JP + Inter appearance, white-to-light-gray gradients, shallow inset input fields, paired upper-left white highlights/lower-right soft shadows, charcoal-gradient primary buttons, satin/frosted edge reflections. Visible moderate neumorphism, never mirror chrome or deeply extruded plastic. All UI text sharp and readable. No design numbers, hex codes, font names/weight demonstrations, colour swatch circles, radius specimen rows, slogans or marketing copy.

CRITICAL AUDIO GEOMETRY from current actual source (overrides BOTH images): the audio waveform is ONE very thin connected oscilloscope stroke running horizontally with small irregular amplitude around a continuous baseline, NOT separate vertical bars/dots, NOT equalizer, NOT filled mountain/wave ribbon. Its canvas has a very wide, short display aspect (height about a third of orb diameter). At LEFT of waveform is an 80-unit circular white flat disk, with a soft translucent annular SmokeRing plume of pastel Agent colours inside its boundary and a SMALL 16-unit black AudioLines icon in the exact center. Orb must stay circular, with nearwhite/open-looking center and subtle smoky ring, not a solid 3D ball, NOT a robot face, not a donut sculpture, no spikes. The actual group is orb left, small status label above waveform on right, black voice-stop button below. Keep ratios and silhouettes; modify ONLY colours and shadows. Reuse this exact group everywhere audio is pictured, including tablet photo. Do NOT copy the separate rainbow bars in input2! Rainbow is exclusively Agent function.

Composition:
Top 9% header: pure nearwhite blank region at LEFT 28% width reserved for deterministic SVG TableCast logo insertion later. Draw NO logo and NO TableCast wordmark anywhere else. At top-right put small plain title「UIデザインリファレンス」. No slogan.

Below header a 3-column asymmetric but aligned layout with generous gutters.
LEFT about 36% width: dominant conversation panel, heading「会話」, no avatar, simple role label AudioLines「キャスト」, message「こちらはいかがですか。」, tool row「商品を表示」and two product cards as first image, names 月凪 純米吟醸 and 白霞 にごり酒, small matching sake product photos instead of blank image placeholders, price ¥650, second 売り切れ and disabled +. Preserve vertical photo-above-name card structure and side-by-side pair. Bottom exact audio group described above, state「キャストがお話ししています」and black「音声を停止」with fine Agent spectrum edge. NO typed composer in this conversation panel.
Under left panel a compact table card「一覧」with generic rows サンプルA/B/C, columns 名称 / 状態 / 更新日 and pagination, monochrome/dim semantic completion badges.

CENTER about 35% width: packed but breathable primitive composition, two top compact cards for combined buttons/inputs/checkbox/radio/switch (保存, キャンセル, 項目名, サンプル), and slim vertical navigation (概要, ファイル, 履歴, 設定). Below, a larger generic dialog form「表示設定」with 選択肢A select, short slider, memo input and black 保存, close icon. Beside/below it small neutral gray gradient activity bar chart「アクティビティ」with weekdays and no business claims. Include a small accordion and floating toast 保存しました. Simple sample data, no restaurant-staff assignment, guest profile, invented staff AI panel.

RIGHT about 26% width: ONE large realistic documentary photograph with warm restrained cinematic colour grading and fine film grain. It must clearly depict a seated adult restaurant guest in casual clothes at a Japanese restaurant table leaning slightly toward a tabletop iPad and speaking to it; a second seated companion can be partially visible listening, NOT wearing apron. Shoulder-level three-quarter over-the-shoulder framing lets us see BOTH the speaking guest's side profile and tablet display. The tablet shows miniature plausible white TableCast conversation screen, tiny circular SmokeRing + THIN CONTINUOUS waveform + black stop button, no empty screen. Hands relaxed beside tablet, not pointing at unseen objects. Warm practical restaurant light, subtle amber, realistic skin, focus leads from mouth to tablet. Background subdued and slightly blurred, no glowing distracting lamps, no huge food foreground, no staged celebration or ad posing. Photo caption directly below:「来店客が卓上端末に話しかける」and small「注文前に商品の説明を聞く場面」. This is an illustrative synthetic photo, not evidence. Keep photo grain confined to photograph.
Below photo a compact generic file card sample.pdf, menu 開く / ダウンロード, and one small chat-bubble specimen only two sample messages; no audio here to avoid redundant forms.

BOTTOM 16% full width compact architecture strip from image1: neutral Cloudflare grouping containing TanStack Web Worker, Mastra inside API Worker, D1. Gray labelled user icon 来店客・スタッフ, all arrows labelled 画面操作 → 注文API → 読取・保存. Preserve supplied external logo appearance, services in small white cards, blue small line for Web, violet for API and D1, gray for users, legend. Do not make Mastra its own server. Small footer「見た目の参考」. Keep all cards within frame.
Make a single cohesive board, not screenshots pasted onto a slide. No isolated font/colour/radius/material specimen sections. Preserve exact audio shapes as described. Output only image, leave reserved logo space BLANK.
```

## 音声表示の追加修正

```text
Surgical correction of this unified board only in the two audio visualizations (large conversation card and tablet screen inside the photo). Keep every other pixel, layout, photograph, text, product cards, shadows, diagram, and BLANK top-left logo area unchanged.
The waveform must match the actual implementation's QUIET static frame: ONE perfectly thin, continuous STRAIGHT HORIZONTAL LINE with a smooth violet-to-pink-to-cyan colour gradient. Absolutely NO separated vertical bars, NO dots, NO clusters of lobes, NO oscillation spikes, NO equalizer. Replace the entire existing waveform with that single straight baseline. This is the actual no-track / silent implementation state.
Inside the existing circular orb keep its exact outer circle and pastel SmokeRing shape and shadows; ONLY reduce the central black AudioLines icon to one fifth of orb diameter (the current icon is too large). It must be tiny and centered. Keep orb outer geometry and its relative position LEFT of waveform, voice stop button below, unchanged. Do not alter the picture elsewhere. Output same image dimensions.
```
