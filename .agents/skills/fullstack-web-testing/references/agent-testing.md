# Agent・MCP・音声のテスト戦略

MCP、Mastra、AI SDK、LiveKitなどを使う場合に読む。製品名でレイヤーを増やさず、**自分たちが所有する判断・接続を、十分な保証が得られる最も低い層で決定的に検証する。** 公式SDKの対象版・公開テスト機能を確認し、テスト専用のAgent基盤やプロトコル実装を作らない。

## レイヤー（具体的なランナー）と比重

| レイヤー（ランナー）                                            | 実物で担保すること                                                                    | 制御する境界・上位に残す保証                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 業務・tool単体（Vitest、Pythonならpytest）                      | toolの入力検証、認可、承認条件、状態遷移、予算・停止判断、エラー変換                  | 時刻・ID・外部I/Oを固定。モデルを起動せずtoolを直接呼ぶ。永続化の原子性は実DB統合へ。                               |
| Agent・workflow統合（Vitest + Mastra / AI SDK）                 | 本番のtool登録・実行、結果の受け渡し、分岐、停止、失敗回復                            | モデルの返答・tool call・streamを台本で供給。自前の制御処理と必要なSDK経路は実物を使う。                            |
| MCP契約統合（Vitest + MCP SDKのin-memory transport）            | 本番server登録と実clientを接続した公開tool/resource/promptの契約、入力・出力・エラー  | LLM不要。実HTTPの認証・Origin・sessionやstdioのプロセス起動は別のtransport統合へ。                                  |
| 永続化・transport統合（Vitest + 実DB / 実HTTP / 子プロセス）    | memoryのtenant隔離、workflow保存・再開、重複実行防止、MCP認証、切断・再接続の採用契約 | モデルは固定応答。DBをmockして原子性や再開を保証したと扱わない。                                                    |
| 会話・音声制御統合（Vitest + LiveKit Agents、Pythonならpytest） | 本番の会話状態、tool、handoff、割り込み、cancel、cleanup                              | 対象版が対応する公開provider境界でLLM/STT/TTSをfakeにし、決めたイベント列を流す。実音声認識・合成品質やRoomは別枠。 |
| UI統合（Storybook + Vitest / Playwright）                       | tool実行中・承認待ち・部分応答・失敗・中断の表示と操作                                | Agent/APIの応答イベントを固定。全tool分岐をブラウザーで再試験しない。                                               |
| 接続smoke（Vitest / Playwright + 実provider / LiveKit Room）    | 認証、providerのwire形式、配備設定、メディア入出力、代表経路                          | 少数に絞る。ローカルfakeで証明できない境界だけを実接続する。                                                        |
| モデル品質評価（Mastra evals / LiveKit test framework等）       | 実モデルのtool選択、回答の意味・根拠、会話継続、音声品質                              | 固定datasetで比較するが非決定的。決定的な回帰テストと結果を分ける。                                                 |

通常CIは単体と決定的な統合を厚くする。実モデル・実Roomの検証は別job/commandへ分け、変更リスクに応じて実行する。ランナーがVitestでも実LLMを呼ぶテストは決定的ではない。temperature=0、seed、固定prompt、コードによる採点だけで生成全体の再現性を保証しない。

## 決定性の作り方

- 最初にモデルなしで検証できる規則を切り出す。toolの成功・拒否・失敗はtoolを直接呼び、Agent統合には登録と引数・結果の接続を確認する代表ケースを置く。
- 公式mock providerや既存の注入境界を使い、モデルのtext、構造化出力、tool call ID・名前・引数、finish/error、streamのchunkを明示する。期待外の呼び出しや台本の枯渇は失敗させ、成功応答へfallbackしない。
- 時刻・乱数・UUID、外部検索・embedding応答を固定し、testごとにthread、run、tenant、memory、tool call IDを隔離する。fake timerは自分たちのtimeout/backoff境界に限定し、実socketのevent loop全体を止めない。
- streamや競合は固定sleepではなく、制御できるpromise・イベント・barrierで順序を作る。終了・cancelを待ち、listener、timer、stream、session、DBを必ず閉じる。
- 返答全文のsnapshotやSDK内部のcall順ではなく、公開された結果、永続化、副作用の有無、終端状態をassertする。順序が契約なら、その必要な前後関係だけを観測する。
- fakeが返す値を確認するだけで終えず、本番の処理がその入力を受けて正しい判断をしたことを観測する。認可・承認・tenant検証をmockで通さない。

## 技術ごとの最小の接続

### MCP（Vitest + MCP SDK）

本番のserver生成・登録を使い、SDKのclientとin-memory transportで接続する。採用しているtoolの公開名・schema、引数検証、結果の変換、tool実行エラーとプロトコルエラーの扱いを代表ケースで確認する。resources/prompts、pagination、cancel等は実際に提供・利用するものだけ対象にする。

認証情報をin-memoryで注入した成功はHTTP認証の証拠ではない。Streamable HTTPでは採用する認証middleware、tenant解決、Origin/sessionの検査を本番入口経由で試す。stdioなら起動・環境・終了の代表接続を子プロセスで確認する。SDK自体のJSON-RPC仕様全体は再試験せず、v1/v2で異なるimportやtransport APIを混ぜない。

### Mastra（Vitest + 本番Agent / workflow）

