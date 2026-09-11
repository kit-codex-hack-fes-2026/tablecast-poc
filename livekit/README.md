# TableCast音声Agent

公式LiveKit 1.8.0とInworld STT/TTSを使用し、接客と注文操作をHono/Mastraへ委譲するPython Agent。
通常のチェックは外部AIを呼ばない。実マイク、iPadのエコー・停止、日英の自然さは未検証。
STT話者対応は [公開forkの最小パッチ](../patches/livekit-inworld/README.md) を完全SHAへ固定して適用済み。話者・単語時刻を有効にし、欠損した話者は未識別として扱う。

ルートの `bun run dev` がworktree専用のLiveKitとAPIを起動する。Python Agentは別ターミナルでuvから起動し、uv自身がルートの `.env.local` と生成済み `.local/.env.voice` を読む。
外部設定を追加する場合はルート `.env.local` の `INWORLD_API_KEY` と試聴した標準voice IDを設定し、店舗設定の `cast.voice.ja/en` も公開する。
API側のモデル設定も必要。voice未選定や外部設定不足のときは接続を成功扱いにせず、GUI注文を継続する。

音声プロセスに渡す環境変数は次の通り。LiveKitと内部HTTPの秘密はブラウザーへ渡さない。

| 変数                                                       | 用途                                             |
| ---------------------------------------------------------- | ------------------------------------------------ |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`     | worktree専用LiveKitへのAgent接続                 |
| `TABLECAST_API_URL`                                        | Service Bindingの手前にあるWebのURL              |
| `TABLECAST_VOICE_API_TOKEN`                                | 音声専用の内部HTTP認証                           |
| `TABLECAST_AGENT_HEALTH_PORT`                              | worktree専用Agent health port                    |
| `INWORLD_API_KEY`                                          | Inworld公式pluginのAPI key                       |
| `TABLECAST_INWORLD_VOICE_JA`, `TABLECAST_INWORLD_VOICE_EN` | 起動前の設定確認と有料試験で使う試聴済みvoice ID |

Pythonの依存は `pyproject.toml` と `uv.lock` に固定する。検証はルートからも実行できる。

```sh
uv sync --directory livekit --locked
uv run --directory livekit ruff check .
uv run --directory livekit ruff format --check .
uv run --directory livekit ty check src tests
uv run --directory livekit pytest
```

公式 `LLM` / `LLMStream` 拡張の `TablecastLLM` が、httpxのUTF-8デコーダーを通して読み上げ本文を既定のLLM nodeへstreamする。固定SDKでは `llm_node` の上書きだけでは応答を開始できないため、実際の `AgentSession.generate_reply` でも接続を検証する。エラーや取消で接続を閉じ、業務操作を自動再試行しない。
Roomへの `ctx.connect()` 完了後に参加者を指定して `AgentSession.start()` を呼ぶ。未接続のRoomで音声出力を初期化すると、SDKがローカル参加者を取得できず起動に失敗する。割込み判定はSileroのVADを明示し、ローカルLiveKit資格でCloudのAdaptive Interruptionへ接続しない。
`transcription_node` は生成文の英語演技指示とbreakだけを除去する。客の原文は加工しない。
接続中の認識・生成本文は `tablecast.voice` topicで対象端末だけへ80ms単位で送る。逐次字幕とデバッグ用原文を分け、容量超過は表示同期待ちとして扱う。発話済み履歴の正本はAPIに維持する。TTSの公開 `max_buffer_delay_ms` は300msとし、短い応答のバッファ待ちを抑える。
注文確認は同じAPIスナップショットを `session.say` で一度読み、`SpeechHandle.wait_for_playout` の完了後だけ読み上げ完了を送る。
音声停止はRoom退出とAgentSessionの即時終了へ伝わり、DB側でもvoice sessionとturnを失効させる。カートや確定注文のロールバックは行わない。

`tablecast-voice-check` は明示操作で実行する有料のSTT/TTS疎通試験。生成音声をメモリ内で再認識し、日英の確定認識と音声長を出力する。音声ファイルは保存しない。

```sh
TABLECAST_RUN_PAID_VOICE_TESTS=1 uv run --project livekit --env-file .env.local tablecast-voice-check
```

この試験は人手の自然さ評価、実マイク、LiveKit転送、iPadのAEC、騒音、複数話者の評価を代替しない。
2026-09-07のパッチ適用後は演技タグ付きの日英合成と話者・単語情報も検証する。日本語3.09秒・5単語、英語3.69秒・6単語の音声で、両方の話者0を取得した。別途、ローカルRoom経由でも話者情報と演技タグ付き返答を確認した。短い発話では話者が欠損する場合があるため、話者番号の取得を常時保証しない。
2026-09-06に既存の開発資格で実行し、日本語Asukaの合成2.55秒と確定認識、英国英語Oliviaの合成2.49秒と確定認識を確認した。日本語の認識結果はホージチャを二杯お願いします。、英語はTwo roasted green teas, please.だった。疎通は最初の確定認識で完了し、WebSocketがサーバー側で閉じることを待たない。生音声ファイルは保存していない。

APIのモデルは `.env.local` の `TABLECAST_MODEL=gpt-5.6-luna` を使用する。MastraのChat Completions呼出しでは `providerOptions.openai.reasoningEffort="none"` を指定する。実サービスで、推論を有効にしたLunaとfunction toolsの組合せはHTTP 400となり、この指定でツール呼出しが成功することを確認した。
2026-09-06に空席のこもれびT11を試験用に開き、合成した日本語の質問を実LiveKit Roomへ送った。Inworldの確定認識、Mastra/Lunaの日本酒提案、Inworld TTS、受信側の非無音フレーム2092個、`listening → thinking → speaking → listening` と会話ログの再生完了を確認した。試験後は音声を停止し、空の来店セッションを閉じた。これは合成音声による転送試験であり、実マイク、iPad、音声による注文確定は未検証。

自発接客はSDKの30秒の相互無言通知から開始し、最新設定・業務状態・180秒の間隔はAPIで検証する。客の発話を捏造せず、応答のない沈黙では一度だけ試みる。APIの204では履歴・再生記録を作らず、客の発話で進行中の自発応答を中断する。注文操作のツールは自発接客へ渡さない。録音は `record=False` で無効にする。

## Python Agentの配備用イメージ

[LiveKit公式テンプレート](https://docs.livekit.io/deploy/agents/builds/)と[uvのDocker手順](https://docs.astral.sh/uv/guides/integration/docker/)に沿い、Python 3.13・uv 0.11.26の公式イメージをmanifest digestへ固定する。依存は `uv sync --locked --no-dev` で導入し、アプリを非editableでインストールする。非rootの `tablecast` ユーザーが既存の `tablecast-voice start` を直接起動する。

ビルド中に公開CLIの `python -m livekit.agents download-files` を実行する。固定版Silero 1.8.0のONNXはwheelに同梱されるため、さらにネットワークを無効にした `silero.VAD.load()` で資産とnative libraryを確認する。モデルAPI資格はビルドに不要。

リポジトリルートから次を実行する。build contextは `livekit` に限定し、`.dockerignore` で秘密・仮想環境・試験結果を除外する。最終イメージへコピーするのはインストール済み環境だけである。

```sh
docker build --platform linux/amd64 -t tablecast-voice:local -f livekit/Dockerfile livekit
docker run --rm --network none tablecast-voice:local --help
docker run --rm --network none --entrypoint python tablecast-voice:local -c 'import os; from livekit.plugins import silero; import tablecast_livekit.agent; assert os.getuid() != 0; silero.VAD.load()'
```

起動とhealthは、既存の開発環境と分離したローカルLiveKitへ接続して確認する。専用の環境ファイルを権限 `0600` で用意し、このLiveKitの `LIVEKIT_URL`・`LIVEKIT_API_KEY`・`LIVEKIT_API_SECRET` だけを `docker run --env-file` で渡す。Room jobをdispatchしなければ、待受登録とhealthの検査は外部AIを呼ばない。既定health portは `8081` で、コンテナ内の `http://127.0.0.1:8081/` を確認する。外部へhealth portを公開する必要はない。

公開時は同じイメージへ上表の対象環境の資格を実行時に渡し、`TABLECAST_API_URL` を公開WebのHTTPS originへ設定する。イメージ内に資格を焼き込まない。実際の配備・Room dispatch・STT/TTS・実iPadでの受入と、ここにある資格不要のイメージ検査は別に記録する。

## ローカルAgentの起動

repoルートでWeb/LiveKit Serverを起動後、別ターミナルから直接uvを実行する。

```sh
uv run --project livekit tablecast-voice download-files
uv run --project livekit --env-file .env.local --env-file .local/.env.voice tablecast-voice dev
```

envの読み込みはuvが行う。`.local/.env.voice` は接続先とworktree専用鍵だけを持つ。`.env.example` の `OPENAI_API_KEY=${TABLECAST_MODEL_API_KEY}` は同じファイル内でuvが展開するため、Bunで資格をコピーしない。停止はCtrl+C。型検査・lint・testも `uv run --project livekit ty check livekit/src livekit/tests`、`uv run --project livekit ruff check livekit`、`uv run --project livekit pytest livekit/tests` で直接実行できる。
