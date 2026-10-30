# 発表原稿の会話用画像と制作メモ

関連：[Issue #471](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/471) · [発表原稿](../../../../../docs/presentation/pitch.md)

2026年10月31日、組み込みimagegenで2枚を新規生成した。PNG、1672×941。生成結果を内容・寸法とも変更せず、このフォルダーへコピーした。

| 素材                                                 | 用途                                                |
| ---------------------------------------------------- | --------------------------------------------------- |
| [tablecast-friends.png](tablecast-friends.png)       | 日本人の友人4人が食事を相談する場面                 |
| [tablecast-travellers.png](tablecast-travellers.png) | 英語で相談する旅行客3人と、確認を引き継ぐ店員の場面 |

架空の人物・店舗を描いた利用シーンであり、実在の顧客や導入実績ではない。端末の背面を見せ、製品UIを生成していない。料理のある写真は食卓の雰囲気を示す挿絵で、台本の注文前後を記録した連続写真ではない。既存の地酒相談・年配客の画像と実アプリ画像の出所は[LP素材一覧](../../../../web/public/landing/README.md)を参照する。

## 原稿とデモの採用方針

元の説明・会話全文・画像を保持する。日本人グループの文化相談と注文、旅行客のスタッフ引き継ぎを優先するが、日本酒・年配夫婦を含む他の場面も候補資料として残す。原稿全体の短縮や画像の削除は行わない。構成と収録の方針は[発表構成](../../../../../docs/presentation/strategy.md)を参照する。技術詳細は[別スライド](../../../../../docs/presentation/technical.md)へ移して保持する。

## 台本の前提

会話は発表・次回収録に使う想定台本。実モデルの逐語録、合格済みの会話試験、収録済み動画ではない。写真と台詞を組み合わせて場面を示し、実画面は製品の操作対象を説明する。既存スクリーンショットが今回の会話・品目・合計を示すとは扱わない。

1. 日本人4人、日本酒を選ぶ二人、旅行客3人、年配の夫婦は別の来店として演じる。各注文場面は空のかごから始める。質問は知識や用語を知らない状態から始め、返答を受けた追加質問を経て料理・食べ方を選ぶ。
2. 通常の単品注文を前提にする。定額プラン・クーポン等の補正なし、商品は販売中、未指定の任意追加はなしとする。収録前に実APIで価格と選択肢を確認する。
3. 台詞はお客さまとTableCastの往復にする。客同士の掛け合いは置かず、キャストは音声接続後、一人ずつiPadに向かって話す。登場人物名は演者の識別用であり、声や顔による本人識別の実演にしない。店員の動きは演出として記載する。
4. かご追加・呼出しの成功台詞はAPI成功後に使う。注文の確定は最新内容と価格を確認した後の明示承認で示す。
5. 日本人4人の場面では出汁巻きとお造りをTableCastへ注文依頼する。音声停止後は送音・再生・応答生成を止めたまま、画面で内容を確認して承認する。自動再開の台詞を補わない。
6. 旅行客の英語設定と音声接続を用意する。酒・みりんの使用は未確認のまま厨房へ引き継ぎ、宗教上の適合性や食物アレルギーの安全性を推測しない。
7. 次回収録では実応答を採用して字幕・時刻を合わせる。固定した想定台詞で実モデルの音声を置換しない。

## 文化説明の根拠と収録前の準備

2026年10月31日に以下の一次資料を確認し、台本へ要約した。日本人グループの地域文化、日本酒の温度、旅行客の食事の組み立て方を注文操作より前に置く。出典の画像・文言は転載せず、既存の生成画像と自作の会話を使用する。

| 台本の説明                                                             | 根拠と適用範囲                                                                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 京都のだし巻きは日常でも親しまれ、だしの味や店・家庭ごとの配合を楽しむ | [農林水産省・だし巻き](https://www.maff.go.jp/j/keikaku/syokubunka/traditional-foods/menu/dasimaki.html)。一般的な地域文化。この店の巻き方・調味料・歴史までは証明しない       |
| 温度で香り・味の感じ方が変わり、季節や料理に合わせて燗や冷酒を楽しむ   | [日本酒造組合中央会・日本酒のおいしい飲み方](https://japansake.or.jp/sake/enjoy-sake/how-to-drink-sake/)。同一銘柄の温度比較は台本上の提案。雪灯の最適温度や実提供温度は未確認 |
| 居酒屋では料理を取り分けて楽しむ                                       | [JNTO・Izakaya Dining Guide](https://www.japan.travel/en/guide/dinner-at-a-japanese-tavern/)。全ての日本の店へ一律に適用しない                                                 |
| だしは和食のうま味を支え、昆布・かつお節・干ししいたけ等を使う         | [農林水産省・和食ガイドブック](https://www.maff.go.jp/j/keikaku/syokubunka/culture/pdf/guide_all.pdf)の冊子23ページ。個別商品の使用材料は商品情報で確認する                    |
| 小皿から始め、温かい料理・ご飯へ進む楽しみ方                           | こもれびの登録済み[店舗資料](../../../../../scripts/tablecast-fixtures/komorebi-knowledge.ts)にある提案。全国共通の作法・順番とは説明しない                                    |

だし巻きの地域文化やだしの素材の説明は、今回出典を確認して台本へ加えたもの。現行の店舗Skillへ必要な説明を登録・公開する操作と、実モデルによる再現確認は行っていない。収録前に店舗の承認済み資料を整える。台本を書いたことだけで、現在の実モデルがこの回答を返せるとは扱わない。

## 商品情報の根拠

原稿更新時の参照版：`4977b0a16042978adeb11907ef3e77a5f919d2b0`。実店舗の価格ではなく、こもれびの開発fixture。

| 台本の情報                                                               | 参照元                                                                                   |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| お造り1,280円、出汁巻き650円・かつお出汁を使用                           | [dishes.ts](../../../../../scripts/tablecast-fixtures/dishes.ts)                         |
| 雪灯540円・米のうま味とすっきりした辛口                                  | [sake.ts](../../../../../scripts/tablecast-fixtures/sake.ts)                             |
| お試し60ml・冷酒・ぬる燗の追加料金0円、かつお出汁0円、緑茶の温かい選択肢 | [modifiers.ts](../../../../../scripts/tablecast-fixtures/modifiers.ts)                   |
| さけの出汁茶漬け680円・焼きざけと選択した出汁                            | [rice.ts](../../../../../scripts/tablecast-fixtures/rice.ts)                             |
| 緑茶340円                                                                | [store-data.ts](../../../../../scripts/tablecast-fixtures/store-data.ts)                 |
| 日本酒の基準価格は60ml、商品と選択肢の構成                               | [stores.ts](../../../../../scripts/tablecast-fixtures/stores.ts)                         |
| 取り分け・料理説明・温度による楽しみ方・未確認の食事条件はスタッフへ     | [komorebi-knowledge.ts](../../../../../scripts/tablecast-fixtures/komorebi-knowledge.ts) |
| 背景会話を承認にしない、任意選択、確定前の明示承認                       | [発話仕様](../../../../../docs/voice/speech.md)                                          |

台本内の合計：出汁巻きとお造りは650 + 1,280 = 1,930円。雪灯の温度違いは540 × 2 = 1,080円。出汁茶漬けと緑茶2杯は680 + 340 × 2 = 1,360円。実演ではAPIが返す現在の金額を優先する。思い出から出汁茶漬けを提案する場面は現在の会話からの推測であり、過去の店舗や料理を特定した結果ではない。

## 生成プロンプト

以下は客向け会話の場面写真の生成プロンプト。後掲のAgent Pluginスクリーンショットは画像生成を使用していない。

組み込みimagegenを使用。参照画像なし、背景透過なし。以下は実際に渡した最終プロンプト。

### 日本人の友人4人

```text
Use case: photorealistic-natural. Asset type: a single widescreen 16:9 editorial scene image for a Japanese TableCast pitch script. A believable everyday Japanese neighbourhood izakaya with warm wood, soft natural restaurant light, ordinary casual clothing and candid relaxed expressions. Realistic hands and faces, calm documentary photography, no exaggerated stock-photo smiles. A small landscape iPad sits on a plain tabletop stand, only its plain back or edge visible; never invent or display a product interface. No text, no labels, no captions, no logos, no watermarks. Fictional people and fictional restaurant. Medium-wide eye-level composition with all participants and tabletop visible. Exactly four Japanese adult friends, two men and two women in their late twenties to thirties, seated around one table after work. One woman naturally speaks toward the tabletop iPad while another friend points at a printed picture menu; the other two are considering what to share. A modest three-fish sashimi platter, four-slice rolled omelette and a small edamame bowl are visible as examples of shareable dishes, tea glasses and chopsticks. Show an ordinary social dinner, the conversation between friends is central. No waiter in this image.
```

### 英語で相談する旅行客

```text
Use case: photorealistic-natural. Asset type: a single widescreen 16:9 editorial scene image for a Japanese TableCast pitch script. A believable everyday Japanese neighbourhood izakaya with warm wood, soft natural restaurant light, ordinary casual clothing and candid relaxed expressions. Realistic hands and faces, calm documentary photography, no exaggerated stock-photo smiles. A small landscape iPad sits on a plain tabletop stand, only its plain back or edge visible; never invent or display a product interface. No text, no labels, no captions, no logos, no watermarks. Fictional people and fictional restaurant. Medium-wide eye-level composition with all participants and tabletop visible. Exactly three adult international travellers, a white British woman, a Black British man and an East Asian British woman in their late twenties to forties, seated together at one table. Nationality is scenario context, not a costume: ordinary contemporary casual clothes, no flags or tourist clichés. They are talking in English about a Japanese food menu. The white woman addresses the tabletop iPad while her friends look at the same printed food photographs. A Japanese restaurant staff member in a simple neutral apron stands naturally alongside the table listening and ready to clarify a question about ingredients. Only water, tea and a closed menu on the tabletop; no dishes being eaten before a food question is answered. Respectful relaxed atmosphere.
```

## Agent Pluginの再接続と実会話

2026年10月31日、再seed後のstagingで店舗側の利用例を新たに実行した。上記の客向け会話・場面写真の扱いとは別に、この節の会話は実行済みであり、画面は実際のChatGPTとTableCastから取得した。

- 参考にした旧会話：[TableCastの機能紹介](https://chatgpt.com/share/6ae4d036-c0d0-83ee-b29c-8cd677b04f7c)。旧会話のコカ・コーラ追加と1組・4人・720円の集計は今回の証拠に使わない。
- 新規実行した会話：[売上比較と改善提案](https://chatgpt.com/c/6ae50cb8-657c-83ee-9992-fc7275f373f8)。アカウント内の会話で、公開共有リンクは作成していない。
- 対象：stagingの京料理こもれび四条店、`tablecast-komorebi`。変更前の公開版4、商品61件、登録言語は日本語・英語・中国語（簡体字）・韓国語。
- ログインをいったん終了し、seedの店舗管理者で再ログイン。既存のTableCast連携を同じ店舗・権限でOAuth再接続し、ChatGPTのツールを更新した。作業中に作成された重複接続だけを解除し、既存の主接続を保持。DBの再seedやアプリの再配備はしていない。
- OAuth接続先は `https://tablecast-staging.kit-codex.workers.dev/mcp`。再認証前の設定取得は認証エラー、再接続後の取得は成功した。認証情報やOAuthコールバックURLは素材へ含めない。

### スクリーンショット

Codexブラウザーの通常表示領域1280×720をJPEGで保存した。サイドバーを閉じ、本文をスクロールした実画面。合成・文字の置換・UIの再現・画像加工は行っていない。

| 素材                                                               | 対象と確認内容                                            | 原稿での用途                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------- |
| [tablecast-plugin-connection.jpg](tablecast-plugin-connection.jpg) | ChatGPTのTableCast接続設定                                | 再接続の制作記録。接続方式の説明は本編へ追加しない |
| [tablecast-plugin-analysis.jpg](tablecast-plugin-analysis.jpg)     | 新しい会話の売上・来店数・客単価の比較                    | 店舗データを取得して振り返る実例                   |
| [tablecast-plugin-proposals.jpg](tablecast-plugin-proposals.jpg)   | 同じ応答の商品注文率に基づく3つの改善案                   | 分析から次の施策へ進む実例                         |
| [tablecast-plugin-draft.jpg](tablecast-plugin-draft.jpg)           | 続く依頼で英語説明を下書き保存した応答                    | 自然文の依頼から設定変更まで進む実例               |
| [tablecast-plugin-review.jpg](tablecast-plugin-review.jpg)         | TableCast管理画面を再読み込みした後の変更前後・未公開表示 | 会話中の報告と実際に保存された設定の照合           |

統計はstagingに投入された合成履歴。閉卓した通常来店を対象にする集計でも、seed由来の履歴は実営業の売上とは区別する。画面の売上増46.0%をTableCast導入による効果と説明しない。

### 実際に送信した依頼

1回目：統計の取得・比較・改善案のみ。

```text
京料理こもれび四条店の直近28日（2026年10月3日〜30日）の売上と人気商品を、前の28日と比べて。注文数・注文率の上位5品と、メニューや接客で改善できることを3つ教えて。現在のデータを取得して、設定はまだ変更しないで。stagingの合成データを使うデモです。
```

2回目：採用した案を英語説明の下書きへ保存・検証。

```text
2つ目の改善案を試したいです。お造り三種盛りの英語の商品説明を、初めて日本料理を食べる人にも、生の魚を少しずつ味わう料理で、まぐろ・さけ・たい各3切れ、計9切れを取り分けて楽しめることが伝わる文にして。登録情報にない由来・産地・安全性は足さず、英国英語で。現在の設定を取得し、価格・画像・食材情報・他の言語・他の商品を保った下書きに保存して、検証と変更前後の確認までお願いします。既存の下書きがあれば内容を保ってください。公開申請と公開はまだしないで。
```

### 実データとの照合

会話とは独立に接続済みMCPで両期間の統計を取得し、以下を照合した。タイムゾーンはAsia/Tokyo。商品別は両期間とも58行を取得し、次ページなしを確認。

| 指標                               | 前期間：9月5日〜10月2日 | 当期間：10月3〜30日 |
| ---------------------------------- | ----------------------- | ------------------- |
| 売上（入金純額）                   | 217,780円               | 317,920円           |
| 来店組数                           | 38組                    | 56組                |
| 来店人数                           | 135人                   | 196人               |
| 注文件数                           | 148件                   | 220件               |
| 1組あたりの売上（円単位の丸め）    | 5,731円                 | 5,677円             |
| スタッフ呼出し                     | 7件                     | 11件                |
| 鶏の唐揚げの注文数量・注文組数     | 20点・15組              | 36点・23組          |
| お造り三種盛りの注文数量・注文組数 | 16点・9組               | 14点・9組           |

お造り三種盛りの注文率は9/38組=23.7%から9/56組=16.1%へ変化。注文率と注文数量は異なる指標として記載する。1回目の応答では設定を変更していない。

2回目の下書きは `9d4a7e9a-d278-4cca-a437-ec49bbae2332`、公開版4から作成、下書き版2、状態 `ready`、検証エラー0件。`get_draft_diff` に加え、開始時の公開設定と下書き全体を再帰的に比較し、差分が `products.1.text.en.description` の1項目だけであることを確認した。価格1,280円・商品画像・食事情報・他の言語・他の商品は保持されている。

- 変更前：Three slices each of tuna, salmon and sea bream, served raw.
- 変更後：A selection of sashimi – thin slices of raw fish to try a little of each. Includes three slices each of tuna, salmon and sea bream (nine slices in total), ideal for sharing at the table.
- 管理画面：[変更内容を確認](https://tablecast-staging.kit-codex.workers.dev/admin/stores/tablecast-komorebi/menu/changes/9d4a7e9a-d278-4cca-a437-ec49bbae2332)。再読み込み後も変更1項目・検証済み・未公開を確認。

公開申請・公開は行っていない。卓上の音声会話、初期導入の資料取り込み、動画の再収録は今回の実行対象外。画面は確認時点の記録で、後日のseed・公開・編集で状態が変わるため、再収録前には現在の対象店舗・設定・データを取り直す。
