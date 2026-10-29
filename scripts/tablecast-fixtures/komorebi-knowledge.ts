import type { StoreSkill } from "@tablecast/api/schema";

/** 実店舗の情報項目を参考にした架空店舗の運用資料。実在店の事実へ転用しない。 */
export const komorebiSkills: StoreSkill[] = [
  {
    id: "komorebi-hospitality",
    files: [
      {
        path: "SKILL.md",
        content: `---
name: komorebi-hospitality
description: 京料理こもれび四条店の営業時間・アクセス・予約・設備・食事・日本酒・会員案内。Komorebi store information, reservations, facilities, dining and sake.
metadata:
  data-kind: fictional-demo
  reviewed-at: 2026-10-30
---

# 京料理こもれび四条店 / Komorebi Shijo

京都・四条烏丸エリアを舞台にした架空の和食居酒屋です。少しずつ分け合う料理と、多彩な日本酒を落ち着いて楽しむ店を想定しています。実在する六角aceを情報項目と親しみやすい居酒屋の雰囲気の参考にしましたが、同店の支店・系列・公式資料ではありません。以下の営業時間や設備・方針はすべてデモ用の登録設定です。

A fictional Japanese restaurant in the Shijo Karasuma area of Kyoto, serving small plates and a varied sake selection. These are demo operating policies, not verified facts about a real venue. Komorebi is not a branch of Rokkaku ace.

## 質問別の参照先 / Reference files

- [営業時間・場所・アクセス / Opening hours and access](references/visit.md)
- [予約・人数・キャンセル / Reservations and groups](references/reservations.md)
- [お手洗い・禁煙・子供・設備 / Facilities and accessibility](references/facilities.md)
- [会計・サービス・持ち帰り / Payment and service](references/service.md)
- [料理・食事制限 / Dishes and dietary questions](references/dining.md)
- [日本酒・温度・ペアリング / Sake and pairings](references/sake.md)
- [会員・記憶・クーポン / Membership and memory](references/membership.md)
- [周辺観光・最新情報 / Nearby places and current information](references/local-area.md)

価格・販売状態・原材料・アレルギー・プラン条件は最新の業務APIを確認します。資料にない実住所・電話番号・本日の空席・臨時休業・待ち時間を作りません。
Use current business tools for prices, availability, ingredients, allergens and plan conditions. The documents do not establish today's table availability, temporary closures or live waiting times.
`,
      },
      {
        path: "references/visit.md",
        content: `# 営業時間・アクセス / Opening hours and access

## 営業時間・閉店・ラストオーダー / Hours, closing and last orders
通常営業は17:00〜23:00、料理と飲み物のラストオーダーは22:00です。ランチ営業はありません。定休日は不定休です。当日の休業、貸切、受付終了や延長営業はこの資料では分かりません。現在時刻だけから受付可能と判断せずスタッフへ確認します。飲み放題などの個別プランの終了・ラストオーダーは、来店へ設定されたプランの業務APIを優先します。

Usual opening hours are 17:00–23:00, with last orders for food and drinks at 22:00. There is no lunch service and closing days vary. Today's closures and admission status require staff confirmation. A guest's active plan may have its own end time and last-order deadline; check the business tools.

## 場所・駅・道順 / Location, station and directions
デモ上の最寄りは阪急京都線の烏丸駅と地下鉄烏丸線の四条駅、四条烏丸の交差点から徒歩約7分の設定です。駅構内の出口からの時間・段差・工事の状況は未登録です。実住所、郵便番号、地図ピン、店舗の電話番号は登録していません。実在店舗の住所や電話番号をこもれびの連絡先として案内しません。タクシーの迎車場所や車椅子での経路はスタッフに相談します。

The demo places the restaurant about seven minutes' walk from the Shijo Karasuma junction, near Hankyu Karasuma Station and subway Shijo Station. A street address, map pin, telephone number and step-free route have not been registered. Ask staff about taxi collection and accessible routes.
`,
      },
      {
        path: "references/reservations.md",
        content: `# 予約・人数・キャンセル / Reservations and groups

## 予約方法・空席 / Booking and availability
予約相談はスタッフが受け付けます。AIは予約確定、席の確保、外部予約サイトへの代理申込を行いません。希望日時・人数・子供の人数・必要な配慮を一つずつ確認し、希望が明確ならスタッフ呼出しへ引き継ぎます。本日の空席、何分待ちか、予約の変更可否はリアルタイムの確認が必要です。予約なしでの来店もスタッフが席の状況を確認します。

Staff handle booking enquiries. The assistant cannot confirm a booking or hold a table. Ask for the desired date, time, party size and any access needs, then offer to contact staff. Walk-ins depend on current availability. Do not promise a waiting time.

## 団体・席・貸切 / Groups and seating
通常の卓は2〜4名向けです。5名以上やベビーカー同伴はスタッフが席の組合せと通路を確認します。席の指定や隣同士の席は確約しません。個室と店舗全体の貸切は取り扱っていない設定です。

Standard tables seat two to four. For five or more guests or a pushchair, staff check the table arrangement and passageways. Specific or adjacent tables cannot be promised. Private rooms and exclusive hire are not offered in this demo.

## 変更・遅刻・キャンセル / Changes, lateness and cancellation
遅刻・人数変更・キャンセルはスタッフへ相談します。キャンセル料の金額と発生日は未登録なので、無料とも有料とも断定しません。AIは外部予約記録を照会・変更しません。

Ask staff about lateness, cancellations and changes in party size. Cancellation charges and deadlines have not been registered. The assistant cannot inspect or change an external booking.
`,
      },
      {
        path: "references/facilities.md",
        content: `# 設備・お手洗い・バリアフリー / Facilities and accessibility

## お手洗い・トイレ / Toilets
お手洗いは店内奥の通路の先です。場所が分からなければスタッフが案内します。車椅子対応トイレやおむつ交換台の有無は未登録なので利用可能と断定しません。

The toilets are at the end of the passage towards the back of the dining room. Staff can show the way. Accessible toilets and baby-changing facilities have not been confirmed.

## 禁煙・駐車場・個室 / Smoking, parking and private rooms
全席禁煙です。店内での電子たばこも控えていただきます。専用駐車場、個室、貸切はありません。近隣駐車場の空き・料金は最新情報を調べますが、提携や割引は登録されていません。

All indoor seats are non-smoking, including electronic cigarettes. There is no dedicated car park, private room or exclusive hire. Nearby parking charges and availability require current external information; no parking discount is registered.

## 子供・ベビーカー・車椅子 / Children, pushchairs and wheelchairs
子供連れの来店は相談できます。子供用食器はスタッフへ依頼できます。ハイチェアの在庫、ベビーカーの置場、入口の段差や通路幅はスタッフが当日確認します。完全バリアフリーとは案内しません。飲酒運転を避け、20歳未満へ酒類を勧めません。

Families may ask staff about seating and children's tableware. Staff must confirm high-chair availability, pushchair space, entrance steps and passage widths. Step-free access is not confirmed. Do not recommend alcohol to anyone under 20 or to a driver.

## Wi-Fi・充電・荷物 / Wi-Fi, charging and luggage
客用Wi-FiのSSID・パスワード、充電用コンセントの利用、大型荷物の預かりは未登録です。パスワードを作らずスタッフへ確認します。iPadは卓の注文用で、他の用途やアカウントへのログインには使いません。

Guest Wi-Fi credentials, charging sockets and large-luggage storage are not registered. Ask staff rather than inventing a password. Table iPads are for the restaurant's ordering service.
`,
      },
      {
        path: "references/service.md",
        content: `# 会計・サービス / Payment and service

## 支払い方法・お会計 / Payment methods and the bill
デモの店頭会計は現金・クレジットカード・電子マネー・QRコード決済を想定しています。個別ブランド、海外発行カード、タッチ決済の対応はスタッフへ確認します。TableCastのiPadから実決済は行えません。会計依頼はスタッフ呼出しで、支払済みとは扱いません。個別会計・割勘の自動計算には対応していません。領収書・宛名・インボイス番号はスタッフへ相談します。

The demo assumes payment at the counter by cash, credit card, electronic money or QR payment. Confirm individual brands and overseas cards with staff. The iPad cannot take a real payment. Requesting the bill does not settle it. Split bills are not handled automatically. Ask staff for receipts and invoice details.

## お通し・席料・サービス料 / Cover and service charges
別途のお通し・席料・サービス料の設定はありません。請求は現在の会計APIで確認できる注文・プラン・承認された調整が根拠です。Web記事の相場から追加料金を作りません。

No separate cover or service charge is registered. Base the bill on current orders, plans and authorised adjustments returned by the billing tools.

## お冷・食器・こぼした時 / Water, tableware and spills
お冷、追加の取り皿、箸、食器の回収はスタッフへ依頼できます。商品として登録されている依頼は現在の販売状態と価格を確認して注文し、登録がなければスタッフへ引き継ぎます。熱い物をこぼした時、体調不良、怪我はすぐスタッフへ引き継ぎます。

Ask staff for drinking water, extra small plates, chopsticks or clearing dishes. If a service item is in the catalogue, use its current price and normal order approval. For spills, illness or injury, contact staff promptly.

## 持ち帰り・差し入れ・忘れ物 / Takeaway, outside food and lost property
持ち帰りとデリバリーは受け付けていない設定です。食べ残しの包装、生ものの持ち出し、ケーキの持込みはその場でスタッフへ相談します。忘れ物の保管状況や個人情報をAIから公開しません。

Takeaway and delivery are not offered in this demo. Ask staff about leftovers or bringing a celebration cake. The assistant cannot disclose lost-property records or personal information.
`,
      },
      {
        path: "references/dining.md",
        content: `# 料理・おすすめ・食事制限 / Dishes and dietary questions

## 店の料理・分け合い / Dining style and sharing
和食の小皿、お造り、焼きもの、揚げもの、〆のご飯を、好みに合わせて少しずつ楽しむ店です。最初はさっぱりした小皿とお造り、次に温かい料理、最後にご飯という組合せができます。これは提案であり注文ではありません。現在の品名・価格・内容・売切・必須選択はカタログを確認します。

Share small Japanese plates, sashimi, grilled and fried dishes, then finish with rice. A light starter followed by a warm dish is one possible sequence, not an order. Confirm current dishes, portions, prices, availability and required choices with the catalogue.

## お造り・唐揚げ・焼きもの / Sashimi, fried chicken and grilled dishes
お造りは魚を生で楽しむ料理、唐揚げは下味を付けた鶏を衣で揚げる料理です。こもれびのお造り三種盛りや唐揚げの魚種・個数・衣・調味料は商品詳細を確認して説明します。飾りの別添えと、料理本体の原材料除去を混同しません。材料変更や辛さ変更は登録済み選択肢だけを提示し、厨房で対応できると約束しません。

Sashimi is raw fish; karaage is seasoned chicken fried in a coating. Use the product details for this restaurant's fish species, portion sizes and ingredients. Removing an optional garnish does not remove ingredients from the dish itself. Offer only registered customisations and do not promise kitchen substitutions.

## アレルギー・ベジタリアン・ハラール / Allergies and dietary needs
アレルゲンと食事対応はgetProductFoodInformationで選択後の構成を確認します。資料や料理の一般知識だけで乳・卵・小麦不使用、ヴィーガン、ベジタリアン、ハラール、グルテンフリーと断定しません。だし・たれ・揚げ油・共用器具も関係します。未確認なら安全と言わず、スタッフへの確認を提案します。認証と原材料上の配慮は別です。

Check the configured dish after customisation with the food-information tool. General cooking knowledge does not establish that a dish is dairy-free, egg-free, vegan, vegetarian, halal or gluten-free. Stock, sauces, frying oil and shared equipment can matter. Unknown information requires staff confirmation, and ingredient suitability is distinct from certification.

## 提供時間 / Waiting for food
料理ごとの提供予定時間は未登録です。注文の受付・提供状態は注文API、遅れや急ぎの相談はスタッフへ確認します。出来上がりまでの分数を推測しません。

Preparation times are not registered. Check order status with the business tools and ask staff about delays; do not invent a serving time.
`,
      },
      {
        path: "references/sake.md",
        content: `# 日本酒・温度・ペアリング / Sake and pairings

## 初めての日本酒・香り / Choosing sake
こもれびは架空銘柄を使った日本酒リストを持ちます。まず香りが華やかなものか、米のうま味を楽しむものか、すっきりした飲み口かを一問ずつ確認します。甘口・辛口だけでは香りや重さを表せません。月凪は青りんごを思わせる香り、雪灯は米のうま味とすっきりした後口という登録説明を持ちます。現在の販売・銘柄分類・価格・容量はカタログを確認します。架空銘柄を実在蔵元や産地へ結び付けません。

The sake list uses fictional labels. Ask whether the guest prefers fragrant, rice-rich or crisp styles, one question at a time. Sweetness alone does not describe aroma or body. Tsukinagi is described with green-apple aromas and Yukiakari with rice-rich umami and a clean finish. Check current availability, classification, price and serving size. Do not invent a brewery or origin for a fictional label.

## 純米・吟醸・精米歩合 / Junmai, ginjo and rice polishing
純米は醸造アルコールを添加しない区分です。吟醸・大吟醸は米の精米や造りの区分で、高価格ほど誰にでも合うという意味ではありません。精米歩合は削った後に残る米の割合です。個別銘柄の数値・製法・アルコール度数は登録された商品情報にある場合だけ案内します。

Junmai is made without added brewer's alcohol. Ginjo and daiginjo describe brewing and rice-polishing classifications, not a universal ranking of taste. The rice-polishing ratio is the proportion remaining after polishing. State a particular label's figures and production details only when registered in its product information.

## 冷酒・常温・燗・容量 / Temperature and serving size
冷酒は香りを軽やかに感じやすく、燗はうま味や香りの感じ方が変わります。適温には銘柄と好みの違いがあります。提供温度・グラスや小瓶の容量・追加料金は選んだ商品の必須選択を確認します。選ぶ前に温度や容量を先回りして質問しません。

Chilling or warming can change how aromas and umami are perceived. Suitable temperatures depend on the label and the guest. Check the selected product's serving-temperature and size options and any surcharge. Choose the drink before asking about its required options.

## 料理との相性・ノンアルコール / Food pairings and alcohol-free alternatives
繊細なお造りには軽やかなタイプ、焼きものにはうま味のあるタイプという組合せから提案できますが、客の好みを優先します。辛い料理の後に感じる香りの違いも楽しめます。飲酒しない客にはカタログのノンアルコール飲料を提案し、酒類を勧め続けません。妊娠・健康状態などを推測して記憶しません。

A lighter sake may accompany delicate sashimi; rice-rich styles may suit grilled dishes. Preferences take priority over a fixed pairing rule. Offer current alcohol-free drinks to guests who do not drink alcohol. Do not infer or store health conditions.
`,
      },
      {
        path: "references/membership.md",
        content: `# 会員・記憶・クーポン / Membership and memory

## スマホ会員・来店参加 / Joining a visit
iPadの会員QRから自分のスマホでログインし、この店の会員同意と来店参加を行います。声や顔から本人を識別しません。複数会員が参加しているときは必要に応じてiPad上で接客対象を選びます。参加していない人の個人記憶を読んだり、共有会話を本人の記憶にしたりしません。

Use the table iPad's membership QR to sign in on your own phone and join this store's visit with consent. The assistant does not identify guests by voice or face. Where several members are present, select the intended guest on the iPad when personal context is needed.

## 好みの自動記憶・確認・削除 / Remembering preferences
許可した本人の明確な継続的な好みだけを、発話の原文を根拠に自動保存します。今回だけの注文は長期の好みと扱いません。スマホの記憶画面で確認・訂正・削除でき、保存と利用の許可を変更できます。撤回後に古い記憶を接客へ使いません。記憶は今回の注文や注文承認を代行しません。

With consent, clear lasting first-person preferences can be remembered from the guest's own words. A one-off order is not a lasting preference. Review, correct or delete memories and change permissions on the member page. A memory never places or approves an order.

## ポイント・券 / Points and vouchers
残高、確認済み来店、有効な券、条件、実際の割引は現在の会員・会計APIを使います。QR参加だけでポイント付与済みと言いません。券の利用申請とスタッフによる会計への適用は別です。最低会計額・上限・期限を省略しません。

Use current membership and billing tools for balances, confirmed visits, vouchers and discounts. Joining by QR alone does not award points. Requesting a voucher and staff applying it to a bill are separate steps; include minimum spend, limits and expiry.
`,
      },
      {
        path: "references/local-area.md",
        content: `# 周辺観光・外部情報 / Nearby places and current information

四条烏丸を起点に、錦市場、京都文化博物館、六角堂などを話題の候補にできます。実際の経路・距離・営業時間・拝観・イベント・雨天営業・最終電車は登録していません。行きたい場所や条件を一つ確認し、公開Webの公式情報を検索して、出典と確認時点を添えて案内します。現在の交通遅延や天気を店の資料だけで断定しません。本人の名前・記憶・同行履歴を検索語へ渡しません。参考ページが役立てば出典付きの表示やQRを案内します。

Possible conversation topics around Shijo Karasuma include Nishiki Market, the Museum of Kyoto and Rokkakudo. Routes, distances, opening times, events, weather and last trains are not registered here. Ask about the destination or need, then use current official public sources with attribution. Do not send a guest's name, memories or companion history in a search query. Offer a source page or QR when useful.
`,
      },
    ],
  },
];
