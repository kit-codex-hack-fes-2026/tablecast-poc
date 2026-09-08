# fixture・helper・each・skip

## fixtureは前提を隠さず、環境を隔離する

- シナリオを読むのに必要なrole、tenant、状態、境界値はテスト本体へ明示する。
- 関係のない必須項目は小さなfactoryで補う。`Partial<T>`を深く重ねる汎用builderやフラグ多数の巨大fixtureを作らない。
- fixtureはsynthetic dataにする。規則に関係する時刻、timezone、locale、乱数は固定・制御し、生成を使うならseedを再現できるようにする。
- 毎回fresh objectを返す。共有する定数は不変にし、ネストしたmutable stateの使い回しを避ける。
- 共通の起動・後処理はVitest/Playwrightの標準fixtureやhookへ置く。worker単位では起動費用の高い環境を共有しても、データ・認証・cacheはテストごとに隔離する。
- DB名、tenant、storage prefix、ユーザーなどにrun/worker/testのnamespaceを設ける。cleanupは自分のnamespaceだけに限定し、失敗時も実行する。
- transaction rollbackで隔離できるのは、全操作がそのtransactionへ参加する場合だけ。別接続・HTTP serverをまたぐ場合に隔離できたと仮定しない。

固定fixtureは権限表、境界、migration前の状態、既知の回帰、named storyに向く。大量の無関係なデータは決定的生成でよい。生成のためだけに新しい依存を追加しない。

本番の顧客データ、token、Cookie、外部providerへの書込みを通常テストへ持ち込まない。実providerが必要な検証は対象・費用・データ送信を明示した別の実行枠にする。

## 置き場所と型

fixtureとhelperはまず所有するtest/component/featureの近くへ置く。共有する意味と利用箇所が確認できてから共通のtest-supportへ移す。app固有fixtureを汎用UIやDB packageへ押し込まない。

productionからtest-supportをimportしない。workspaceをまたぐ共有は既存の公開test-support entrypointを使う。公開API由来の型と `satisfies` 等でデータを確認するが、型だけでHTTPのURL・method・直列化の正しさを保証したとは扱わない。

migrationの既存状態は可能なら過去のmigration prefixから作る。テスト専用の最新schemaだけではupgrade時の回帰を検出できない。

## test helper

- 再利用する業務上の前提、複雑なresource setup/cleanup、意味のある操作を短い名前で表す。
- GivenのhelperへWhenとThenを隠さない。`seedEditableIssue` と `updateIssue` を分け、呼出しだけで主張が読めるようにする。
- 重要なThenは本体に残す。複数箇所で同じ公開契約を観測するassert helperや、native geometryの計算は目的を名前に示してよい。
- `withSuccess: true`、`expectError: false` のようなモード分岐を増やして全ケースを一つへ押し込まない。
- 失敗をcatchして空値へ変えたり、リトライで黙って通したりしない。後処理後も元の失敗を伝える。
- 既存のrenderer、runner fixture、MSW、標準assertionを包むだけの独自DSLを作らない。

QueryClientは各test/storyで作り、MSW handler・storage・timer・spyはreset/restoreする。想定外リクエストは検出し、許可するasset等だけ限定する。fakeは外部境界を表すものとし、本番のSQLやframeworkの内部を再実装しない。

## each

同じ規則・同じ手順・同じThenに対し入力だけが変わるときは `test.each` / `it.each` を使う。

- 複数軸には `{ label, role, tenant, expected }` のようなnamed object rowを使い、失敗名からケースを判別できるようにする。
- 単一scalarの境界表は値だけで分かるならそのままでよい。
- rowの中で別のWhenやThenへ分岐するなら別テストへ分ける。異なる規則を同じ表へ入れない。
- 単一test内のfor loopで複数ケースをassertして、最初の失敗以降を隠さない。Playwrightでは公式のparameterizationに従い、独立した名前のtestを定義する。
- 同じ期待値を大量の等価入力で繰り返さず、追加行が新しい境界・リスクを検出するか確認する。
- retries、browser/theme違い、eachの行数を独立した業務保証の数として水増ししない。

## skip・todo・only・retry

`skip` は成功ではない。必須環境や認証設定が欠けたら、成功扱いでskipするのではなくsetupの失敗として報告する。optionalな実provider suiteは明示した実行設定で分離する。

| 手段          | 運用                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| skip / skipIf | 対象環境で非対応の機能、または一時隔離だけ。理由・適用条件を記載する。一時隔離には追跡Issue、担当、解除条件または期限を残す。 |
| todo          | 未実装の保証を追跡する。完了済みやcoverageの代わりにしない。                                                                  |
| only          | ローカル調査中だけ。コミット前に除き、CIのrunner設定や採用lintで検出する。                                                    |
| retry         | 外乱の調査・限定運用に使う。再試行で成功したケースを安定した保証とみなさず、flakyとして追跡する。                             |
| manual story  | 無限loading等の目視専用状態は、対象版のtag/設定で自動テストから明示的に外す。理由と別の自動保証を示す。                       |

flaky testは同期・隔離・外部依存の原因から直す。suite全体のskipやtimeout延長で隠さない。隔離する場合も危険な規則を無保証にせず、代替確認と影響を示す。Playwrightのskip/fixmeとVitestのskip等は意味を対象版で確認し、名前だけで同一視しない。
