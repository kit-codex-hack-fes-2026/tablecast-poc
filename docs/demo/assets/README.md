# 店舗の雰囲気画像と初期素材の生成履歴

[Issue #118](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/118)の店舗・シナリオ資料として、2026-09-13にCodex内蔵の`image_gen`で生成した雰囲気画像2点と、初期の商品素材2点の履歴を記録する。この4点の初回生成には参照画像を使わず、テキストから独立して作成した。CLI/APIの代替経路は使用していない。下記の雰囲気画像2点は初回のPNGを保持する。

現在の商品102点と選択肢の写真は、[商品写真一覧](../photos.md)と[アセットの説明](../../../assets/demo/README.md)を正本とする。下記の旧バーガー・IPAのプロンプトとSHAは初期素材の履歴であり、現行の商品画像・変換後WebPの記録ではない。新しい写真には構図を直した編集結果を含み、配信用にWebPへ変換する。

実在の店舗・第三者ブランド・実人物を参照していない。店員の顔や制服、内装は架空の表現であり、orgメンバーの本人画像・人型アバターの実装を表すものではない。

店内画像の紙メニューに含まれる文字・価格・装飾は、レイアウトと質感を検討するための生成表現。商品・金額・食材・対応可能なカスタマイズの正本として取り込まない。実際のデモデータにはseedで定義する商品情報を使う。実アプリのUI画面や実装済みテーマを描いた資料でもない。

## 現在の雰囲気画像

| 画像                                                | 用途                                                                                                                     | 画像寸法    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------- |
| [京料理こもれび四条店](./komorebi-atmosphere.png)   | 木・和紙・墨・藍の内装、余白のある紙お品書き、藍の作務衣風制服を着た架空の店員1名                                        | 1536 × 1024 |
| [Westward Burgers Kyoto](./westward-atmosphere.png) | ウォールナット・生成り・錆オレンジ・ティールの内装、余白のある紙メニュー、生成りTシャツと深緑エプロンを着た架空の店員1名 | 1536 × 1024 |

この2点では店内の素材・配色、店員の人数と制服、実アプリUIが含まれないことを目視確認した。韓国食堂ハヌル三条店の青いタイル・赤い椅子・ステンレス卓と制服は[韓国料理店の設定](../korean.md)に記載し、未制作の雰囲気画像を実物として掲載しない。

## メニューへ埋め込む写真の構図

商品と選択肢は、料理・材料の外輪郭と先端を切らず、長辺が画面の85〜92%程度を占め、四辺4〜7%程度の余白を残す構図を目安にする。店内の背景は入れず、選ぶ対象を大きく見せる。皿・トレーの縁だけは切れてよいが、容量比較など器そのものが対象なら全形を残す。可食部の面積率を強制して細長い料理を切り取らない。

正方形の表示枠に全体を収め、ホバー拡大による見切れを作らない。商品名・価格・選択肢の説明と併記し、写真から容量・原材料・アレルゲン・宗教適合を保証しない。選択肢画像の設定と表示はIssue #122の上段PRの実装範囲である。

## 初回生成のプロンプトと照合記録

現在の店舗表示名は京料理こもれび四条店とWestward Burgers Kyotoである。以下の生成プロンプトは生成時の旧称と構図指示を保持する。とくに初期商品素材の広い余白という指定は、その後改めた現在の撮影方針ではない。

初回の元画像は、Codexの生成先`generated_images/01a098d6-9309-7c40-9160-0fb1bce88378/`に作成された。以下の元ファイル名とSHA-256は初回PNGの記録であり、現行画像の検証には使わない。

### カスタムバーガー（初期素材・現行では不使用）

- 元ファイル名: `exec-7ec03a78-d909-4256-a159-4c3919cf2905.png`
- SHA-256: `e38a014283ddda6578daa705fceeb2fd89528aaedb8ab58340eb56362b7cdfda`

```text
Use case: product-mockup
Asset type: square menu product photograph for the fictional Westward Burger & Tap restaurant in a restaurant ordering demo.
Primary request: one inviting customisable cheeseburger, photographed as a real food menu item. A glossy brioche bun encloses one grilled beef patty, melted cheddar, crisp lettuce and sliced red tomato. These five ingredients must be clearly recognisable and appetising.
Scene/backdrop: a warm off-white ceramic plate on a walnut tabletop; quiet neutral background.
Style/medium: natural professional food photography, realistic texture and portions.
Composition/framing: square image, one whole burger centred with generous breathing room; eye level at a slight downward angle that shows the ingredient layers. Burger is the only food or drink.
Lighting/mood: soft side daylight, warm welcoming West Coast taproom mood.
Constraints: no fries, sauces in cups, cutlery, garnish, hands, people, text, logos, branding, watermark or UI. The restaurant is fictional; no identifiable real location.
```

### West Coast IPA（初期素材・現行では不使用）

- 元ファイル名: `exec-6b5a3ef9-caed-4381-95e5-21fe78069513.png`
- SHA-256: `73aaf7e46da55672fc3be5505c8aa4da666a19c0204c2f54150abd1d41aa3da3`

```text
Use case: product-mockup
Asset type: square menu product photograph for the fictional Westward Burger & Tap restaurant in a restaurant ordering demo.
Primary request: a single unbranded clear pint glass of West Coast IPA. The beer is clear amber-gold with fine visible bubbles and a fresh white foam head; a little natural condensation on the glass.
Scene/backdrop: walnut tabletop and soft warm off-white neutral background.
Style/medium: natural professional beverage photography, realistic glass reflections and beer colour.
Composition/framing: square image, the entire upright pint glass centred with generous breathing room, glass base and foam both completely visible, product alone.
Lighting/mood: soft side daylight, warm inviting taproom mood.
Constraints: no other glasses, bottles, cans, food, garnish, coaster, hands, people, text, logos, branding, watermark or UI. The restaurant is fictional; no identifiable real location.
```

### 京料理こもれび四条店

- 元ファイル名: `exec-95fd0f6e-0710-433e-be44-1f9d09848f3d.png`
- SHA-256: `d7fa12054d5314ab53eab2282fc400902ed320e9c69aa469c45813d29a79400c`

```text
Use case: photorealistic-natural
Asset type: landscape art-direction reference photograph for a fictional Japanese restaurant demo; this image documents interior, paper menu and staff uniform together, not a real application screen.
Primary request: a warm naturally photographed small Kyoto cuisine and local sake restaurant named Komorebi, entirely fictional. Quiet contemporary Japanese hospitality with tactile wood, handmade washi paper, ink-black accents and indigo textiles. A foreground wooden dining table has one refined ivory washi paper menu with restrained ink-toned Japanese typography, generous margins and a small indigo detail. In the middle distance one adult staff member in a simple indigo samue-inspired work uniform welcomes guests naturally. Behind them are wood shelving, discreet unbranded sake bottles, warm paper pendant lighting and a little daylight through a wooden screen.
Style/medium: realistic editorial interior photography, authentic material texture, human warmth, elegant but approachable.
Composition/framing: landscape 3:2, enough of the dining room to understand the atmosphere; the paper menu and uniform are both visible. Only one human figure, entirely invented.
Lighting/mood: warm daylight and soft ambient light, calm inviting restaurant.
Text: incidental small menu typography only; the menu is an atmosphere prop, not authoritative menu data. Avoid prominent readable signage.
Constraints: no actual brand or real restaurant, no logos, no real person's likeness, no app UI, iPad, tablet, screen, collage, captions or watermark. Do not add geisha, costume motifs or tourist caricatures.
```

### Westward Burgers Kyoto

- 元ファイル名: `exec-4cb3e2db-d6ec-452f-9e80-e99d48cd570b.png`
- SHA-256: `8204c8490b1228896fd417840e3556ded96dbe30ff5abc9af63e4e7308c5bd4c`

```text
Use case: photorealistic-natural
Asset type: landscape art-direction reference photograph for a fictional burger and craft-beer restaurant demo; this image documents interior, paper menu and staff uniform together, not a real application screen.
Primary request: a warm naturally photographed fictional West Coast-style taproom named Westward Burger & Tap. Welcoming contemporary space with walnut counters and tables, ecru surfaces, muted rust-orange cushions and restrained teal accents. A foreground table has one generously spaced ecru paper menu with a quiet editorial grid, understated dark typography and small rust-orange details. In the middle distance one adult staff member wears an ecru T-shirt and a deep-green apron, with a relaxed professional welcome. Behind them, an unbranded craft beer tap row, subtle teal wall and soft daylight establish the burger restaurant and taproom atmosphere.
Style/medium: realistic editorial interior photography, tactile wood grain, honest everyday materials, relaxed hospitality.
Composition/framing: landscape 3:2, enough of the dining room to understand the atmosphere; the paper menu and uniform are both visible. Only one human figure, entirely invented.
Lighting/mood: warm afternoon daylight, comfortable and contemporary.
Text: incidental small menu typography only; the menu is an atmosphere prop, not authoritative menu data. Avoid prominent readable signage.
Constraints: no actual brand or real restaurant, no logos, no real person's likeness, no app UI, iPad, tablet, screen, collage, captions or watermark. No American flags, oversized neon, surfboard decoration or exaggerated tourist clichés.
```
