# 組織のAIキー・課金・請求

[索引](README.md) / [認証](authentication.md) / [テスト](testing.md)

## 所有するデータ

1店舗1組織を維持する。組織作成batchは組織・owner・店舗と`organization_ai`の発行待ちを原子的に保存する。その直後に環境共通Projectへ組織のService Accountと初期キーを作る。失敗しても組織とGUIは残り、5分Cronが再試行する。

`pending → provisioning → ready / failed`で準備を管理する。条件付き更新の120秒leaseで同時発行を排他し、外部要求は60秒で打ち切る。固定名を全ページ照合し、履歴に保存されていない前回の資源を回収する。保存失敗時には作成したAccountを回収する。D1の応答消失は再読込で確認し、保存の成否も不明なら次回のlease回収へ任せ、保存済みの鍵を削除しない。

キーはAES-GCMで暗号化し、組織IDとキーIDを追加認証データにする。暗号化鍵はAPI Workerのsecretから導出する。`organization_ai_keys`はProject・Service Account・APIキーIDと暗号文の履歴を保持する。平文を返すAPI・鍵の表示UIは作らない。暗号化鍵を失うと復号できないため、バックアップを保持し、値だけを置換しない。鍵の失効・外部削除は稼働sessionを終了してから行う。

AI利用権はキーの準備と分ける。無料プランはメニュー・画面からの注文・店舗や卓の管理を月額0円で利用でき、Stripeの0円契約を作らない。AI音声接客はスタンダードの対象とし、組織キーへの切替後、課金有効時には有効期間内のactive契約を必要とする。無料プランでもキーは準備するが、AI無料枠・無料体験の日数は設けない。デモの実AI接続も契約・利用料金の対象とし、架空の注文・会計と区別する。

## 利用量と顧客料金

`voice_usage_sessions`は開始時のキーID、組織・店舗・来店、累積秒数、料金版と設定snapshotを保存する。APIの音声開始はこの台帳と`TablecastVoiceUsage` DOのsidebandを準備してからSDPを返す。停止・sidebandは開始時と同じキーを復号する。キー準備前はAI開始だけを拒否する。

DOは音声・字幕本文を保存せず、`session.usage.updated`と`session.closed`の累積秒を置換する。WebRTC作成時の15秒分は初期料金として一度だけ記録し、実利用量が届いたら差額にする。`response.event`内の完了・中断・失敗のusageはresponse IDで重複排除する。cached inputと実際のservice tierを保持し、未対応モデル/tierを0円で計上しない。計測不能時は音声終了を要求し、主接続は自動再開しない。sidebandはalarmで再接続する。途中で切断した場合はResponses利用量が欠けた可能性を未確定として保持し、後から音声の最終usageを取得しても自動解除しない。最終usageを取得できなかった場合も未確定を残す。404/410または24時間経過で収集の再試行を終了する。

