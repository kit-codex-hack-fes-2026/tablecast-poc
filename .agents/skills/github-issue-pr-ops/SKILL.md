---
name: github-issue-pr-ops
description: GitHub Issue・PRの分割・作成・更新・レビュー対応・引き継ぎ・マージに使う。Issue Forms、PRテンプレート、stacked PR、Issue／PR本文・トップレベルコメントへの画像・動画添付も扱う。Projects固有の設定はgithub-project-opsを使う。
compatibility: 画像・動画の添付には認証済みのgh 2.99.0以上と対象リポジトリへの書き込み権限が必要。実行時に対象コマンドの--helpで--attachへの対応を確認する。
---

# IssueとPRの運用

Issueに現在の目的・受入条件、PRに実装差分・検証、メタデータに担当・関係を置く。本文は利用者の言語に合わせ、日本語では常体で書く。タイトルは内容が分かる自然な言葉にする。

PRタイトルにはConventional Commits形式やGitmojiの接頭辞を付けない。コミット規約をPRタイトルへ適用しない。

## 作業に応じた入口

| 作業                                 | 使うもの                                                                                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issueの起票・契約変更                | [Issue本文](references/issue-authoring.md)                                                                                                                  |
| PRの作成・本文更新                   | [PR本文・検証・マージ](references/pr-and-merge.md)。利用先のテンプレートを確認し、なければ[同梱テンプレート](assets/.github/pull_request_template.md)を使う |
| レビュー指摘への対応                 | [レビュー対応](references/pr-and-merge.md#レビュー対応)                                                                                                     |
| 担当の引き継ぎ・中断・阻害・完了判定 | [ライフサイクル](references/lifecycle-comments.md)                                                                                                          |
| epic・親子関係・実依存・Milestone    | [関係の設定](references/relations-and-milestones.md)                                                                                                        |
| 依存するPR                           | [Stack](references/stacked-prs.md)                                                                                                                          |
| 画像・動画の添付                     | [添付手順](references/attachments.md)。圧縮が必要な場合だけ[圧縮](references/compression.md)                                                                |
| Projectsへの登録・更新               | 利用する場合は[github-project-ops](../github-project-ops/SKILL.md)                                                                                          |

## 担当と作業単位

- 着手・再開時にIssueのAssigneeと既存branch・PRを取得する。未割当なら自分を割り当てて再確認する。他の担当者がいる場合は明示された引き継ぎに従う。排他制御はAssigneeだけで行い、branch・コメント・Projectsを追加ロックにしない。
- 原則 `1 実装Issue = 1 branch = 1 PR`。成果と確認方法で分割し、その成果に必要なテスト・文書は同じIssueに含める。大きな成果はepicとsub-issue、作業を阻害する実依存はGitHubのblocked by／blocking、統合順序はStackで表す。ファイルの重複やStackの隣接だけでblocked byを付けない。
- IssueとPRには主目的に合う既存ラベルを使い、分類の追加は対象の運用に合わせる。Projectsを利用する場合だけ、対応Issueを対象Projectへ追加し、Priorityと実態に合うStatusを設定する。同じ作業のPR項目を重複作成しない。
- branchの命名と統合先は対象リポジトリの規約・既存PRを確認する。指定がなければ既定ブランチを基準にする。実行体制の取り決めを製品の受け入れ条件や非スコープへ混ぜない。

## 成果物と完了

PR作成・更新ではテンプレートの変更内容、採用理由、検証と未実施範囲、関連Issueを実際の差分から埋める。読んだ資料や途中の試行を列挙するだけで、判断や最終状態の説明を代替しない。証拠の形式は[PRの証拠要件](references/pr-and-merge.md#確認と証拠)で選ぶ。

新規PRはDraft。対応する実装Issueだけを `Closes #123` 等で結び、epicや参照Issueを一括で閉じない。Draft解除・マージはユーザーが許可した範囲で行う。

`gh issue`・`gh pr`等の標準CLIや接続済みのGitHubツールを使う。本文テキストを渡す場合は `--body-file` を使う。書込後は本文・担当・ラベル・関係・base/headと、利用する場合はProject値を再取得して確認する。途中失敗では既に作成された番号を確認し、重複起票しない。

最新headのチェック・レビュー・マージ可否を確認し、未実行・待機中・過去の別commitでの成功を区別する。検証結果はPRへ集約し、通常のCI待ちごとにIssueへ同じ報告を追加しない。利用できるpreviewは[プレビューの記載手順](references/pr-and-merge.md#プレビューのリンク)に従ってPR本文へ載せる。
