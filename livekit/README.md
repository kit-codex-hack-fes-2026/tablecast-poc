# TableCast音声Agent

公式LiveKit 1.8.0とInworld STT/TTSを使用し、接客と注文操作をHono/Mastraへ委譲するPython Agent。
通常のチェックは外部AIを呼ばない。実Inworld、iPadのエコー・停止、日英の自然さは未検証。
STT話者対応は [隔離検証済みパッチ](../patches/livekit-inworld/README.md) の公開forkとSHA固定待ちであり、現在の通常起動には未適用。

ルートの `bun run dev` がworktree専用のLiveKitとAPIを起動する。既存 `.env.local` を自動使用しない。
外部設定を追加する場合はルート `.env.secrets.local` の `INWORLD_API_KEY` と試聴した標準voice IDを設定し、店舗設定の `cast.voice.ja/en` も公開する。
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

`llm_node` はhttpxのUTF-8デコーダーを通して読み上げ本文をstreamする。エラーや取消で接続を閉じ、業務操作を自動再試行しない。
`transcription_node` は生成文の英語演技指示とbreakだけを除去する。客の原文は加工しない。
注文確認は同じAPIスナップショットを `session.say` で一度読み、`SpeechHandle.wait_for_playout` の完了後だけ読み上げ完了を送る。
音声停止はRoom退出とAgentSessionの即時終了へ伝わり、DB側でもvoice sessionとturnを失効させる。カートや確定注文のロールバックは行わない。

`test:voice:live` は明示操作で実行する有料のSTT/TTS疎通試験。生成音声をメモリ内で再認識し、日英の確定認識と音声長を出力する。音声ファイルは保存しない。

```sh
TABLECAST_RUN_PAID_VOICE_TESTS=1 bun --no-env-file run test:voice:live
```

この試験は人手の自然さ評価、実マイク、LiveKit転送、iPadのAEC、騒音、複数話者の評価を代替しない。
今回の実装中にこの有料試験は実行していない。
