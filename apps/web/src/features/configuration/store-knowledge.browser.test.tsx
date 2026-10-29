import type { Locale } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { catalog } from "../../../.storybook/tablecast-fixtures";
import ja from "../../../messages/ja.json";
import { ImageProvider } from "../../components/image-provider";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { StoreKnowledge } from "./store-knowledge";

afterEach(async () => {
  await cleanup();
  await page.viewport(1280, 720);
});
function Fixture({ locale, editable = true }: { editable?: boolean; locale: Locale }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
  );
  const [skills, setSkills] = useState(catalog.configuration.cast.skills ?? []);
  return (
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <ImageProvider
          basePath={`/api/admin/stores/${catalog.storeId}`}
          assets={catalog.imageAssets}
        >
          <main className="mx-auto max-w-5xl p-4">
            <StoreKnowledge
              storeId={catalog.storeId}
              value={skills}
              onChange={editable ? setSkills : undefined}
            />
          </main>
        </ImageProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}

it.each([
  { locale: "ja", width: 1280 },
  { locale: "en", width: 390 },
] as const)(
  "$locale・幅$widthで資料を選び、編集とプレビュー切替後も原文を保持する",
  async ({ locale, width }) => {
    await page.viewport(width, 900);
    await render(<Fixture locale={locale} />);
    await page.getByRole("treeitem", { name: "visit.md", exact: true }).click();
    await expect
      .element(
        page.getByRole("heading", {
          name: "営業時間・アクセス / Opening hours and access",
          exact: true,
        }),
      )
      .toBeVisible();
    await page.getByRole("tab", { name: locale === "ja" ? "原文" : "Source", exact: true }).click();
    const input = page.getByRole("textbox", {
      name: locale === "ja" ? "ファイルの原文" : "File source",
      exact: true,
    });
    const content =
      "# 更新した営業時間 / Updated hours\n\n17:00–23:00\n\n<script>window.tablecastUnsafe = true</script>\n[リンク](https://example.test/private)\n![外部画像](https://example.test/image.png)";
    await input.fill(content);
    await page
      .getByRole("tab", { name: locale === "ja" ? "プレビュー" : "Preview", exact: true })
      .click();
    await expect
      .element(page.getByRole("heading", { name: "更新した営業時間 / Updated hours", exact: true }))
      .toBeVisible();
    await expect.element(page.getByRole("status").filter({ hasText: "外部画像" })).toBeVisible();
    expect(document.querySelector('a[href="https://example.test/private"]')).not.toBeNull();
    expect(document.querySelector("script")?.textContent).not.toContain("tablecastUnsafe");
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    await page.getByRole("treeitem", { name: "SKILL.md", exact: true }).click();
    await page.getByRole("treeitem", { name: "visit.md", exact: true }).click();
    await page.getByRole("tab", { name: locale === "ja" ? "原文" : "Source", exact: true }).click();
    await expect.element(input).toHaveValue(content);
  },
);

it("公開資料の表示は編集操作を持たず、こもれびの参照ファイルを表示する", async () => {
  await page.viewport(1280, 1000);
  await render(<Fixture locale="ja" editable={false} />);
  await expect.element(page.getByRole("treeitem", { name: "sake.md", exact: true })).toBeVisible();
  await page.getByRole("treeitem", { name: "sake.md", exact: true }).click();
  await expect
    .element(
      page.getByRole("heading", {
        name: "日本酒・温度・ペアリング / Sake and pairings",
        exact: true,
      }),
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Skillを追加", exact: true }))
    .not.toBeInTheDocument();
  await page.getByRole("treeitem", { name: "visit.md", exact: true }).click();
});

it("資料追加と削除で必須のSKILL.mdを保つ", async () => {
  await render(<Fixture locale="ja" />);
  await page.getByRole("button", { name: "Skillを追加", exact: true }).click();
  await page.getByRole("button", { name: "ファイルを追加", exact: true }).click();
  await page.getByRole("tab", { name: "原文", exact: true }).click();
  const content = page.getByRole("textbox", { name: "ファイルの原文", exact: true });
  await content.fill("# 新しい資料");
  await page.getByRole("button", { name: "ファイルを削除", exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: "ファイルを削除", exact: true }))
    .toBeDisabled();
  await page.getByRole("button", { name: "Skillを削除", exact: true }).click();
  await expect.element(page.getByRole("treeitem", { name: "sake.md", exact: true })).toBeVisible();
});

