# 引継ぎZIPの検証記録

[索引](README.md)

検査日: 2026-09-06。以下はこの文書・設定一式の梱包検査であり、TableCast本体の試験結果ではない。

## 実施済み

| 検査 | 結果 |
|---|---|
| 納品範囲 | 23ファイル。AGENTS.md、docs、4つのskill、ignore設定のみ |
| Markdown | 21件のUTF-8、改行、コードフェンスを検査 |
| 相対リンク | 94件の参照先と指定anchorの存在を検査 |
| skill | 4件のYAML frontmatter、名前、description、配置を検査 |
| .gitignore | Git check-ignoreで43ケースを検査 |
| .worktreeinclude | 開発モデル資格用の1ファイルだけを列挙していることを検査 |
| ZIP | 余分な親フォルダーなし、隠しファイル含有、CRC、全ファイルの内容一致を検査 |
| 不要物 | アプリコード、秘密情報の実値、DB、生成物、実行環境パスを含めない |

ignore検査では秘密情報・state・仮想環境を除外し、bun.lock、uv.lock、migration、fixture、patch、snapshot、skillsを除外しないことを確認した。
外部参照URLは出典として記録している。梱包検査は外部URLの永続的な到達性や将来のAPI互換性を保証しない。

## 未実施

Bun/uv依存の解決、Oxlint/Oxfmt実行、型検査、アプリのVitest・pytest・Storybook・E2E、D1へのseed投入、公式pluginへのpatch適用、上流PR、実音声試験、デプロイは未実施。
このZIPにその実装・依存設定・DBは含まれていないため、既存版のテスト成功を本版の検証として引き継いでいない。
人間らしい声、正しい転写の発音、複数話者精度、エコー除去、音声停止後の送音停止は、実装後に別途確認する。

## 利用開始

既存リポジトリへは差分マージして配置する。rootの [AGENTS.md](../AGENTS.md) と [着手順](implementation.md) をCodexに読ませる。
記載したBun scriptとディレクトリは実装契約であり、本一式を置いただけでは起動コマンドは存在しない。
