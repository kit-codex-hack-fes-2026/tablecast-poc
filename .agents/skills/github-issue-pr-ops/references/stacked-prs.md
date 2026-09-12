# stacked PR

直列の変更を各段でレビューできるときに使う。独立した変更は通常PRへ分ける。各段は原則 `1 Issue = 1 branch = 1 PR` とし、その段のIssueだけを閉じる。

成果の親子関係はsub-issue、担当はAssignee、Stackの順序とbaseはGitHub上のStackメタデータで管理する。上段を下段のマージ前に実装できるなら、隣接関係をblocked byにしない。

## 作成と同期

現在の [公式CLI資料](https://docs.github.com/en/pull-requests/reference/stacked-prs-cli-commands) と、使用する `gh stack COMMAND --help` を確認する。利用できる操作やオプションを古い例から推測しない。

- 既存branchを採用する場合は `init`、段の追加は `add`、提出は `submit`、既存PRの関連付けは `link` の用途を確認する。
- 最下段のbaseは対象の統合先branch、各上段のbaseは直下のhead branchにする。
- `gh stack` がbranchを切り替える操作では、対象branchが別worktreeでcheckoutされていないか確認する。既存の作業場所を強制解除しない。
- 提出後は各PRの本文と対応Issueを整え、段ごとの責務・前提・確認結果を記載する。添付が必要かは[PRの証拠要件](pr-and-merge.md#確認と証拠)で判断する。
- 下段変更後は上段をrebaseし、影響する確認を実行してpushする。remoteのhead SHA、base、順序、レビュー、CIを再取得する。

`.git/gh-stack` はローカル操作用の状態である。ローカルとGitHubに構成差がある場合は、未送信の変更を保全して差を確認し、依頼された構成へ合わせる。`sync` 等の終了コードだけで同期完了を判断しない。

## 構成変更と失敗

分割・並べ替え・除外では変更前後のPRとbaseを確認し、[構成変更のコメント](lifecycle-comments.md#stack構成変更) に理由と影響を残す。`link` で既存PRを省けば除外できる、といった未確認の挙動を仮定しない。標準CLIの対話操作やGitHub画面で対応できる場合はそれを使う。

submit・push・linkが途中で失敗したら、remote branchとPR、Stackを再取得して反映済み分を確かめる。再実行でPRを重複作成したり、復旧のためにbranchやPRを削除したりしない。

## マージ

[公式のStackマージ手順](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/merging-stacked-pull-requests) に従い、最下段から条件を満たす連続範囲を `gh stack merge` で処理する。Stackを通常PRとして個別に自動マージする手順と混ぜない。

対象範囲の最新head、必須チェック、レビュー、base、保護要件を確認する。上段だけの未完了は下段の部分マージを妨げないが、上段の失敗が下段の契約違反を示す場合は修正する。失敗の帰属が不明ならログと差分を調べてから判断する。

マージ後は各PRとIssue、残る上段のbase・head・チェックを取り直す。キューへの投入や一部のマージ成功をStack全体の完了としない。