it("階層フォルダーを開閉し、相対画像・コードブロック・参照リンクを表示する", async () => {
  await render(<Fixture locale="ja" />);
  await expect
    .element(page.getByRole("treeitem", { name: "SKILL.md", exact: true }))
    .toHaveAttribute("aria-selected", "true");
  await expect
    .element(page.getByRole("button", { name: "コードをコピー", exact: true }))
    .toBeVisible();
  await page.getByRole("treeitem", { name: "references", exact: true }).click();
  await expect
    .element(page.getByRole("treeitem", { name: "visit.md", exact: true }))
    .not.toBeInTheDocument();
  await userEvent.keyboard("{ArrowRight}{ArrowRight}");
  await expect.element(page.getByRole("treeitem", { name: "visit.md", exact: true })).toHaveFocus();
  await userEvent.keyboard("{ArrowLeft}{End}{Enter}");
  await expect
    .element(page.getByRole("treeitem", { name: "local-area.md", exact: true }))
    .toHaveAttribute("aria-selected", "true");
  await page.getByRole("treeitem", { name: "SKILL.md", exact: true }).click();
  await page
    .getByRole("button", { name: "料理・食事制限 / Dishes and dietary questions", exact: true })
    .click();
  await expect
    .element(
      page.getByRole("img", { name: "お造り三種盛り / Three-fish sashimi selection", exact: true }),
    )
    .toBeVisible();
  expect(
    document
      .querySelector('img[alt="お造り三種盛り / Three-fish sashimi selection"]')
      ?.getAttribute("src"),
  ).toContain("/api/admin/stores/");
  await page.getByRole("treeitem", { name: "sashimi.webp", exact: true }).click();
  await expect
    .element(
      page.getByRole("img", {
        name: "こもれびのお造り三種盛り / Komorebi sashimi selection",
        exact: true,
      }),
    )
    .toBeVisible();
});

it("Tiptapで本文を書式編集し、YAML・相対画像・コードをソースと往復できる", async () => {
  await page.viewport(1512, 1000);
  await render(<Fixture locale="ja" />);
  await page.getByRole("treeitem", { name: "SKILL.md", exact: true }).click();
  await page.getByRole("tab", { name: "原文", exact: true }).click();
  const source = page.getByRole("textbox", { name: "ファイルの原文", exact: true });
  const originalElement = source.element();
  if (!(originalElement instanceof HTMLTextAreaElement))
    throw new Error("原文の入力欄がありません");
  const original = originalElement.value;
  await page.getByRole("tab", { name: "編集", exact: true }).click();
  const body = page.getByRole("textbox", { name: "Markdownのグラフィカル編集", exact: true });
  await expect.element(body).toBeVisible();
  await expect.element(page.getByRole("toolbar", { name: "書式" })).toBeVisible();
  await body.click();
  const selection = window.getSelection();
  selection?.selectAllChildren(body.element());
  selection?.collapseToEnd();
  await userEvent.keyboard("{Enter}店長の追記");
  await page.getByRole("button", { name: "見出し2", exact: true }).click();
  await page.getByRole("tab", { name: "原文", exact: true }).click();
  await expect.element(source).toBeVisible();
  const current = source.element();
  expect(current instanceof HTMLTextAreaElement ? current.value : "").toContain("## 店長の追記");
  expect(current instanceof HTMLTextAreaElement ? current.value.split("---")[1] : undefined).toBe(
    original.split("---")[1],
  );
  await page.getByRole("tab", { name: "編集", exact: true }).click();
  await expect.poll(() => body.element().textContent).toContain("店長の追記");
  await page.getByRole("tab", { name: "プレビュー", exact: true }).click();
  await expect
    .element(page.getByRole("heading", { name: "店長の追記", level: 2, exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "コードをコピー", exact: true }))
    .toBeVisible();
});

it("Skill検査から不備のあるファイルを選択し、改名時はmetadataも更新する", async () => {
  await render(<Fixture locale="ja" />);
  await page.getByRole("button", { name: "Skillを追加", exact: true }).click();
  await page.getByRole("button", { name: "名前を変更", exact: true }).click();
  await page.getByRole("textbox", { name: "Skill名", exact: true }).fill("new-guide");
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await page.getByRole("tab", { name: "原文", exact: true }).click();
  const renamed = page.getByRole("textbox", { name: "ファイルの原文", exact: true }).element();
  expect(renamed instanceof HTMLTextAreaElement ? renamed.value : "").toContain("name: new-guide");
  await page
    .getByRole("textbox", { name: "ファイルの原文", exact: true })
    .fill("---\nname: wrong\ndescription: 店舗資料\n---\n本文");
  await page.getByRole("button", { name: /^Skill検査/ }).click();
  await expect
    .poll(() => page.getByRole("region", { name: "Skill検査", exact: true }).element().textContent)
    .toContain("nameとSkillのIDを一致させてください。");
});
