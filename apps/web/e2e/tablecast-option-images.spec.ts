import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { catalogSchema, configDraftSchema, uploadedImageSchema } from "@tablecast/api/schema";
import { test } from "./support/test";
import { credentials } from "./support/runtime";
import ja from "../messages/ja.json" with { type: "json" };

test.use({ trace: "off" });

test("画面で取り込んだ商品画像を保存し、開き直した下書きでも実画像を配信する", async ({
  page,
  baseURL,
}) => {
  const api = "/api/admin/stores/tablecast-komorebi";
  const headers = { Origin: baseURL ?? "" };
  expect(
    (await page.request.post("/api/auth/sign-in/email", { headers, data: credentials })).ok(),
  ).toBe(true);
  const original = catalogSchema.parse(await (await page.request.get(`${api}/catalog`)).json());
  const product = original.configuration.products.find((item) => item.available);
  if (!product) throw new Error("画像設定の対象商品が必要です");
  const draft = configDraftSchema.parse(
    await (await page.request.post(`${api}/drafts`, { headers })).json(),
  );
  await page.goto(
    `/admin/stores/tablecast-komorebi/menu/changes/${draft.id}/products/${product.id}`,
  );
  const field = page.getByRole("group", { name: ja.editor_image_settings, exact: true }).first();
  const buffer = await readFile(new URL("../public/brand/tablecast-logo.png", import.meta.url));
  await field
    .getByLabel(ja.editor_image_replace)
    .setInputFiles({ name: "tablecast-logo.png", mimeType: "image/png", buffer });
  await field.getByRole("combobox", { name: ja.editor_image_kind }).selectOption("illustration");
  await field
    .getByRole("textbox", { name: ja.editor_image_source, exact: true })
    .fill("画像配線の検証用ロゴ");
  const uploadFinished = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `${api}/images` &&
      response.request().method() === "POST",
  );
  await field.getByRole("button", { name: ja.editor_image_upload }).click();
  const uploadResponse = await uploadFinished;
  expect(uploadResponse.ok()).toBe(true);
  const uploaded = uploadedImageSchema.parse(await uploadResponse.json());
  expect(uploaded.imageKey).not.toBe(product.imageKey);
  await expect(
    field.getByRole("status").filter({ hasText: ja.editor_image_uploaded }),
  ).toBeVisible();
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: ja.account_saved })).toBeVisible();
  const saved = configDraftSchema.parse(
    await (await page.request.get(`${api}/drafts/${draft.id}`)).json(),
  );
  expect(saved.configuration.products.find((item) => item.id === product.id)?.imageKey).toBe(
    uploaded.imageKey,
  );
  await page.reload();
  const image = field.getByRole("img", { name: ja.editor_image_current });
  await expect(image).toBeVisible();
  expect(new URL((await image.getAttribute("src")) ?? "", baseURL).pathname).toBe(
    `/media/${uploaded.imageKey}`,
  );
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0),
    )
    .toBe(true);
});
