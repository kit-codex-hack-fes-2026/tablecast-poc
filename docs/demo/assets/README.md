# デモ画像の生成記録

[Issue #118](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/118) のデモ店舗・シナリオ資料として、2026-09-13にCodex内蔵の `image_gen` で生成した。CLI/APIの代替経路は使用していない。入力参照画像はなく、全てテキストから1点ずつ独立して生成した。生成後の画像編集・再圧縮は行っていない。

実在の店舗・第三者ブランド・実人物を参照していない。店員の顔や制服、内装は架空の表現であり、orgメンバーの本人画像・人型アバターの実装を表すものではない。

店内画像の紙メニューに含まれる文字・価格・装飾は、レイアウトと質感を検討するための生成表現。商品・金額・食材・対応可能なカスタマイズの正本として取り込まない。実際のデモデータにはseedで定義する商品情報を使う。実アプリのUI画面や実装済みテーマを描いた資料でもない。

## 保存先

| 画像                                                         | 用途                                                                                                                                         | 画像寸法    |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| [カスタムバーガー](../../../assets/demo/westward-burger.png) | メニューの商品写真。ブリオッシュ、ビーフ、チェダー、レタス、トマトを含む標準構成。カスタマイズ後の構成を表す写真ではない。                   | 1254 × 1254 |
| [West Coast IPA](../../../assets/demo/westward-ipa.png)      | メニューの商品写真。無銘柄の琥珀色IPAを透明なパイントグラスで表現。実在する醸造所や銘柄の写真ではない。                                      | 1254 × 1254 |
| [京料理こもれび四条店](./komorebi-atmosphere.png)            | 店舗の雰囲気資料。木・和紙・墨・藍の内装、余白のある紙お品書き、藍の作務衣風制服を着た架空の店員1名。                                        | 1536 × 1024 |
| [Westward Burgers Kyoto](./westward-atmosphere.png)          | 店舗の雰囲気資料。ウォールナット・生成り・錆オレンジ・ティールの内装、余白のある紙メニュー、生成りTシャツと深緑エプロンを着た架空の店員1名。 | 1536 × 1024 |

4点について、商品の数と食材、グラス、店内の素材・配色、店員の人数と制服、実アプリUIが含まれないことを目視確認した。

現在の店舗表示名は京料理こもれび四条店とWestward Burgers Kyotoである。以下の生成プロンプトは生成時の記録として旧称を保持する。

## 生成プロンプトと画像の照合

生成ツールが返した元画像は、Codexの生成先 `generated_images/01a098d6-9309-7c40-9160-0fb1bce88378/` にある。以下に元ファイル名、保存した画像のSHA-256、実際に渡したプロンプトを記録する。

### カスタムバーガー

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

### West Coast IPA

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
