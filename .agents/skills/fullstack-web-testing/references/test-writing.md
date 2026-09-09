# コードと命名

## 名前と配置

- `describe` は対象機能・規則、`test` / `it` は「前提で、操作すると、結果になる」を自然な一文で書く。
- 日本語のtitle、eachのlabel、Storybookのstep、説明コメントは常体・文末句読点なしにする。Given / When / Thenは英語の構造ラベルとして残す。
- `works`、`正常系`、`エラーになる`だけで済ませない。失敗時に何の保証が壊れたか分かる名前にする。
- export、fixture関数、protocol field、実UIのlabelは勝手に翻訳しない。
- unit/componentのtestとstoryは既存規約に従って対象の近くへ置く。複数境界を結ぶ統合・E2Eはそれを所有するapp/packageに置く。拡張子だけでレイヤーを判定しない。

## Given / When / Then

シナリオ固有の状態をGivenへ残し、共通の起動・cleanupだけhookやfixtureへ移す。Whenは一つの利用者意図とし、それを実現する複数clickは許容する。Thenはpublic resultを観測し、private methodや内部call順で代用しない。

短い呼出しとassertionだけならコメントを強制しない。長いsetupや非同期状態がある場合は構造コメント、Storybook/Playwrightのstepで意味の境界を示す。AAAとの対応はArrange=Given、Act=When、Assert=Thenと考え、両方のラベルを重ねない。

以下は書き方の例。import先、API、UI名は説明用であり、対象の本番公開APIと既存fixtureへ置き換える。サンプルに合わせて本番層やhelperを新設しない。

## Vitest: 意味のある境界表

```ts
import { expect, test } from "vitest";
import { acceptsAttachmentSize } from "./attachment-policy";

// 契約の上限は20 MB、1 byte以上とする例
const cases = [
  { label: "空ファイル", bytes: 0, accepted: false },
  { label: "最小サイズ", bytes: 1, accepted: true },
  { label: "上限直前", bytes: 19_999_999, accepted: true },
  { label: "上限", bytes: 20_000_000, accepted: true },
  { label: "上限超過", bytes: 20_000_001, accepted: false },
];

test.each(cases)("$labelの添付サイズを判定する", ({ bytes, accepted }) => {
  expect(acceptsAttachmentSize(bytes)).toBe(accepted);
});
```

これは独自の添付規則の例である。採用ライブラリの一般的なmin/max実装を再検査するために同じ表を作らない。名前やThenで「ファイルを保存する」と主張するなら実保存境界まで観測する。

## Vitest: 原子的な結果

```ts
import { expect, test } from "vitest";
import { createIssueTestContext } from "./test-support";

// contextは実DB・本番migration・本番サービスを使う前提の例
test("監査の保存が失敗するとIssue更新も取り消す", async () => {
  const context = await createIssueTestContext();
  try {
    // Given: 更新可能なIssueがあり、実transaction内の監査保存で失敗する
    const issue = await context.seedEditableIssue({ title: "変更前" });
    await context.rejectAuditInsert();

    // When: Issueを更新する
    const update = context.updateIssue(issue.id, { title: "変更後" });

    // Then: 更新は失敗し、同じtransactionの結果が残らない
    await expect(update).rejects.toThrow();
    expect(await context.readIssue(issue.id)).toMatchObject({ title: "変更前" });
    expect(await context.readAuditFor(issue.id)).toEqual([]);
  } finally {
    await context.dispose();
  }
});
```

このhelperは説明上の名前である。実装する場合は、前半の更新が実行される位置と後半の失敗点を確認し、本番transactionの途中で故障を注入する。処理開始前のmock例外だけではrollbackの証明にならない。既存のrunner fixtureがあれば起動とdisposeはそれへ移す。

## Storybook: keyboardとfocus

以下は既存storyへ付ける `play` の例。対象版のCSF形式を維持し、例のためだけにCSFを移行しない。

```ts
import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { IssueEditor } from "./issue-editor";

const play: NonNullable<StoryObj<typeof IssueEditor>["play"]> = async ({
  canvas,
  canvasElement,
  step,
}) => {
  const trigger = canvas.getByRole("button", { name: "編集" });
  const body = within(canvasElement.ownerDocument.body);

  await step("When: 編集ダイアログを開いて閉じる", async () => {
    await userEvent.click(trigger);
    await body.findByRole("dialog", { name: "Issueを編集" });
    await userEvent.keyboard("{Escape}");
  });

  await step("Then: 編集ボタンへフォーカスが戻る", async () => {
    await waitFor(() => {
      expect(trigger).toHaveFocus();
      expect(body.queryByRole("dialog", { name: "Issueを編集" })).not.toBeInTheDocument();
    });
  });
};
```

本番では既存のstory型やcontextual typingを使い、選択したframework用packageに合わせる。portalはcanvasのdocumentから探す。表示やfocusは非同期に落ち着く状態として待つ。

## Playwright: 実routeの意味

```ts
import { expect, test } from "@playwright/test";

test("検索条件を変えて戻るとURLと検索欄が前の条件へ戻る", async ({ page }) => {
  // Given: 実appの検索ルートで最初の条件を表示する
  await page.goto("/issues?q=alpha");
  const search = page.getByRole("searchbox", { name: "Issueを検索" });
  await expect(search).toHaveValue("alpha");

  // When: 別の条件で検索してブラウザー履歴を戻る
  await search.fill("beta");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/issues\?q=beta$/);
  await page.goBack();

  // Then: URLと画面の条件が一致する
  await expect(page).toHaveURL(/\/issues\?q=alpha$/);
  await expect(search).toHaveValue("alpha");
});
```

検索語の全境界は低い層で扱い、このテストは履歴とroute状態の接続を所有する。ログインが前提ならfixtureで提供し、ログインそのものを検査するjourneyは別に置く。
