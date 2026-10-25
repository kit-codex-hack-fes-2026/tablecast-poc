# GPT-Live・Responses delegation・Honoの接続

## 採用構成

ブラウザーからGPT-Live 1へ標準WebRTCで接続する。GPT-Liveの標準Responses delegationにgpt-6-lunaを設定し、接続・会話文脈・推論の継続をOpenAIへ任せる。Mastra、LiveKit、hosted Agents API、独自STTは利用しない。

```mermaid
flowchart LR
    B[ブラウザー] <-->|WebRTC 音声・字幕| L[GPT-Live 1]
    L <-->|標準Responses delegation| R[Luna]
    B <-->|認証済みtool HTTP| H[Hono]
    H <--> D[D1]
    H --> N[通知DO]
```

公式OpenAI SDKのLive session作成をHonoが行い、SDPだけをブラウザーへ返す。APIキーはサーバーだけが持つ。backendはTABLECAST_MODELのLuna、reasoning medium、verbosity low、Fast mode（service_tier: priority）、最大4096出力tokenとする。出力上限は推論tokenも含むため、従来の800から推論用の余地を増やす。独立したtoolはparallel_tool_callsを許可し、書込みや版に依存する操作は順序を保つ。

[公式Delegation仕様](https://developers.openai.com/api/docs/guides/live-delegation)、[GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)

## ツールと出力

Liveのresponse.event内のresponse.createdでresponse IDを記録し、response.output_item.doneのfunction_callからcall_id・name・argumentsを収集する。response.completedのoutputは空配列になり得るため、その配列からtool有無を判断しない。必要な結果をresponse.item.createで全件返してからresponse.createで一度だけ継続する。

ブラウザーはHonoの認証済みtool経路へ転送する。価格計算、認可、注文・カート操作をブラウザーへ複製しない。業務の失敗はtool結果へ返し、音声接続を維持する。古い委任の遅着結果で次の委任を継続しない。

商品検索は最大8件とtotal/moreを返し、offsetで続きへ進む。商品紹介はgetCatalog(show=true)で検索と最大4枚のカード表示をまとめる。注文する商品を特定したら必要な詳細を取得する。ツール結果からGUIのイベント履歴・二言語の注文snapshotの重複を除き、価格・版・必須選択・認可の検査は維持する。

### 外貨参考額と端末の表示設定

`getCatalog`・`getTableState`・`updateCart`・`prepareConfirmation`・`submitOrder`は、円のフィールドを保持し、`displayCurrency`へ通貨・レート・基準日・状態、金額のあるobjectの`approximate`へ参考額を返す。数量・件数・版は換算しない。読取2toolの`quoteCurrency`は今回の回答だけを指定し、画面の通貨は変更しない。`setDisplayCurrency({ currency })`は明示依頼時だけ使い、nullは円のみとする。自発接客へ変更toolを公開しない。

初期化APIの公開レートをHTTP envelopeの`displayCurrency`（currency・revision・rates）で受け取り、画面と同じ参考レートで計算する。レートは補助表示だけに使い、円の価格・注文・会計の根拠にはしない。呼出しのたびに外部レートを取得せず、全通貨データをモデルへ複製しない。署名・トークン・レートの永続化は設けない。

表示変更の応答には`displayCurrencyAction`を添える。ブラウザーは現行音声・委任とrevisionを確認して端末内の選択を適用し、その後にtool結果を返す。手動変更後の遅着指示を破棄し、後続toolへ新しい表示設定を送る。通貨変更で音声停止・カート更新・注文確認失効を起こさない。取得不能時の参考額はunavailableとし、円の業務処理を維持する。

## 字幕・保存・停止

session.input_transcript.delta / session.output_transcript.deltaを受信時に表示する。字幕の表示順は追加後に入れ替えず、保存したD1履歴を再開時に復元する。強い会話履歴の整合性や字幕の到着を注文承認の証明にはしない。生音声は既定で保存しない。

注文はAPIの版付きsnapshotと、その案内後の明示承認を必要とする。同じ委任で確認準備と承認を行わず、APIも作成turnと異なる現行turnを検査する。委任IDは物理的な発話境界の証明ではない。停止・設定変更・カート変更は古い確認を無効化する。

停止はcapture・再生を即時終了し、APIで音声sessionを失効させ、Liveへsession.closeを送る。API側でも標準sideband接続でsession.closedを確認する。明示再開まで自動再接続しない。確定したカート・注文は停止で戻さない。

自発接客は30秒の無言と店舗設定、空カート、確認・スタッフ呼出・進行中turnの有無をAPIで検査する。参照専用turnで商品を取得し、一商品の事実をLiveへ渡す。客の発話や承認として保存しない。

## 観測と検証

HonoのHTTP、tablecast.voice.tool、D1と通知をGrafanaで追う。tool spanにツール名・call ID・voice session/turn・実行時間・結果byte数を記録する。OpenAI内部をアプリの計測で観測できた扱いにしない。

性能目標はツール受付→結果返却、利用者の発話終了→実返答音声開始の双方1秒以下。待機案内や字幕到着を実再生の代わりにしない。成功率・使用token・標本数と超過区間を残す。

実D1テストは認可・価格・版・同時実行・停止・別卓拒否を検証する。voice-performance.test.tsは商品数を増やし、実D1のSQL実行と保存されたカード表示を確認しながらbinding往復と出力サイズの予算を検証する。上限超過時は原因を調べ、閾値の緩和で成功扱いにしない。

Webの固定イベント試験は全tool結果の返却・一回の継続・エラー・新委任による取消・字幕・停止を検証する。実GPT-LiveとLunaは有料試験で、Inworld生成音声を使いlocalと同一SHAのPR previewで確認する。通常CIの固定イベントだけで実API・音声・1秒達成を証明した扱いにしない。

## 言語変更と接客終了

言語変更は現在のsession IDを保持し、APIの標準sidebandでResponsesの接客指示とLiveの言語指示を更新してACKを確認する。古いturnと確認は失効する。更新の失敗で音声接続を閉じず、同じ言語の操作も再試行できる。声の種類は次の接続から変更する。

接客不要の意思はendConversationへ委任する。注文確認へのそれで大丈夫ですと終了意思を区別し、不明なら確認する。終了toolは後続の業務操作を拒否し、一言の挨拶後の出力無音または最大5秒で既存の明示停止経路へ進む。生音声は保存せず、明示再開まで再接続しない。
