# メニュー設定デモの入力資料

[デモ資料](README.md) / [店舗設定](stores.md) / [資料から設定するシナリオ](scenarios.md#6-店舗資料から日英メニューを設定する)

## 資料の位置付け

2026-09-13時点の[合成fixture](../../scripts/tablecast-fixtures.ts)から、主要2店舗の代表商品を各4品抜粋した架空の入力資料。氏名・店名・商品・レシピ・価格は実店舗の情報ではない。日英名称・価格・選択肢・原材料の確認状態はfixtureの値を転載しており、録画時は現在の公開版と照合する。

この資料をChatGPT/Codexへ渡し、現在のschemaでメニュー下書きを作る。対象店舗を一つ選び、この資料にない既存商品・カテゴリ・プラン・接客設定は保持する。資料の8品だけで全設定を置き換えない。商品IDと選択肢IDは既存項目との対応用であり、客向けの表示や音声に出さない。

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
| 商品画像               | `tablecast/images/c857d6f984072095db8398056ec05873ed4ff3ba4034b9ee3bd836e7f7b6a84c.png` / `illustration`                                                                                                                                                                               |

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
| 商品画像               | `tablecast/images/3e475b7f810b1005f9fcb7573c22b34baa9492fc23ba686dbbc9e45ead2e5f70.png` / `illustration`                                                                                                                                                                            |

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
| 商品画像               | `tablecast/images/a7dd8e3f276ae81bd504481ebff8ca55699efc6012c5562edc02ab055bfd5618.png` / `illustration`                                                                                                                                                                                    |

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
| 商品画像               | `tablecast/images/08549bfe4ce1c7070a9131a52a1af8c1d4b00e8e4a5728a3ce8344aad466ab60.png` / `illustration`                                                                                                                                                  |

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
| 商品画像               | `tablecast/images/e38a014283ddda6578daa705fceeb2fd89528aaedb8ab58340eb56362b7cdfda.png` / `illustration`                                                                                                                                                                                                            |

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
| 商品画像               | `tablecast/images/73aaf7e46da55672fc3be5505c8aa4da666a19c0204c2f54150abd1d41aa3da3.png` / `illustration`                                                                                                                                                                                                                                 |

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

## 下書きの確認

対象店舗、8品のうち変更対象とした商品、基本価格・追加料金、必須選択、日英名・読上げ名、原材料のunknownが保持されているかを差分で確認する。現在の公開設定がこの資料と同じなら、差分なしであることを確認する。変更を実演するときは、例えば日英の説明文を短くするなど、対象と変更内容を管理者が先に指定する。差分を見せるために未確認の価格や原材料を変更しない。
