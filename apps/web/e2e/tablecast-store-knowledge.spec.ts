import { expect } from "@playwright/test";
import { configDraftSchema } from "@tablecast/api/schema";
import ja from "../messages/ja.json" with { type: "json" };
import { signInStaff } from "./support/session";
import { test } from "./support/test";

test.use({ trace: "off", serviceWorkers: "block" });

test("実店舗DBの資料をツリーで開き、画像とコードを表示して手動編集を保存・再読込する", async ({
  page,
  baseURL,
}, testInfo) => {
  const storeId = "tablecast-komorebi";
  await page.emulateMedia({ reducedMotion: "reduce" });
  const api = `/api/admin/stores/${storeId}`;
  await signInStaff(page.request, baseURL);
  const response = await page.request.post(`${api}/drafts`, { headers: { Origin: baseURL ?? "" } });
  expect(response.ok()).toBe(true);
  const draft = configDraftSchema.parse(await response.json());
  await page.goto(`/admin/stores/${storeId}/menu/changes/${draft.id}/cast/settings#knowledge`);
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  const knowledge = page.locator("#store-knowledge");
  await expect(knowledge.getByRole("tree", { name: ja.knowledge_files })).toBeVisible();
  await knowledge.evaluate((element) =>
    element.scrollIntoView({ block: "start", behavior: "instant" }),
  );
  await knowledge.getByRole("treeitem", { name: "SKILL.md", exact: true }).click();
  await expect(knowledge.locator("pre")).toContainText("references/");
  await knowledge.getByRole("treeitem", { name: "dining.md", exact: true }).click();
  const image = knowledge.getByRole("img", {
    name: "お造り三種盛り / Three-fish sashimi selection",
    exact: true,
  });
  await expect(image).toBeVisible();
  await expect(image).toHaveJSProperty("complete", true);
  await expect(image).not.toHaveJSProperty("naturalWidth", 0);
  for (const viewport of [
    { width: 1512, height: 982 },
    { width: 1180, height: 820 },
    { width: 402, height: 874 },
  ]) {
    await page.setViewportSize(viewport);
    await knowledge.evaluate((element) =>
      element.scrollIntoView({ block: "start", behavior: "instant" }),
    );
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.mouse.move(0, 0);
    await expect(knowledge.getByRole("tabpanel")).toHaveCSS("opacity", "1");
    if (viewport.width < 768) await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveJSProperty("complete", true);
    await image.evaluate(async (element) => {
      if (element instanceof HTMLImageElement) await element.decode();
    });
    await page.screenshot({
      path: testInfo.outputPath(`tablecast-knowledge-${viewport.width}.png`),
    });
  }
  await page.setViewportSize({ width: 1512, height: 982 });
  await knowledge.getByRole("treeitem", { name: "SKILL.md", exact: true }).click();
  await knowledge.evaluate((element) =>
    element.scrollIntoView({ block: "start", behavior: "instant" }),
  );
  await page.mouse.move(0, 0);
  await expect(knowledge.getByRole("tabpanel")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("tablecast-knowledge-code.png") });
  await knowledge.getByRole("treeitem", { name: "visit.md", exact: true }).click();
  await knowledge.getByRole("tab", { name: ja.knowledge_edit_file, exact: true }).click();
  const source = knowledge.getByRole("textbox", { name: ja.knowledge_content, exact: true });
  const original = await source.inputValue();
  const updated = `${original}\n\n## 店長からの案内\n雨の日は傘のお取り違えにお気を付けください。\n`;
  await source.fill(updated);
  await knowledge.evaluate((element) =>
    element.scrollIntoView({ block: "start", behavior: "instant" }),
  );
  await page.mouse.move(0, 0);
  await expect(knowledge.getByRole("tabpanel")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("tablecast-knowledge-edit.png") });
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: ja.account_saved })).toBeVisible();
  await page.reload();
  await knowledge.getByRole("treeitem", { name: "visit.md", exact: true }).click();
  await knowledge.getByRole("tab", { name: ja.knowledge_edit_file, exact: true }).click();
  await expect(source).toHaveValue(updated);
  await knowledge.getByRole("tab", { name: ja.prompt_preview, exact: true }).click();
  await expect(
    knowledge.getByRole("heading", { name: "店長からの案内", exact: true }),
  ).toBeVisible();
});
