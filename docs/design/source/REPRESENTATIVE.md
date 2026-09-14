# 指定画像の編集記録

2026-09-14。ユーザー添付の代表ボードを内蔵画像生成で編集した。変更範囲はTableCastロゴへの差し替え、カラーコード・weight注記・角丸寸法注記の削除。レイアウトと質感を維持する。

入力はユーザー添付画像と、正本SVGから出力した`logos/tablecast-icon.png`。編集元を別の参考画像として配布しない。

以下は初回編集のプロンプト原文。角丸寸法を残す指示は、末尾の追加編集で撤回した。

```text
Precisely edit Image 1, the supplied TableCast design reference board. This is a surgical edit, NOT a redesign. Preserve the entire layout, white background, Japanese headline/copy, all UI cards/placeholders/prices, waveform/orb, typography samples, swatch colours and semantic names, corner-radius examples, material sculptures and their finish, architecture diagram, ALL external logos, arrow labels, footers, shadows, spacing and proportions.
Only make TWO changes:
1. Replace ONLY the old rainbow cloche/speechbubble SYMBOL in the top-left header with the monochrome black TableCast service-bell symbol in Image 2. Copy its exact geometry and aspect ratio: straight short horizontal pushbutton with round caps, central stem, semicircular dome with short straight sides, two separate horizontal baseline bars with round caps, three internal vertical waveform bars short-long-short with rounded caps. Uniform stroke weight, symmetric, no rainbow, no extra eyes/cheeks. Keep adjacent TableCast wordmark unchanged. There must be ONE symbol in the board header, not two.
2. Erase exactly these five annotation strings and seamlessly restore their background: "#18181b", "#ffffff", "#f4f4f5", "400 / font-normal", "700 / font-bold". Keep the font samples themselves at their original normal and bold appearances. Keep "Noto Sans CJK JP + Inter", 本文, 背景, 補助面, Agent機能. Do not remove or modify anything else, including corner-radius samples and numbers 6, 10, 14, full.
Output one image at the original aspect ratio. Do not add any new captions or labels.
```

## デザイン数値注記の削除

角丸見本下の6・10・14・fullも削除する。図形自体とUI内の商品価格は保持する。

```text
Edit this image with a surgical text removal ONLY. Erase the four labels "6", "10", "14", and "full" below the four corner-radius outline samples in the upper-right section headed 角丸. Seamlessly restore the white background in those four text areas. Keep the four outline shapes and heading 角丸 unchanged. All design measurement labels must be absent. Preserve EVERYTHING else exactly: TableCast black bell logo, TableCast wordmark, layout, Japanese text, font samples, font-family name, colours, material samples, shadows, architecture diagram and official logos, waveform, UI product names and ¥650 prices. Do not redesign, recolour, move, resize, add, or remove any other element. Output the same aspect ratio and composition.
```
