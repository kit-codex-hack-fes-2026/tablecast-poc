# 参照資料と採否

[索引](README.md)

確認日: 2026-09-06。以下は構成判断の根拠であり、TableCastの実行試験結果ではない。
公式APIやプランは更新されるため、実装時に採用版の公開仕様へ照合する。モデル名やライブラリの番号を推測で固定しない。

<a id="reference-repositories"></a>

## ユーザー指定リポジトリ

### enterprise-agentic-saas-starter

参照commit: `3aa43d3dee9b162a57b5017178633c7d02a952b5`。

- [package.json](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/3aa43d3dee9b162a57b5017178633c7d02a952b5/package.json)
- [Oxlint設定](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/3aa43d3dee9b162a57b5017178633c7d02a952b5/oxlint.config.ts)
- [命名とlayer](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/3aa43d3dee9b162a57b5017178633c7d02a952b5/docs/architecture/naming-and-layers.md)
- [テスト戦略](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/3aa43d3dee9b162a57b5017178633c7d02a952b5/docs/testing-strategy/README.md)
- [文書索引](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/3aa43d3dee9b162a57b5017178633c7d02a952b5/docs/README.md)
- [Lefthook設定](https://github.com/ReoHakase/enterprise-agentic-saas-starter/blob/3aa43d3dee9b162a57b5017178633c7d02a952b5/lefthook.yml)

| 採用                                           | 縮小または不採用                                          |
| ---------------------------------------------- | --------------------------------------------------------- |
| Bun/Turbo、lockfile、taskの費用別分離          | 巨大なdependency catalogのコピー                          |
| Webのfeature、APIのmodule、純粋判断とI/Oの分離 | 全moduleにport/repository/serviceを一式作ること           |
| 公開exportsとimport境界                        | 使い手のない共有package、contractsやdomainの独立workspace |
| 統合テスト、代表的なE2E、実モデル試験の分離    | 多数のテスト層記号、同じシナリオの重複                    |
| app内Storybookとcolocated Story                | 別Storybookアプリ                                         |
| 短い指示→必要docs→対象testの順                 | 大量のskills、ADR、実行計画に同じ規範を重複               |
| 必要なasync・型・依存制約                      | 行数回避の分割、構文の好みだけの厳格ルール                |
| 既存のローカル起動ツール活用                   | 独自topology packageや大きな監視環境の丸ごと移植          |

参照リポジトリのNext.js・Elysia・libSQL・email等の構成はTableCastへ移植しない。
本ZIPの仕様とskillsは本案件向けに新しく整理しており、スターターのコードや長い規約をそのまま同梱していない。

### minimum-impl

[指定されたSKILL.md](https://github.com/ReoHakase/skills/blob/main/minimum-impl/SKILL.md) を読み、最小実装の選択順、DRY/YAGNI、実物確認、適切なテスト境界を採用した。
参照時のfile blob SHAは `c9882f63c7815aaae1ec8197d4b4531dfd0fd851`。これはcommit SHAではない。
同梱の `.agents/skills/minimum-impl/SKILL.md` はTableCast用の短い運用版であり、元ファイルの全文コピーではない。
目的は要件や検証の削減ではなく、独自状態・変換・層・契約・依存・運用の保守負担を減らすこと。

## S01

[Inworld speaker diarization](https://docs.inworld.ai/stt/speaker-diarization)

実験的な話者番号、単語時刻、APIの設定。音源分離や本人認証の保証ではない。

## S02

[LiveKit Python Inworld plugin reference](https://docs.livekit.io/reference/python/livekit/plugins/inworld/index.html)

公式STT/TTS実装の公開設定と変換処理を確認。採用版で未対応の話者情報だけを最小patchする判断に利用。

## S03

[LiveKit Inworld TTS](https://docs.livekit.io/agents/models/tts/inworld/)

公式pluginとInferenceの接続方式、モデル・voice・公開オプション。直接接続とInferenceの機能を同一視しない。

## S04

[LiveKit pipeline nodes](https://docs.livekit.io/agents/logic/nodes/)

公開llm_node・transcription_node等の拡張点。Mastra接続と必要な表示整形をこの境界へ限定する。

## S05

- [Inworld TTS 2 prompting](https://docs.inworld.ai/tts/best-practices/prompting-for-tts-2)
- [Inworld steering](https://docs.inworld.ai/tts/capabilities/steering)
- [Inworld pause controls](https://docs.inworld.ai/tts/capabilities/pause-controls)

英語のinline指示、reset、非言語音、SSML break、request経路ごとの差、Flashの制約。発話例とペルソナはTableCastの設計案であり、公式例の効果保証ではない。

## S06

[LiveKit Expressive Mode](https://docs.livekit.io/agents/models/tts/expressive/)

Inference TTSを対象とする自動マークアップ機能。完全ローカル・直接pluginで同じ自動動作を前提にしない。

## S07

[Mastra Agent.stream](https://mastra.ai/reference/streaming/agents/stream)

textStream、AbortSignal、実行オプション。実際の音声取消とDB書込みの整合性はTableCastで別に検証する。

## S08

[Mastra Hono adapter](https://mastra.ai/reference/server/hono-adapter)

[Mastra RequestContext](https://mastra.ai/docs/server/request-context)

Hono内へMastraを組み込み、認証コンテキストとAPIを同じ境界で扱う。固定版のadapterはNode管理routeを含むbundleがworkerdで起動しなかったため、実装は公式RequestContextをAgent.streamへ直接渡す。

## S09

[LiveKit noise and echo cancellation](https://docs.livekit.io/transport/media/noise-cancellation/)

WebRTCのエコー除去と、背景音抑制・音声分離の違い。Cloudの強化機能をローカルの必須条件にしない。

## S10

[Cloudflare HTTP Service Binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/)

Worker間の内部HTTP接続。ブラウザー向けredirectではない。

## S11

- [Cloudflare multiworker development](https://developers.cloudflare.com/workers/local-development/multi-workers/)
- [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [Cloudflare local data](https://developers.cloudflare.com/workers/local-development/local-data/)

Vite補助WorkerとWrangler multiworker、ローカル資源の保存先。実装時は同じWorkerの二重起動を避ける。

## S12

- [D1 Database API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Cloudflare Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)

batchのトランザクションと公式runtimeでの試験。条件更新が0件でも自動的に例外になるわけではない。

## S13

- [Bun workspaces](https://bun.com/docs/pm/workspaces)
- [Bun install](https://bun.com/docs/pm/cli/install)
- [Bun lockfile](https://bun.com/docs/pm/lockfile)
- [Turborepo repository structure](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)

依存管理とruntimeは別。Bun、workerd、Pythonの実行境界を保ったままタスクを統合する。

## S14

- [Storybook Vitest addon](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon)
- [Storybook Vite builder](https://storybook.js.org/docs/builders/vite)
- [Base UI](https://base-ui.com/react/overview/about)

Web内のStoryと実ブラウザー試験、アクセシブルな部品の再利用。別アプリ化は必要条件ではない。

## S15

- [Codex skills](https://developers.openai.com/codex/skills/)
- [Codex Git worktrees](https://developers.openai.com/codex/environments/git-worktrees)
- [ChatGPT developer mode](https://developers.openai.com/api/docs/guides/developer-mode)

repo-local skills、.worktreeinclude、MCPの検証入口。Git標準やすべてのChatGPTプランに同じ機能があるとは扱わない。

## S16

[Cloudflare Images binding](https://developers.cloudflare.com/images/optimization/binding/)

Worker内の画像変換とローカル対応範囲。全クラウド機能を自作エミュレーターで埋めない。

## S17

[uv dependency sources](https://docs.astral.sh/uv/concepts/projects/dependencies/)

git source、subdirectory、revision、lockfileの管理。上流pluginのfork固定に使う。

## S18

[RFC 6265](https://datatracker.ietf.org/doc/html/rfc6265)

Cookieはportごとのセキュリティ境界を提供しない。worktreeはホスト名も分離する。

## S19

[Portless README](https://github.com/vercel-labs/portless/blob/main/README.md)

名前付きlocalhost、TLS、workspaceへの対応。既存proxy・port管理を再利用し、独自の大きな起動管理層を作らない。
共有proxyの挙動と採用版を確認する。TLSの初回設定に管理者権限が必要な場合は明示し、無断で昇格しない。

## S20

- [Oxlint type-aware linting](https://oxc.rs/docs/guide/usage/linter/type-aware.html)
- [Oxlint rules](https://oxc.rs/docs/guide/usage/linter/rules.html)
- [no-floating-promises](https://oxc.rs/docs/guide/usage/linter/rules/typescript/no-floating-promises.html)
- [no-misused-promises](https://oxc.rs/docs/guide/usage/linter/rules/typescript/no-misused-promises.html)

型付きルールには対応したTypeScriptと解析エンジンが必要。starterのpinと最新のルールをそのまま混ぜない。
ルール名・optionを採用版で検証し、未対応をignoreで隠さない。
