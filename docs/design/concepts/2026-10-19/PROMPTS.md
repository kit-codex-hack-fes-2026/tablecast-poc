# UIコンセプトの生成プロンプト

2026-10-19（日本時間）。内蔵 `image_gen` を使用。CLI/APIキー経路は使っていない。

初回のA案を参照画像としてB/C案を編集し、店舗・商品・会話・金額・営業状態を揃えた。A客画面は商品写真の枠を修正して最終版とした。元画像は生成先に保持し、採用した6枚をこのフォルダーへコピーした。

## 客向けの共通プロンプト

```text
Create one exceptionally polished, production-plausible Japanese restaurant iPad application UI concept for TableCast. Use case: ui-mockup. Straight-on full screen screenshot, landscape 4:3 aspect ratio, no physical device, no desk, no perspective, no external mood board, no annotations or measurements outside the UI. High resolution and very legible Japanese text. It must look like a lovingly crafted real premium software interface, not a generic wireframe.
This is a concept for a redesign, not evidence of a working product. No login, no keyboard, no chat text-entry field. Do not invent business features.
Shared composition (keep every item and datum exactly consistent across visual variants): one compact full-width header; below, a left conversation panel occupying 40 percent of usable width and right menu/order panel occupying 60 percent. A clear subtle resize handle separates them. Use the full canvas effectively with comfortable, meaningful spacing, no overly large empty lower half.
HEADER: restaurant name "京料理こもれび", small "テーブル 03", language segmented control "日本語" selected and "English", outlined bell action "店員を呼ぶ", small unobtrusive more icon. Menu focus is an expand icon accompanied by "メニューに集中" in the menu pane.
LEFT: small tasteful white flat circular voice orb with a soft smoke-ring perimeter and tiny mic glyph, NOT a shiny sphere, NOT a character. Heading "こもれびの接客係", a small green dot and textual state "お話を聞いています". Slim continuous audio waveform, NOT bars. Conversation clearly uses role labels and softly separated text blocks: "お客さま" above "季節のおすすめは？"; "接客係" above "天ぷらとなすの田楽がおすすめです。"; "お客さま" above "その2品をお願いします。"; "接客係" above "注文かごに追加しました。内容をご確認ください。". No human avatars. Below conversation a calm tiny text hint "気になる料理を、そのまま話しかけてください". At bottom of conversation a large labeled button "音声を停止", plus secondary small microphone settings icon and "話速 1.0×". Preserve conversational identity and generous readable type.
RIGHT: navigation tabs "おしながき" selected, "注文かご 2", "注文済み", "お会計". Intro "旬を楽しむ、おしながき" with small helper "料理を選んで詳しく見る". Horizontal category chips "おすすめ" selected, "小鉢", "焼き物", "揚げ物". Then exactly FOUR food cards in a 2 by 2 grid, containing tasteful realistic Japanese plated-food photographs on simple ceramic ware. Photographs are square, entire dish contained, no text over photos. Each card has a clear linked product name and strong legible price, and an explicit separate action or quantity stepper. Card 1: "海老と野菜の天ぷら盛合せ" "¥1,180" with minus 1 plus stepper. Card 2: "なすの田楽" "¥580" with minus 1 plus stepper. Card 3: "揚げ出し豆腐" "¥610" with outlined "+ 追加". Card 4: "肉じゃが" "¥690" with outlined "+ 追加". Avoid excess badges and fake discounts.
BOTTOM OF RIGHT PANE: sticky elevated action shelf showing "注文かご 2品" and "¥1,760" plus a strong primary button "注文内容を確認 →". This is review, not final order submission. The shelf never obscures any product or price.
Typography: excellent Japanese typography, harmonious Noto Sans-style body, crisp numbers, genuine text density that fits a 1024 by 768 CSS-pixel iPad design when scaled. Main touch actions visibly large, food/product names never tiny. All noninteractive data stays visually quieter than buttons. Rounded surfaces, perceptible pressable controls, fine dividers only where useful. Distinguish selection from informational status. No decorative charts, no gamification, no gratuitous gradients.
```

## 店舗向けの共通プロンプト

