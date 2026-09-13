# 声と試聴リンク付きの会話台本

[デモ資料](README.md) / [機械可読台本](dialogue.json) / [応答チェックリスト](paid-e2e-checklist.md) / [音声素材](audio.md)

7シーン・42の客発話を、客の台詞、実際に指定したInworldのvoice名、再生条件、期待応答の順に読むための資料。試聴リンクは生成済みの合成客音声を開く。実有料E2Eは未実行であり、店員欄は本物の応答を記録したものではない。

このファイルは生成物である。客の台詞・順序・cueは[dialogue.json](dialogue.json)、開始状態と到達目標・期待応答例は[paid-e2e-checklist.md](paid-e2e-checklist.md)、voice名は[voices.json](voices.json)、ファイルと実長は[音声manifest](../../assets/demo/audio/manifest.json)から転記した。内容を変えるときは正本を更新し、同じscenario ID・turn IDで結合して再生成する。このファイルへ独立した台詞や判定条件を追加しない。

期待応答は意味を確認する文例であり、通常応答の全文一致を求めない。注文確認には製品APIが返す現在版の固定文を使い、全文読了後に承認する。想定した店員TTSを客入力へ流さず、実際の応答開始・完了と業務状態を待つ。別枠の店員参考音声3本は、この客入力台本へ含めない。

声の年齢感・性別・アクセントは[ペルソナ](personas.md)の演出意図であり、実聴評価とは分ける。同じ標準voiceを使う客も、人物別のinstructionとspeakingRateを設定している。

各シーンは別の来店セッションから始める。同じシーンの客は一卓のカートを共有する。`overlap_previous`は直前の客音声の開始、`during_live_response`は本物の店員TTSの開始をオフセットの基準にする。STOPと再開は記載されたGUI操作を実施し、音声の無音区間で代用しない。

## 1. 京料理こもれび四条店で地酒と料理を選ぶ

シーンID: `ja-discovery`。店舗ID: `tablecast-komorebi`。客: 2名。

**開始状態と到達目標:** 京料理こもれび四条店で地酒と料理を選ぶ。日本語、2名、プランなし、空カート。最終注文は月凪90ml冷酒1個780円とお造り1個1,280円、合計2,060円。

### discovery-01 · 美咲 / Hina

[客音声MP3を試聴・6.456秒](../../assets/demo/audio/ja-discovery/discovery-01.mp3)

**再生条件:** 最初の入力、または直前の客音声と指定操作の完了後（`after_previous`）。空カート・日本語・音声開始を確認して最初に再生する。

**客の台詞**

> 月凪と雪灯は、香りと味がどう違いますか。まだ注文はしません。

**期待応答・挙動の例（実応答ではない）**

> 月凪は青りんごを思わせる香りと軽い後口、雪灯は米のうま味とすっきりした辛口です。

### discovery-02 · 悠斗 / Satoshi

