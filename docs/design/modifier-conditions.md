# カスタマイズ条件の調査・設計案（#176）

対象Issue: [#176](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/176)。調査日: 2026-09-15。
対象は `origin/staging` の `1c93135d51132253264824136f340734da4307fd`。
専用branchは `codex/176-modifier-conditions`、worktreeは `/private/tmp/tablecast-176-modifier-conditions`。

本書は実装前の設計案であり、製品の実装済み契約ではない。今回は調査・設計を行い、製品仕様・runtime・DB・lockfileは変更しない。実装時に本書の決定を[製品仕様](../product.md)、[MCP仕様](../mcp.md)、[UI仕様](../ui.md)へ反映する。

## 結論

選択肢が選ばれた場合に要求する式と、組合せを禁止する式を分ける。AND／OR／NOTの木をAPIのcatalog moduleが所有し、設定検証・注文・管理画面の試行で同じ評価関数を使う。ブラウザーは編集と表示を担当する。

優先して解決する点は、旧requiresの未完成カートを維持すること、旧クライアントの全体保存で条件を消さないこと、再帰schemaの解析前に計算量を制限することである。汎用ルールエンジン・SATソルバー・独立package・新しいDBテーブルは不要と判断する。

## 現状の証拠

以下の行番号は調査対象SHAのもの。

| 場所                                                  | 確認した動作と設計への影響                                                                                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/catalog/model.ts:25`            | optionに`requires: string[]`、`excludes: string[]`。商品は最大12グループ、各30選択肢。配列には現在件数上限がない。                                         |
| `apps/api/src/modules/catalog/pricing.ts:64`          | 参照先は同じ商品内、自己参照はエラー。循環や全体の充足可能性は検査していない。                                                                             |
| `apps/api/src/modules/catalog/pricing.ts:141`         | 選択ID集合を作り、選ばれたoptionだけ条件を評価。excludesは一つでも選ばれると422、requiresは全て必要で、不足IDをmissingへ入れる。                           |
| `apps/api/src/modules/orders/model.ts:4`              | 選択数量は1〜20。0は未選択の別表現として受理していない。カートは100行、行のselectionsは100件まで。                                                         |
| `apps/api/src/modules/orders/service.ts:37`           | updateCartはpriceCartを呼ぶがcomplete=falseを保存できる。prepareConfirmationは同じ評価後にcompleteを必須にする。submitOrderにもpriceCartの再検証がある。   |
| `apps/api/src/modules/tables/queries.ts:124`          | previewCartは売切等を表示可能な未完成カートへ変換する。新しい結果フィールドは通常経路と例外経路の両方に必要。                                              |
| `apps/api/src/modules/configuration/service.ts:74`    | draftのconfig_jsonをschemaで復元。updateDraftは設定全体を置換し、expectedVersionで競合を防ぐ。validateDraftとpublishDraftがconfigurationErrorsを共有する。 |
| `apps/api/src/modules/catalog/queries.ts:73`          | 公開・demoのconfig_jsonも同じconfigurationSchemaで復元する。保存JSONを一括書換えせず読み分ける余地がある。                                                 |
| `apps/api/src/modules/mcp/routes.ts:51`               | get_configurationはz.toJSONSchemaを返す。update_draftも同じschemaとserviceを使う。MCPは設定管理であり、注文toolは追加しない。                              |
| `apps/api/src/modules/voice/agent.ts:171`             | 詳細カタログの選択肢投影に既存requires/excludesが含まれない。voiceTableStateもmissingだけを転記する。新条件の説明にはこの投影とtool説明の変更が必要。      |
| `apps/web/src/features/store/modifiers-editor.tsx:39` | 商品内のグループ名・選択肢名を候補化済み。ReferencesFieldはプラン参照でも使うため、全用途を条件エディターへ置き換えない。                                  |
| `apps/web/src/features/kiosk/kiosk.tsx:142`           | 編集対象の未完成行をmissing.lengthで選ぶ。completeの変更だけでは既存行への追加入力を維持できない。                                                         |
| `apps/api/src/app.ts:31`                              | HTTP body上限は通常2MiB、MCPは8MiB。body上限だけでは深い木による再帰の負荷を制限できない。                                                                 |

## 条件の意味

所有する選択肢をX、同一カート行の選択集合をSとする。式の葉Aは `S.has(A)`。Xが未選択ならXの条件は適用しない。式内のAを見てもA自身の条件へ再帰しない。全ての選択済みoptionを独立に検証する。

| 種類     | X選択時の条件                  | 結果                                                                    |
| -------- | ------------------------------ | ----------------------------------------------------------------------- |
| requires | 式がtrueである必要がある       | falseならカートに保持できるが未完成。確認・注文は不可。自動選択しない。 |
| excludes | 式がtrueとなる組合せを禁止する | trueなら既存同様OPTION_COMBINATIONで更新を拒否する。                    |
| 条件なし | null                           | requiresは制約なし、excludesは禁止なし。空のAND／ORとは区別する。       |

例: Xのrequiresを `A AND (B OR NOT C)` とする。

| 選択（いずれもXを含む） | 式    | 注文に向けた状態                                           |
| ----------------------- | ----- | ---------------------------------------------------------- |
| A、B、C                 | true  | この条件は充足。他の数量・売切・プラン制約は別途検証する。 |
| A                       | true  | Cが未選択なのでNOT Cはtrue。                               |
| A、C                    | false | Bの追加またはCの解除で解消できる。Bを必須と断定しない。    |
| B                       | false | Aが不足している。                                          |

同じ式をexcludesへ設定した場合はtrueの行が禁止になる。UIでは単なる条件という見出しで済ませず、Xを選ぶには必要／Xと同時に成立すると禁止の意味を常に表示する。NOT CはCを選ばないという意味であり、Cが売切であるという意味ではない。

数量0はAPIで引き続き拒否する。UIで0へ減らした選択はselectionsから削除する。1以上の数量は葉の真偽に影響せず、maxQuantity・groupのmin/max・single/multiple/quantityは既存の数量検証を併用する。条件によって売切・プラン除外を上書きしない。

## データと互換性

### 提案する保存形式

以下は説明用の型。実装の正本はcatalog/model.tsのZod schemaとその推論型とする。

```ts
type OptionCondition =
  | { kind: "option"; optionId: string }
  | { kind: "and" | "or"; children: OptionCondition[] }
  | { kind: "not"; child: OptionCondition };

type OptionConditions = {
  requires: OptionCondition | null;
  excludes: OptionCondition | null;
};
```

configurationに条件形式の識別子 `modifierConditionVersion: 2` を追加する案を採る。業務上のconfigVersion・draft.versionとは別物である。v2のoptionはconditionsを持ち、旧requires/excludes配列との併記は拒否する。形式の判別前にdefaultで情報を埋め、旧要求をv2と誤認しない。

v1は識別子なしの既存JSON。保存されたdraft/release/demoはv1のまま読めるよう維持する。APIの公開入力schemaはv1/v2の明示unionとし、実行時の内部表現へ変換する処理は別関数にする。schemaのtransformでJSON Schema出力を壊さない。

### 旧条件との同値性

- `requires: [A, B]` → `AND(A, B)`。0件はnull、1件は葉。
- `excludes: [A, B]` → `OR(A, B)`。ANDにすると既存の禁止条件を弱めるため不可。
- 旧requiresのmissing ID一覧と未完成カート、旧excludesの拒否結果を維持する。
- 読取りだけでconfig_json、draftの版、ready状態、既存release、注文snapshotを書き換えない。
- 編集時に形式更新を明示してv2へ保存する。旧データが新しい節数上限を超える場合はv1として読取り・判定を継続し、変換時に調整箇所を示す。切捨てない。
- 新schemaで過去snapshotの追加フィールドが省略されている場合は空値として読めるようにし、過去の金額・注文結果を再計算しない。

### 旧クライアントの保存・公開

expectedVersionだけでは、v2の最新版を取得した旧クライアントが未知フィールドを落として保存する事故を防げない。現在のdraftがv2ならv1入力を `CONFIGURATION_FORMAT_UNSUPPORTED` 等で拒否し、再読込み・対応クライアントへの更新を案内する。版を合わせても拒否されることを実DBで検証する。

保存時の形式比較とCASは同じ版に結び付ける。現行updateDraftに事前読取りを加えるなら、その読取版をUPDATE条件へ渡し、追加するDB往復を明記する。JSON形式の比較をUPDATE条件へ直接置く案はDrizzleの標準機能で不足するか確認してから選ぶ。

公開済み設定がv2のとき、既存v1 draftの公開も拒否する。旧draftをv2へ変換し、最新公開版との差分を確認して再検証する経路を提供する。単にbaseVersionが一致すればv1に戻してよいとはしない。

v2対応API・Webの配備後にv2作成を有効にする。旧APIへコードだけrollbackするとv2 JSONを読めないため、v2 readerを維持する修正配備を基本にする。downgradeには明示的なデータ復元計画が必要である。読み書き互換と過去注文の保持は初回実装の必須範囲とする。

## 構造検証と計算量

- AND／ORの子は2〜8件。NOTはchild一つだけ。空グループ、未知kind、余分なフィールドは保存不可。
- 深さは根を1として最大8、1式64ノード、商品内の条件合計1,024ノード、設定全体65,536ノードを初期案とする。上限値は実装前の最大fixtureとHTTPサイズ測定で確定する。
- schemaの再帰解析前に反復走査で深さ・件数を打ち切る。HTTP、MCP、保存JSON復元、bootstrap/demoを含む入口を確認する。再帰parse後のrefineだけを防御にしない。
- 式の評価は選択IDのSetと商品内optionのMapを共有してO(ノード数)。参照ごとのDB問合せ・参照先条件の展開・全選択組合せの列挙はしない。100行の注文でも評価対象ノードは最大102,400が設計上の上限となる。
- 存在しないID・他商品のID・自己参照は正確なpath付きエラー。売切optionは既存条件から削除せず、参照可能な候補として売切状態を示す。現在の選択例に含めたら売切の理由を返す。
- 相互参照 `X requires A` と `A requires X` は両方の選択で成立するため許可する。参照グラフの循環を一律に拒否しない。自己参照は既存契約を維持して拒否する。
- 矛盾の完全な静的証明は行わない。`A AND NOT A`、single内で2つを要求する等の設定は成立する選択がない場合がある。構造・参照が正しいことと注文可能であることを区別し、選択例のAPI試行で不成立理由を確認できるようにする。既存にない厳格な充足可能性チェックをv1の公開へ遡及適用しない。

上限値と、静的な矛盾警告を追加するかは設計上の調整点。上限内なら全組合せを探索する設計にはしない。

## API・GUI・音声・MCPの接続

### 共通評価

`catalog/conditions.ts`に変換・構造走査・真偽評価を置き、model.tsにschema、pricing.tsに既存価格検証との統合を置く。評価は純粋関数とし、Web公開schema経由で型を共有しても評価関数をブラウザーへ輸出しない。

設定検証は構造と参照の検証、注文は実際の選択集合の評価という役割を分ける。validateDraftとpublishDraftは同じ構造検証を通り、updateCart・prepareConfirmation・submitOrder・previewCartは同じ条件評価を通る。

### 未充足結果

OR／NOTをmissing IDの全件選択要求へ変換しない。PricedLineに `conditionIssues` を追加し、所有optionId・relation・式のpath・成立に必要な式と選択状態を構造化して返す。必要な枝を説明可能なまま保持し、独自の文字列DSLにしない。

v1のmissingは従来どおり。v2の条件不足はconditionIssuesへ置き、completeは両方を調べる。kioskの既存行再編集判定・カートの表示・音声投影も両方を見る。古い画面が誤って確認を送ってもAPIは未完成として拒否する。旧画面で新条件の編集が成立するとは保証せず、更新を案内する。

excludes違反の422にも構造化detailsを追加し、どの所有optionと式が禁止になったか示す。音声toolには現在localeの名称と必要な条件だけ渡す。詳細カタログには対象商品の条件を含め、一覧の全商品へ大きな式を複製しない。出力を上限で省略する場合は省略と次の取得方法を明示し、ORの一部を黙って削らない。

### 管理画面の選択例

既存configuration管理routeに副作用のない条件試行endpointを追加する案とする。入力は編集中の1商品・所有optionId・relation・selections、出力は構造エラー・各節の真偽・適用／非適用。既存の店舗manager認可を必須にする。

schemaと同じ構造検証、catalogの同じ評価関数を利用する。未保存商品を扱えるがDBへ保存・公開せず、実カートも変更しない。この試行は式の成立確認であり、実セッションのプラン残数・時間・注文可能性の証明ではない。実注文はpriceCart全体で判定する。

UIは自然言語要約を木から決定的に表示し、各グループを括弧や段落で区切る。要約は表示責務で、注文可否の再実装を含めない。LLMで要約しない。例: Aを選び、Bを選ぶかCを選ばない。英語はBritish Englishの文言を用意する。

## 編集UI

`ModifiersEditor`の二つのReferencesFieldを業務用 `OptionConditionsEditor`へ置き換える。プラン等のReferencesFieldは別責務として維持する。既存フォーム・Input・Button・Select・エラー表示を使い、補完は導入済みBase UI 1.8.0のComboboxをまず確認する。

| Before                               | After                                      | 理由                                           |
| ------------------------------------ | ------------------------------------------ | ---------------------------------------------- |
| native multiple selectの平坦なID一覧 | 必要条件／禁止条件ごとの木とグループ見出し | 条件の適用範囲と否定対象を読めるようにする。   |
| グループ名・選択肢名だけの候補       | 同じ候補集合を検索し、同名時はIDも併記     | 商品内で識別し、自由入力の架空IDを保存しない。 |
| 一覧内の削除操作                     | 明示的なグループごと削除、NOTを外す操作    | 子を勝手に親へ移動して条件を変えない。         |

- AND↔OR切替は子を保持する。NOTは対象の木をchildとして包む操作。NOT解除は明示操作でchildを戻す。多子グループをNOTへ変える際に先頭以外を捨てない。
- 削除後に子が1件／0件になっても自動平坦化しない。未完成の編集状態として該当グループを表示し、保存前に修正を求める。条件全体を消す場合だけ明示操作でnullへ戻す。
- 編集中の空欄・安定したローカルキーはWeb状態として持ち、保存schemaにUI用IDを追加しない。配列indexだけをReact keyにして削除後のfocusを別の節へ誤移動させない。
- 検索対象は日英のグループ名・選択肢名とID。選択済み候補、参照切れ、0件、自己参照等の無効候補を説明する。同じ葉の別の枝での利用は有効なので、式全体で既出という理由だけで無効にしない。
- 保存前に公開schemaで構造エラーを検出し、該当pathの入力とエラー一覧を関連付ける。非同期の保存・試行に失敗しても入力を保持する。古い試行レスポンスを最新の木へ表示しない。
- Tab、矢印、Enter、EscapeのCombobox標準操作を使う。追加後は新しい節、削除後は次の兄弟→前の兄弟→親の追加ボタンへfocusを移す。入れ子ごとにfieldset/legendまたは同等の名前付けを行う。
- iPad縦幅で深さによる横はみ出しを防ぎ、44pxを目安に操作領域を確保する。hover専用操作・ドラッグ必須操作を作らない。頻繁な節編集に新しいアニメーションは追加しない。

## 並行作業との境界

調査時点で [#199](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/pull/199)（フォーム構成）、[#201](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/pull/201)（画像）、[#202](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/pull/202)（保存・公開）、[#203](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/pull/203)（メニュー検索）、[#204](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/pull/204)（接客設定）がopen。

これらを未統合のまま本worktreeへ取り込まない。実装着手時にstagingの統合状態と公開propsを再確認する。条件UIの挿入位置、エラーpath、draft全体保存は競合候補。画像の選択・名称編集・公開承認フローの実装を本Issueで複製しない。現段階では既存PRを実依存としてblockedにする根拠はない。

## 実装順と検証

1. v1/v2入力、同値変換、解析上限、共通評価、JSON Schema出力を確立する。
2. draftのdowngrade拒否・公開再検証・過去データ復元と、注文のconditionIssuesを接続する。
3. GUI・音声結果、管理画面の補完・木の操作・API試行・日英要約を接続する。
4. 下記の実Binding・ブラウザー・代表E2Eを実行し、製品・MCP・UI仕様を更新する。

1 Issue・1 branch・1 PRを基本とし、実装前半を独立した未完成機能として公開しない。

| 層・既存入口                                                                  | 保証すること                                                                                                                                                                                            |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API Vitest unit / `test/pricing.test.ts`                                      | 真理値表、X未選択、NOT単一子、AND/ORの旧配列同値性、数量・min/max・single/multiple/quantity・売切・プランとの併用。小さな選択集合では全組合せをテストで列挙して同値性を確認する。                       |
| API schema / Vitest                                                           | 深さ・節数の境界と超過、空グループ、余分なkey、自己・他商品・参照切れ、相互参照、矛盾例。MCP JSON Schemaが生成でき、同じ有効／無効入力を扱う。                                                          |
| Workers実D1 / `test/configuration.test.ts`                                    | 旧draft/release読取り、無書込み、v1→v2保存、v2→v1保存拒否、旧draft公開拒否、版競合、他店舗・権限、validate→publishの同じ構造判定。                                                                      |
| Workers実D1 / `test/orders.test.ts`                                           | 不足を保持→選び直し→確認→明示承認、禁止時の無変更、古い確認の失効、公開で条件変更後の再検証、過去snapshotの不変。                                                                                       |
| MCP / `test/mcp.test.ts`・音声既存境界試験                                    | 設定取得→保存→検証は共通service。音声投影がOR/NOTを全件必須と誤表示せず、GUIと同じ可否・金額を受け取る。実モデルを呼ばずtool結果で確認する。                                                            |
| Web Vitest Browser / 隣接Story・browser test                                  | `A AND (B OR NOT C)`の作成・切替・削除、同名補完、参照切れ、エラー位置、失敗時の入力保持、focus、日英、iPad相当の縦横。                                                                                 |
| Playwright / `e2e/tablecast-configuration.spec.ts`・`tablecast-order.spec.ts` | 保存→再読込→検証→人の公開→客の未充足→修正→注文という代表経路。旧UIの結果型変更による既存行の二重追加も防ぐ。                                                                                            |
| 最大fixture / Workers                                                         | 多グループ・最大条件数・多数行での実API総時間、DB往復、応答byte数を記録。条件参照ごとのDB問合せが増えないことと、価格・可否が正しいことを確認する。時間予算は実測して設定し、超過を上限緩和で隠さない。 |

## 実装前に残る確認

- 形式unionの実schemaへの組込みと型推論。既存ModifiersEditorは `optionSchema.shape.imageKind` を参照するため、optionSchemaをunionに置換するだけでは破綻する。共通の画像schemaを公開する等、公開入口とconsumerを同時に調整する。configurationSchema.shapeの直接利用は検索範囲では見つからなかった。
- Base UI 1.8.0のComboboxでのiPadのfocus挙動。導入済み型定義で `itemToStringLabel`、`isItemEqualToValue`、`onValueChange` とGroup／Empty／Statusの公開を確認したが、実ブラウザーでの操作は未検証。
- 条件数上限・レスポンス量の妥当性。式を省略する場合の対象取得契約。
- v2作成開始・rollback・旧画面更新の運用。保存形式の変更は移行テストを通すまで確定仕様にしない。

公式資料: [Zodの再帰object](https://zod.dev/api#recursive-objects)、[JSON Schema変換](https://zod.dev/json-schema)、[Base UI Combobox](https://base-ui.com/react/components/combobox)。標準schema／補完部品を採用する根拠として確認した。対象版の動作検証とは区別する。

## 今回の確認記録

コードと仕様、既存テスト、Issueの担当・関連PRを調査した。runtime実装・実DB変更・公開・有料モデル呼出しは行っていない。

- Bun 1.3.13で `bun install --frozen-lockfile` が成功し、worktreeの依存とlefthookを導入した。lockfile差分はない。最初の環境制約と承認審査タイムアウト後の再試行で成功した。
- 対象SHAの `bun run --cwd apps/api test --project unit` は1ファイル・16テスト成功。既存価格・選択制約のベースラインであり、新条件の実装成功を表さない。
- Zod 4.5.4の一時検証 `/private/tmp/tablecast-176-schema-probe.mjs` で、ネスト例のparse、空AND・不正NOT・余分なkeyの拒否、再帰 `$ref` を含むJSON Schema出力（1,007 bytes）を確認した。3変数8通りの真理値と、旧配列変換16通りの同値性も確認した。これは提案型の小さな実証であり、最終configuration全体・MCPクライアント・深さ制限の検証ではない。
- Oxfmtで本書を整形し、相対リンクと参照ソースの存在を確認する。API/Webの全lint・型検査、Workers実DB、Browser／E2E、新方式の負荷・実機検証は実装前のため未実施。
- 担当はkouichi310、Project StatusはIn progress。Priorityは既存Projectに選択肢がないことを再確認し、Issue本文のp1-normal評価を維持する。共有Projectの選択肢は変更していない。
