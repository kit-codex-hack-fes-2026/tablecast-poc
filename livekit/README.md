# TableCast LiveKit Agent

Python 3.13、uv、LiveKit Agents/OpenAI plugin 1.8.1を使う。公式 `GPTLiveModel` のclient delegationをHono/Mastraへ接続する。Inworld forkは実行時依存から外した。

[セットアップ](../docs/setup.md) / [接続と停止・注文確認](../docs/voice/integration.md)

```sh
uv sync --project livekit --locked
uv run --project livekit tablecast-voice download-files
uv run --project livekit --env-file .env.local --env-file .local/.env.voice tablecast-voice dev
```

外部設定は `.env.local` の `OPENAI_API_KEY` とGPT-Liveの利用資格が必要。既存のMastraには `TABLECAST_MODEL_API_KEY` と `TABLECAST_MODEL` を使う。Inworldキーは不要。生成される `.local/.env.voice` はLiveKit接続・内部API URL・サービストークンを持ち、資格をブラウザーへ渡さない。

通常会話はGPT-Liveが音声入出力を担当する。業務は既存Mastraへ委任し、SDKの字幕を雑談も含めて保存する。履歴と実際に聞いた部分の強い一致は要求しない。話者を推測せず、生音声を既定保存しない。停止ではRoom・モデル接続・委任を終了し、GUIと既存カート・注文を維持する。

```sh
cd livekit
uv run ruff check src tests
uv run ty check src tests
uv run pytest
```

次のコマンドは明示操作で実行する有料GPT-Live起動・日英発話字幕の試験。無音入力を送り、モデルに短い挨拶を求める。実マイク、Room、注文委任、音声品質は別試験である。

```sh
TABLECAST_RUN_PAID_VOICE_TESTS=1 uv run --project livekit --env-file .env.local tablecast-voice-check
```
