---
name: github-issue-pr-ops
description: GitHub Issueの分割・起票・ラベル・担当・親子関係・依存関係と、通常PR・stacked PRの作成からマージまでを扱う。Issueの着手・停止・再開・引き継ぎ・完了とコメント運用、Issue FormsやPRテンプレートの整備、本文・コメントへの画像・動画・ファイル添付と圧縮にも使う。Projects固有の設定はgithub-project-opsを使う。
---

# IssueとPRの運用

Issueに目的と受け入れ条件、PRに実装した振る舞いと確認結果を残す。本文は利用者の言語に合わせ、日本語では常体で書く。タイトルは変更内容が伝わる自然な言葉にする。

## 作業単位と分類

- 実装Issueは原則 `1 Issue = 1 branch = 1 PR`。テストや文書も、その変更を完成させるものなら同じIssueへ含める。
- 大きな成果は `epic` とsub-issueに分ける。epicは原則branchを持たず、子Issueと成果の完了条件を満たして閉じる。
- Issueには主目的に応じて `feat`（機能追加）、`fix`（不具合修正）、`docs`（文書）、`epic`（大項目）などのラベルを付ける。調査や内部改善は既存の適切な分類を使う。
- 必要なラベルがなければ作成する。Projectsや組織Issue Typeと分類が重複してもよい。
- 親子関係は成果の階層、blocked byは前段の完了まで着手できない依存、Stackのbaseは差分の順序として分ける。ファイルの重複やStackの隣接だけでblocked byを付けない。
- スコープには成果と変更範囲を書く。実行体制の取り決めを製品の受け入れ条件や非スコープへ混ぜない。

## 担当と着手

Issueの排他制御はAssigneeだけで行う。着手・再開前に最新のAssigneeを読み、未割当なら自分を割り当てて再取得する。別の担当がいる場合は、依頼で引き継ぎが明示されていなければ着手せず確認する。

linked branchと既存PRは、作業内容を引き継ぎ、重複作成を避けるために読む。担当判定の追加ロックにはしない。引き継ぎが確定したらAssigneeを更新し、未完了事項と再開に必要な情報だけコメントに残す。

## ライフサイクルとコメント

現在の契約はIssue本文、担当と関係はGitHubメタデータ、実装と検証はPRに置く。Issueコメントにはトリアージの判断、前提変更、阻害要因、再開条件、引き継ぎ、中断、完了・中止の根拠を残す。通常のCI・レビュー待ちのたびに同じ報告を増やさない。

着手から完了・中止・再オープンまでの判断と記入例は [ライフサイクルとコメント](references/lifecycle-comments.md) に従う。

## 道具

読取や通常の変更は利用可能なGitHub MCP、`gh issue`、`gh pr`を使う。フォーム入力、添付、画面設定などはComputer Use / Codex Browserで行ってよい。利用するブラウザのスキルに従う。

標準UIやCLIで済む作業に専用の自動化スクリプトを作らない。APIが必要な場合は、その時点の公式仕様と対象環境のヘルプを確認する。本文をCLIから送る場合は `--body-file` を使う。

## 進め方

1. 対象リポジトリ、既存Issue・PR、関連する仕様と差分を確認する。
2. 目的、受け入れ条件、確認方法、意思決定の理由と最小実装・テスト戦略への適合方針をIssueへ書き、ラベルと必要な関係を設定する。
3. Assigneeを確認し、既存branch・PRを再利用するか、新しいbranchを作る。命名は環境・リポジトリの規約に従う。
4. 実装と確認結果、採用した方法・テストレイヤーの理由をPRへまとめ、Issueの方針から変わった判断も説明する。対応する実装Issueを `Closes #123` などで閉じ、参照だけのIssueやepicは閉じない。
5. UIまたはエンドユーザーへの振る舞いが変わる場合は、実動作を示す画像か動画を、PRの関連説明中へキャプション付きで必ず埋め込む。専用見出しや装飾編集は不要で、撮ったままでよい。Codex Browser、Playwright、OpenScreenなどで撮影し、必要に応じて圧縮する。詳細は [PRとマージ](references/pr-and-merge.md) を読む。
6. 最新headのレビュー・必須チェック・マージ条件を確認し、許可された範囲でDraft解除やマージを行う。
7. 書き込み後の本文、関係、PR・Issue状態を確認する。途中失敗では作成済み番号を確認して重複作成を避ける。

## 必要な場合に読む資料

- [ライフサイクル・停止と再開・引き継ぎ・コメント](references/lifecycle-comments.md)
- [Issue本文とForms](references/issue-authoring.md)
- [親子関係・依存・Milestone](references/relations-and-milestones.md)
- [PR本文・画像や動画・マージ](references/pr-and-merge.md)
- [画像・動画・ファイルの添付](references/attachments.md)
- [stacked PR](references/stacked-prs.md)
