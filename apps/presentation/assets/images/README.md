# 画像素材の採用状態

技術紹介v14の `tablecast-technical-confirm-v14.png` は `assets/openscreen/tablecast-guest-v13/tablecast-source.mp4` の122秒から取得。左右の映像用余白を `crop=1440:1080:240:0` で除去し、実アプリの全体表示を保存した。生成画像ではない。

現行v15の `sample.json` は実録静止画とサービス識別用SVGを参照する。PoC構成図v2は3領域構成のデザイン参考として使用し、動画はHTML/CSS/SVGで再構成した。[v15素材記録](tablecast-v15-assets.md)を参照。その他の生成画像と生成プロンプトは過去の試作記録。旧素材メモの「使用する」「合成する」は制作当時の記録として読む。

## 次版のPoC構成図（参考画像）

現在の見せ方の基準は、ユーザー提供の [3領域の構成図](tablecast-poc-user-reference.png)。これを参考に [tablecast-poc-concept-v2.png](tablecast-poc-concept-v2.png) を生成し、Python Agentなど現行の音声経路を反映した。生成された端末画面は実録と完全一致しないため、動画化では元画面を配置する。[v2のプロンプト・素材・確認記録](tablecast-poc-concept-v2.md) を参照。v15へ構成を反映済み。完成動画の見た目はユーザーレビュー待ち。

2026-09-13、ユーザーの提案を受けて [tablecast-poc-concept-v1.png](tablecast-poc-concept-v1.png) を組込みimage_genで生成した。文字・主要な接続を確認し、店員の接続とWorkersの囲みを修正済み。見た目の評価・動画への反映は未実施。[生成プロンプトと確認記録](tablecast-poc-concept-v1.md) を参照する。

## 初期の生成イメージ（不使用・記録のみ）

`tablecast-restaurant.png` は2026-09-12に組込みimagegenで生成した説明用画像。実店舗・実利用者・実アプリの収録証拠ではない。元画像とプロンプトを比較用に保管する。

生成プロンプト:

> Use case: ads-marketing. Create a cinematic 16:9 wide advertising still for TableCast, a Japanese restaurant voice ordering app. Warm contemporary small Japanese restaurant at early evening. Two clearly adult guests in their thirties sit at a wooden table, comfortably talking toward a landscape tablet on a compact table stand, with a smiling adult server in an apron approaching in the background. Natural believable interaction, refined Japanese commercial photography, amber practical light, realistic food and ceramic tableware, calm welcoming mood, beautifully composed. Tablet display seen obliquely and softly out of focus; no readable UI, no words, no logos, no watermarks. Keep left third dark and visually quiet for later title overlay; guests and tablet occupy centre-right. This is an illustrative generated scene, not real product evidence. High visual quality, natural hands, no exaggerated holograms or floating interface.