新しい音声sessionの顧客料金は2026-10-21の料金版を使い、音声の秒数とgpt-6-lunaのtokenから計算する。[公式GPT-6 Luna単価](https://developers.openai.com/api/docs/models/gpt-6-luna)は百万tokenあたり入力0.10 USD、cached input 0.01 USD、出力0.50 USD、Fast modeは2倍とする。実際に返るpriorityとfastを同じFast modeとして精算し、defaultへ降格した場合は標準料金を使う。272,000入力tokenを超えると入力・cached inputは2倍、出力は1.5倍となる。2026-10-18版で開始したsessionは旧版のgpt-5.6-luna単価で継続精算し、旧版に新モデルを追加しない。音声はGPT-Live 1の既存秒単価を維持する。円換算は160円/USD、`markupBps=15000`なら1.5倍。百万分の一円を整数計算で保持し、台帳へ卓別USD原価は作らない。契約の料金設定は版ごとに固定し、同じ版の内容変更を拒否する。契約の料金版を更新するときは新規契約用を配列の先頭へ追加し、旧契約の版を残す。

`billing_outbox`の組織別差分をStripe Metersへ送信する。Stripeの値は百万分の一円、Meter Priceは`JPY 0.000001 / unit`、aggregationはsum、customer mappingは`stripe_customer_id`、value fieldは`value`。基本料と従量Priceを公式pluginの同じ契約に載せる。送信識別子は固定hash、再送も同じ識別子を使う。送信結果が23時間以上不明なイベント、34日以上前のイベント、顧客IDを解決できないイベントや現在の契約期間外のイベントは`review`へ移し、自動再送しない。Stripeと照合してから手動で処理する。`unbilled`は課金無効時の計測であり、後から課金対象へ変えない。

契約期間をまたぐ音声sessionの差額は照合対象にし、別期間へ初期料金のcreditを自動送信しない。

Metersの集計と請求書への反映には遅延がある。確定済み請求書へ遅れたイベントを自動追徴せず、台帳とStripeの照合対象にする。顧客向けの金額は見込みで、税・返金・調整を含む確定額はStripe請求書を正本とする。

## 組織の収支

Costs APIを`api_key_id`・`line_item`別、UTC日別に全ページ取得する。Cronは24時間ごとに当月・前月のsnapshotを取り直す。途中失敗したsnapshotは公開せず、二つの月の完了ポインターを同じD1 batchで切り替える。同じ期間を加算せず置換し、それより古い月を保持する。キーの履歴を使い、過去の共有キーや不明キーは組織へ推測で割り当てない。

運営だけが`GET /api/operations/organizations/:organizationId/billing?month=2026-10`をCookie認証で取得できる。`TABLECAST_BILLING_OPERATOR_USER_IDS`に明示したユーザーだけを許可し、店舗owner/adminでは許可しない。応答の原価USDは既知キーへ帰属した報告小計で、未帰属がある場合はpartialを付ける。応答はその160円換算、期間と取得日時、キー導入後の取得範囲、未帰属Project費用、Stripeの発行月別の確定額・入金額を持つ。未取得の原価・入金情報はnull、部分取得・古いsnapshotはflagで区別する。入金額はその発行月の請求書の現在の入金額であり、会計上の月次損益ではない。税・Stripe手数料・返金は別途確認する。

Costsの再取得で顧客の利用台帳・確定請求書を変更しない。顧客API・SSRへ原価・為替・倍率・鍵を返さない。

## 課金画面

`/billing/$organizationId`をURLの組織へ固定する。owner/adminには現在の無料/スタンダードプラン、Stripe契約の請求期間、次回更新・請求予定日、当期に使ったAI利用料を先に示す。当期の金額は暦月の金額を流用せず、契約の開始以上・終了未満で集計する。基本料は契約時と更新時、AI利用料は期間末に精算し、概算と確定請求書を区別する。

月別の利用状況は請求期間と分けて表示する。日別の音声接客時間と、owner/adminだけが切り替えられるAI利用料金のチャート・数値表を置く。初期秒数の差額調整による負数も表示する。AI処理はメニュー確認や注文整理などの情報処理の回数と説明し、会話の往復数と区別する。入出力tokenはAIが読み込み・生成した文章量として、単位の説明とともに詳細へ置く。

通常時のAI準備完了通知は置かない。内部のキー発行状態ではなく、現在のプランで使える機能を案内する。有料AIを開始できない場合は音声接客が設定中/利用不可であること、自動再試行とGUI操作の継続を示す。無料プランの管理者にはAI設定通知を出さない。

無料とスタンダードの機能・料金・利用中表示を比較でき、無料への変更・解約ボタンはStripe Portalを開く。Portalでは期間末の解約を設定する。期間末まではAIを利用でき、利用済みAI料金を最終精算し、その後もGUIを無料で継続できる。解約予約はWebhook同期した状態と終了日時を表示し、戻りだけで完了と判定しない。memberは利用状況・卓/来店明細だけを利用し、当期・日別の金額をAPIやSSRへ含めない。owner/adminは20件ずつの請求履歴を確認し、請求書・PDFをStripeで開く。

組織切替で月・検索・ページを初期化し、別組織のQuery cacheや遅い応答を表示しない。対象月はUTCを明示し、日付の表示は店舗の既存タイムゾーンを使う。日英・iPad縦横・狭い画面に対応する。

## 開発と導入

1. 0026 migrationを適用する。旧組織には発行待ちが追加される。
2. 開発専用OpenAI Projectを作り、GPT-LiveとResponsesの実行権限を用意する。API Workerに`TABLECAST_OPENAI_PROJECT_ID`、管理APIを呼べる`TABLECAST_OPENAI_ADMIN_API_KEY`、32文字以上の`TABLECAST_OPENAI_KEY_ENCRYPTION_SECRET`を設定する。Projectを設定した環境で組織作成とCronが発行する。切替フラグはまだfalse。
3. 既存組織の`organization_ai.state`がreadyであることを、運営用のD1管理手順で確認する。旧sessionを停止してから`TABLECAST_ORGANIZATION_AI_ENABLED=true`へ切り替える。旧共有キーは移行中sessionの停止用に保持する。過去費用を新組織の実績とみなさない。
4. Stripe SandboxでJPY月額Price、sum Meter、JPY 0.000001の従量Priceを作る。Portalで請求書・支払方法・期間末の解約を有効化し、任意のPriceへの変更は無効にする。無料への移行に0円のPriceや契約は作らない。Webhookの送信先は`/api/auth/stripe/webhook`とし、公式pluginが使う`checkout.session.completed`、`customer.subscription.created/updated/deleted`を購読する。
5. APIへStripe secretと料金設定を入れ、`TABLECAST_BILLING_ENABLED=true`にする。Checkout直前に両Priceの通貨・月次・課金方式とMeterを検査する。Portalで請求通貨・基本料・従量Priceを任意変更できる構成にしない。

ローカルは`.env.example`を`.env.local`へコピーし、`bun run dev:config`でAPI専用secretを生成する。GUIとStorybookは外部キーなしで動く。通常CIは外部HTTP/モデルイベントだけを固定し、実D1/DOを使う。現行の`emulate`はGoogle認証に使用する。Subscriptions・Portal・Metersの検証をemulateやstatelessなstripe-mockで代替しない。

Stripe CLIは例として`stripe listen --forward-to http://web.<worktree>.tablecast-poc.localhost/api/auth/stripe/webhook`でlocalhostへ転送できる。表示されたCLI用Webhook secretをローカルAPIへ設定し、API/Webを再起動する。公開配備のWebhook secretと混同しない。

料金設定例（先頭が新規契約用）:

```json
[
  {
    "version": "tablecast-standard-v1",
    "markupBps": 15000,
    "basePriceId": "price_REPLACE_BASE",
    "meterPriceId": "price_REPLACE_USAGE",
    "eventName": "tablecast_ai_usage_v1"
  }
]
```

公開配備の非秘密設定はGitHub variable `TABLECAST_BILLING_CONFIG`に`{"staging":{"TABLECAST_ORGANIZATION_AI_ENABLED":"false","TABLECAST_OPENAI_PROJECT_ID":"proj_REPLACE"}}`のように環境別で保存する。料金設定はその環境の`TABLECAST_BILLING_RATES`というJSON文字列にする。秘密値は既存`TABLECAST_RUNTIME_SECRETS`に新しいsecret名で追加する。staging/productionはそれぞれ専用Project・Stripe環境・secretを使い、設定を有効にする配備だけへ渡す。

## 外部接続の確認

専用ProjectとStripe Sandboxを用意して、組織作成→Service Account/キー準備→Checkout→Webhook同期→実利用→Meters→請求書→Portalの順で確認する。実キー・カード・請求書を通常CIやStorybook fixtureへ持ち込まない。Sandboxの結果と本番配備は分けて記録する。

## 公式資料

- [OpenAI Service Account作成](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/subresources/service_accounts/methods/create)
- [Costs API](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs)
- [GPT-Liveの利用量と初期15秒](https://developers.openai.com/api/docs/guides/voice-latency-cost?api=live)
- [Better Auth Stripe plugin](https://better-auth.com/docs/plugins/stripe)
- [Stripe Meter events](https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api)
