# Inworldの話者・単語時刻パッチ

このパッチはローカルforkで作成し、隔離環境でfixture検証したもの。アプリの依存にはまだ適用していない。
`livekit/uv.lock` は公式 `livekit-agents` / `livekit-plugins-inworld` 1.8.0を使用するため、通常起動ではSTT話者ラベルを取得しない。

| 項目             | 記録                                                           |
| ---------------- | -------------------------------------------------------------- |
| 上流             | https://github.com/livekit/agents                              |
| base SHA         | `d8607e6711bf9770bfd7e5476f79ab63e6a451a6`                     |
| ローカルfork SHA | `2f36303643f00c9c521d9dc27a785a6f273bbfb1`                     |
| 対応core         | `livekit-agents==1.8.0`                                        |
| 差分             | `0001-speaker-word-timestamps.patch`、`git format-patch`で生成 |
| commitの保存     | `tablecast-inworld.bundle`、上記baseを前提とする増分bundle     |
| 公開fork / PR    | 未作成・未送信                                                 |
| fixture          | 13件成功。外部APIは使用していない                              |
| 実音声 / RMS結合 | 未実施                                                         |

2026-09-06に公式releaseと同じ上流SHAで確認したSTTには、話者と単語時刻の公開optionがなかった。
[Inworld公式の話者仕様](https://docs.inworld.ai/stt/speaker-diarization)に基づき、`enableSpeakerDiarization` / `includeWordTimestamps` をopt-inで追加する。
既定要求と単一候補の原文は保持し、`SpeechData.words` の `TimedString` へmsから秒に変換した時刻と接続内話者番号を渡す。
話者ゼロを欠損と区別し、不正時刻は未知のまま保持する。再接続後の番号を以前と同一人物として扱わない。
複数話者や未帰属語が混ざる場合、発話全体の `speaker_id` は `None` とする。MultiSpeakerAdapterで誤った一人のRMSへ集約しない。

検証は、日本語・英語、既定無効時の互換性、話者ゼロ、欠損と不正時刻、交互話者、再接続、暫定再送、空final、取消時の終了を対象とした。
実際のInworldの話者精度、接続再開時の時刻基準とMultiSpeakerAdapterのRMS、重複音声は未検証であり、能力フラグだけで合格としていない。

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
公開forkへ送信後、uv sourceをその公開URL、plugin subdirectory、完全SHAへ固定してlockを更新する。同じpatchを二重適用しない。
現段階でlocal file URLやpath依存をlockへ入れて可搬性とSHA固定の契約を弱めない。
公式releaseに対応が取り込まれ、同じfixtureと実音声の回帰試験を通過したら、このfork依存とpatchを削除する。
