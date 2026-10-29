import { expect } from "@playwright/test";
import { configDraftSchema } from "@tablecast/api/schema";
import { readFile } from "node:fs/promises";
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
  const visual = knowledge.getByRole("textbox", { name: ja.knowledge_visual_body, exact: true });
  await visual.click();
  await visual.evaluate((element) => {
    const selection = window.getSelection();
    selection?.selectAllChildren(element);
    selection?.collapseToEnd();
  });
  await visual.press("Enter");
  await page.keyboard.insertText("店長からの案内");
  await knowledge.getByRole("button", { name: ja.knowledge_heading2, exact: true }).click();
  await visual.press("End");
  await visual.press("Enter");
  await page.keyboard.insertText("雨の日は傘のお取り違えにお気を付けください。");
  await knowledge.getByRole("tab", { name: ja.knowledge_source, exact: true }).click();
  const source = knowledge.getByRole("textbox", { name: ja.knowledge_content, exact: true });
  const updated = await source.inputValue();
  expect(updated).toContain("## 店長からの案内");
  await knowledge.getByRole("tab", { name: ja.knowledge_edit_file, exact: true }).click();
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
  await knowledge.getByRole("tab", { name: ja.knowledge_source, exact: true }).click();
  await expect(source).toHaveValue(updated);
  await knowledge.getByRole("tab", { name: ja.prompt_preview, exact: true }).click();
  await expect(
    knowledge.getByRole("heading", { name: "店長からの案内", exact: true }),
  ).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await knowledge.getByRole("button", { name: ja.knowledge_export_zip, exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("tablecast-skills.zip");
  const archivePath = testInfo.outputPath("tablecast-skills.zip");
  await download.saveAs(archivePath);
  await knowledge.getByRole("button", { name: ja.knowledge_import_zip, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: ja.knowledge_import_zip, exact: true });
  await dialog.getByLabel(ja.knowledge_archive_file, { exact: true }).setInputFiles(archivePath);
  await dialog.getByRole("checkbox", { name: ja.knowledge_replace_existing, exact: true }).check();
  await dialog.getByRole("button", { name: ja.knowledge_import_zip, exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: ja.account_saved })).toBeVisible();
  await knowledge.getByRole("button", { name: new RegExp(`^${ja.knowledge_lint}`) }).click();
  await expect(
    knowledge.getByRole("region", { name: ja.knowledge_lint, exact: true }),
  ).toContainText(ja.knowledge_lint_pass);
  await page.goto(`/admin/stores/${storeId}/onboarding?draftId=${draft.id}`);
  await expect(page.getByRole("heading", { name: ja.onboarding_title, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: ja.onboarding_open, exact: true })).toHaveCount(9);
  await page.screenshot({ path: testInfo.outputPath("tablecast-onboarding.png") });
});

test("Tiptapから画像を実アップロードして相対参照を挿入し、保存後も表示する", async ({
  page,
  baseURL,
}) => {
  const storeId = "tablecast-komorebi";
  await signInStaff(page.request, baseURL);
  const response = await page.request.post(`/api/admin/stores/${storeId}/drafts`, {
    headers: { Origin: baseURL ?? "" },
  });
  const draft = configDraftSchema.parse(await response.json());
  await page.goto(`/admin/stores/${storeId}/menu/changes/${draft.id}/cast/settings#knowledge`);
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  const knowledge = page.locator("#store-knowledge");
  await knowledge.getByRole("treeitem", { name: "visit.md", exact: true }).click();
  await knowledge.getByRole("tab", { name: ja.knowledge_edit_file, exact: true }).click();
  await knowledge
    .getByRole("toolbar", { name: ja.knowledge_formatting })
    .getByRole("button", { name: ja.knowledge_add_image, exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: ja.knowledge_add_image, exact: true });
  await dialog.getByRole("textbox", { name: ja.theme_alt, exact: true }).fill("画像取込の検証");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "tablecast-seat.png",
    mimeType: "image/png",
    buffer: await readFile(new URL("../public/brand/tablecast-logo.png", import.meta.url)),
  });
  await dialog
    .getByRole("textbox", { name: ja.editor_image_source, exact: true })
    .fill("画像取込テストのfixture");
  await dialog.getByRole("button", { name: ja.editor_image_upload, exact: true }).click();
  await expect(
    dialog.getByRole("status").filter({ hasText: ja.editor_image_uploaded }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: ja.knowledge_add_image, exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(knowledge.getByRole("img", { name: "画像取込の検証", exact: true })).toBeVisible();
  await knowledge.getByRole("tab", { name: ja.knowledge_source, exact: true }).click();
  await expect(
    knowledge.getByRole("textbox", { name: ja.knowledge_content, exact: true }),
  ).toHaveValue(/!\[画像取込の検証\]\(\.\.\/assets\/image-\d+\.webp\)/);
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: ja.account_saved })).toBeVisible();
  await page.reload();
  await knowledge.getByRole("treeitem", { name: "visit.md", exact: true }).click();
  const image = knowledge.getByRole("img", { name: "画像取込の検証", exact: true });
  await expect(image).toBeVisible();
  await expect(image).not.toHaveJSProperty("naturalWidth", 0);
});
