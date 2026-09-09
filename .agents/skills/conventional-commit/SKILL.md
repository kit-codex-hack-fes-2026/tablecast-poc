---
name: conventional-commit
description: コミット、変更のコミット分割、メッセージ作成、commitlintエラー修正で使う。Conventional CommitsとGitmoji一つ、英語の件名・本文を必須とし、Agent Skillsの変更種別も判断する。
---

# Conventional Commits + Gitmoji

## メッセージ

```text
<type>[(scope)][!]: <gitmoji> <subject> [(#issue)]

<英語の本文（必須）>

<必要なトレーラー>
```

- コロンと空白の直後にGitmojiを一つだけ置く。
- 件名は英語の命令形で小文字から始め、末尾にピリオドを付けない。リポジトリ規約を優先し、ヘッダーは72文字以内を目安にする。
- `wip`以外は英語の本文を必須とする。小さな変更なら一文でよい。問題と変更後の動作をつながった文章で説明し、依頼がなければ `Context:` / `Changes:` / `Impact:` などの見出しは付けない。
- 識別子・パスには必要に応じてバッククォートを使い、件名・本文・トレーラーを空行で分ける。
- このリポジトリでは、検査対象のコミットに関連を確認したIssue番号を必須とする。件名末尾の `(#123)` を基本とし、本文・footerの `Refs #123` 等でもよい。`Fixes` / `Closes` はそのIssueを閉じる意図がある場合だけ使う。
- 破壊的変更には `!` と、移行方法を説明する `BREAKING CHANGE:` トレーラーを付ける。

## 種別とスコープ

| 種別     | 標準のGitmoji | 用途                     |
| -------- | ------------- | ------------------------ |
| feat     | ✨            | 新機能                   |
| fix      | 🐛            | 不正な動作・回帰の修正   |
| docs     | 📝            | 文書                     |
| style    | 🎨            | 動作を変えない整形       |
| refactor | ♻️            | 動作を保つ内部構造の変更 |
| perf     | ⚡            | 性能改善                 |
| test     | ✅            | テスト                   |
| build    | 📦            | ビルドツール・依存関係   |
| ci       | 👷            | CIワークフロー           |
| chore    | 🔧            | 保守                     |
| revert   | ⏪️            | 変更の取り消し           |

セキュリティ修正の🔒、依存更新の⬆️など、より適切なGitmojiを選んでもよいが、一つに限る。

スコープはリポジトリのpackage名・領域名を使う。意味のある所有領域がなければ省略し、`repo` / `global` を作らない。独立した関心事はレビューや取り消しが容易になる場合に分割し、一貫した変更はまとめる。

Agent Skillsでは、新規スキル・指示の拡充は `feat`、誤った指示の修正は `fix`、READMEのみや意味を変えない文章整理は `docs` とする。拡張子ではなくスキルの振る舞いで判断する。

## コミット手順

1. `git status`、ステージ済みと関連する未ステージ差分、コミット規約、直近のメッセージを読む。関連Issueがあれば内容を確認する。
2. 依頼が他のファイルを含まない限りステージ済み変更を対象とする。無関係な作業を保ち、パス・hunkを指定してステージする。
3. 複数コミットではメッセージ案とファイルの分け方を先に示す。コミット依頼は実行の許可として扱い、メッセージ作成のみ・dry-runの依頼では実行しない。
4. メッセージをファイルへ書き、`git commit -F` で文字列を保つ。必要な検証とhookを実行し、作成したコミットとworking treeを確認する。pushは依頼された場合だけ行う。

## ツール設定

commitlint設定を変更する前に既存設定を読む。[Node用設定](assets/commitlint.config.ts) と [commitlint-rs用設定](assets/.commitlintrc.yaml) は、設定作業が依頼範囲にある場合だけ使う。Rustの例はemoji検査の近似であり、`wip`の例外処理やスキル案内はhook側で扱う。

Changesetsを使うリポジトリでは、公開packageの変更について既存のリリース方針に従う。リリースノートとコミットメッセージはそれぞれの目的に合わせて書く。

```text
fix(web/auth): 🐛 normalize expired sessions (#513)

Expired sessions returned inconsistent errors and skipped re-authentication.
Return the existing unauthorized response through the shared session check.

Fixes #513
```
