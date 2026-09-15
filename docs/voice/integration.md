# GPT-Live・Responses delegation・Honoの接続

## 採用構成

ブラウザーからGPT-Live 1へ標準WebRTCで接続する。GPT-Liveの標準Responses delegationにgpt-5.6-lunaを設定し、接続・会話文脈・推論の継続をOpenAIへ任せる。Mastra、LiveKit、hosted Agents API、独自STTは利用しない。

```mermaid
flowchart LR
    B[ブラウザー] <-->|WebRTC 音声・字幕| L[GPT-Live 1]
    L <-->|標準Responses delegation| R[Luna]
    B <-->|認証済みtool HTTP| H[Hono]
    H <--> D[D1]
    H --> N[通知DO]
```

公式OpenAI SDKのLive session作成をHonoが行い、SDPだけをブラウザーへ返す。APIキーはサーバーだけが持つ。backendはLuna、reasoning none、verbosity low、priority、最大800出力tokenとする。独立したtoolはparallel_tool_callsを許可し、書込みや版に依存する操作は順序を保つ。

[公式Delegation仕様](https://developers.openai.com/api/docs/guides/live-delegation)

## ツールと出力

Liveのresponse.event内のresponse.createdでresponse IDを記録し、response.output_item.doneのfunction_callからcall_id・name・argumentsを収集する。response.completedのoutputは空配列になり得るため、その配列からtool有無を判断しない。必要な結果をresponse.item.createで全件返してからresponse.createで一度だけ継続する。

ブラウザーはHonoの認証済みtool経路へ転送する。価格計算、認可、注文・カート操作をブラウザーへ複製しない。業務の失敗はtool結果へ返し、音声接続を維持する。古い委任の遅着結果で次の委任を継続しない。

商品検索は最大8件とtotal/moreを返し、offsetで続きへ進む。商品紹介はgetCatalog(show=true)で検索と最大4枚のカード表示をまとめる。注文する商品を特定したら必要な詳細を取得する。ツール結果からGUIのイベント履歴・二言語の注文snapshotの重複を除き、価格・版・必須選択・認可の検査は維持する。

## 字幕・保存・停止

session.input_transcript.delta / session.output_transcript.deltaを受信時に表示する。字幕の表示順は追加後に入れ替えず、保存したD1履歴を再開時に復元する。強い会話履歴の整合性や字幕の到着を注文承認の証明にはしない。生音声は既定で保存しない。

注文はAPIの版付きsnapshotと、その案内後の明示承認を必要とする。同じ委任で確認準備と承認を行わず、APIも作成turnと異なる現行turnを検査する。委任IDは物理的な発話境界の証明ではない。停止・設定変更・カート変更は古い確認を無効化する。

停止はcapture・再生を即時終了し、APIで音声sessionを失効させ、Liveへsession.closeを送る。API側でも標準sideband接続でsession.closedを確認する。明示再開まで自動再接続しない。確定したカート・注文は停止で戻さない。

自発接客は180秒の無言と店舗設定、空カート、確認・スタッフ呼出・進行中turnの有無をAPIで検査する。参照専用turnで商品を取得し、一商品の事実をLiveへ渡す。客の発話や承認として保存しない。

## 開始案内と発話ヒント

`session.started`の後に、認証済みの`POST /voice/opening`へ現在の音声session IDを渡す。APIは同じ接続の開始案内を条件付きINSERTで一度だけ受け付け、同じ来店の保存済み会話があれば再開として扱う。接続時の店舗名・通常方針・開始方針を`voice.started`へ保存し、会話中の設定公開で開始方針を差し替えない。

gpt-5.6-lunaが一〜三文の開始案内を生成する。利用できるtoolは参照専用の`getCatalog`だけで、商品は現在の公開カタログから取得する。画面表示・プラン取得をこの経路から要求した場合も拒否する。モデルの追加照会は最大3ラウンドに制限する。結果を標準`session.commentary.append`でLiveへ渡し、実際の字幕を既存経路で保存する。開始案内の要求を客発話・注文承認にはしない。無言時の自発接客設定は開始案内を無効化しない。

`POST /voice/suggestions`は音声session IDと対象AI字幕のID・本文を受け、同じ卓の最新保存字幕・言語・中断状態を生成前後に検査する。gpt-5.6-lunaの構造化出力で最大3件、各500文字以下の発話ヒントを返す。店舗の公開カタログと接客方針を取得し、直前に登場した商品を優先して既存のカタログ検索で最大8件のメニューを渡す。モデルに業務toolは与えない。同じ音声session・字幕ID・本文への生成は条件付きINSERTで一度だけ予約し、並行要求・再送は409で拒否する。予約には本文を含めずSHA-256のキーだけを保存する。内部予約は卓・店舗の履歴と差分イベントから除外し、公開履歴の件数枠を消費しない。一接続で最大120回までとし、字幕の差替えでも上限を超えない。上限後は候補を非表示とし、音声会話は継続する。失敗した場合も同じ字幕では再課金せず、次の字幕更新から生成する。字幕の表示用のまとまりを契機に保存・生成し、音声は完了を待たない。本文に続きが届いた場合、客発話、委任、停止、再接続で候補を消し、進行中の要求を中断して遅着結果を破棄する。

開始案内が失敗したときは声で会話を始める案内を画面に表示する。ヒント生成の失敗時は候補を非表示とし、どちらも音声接続を維持する。候補の生成・表示だけでは会話履歴や承認として保存しない。タップされた現在の候補だけを、Live標準の`response.item.create`（user / input_text）と`response.create`で送信し、利用客の会話として保存する。タップ送信は委任登録前に選択文を保存する。通常の音声の委任は字幕保存を待たず、保存が遅延・失敗しても継続する。二重タップ・停止後・古い候補の送信を拒否し、業務操作は既存の委任と版付き承認を通す。根拠は[公式のテキスト入力仕様](https://developers.openai.com/api/docs/guides/live-delegation#accept-typed-input)とする。開始案内と返答例それぞれの独立したmodel spanに入力・出力tokenを記録し、API時間・Liveの実再生・候補表示までの時間を分けて検証する。

## 観測と検証

HonoのHTTP、tablecast.voice.tool、D1と通知をGrafanaで追う。tool spanにツール名・call ID・voice session/turn・実行時間・結果byte数を記録する。OpenAI内部をアプリの計測で観測できた扱いにしない。

性能目標はツール受付→結果返却、利用者の発話終了→実返答音声開始の双方1秒以下。待機案内や字幕到着を実再生の代わりにしない。成功率・使用token・標本数と超過区間を残す。

実D1テストは認可・価格・版・同時実行・停止・別卓拒否を検証する。voice-performance.test.tsは商品数を増やし、実D1のSQL実行と保存されたカード表示を確認しながらbinding往復と出力サイズの予算を検証する。上限超過時は原因を調べ、閾値の緩和で成功扱いにしない。

Webの固定イベント試験は全tool結果の返却・一回の継続・エラー・新委任による取消・字幕・停止を検証する。実GPT-LiveとLunaは有料試験で、Inworld生成音声を使いlocalと同一SHAのPR previewで確認する。通常CIの固定イベントだけで実API・音声・1秒達成を証明した扱いにしない。
