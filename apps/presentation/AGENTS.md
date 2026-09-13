# 動画基盤の作業範囲

Issue #1の再生成可能なデモ動画基盤を扱う。親のAGENTS.mdと最新のユーザー指示に従う。

- セッション再開時は [HANDOFF.md](HANDOFF.md) と [GENERATION.md](GENERATION.md) を最初に読む。生成ルートの正本はGENERATION.md、現行操作は [WORKFLOW.md](WORKFLOW.md)、技術・スキルの採用詳細は [TOOLS.md](TOOLS.md)。
- 現行の共有作例はmain追従の商品紹介v14・技術紹介v17。台本は`projects/tablecast-main-rerecord.json`、MP4と新規checkoutの手順は[共有と復元](SHARING.md)。`sample.json`と以前のv13・v16は回帰用に保持する。別々の全編として扱い、工程の検査をIssue #1全体の完了と読み替えない。
- `PLAN.md` の初期計画、生成画像の素材メモ、v5/v6の端末構図を現在の採用決定として扱わない。`frame.md` のレビュー状態を確認する。
- 描画はHyperFrames＋GSAP＋CSS、実録編集はOpenScreen。スキルを読むことを、依存追加・ワークフロー初期化・別フレームワークへの移行の理由にしない。
- 配置・再生成の技術検証とデザインの採否は分ける。見た目はユーザーが評価し、検査通過を承認の代わりにしない。
- アプリ変更に伴う制作はWORKFLOW.md冒頭から進め、BRIEF-TEMPLATE.mdを題材ごとに埋める。通常の生成は`bun run video --project ... --film ... --name ...`（MP4までなら`--render`）。使用済みrun名を再利用しない。アプリの操作と状態待ちは撮影スクリプト側へ置き、共通の実測処理へ業務状態を追加しない。
