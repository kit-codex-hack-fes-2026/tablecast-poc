# Inworldの話者・単語時刻パッチ

公式pluginの最小パッチを公開forkへ配置し、2026-09-07にアプリの依存へ適用した。
`livekit/uv.lock` はcore 1.8.0を公式releaseのまま保持し、Inworld pluginだけを下記forkの完全SHAへ固定する。通常起動で話者ダイアライゼーションと単語時刻を有効にする。

| 項目             | 記録                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| 上流             | https://github.com/livekit/agents                                                              |
| base SHA         | `d8607e6711bf9770bfd7e5476f79ab63e6a451a6`                                                     |
| fork SHA         | `2f36303643f00c9c521d9dc27a785a6f273bbfb1`                                                     |
| 対応core         | `livekit-agents==1.8.0`                                                                        |
| 差分             | `0001-speaker-word-timestamps.patch`、`git format-patch`で生成                                 |
| commitの保存     | `tablecast-inworld.bundle`、上記baseを前提とする増分bundle                                     |
| 公開fork         | https://github.com/ReoHakase/tablecast-livekit-agents/tree/codex/tablecast-inworld-diarization |
| 上流PR           | 未送信                                                                                         |
| fixture          | 13件成功。外部APIは使用していない                                                              |
| 実音声           | 日英の合成音声から話者0と単語時刻を取得。実RoomでもAPI・端末への伝達を確認                     |
| 実店舗 / RMS結合 | 実マイク・複数話者・再接続時のRMS精度は未評価                                                  |

2026-09-06に公式releaseと同じ上流SHAで確認したSTTには、話者と単語時刻の公開optionがなかった。
[Inworld公式の話者仕様](https://docs.inworld.ai/stt/speaker-diarization)に基づき、`enableSpeakerDiarization` / `includeWordTimestamps` をopt-inで追加する。
既定要求と単一候補の原文は保持し、`SpeechData.words` の `TimedString` へmsから秒に変換した時刻と接続内話者番号を渡す。
話者ゼロを欠損と区別し、不正時刻は未知のまま保持する。再接続後の番号を以前と同一人物として扱わない。
複数話者や未帰属語が混ざる場合、pluginの発話全体の `speaker_id` は `None` とする。MultiSpeakerAdapterで誤った一人のRMSへ集約しない。TableCastの会話表示・APIでは、公開された単語ラベルの多数決で代表話者を選ぶ。同数・全語未識別は未設定のまま会話を続ける。

検証は、日本語・英語、既定無効時の互換性、話者ゼロ、欠損と不正時刻、交互話者、再接続、暫定再送、空final、取消時の終了を対象とした。
短いお礼の実音声では単語時刻が届いても話者が欠損するケースを確認した。画面は未識別とし、前の話者で埋めない。実際の複数話者の精度、接続再開時の時刻基準とMultiSpeakerAdapterのRMS、重複音声は未検証であり、能力フラグだけで合格としていない。

再現は、上流baseをcheckoutして `git am` で差分を適用し、pluginだけを隔離したuv環境へ正規インストールして行う。上流のsparse checkoutでは `--no-sources` で省略されたworkspace依存を参照しない。

```sh
uv run --no-project --no-sources --python 3.13 \
  --with ./livekit-plugins/livekit-plugins-inworld \
  --with pytest --with pytest-asyncio \
  pytest -c /dev/null -o cache_dir=/tmp/tablecast-patch-pytest-cache \
  -o asyncio_mode=auto \
  livekit-plugins/livekit-plugins-inworld/tests/test_diarization.py
```

正確なcommitは上流cloneでbundleをfetchすると復元できる。bundleの整合性は `git bundle verify` で検証済み。
uv sourceは公開URL・plugin subdirectory・完全SHAへ固定済み。同じpatchを二重適用しない。
上流のworkspace sourceがcoreまでローカルpath依存へ変えないよう、アプリの `tool.uv.no-sources-package = ["livekit-agents"]` を指定する。uv標準の依存解決設定を使い、lockへ開発機の絶対pathを保存しない。配備用imageのbuild段階だけGitを導入し、非rootの実行段階へ持ち込まない。
公式releaseに対応が取り込まれ、同じfixtureと実音声の回帰試験を通過したら、このfork依存とpatchを削除する。
