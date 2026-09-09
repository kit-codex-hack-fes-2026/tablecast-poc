---
name: github-project-ops
description: GitHub Projectsの導入・設定・運用・監査・解除を扱う。フィールド、必須のPriority、トリアージ、Status遷移、ビュー、工数と予定の更新に使う。Projectsの利用や導入が明示されたときに使い、Issue分割・本文・担当・PR運用はgithub-issue-pr-opsと併用する。
---

# GitHub Projects

Projectを優先順位、進捗、計画を見渡す管理面として使う。Issueの契約・担当とPRの実状態に基づいて更新し、Projectの表示だけで着手や完了を判断しない。

## 責務と正本

- Project本体、リポジトリとの紐付け、アイテム、フィールド、ビュー、進捗と予定を扱う。
- Issue本文、親子関係、依存、Milestone、Assignee、branch、PRはGitHub標準情報を参照する。それらも変更する依頼では `github-issue-pr-ops` を併用する。
- Issueの排他制御はAssigneeだけで行う。Projectへ担当判定や実行管理の仕組みを追加しない。
- Issueに `feat` / `docs` / `fix` / `epic` などのラベルを付ける。ProjectのTypeや組織Issue Typeとの二重管理は許容する。
- 既存の組織Issue Fieldを使う場合は名前だけでなく意味・型・選択肢・公開範囲を確認する。項目ごとに保存先を決め、同名異義の値を上書きしない。

## 道具

**初期設定、フィールド、ビューの編集はComputer Use / Codex Browserを優先する。** 既存テンプレートと標準画面を使い、画面で済む設定のために長いPythonやGraphQLスクリプトを生成・保守しない。利用するブラウザのスキルに従う。

大量の項目追加や構造化された読取は、簡潔に扱えるGitHub MCPや `gh project` を使ってよい。APIが必要な場合だけ、実行時の公式仕様を確認する。

## 初期設定と更新

1. Project所有者、番号・URL、対象リポジトリ、公開範囲、既存フィールド・ビュー・項目を確認する。同名Projectを重複作成しない。
2. 既存テンプレートかTable / Board / Roadmapから設定する。[フィールドとビュー](references/project-setup.md) に従い、StatusとPriorityを含む分類・表示を整える。
3. 対象Issueを番号・URLで追加する。PRを同じ作業の別項目として重複管理せず、関連PRの列から参照する。
4. [トリアージ](references/triage.md) に従ってPriorityなどを評価する。**管理対象の全Issue・epicにPriorityを設定する。Priorityを任意項目にしない。** 未判断の項目は未トリアージとして明示し、優先順の確定前に評価する。
5. [進捗と再計画](references/project-execution.md) に従ってStatusと予定を更新する。工数と予定日が未定でも、それだけで着手を止めない。
6. 保存後に対象Issue、項目値、選択肢、ビューの絞り込み・並び順・保存状態を確認する。一括操作では対象全件を照合し、取得上限や未取得ページを全件確認済みと扱わない。

途中失敗では反映済みの項目を再取得し、未完了部分から続ける。復旧のためにProjectやIssueを自動削除しない。確認できない権限や公開範囲を推測して書き込まない。

## 監査と解除

監査ではPriorityの欠落、StatusとIssue/PRの不一致、分類の意味・保存先の衝突、重複項目、ビューから漏れるIssue、古い予定を確認する。対象と根拠、修正案を示し、監査のみの依頼では変更しない。

運用停止ではProjectのクローズ、一部を隠すならアイテムのアーカイブ、入口を外すならリポジトリとの紐付け解除を使う。これらと削除を区別する。

削除が依頼された場合は、失われる項目値・フィールド・ビューとProject内だけの下書きIssueを事前に書き出す。特に下書きの題名・本文を保全し、復元できないIDや設定があれば説明する。Projectの解除・削除にIssue、PR、Milestone、関係、Issue Forms、CIの削除を含めない。操作後に対象と残存データを確認する。

## 参照先

- [フィールド・保存先・標準ビュー](references/project-setup.md)
- [Priority・Size・Complexity・Riskと再トリアージ](references/triage.md)
- [Status遷移・epic集約・進捗と再計画](references/project-execution.md)
