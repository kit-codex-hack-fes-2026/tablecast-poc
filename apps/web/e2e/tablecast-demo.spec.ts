import { expect } from "@playwright/test";
import {
  adminStateSchema,
  configDraftSchema,
  demoSchema,
  tableStateSchema,
} from "@tablecast/api/schema";
import { test } from "./support/test";
import { credentials } from "./support/runtime";
import ja from "../messages/ja.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };

test.use({ trace: "off" });
for (const labels of [ja, en]) {
  test(`デモを新規タブで開き下書き注文・端末表示・設定保持・リセットを確認する ${labels.demo_title}`, async ({
    page,
  }, testInfo) => {
    const storeId = "tablecast-komorebi";
    const adminPath = `/api/admin/stores/${storeId}`;
    await page.goto(`/login?returnTo=${encodeURIComponent(`/admin/stores/${storeId}/floor`)}`);
    await page
      .getByRole("button", { name: labels === ja ? "日本語" : "English", exact: true })
      .click();
    await page.getByLabel(labels.auth_email).fill(credentials.email);
    await page.getByLabel(labels.auth_password, { exact: true }).fill(credentials.password);
    await page.getByRole("button", { name: labels.auth_sign_in, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/stores/${storeId}/floor$`));
    const draft = configDraftSchema.parse(
      await (await page.request.post(`${adminPath}/drafts`)).json(),
    );
    const original = draft.configuration.products.find((product) => product.available);
    if (!original) throw new Error("デモ試験の商品が必要です");
    const name = labels === ja ? "デモ限定ほうじ茶" : "Demo-only roasted tea";
    const configuration = {
      ...draft.configuration,
      products: [
        {
          ...original,
          price: 1234,
          modifiers: [],
          text: {
            ja: { ...original.text.ja, displayName: name },
            en: { ...original.text.en, displayName: name },
          },
        },
      ],
      plans: [],
    };
    const saved = await page.request.put(`${adminPath}/drafts/${draft.id}`, {
      data: { expectedVersion: draft.version, configuration },
    });
    expect(saved.ok()).toBe(true);
    const savedDraft = configDraftSchema.parse(await saved.json());
    const invalid = configDraftSchema.parse(
      await (await page.request.post(`${adminPath}/drafts`)).json(),
    );
    const invalidSaved = await page.request.put(`${adminPath}/drafts/${invalid.id}`, {
      data: {
        expectedVersion: invalid.version,
        configuration: {
          ...configuration,
          products: configuration.products.map((product) => ({
            ...product,
            categoryId: "tablecast-missing-category",
            text: {
              ja: {
                ...product.text.ja,
                displayName: "商品名が長い場合の表示を確認するほうじ茶".repeat(4),
              },
              en: {
                ...product.text.en,
                displayName:
                  "Roasted tea with a long name for checking the validation message layout",
              },
            },
          })),
        },
      },
    });
    expect(invalidSaved.ok()).toBe(true);
    const opened = page.waitForEvent("popup");
    await page.getByRole("link", { name: labels.demo_open, exact: true }).click();
    const demoPage = await opened;
    await expect(demoPage).toHaveURL(/demo\?demoId=/);
    const demoId = new URL(demoPage.url()).searchParams.get("demoId");
    if (!demoId) throw new Error("デモIDがありません");
    const demoPath = `${adminPath}/demo/${demoId}`;
    await expect(demoPage.getByRole("heading", { name: labels.demo_title })).toBeAttached();
    await expect(demoPage.getByRole("combobox", { name: labels.demo_display })).toContainText(
      "iPad",
    );
    await expect(demoPage.getByRole("button", { name: labels.demo_reload })).toBeDisabled();
    // 公開版の更新も通知だけを行い、明示操作まで固定する。
    const publication = configDraftSchema.parse(
      await (await page.request.post(`${adminPath}/drafts`)).json(),
    );
    const validated = await page.request.post(`${adminPath}/drafts/${publication.id}/validate`, {
      data: { expectedVersion: publication.version },
    });
    expect(validated.ok()).toBe(true);
    const published = await page.request.post(`${adminPath}/drafts/${publication.id}/publish`, {
      data: {
        expectedVersion: publication.version,
        baseVersion: publication.baseVersion,
        idempotencyKey: `tablecast-demo-publication-${publication.id}`,
        approved: true,
      },
    });
    expect(published.ok()).toBe(true);
    await expect(demoPage.getByRole("button", { name: labels.demo_reload })).toBeEnabled();
    expect(
      demoSchema.parse(await (await demoPage.request.get(demoPath)).json()).sourceVersion,
    ).toBe(publication.baseVersion);
    await demoPage.getByRole("button", { name: labels.demo_reload }).click();
    await expect
      .poll(
        async () =>
          demoSchema.parse(await (await demoPage.request.get(demoPath)).json()).sourceVersion,
      )
      .toBe(publication.baseVersion + 1);
    await expect(demoPage.getByRole("button", { name: labels.demo_reload })).toBeDisabled();
    const before = adminStateSchema.parse(await (await page.request.get(adminPath)).json());
    await demoPage.getByRole("combobox", { name: labels.demo_configuration }).click();
    await demoPage.getByRole("option", { name: new RegExp(invalid.id.slice(0, 8)) }).click();
    await expect(demoPage.getByRole("list", { name: labels.config_error_list })).toContainText(
      labels.config_error_category_missing,
    );
    await expect(demoPage.getByRole("combobox", { name: labels.demo_configuration })).toContainText(
      labels.demo_published,
    );
    await demoPage.getByRole("combobox", { name: labels.demo_configuration }).click();
    await demoPage.getByRole("option", { name: new RegExp(draft.id.slice(0, 8)) }).click();
    const frame = demoPage.frameLocator("iframe");
    await frame
      .getByRole("button", { name: labels === ja ? "日本語" : "English", exact: true })
      .click();
    await expect(
      frame.getByRole("button", { name: labels === ja ? "日本語" : "English", exact: true }),
    ).toBeEnabled();
    await expect(frame.getByRole("tab", { name: labels.kiosk_menu, exact: true })).toBeVisible();
    await frame
      .getByRole("button")
      .filter({ has: frame.getByText(name, { exact: true }) })
      .click();
    await frame.getByRole("button", { name: labels.kiosk_add, exact: true }).click();
    await frame.getByRole("button", { name: labels.kiosk_review, exact: true }).click();
    await frame.getByRole("button", { name: labels.kiosk_confirm, exact: true }).click();
    await expect(frame.getByText(labels.kiosk_ordered, { exact: true })).toBeVisible();
    await frame.getByRole("button", { name: labels.common_close, exact: true }).click();
    await frame.getByRole("tab", { name: labels.kiosk_bill, exact: true }).click();
    const state = tableStateSchema.parse(
      await (await demoPage.request.get(`${demoPath}/table`)).json(),
    );
    expect(state.orders).toHaveLength(1);
    expect(state.bill.due).toBe(1234);
    expect(state.tableId).toBeNull();
    const child = demoPage.frames().find((item) => item.parentFrame());
    if (!child) throw new Error("iframeがありません");
    await child.evaluate(() => {
      document.body.dataset.tablecastDemoMarker = "retained";
    });
    // 下書きが別タブで変更されても取り込み済みの注文は保ち、再読込を知らせる。
    await expect(demoPage.getByRole("button", { name: labels.demo_reload })).toBeDisabled();
    const changed = await page.request.put(`${adminPath}/drafts/${draft.id}`, {
      data: {
        expectedVersion: savedDraft.version,
        configuration: {
          ...configuration,
          products: configuration.products.map((product) => ({ ...product, price: 1500 })),
        },
      },
    });
    expect(changed.ok()).toBe(true);
    await expect(demoPage.getByRole("button", { name: labels.demo_reload })).toBeEnabled({
      timeout: 15000,
    });
    await expect(demoPage.getByRole("status")).toContainText(labels.demo_update_available);
    await expect(demoPage.getByRole("button", { name: labels.demo_reload })).toHaveAttribute(
      "data-variant",
      "default",
    );
    expect(
      demoSchema.parse(await (await demoPage.request.get(demoPath)).json()).sourceVersion,
    ).toBe(savedDraft.version);
    await demoPage.screenshot({ path: testInfo.outputPath("tablecast-demo-update.png") });
    await demoPage.getByRole("button", { name: labels.demo_reload }).click();
    await expect(demoPage.getByRole("button", { name: labels.demo_reload })).toBeDisabled();
    await expect
      .poll(
        async () =>
          demoSchema.parse(await (await demoPage.request.get(demoPath)).json()).sourceVersion,
      )
      .toBe(savedDraft.version + 1);
    expect(
      tableStateSchema.parse(await (await demoPage.request.get(`${demoPath}/table`)).json()).orders,
    ).toEqual(state.orders);
    await demoPage.getByRole("combobox", { name: labels.demo_display }).click();
    await demoPage.getByRole("option", { name: labels.demo_browser, exact: true }).click();
    await demoPage.screenshot({ path: testInfo.outputPath("tablecast-demo-browser.png") });
    await demoPage.getByRole("combobox", { name: labels.demo_display }).click();
    await demoPage.getByRole("option", { name: "iPad Air 11″", exact: true }).click();
    await expect.poll(() => child.evaluate(() => [innerWidth, innerHeight])).toEqual([1180, 820]);
    await demoPage.screenshot({ path: testInfo.outputPath("tablecast-demo-landscape.png") });
    await demoPage.getByRole("button", { name: labels.demo_rotate }).click();
    await expect.poll(() => child.evaluate(() => [innerWidth, innerHeight])).toEqual([820, 1180]);
    expect(await child.evaluate(() => document.body.dataset.tablecastDemoMarker)).toBe("retained");
    await demoPage.screenshot({ path: testInfo.outputPath("tablecast-demo-portrait.png") });
    await demoPage.getByRole("combobox", { name: labels.demo_display }).click();
    await demoPage.getByRole("option", { name: "iPad Air 13″", exact: true }).click();
    await expect.poll(() => child.evaluate(() => [innerWidth, innerHeight])).toEqual([1024, 1366]);
    expect(await child.evaluate(() => document.body.dataset.tablecastDemoMarker)).toBe("retained");
    await demoPage.screenshot({ path: testInfo.outputPath("tablecast-demo-air-13.png") });
    const toolbar = demoPage.getByTestId("demo-toolbar");
    for (const label of [
      labels.demo_rotate,
      labels.demo_reload,
      labels.demo_proactive,
      labels.demo_reset,
    ]) {
      await expect(toolbar.getByRole("button", { name: label, exact: true })).toContainText(label);
    }
    for (const label of [
      labels.demo_display,
      labels.demo_configuration,
      labels.demo_plan,
      labels.demo_guests,
    ]) {
      await expect(toolbar.getByRole("combobox", { name: label })).toContainText(label);
    }
    expect(await toolbar.evaluate((element) => element.scrollHeight)).toBeLessThanOrEqual(70);
    await demoPage.getByRole("combobox", { name: labels.demo_guests }).focus();
    await demoPage.keyboard.press("ArrowDown");
    await expect(demoPage.getByRole("option", { name: "1", exact: true })).toBeFocused();
    await demoPage.keyboard.press("Home");
    await demoPage.keyboard.press("ArrowDown");
    await expect(demoPage.getByRole("option", { name: "2", exact: true })).toBeFocused();
    await demoPage.keyboard.press("ArrowDown");
    await expect(demoPage.getByRole("option", { name: "3", exact: true })).toBeFocused();
    await demoPage.keyboard.press("Enter");
    await expect
      .poll(
        async () =>
          demoSchema.parse(await (await demoPage.request.get(demoPath)).json()).guestCount,
      )
      .toBe(3);
    expect(
      tableStateSchema.parse(await (await demoPage.request.get(`${demoPath}/table`)).json()).orders,
    ).toEqual(state.orders);
    await demoPage.reload();
    await expect(demoPage.getByRole("combobox", { name: labels.demo_guests })).toContainText("3");
    await expect(demoPage.getByRole("button", { name: labels.demo_rotate })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await demoPage.getByRole("button", { name: labels.demo_reset, exact: true }).click();
    await demoPage
      .getByRole("alertdialog")
      .getByRole("button", { name: labels.demo_reset, exact: true })
      .click();
    await expect
      .poll(
        async () =>
          tableStateSchema.parse(await (await demoPage.request.get(`${demoPath}/table`)).json())
            .orders.length,
      )
      .toBe(0);
    const after = adminStateSchema.parse(await (await page.request.get(adminPath)).json());
    expect(after.tables).toEqual(before.tables);
    expect(after.vacantTables).toEqual(before.vacantTables);
    const reopened = page.waitForEvent("popup");
    await page.getByRole("link", { name: labels.demo_open, exact: true }).click();
    const independent = await reopened;
    await expect(independent).toHaveURL(/demo\?demoId=/);
    expect(new URL(independent.url()).searchParams.get("demoId")).not.toBe(demoId);
    await independent.close();
    await demoPage.close();
  });
}
