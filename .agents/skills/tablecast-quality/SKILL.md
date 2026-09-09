---
name: tablecast-quality
description: TableCastのOxlintルール、workspace検査、skillsの配置・導入を変更するときに使う。
---

# tablecast-quality

[静的解析](../../../docs/static-analysis.md)と[テスト戦略](../../../docs/testing.md)を読む。

1. 共通ルールはroot、API/Web固有pluginはworkspace設定に置く。既存script経由でrootとworkspaceの両方を検証する。
2. pluginの導入版が持つruleとOxlint互換性を確認し、小さい失敗例で実効性を確かめる。広いignoreや無効なrule名で通さない。
3. 自作skillは`.agents/skills`へ直接置く。別の編集元やsymlink同期を増やさない。
4. 外部skillは`bunx skills add <source> --skill <name> --agent codex -y`で取得し、`skills-lock.json`を更新する。上流本文を整形・翻訳しない。
5. `bun run check`を実行する。skill内の相対リンクとmetadata、外部skillの取得元を確認する。