```text
Create one exceptionally polished, production-plausible Japanese restaurant operations home dashboard UI concept for TableCast. Use case: ui-mockup. Straight-on full screen screenshot, landscape 16:10 aspect ratio, no physical device, no desk, no perspective, no mood-board frame, no explanatory labels outside the UI. High resolution, very legible Japanese. Elegant dense-but-scannable professional software, not generic template cards.
This is an illustrative UI concept. All values are controlled sample data. Use identical structure, content and metrics for all visual variants.
GLOBAL SHELL: narrow left sidebar around 210px of a 1440px-wide design; content fills remaining width. Top of sidebar plain black text wordmark "TableCast" (do not invent a logo icon). A slim top content bar contains store switch "京料理こもれび ▾", breadcrumb "店舗ホーム", on right "日本語 / English" and a simple initials circle. Sidebar groups "営業" with "ホーム" selected, "フロア", "来店履歴", "統計"; "メニュー・接客" with "商品", "カテゴリ", "接客", "店舗デザイン", "変更管理"; "会員施策" with "ポイント", "クーポン"; "店舗管理" with "スタッフ", "端末", "店舗情報"; bottom smaller "請求・利用状況", "外部アプリ連携", "アカウント". Simple consistent line icons, readable labels, stable alignment. No duplicated store switch.
MAIN: compact title "店舗ホーム", subheading "いまの営業と、今日の振り返り", small date "10月19日（月）" and quiet status "● 更新済み".
First section "いま対応が必要" with count "3件". A wide solid readable surface contains exactly three concise actionable rows with distinct severity icon and text: "03卓" "店員呼出" "2分前" "来店を見る →"; "02卓" "会計待ち" "5分前" "来店を見る →"; "01卓" "音声の確認" "接続エラー" "来店を見る →". Semantic warm amber for needs attention, restrained red for fault; do not color whole huge cards.
Next "現在の営業" plus prominent text link "フロアを見る →": one compact horizontal metric strip with "利用中 8卓" "空席 4卓" "来店中 21名". These numbers are informational, not button-shaped. Air between groups, aligned numbers.
Next "今日の集計", small but readable qualifier "終了済みの来店のみ · JST", and link "統計を詳しく見る →". Four well-aligned KPI groups across one panel: "会計記録の合計 ¥64,800", "来店数 18組", "人数 42名", "注文数 52件". Helper text "期間内に閉卓した来店を集計". Do NOT invent percentage change, sparklines, sales trends, rankings or charts: the existing API provides period totals only.
Then an integrated wide illustrated onboarding banner. Left large title "いつものAIで、お店の仕事を。" smaller "ChatGPTなどから、メニュー編集や売上の確認ができます。" CTA "プラグイン・接続方法を見る →", secondary subtle "OAuthで店舗と権限を確認". Right an elegant small editorial illustration of overlapping menu sheet, conversation card and compact data card, linked by a clean curved line; no fake external logos, no fake embedded chatbot input, no installation-complete badge. It should feel inviting and genuinely useful, not like an advertisement. Banner height around 170px at design scale.
Bottom a quiet small guidance line or generous breathing room, all main content fits the screenshot without cut off. Separate real-time operations and retrospective statistics by clear headings and space. Align all text and number baselines. Interaction is evident from button shapes, arrows and links; status labels are clearly noninteractive.
Japanese sans typography akin Noto Sans with sharp legible tabular numbers, clean and mature, information hierarchy through meaningful type sizes and spacing. Modern restrained material treatment. No charts with fabricated trends. No table of irrelevant orders, no staff performance data.
```

## Aの表現

```text
ART DIRECTION A — WARM REFINED GLASS. A contemporary Japanese hospitality aesthetic. Warm ivory canvas, rice-paper-like smooth light surfaces (not visible grain over text), ink charcoal typography, deep muted forest/olive green primary buttons, understated champagne highlights. Beautiful translucent frosted-glass header and raised bottom controls, soft diffused grounded shadows, thin luminous edges; readable opaque ivory panels behind text and numbers. Restrained rounded corners, calm warmth, precise editorial rhythm, food photographs richly natural and appetising. Tiny smoky iridescence ONLY on voice AI orb / AI illustration; no rainbow decoration elsewhere. Restaurant name may use a refined Japanese serif, all functional UI stays sans. No wood background, no coarse texture, no neon, no metallic chrome. Looks sophisticated, welcoming and usable, with lightness and dimensionality visible at a glance.
```

