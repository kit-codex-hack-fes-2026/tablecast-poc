# 音声構成の実現可能性と残る課題

確認日: 2026-09-06。対象はこのリポジトリの実装と固定した依存版。

Hono、Mastra、LiveKit、Inworldを組み合わせる構成は、業務ロジックを重複させず実装できる。実際にWorkers上のMastraから本文をストリームし、同じD1のカート・確認操作を呼ぶ経路を検証した。ローカルのLiveKit Serverでは、別々のブラウザー参加者間で合成音声を送受信し、復号後のサンプルまで確認した。一方、外部設定は後で用意するというユーザーの指定に従い、実Inworld・実LLM・iPadでの音声往復は実施していない。現時点の結果はAPI接続、ローカルWebRTC通信、安全性の実証であり、店舗での音声注文全体の受入完了を意味しない。

## 実装した接続

| 境界                 | 採用した実装                                            | 確認できたこと                                                              |
| -------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| Web → API            | 同一オリジンのHTTP、Service Binding、端末認可           | 店舗・卓の権限と業務状態をAPIで決定する                                     |
| API → Mastra         | `@mastra/core` 1.64.0の`RequestContext`と`Agent.stream` | 公式AgentとToolsがWorkersで動き、汎用管理経路を公開せず使える               |
| Python → API         | 公式`LLM` / `LLMStream`、httpx、`text/plain`            | UTF-8の分断、取消、停止済みsessionの拒否を処理する                          |
| Python → Inworld     | `livekit-agents` / 公式Inworld plugin 1.8.0             | 公開constructor、STT/TTS設定、Agent CLIのimportが成立する。外部音声は未確認 |
| Agent → Web          | LiveKitの音声track・字幕・公開agent state               | WebのRoom処理を実装済み。実Agentとの音声往復・音響評価は別途必要            |
| Web ↔ LiveKit Server | 公式ブラウザーSDK 2.22.2、ローカルServer 1.13.6         | 合成音声のpublish・subscribe・復号と、Room削除時の両参加者の切断を実証      |

