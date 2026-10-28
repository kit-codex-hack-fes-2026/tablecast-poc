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
    "商品検索。客が話した商品名・読み・別名・カテゴリ・説明文をqueryへ指定する。かな表記と全半角を同一視し、誤字・脱字も候補へ含める。複数対象は空白区切りのOR検索で、全語一致を上位へ返す。紹介時はshow=trueで候補カードも表示する。結果のdetail=falseは概要であり、選択肢を取得できないという意味ではない。注文対象が決まったら客の商品名や表示順を取得済みの結果に対応付けて、productIdsへ内部IDを最大8件まとめて指定し、必須・任意の選択肢、温度・容量・追加料金・販売状態・条件を含む詳細を取得する。IDは内部照合だけに使い、客に尋ねたり説明・発話・入力を求めない。requiredSelectionsは概要でも必須項目を示す。未取得の詳細は必ず照会し、画面で選んでもらう依頼へ逃げない。商品を選ぶ前に必須選択肢を先回りして尋ねない。more=trueならoffsetを進める。同じ委任で取得済みの詳細は再照会しない。",
  getTableState:
    "現在の卓、locale（言語）・speechSpeed（話速）、画面のuiSection、表示中の商品詳細のselectedProductId（nullなら詳細なし）、検索画面のmenuSearch（query・offset・結果productIdsは画面順）、カート版、確認、注文、請求状態と、最後に会話へ表示したdisplayedProductIds（画面と同じ順）を取得する。最後のやつ等はこの順序とselectedProductIdから対象を特定し、曖昧なら商品名で確認する。話者番号から人数や席を推定しない。",
  showReference:
    "Web検索で確認した参考ページをQR・タイトル・favicon・OGP画像付きで会話欄へ表示する。質問の補足をスマホで読むと役立つとき、最も関連するページを1つ選ぶ。urlは公開HTTPS、URLはUTF-8で1000byteまで。1応答の表示は最大3件。店舗の価格・在庫・注文の根拠にはしない。",
  captureCamera:
    "認可済みの音声セッションで、客がONにしたカメラの現在フレームを必要時に1枚読み取る。questionに確認したい内容を指定する。結果のcameraが端末の実状態、sessionAuthorizedがAPIの認可を示す。状態を客に質問・確認させず、OFFなら左上のカメラボタンでONにする操作、permission-deniedならブラウザーの許可操作だけを具体的に案内する。失敗時は見えたと言わず、会話を続ける。連続撮影・本人識別・画像からの価格やアレルギー安全性の断定はしない。",
  getCameraState:
    "現在の音声セッション・turnをAPIで認可し、端末のカメラ状態（off・starting・ready・capturing・reading・permission-denied・unavailable）と、現在のpermission（granted・denied・prompt・unknown）を取得する。ブラウザーが許可照会に未対応ならunknownであり、許可済みと推測しない。画像は取得せず、カメラをONにせず、許可ダイアログも開かない。カメラの状態や許可を客に調べさせず、この結果で把握する。APIの認可と端末の撮影許可は別であり、客にログイン状態の確認を求めない。",
  endConversation:
    "もう大丈夫です・今は結構です・That is all, thank youなど、接客が不要という明確な意思で音声を終了する。注文確認へのそれで大丈夫ですは承認であり終了ではない。曖昧なら意図を確認する。終了後の注文操作は行わない。",
  setLanguage:
    "客の明示依頼で表示と音声の言語をja（日本語）/en（British English）へ切り替える。同じ音声接続と声を維持し、次の応答から新言語を使う。切替後は古い確認や追加の業務操作を続けない。",
  setDisplayCurrency:
    "客の明示依頼で、この端末の外貨参考表示を変更する。currencyは対応ISOコード、nullは円のみ。価格の外貨質問だけならgetCatalog/getTableStateのquoteCurrencyを使い表示は変更しない。円の注文・会計、音声接続は変更しない。",
  setSpeechSpeed:
    "客の明示依頼で話速を0.5〜1.5倍、0.1刻みで変更する。通常は1倍。相対的な依頼はgetTableStateのspeechSpeedから0.1増減し、範囲を守る。次の発話から反映する。",
  showMenuSearch:
    "客向けメニューペインに検索結果を表示する。queryとoffset（既定0）を指定し、8件の同じ商品・順序・件数を画面と結果で共有する。more=trueならoffsetを8増やして次のページを表示できる。フォーカスやキーボードを変更せず、注文も変更しない。必須選択の詳細はgetCatalog(productIds)で取得する。",
  setUiSection:
    "メニューペインの画面遷移ツール。section=menu（メニュー）、cart（カート）、orders（注文履歴）、bill（会計）へ切り替える。紹介した商品を詳しく見せるときはsection=menuと取得済みproductIdを指定して詳細を開く。productId省略/nullなら詳細を閉じる。検索状態は保持し、通常のカテゴリ一覧を明示表示する場合はsearch=nullを指定する。検索結果を開く場合はshowMenuSearchを使う。menu以外では商品選択を解除する。客の画面遷移依頼に加え、選択肢の説明や注文確認の補助として適切な画面を表示する。操作は音声で完結させ、画面を押すよう求めない。表示だけでカート追加や注文・会計の確定は行わない。",
  showProducts:
    "商品紹介やおすすめを依頼されたら、getCatalogで確認した商品IDを最大4件指定して会話内に商品カードを表示する。カードは補助であり、候補の名前・違い・価格を同じ応答の音声でも伝える。表示だけでカート追加や注文を行わない。",
  updateCart:
    "現行expectedVersionに対してカートを更新する。既存行を保持し、客の選択をselectionsへ含める。指定のない必須項目は選ばず、返ったmissingとconditionIssuesを確認する。必要な詳細が未取得ならgetCatalog(productIds)で確実に取得し、利用可能な選択肢と追加料金を声で案内して1問ずつ選んでもらう。conditionIssuesのoptionIdの条件式は詳細カタログで確認する。requiresは式が成立する必要があり、andは全て、orはいずれか、notは未選択を表す。ORの全候補を必須と説明しない。条件のoptionIdの名称は取得済みの詳細カタログを使う。任意項目は指定がなければ未選択。数量不明の単品注文は1、追加数量が曖昧なら確認する。注文確定には別のprepareConfirmationと次発話の明示承認が必要。",
  prepareConfirmation:
    "版付きの注文確認を作る。結果の内容を自然な言葉で案内し、次の客発話で承認を求める。注文はまだ送信されない。",
  submitOrder:
    "注文内容を案内した後の新しい客発話で、その内容への明示的な承認があったときだけ呼ぶ。訂正・質問・曖昧な相づち・背景会話は承認ではない。",
  getServiceGuidance:
    "店員呼び出し前の用件確認と店舗案内。お手洗い・SNS・お冷・食器回収・追加の食器・決済方法・営業時間などを登録情報と関連商品から確認し、showで案内の吹き出しを開く。未登録情報は推測しない。",
  callStaff:
    "人が必要な用件や明確な直接呼び出し希望でスタッフを呼ぶ。用件不明なら一度尋ね、getServiceGuidanceで解決可能なら先に案内する。人を希望する客を引き止めない。今回の用件・数量・案内済み内容・未解決点を日本語のsummaryJa、客の依頼の原文をoriginalTextとlocaleへ入れる。個人履歴や過去の会話を含めず、未確認内容を補わない。",
} satisfies Record<z.infer<typeof voiceToolNameSchema>, string>;
