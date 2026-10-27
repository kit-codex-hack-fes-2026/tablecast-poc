import type { z } from "zod";
import type { voiceToolNameSchema } from "./model";

// 登録する関数とsystem promptで、用途の説明を同じ正本から参照する。
export const voiceToolDescriptions = {
  getCustomerSuggestions:
    "usualは本人が飲食した商品、untriedは本人の飲食記録にない販売中の商品、companionsは現在と同じ同行者構成の前回来店の共有注文から候補を返す。未体験を断定せず記録上未体験と伝える。注文前にgetCatalogで現在の必須選択を確認し、通常の確認と承認を経る。moreならnextOffsetで続き。",
  getCustomerContext:
    "現在の接客対象について許可された個人記憶と飲食記録を取得する。needsTargetならiPadで本人の選択を依頼し、声や名前から識別しない。記録にない商品を未体験と断定する前にmoreConsumptionを確認する。現在の商品価格・販売状態・必須選択はgetCatalogで再確認する。sourceは今回の発話だけ。",
  saveCustomerMemory:
    "接客対象本人の明確な一人称の好み・希望だけを自動保存する。getCustomerContextが返した今回のsourceの原文からquoteを抜き出す。話者が曖昧、複数人の混ざった発言、背景会話、他人についての推測は保存しない。保存許可がなくsourceがnullなら実行しない。",
  getCatalog:
    "商品検索。商品名・読み・ID・別名・カテゴリ・説明文をqueryへ指定する。かな表記と全半角を同一視し、誤字・脱字も候補へ含める。複数対象は空白区切りのOR検索で、全語一致を上位へ返す。対象別にtoolを分けない。紹介時はshow=trueで候補カードも表示し、追加のshowProductsは不要。detail=falseは概要、trueは注文・アレルギー回答に必要な選択肢を含む詳細。商品を選ぶ前に必須選択肢を先回りして尋ねない。more=trueならoffsetを進めて次頁を取得できる。同じ委任で取得済みの商品は再照会しない。",
  getTableState:
    "現在の卓、locale（言語）・speechSpeed（話速）、画面のuiSection、表示中の商品詳細のselectedProductId（nullなら詳細なし）、カート版、確認、注文、請求状態を取得する。話者番号から人数や席を推定しない。",
  showReference:
    "Web検索で確認した参考ページをQR・タイトル・favicon・OGP画像付きで会話欄へ表示する。質問の補足をスマホで読むと役立つとき、最も関連するページを1つ選ぶ。urlは公開HTTPS、URLはUTF-8で1000byteまで。1応答の表示は最大3件。店舗の価格・在庫・注文の根拠にはしない。",
  captureCamera:
    "客がONにしたカメラから現在の画像を必要時に1枚読み取る。questionに確認したい内容を指定する。OFFならON操作を案内し、連続撮影・本人識別・画像からの価格やアレルギー安全性の断定はしない。画像が届くまで見えたと答えない。",
  endConversation:
    "もう大丈夫です・今は結構です・That is all, thank youなど、接客が不要という明確な意思で音声を終了する。注文確認へのそれで大丈夫ですは承認であり終了ではない。曖昧なら意図を確認する。終了後の注文操作は行わない。",
  setLanguage:
    "客の明示依頼で表示と音声の言語をja（日本語）/en（British English）へ切り替える。同じ音声接続と声を維持し、次の応答から新言語を使う。切替後は古い確認や追加の業務操作を続けない。",
  setDisplayCurrency:
    "客の明示依頼で、この端末の外貨参考表示を変更する。currencyは対応ISOコード、nullは円のみ。価格の外貨質問だけならgetCatalog/getTableStateのquoteCurrencyを使い表示は変更しない。円の注文・会計、音声接続は変更しない。",
  setSpeechSpeed:
    "客の明示依頼で話速を0.5〜1.5倍、0.1刻みで変更する。通常は1倍。相対的な依頼はgetTableStateのspeechSpeedから0.1増減し、範囲を守る。次の発話から反映する。",
  setUiSection:
    "客の希望に応じて表示タブをmenu（メニュー）、cart（カート）、orders（注文履歴）、bill（会計）へ切り替える。個別の商品詳細を開くときはsection=menuとgetCatalogで確認したproductIdを指定する。productId省略/nullなら商品詳細を閉じて一覧へ戻る。menu以外では商品選択を解除する。注文や会計の確定は行わない。",
  showProducts:
    "商品紹介やおすすめを依頼されたら、getCatalogで確認した商品IDを最大4件指定して会話内に商品カードを表示する。カードは補助であり、候補の名前・違い・価格を同じ応答の音声でも伝える。表示だけでカート追加や注文を行わない。",
  updateCart:
    "現行expectedVersionに対してカートを更新する。既存行を保持し、客の選択をselectionsへ含める。指定のない必須項目は選ばず、返ったmissingとconditionIssuesを確認する。conditionIssuesのoptionIdの条件式は詳細カタログで確認する。requiresは式が成立する必要があり、andは全て、orはいずれか、notは未選択を表す。ORの全候補を必須と説明しない。条件のoptionIdの名称は取得済みの詳細カタログを使う。任意項目は指定がなければ未選択。数量不明の単品注文は1、追加数量が曖昧なら確認する。注文確定には別のprepareConfirmationと次発話の明示承認が必要。",
  prepareConfirmation:
    "版付きの注文確認を作る。結果の内容を自然な言葉で案内し、次の客発話で承認を求める。注文はまだ送信されない。",
  submitOrder:
    "注文内容を案内した後の新しい客発話で、その内容への明示的な承認があったときだけ呼ぶ。訂正・質問・曖昧な相づち・背景会話は承認ではない。",
  callStaff: "アレルギーや交差接触の根拠が不明、聞き取りが曖昧、客が希望した際にスタッフを呼ぶ。",
} satisfies Record<z.infer<typeof voiceToolNameSchema>, string>;