Pythonは注文ツール、金額計算、DBアクセスを持たない。LiveKitの再生・中断を反映した会話履歴を毎turn Mastraへ渡し、Mastra側の独立memoryは有効にしていない。履歴と字幕の必要な整形だけを公開nodeへ置いた。[LiveKit公開node](https://docs.livekit.io/agents/logic/nodes/)、[Mastra Agent.stream](https://mastra.ai/reference/streaming/agents/stream)

固定版`@mastra/hono` 1.7.6のcontext middlewareは、未使用の管理routeもimportし、Node向け`createRequire(import.meta.url)`をbundleに含めていた。Vitestの経路は成功したが、Vite・esbuildで生成したWorkerはworkerdの起動時に失敗した。そこでHonoが認可したActorを公式`RequestContext<{ actor: Actor }>`に設定し、公式`Agent.stream`へ直接渡す構成へ修正した。独自adapterは追加していない。この修正後に同じ音声HTTP試験12件と型検査が成功し、API担当がViteの本番bundleを実workerdで起動してhealth 200を確認した。Webとの結合は[配備手順](deployment.md)で別に記録する。[公式RequestContext](https://mastra.ai/docs/server/request-context)

固定版LiveKit 1.8.0の実セッション試験では、LLMを登録せず `llm_node` のみ上書きした以前の実装が応答開始時に失敗した。公式 `LLM` / `LLMStream` 拡張へ同じHTTP接続を登録して解消し、通常応答・自発応答・204・取消・停止・503時の再試行禁止を実SDKで確認した。外部LLMをPythonにも置いたわけではない。

関連実装: [音声HTTP](../apps/api/src/voice.ts)、[Mastra Tools](../apps/api/src/agent/cast.ts)、[Python Agent](../livekit/src/tablecast_livekit/agent.py)、[Web音声接続](../apps/web/src/features/kiosk/voice-connection.ts)。

## 実施した試験と未実施の試験

| 対象                                   | 最終結果                                                   | 試験の境界                                                                                   |
| -------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Python接続・字幕・話者変換             | pytest 82件成功、ruff・format・ty成功                      | 外部AIなし。HTTP transportはfixture。実AgentSessionの応答・取消・204・失敗と診断の試験を含む |
| 音声HTTPとMastra                       | WorkersのVitest 30件成功、API型検査成功                    | 実workerd・D1・Mastra・OpenAI SDKを使用。外部HTTP応答だけfixture                             |
| Inworld最小patch                       | 隔離環境のpytest 13件成功、ruff成功                        | 公式pluginを正規インストールした変換・イベントfixture。アプリには未適用                      |
| CLIと有料試験の入口                    | `tablecast-voice --help`成功、明示flagなしの有料試験を拒否 | 外部keyを使う前に拒否する                                                                    |
| 日英STT/TTS・自然さ・騒音・AEC・実端末 | 未実施                                                     | 数値、遅延、聞き取り成功率を推測で埋めない                                                   |
| ローカルWebRTC音声通信                 | Chromium 153.0.8010.12で成功                               | 実LiveKit Serverと2参加者を使用。440 Hzの合成音声のみ。実マイク・外部AIなし                  |

Pythonの途中報告72件から66件への変更は、字幕53文字に対する分割位置53〜58がすべて全文＋空文字になっていた重複6例を除いたため。`range(1, len(TAGGED_SENTENCE))`で実在する52境界はすべて検査する。失敗例の削除やskipではない。patchの13件は別環境の別目的であり、通常Python試験へ足して合計件数を表示しない。この66件に実AgentSessionの6件、その後に診断の10件を追加し、最終82件が成功した。以前の途中件数を最終結果として再利用していない。

再実行方法は [Python README](../livekit/README.md) と [patch記録](../patches/livekit-inworld/README.md)。実AIの疎通は明示的な有料試験として分離した。メモリ内の合成音声を再認識するだけなので、それが成功しても実マイクや店舗品質の証明にはならない。

WebRTCの再実行は、ローカル起動後に`bun --no-env-file scripts/tablecast-livekit-check.ts`を使う。PlaywrightのChromiumが必要であり、未導入なら`bun --no-env-file x playwright install chromium`で導入する。このworktreeの設定に一致するloopbackのLiveKitだけに接続し、検証専用Roomを作成・削除する。製品API、実マイク、外部AIは使わない。2026-09-06の実行では41 packets、10,200 bytes、38,400音声サンプル、RMS 0.070536を受信した。公式`track.attach`による再生開始とWebAudio analyserで復号を確認し、Room削除後は両参加者が切断された。音は端末スピーカーへ出さず、生音声も保存しない。秘密を含まない結果は`.local/livekit-check.json`に保存する。[検証スクリプト](../scripts/tablecast-livekit-check.ts)

## 取消と注文確定の評価

取消は二つの問題に分ける必要がある。音声処理を終了することと、終了前に確定した業務更新を消さずに古い処理を拒否することは、別の境界で保証する。

ブラウザーは停止時にcapture trackを即時停止し、再生要素を外し、Roomを切断する。許可待ち・接続待ちに停止しても、遅れて取得したtrackをpublishしない。明示再開だけが新しいvoice sessionを作る。DBでは`voice_version`による開始の競合検査、`voice_session_id`による旧停止の対象限定、`active_turn_id`による古いToolsの拒否を行う。

PythonのHTTP取消はMastraの`abortSignal`へ伝える。consumer取消で実SDKのprovider requestがabortされ、DBのturnが中断となることを試験した。ここで確認したのはHTTP境界であり、iPadからInworldまでの実際の停止時間は未測定。[Mastra取消仕様](https://mastra.ai/reference/streaming/agents/stream)

独立reviewで、Mastraの`textStream`が内部のerror chunkを本文から除くため、エラーが空の正常EOFになり得ることを固定版のソースで確認した。公式`onError`で失敗を受け、HTTP stream自体を異常終了させる処理を追加した。provider 401のfixtureで失敗turnになることを確認済み。Honoの本文stream helperも例外を正常終了へ変える経路があるため、標準`ReadableStream`でエラーと取消を明示している。

APIには公式`RoomServiceClient.deleteRoom`による停止を用意した。DB失効後に対象Roomだけを終了し、Room未作成・削除済みは平常扱い、通信失敗は503とする。これによりブラウザーの切断通知だけへの依存を減らす。通信が両経路で失われた際の即時停止は保証できず、外部処理のtimeoutと実機での確認が残る。DB上の古い操作は引き続き拒否する。

注文確認はAPIの版付きsnapshotの本文を`session.say`で固定再生する。通常LLMは確認準備tool後に生成を終える。`SpeechHandle.wait_for_playout`だけでなく、公開`exception()`と`interrupted`を確認してから読了を送る。DBは同じturnが作った確認のみ読了にでき、読了より後に始まる別turnだけが音声承認できる。金額・カート版・設定版・有効期限・冪等キーは同じAPIが検査する。

遅い再生通知や終了通知は、後続turnや新しい確認を失効させず、中断・失敗を完了へ戻さない。履歴はSDKが返す再生済みの本文を記録し、そのturn開始時の言語を保存する。発話意図の分類、背景会話、曖昧な相づちを承認にしない品質は、プロンプトだけで保証せず実モデル評価で確認する。

## 話者対応の未完了部分

公式Inworld plugin 1.8.0には、話者分離とSTT単語時刻の公開optionがない。[Inworld公式仕様](https://docs.inworld.ai/stt/speaker-diarization)に従い、opt-in設定と結果変換だけを追加した最小patchを作成した。話者0と欠損、接続内ID、ms→秒、交互話者、空final、未知時刻を検証した。

patchのbaseは`d8607e6711bf9770bfd7e5476f79ab63e6a451a6`、ローカルfork commitは`2f36303643f00c9c521d9dc27a785a6f273bbfb1`。差分と正確なcommitを復元できるbundleを保存している。公開forkへのpush・上流PRは行っておらず、`uv.lock`は公式版のまま。現在の通常起動で話者対応が有効になったとは扱わない。

公開forkを完全SHAで採用した後に、公式`MultiSpeakerAdapter`との時刻/RMS結合、再接続、同時発話を検証する必要がある。現patchのfixtureはRMSや実際の話者精度の証明ではない。話者番号は本人・席・注文者・会計の根拠にしない。独自STT、private monkeypatch、site-packages編集で穴埋めしない。

## 遅延と費用を測る場所

現時点で実音声のp50/p95はない。最初の計測は次の既存境界に限定する。

| 区間                                     | 取得先                                                                  | 判断したいこと                                  |
| ---------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------- |
| 発話終了→STT確定→turn確定                | LiveKit `ChatMessage.metrics.transcription_delay` / `end_of_turn_delay` | 認識と無音判定のどちらが待ち時間を作るか        |
| PythonのLLM node→最初の本文              | `llm_node_ttft`、API request IDとturn ID                                | Python/API往復、LLM初回生成、Tools待ちの内訳    |
| 最初の文→最初の音声→再生                 | `llm_node_ttfs` / `tts_node_ttfb` / `playback_latency`                  | 長い一文、TTS接続、WebRTCの寄与                 |
| 停止押下→track終了→Room終了→provider取消 | WebとAPIとPythonの同じsession/turn ID                                   | 各段階の停止漏れと時間差                        |
| 利用量                                   | `session_usage_updated`とMastra/モデルのusage                           | STT音声量、TTS出力量、LLM token、取消時の利用量 |

LiveKit 1.8.0の公開型で、turn別遅延は`ChatMessage.metrics`、累積利用量は`session_usage_updated`が入口となっている。古い`metrics_collected`は非推奨である。本文のみを返す今回の接続では、モデル課金tokenをPython側で文字数から推定せず、APIのモデルusageを別途記録する。[LiveKit観測の入口](https://docs.livekit.io/deploy/observability/)

費用にはSTT/TTS/LLMの従量、Pythonの常駐計算資源、LiveKitの帯域、Web/API/DB/ストレージが含まれる。実請求や月額をまだ測っていないため、低価格だと断定しない。店舗数・同時接客卓数・接続時間・発話時間・注文当たりのmodel step数を計測し、契約時点の単価で見積もる。停止しても既に処理済みの推論利用量は取り消せない。

## 配備と運用の制限

Wrangler 4.129.0の複数configによるローカル起動では、ProxyControllerがリクエスト切断の `Network connection lost` を致命的エラーとして扱い、全体が終了した。DOの予約コード修正とは別問題で、[同じ症状の報告](https://github.com/cloudflare/workers-sdk/issues/15317)と[未反映の修正PR](https://github.com/cloudflare/workers-sdk/pull/15207)を確認した。本実装は導入済みの公式Vite previewへ切り替え、Web/APIのbuild成果物を1つのMiniflareから起動する。独立preview環境では、正常WebSocket終了10回とタブ閉鎖10回の後も毎回health 200、認証とプロセスを維持した。これはローカル開発proxyの対処であり、公開Workersの可用性を証明する試験ではない。[公式Vite preview](https://developers.cloudflare.com/workers/vite-plugin/)

Web/APIのruntimeはworkerd、Python Agentは別プロセス、LiveKitはWebRTCメディアサーバーとなる。Bun採用はWorkersをBun runtimeへ置き換える意味ではない。WorkersのHTTP streamingはクライアント接続中継続できるが、CPU・メモリ・subrequestの上限、切断やruntime更新を考慮する。応答後の処理を無制限の`waitUntil`へ逃がさない。[Workers公式limits](https://developers.cloudflare.com/workers/platform/limits/)

Pythonの配備用Dockerfileは公式uv/Pythonのdigestとuv.lockで固定した。実linux/amd64 imageを非rootで起動し、外部通信できない専用ネットワーク内のLiveKit登録とhealthを確認した。Room jobはdispatchしておらず、実際のAPI・Inworldとの音声往復は未確認である。ローカルのHTTP・Docker起動は公開配備の証明にはならない。実端末から接続可能なHTTPS/WSS、信頼された証明書、UDP到達性、必要なTURN/TLS、ファイアウォール、DNSが必要になる。PythonはAPIへHTTPSで到達でき、LiveKitは同じAgentをdispatchできる必要がある。[LiveKit公式配備](https://docs.livekit.io/transport/self-hosting/deployment/)

STT/TTSのvoiceと日英の自然さ、店内Wi-Fi、iPadのautoplay/マイク許可、配置とスピーカー音量は実測が必要。AECは有効にするが、自己音声ループや背景音声の誤注文がゼロになる保証ではない。安全に迷う場面はスタッフ・GUIへ戻す。

生音声は既定保存しない。Inworldの不要なvoice profilingを無効にした。ローカル検査でONNX Runtime 1.29.0のtelemetryが`:memory:.ses`を生成することが分かり、初期import前に公式`ORT_DISABLE_TELEMETRY=1`を既定設定した。生成物を削除し、同じCLI操作で再発しないことを確認した。[対象版のtelemetry初期化](https://github.com/microsoft/onnxruntime/blob/v1.29.0/onnxruntime/core/platform/posix/telemetry.cc)

## 次に行う改善

自発接客の開始経路は実装し、SDKの相互無言通知、APIでの最新設定・業務状態・180秒制限、競合予約、参照専用ツール、客の割込みと明示停止をローカルで検証した。実店舗の無言検出・声掛け頻度・自然さは未評価である。標準voiceの一覧取得と、変更するIDの実在性・SYSTEM・主言語の検証は実装した。管理HTTPとMCPで同じ処理を使い、provider境界のfixtureで確認済みだが、実一覧の取得・英国英語のアクセント・店のキャラクターとの適性は外部設定後の試聴で確認する。

1. 試聴済みの日英voiceと外部設定を用意し、まず小さい有料STT/TTS疎通、次にAPI・Roomを含む実音声往復を行う。初期bootstrapは実装して隔離D1で検証済みであり、公開先のmigration適用後に対象設定を確認して実行する。失敗時に別モデルへ自動切替しない。
2. iPadで通常注文、確認途中の訂正、停止中の言語変更、ネットワーク断、TTSだけが話す場面を試す。停止後のマイク表示とprovider送音停止を両方確認する。
3. forkの公開先を確定して完全SHAでlockし、話者変換のfixtureとMultiSpeakerAdapterの結合試験を通す。公式releaseで同じ契約を満たしたらforkを外す。
4. 接続済みの `traceId`・turn・Mastra `runId`・LiveKit `sdkRequestId`・`speechId` と上表のmetricsを合わせ、実音声の遅延・利用量を集める。成功・拒否・途中失敗・取消・旧turnの後処理の対応と非漏洩はローカルで検証した。SDKは失敗時にmetricsを出さないため、診断記録と公開errorも使う。本文のみのHTTP接続から課金tokenを推測しない。性能課題が分かってから、長い応答、過大なcatalog、不要なtool step、接続初期化を対象に小さく調整する。
5. 外部providerの失敗を客向けエラー表示まで追跡し、GUI復旧を確認する。認識の自信が不明な注文や曖昧な承認の会話評価を日英で蓄積する。

この改善のために汎用Agent基盤、第二のLLM、Pythonの業務ツール、独自音声推論loopを追加する必要はない。現在の公開SDK境界とAPIの業務操作を保ち、測定で必要性が示された箇所だけを変える。
