# GitHubへの添付

画像・動画をIssueやPRの本文・トップレベルコメントへ添付するときに読む。添付が必要かは[PRの証拠要件](pr-and-merge.md#確認と証拠)で判断する。

## 準備

対象リポジトリとIssue／PR、本文・コメントのどちらへ添付するかを確認する。指定がなければ対象IssueまたはPRの本文へ添付する。ファイルを開き、内容、可読性、秘密情報の混入、サイズを確認する。大きければ[圧縮](compression.md)する。

GitHub CLI標準の`--attach`を使う。[対応開始はgh 2.99.0](https://github.blog/changelog/2026-09-01-github-cli-media-in-issues-pull-requests-and-comments/)で、対象リポジトリへの書き込み権限が必要である。実行前に`gh --version`と対象コマンドの`--help`を確認し、`--attach`がなければ更新が必要なことを伝えて添付を止める。

対応形式はPNG、JPEG、GIF、WebP、SVG、MP4、MOV、WebM。PDFやZIPなどの汎用ファイルは対象外とする。画像の代替テキストはパスの後ろへ`#説明`として付け、引数全体を引用する。動画には代替テキストを付けない。

## 標準CLIで添付

既存本文への追記だけの依頼なら、本文フラグを付けずに実行する。複数ファイルは`--attach`を繰り返す（1回につき最大50ファイル）。

```bash
gh pr edit PR_NUMBER --repo OWNER/REPO --attach './screenshot.png#修正後の画面'
gh pr edit PR_NUMBER --repo OWNER/REPO --attach ./before.png --attach ./after.png
```

通常は関連する説明の直後へ埋め込む。最新本文を基に既存の内容を保った`pr.md`を用意し、目的の位置へローカルパスの画像参照と短いキャプションを書く。

```markdown
![修正後の画面](./screenshot.png)

_保存操作後、一覧に新しい項目が表示される。_
```

```bash
gh pr edit PR_NUMBER --repo OWNER/REPO --body-file pr.md --attach ./screenshot.png
```

`gh`が画像参照を添付URLへ置き換え、本文に書いた代替テキストを保持する。参照のない添付は末尾へ追加される。`--body-file`内の相対パスは本文ファイルのディレクトリを先に探し、次に実行ディレクトリを探す。

Issue本文とトップレベルコメントも同じフラグを使う。Issue本文への添付は1回につき1件を対象にする。

```bash
gh issue edit ISSUE_NUMBER --repo OWNER/REPO --attach './screenshot.png#不具合の画面'
gh pr comment PR_NUMBER --repo OWNER/REPO --attach ./demo.mp4
gh issue comment ISSUE_NUMBER --repo OWNER/REPO --attach './screenshot.png#不具合の画面'
```

コメントへ説明を添える場合は`--body-file`を併用する。新規作成時は既存の`gh issue create`／`gh pr create`コマンドへ`--attach`を加える。

画像・動画だけの見出しや末尾の添付集は作らない。撮ったままの素材でよく、見栄えのためのcut・字幕・zoom・装飾は不要。キャプションは本文のテキストで添え、映像へ焼き込む必要はない。秘密情報の除去と必要な圧縮は行う。動画は生成された添付URLを独立した行に置き、直下に操作と確認結果を書く。

## 投稿の確認と再試行

実行後は本文または投稿したコメントを再取得し、添付URLの反映を確認する。一部の添付が成功した後に失敗すると、成功分は投稿され、終了コードは非ゼロになる。失敗や成否不明の場合も反映状態を確認し、取得済みURLを保って未反映のファイルだけを再試行する。コメントが投稿済みなら対象コメントを更新し、新規投稿を繰り返さない。仕様の詳細は[gh pr edit](https://cli.github.com/manual/gh_pr_edit)と対象コマンドの`--help`を参照する。

投稿後のページを開き直し、画像の表示や動画の再生を確認して対象のリンクを報告する。ローカル保存だけをGitHubへの添付完了と扱わない。ログイン・権限不足で進めない場合は必要なユーザー操作を伝える。認証情報やCookieを抽出せず、内部アップロードAPIを再実装しない。