step内の業務判断は直接テストする。workflowの接続は本番定義を実行し、モデルと外部サービスだけを固定応答にする。採用した分岐、入力mapping、失敗、suspend/resume、cancel、並列処理の結合を公開結果から確認する。全stepをmockしてworkflow成功を返しても、stepの保証にはならない。

保存からの再開が要件なら、実storage adapterに保存し、新しいrun実行環境から再開して副作用が重複しないことを確認する。in-memory storageだけでDB永続化やプロセス再起動後の復旧を証明しない。Mastraのevals/scorerはモデル品質の比較に使え、採点関数が決定的でも実モデル生成は別の不確実性として扱う。

### AI SDK（Vitest + ai/test）

対象版の `ai/test` のmock modelと、`ai` の `simulateReadableStream` 等の公式helperを使い、本番の生成・stream処理に注入する。`MockLanguageModelV*` 等の世代とprovider interfaceは導入版に合わせる。`generateText` 等を丸ごと成功mockに置き換えてtool接続を検証済みにしない。

tool call→本番tool→結果→次のモデル応答を台本化し、自分たちの停止条件、承認、結果変換、部分出力後の失敗・abortを観測する。retryや最大stepは採用した設定・独自判断の保証に絞り、SDK内部アルゴリズムを再試験しない。HTTP adapterやUI stream形式は実route・consumerを接続する別の統合で担保する。

### LiveKit（Vitest / pytest + LiveKit Agents）

まず文字入力または固定transcriptで会話の業務判断とtoolを検証し、音声を通すケースを増やさない。公開provider境界のfakeで、STT final、LLM応答、TTS完了、割り込み等を制御し、本番の状態遷移・cancel・古い応答の抑止を観測する。mock APIとNode/Pythonの対応差は導入版で確認し、非公開APIをpatchしない。

公式テスト例は実LLMやjudgeを呼ぶことがあり、Room接続も行わない。toolのmockだけでモデルまで決定的になったと扱わない。自分たちの認識後処理には固定音声・transcriptを使い、実STTの認識率、TTSの聞きやすさ、VAD/turn detection精度、WebRTC・端末の実遅延は必要な音声評価・Room接続へ残す。テキスト会話の成功を音声パイプライン全体の成功にしない。

## ケース設計とGiven / When / Then

独立した規則ごとに同値分割・境界を作る。以下から採用契約に必要なものを選び、全組合せや全SDK機能を網羅しようとしない。

| 規則・リスク     | 決定的なケース例                                                                                                | 最低十分な所有層                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| toolの安全な実行 | 正常入力 / 不正入力、許可 / 拒否、同tenant / 他tenant、承認前 / 拒否 / 承認済みを独立に試し、拒否時は副作用なし | tool単体。入口の認証とDB tenant条件は各統合にも残す |
| 停止と予算       | 上限直前 / 到達 / 超過要求、連続tool call、cancel後の遅い結果で追加実行なし                                     | Agent統合 + 固定モデル                              |
| 再実行           | 同じ要求の再送、同時到着、書込み後・応答前の失敗で重複なし                                                      | 実DB統合 + 制御した競合                             |
| stream           | chunk分割、空応答、部分成功後error、abort、終端後の遅延イベント                                                 | consumer/Agent統合。wire差はtransport統合           |
| memory・検索     | thread/tenant越境なし、古い履歴、固定検索結果と出典IDの対応                                                     | 純粋な整形は単体、検索の隔離条件は実storage統合     |
| 音声制御         | 無発話、発話中の割り込み、tool実行中の切断、旧ターンの遅延完了                                                  | 固定イベントによる会話制御統合。実認識品質は別評価  |

命名は既存のGWT規約を使う。たとえば `承認がないとき、削除toolを要求されても保存先を変更しない` は、Givenで未承認と削除可能なresourceを用意し、Whenでtoolを要求、Thenで承認待ちの公開結果と書込みなしを確認する。tool単体では直接呼び、Agent統合では同じ引数を固定モデルから発行して結線だけを確認する。LLMが偶然そのtoolを選ぶのを待たない。

同じ規則の入力違いはnamed rowのeach、別の状態遷移や副作用は別テストにする。fixtureは短い合成会話・toolイベント列を使い、重要な前提を巨大transcriptや汎用シナリオDSLへ隠さない。

## 実モデル評価とCI

決定的なテストでは「そのtoolをモデルが適切に選ぶか」「回答の意味が正しいか」は保証できない。prompt・model・tool説明・検索方針などが変わる場合は、代表的な成功、曖昧入力、拒否、複数turn、誘導入力を含む固定datasetで評価する。権限や承認はpromptへの期待だけで守らず、実行側で強制する。

正解ID・schema・副作用・必須事実などコードで採点できるものを先に使い、意味や自然さに必要な場合だけLLM judgeや人の評価を加える。model/provider版、prompt、dataset、生成設定、試行数、評価基準を記録し、成功率・失敗例・費用・遅延を比較する。安定しない全文一致や成功するまでのretryを品質保証にしない。

通常CIでは意図しないネットワーク・実モデルへのfallbackを失敗させる。実provider評価は明示したjobで実行し、必要なキーがない場合に黙ってskipして成功扱いにしない。未実行・一時隔離は理由、担当、解除条件、代替保証を残す。PRでは決定的テスト、実接続smoke、モデル品質評価を区別して実行結果と残る保証範囲を書く。
