# 動画基盤の引き継ぎ

Issue #1の再生成可能な動画制作ワークフロー。現行作例はmain `7d6adc7` に追従した商品紹介v14・技術紹介v17。

- 制作原則：[GENERATION.md](GENERATION.md)
- アプリ変更時の手順：[WORKFLOW.md](WORKFLOW.md)
- 素材取得・完成動画・再生成：[SHARING.md](SHARING.md)
- 見た目の評価状態：[frame.md](frame.md)
- アプリ変更試験の結果：[BRIEF.md](experiments/tablecast-mutation/BRIEF.md)

既定の台本は `projects/tablecast-main-rerecord.json`。動画生成は `bun run build:videos`、検査・MP4化まで記録する通常入口は `bun run video --project ... --film ... --name ... --render`。ルートのアプリbuildには動画生成を含めない。

共有する収録素材は現行作例の4テイクだけ。旧版の `sample.json` は構造テスト用fixture、UI変更試験は完成動画と当時の入力・検証記録を残す。旧録画・試作画像・個人PCの障害記録・初期計画は共有しない。

`records/` の検証結果とハッシュは実行時点の証拠として保持する。過去の素材一覧にある非共有ファイルやローカル出力は、現在のcheckoutに揃っているとは限らない。現在の共有対象はSHARING.mdを参照する。

配置・復号・再生等の技術検査と、ユーザーによる内容・デザインの評価を区別する。技術紹介の仕上げは一旦区切っており、今後の制作時に再評価する。
