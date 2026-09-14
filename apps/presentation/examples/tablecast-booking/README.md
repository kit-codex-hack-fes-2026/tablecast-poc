# 別題材のワークフロー検証用入力

BookFlowは予約管理を題材にした**模式台本**。実在する第二アプリの実録や性能の証拠ではない。既存のTableCastとは異なるfilm・scene ID・ブランドで、同じ生成・検査の入口を通すための最小作例である。音声は生成しない。

`apps/presentation` で実行する。`--name` は毎回未使用名にする。

```powershell
bun run video --project examples/tablecast-booking/project.json --film demo --name tablecast-booking-v1 --render
```

`output/tablecast-booking-v1/video.mp4`、`player.html`、`report.json`、完成MP4から抽出した`frames/`ができる。`capture-plan.json` は図だけの作例なので空。実アプリを撮影する場合は、[WORKFLOW.md](../../WORKFLOW.md)の順序で題材の操作・状態待ち・撮影定義を追加する。

`scripts/tablecast-workflow.spec.ts` は別途、テスト用DOMの予約成立条件とUI移動後の再実測を確認する。これはOpenScreenによる第二アプリの録画試験とは区別する。
