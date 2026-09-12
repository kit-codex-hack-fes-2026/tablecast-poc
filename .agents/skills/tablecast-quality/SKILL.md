---
name: tablecast-quality
description: TableCastの静的検査・hooks・開発script・repo skillsとagent設定の導線を整備する。
---

# TableCast品質設定

検査・hooksは[静的解析](../../../docs/static-analysis.md)、テストの分担は[テスト戦略](../../../docs/testing.md)、導入・agent設定は[セットアップ](../../../docs/setup.md)の該当箇所を使う。

## 標準機能と正本

- 共通lintルールはroot、API/Web固有pluginはworkspace設定へ置く。導入版のruleとOxlint互換性を確認し、変更したruleは小さい失敗例で実効性を確認する。広いignoreや存在しないruleで通さない。
- 既存の標準lint・commitlint・CIへ責務を割り当てる。意味の判断を模倣する独自validatorや重いpre-push全体試験を増やさない。
- 実CLIはpackage scripts、順序・並列・cacheはTurbo、資源はCompose、Pythonはuvが所有する。標準機能を包むだけのrunner、envの二重解決、Composeの中継層を作らない。
- 自作skillの正本は`.agents/skills`へ置く。skillは選択・実行判断、docsは仕様・運用手順を所有し、別の編集元や同期用symlinkを増やさない。詳細参照は必要な作業から到達させ、全文読込を既定にしない。
- 外部skillは`bunx skills add <source> --skill <name> --agent codex -y`と`skills-lock.json`で取得元を管理する。上流本文を整形・翻訳しない。plugin・MCP設定では利用者の既存設定を保ち、生成物と手動設定を分ける。

## 変更範囲に応じた確認

- skill・文書のみならmetadata、相対リンク、整形、現在のscript・設定との整合を確認する。代表依頼から必要な資料へ到達できるかを確認し、文言一致の回帰テストや専用harness検査runnerは追加しない。
- lint・hooks・scriptを変えたら、対象の既存チェックと代表実行で実効性を確認する。rootとworkspaceの両方に影響するなら両方を検証し、広範囲の実装・共通設定を変えた場合は`bun run check`へ広げる。
- 導入方法、env、CLI、Dev Containerを変えたら`setup.md`と既存の詳細手順を同じ差分で更新する。認証や外部接続を確認できない場合は未確認範囲を明示する。
