# 剛麺研究所 一乗寺店の初期データ

`tablecast-gomen` はラーメン荘 夢を語れを参考にした架空店。実店舗の支店・公式設定ではない。ロゴ・料理・接客人格はデモ制作物である。

## そのまま試す

最新コードで `bun run setup` 後、通常の開発起動 `bun run dev` のseedから利用できる。既存の開発DBにも通常の `bun run db:seed` で新店舗を追加できる。既存の設定・注文・所属は保持する。PRの新規プレビューはseedテンプレートから初期化される。

Google OAuth emulatorで店長 `daichi.kanda@gomen.example.test` を選び、`/admin/stores/tablecast-gomen/floor` を開く。共有オーナーは佐藤晴香、一般スタッフは `minori.aoki@gomen.example.test`。専用組織と3名の所属、公開設定v1、10席、営業状態・会話・注文・会計例が投入される。実在人物の情報や実パスワードは含まない。店長とスタッフのアイコンは店舗ロゴを使う。

管理画面の会話注文デモは追加設定なしで起動できる。実際の卓上ブラウザーは既存の端末承認で卓へ紐付ける。端末Cookieを共有seedへ埋め込まない。E2Eは模擬GoogleログインからT10の開卓・端末承認・通常注文までを通す。

音声は日英の接客指示を登録済み。voice未指定は製品の標準音声、自発接客はオフ。実音声には環境共通のモデル接続設定が必要で、seedにAPIキーは含めない。食べ放題・ポイント・クーポンはラーメン店のデモには設定せず、通常の単品注文を使う。

## 注文と接客

ラーメン・汁なしを小200g、並300g、大400gの別商品として用意する。麺量は茹でる前のデモ値。汁なし大は売切例。持ち帰り豚400gと烏龍茶を含む8商品をja/en/zh-Hans/koで登録する。smokeは並2種と烏龍茶の3商品、2卓。

ニンニク・ヤサイ・アブラ・カラメは必須の無料選択。カラメは辛味ではなく醤油だれの濃さ。豚マシ250円、生卵50円、チーズ50円は任意の有料追加。並900円に豚・卵を追加した1200円を、通常のAPIによる計算・明示承認で確定する。食材・交差接触は全て未確認とし、アレルギー対応は店員へ引き継ぐ。

接客は落ち着いた低めの声で短く話す職人気質。初来店には専門語を説明し、少量やニンニクなしを尊重する。威圧・罵倒・食べ残しの強要をしない。複数のコールを一度に言われても保持し、不足分だけ一つずつ聞く。この人格は参考店の実際の接客に関する評価ではない。

## テーマと出所

ロゴと横長ブランド画像を構造化し、和紙の背景・墨色の枠・朱色のアクセント・明朝見出し・料理のチラシを配置する。チラシは切り抜かず、画像上の領域とHTMLの商品リンクからラーメン並の通常詳細へ進む。ロゴ・背景・チラシは店舗所有と生成出所をR2に保持する。ヘッダー・音声・注文確認は通常の操作を使う。

参考資料を確認した日: 2026-10-30（JST）。

- [参考店舗](https://tabelog.com/kyoto/A2601/A260303/26003256/)：店種、一乗寺、カウンター10席などの参考。
- [メニュー](https://tabelog.com/kyoto/A2601/A260303/26003256/dtlmenu/)：2022-10-22更新の投稿情報。麺量・価格・豚・卵・チーズを参考にした。現在の実メニューを保証しない。
- 参考時点のデモ価格は小850円・並900円・大950円、持ち帰り豚1000円。烏龍茶200円、無料コールの選択肢、接客人格、セルフサービスの水、売切状態は独自のデモ設定。
- 背景・透過ロゴ・チラシの元素材と生成プロンプト: [既存の制作記録](../design/themes/gomen/SOURCES.md)。WebP化して `assets/demo` に収録。横長ブランド画像は透過ロゴと同じデザインを全体表示する。
- 料理画像は今回個別に生成したイラスト。サイズ違いは同じ料理イラストを共用し、実際の提供量・外観の証明には使わない。持ち帰り豚は画像なしのHTML表示。烏龍茶は既存のデモ料理イラストを共用する。

## 料理画像の生成記録

built-in imagegenで以下を生成し、表示を確認してWebPへ符号化した。画像のトリミング・合成はしていない。

`assets/demo/gomen-ramen.webp`:

```text
Create one premium photorealistic food menu illustration for a fictional Kyoto Jiro-inspired ramen restaurant Gomen Research. Single isolated bowl, three-quarter close view, square composition. A black ceramic bowl with rich cloudy pork soy broth, very thick wavy noodles visible at front, a mound of bean sprouts and cabbage, two thick braised pork slices, a small amount minced garlic, soft pork fat. Warm side light, dark charcoal restaurant table, dramatic delicious steam, bowl completely inside image with comfortable margins. Accurate edible ingredient shapes. No lettering, no logos, no watermark, no utensils, no hands, no split panels. This is synthetic illustrative demo food, not an actual restaurant photo.
```

`assets/demo/gomen-soupless.webp`:

```text
Single premium food menu illustration, photorealistic but synthetic demo for fictional Kyoto Jiro-inspired Gomen Research. Square image, one complete black ceramic bowl of soupless abura-soba noodles, NO broth: very thick golden wavy noodles glazed with dark soy pork sauce, two thick braised pork slices, modest mound bean sprouts and cabbage on one side, minced garlic, bits of pork fat. Three quarter view, warm dramatic light, dark charcoal restaurant tabletop, bowl fully visible, comfortable margins. Clearly visible dry glossy noodles at front and only a little sauce at bottom, not a bowl of soup. No text, logos, watermark, raw egg, cheese, utensils, hands or collage. Different dish from soup ramen.
```
