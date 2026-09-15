# カスタマイズ条件の設計（#176）

対象Issue: [#176](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/176)。調査・実装日: 2026-09-15。
専用branchは`codex/176-modifier-conditions`、worktreeは`/private/tmp/tablecast-176-modifier-conditions`。
実装開始時の製品コードは`origin/staging`の`5c16b5e43990eb92655ec9f82c11f033dda06bf0`。PR作成前に動画制作文書だけを追加した最新`9c92644626623d6c18f58adbd52afdedf38e39e4`へ追従した。
フォーム・画像・保存公開・検索・接客設定のPR #199、#201、#202、#203、#204は取り込み済み。
契約の正本は[製品仕様](../product.md)、[MCP仕様](../mcp.md)、[UI仕様](../ui.md)。

## 条件と責務

所有する選択肢をX、同じ行の選択集合をSとする。葉Aは`S.has(A)`。X未選択ならXの条件は適用せず、参照先の条件へ再帰しない。

| 種類     | 成立の意味               | 不成立・禁止時                             |
| -------- | ------------------------ | ------------------------------------------ |
| requires | 式がtrueである必要がある | 未完成カートとして保存し、確認・注文を拒否 |
| excludes | 式がtrueなら禁止する     | 422で反映を拒否、保存中のカートを維持      |
| null     | 制約なし                 | 空AND・ORとは異なる                        |

`X requires A AND (B OR NOT C)`はAとBが選ばれた場合、またはAが選ばれCが選ばれない場合に成立する。ORの全候補を必須にしない。数量0は既存選択schemaが拒否する。

APIの`catalog/conditions.ts`が純粋な評価・参照検証・形式消失検知を所有する。`pricing.ts`を注文・確認・公開後の再検証で共有し、管理試行も同じ評価と価格計算を呼ぶ。ブラウザーは木の編集と日英の表示だけを担当する。独立package・DBテーブル・汎用ルールエンジン・充足可能性ソルバーは追加しない。

## 保存形式と互換性

```ts
type OptionCondition =
  | { kind: "option"; optionId: string }
  | { kind: "and" | "or"; children: OptionCondition[] }
  | { kind: "not"; child: OptionCondition };

// 既存optionへの任意フィールド
conditions?: {
  version: 2;
  requires: OptionCondition | null;
  excludes: OptionCondition | null;
};
```

初期案のconfiguration全体の形式unionから、選択肢ごとの形式に変更した。未編集の旧配列を読み書きし続けられ、既存画像schemaの公開入口や全設定の移行を増やさずに済む。旧requiresはAND、旧excludesはORと同値。編集した選択肢だけ新形式へ変換し、旧配列を空にする。上限超過の旧配列は切り捨てず構造エラーとして表示する。

保存時は同じstore・draft・expectedVersionに結び付く現行JSONを1往復で読み、残る商品・選択肢からconditionsだけが消える場合を拒否する。既存CAS更新は維持する。公開時は既存のカタログ取得結果と比較し、旧draftによる消失も拒否する。選択肢・商品の削除は許可し、明示的な条件解除は`version:2, requires:null, excludes:null`で表す。

既存draft/releaseを一括変換しない。過去注文snapshotの`conditionIssues`は任意フィールドで読み込み互換性を保つ。新条件を保存した後の旧APIへのrollbackには事前の互換移行が必要。

## 解析と計算量

Zodの無限再帰schemaの前に独自walkを足す初期案から、深さごとに有限schemaを構築する方法へ変更した。深さ8では葉だけを許可し、それ以上の入力へ再帰しない。JSON Schemaは深さ別の`$ref`を使い、MCPのschemaを展開増大させない。節数合計はAPIの追加検証となる。

| 単位           | 上限                   |
| -------------- | ---------------------- |
| 深さ（根は1）  | 8                      |
| AND/ORの子     | 2〜8                   |
| 式の節         | 64                     |
| 商品内の節合計 | 1,024                  |
| 設定内の節合計 | 65,536                 |
| カート         | 既存の100行・各100選択 |

自己参照・他商品・参照切れはpath付き検証エラー。同じID集合に対して独立評価するため相互参照を一律に拒否しない。条件評価にDB問合せはなく、設定保存だけが形式保護用の1往復を追加する。

音声の詳細カタログは選択した商品の条件式を返す。カートの音声結果は不足する所有optionIdとrelationを返し、全行へ式や二言語名称を複製しない。モデルは取得済みの詳細カタログを参照する。GUIは`conditionIssues`の式を使い不足を表示する。

## 管理画面と状態

既存の選択肢詳細に検索可能なBase UI ComboboxとAND/OR/NOT編集を挿入する。ID・日英名・グループ名を使った補完、自己参照の無効化、売切・参照切れ、削除後の空・一子グループのエラー、追加・削除後のフォーカスを扱う。参照エディターは詳細を初めて開いた際にマウントする。

入力中の商品と試行用選択を`POST /api/admin/stores/:storeId/conditions/preview`へ送り、管理者認可の下で各節の真偽・適用有無・選択制約エラーを返す。保存・公開しない。プランを含む最終注文可否は実注文で判定する。式や選択を変えたら古い試行結果を隠す。

単一configurationドキュメントを保持する既存ItemFormのTanStack Formは、再帰型のDeepKeys展開で型検査が停止した。このページだけReact stateで初期値・編集中設定・版・状態をまとめ、既存mutation・native form・離脱blockerを再利用した。型castやignoreは追加しない。画像アップロードの同時完了を保持するため、商品・modifierの更新は最新stateへの関数更新に統一した。

## 検証の分担

- API unit: 真理値表8通り、旧新同値性、所有者未選択、構造・深さ・節数、参照、JSON Schema。
- Workers実D1: 保存・公開・版競合・旧形式消失拒否・参照エラー・試行の認可と無書込み・不足修正から確定・過去snapshot。
- MCPと音声tool: 実認可付きの設定往復、有限schema、OR/NOTの伝達、既存注文・音声経路の回帰。
- Web Browser: 日英の木編集・補完・削除・フォーカス・参照切れ・API失敗後の入力保持、既存画像同時アップロード。
- Playwright Chromium/WebKit: 実画面で木を作成→保存→再読込→検証→明示公開→客の未充足行を修正→同じ一行を注文。
- 実HTTP負荷: 商品上限1,024節を1行/100行で選択し、価格・完成状態・DB往復・2秒/450KB予算を確認する。モデル呼出しや実機iPad・WAN遅延は対象外。

検証結果の対象commit・実測値・変更前後画像・配備previewの状態はPRへ集約する。
