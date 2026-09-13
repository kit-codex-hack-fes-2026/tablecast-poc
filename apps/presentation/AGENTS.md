# 動画基盤の作業範囲

Issue #1の再生成可能なデモ動画基盤を扱う。親のAGENTS.mdと最新のユーザー指示に従う。

- セッション再開時は [HANDOFF.md](HANDOFF.md) と [GENERATION.md](GENERATION.md) を最初に読む。生成ルートの正本はGENERATION.md、現行操作は [WORKFLOW.md](WORKFLOW.md)、技術・スキルの採用詳細は [TOOLS.md](TOOLS.md)。
- 現行の共有作例はmain追従の商品紹介v14・技術紹介v17。台本は`projects/tablecast-main-rerecord.json`、MP4と新規checkoutの手順は[共有と復元](SHARING.md)。`sample.json`は構造テストのfixtureとして保持し、旧版の素材は共有しない。別々の全編として扱い、工程の検査をIssue #1全体の完了と読み替えない。
- `frame.md` のレビュー状態を確認する。過去の検証記録は実行当時の証拠であり、現行checkoutの素材一覧ではない。
- 描画はHyperFrames＋GSAP＋CSS、実録編集はOpenScreen。スキルを読むことを、依存追加・ワークフロー初期化・別フレームワークへの移行の理由にしない。
- 制作スキルは[TOOLS.mdの固定版](TOOLS.md#制作スキルの固定と復元)を使う。compositionの契約はCore、GSAPの動きはAnimation、新しい場面の設計はCreativeを必要時に参照する。GENERATION.md・既存台本・ユーザーの採否を優先し、スキルの一般的な推奨だけで保存済みの映像や依存の版を変更しない。
- 配置・再生成の技術検証とデザインの採否は分ける。見た目はユーザーが評価し、検査通過を承認の代わりにしない。
- アプリ変更に伴う制作はWORKFLOW.md冒頭から進め、BRIEF-TEMPLATE.mdを題材ごとに埋める。通常の生成は`bun run video --project ... --film ... --name ...`（MP4までなら`--render`）。使用済みrun名を再利用しない。アプリの操作と状態待ちは撮影スクリプト側へ置き、共通の実測処理へ業務状態を追加しない。
