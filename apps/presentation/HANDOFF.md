# 動画基盤の引き継ぎ

Issue #1の再生成可能な動画制作ワークフロー。現行作例はmain `7d6adc7` に追従した商品紹介v14・技術紹介v17。

- 制作原則：[GENERATION.md](GENERATION.md)
- アプリ変更時の手順：[WORKFLOW.md](WORKFLOW.md)
- 素材取得・完成動画・再生成：[SHARING.md](SHARING.md)
- 見た目の評価状態：[frame.md](frame.md)
- 発表原稿（#471）：[pitch.md](../../docs/presentation/pitch.md)。削減前の説明・会話全文・画像12参照を復元。店舗導入・Agent Plugin・運営改善・会員・UIの工夫を保持し、会話デモの採用優先度だけを[構成メモ](../../docs/presentation/strategy.md)で整理する。技術の元原稿は[別スライド](../../docs/presentation/technical.md)へ移動。5枚構成・固定秒数は撤回し、新規収録は未実施。[素材と根拠](assets/images/pitch/README.md)を参照する。
- アプリ変更試験の結果：[BRIEF.md](experiments/tablecast-mutation/BRIEF.md)
- Agent Pluginの実画面追加（#471、2026-10-31）：stagingのログイン・OAuth再接続・ツール更新を実施し、新しいChatGPT会話で合成履歴の28日比較と英語説明の下書き保存を実行。[発表原稿](../../docs/presentation/pitch.md)へ分析・改善案・下書き・変更確認の4画面を追加。下書きは公開版4を基にした版2、変更1項目、検証済み・未公開。既存の説明と画像12参照は保持。公開申請・公開・動画収録は未実施。詳細と再開先は[素材README](assets/images/pitch/README.md#agent-pluginの再接続と実会話)を参照。
- ChatGPTのMCP実演（#170、制作中）：[制作メモ](projects/tablecast-mcp-demo/BRIEF.md)と[撮影台本](projects/tablecast-mcp-demo/SCRIPT.md)。stagingへの接続と実MCP読取を確認済み。収録・公開・全編生成は未実施。

既定の台本は `projects/tablecast-main-rerecord.json`。動画生成は `bun run build:videos`、検査・MP4化まで記録する通常入口は `bun run video --project ... --film ... --name ... --render`。ルートのアプリbuildには動画生成を含めない。

共有する収録素材は現行作例の4テイクだけ。旧版の `sample.json` は構造テスト用fixture、UI変更試験は完成動画と当時の入力・検証記録を残す。旧録画・試作画像・個人PCの障害記録・初期計画は共有しない。

`records/` の検証結果とハッシュは実行時点の証拠として保持する。過去の素材一覧にある非共有ファイルやローカル出力は、現在のcheckoutに揃っているとは限らない。現在の共有対象はSHARING.mdを参照する。

配置・復号・再生等の技術検査と、ユーザーによる内容・デザインの評価を区別する。技術紹介の仕上げは一旦区切っており、今後の制作時に再評価する。

PRレビュー対応で技術図の強調残りと線の描画を修正した。現行コードの再生成結果は保存済みv17と強調表示が異なる。v17は比較用として保持し、修正後の見た目はまだユーザー未評価。次の制作時に採用版を判断する。