[客音声MP3を試聴・6.624秒](../../assets/demo/audio/ja-discovery/discovery-02.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> 月凪の純米吟醸を、冷酒で九十ミリリットル、一つお願いします。

**期待応答・挙動の例（実応答ではない）**

> 月凪の冷酒、九十ミリリットルを一つ、七百八十円でカートに入れました。

### discovery-03 · 美咲 / Hina

[客音声MP3を試聴・5.688秒](../../assets/demo/audio/ja-discovery/discovery-03.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> お造り三種盛りも一つお願いします。薬味の別添えは要りません。

**期待応答・挙動の例（実応答ではない）**

> お造り三種盛りを一つ追加しました。別添えの薬味は追加しません。

### discovery-04 · 悠斗 / Satoshi

[客音声MP3を試聴・8.088秒](../../assets/demo/audio/ja-discovery/discovery-04.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> 合計は二千六十円で合っていますか。送信する前に、注文内容を読み上げてください。

**期待応答・挙動の例（実応答ではない）**

> 専用の固定確認を全文読む。月凪・冷酒90ml1個780円、お造り1個1,280円、計2,060円を含む。

### discovery-05 · 美咲 / Hina

[客音声MP3を試聴・5.928秒](../../assets/demo/audio/ja-discovery/discovery-05.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の現行確認の読み上げ完了と内容2,060円を実際に確かめてから再生する。

**客の台詞**

> はい、今読み上げた二千六十円の内容で、注文を送信してください。

**期待応答・挙動の例（実応答ではない）**

> ご注文を送信しました。

## 2. Westward Burgers Kyotoで3人のバーガーを組み立てる

シーンID: `ja-burger-group`。店舗ID: `tablecast-koharu`。客: 3名。

**開始状態と到達目標:** Westward Burgers Kyotoで3人のバーガーを組み立てる。日本語、3名、プランなし、空カート。基本バーガーの必須選択をすべて指定する。最終4明細は1,680円、1,280円、1,780円、580円で5,320円。

**重なり区間:** `burger-04` と `burger-05`は[混合WAVを試聴](../../assets/demo/audio/overlap/ja-burger-group-burger-05.wav)できる。後の声は先の声の開始250ms後に入る。この区間では二つの客発話の間に店員応答を待たず、混合版1回で置き換える。個別MP3と混合版を重複入力しない。両行の期待応答例は重なり入力後の判定に使う。

### burger-01 · 凛 / Asuka

[客音声MP3を試聴・7.8秒](../../assets/demo/audio/ja-burger-group/burger-01.mp3)

**再生条件:** 最初の入力、または直前の客音声と指定操作の完了後（`after_previous`）。空カート・3名・日本語・プランなしで開始する。

**客の台詞**

> カスタムバーガーを一つ。ブリオッシュ、ビーフ、チェダー、ハウスソースで、チェダーを一つ追加してください。

**期待応答・挙動の例（実応答ではない）**

> カスタムバーガー一つ、チェダー追加一つで千五百三十円です。

### burger-02 · 航 / Satoshi

[客音声MP3を試聴・9.48秒](../../assets/demo/audio/ja-burger-group/burger-02.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> 別のカスタムバーガーを一つ。ブリオッシュ、ビーフ、チーズなし、マスタードで、玉ねぎを抜いてください。

**期待応答・挙動の例（実応答ではない）**

> 別のバーガーはチーズなし、マスタード、玉ねぎ抜きで千二百八十円です。

### burger-03 · 葵 / Hina

[客音声MP3を試聴・8.976秒](../../assets/demo/audio/ja-burger-group/burger-03.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> もう一つは、全粒粉、植物由来パティ、チェダー、ハウスソースで、アボカドを一つ追加してください。

**期待応答・挙動の例（実応答ではない）**

> 全粒粉、植物由来パティ、アボカド追加のバーガーは千七百八十円です。

### burger-04 · 凛 / Asuka

[客音声MP3を試聴・4.512秒](../../assets/demo/audio/ja-burger-group/burger-04.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> 最初のバーガーのチェダー追加を、一つから二つに変えてください。

**期待応答・挙動の例（実応答ではない）**

> お声が重なりました。変更内容をもう一度お願いできますか。

### burger-05 · 葵 / Hina

[客音声MP3を試聴・3.984秒](../../assets/demo/audio/ja-burger-group/burger-05.mp3)

**再生条件:** 直前の客音声に重ねる（`overlap_previous`）。直前の客音声の開始から250ms後。burger-04の客音声開始から250ms後に重ねる。前の客音声の途中であることをクリップ実長で確認する。

**客の台詞**

> シーソルトフライも二つお願いします。

**期待応答・挙動の例（実応答ではない）**

> チェダーの追加とフライの数量を、順に確認させてください。

### burger-06 · 凛 / Asuka

[客音声MP3を試聴・8.424秒](../../assets/demo/audio/ja-burger-group/burger-06.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> 声が重なりました。最初のバーガーのチェダー追加は二つ、フライは二つでお願いします。ほかの二つのバーガーはそのままです。

**期待応答・挙動の例（実応答ではない）**

> 最初のチェダー追加は二つ、フライも二つですね。ほかのバーガーはそのままです。

### burger-07 · 航 / Satoshi

[客音声MP3を試聴・6.672秒](../../assets/demo/audio/ja-burger-group/burger-07.mp3)

**再生条件:** 本物の店員応答の再生中に割り込む（`during_live_response`）。実際の店員TTS開始から600ms後。burger-06に対する本物の店員TTSが聞こえ始めてから600ms後に再生する。

**客の台詞**

> すみません、フライは一つに訂正してください。まだ注文を送らないでください。

**期待応答・挙動の例（実応答ではない）**

> フライを一つに訂正しました。まだ注文は送信していません。

### burger-08 · 葵 / Hina

[客音声MP3を試聴・7.536秒](../../assets/demo/audio/ja-burger-group/burger-08.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> 三つのバーガーとフライ一つ、五千三百二十円の内容を、もう一度読み上げてください。

**期待応答・挙動の例（実応答ではない）**

> 専用固定確認で、1,680円・1,280円・1,780円のバーガー各1個とフライ580円1個、計5,320円を読む。

### burger-09 · 凛 / Asuka

[客音声MP3を試聴・6.144秒](../../assets/demo/audio/ja-burger-group/burger-09.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。現行確認の読み上げが完了し、5,320円・3バーガー・フライ1個と一致してから再生する。

**客の台詞**

> はい、今確認した五千三百二十円の内容で、注文を送信してください。

**期待応答・挙動の例（実応答ではない）**

> ご注文を送信しました。

## 3. 京料理こもれび四条店でゆっくりコースを相談する

シーンID: `ja-assisted-course`。店舗ID: `tablecast-komorebi`。客: 2名。

**開始状態と到達目標:** 京料理こもれび四条店でゆっくりコースを相談する。日本語、2名、京の三皿コース。planTotalは4,400円。枝豆2個はプラン対象のためカート料理分の追加料金は0円。最後は呼出し・未送信。

### assisted-01 · 春江 / Winifred

[客音声MP3を試聴・7.224秒](../../assets/demo/audio/ja-assisted-course/assisted-01.mp3)

**再生条件:** 最初の入力、または直前の客音声と指定操作の完了後（`after_previous`）。2名・京の三皿コース・音声開始を画面で確認して開始する。

**客の台詞**

> この画面は初めてなので、話す速さを零点八倍にしてください。

**期待応答・挙動の例（実応答ではない）**

> 話す速さを零点八倍にしました。

### assisted-02 · 誠 / Haruto

[客音声MP3を試聴・8.088秒](../../assets/demo/audio/ja-assisted-course/assisted-02.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> 京の三皿コースは、二人で四千四百円ですか。選べる料理を教えてください。

**期待応答・挙動の例（実応答ではない）**

> 二名さまで四千四百円です。お造り、唐揚げ、枝豆から、お一人三品まで選べます。

### assisted-03 · 春江 / Winifred

[客音声MP3を試聴・4.416秒](../../assets/demo/audio/ja-assisted-course/assisted-03.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> まず、枝豆を二つお願いします。

**期待応答・挙動の例（実応答ではない）**

> 枝豆を二つカートに入れました。コースの対象です。

### assisted-04 · 誠 / Haruto

[客音声MP3を試聴・8.184秒](../../assets/demo/audio/ja-assisted-course/assisted-04.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> 画面で内容を確認したいです。確認画面を開いてください。まだ注文は送りません。

**期待応答・挙動の例（実応答ではない）**

> 確認画面を開きました。ご注文はまだ送っていません。

### assisted-05 · 春江 / Winifred

[客音声MP3を試聴・7.104秒](../../assets/demo/audio/ja-assisted-course/assisted-05.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> 料理を出す順番は、店員さんに相談したいです。呼んでいただけますか。

**期待応答・挙動の例（実応答ではない）**

> スタッフをお呼びしました。料理を出す順番をご相談ください。

## 4. 米国英語と英国英語の2人が京料理を選ぶ

シーンID: `en-us-uk-sake`。店舗ID: `tablecast-komorebi`。客: 2名。

**開始状態と到達目標:** 米国英語と英国英語の2人が京料理を選ぶ。English、2名、プランなし、空カート。同じ卓にUS/UKの2声を入力する。最終注文2,060円。

### usuk-01 · Alex / Alex

[客音声MP3を試聴・6.792秒](../../assets/demo/audio/en-us-uk-sake/usuk-01.mp3)

**再生条件:** 最初の入力、または直前の客音声と指定操作の完了後（`after_previous`）。2名・English・空カート・プランなしで開始する。

**客の台詞**

> Could you compare Tsukinagi and Yukiakari? We would like to hear about their flavours before ordering.

**期待応答・挙動の例（実応答ではない）**

> Tsukinagi has green-apple aromas and a light finish. Yukiakari has rice-rich umami and a clean, dry finish.

### usuk-02 · Sam / Olivia

[客音声MP3を試聴・4.968秒](../../assets/demo/audio/en-us-uk-sake/usuk-02.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> For Tsukinagi, how much are the sixty and ninety millilitre servings?

**期待応答・挙動の例（実応答ではない）**

> Sixty millilitres costs six hundred and twenty yen, and ninety millilitres costs seven hundred and eighty yen.

### usuk-03 · Alex / Alex

[客音声MP3を試聴・4.32秒](../../assets/demo/audio/en-us-uk-sake/usuk-03.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> One Tsukinagi, ninety millilitres, chilled, please.

**期待応答・挙動の例（実応答ではない）**

> One chilled Tsukinagi, ninety millilitres, is in your basket for seven hundred and eighty yen.

### usuk-04 · Sam / Olivia

[客音声MP3を試聴・5.304秒](../../assets/demo/audio/en-us-uk-sake/usuk-04.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> And one three-fish sashimi selection, with no extra garnishes, please.

**期待応答・挙動の例（実応答ではない）**

> One three-fish sashimi selection, with no extra garnishes, is in your basket.

### usuk-05 · Alex / Alex

[客音声MP3を試聴・4.08秒](../../assets/demo/audio/en-us-uk-sake/usuk-05.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> Please read back the order and the total before sending it.

**期待応答・挙動の例（実応答ではない）**

> 英語の専用固定確認を全文読む。酒780円とお造り1,280円、計2,060円。

### usuk-06 · Sam / Olivia

[客音声MP3を試聴・5.664秒](../../assets/demo/audio/en-us-uk-sake/usuk-06.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。実際の英語確認が読み終わり、2,060円の現行版であることを確かめてから再生する。

**客の台詞**

> Yes, please send the order you have just read back, for two thousand and sixty yen.

**期待応答・挙動の例（実応答ではない）**

> Your order has been sent.

## 5. インド英語と中国語背景の英語で食事条件を相談する

シーンID: `en-india-china-dietary`。店舗ID: `tablecast-koharu`。客: 2名。

**開始状態と到達目標:** インド英語と中国語背景の英語で食事条件を相談する。English、2名、プランなし、空カート。原材料の不確実性と本人申告を保持する。最後はスタッフ呼出し、ゆずソーダ480円と烏龍茶420円、計900円の未送信カート。

### dietary-01 · Priya / Priya

[客音声MP3を試聴・9.456秒](../../assets/demo/audio/en-india-china-dietary/dietary-01.mp3)

**再生条件:** 最初の入力、または直前の客音声と指定操作の完了後（`after_previous`）。2名・English・空カート・プランなしで開始する。

**客の台詞**

> I avoid beef for religious reasons, and I also avoid eggs. Does the mushroom and plant-based patty burger contain eggs or dairy?

**期待応答・挙動の例（実応答ではない）**

> The recorded recipe includes cheddar and an egg-based sauce. The full ingredients and vegan suitability are not confirmed.

### dietary-02 · Wei / Ming

[客音声MP3を試聴・8.4秒](../../assets/demo/audio/en-india-china-dietary/dietary-02.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> I do not drink alcohol, including alcohol used in cooking. Are all the ingredients in the house pickles confirmed?

**期待応答・挙動の例（実応答ではない）**

> The full pickling ingredients are not recorded, so I cannot confirm whether alcohol is used.

### dietary-03 · Priya / Priya

[客音声MP3を試聴・7.632秒](../../assets/demo/audio/en-india-china-dietary/dietary-03.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> Please do not add either dish yet. Removing one topping would not confirm all the ingredients, would it?

**期待応答・挙動の例（実応答ではない）**

> Removing a topping does not confirm the full ingredients or cross-contact. I have not added either dish.

### dietary-04 · Wei / Ming

[客音声MP3を試聴・5.64秒](../../assets/demo/audio/en-india-china-dietary/dietary-04.mp3)

**再生条件:** 本物の店員応答の再生中に割り込む（`during_live_response`）。実際の店員TTS開始から500ms後。dietary-03への本物の英語TTSが開始してから500ms後に再生する。

**客の台詞**

> Please do not guess. Could you ask a member of staff to check the ingredients with us?

**期待応答・挙動の例（実応答ではない）**

> I have called a member of staff to check the ingredients with you.

### dietary-05 · Priya / Priya

[客音声MP3を試聴・6.024秒](../../assets/demo/audio/en-india-china-dietary/dietary-05.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> While we wait, one yuzu citrus soda, please. Keep it in the basket for now.

**期待応答・挙動の例（実応答ではない）**

> One yuzu citrus soda is in your basket for four hundred and eighty yen.

### dietary-06 · Wei / Ming

[客音声MP3を試聴・5.544秒](../../assets/demo/audio/en-india-china-dietary/dietary-06.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> And one oolong tea, please. We have not decided to send the order yet.

**期待応答・挙動の例（実応答ではない）**

> One oolong tea is in your basket. The two drinks total nine hundred yen, and the order has not been sent.

## 6. 読み上げ中の訂正で古い確認を失効し再承認する

シーンID: `ja-confirmation-reapproval`。店舗ID: `tablecast-komorebi`。客: 2名。

**開始状態と到達目標:** 読み上げ中の訂正で古い確認を失効し再承認する。日本語、2名、プランなし、空カート。確認Aは枝豆2個780円、確認Bは枝豆1個390円。Aを失効しBで1件だけ送信。

### confirm-01 · 悠斗 / Satoshi

[客音声MP3を試聴・3.528秒](../../assets/demo/audio/ja-confirmation-reapproval/confirm-01.mp3)

**再生条件:** 最初の入力、または直前の客音声と指定操作の完了後（`after_previous`）。2名・日本語・プランなし・空カートで開始する。

**客の台詞**

> 枝豆を二つお願いします。

**期待応答・挙動の例（実応答ではない）**

> 枝豆を二つ、七百八十円でカートに入れました。

### confirm-02 · 美咲 / Hina

[客音声MP3を試聴・4.824秒](../../assets/demo/audio/ja-confirmation-reapproval/confirm-02.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> 注文内容と合計を読み上げて、確認させてください。

**期待応答・挙動の例（実応答ではない）**

> 確認Aの専用固定読み上げを始める。枝豆2個780円。

### confirm-03 · 悠斗 / Satoshi

[客音声MP3を試聴・5.04秒](../../assets/demo/audio/ja-confirmation-reapproval/confirm-03.mp3)

**再生条件:** 本物の店員応答の再生中に割り込む（`during_live_response`）。実際の店員TTS開始から400ms後。confirm-02が作った専用確認TTS開始から400ms後に再生する。短い固定読み上げが終わる前であることを観測する。

**客の台詞**

> 待ってください。枝豆は一つに訂正してください。

**期待応答・挙動の例（実応答ではない）**

> 枝豆を一つに訂正しました。前の確認は使いません。

### confirm-04 · 美咲 / Hina

[客音声MP3を試聴・4.32秒](../../assets/demo/audio/ja-confirmation-reapproval/confirm-04.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> それでいいかな。まだ二人で相談しています。

**期待応答・挙動の例（実応答ではない）**

> お決まりになりましたらお知らせください。ご注文はまだ送っていません。

### confirm-05 · 悠斗 / Satoshi

[客音声MP3を試聴・6.432秒](../../assets/demo/audio/ja-confirmation-reapproval/confirm-05.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> 枝豆一つ、三百九十円の内容を、もう一度読み上げてください。

**期待応答・挙動の例（実応答ではない）**

> 確認Bの専用固定読み上げを全文読む。枝豆1個390円。

### confirm-06 · 美咲 / Hina

[客音声MP3を試聴・7.32秒](../../assets/demo/audio/ja-confirmation-reapproval/confirm-06.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。確認Bの読み上げ完了、枝豆1個390円、現在のcart/config版の一致を確かめてから再生する。

**客の台詞**

> はい、今読み上げた枝豆一つ、三百九十円で、注文を送信してください。

**期待応答・挙動の例（実応答ではない）**

> 枝豆一つのご注文を送信しました。

## 7. 音声停止中の入力を遮断しカートと注文を保つ

シーンID: `ja-stop-resume`。店舗ID: `tablecast-koharu`。客: 2名。

**開始状態と到達目標:** 音声停止中の入力を遮断しカートと注文を保つ。日本語、2名、プランなし。開始前に正規GUIの明示確認でフライ1個580円を注文済みにする。入力後の未送信カートはバーガー1個＋チェダー追加1個の1,530円。既注文580円と混ぜて再送しない。

### stop-01 · 航 / Satoshi

[客音声MP3を試聴・8.04秒](../../assets/demo/audio/ja-stop-resume/stop-01.mp3)

**再生条件:** 最初の入力、または直前の客音声と指定操作の完了後（`after_previous`）。2名・日本語・プランなし。正規のGUI確認で送信したフライ1個580円を事前に用意し、空カートから開始する。

**客の台詞**

> カスタムバーガーを一つ。ブリオッシュ、ビーフ、チェダー、ハウスソースでお願いします。

**期待応答・挙動の例（実応答ではない）**

> カスタムバーガーを一つ、千三百八十円でカートに入れました。

### stop-02 · 凛 / Asuka

[客音声MP3を試聴・3.576秒](../../assets/demo/audio/ja-stop-resume/stop-02.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> そのバーガーに、チェダーを一つ追加してください。

**期待応答・挙動の例（実応答ではない）**

> チェダーを一つ追加し、バーガーは千五百三十円です。

### stop-03 · 航 / Satoshi

[客音声MP3を試聴・3.84秒](../../assets/demo/audio/ja-stop-resume/stop-03.mp3)

**再生条件:** 最初の入力、または直前の客音声と指定操作の完了後（`after_previous`）。指定の前提成立から1000ms後。stop-02のカートcommitを確認してGUIの音声停止を押す。停止表示、Room切断、capture停止を確認してからこの客音声を入力側で再生する。

**客の台詞**

> カスタムバーガーを二つ追加してください。

**期待応答・挙動の例（実応答ではない）**

> 応答も新しい字幕も出ない。

### stop-04 · 凛 / Asuka

[客音声MP3を試聴・6.768秒](../../assets/demo/audio/ja-stop-resume/stop-04.mp3)

**再生条件:** 最初の入力、または直前の客音声と指定操作の完了後（`after_previous`）。STOP中の無変更を確認し、GUIで明示再開して接続完了後に再生する。固定時間だけで再開完了と判定しない。

**客の台詞**

> 今のカートは、バーガー一つにチェダーを一つ追加した内容のままですか。まだ送らないでください。

**期待応答・挙動の例（実応答ではない）**

> バーガー一つ、チェダー追加一つのままです。まだ送信していません。

### stop-05 · 航 / Satoshi

[客音声MP3を試聴・5.016秒](../../assets/demo/audio/ja-stop-resume/stop-05.mp3)

**再生条件:** 本物の店員応答の再生完了後（`after_live_response`）。直前の本物の店員応答が終わり、画面の状態を確認してから再生する。

**客の台詞**

> そのバーガーの注文内容を、もう一度確認させてください。

**期待応答・挙動の例（実応答ではない）**

> 再開後の専用固定確認を読む。カートのバーガー1,530円。注文済みフライ580円とは区別する。
