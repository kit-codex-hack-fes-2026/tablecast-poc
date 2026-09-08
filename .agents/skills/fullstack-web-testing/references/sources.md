# 資料と適用範囲

## 設計の参照元

`ReoHakase/enterprise-agentic-saas-starter` の `8d14a21c3d65f53b5ec6589011a2ba86093b7f6d` を参照した。2026-09-09にローカルのaccepted規約と実テストを確認し、BDD、最低十分な所有層、統合重視、fixture隔離、ブラウザー同期を一般化している。

- [テスト戦略と比重](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/8d14a21c3d65f53b5ec6589011a2ba86093b7f6d/docs/testing-strategy/README.md)
- [GWT・ケース設計](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/8d14a21c3d65f53b5ec6589011a2ba86093b7f6d/docs/testing-strategy/common/test-case-design.md)
- [fixtureと隔離](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/8d14a21c3d65f53b5ec6589011a2ba86093b7f6d/docs/testing-strategy/common/test-data-and-fixtures.md)
- [Storybookの責務](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/8d14a21c3d65f53b5ec6589011a2ba86093b7f6d/docs/testing-strategy/common/storybook.md)
- [ブラウザー同期](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/8d14a21c3d65f53b5ec6589011a2ba86093b7f6d/docs/testing-strategy/common/browser-test-writing.md)
- [APIの境界](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/8d14a21c3d65f53b5ec6589011a2ba86093b7f6d/docs/testing-strategy/apps/api.md)
- [Webの境界](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/8d14a21c3d65f53b5ec6589011a2ba86093b7f6d/docs/testing-strategy/apps/web.md)
- [境界表の実例](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/8d14a21c3d65f53b5ec6589011a2ba86093b7f6d/apps/api/src/modules/organizations/deletion-access.test.ts)
- [ブラウザーの実例](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/8d14a21c3d65f53b5ec6589011a2ba86093b7f6d/packages/ui/src/components/select/select.stories.tsx)

このスキルは参照元の全構成を要求しない。レイヤー番号、package配置、CSFの形式、並列数、coverage数値、特定DBやproviderは対象リポジトリで確認する。コード例は説明用であり、参照元のテストをそのまま移植したものではない。

## 公式資料

実装する際は対象バージョンの資料を読む。以下の現行ページは2026-09-09に確認した。

- [Vitest Test API](https://vitest.dev/api/test): each、skip、only等の実行API。
- [Vitest Test Context](https://vitest.dev/guide/test-context): fixtureの生成・破棄とscope。
- [Playwright best practices](https://playwright.dev/docs/best-practices): locator、観測可能な結果、独立性。
- [Playwright fixtures](https://playwright.dev/docs/test-fixtures): test/workerの環境とcleanup。
- [Storybook interaction tests](https://storybook.js.org/docs/writing-tests/interaction-testing): play、step、userEvent、assertion。
- [Oxlint](https://oxc.rs/docs/guide/usage/linter) / [Oxfmt](https://oxc.rs/docs/guide/usage/formatter): 対象版の規則と実行設定。
- [Hono testing](https://hono.dev/docs/guides/testing) / [Elysia testing](https://elysiajs.com/patterns/unit-test): 本番appへのRequest。
- [Next.js Vitest guide](https://nextjs.org/docs/app/guides/testing/vitest): componentの対応範囲と実frameworkが必要な境界。
- [TanStack Start server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions): client/server境界と直列化。
- [Cloudflare Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/): Workers runtimeでの検証。

## Agent関連の公式資料

2026-09-09に以下を確認した。テストAPIの世代・Node/Pythonの対応は導入版に合わせる。レイヤー分担と通常CIを決定的にする方針は、このスキルの設計判断である。

- [AI SDK testingの公式ソース](https://github.com/vercel/ai/blob/main/content/docs/03-ai-sdk-core/55-testing.mdx): ai/testのmock providerと、aiのstream helper。
- [MCP SDK in-memory transport](https://ts.sdk.modelcontextprotocol.io/v2/api/index/@modelcontextprotocol/client/): client/serverを同一プロセスで接続する公開transport。v1とv2のAPIを混ぜない。
- [Mastra workflows](https://mastra.ai/docs/workflows/overview): 本番workflowの構成と実行。
- [Mastra evals](https://mastra.ai/docs/evals/overview): Agent・workflowの品質評価。
- [LiveKit testing and evaluation](https://docs.livekit.io/agents/start/testing/): Node/Pythonのテストと実LLM依存、Roomを接続しない検証範囲。
