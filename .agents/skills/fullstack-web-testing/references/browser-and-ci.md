# ブラウザー同期と実行戦略

## ブラウザー統合（Storybook / Vitest Browser Mode / Playwright）

locatorはroleとaccessible name、label、named region内のtext等を先に使う。順序が契約の場合以外は `first()` / `nth()` で曖昧さを隠さない。private属性やTailwind classを機能契約にしない。

- Testing Library/Storybookの出現は `findByRole`、変化は `waitFor` を使う。
- Playwrightはlocatorとweb-first assertionを使う。APIや永続化の反映は `expect.poll` 等で対象状態を読む。
- 固定sleep、`waitForTimeout`、汎用 `networkidle` を業務状態の同期にしない。timeoutを延ばす前に待つべき状態を特定する。
- loadingや古い応答は制御可能なdeferred/gateで再現する。要求到達→途中状態の観測→解放→最終状態を明示し、解放は失敗時もfinallyで行う。
- 待機関数の中でclick等の副作用を繰り返さない。actionは一度実行し、assertionを待つ。
- portalはstoryの `canvasElement.ownerDocument.body` を起点にする。グローバルdocumentの混同を避ける。
- geometryやnative描画が契約なら実ブラウザーで観測し、必要な許容差を根拠付きで設定する。DOM emulatorの寸法で代用しない。

## Static（TypeScript / Oxlint / Oxfmt / build）

TypeScriptは型・公開契約、Oxlintは採用済みの品質・テスト規則、Oxfmtは整形を担当する。各ツールの対象版で提供される規則を確認し、未対応ルールを設定へ足さない。必要なテスト専用lintが別ツールで導入済みなら維持し、対応を確認せず全廃しない。

await漏れ、focused test、危険なlocator、無意味なassertion等は可能な限り静的に検出する。通常のtypecheck・lintは実行時テストの代わりではない。buildはframework変換、server/client境界、bundle成立を補完する。

## 実行の比重とCI

1. ローカルでは静的検査と変更対象のunit/integrationを先に実行する。
2. 変更した接続に応じてDB、HTTP、browser component、Web app統合へ広げる。
3. CIでは既存の必須チェックを維持し、決定的なunit/integrationと重要E2Eを実行する。関連テストだけのローカル成功を全件成功と扱わない。
4. 実provider・有料・配備先smokeは別枠にし、未実行を明示する。通常のテストへ本番接続を混ぜない。

既存package scriptとrunner projectsを使い、各runtimeの設定・reportを分離する。Node、Browser Mode、StorybookでVite pluginやsetupを無理に共有しない。CI対象の選択・cacheを変える場合は、設定変更、削除ファイル、動的依存を含む見落としへのfallbackを用意する。

主ブラウザーで主要interactionを実行し、他engineは固有リスクの代表へ絞る。viewport・theme・browserの全直積を作らないが、mobile、dark、keyboard等の重要な境界を落とさない。並列数は環境とデータ隔離の実測で決め、参照元の固定値をコピーしない。

## coverageと失敗の調査

coverageは未観測のbranchを探す道具であり、安全性の証明ではない。目標値は現状・重要境界・既存規約から決め、100%のためのライブラリ再試験や無意味なassertionを足さない。

テスト失敗時にcoverage閾値や対象を下げない。例外は対象行、理由、代替保証、解除条件を明記して最小範囲にする。生成物の除外と、保守している分岐の隠蔽を区別する。

ブラウザーのtrace・画像・動画、bounded log、reportは失敗原因を確認できる範囲で保存し、token・Cookie・実顧客情報を混入させない。実行環境の起動失敗、productの回帰、flaky、未実行を分けて報告する。