## Bの表現

```text
ART DIRECTION B — PLAYFUL, COLOURFUL, CONFIDENT. Redesign the supplied UI reference into a genuinely different visual personality while retaining every object, Japanese label, numeric datum and information hierarchy. Contemporary friendly food-and-hospitality app with warm white canvas, bright ripe-persimmon orange primary actions, rich petrol/teal text and navigation selection, a few very pale peach and seafoam surfaces. Orange is the brand action, amber with an exclamation is attention, dark red with error text is an error. Make interaction unmistakable. Clear ink, bolder expressive sans headings, generous rounded 20px panels, tactile crisp buttons, small delightful geometric accents only where they help the AI illustration. Use translucent lightly tinted glass ONLY in the header and action shelf, solid readable content surfaces elsewhere. Less diffuse shadow and less beige than A; high-contrast direct controls and a buoyant rhythm. Elegant playful adult dining, not childish, no candy overload, no emoji, no rainbow backgrounds. Keep the food real and appetising. Voice orb stays a flat white circle with a restrained smoke ring and microphone, not a face or sphere. A food-led, joyful but efficient product, not a toy.
```

## Cの表現

```text
ART DIRECTION C — QUIET FUTURE, PRECISE GLASS. Redesign the supplied UI reference into a genuinely different visual personality while retaining every object, Japanese label, numeric datum and information hierarchy. Luminous pearl-white and cool mist-gray canvas, sharp charcoal/black typography, black or deep charcoal primary buttons, restrained silver-frost glass navigation and action shelf, subtle edge refraction and soft cool depth. Restrained small green success dots, amber attention and dark red errors remain meaningful; no decorative brand color. Precise sans typography, refined thin hairline separators, excellent alignment, generous optical spacing. Less pill-like than playful B, more architectural, with controlled nested corner radii and very clear elevation. A beautifully designed calm contemporary utility interface, not sci-fi HUD, not cyberpunk, no dark mode, no glossy chrome, no jewel orbs, no oversized luminous rings. Keep natural food photography rich and warm against the cool neutral UI. Voice orb stays a white flat circle with subtle smoke ring and microphone. Functional controls feel optically light yet clearly pressable.
```

## 客向け写真枠の追加指示

```text
CRITICAL FOOD PHOTO CORRECTION for guest screen: each food photograph must be a SQUARE image tile, roughly 140–160 CSS px per side within a wider card, centered above its name. Do not stretch a photo to the entire wide card. Show the entire ceramic plate with a little light background around it, no cropped plate edges and no text overlay. Make top menu heading and category area compact enough to fit four cards, names/prices/actions and the persistent review shelf on screen. The card can be wider than its image. Preserve exactly four cards and original prices, quantities, text, conversation and 40/60 split.
```

## A客向けの修正プロンプト

```text
Precisely refine this TableCast guest UI concept. Keep the warm refined glass art direction, all text and data, and the existing 40/60 conversation/menu split. CRITICAL FOOD PHOTO CORRECTION for guest screen: each food photograph must be a SQUARE image tile, roughly 140–160 CSS px per side within a wider card, centered above its name. Do not stretch a photo to the entire wide card. Show the entire ceramic plate with a little light background around it, no cropped plate edges and no text overlay. Make top menu heading and category area compact enough to fit four cards, names/prices/actions and the persistent review shelf on screen. The card can be wider than its image. Preserve exactly four cards and original prices, quantities, text, conversation and 40/60 split.
```

## 呼出しの構成

- A客向け初回: 客向け共通 + A。新規生成。
- A店舗向け: 店舗向け共通 + A。新規生成。
- A客向け最終: A客向け初回を参照し、上記修正プロンプトで編集。
- B/C客向け: A客向け初回を参照し、客向け共通 + 各表現 + 写真枠の追加指示で編集。
- B/C店舗向け: A店舗向けを参照し、店舗向け共通 + 各表現で編集。
- 全呼出しで `transparent_background: false`。
