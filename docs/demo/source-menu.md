# メニュー設定デモの入力資料

[デモ資料](README.md) / [店舗設定](stores.md) / [資料から設定するシナリオ](scenarios.md#6-店舗資料から日英メニューを設定する)

## 資料の位置付け

2026-09-13時点の[合成fixture](../../scripts/tablecast-fixtures.ts)から、3店舗の代表商品を各4品抜粋した架空の入力資料。氏名・店名・商品・レシピ・価格は実店舗の情報ではない。日英名称・価格・選択肢・原材料の確認状態はfixtureの値を転載しており、録画時は現在の公開版と照合する。

この資料をChatGPT/Codexへ渡し、現在のschemaでメニュー下書きを作る。対象店舗を一つ選び、この資料にない既存商品・カテゴリ・プラン・接客設定は保持する。資料の12品だけで全設定を置き換えない。商品IDと選択肢IDは既存項目との対応用であり、客向けの表示や音声に出さない。

[店内の生成画像](assets/README.md)に写る紙面は質感・配色の参考資料であり、そこから読み取れる商品名・価格・原材料を設定根拠にしない。商品画像も構成・量・含有材料の証明にはならない。バーガーにはfixture上でピクルスやソースを含むが、画像で全材料を視認できるとは限らない。

## 読み取りの約束

- 基本価格と選択肢の増減額を分け、APIの価格計算へ渡す。選択肢が必須でも勝手に既定選択したことにはしない。
- `evidence: verified`は合成レシピの登録確認を表す。実店舗の確認・検査・安全保証ではない。`unknown`と空の含有一覧を、含有なしと断定しない。
- 原材料の注意書き、交差接触、ヴィーガン適合をそれぞれ保持する。宗教適合を資料にない推測で追加しない。
- 商品画像の`imageKind`は`illustration`。新しい画像の取込は別機能であり、この資料では配信済みの画像参照を使う。
- 変更案は下書きへ保存し、検証・差分確認・管理者の明示公開を経る。

## 京料理こもれび四条店

英語案内名: Komorebi Shijo。対象店舗ID: `tablecast-komorebi`。以下は抜粋4品であり、店舗の全商品ではない。

| 商品ID                              | 日本語名 / English                                       | 基本価格 | 販売状態 |
| ----------------------------------- | -------------------------------------------------------- | -------- | -------- |
| `tablecast-komorebi-sake-tsukinagi` | こもれび 月凪 純米吟醸 / Komorebi Tsukinagi Junmai ginjo | 620円    | 販売中   |
| `tablecast-komorebi-sashimi`        | お造り三種盛り / Three-fish sashimi selection            | 1,280円  | 販売中   |
| `tablecast-komorebi-karaage`        | 鶏の唐揚げ / Japanese fried chicken                      | 720円    | 販売中   |
| `tablecast-komorebi-edamame`        | 枝豆 / Edamame beans                                     | 390円    | 販売中   |

### こもれび 月凪 純米吟醸

| 項目                   | 登録内容                                                                                                                                                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 商品ID                 | `tablecast-komorebi-sake-tsukinagi`                                                                                                                                                                                                                                                    |
| 日本語の読上げ名       | こもれび つきなぎ 純米吟醸                                                                                                                                                                                                                                                             |
| 英語の読上げ名         | Komorebi Tsukinagi, Junmai ginjo                                                                                                                                                                                                                                                       |
| 日本語の説明           | 青りんごを思わせる香りと軽い後口。表示価格は60mlです。                                                                                                                                                                                                                                 |
| 英語の説明             | green-apple aromas and a light finish. The displayed price is for 60ml.                                                                                                                                                                                                                |
| 選択グループ           | 日本酒の温度 (`tablecast-komorebi-temperature`)、日本酒の容量 (`tablecast-komorebi-serving`)                                                                                                                                                                                           |
| 含有の登録一覧         | 空の一覧                                                                                                                                                                                                                                                                               |
| 原材料の確認状態       | `evidence: verified`                                                                                                                                                                                                                                                                   |
| 交差接触               | `crossContact: unknown`                                                                                                                                                                                                                                                                |
| ヴィーガン適合         | `vegan: unknown`                                                                                                                                                                                                                                                                       |
| 日本語の原材料注意書き | 合成デモの登録原材料・調理情報：純米吟醸。製造原材料の詳細は未登録です。選択・追加品による成分の違いと、製造・調理・提供時の混入は未確認です。アレルギーはスタッフにご確認ください。                                                                                                   |
| 英語の原材料注意書き   | Recorded ingredients and preparation for this fictional demo: Junmai ginjo; detailed production ingredients are not recorded. Ingredient changes from options or extras and cross-contact during production, preparation and service are unverified. Please ask staff about allergies. |
| 商品画像               | `tablecast/images/b56204c54710ee9105543447abddd11a726ec21576c275de3213aaa97102cb36.webp` / `illustration`                                                                                                                                                                              |

### お造り三種盛り

| 項目                   | 登録内容                                                                                                                                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 商品ID                 | `tablecast-komorebi-sashimi`                                                                                                                                                                                                                                                        |
| 日本語の読上げ名       | おつくり三種盛り                                                                                                                                                                                                                                                                    |
| 英語の読上げ名         | Three-fish sashimi selection                                                                                                                                                                                                                                                        |
| 日本語の説明           | まぐろ・さけ・たいを各三切れ盛り合わせます。                                                                                                                                                                                                                                        |
| 英語の説明             | Three slices each of tuna, salmon and sea bream, served raw.                                                                                                                                                                                                                        |
| 選択グループ           | 薬味の別添え (`tablecast-komorebi-garnish`)                                                                                                                                                                                                                                         |
| 含有の登録一覧         | fish                                                                                                                                                                                                                                                                                |
| 原材料の確認状態       | `evidence: verified`                                                                                                                                                                                                                                                                |
| 交差接触               | `crossContact: unknown`                                                                                                                                                                                                                                                             |
| ヴィーガン適合         | `vegan: unknown`                                                                                                                                                                                                                                                                    |
| 日本語の原材料注意書き | 合成デモの登録原材料・調理情報：まぐろ・さけ・たいを各三切れ盛り合わせます。選択・追加品による成分の違いと、製造・調理・提供時の混入は未確認です。アレルギーはスタッフにご確認ください。                                                                                            |
| 英語の原材料注意書き   | Recorded ingredients and preparation for this fictional demo: Three slices each of tuna, salmon and sea bream, served raw. Ingredient changes from options or extras and cross-contact during production, preparation and service are unverified. Please ask staff about allergies. |
| 商品画像               | `tablecast/images/9d4e39a8d3dc559e678f548488255783fdb1db49a84654375bf4d9aedb76dbda.webp` / `illustration`                                                                                                                                                                           |

### 鶏の唐揚げ

| 項目                   | 登録内容                                                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 商品ID                 | `tablecast-komorebi-karaage`                                                                                                                                                                                                                                                                |
| 日本語の読上げ名       | 鶏の唐揚げ                                                                                                                                                                                                                                                                                  |
| 英語の読上げ名         | Japanese fried chicken                                                                                                                                                                                                                                                                      |
| 日本語の説明           | 鶏もも肉を小麦粉としょうゆの衣で揚げた五個盛りです。                                                                                                                                                                                                                                        |
| 英語の説明             | Five pieces of chicken thigh fried in a wheat-flour and soy coating.                                                                                                                                                                                                                        |
| 選択グループ           | 味付け (`tablecast-komorebi-seasoning`)、辛さ (`tablecast-komorebi-spice`)                                                                                                                                                                                                                  |
| 含有の登録一覧         | wheat, soya                                                                                                                                                                                                                                                                                 |
| 原材料の確認状態       | `evidence: verified`                                                                                                                                                                                                                                                                        |
| 交差接触               | `crossContact: unknown`                                                                                                                                                                                                                                                                     |
| ヴィーガン適合         | `vegan: unknown`                                                                                                                                                                                                                                                                            |
| 日本語の原材料注意書き | 合成デモの登録原材料・調理情報：鶏もも肉を小麦粉としょうゆの衣で揚げた五個盛りです。選択・追加品による成分の違いと、製造・調理・提供時の混入は未確認です。アレルギーはスタッフにご確認ください。                                                                                            |
| 英語の原材料注意書き   | Recorded ingredients and preparation for this fictional demo: Five pieces of chicken thigh fried in a wheat-flour and soy coating. Ingredient changes from options or extras and cross-contact during production, preparation and service are unverified. Please ask staff about allergies. |
| 商品画像               | `tablecast/images/14d89e5f7bdb1afff895949e63e5d3caa5a65bd9ff246664b3e68179f271f348.webp` / `illustration`                                                                                                                                                                                   |

### 枝豆

| 項目                   | 登録内容                                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 商品ID                 | `tablecast-komorebi-edamame`                                                                                                                                                                                                                              |
| 日本語の読上げ名       | 枝豆                                                                                                                                                                                                                                                      |
| 英語の読上げ名         | Edamame beans                                                                                                                                                                                                                                             |
| 日本語の説明           | 大豆を塩ゆでします。                                                                                                                                                                                                                                      |
| 英語の説明             | Soya beans boiled in salted water.                                                                                                                                                                                                                        |
| 選択グループ           | なし                                                                                                                                                                                                                                                      |
| 含有の登録一覧         | soya                                                                                                                                                                                                                                                      |
| 原材料の確認状態       | `evidence: verified`                                                                                                                                                                                                                                      |
| 交差接触               | `crossContact: unknown`                                                                                                                                                                                                                                   |
| ヴィーガン適合         | `vegan: unknown`                                                                                                                                                                                                                                          |
| 日本語の原材料注意書き | 合成デモの登録原材料・調理情報：大豆を塩ゆでします。選択・追加品による成分の違いと、製造・調理・提供時の混入は未確認です。アレルギーはスタッフにご確認ください。                                                                                          |
| 英語の原材料注意書き   | Recorded ingredients and preparation for this fictional demo: Soya beans boiled in salted water. Ingredient changes from options or extras and cross-contact during production, preparation and service are unverified. Please ask staff about allergies. |
| 商品画像               | `tablecast/images/5ae62242a1050f3f3dd54c371dfb8f9406a8e9dfe5e3d534a295247768567daf.webp` / `illustration`                                                                                                                                                 |

### 共通の選択グループ

同じIDのグループは複数の商品で共有する。商品ごとの適用先は上の表に従う。最小・最大は選択数または数量の合計、選択肢の最大数量はその候補の上限である。

#### 日本酒の温度 / Sake temperature

ID: `tablecast-komorebi-temperature`。種類: `single`。最小: 1、最大: 1。

| 選択肢ID                                 | 日本語名 / English      | 価格増減 | 最大数量 | 利用可否 | 前提 / 排他 |
| ---------------------------------------- | ----------------------- | -------- | -------- | -------- | ----------- |
| `tablecast-komorebi-temperature-chilled` | 冷酒 / Chilled          | 0円      | 1        | 可       | なし / なし |
| `tablecast-komorebi-temperature-room`    | 常温 / Room temperature | 0円      | 1        | 可       | なし / なし |
| `tablecast-komorebi-temperature-warm`    | ぬる燗 / Gently warmed  | 0円      | 1        | 可       | なし / なし |
| `tablecast-komorebi-temperature-hot`     | 熱燗 / Hot sake         | 0円      | 1        | 可       | なし / なし |

#### 日本酒の容量 / Sake serving

ID: `tablecast-komorebi-serving`。種類: `single`。最小: 1、最大: 1。

| 選択肢ID                             | 日本語名 / English                                                    | 価格増減 | 最大数量 | 利用可否 | 前提 / 排他 |
| ------------------------------------ | --------------------------------------------------------------------- | -------- | -------- | -------- | ----------- |
| `tablecast-komorebi-serving-taster`  | お試し 六十ミリリットル / Taster, sixty millilitres                   | 0円      | 1        | 可       | なし / なし |
| `tablecast-komorebi-serving-glass`   | グラス 九十ミリリットル / Glass, ninety millilitres                   | +160円   | 1        | 可       | なし / なし |
| `tablecast-komorebi-serving-tokkuri` | 一合 百八十ミリリットル / Tokkuri, one hundred and eighty millilitres | +520円   | 1        | 可       | なし / なし |
| `tablecast-komorebi-serving-carafe`  | 小瓶 三百ミリリットル / Carafe, three hundred millilitres             | +980円   | 1        | 可       | なし / なし |

#### 薬味の別添え / Garnishes on the side

ID: `tablecast-komorebi-garnish`。種類: `multiple`。最小: 0、最大: 3。

| 選択肢ID                            | 日本語名 / English | 価格増減 | 最大数量 | 利用可否 | 前提 / 排他 |
| ----------------------------------- | ------------------ | -------- | -------- | -------- | ----------- |
| `tablecast-komorebi-garnish-ginger` | しょうが / Ginger  | 0円      | 1        | 可       | なし / なし |
| `tablecast-komorebi-garnish-wasabi` | わさび / Wasabi    | 0円      | 1        | 可       | なし / なし |
| `tablecast-komorebi-garnish-shiso`  | 大葉 / Shiso leaf  | +30円    | 1        | 不可     | なし / なし |
| `tablecast-komorebi-garnish-lemon`  | レモン / Lemon     | +30円    | 1        | 可       | なし / なし |

#### 味付け / Seasoning

ID: `tablecast-komorebi-seasoning`。種類: `single`。最小: 1、最大: 1。

| 選択肢ID                             | 日本語名 / English      | 価格増減 | 最大数量 | 利用可否 | 前提 / 排他 |
| ------------------------------------ | ----------------------- | -------- | -------- | -------- | ----------- |
| `tablecast-komorebi-seasoning-salt`  | 塩 / Salt               | 0円      | 1        | 可       | なし / なし |
| `tablecast-komorebi-seasoning-tare`  | たれ / Sweet soy glaze  | 0円      | 1        | 可       | なし / なし |
| `tablecast-komorebi-seasoning-ponzu` | ポン酢 / Citrus ponzu   | 0円      | 1        | 可       | なし / なし |
| `tablecast-komorebi-seasoning-plain` | 味付けなし / Unseasoned | 0円      | 1        | 可       | なし / なし |

#### 辛さ / Spice level

ID: `tablecast-komorebi-spice`。種類: `single`。最小: 0、最大: 1。

| 選択肢ID                          | 日本語名 / English   | 価格増減 | 最大数量 | 利用可否 | 前提 / 排他 |
| --------------------------------- | -------------------- | -------- | -------- | -------- | ----------- |
| `tablecast-komorebi-spice-none`   | 辛味なし / No chilli | 0円      | 1        | 可       | なし / なし |
| `tablecast-komorebi-spice-light`  | 控えめ / Mild        | 0円      | 1        | 可       | なし / なし |
| `tablecast-komorebi-spice-medium` | 中辛 / Medium        | 0円      | 1        | 可       | なし / なし |
| `tablecast-komorebi-spice-hot`    | 辛口 / Hot           | +40円    | 1        | 可       | なし / なし |

## Westward Burgers Kyoto

対象店舗ID: `tablecast-koharu`。以下は抜粋4品であり、店舗の全商品ではない。

| 商品ID                              | 日本語名 / English                                                       | 基本価格 | 販売状態 |
| ----------------------------------- | ------------------------------------------------------------------------ | -------- | -------- |
| `tablecast-koharu-westward-classic` | ウエストワード・カスタムバーガー / Westward custom burger                | 1,380円  | 販売中   |
| `tablecast-koharu-mushroom-burger`  | きのこと植物由来パティのバーガー / Mushroom and plant-based patty burger | 1,480円  | 販売中   |
| `tablecast-koharu-fries`            | シーソルトフライ / Sea-salt fries                                        | 580円    | 販売中   |
| `tablecast-koharu-westward-ipa`     | パシフィック・ウエストコーストIPA / Pacific West Coast IPA               | 880円    | 販売中   |

### ウエストワード・カスタムバーガー

| 項目                   | 登録内容                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 商品ID                 | `tablecast-koharu-westward-classic`                                                                                                                                                                                                                                                                                 |
| 日本語の読上げ名       | ウエストワード・カスタムバーガー                                                                                                                                                                                                                                                                                    |
| 英語の読上げ名         | Westward custom burger                                                                                                                                                                                                                                                                                              |
| 日本語の説明           | ブリオッシュ、ビーフ、チェダー、レタス、トマト、玉ねぎ、ピクルス、卵入りソース。パティは十分に加熱します                                                                                                                                                                                                            |
| 英語の説明             | Brioche, fully cooked beef, cheddar, lettuce, tomato, onion, pickles and an egg-based sauce                                                                                                                                                                                                                         |
| 選択グループ           | バンズ (`tablecast-koharu-bun`)、パティ (`tablecast-koharu-patty`)、チーズ (`tablecast-koharu-cheese`)、抜く具材 (`tablecast-koharu-omit`)、ソース (`tablecast-koharu-sauce`)、追加トッピング (`tablecast-koharu-extras`)                                                                                           |
| 含有の登録一覧         | wheat, egg, milk, mustard                                                                                                                                                                                                                                                                                           |
| 原材料の確認状態       | `evidence: verified`                                                                                                                                                                                                                                                                                                |
| 交差接触               | `crossContact: unknown`                                                                                                                                                                                                                                                                                             |
| ヴィーガン適合         | `vegan: unknown`                                                                                                                                                                                                                                                                                                    |
| 日本語の原材料注意書き | 合成デモの登録原材料・調理情報：ブリオッシュ、ビーフ、チェダー、レタス、トマト、玉ねぎ、ピクルス、卵入りソース。パティは十分に加熱します。選択・追加品による成分の違いと、製造・調理・提供時の混入は未確認です。アレルギーはスタッフにご確認ください。                                                              |
| 英語の原材料注意書き   | Recorded ingredients and preparation for this fictional demo: Brioche, fully cooked beef, cheddar, lettuce, tomato, onion, pickles and an egg-based sauce. Ingredient changes from options or extras and cross-contact during production, preparation and service are unverified. Please ask staff about allergies. |
| 商品画像               | `tablecast/images/3b22eadd0f9ca04068faabe4cebc9524c83eaadff50f78f566c7759c5c6db2e2.webp` / `illustration`                                                                                                                                                                                                           |

### きのこと植物由来パティのバーガー

| 項目                   | 登録内容                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 商品ID                 | `tablecast-koharu-mushroom-burger`                                                                                                                                                                                                                                                                                                                                          |
| 日本語の読上げ名       | きのこと植物由来パティのバーガー                                                                                                                                                                                                                                                                                                                                            |
| 英語の読上げ名         | Mushroom and plant-based patty burger                                                                                                                                                                                                                                                                                                                                       |
| 日本語の説明           | 植物由来パティ、きのこ、ブリオッシュ、チェダー、野菜、卵入りソース。ヴィーガン対応や製造原材料の詳細は未確認です                                                                                                                                                                                                                                                            |
| 英語の説明             | Plant-based patty, mushrooms, brioche, cheddar, vegetables and an egg-based sauce; vegan suitability and full production ingredients are unverified                                                                                                                                                                                                                         |
| 選択グループ           | バンズ (`tablecast-koharu-bun`)、チーズ (`tablecast-koharu-cheese`)、抜く具材 (`tablecast-koharu-omit`)、ソース (`tablecast-koharu-sauce`)、追加トッピング (`tablecast-koharu-extras`)                                                                                                                                                                                      |
| 含有の登録一覧         | 空の一覧                                                                                                                                                                                                                                                                                                                                                                    |
| 原材料の確認状態       | `evidence: unknown`                                                                                                                                                                                                                                                                                                                                                         |
| 交差接触               | `crossContact: unknown`                                                                                                                                                                                                                                                                                                                                                     |
| ヴィーガン適合         | `vegan: unknown`                                                                                                                                                                                                                                                                                                                                                            |
| 日本語の原材料注意書き | 合成デモの登録原材料・調理情報：植物由来パティ、きのこ、ブリオッシュ、チェダー、野菜、卵入りソース。ヴィーガン対応や製造原材料の詳細は未確認です。選択・追加品による成分の違いと、製造・調理・提供時の混入は未確認です。アレルギーはスタッフにご確認ください。                                                                                                              |
| 英語の原材料注意書き   | Recorded ingredients and preparation for this fictional demo: Plant-based patty, mushrooms, brioche, cheddar, vegetables and an egg-based sauce; vegan suitability and full production ingredients are unverified. Ingredient changes from options or extras and cross-contact during production, preparation and service are unverified. Please ask staff about allergies. |
| 商品画像               | 画像なし / `illustration`                                                                                                                                                                                                                                                                                                                                                   |

### シーソルトフライ

| 項目                   | 登録内容                                                                                                                                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 商品ID                 | `tablecast-koharu-fries`                                                                                                                                                                                                                                                          |
| 日本語の読上げ名       | シーソルトフライ                                                                                                                                                                                                                                                                  |
| 英語の読上げ名         | Sea-salt fries                                                                                                                                                                                                                                                                    |
| 日本語の説明           | じゃがいもと塩。揚げ油は他の商品と共用します                                                                                                                                                                                                                                      |
| 英語の説明             | Potatoes and salt; frying oil is shared with other dishes                                                                                                                                                                                                                         |
| 選択グループ           | 追加トッピング (`tablecast-koharu-extras`)                                                                                                                                                                                                                                        |
| 含有の登録一覧         | 空の一覧                                                                                                                                                                                                                                                                          |
| 原材料の確認状態       | `evidence: verified`                                                                                                                                                                                                                                                              |
| 交差接触               | `crossContact: unknown`                                                                                                                                                                                                                                                           |
| ヴィーガン適合         | `vegan: unknown`                                                                                                                                                                                                                                                                  |
| 日本語の原材料注意書き | 合成デモの登録原材料・調理情報：じゃがいもと塩。揚げ油は他の商品と共用します。選択・追加品による成分の違いと、製造・調理・提供時の混入は未確認です。アレルギーはスタッフにご確認ください。                                                                                        |
| 英語の原材料注意書き   | Recorded ingredients and preparation for this fictional demo: Potatoes and salt; frying oil is shared with other dishes. Ingredient changes from options or extras and cross-contact during production, preparation and service are unverified. Please ask staff about allergies. |
| 商品画像               | 画像なし / `illustration`                                                                                                                                                                                                                                                         |

### パシフィック・ウエストコーストIPA

| 項目                   | 登録内容                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 商品ID                 | `tablecast-koharu-westward-ipa`                                                                                                                                                                                                                                                                                                          |
| 日本語の読上げ名       | パシフィック・ウエストコーストIPA                                                                                                                                                                                                                                                                                                        |
| 英語の読上げ名         | Pacific West Coast IPA                                                                                                                                                                                                                                                                                                                   |
| 日本語の説明           | 架空銘柄。麦芽とホップ、柑橘を思わせる香りと明瞭な苦味。アルコール6.5%。基本容量280ml                                                                                                                                                                                                                                                    |
| 英語の説明             | Fictional beer brewed with malt and hops, citrus-like aromas and a firm bitterness; 6.5% ABV, base serving 280ml                                                                                                                                                                                                                         |
| 選択グループ           | ビールの容量 (`tablecast-koharu-beer-serving`)                                                                                                                                                                                                                                                                                           |
| 含有の登録一覧         | barley                                                                                                                                                                                                                                                                                                                                   |
| 原材料の確認状態       | `evidence: verified`                                                                                                                                                                                                                                                                                                                     |
| 交差接触               | `crossContact: unknown`                                                                                                                                                                                                                                                                                                                  |
| ヴィーガン適合         | `vegan: unknown`                                                                                                                                                                                                                                                                                                                         |
| 日本語の原材料注意書き | 合成デモの登録原材料・調理情報：架空銘柄。麦芽とホップ、柑橘を思わせる香りと明瞭な苦味。アルコール6.5%。基本容量280ml。選択・追加品による成分の違いと、製造・調理・提供時の混入は未確認です。アレルギーはスタッフにご確認ください。                                                                                                      |
| 英語の原材料注意書き   | Recorded ingredients and preparation for this fictional demo: Fictional beer brewed with malt and hops, citrus-like aromas and a firm bitterness; 6.5% ABV, base serving 280ml. Ingredient changes from options or extras and cross-contact during production, preparation and service are unverified. Please ask staff about allergies. |
| 商品画像               | `tablecast/images/80e121f64893796ed12c29c753c21a11d852f2c304a1e66c04f39335c20cfb1b.webp` / `illustration`                                                                                                                                                                                                                                |

### 共通の選択グループ

同じIDのグループは複数の商品で共有する。商品ごとの適用先は上の表に従う。最小・最大は選択数または数量の合計、選択肢の最大数量はその候補の上限である。

#### バンズ / Bun

ID: `tablecast-koharu-bun`。種類: `single`。最小: 1、最大: 1。

| 選択肢ID                         | 日本語名 / English        | 価格増減 | 最大数量 | 利用可否 | 前提 / 排他 |
| -------------------------------- | ------------------------- | -------- | -------- | -------- | ----------- |
| `tablecast-koharu-bun-brioche`   | ブリオッシュ / Brioche    | 0円      | 1        | 可       | なし / なし |
| `tablecast-koharu-bun-wholemeal` | 全粒粉 / Wholemeal        | +50円    | 1        | 可       | なし / なし |
| `tablecast-koharu-bun-lettuce`   | レタス包み / Lettuce wrap | -100円   | 1        | 可       | なし / なし |

#### パティ / Patty

ID: `tablecast-koharu-patty`。種類: `single`。最小: 1、最大: 1。

| 選択肢ID                       | 日本語名 / English                 | 価格増減 | 最大数量 | 利用可否 | 前提 / 排他 |
| ------------------------------ | ---------------------------------- | -------- | -------- | -------- | ----------- |
| `tablecast-koharu-patty-beef`  | ビーフ / Beef                      | 0円      | 1        | 可       | なし / なし |
| `tablecast-koharu-patty-plant` | 植物由来パティ / Plant-based patty | +150円   | 1        | 可       | なし / なし |

#### チーズ / Cheese

ID: `tablecast-koharu-cheese`。種類: `single`。最小: 1、最大: 1。

| 選択肢ID                              | 日本語名 / English             | 価格増減 | 最大数量 | 利用可否 | 前提 / 排他 |
| ------------------------------------- | ------------------------------ | -------- | -------- | -------- | ----------- |
| `tablecast-koharu-cheese-cheddar`     | チェダー / Cheddar             | 0円      | 1        | 可       | なし / なし |
| `tablecast-koharu-cheese-none`        | チーズなし / No cheese         | -100円   | 1        | 可       | なし / なし |
| `tablecast-koharu-cheese-pepper-jack` | ペッパージャック / Pepper Jack | +80円    | 1        | 可       | なし / なし |

#### 抜く具材 / Ingredients to leave out

ID: `tablecast-koharu-omit`。種類: `multiple`。最小: 0、最大: 3。

| 選択肢ID                       | 日本語名 / English        | 価格増減 | 最大数量 | 利用可否 | 前提 / 排他 |
| ------------------------------ | ------------------------- | -------- | -------- | -------- | ----------- |
| `tablecast-koharu-omit-onion`  | 玉ねぎ抜き / No onion     | 0円      | 1        | 可       | なし / なし |
| `tablecast-koharu-omit-tomato` | トマト抜き / No tomato    | 0円      | 1        | 可       | なし / なし |
| `tablecast-koharu-omit-pickle` | ピクルス抜き / No pickles | 0円      | 1        | 可       | なし / なし |

#### ソース / Sauce

ID: `tablecast-koharu-sauce`。種類: `single`。最小: 1、最大: 1。

| 選択肢ID                         | 日本語名 / English         | 価格増減 | 最大数量 | 利用可否 | 前提 / 排他 |
| -------------------------------- | -------------------------- | -------- | -------- | -------- | ----------- |
| `tablecast-koharu-sauce-house`   | ハウスソース / House sauce | 0円      | 1        | 可       | なし / なし |
| `tablecast-koharu-sauce-mustard` | マスタード / Mustard       | 0円      | 1        | 可       | なし / なし |
| `tablecast-koharu-sauce-bbq`     | スモーキーBBQ / Smoky BBQ  | +50円    | 1        | 可       | なし / なし |

#### 追加トッピング / Extra toppings

ID: `tablecast-koharu-extras`。種類: `quantity`。最小: 0、最大: 4。

| 選択肢ID                          | 日本語名 / English           | 価格増減 | 最大数量 | 利用可否 | 前提 / 排他 |
| --------------------------------- | ---------------------------- | -------- | -------- | -------- | ----------- |
| `tablecast-koharu-extras-cheddar` | チェダー追加 / Extra cheddar | +150円   | 2        | 可       | なし / なし |
| `tablecast-koharu-extras-avocado` | アボカド / Avocado           | +200円   | 2        | 可       | なし / なし |
| `tablecast-koharu-extras-bacon`   | ベーコン / Bacon             | +250円   | 2        | 可       | なし / なし |

#### ビールの容量 / Beer serving

ID: `tablecast-koharu-beer-serving`。種類: `single`。最小: 1、最大: 1。

| 選択肢ID                              | 日本語名 / English                                                  | 価格増減 | 最大数量 | 利用可否 | 前提 / 排他 |
| ------------------------------------- | ------------------------------------------------------------------- | -------- | -------- | -------- | ----------- |
| `tablecast-koharu-beer-serving-small` | 二百八十ミリリットル / Two hundred and eighty millilitres           | 0円      | 1        | 可       | なし / なし |
| `tablecast-koharu-beer-serving-pint`  | 四百七十三ミリリットル / Four hundred and seventy-three millilitres | +300円   | 1        | 可       | なし / なし |

## 韓国食堂ハヌル三条店

対象店舗ID: `tablecast-hanul`。以下は抜粋4品であり、全30商品を置き換えない。

| 商品ID                           | 日本語名 / English                                                         | 基本価格 | 販売状態 |
| -------------------------------- | -------------------------------------------------------------------------- | -------- | -------- |
| `tablecast-hanul-samgyeopsal`    | サムギョプサル 卓上焼きセット 二人前 / Samgyeopsal table-grill set for two | 2,680円  | 販売中   |
| `tablecast-hanul-seafood-pajeon` | 海鮮ねぎチヂミ 八切れ / Seafood and spring-onion pajeon, eight pieces      | 1,080円  | 販売中   |
| `tablecast-hanul-sundubu`        | 海鮮スンドゥブチゲ / Seafood sundubu jjigae                                | 1,080円  | 販売中   |
| `tablecast-hanul-rice-makgeolli` | ハヌル お米のマッコリ / Hanul rice makgeolli                               | 880円    | 販売中   |

### サムギョプサル 卓上焼きセット 二人前

| 項目                     | 登録内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 商品ID                   | `tablecast-hanul-samgyeopsal`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 日本語の読上げ名         | サムギョプサル 卓上焼きセット 二人前                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 日本語の説明             | 豚ばら肉300g、サンチュ6枚、にんにく、みそだれ。みそだれは大豆と小麦を含みます。基本は控えめな刺激があります。辛味なしの保証ではありません。卓上加熱はスタッフが操作します。肉は中心まで十分に加熱し、生肉用トングと食用を分けます。熱い鉄板や加熱機器に触れず、調整はスタッフを呼んでください。架空デモの登録材料です。調味料の全成分・選択変更による成分差・交差接触は未確認です。ハラール、コーシャ等の宗教認証とヴィーガン適合は未確認です。材料名や肉抜きだけで適合を保証せず、スタッフへ確認してください。                                                                                                                    |
| 英語の読上げ名           | Samgyeopsal table-grill set for two                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 英語の説明               | 300g of pork belly, six lettuce leaves, garlic and ssamjang containing soya and wheat. Mild by default; this is not a promise of no heat. Staff operate the tabletop heater. Meat must be thoroughly cooked through, with separate raw-meat and eating utensils. Do not touch the hot pan or heater; ask staff to adjust it. These are recorded ingredients for a fictional demo. Full condiment ingredients, changes from options and cross-contact are unverified. Halal, kosher and other religious certification, and vegan suitability, are unverified. Ingredients or removing meat do not guarantee suitability; ask staff. |
| 選択グループ             | 包み野菜 (`tablecast-hanul-wraps`), みそだれ (`tablecast-hanul-ssamjang`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 含有の登録一覧           | soya, wheat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 原材料の確認状態         | `verified`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 交差接触・ヴィーガン適合 | ともに `unknown`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 商品画像                 | `tablecast/images/8c69ed040395936dbe9cf17660ad8dce32e41628bc1b786475c2435f335eeb9e.webp` / `illustration`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### 海鮮ねぎチヂミ 八切れ

| 項目                     | 登録内容                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 商品ID                   | `tablecast-hanul-seafood-pajeon`                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 日本語の読上げ名         | 海鮮ねぎチヂミ 八切れ                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 日本語の説明             | 海老、いか、ねぎ、小麦粉、卵を焼き、八切れに分けます。基本は唐辛子の辛さなし。選ぶソースにより変わります。架空デモの登録材料です。調味料の全成分・選択変更による成分差・交差接触は未確認です。ハラール、コーシャ等の宗教認証とヴィーガン適合は未確認です。材料名や肉抜きだけで適合を保証せず、スタッフへ確認してください。                                                                                                                                        |
| 英語の読上げ名           | Seafood and spring-onion pajeon, eight pieces                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 英語の説明               | Prawns, squid, spring onion, wheat flour and egg cooked as a pancake and cut into eight pieces. No chilli heat by default; selected sauces may change this. These are recorded ingredients for a fictional demo. Full condiment ingredients, changes from options and cross-contact are unverified. Halal, kosher and other religious certification, and vegan suitability, are unverified. Ingredients or removing meat do not guarantee suitability; ask staff. |
| 選択グループ             | つけだれ (`tablecast-hanul-dip`)                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 含有の登録一覧           | crustaceans, molluscs, wheat, egg                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 原材料の確認状態         | `verified`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 交差接触・ヴィーガン適合 | ともに `unknown`                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 商品画像                 | `tablecast/images/d38b1dd739cc8f3666fa5eb84b7d22479323a8fc5a1ca09ba9c523c07b58b559.webp` / `illustration`                                                                                                                                                                                                                                                                                                                                                         |

### 海鮮スンドゥブチゲ

| 項目                     | 登録内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 商品ID                   | `tablecast-hanul-sundubu`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 日本語の読上げ名         | 海鮮スンドゥブチゲ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 日本語の説明             | やわらかい豆腐、あさり、海老、卵、玉ねぎを唐辛子の出汁で煮込み、卵は十分に加熱します。基本は唐辛子の辛味があります。控えめを選んでも辛味は残ります。鍋と出汁は熱くなっています。器に触れず、取り分けや移動はスタッフにご相談ください。架空デモの登録材料です。調味料の全成分・選択変更による成分差・交差接触は未確認です。ハラール、コーシャ等の宗教認証とヴィーガン適合は未確認です。材料名や肉抜きだけで適合を保証せず、スタッフへ確認してください。                                                                                                                         |
| 英語の読上げ名           | Seafood sundubu jjigae                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 英語の説明               | Soft tofu, clams, prawns, egg and onion simmered in chilli broth; the egg is fully cooked. Contains chilli heat by default; a milder selection still contains chilli. The bowl and broth are hot. Avoid touching the vessel and ask staff for help sharing or moving it. These are recorded ingredients for a fictional demo. Full condiment ingredients, changes from options and cross-contact are unverified. Halal, kosher and other religious certification, and vegan suitability, are unverified. Ingredients or removing meat do not guarantee suitability; ask staff. |
| 選択グループ             | 辛さ (`tablecast-hanul-spice`), 追加トッピング (`tablecast-hanul-hotpot-extras`), ご飯を追加 (`tablecast-hanul-rice`)                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 含有の登録一覧           | soya, molluscs, crustaceans, egg                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 原材料の確認状態         | `verified`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 交差接触・ヴィーガン適合 | ともに `unknown`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 商品画像                 | `tablecast/images/627575be9e7596701d83c5832e9d65436341c86860fbe62b675fff261ce780c8.webp` / `illustration`                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### ハヌル お米のマッコリ

| 項目                     | 登録内容                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 商品ID                   | `tablecast-hanul-rice-makgeolli`                                                                                                                                                                                                                                                                                                                                                                                             |
| 日本語の読上げ名         | ハヌル お米のマッコリ                                                                                                                                                                                                                                                                                                                                                                                                        |
| 日本語の説明             | 架空銘柄。米と小麦由来の発酵素材を使う白いにごり酒。アルコール6%、750ml瓶です。架空デモの登録材料です。調味料の全成分・選択変更による成分差・交差接触は未確認です。ハラール、コーシャ等の宗教認証とヴィーガン適合は未確認です。材料名や肉抜きだけで適合を保証せず、スタッフへ確認してください。                                                                                                                              |
| 英語の読上げ名           | Hanul rice makgeolli                                                                                                                                                                                                                                                                                                                                                                                                         |
| 英語の説明               | Fictional cloudy white rice wine made with rice and wheat-derived fermentation ingredients, 6% ABV, in a 750ml bottle. These are recorded ingredients for a fictional demo. Full condiment ingredients, changes from options and cross-contact are unverified. Halal, kosher and other religious certification, and vegan suitability, are unverified. Ingredients or removing meat do not guarantee suitability; ask staff. |
| 選択グループ             | 取り分け用の器 (`tablecast-hanul-glasses`)                                                                                                                                                                                                                                                                                                                                                                                   |
| 含有の登録一覧           | wheat                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 原材料の確認状態         | `verified`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 交差接触・ヴィーガン適合 | ともに `unknown`                                                                                                                                                                                                                                                                                                                                                                                                             |
| 商品画像                 | `tablecast/images/6f771b0df91c9b7a46e011553daec3d4f3c7c150dfb88d3df734288b75e1af74.webp` / `illustration`                                                                                                                                                                                                                                                                                                                    |

### 共通の選択グループ

#### 包み野菜 / Wrapping leaves

グループID `tablecast-hanul-wraps`、kind `single`、最小1・最大1。

| option ID                       | 日本語 / English                                                  | 増減額 | 個別最大数量 |
| ------------------------------- | ----------------------------------------------------------------- | ------ | ------------ |
| `tablecast-hanul-wraps-lettuce` | サンチュ六枚 / Six lettuce leaves                                 | +0円   | 1            |
| `tablecast-hanul-wraps-mixed`   | サンチュ三枚とえごま三枚 / Three lettuce and three perilla leaves | +100円 | 1            |
| `tablecast-hanul-wraps-extra`   | サンチュ十枚 / Ten lettuce leaves                                 | +150円 | 1            |

#### みそだれ / Ssamjang

グループID `tablecast-hanul-ssamjang`、kind `single`、最小1・最大1。

| option ID                       | 日本語 / English           | 増減額 | 個別最大数量 |
| ------------------------------- | -------------------------- | ------ | ------------ |
| `tablecast-hanul-ssamjang-side` | 別添え / On the side       | +0円   | 1            |
| `tablecast-hanul-ssamjang-none` | みそだれなし / No ssamjang | +0円   | 1            |

#### つけだれ / Dipping sauce

グループID `tablecast-hanul-dip`、kind `single`、最小1・最大1。

| option ID                         | 日本語 / English                        | 増減額 | 個別最大数量 |
| --------------------------------- | --------------------------------------- | ------ | ------------ |
| `tablecast-hanul-dip-soy-vinegar` | しょうゆ酢だれ / Soy-vinegar dip        | +0円   | 1            |
| `tablecast-hanul-dip-chilli`      | 唐辛子入りしょうゆだれ / Soy-chilli dip | +0円   | 1            |
| `tablecast-hanul-dip-none`        | たれなし / No dip                       | +0円   | 1            |

#### 辛さ / Chilli level

グループID `tablecast-hanul-spice`、kind `single`、最小1・最大1。

| option ID                        | 日本語 / English                                 | 増減額 | 個別最大数量 |
| -------------------------------- | ------------------------------------------------ | ------ | ------------ |
| `tablecast-hanul-spice-mild`     | 控えめ・辛味あり / Milder, still contains chilli | +0円   | 1            |
| `tablecast-hanul-spice-standard` | 通常 / Standard                                  | +0円   | 1            |
| `tablecast-hanul-spice-hot`      | 辛め / Hotter                                    | +0円   | 1            |

#### 追加トッピング / Extra toppings

グループID `tablecast-hanul-hotpot-extras`、kind `quantity`、最小0・最大4。

| option ID                                  | 日本語 / English           | 増減額 | 個別最大数量 |
| ------------------------------------------ | -------------------------- | ------ | ------------ |
| `tablecast-hanul-hotpot-extras-cheese`     | チーズ / Cheese            | +150円 | 2            |
| `tablecast-hanul-hotpot-extras-rice-cakes` | トック / Rice cakes        | +180円 | 2            |
| `tablecast-hanul-hotpot-extras-ramyeon`    | ラーメン / Ramyeon noodles | +200円 | 2            |

#### ご飯を追加 / Add rice

グループID `tablecast-hanul-rice`、kind `single`、最小1・最大1。

| option ID                      | 日本語 / English         | 増減額 | 個別最大数量 |
| ------------------------------ | ------------------------ | ------ | ------------ |
| `tablecast-hanul-rice-none`    | 追加なし / No extra rice | +0円   | 1            |
| `tablecast-hanul-rice-small`   | 小ご飯 / Small rice      | +150円 | 1            |
| `tablecast-hanul-rice-regular` | ご飯 / Regular rice      | +200円 | 1            |

#### 取り分け用の器 / Sharing cups

グループID `tablecast-hanul-glasses`、kind `single`、最小1・最大1。

| option ID                       | 日本語 / English    | 増減額 | 個別最大数量 |
| ------------------------------- | ------------------- | ------ | ------------ |
| `tablecast-hanul-glasses-two`   | 二人分 / Two cups   | +0円   | 1            |
| `tablecast-hanul-glasses-three` | 三人分 / Three cups | +0円   | 1            |
| `tablecast-hanul-glasses-four`  | 四人分 / Four cups  | +0円   | 1            |

## 下書きの確認

対象店舗、8品のうち変更対象とした商品、基本価格・追加料金、必須選択、日英名・読上げ名、原材料のunknownが保持されているかを差分で確認する。現在の公開設定がこの資料と同じなら、差分なしであることを確認する。変更を実演するときは、例えば日英の説明文を短くするなど、対象と変更内容を管理者が先に指定する。差分を見せるために未確認の価格や原材料を変更しない。
