# レイヤーの所有責務

各テストについて「対象（SUT）」「接続する実物」「差し替える外部」「観測結果」を明らかにする。ファイル拡張子やランナーだけでは分類しない。

## 責務表

| 所有層                                                                   | 実物と観測する保証                                                                                   | 差し替えてよいもの・上位へ残すもの                                              |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 静的検査（TypeScript / Oxlint / Oxfmt / build）                          | 型、公開exports、採用したlint規則、整形、framework build                                             | 実行時入力やデータ安全性は保証しない。OxlintとOxfmtをテストケース数へ数えない。 |
| ドメイン単体（Vitest）                                                   | 純粋な認可判断、状態遷移、計算、入力の境界、エラー分類                                               | 時刻・乱数等の依存を制御。判定関数がrouteで実際に使われることはHTTP統合。       |
| サービス単体・狭い統合（Vitest）                                         | 本番の業務手順と、失敗・再試行・cleanupの判断                                                        | 外部portのfakeは可。実SQL、transaction、provider protocolの証明にはしない。     |
| DB統合（Vitest + 実DB）                                                  | 実engine、migration、query、制約、tenant条件、commit/rollback、競合                                  | 本番とは別の隔離DB。query builderのmockで代用しない。                           |
| HTTPアプリ統合（Vitest + Hono/Elysia）                                   | 本番route、schema、middleware、serviceをRequest/Responseで接続。status、body、認可、error変換        | 外部providerを差し替える。middleware自体をmockして認可済みとしない。            |
| HTTP・runtime統合（Vitest + 実server / Workers integration）             | 実serverまたはtarget runtime、Cookie直列化、stream、multipart、切断、binding                         | 全routeの再試験はしない。runtime差のある代表契約を選ぶ。                        |
| DOMコンポーネント統合（Vitest + Testing Library）                        | React + DOM + event。public props、callback、意味のある表示やdisabled状態                            | ブラウザーのlayout、native focus、スクロールの証明は実ブラウザーへ。            |
| ブラウザーコンポーネント統合（Storybook + Vitest / Vitest Browser Mode） | Storybook interaction / Vitest Browser Mode。keyboard、focus復帰、portal、geometry、native rendering | appのrouteやDBを持ち込まず、公開component・Viewの責務を検証する。               |
| 接続済みfeature統合（Vitest / Storybook + MSW）                          | 実QueryClient・controller・複数component + MSW。pending→成功/失敗、retry、cache、古い応答の抑止      | HTTP providerの正しさは別のAPI契約テスト。MSW成功は実APIの成功ではない。        |
| Webアプリ統合（Playwright）                                              | 実Next.js/TanStack Start + Playwright。SSR/hydration、route境界、URL、履歴、Cookie、navigation       | 下流APIを差し替え可。純粋な判断とcomponentの全分岐を繰り返さない。              |
| フルスタックE2E（Playwright）                                            | 実Web・API・DB/Authを結ぶ代表journeyと永続化                                                         | OAuth/メール等の外部providerは通常emulator。実provider確認は別枠。              |

「下に寄せる」は必要な接続を外すことではない。SQLの原子性はunitへ移せず、router mockでSSRを証明できない。逆に日付変換の全境界をブラウザーで回す必要はない。

## frameworkとruntimeの差

- **Hono / Elysia**: 本番appに対してHonoの `app.request()`、Elysiaの `app.handle(new Request(...))` 等を使う。テスト用にrouteを再定義しない。in-processの成功とは別に、socket・server adapterの差がある契約だけ実HTTPで確認する。
- **Next.js**: server側の純粋判断はunit、Viewはcomponent層、RSC・Server Actions・routing・hydrationの結線は実Next.jsを起動して確認する。async Server Component等をunit runnerが扱えると仮定せず、対象版の公式対応を確認する。
- **TanStack Start**: 純粋なloader判断は低い層へ、server functionの直列化、redirect、pending/error/not-found、履歴は実app統合へ置く。メモリーrouterのcomponentテストと実routeの証明を区別する。
- **Cloudflare Workers**: 純粋ロジックは通常Vitestでよい。binding、execution context、storage等の保証は公式Vitest integration等でtarget runtimeを使う。NodeのmockだけをWorkers互換性の証明にしない。
- **Vercel等**: 実際のNode/Edge runtime、framework adapter、環境変数と配備設定に合わせて代表smokeを選ぶ。hosting名だけでruntimeを決めない。ローカルの成功と配備先の成功を分ける。
- **DB**: PostgreSQL、libSQL、D1等、保証対象のengineとmigrationを使う。代替engineでは保証できないSQL・制約・transaction差を明示する。

## ライブラリと重複の境界

ライブラリの入力空間、内部call順、未採用default、private DOMを再検査しない。自分たちが選んだoption/plugin、adapter変換、追加の認可・tenant条件、利用者へ約束した契約、既知の回帰を検証する。

薄い接続コードに分岐・変換・安全判断がなく、型検査や既存の代表接続で同じリスクを検出できるなら、専用テストを増やさず代替証拠を示してよい。

同じ拒否応答でも、domainの権限計算とHTTP入口の認証、repositoryのtenant絞り込みは異なる防御点である。各失敗原因と観測境界を区別して残す。

## Storybookの扱い

- propsで表現できるloading、empty、error、disabledはnamed storyで状態を示す。render結果を再確認するだけの `play` は付けない。
- `play` は選択、keyboard、focus復帰、form、retry等の意味ある操作を検査する。実通信完了後の状態遷移を観測するconnected storyも対象になる。
- storyが存在するだけではvisual regressionを保証しない。画像比較は基準画像と実行結果を管理する別の検査として扱う。
- primitiveにはdomainやAPIを持ち込まない。featureではQueryClient等の実providerを使う。private subcomponentは公開親のstoryで保証できれば個別storyを増やさない。
- a11y自動検査に加え、keyboard・focus・accessible name等を確認する。自動検査でスクリーンリーダー体験全体を保証したとは言わない。

MCP・Mastra・AI SDK・LiveKitを含むAgent経路は [Agentのテスト戦略](agent-testing.md) を読む。モデルを固定しても、実DB・transport・音声にしかない保証はそれぞれの境界へ残す。
