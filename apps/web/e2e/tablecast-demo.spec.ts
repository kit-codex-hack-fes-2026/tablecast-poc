import { expect, type Page } from "@playwright/test";
import {
  adminStateSchema,
  configDraftSchema,
  demoSchema,
  tableStateSchema,
  type Configuration,
  type Product,
} from "@tablecast/api/schema";
import { test } from "./support/test";
import { credentials } from "./support/runtime";
import ja from "../messages/ja.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };

const storeId = "tablecast-komorebi";
const adminPath = `/api/admin/stores/${storeId}`;

async function signInManager(page: Page, locale: "ja" | "en") {
  const labels = locale === "ja" ? ja : en;
  await page.goto(`/login?returnTo=${encodeURIComponent(`/admin/stores/${storeId}/floor`)}`);
  await page
    .getByRole("button", { name: locale === "ja" ? "日本語" : "English", exact: true })
    .click();
  await page.getByLabel(labels.auth_email).fill(credentials.email);
  await page.getByLabel(labels.auth_password, { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: labels.auth_sign_in, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/stores/${storeId}/floor$`));
}

test.use({ trace: "off" });
for (const { locale, labels, language, guestLocale, guestLanguage, guestLabels } of [
  {
    locale: "ja",
    labels: ja,
    language: "日本語",
    guestLocale: "en",
    guestLanguage: "English",
    guestLabels: en,
  },
  {
    locale: "en",
    labels: en,
    language: "English",
    guestLocale: "ja",
    guestLanguage: "日本語",
    guestLabels: ja,
  },
] as const) {
  test(`デモの客言語と端末表示を保持し、店側と別タブから独立する ${locale}`, async ({
    page,
  }, testInfo) => {
    // Given: 店側と客の初期言語を揃えた、新規タブのデモ。
    await signInManager(page, locale);
    const opened = page.waitForEvent("popup");
    await page.getByRole("link", { name: labels.demo_open, exact: true }).click();
    const demoPage = await opened;
    await expect(demoPage).toHaveURL(/demo\?demoId=/);
    const demoId = new URL(demoPage.url()).searchParams.get("demoId");
    if (!demoId) throw new Error("デモIDがありません");
    const demoPath = `${adminPath}/demo/${demoId}`;
    const initial = await page.request.patch(`${demoPath}/table/locale`, { data: { locale } });
    expect(initial.ok()).toBe(true);
    expect(tableStateSchema.parse(await initial.json()).locale).toBe(locale);
    const frame = demoPage.frameLocator("iframe");
    await expect(frame.getByRole("button", { name: language, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(frame.getByRole("tab", { name: labels.kiosk_menu, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("link", { name: labels.demo_open, exact: true })).toBeVisible();

    // When: 客が店側とは異なる言語を選び、両方の画面を再読込する。
    const changedLanguage = frame.getByRole("button", { name: guestLanguage, exact: true });
    await changedLanguage.click();
    await expect(changedLanguage).toBeEnabled();
    await expect(changedLanguage).toHaveAttribute("aria-pressed", "true");
    const installHelp = frame.locator("details[data-pwa-install]");
    await expect(installHelp).toHaveCount(1);
    await installHelp.locator("summary").click();
    await expect(installHelp.locator("summary")).toHaveText(guestLabels.pwa_install_title);
    await expect(
      installHelp.getByText(guestLabels.pwa_install_steps, { exact: true }),
    ).toBeVisible();
    await expect(
      installHelp.getByRole("link", { name: guestLabels.pwa_kiosk, exact: true }),
    ).toBeVisible();
    await expect(
      installHelp.getByRole("link", { name: guestLabels.pwa_staff, exact: true }),
    ).toBeVisible();
    await expect(frame.locator("html")).toHaveAttribute("lang", guestLocale);
    await expect(demoPage.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await installHelp.screenshot({ path: testInfo.outputPath("tablecast-demo-pwa-locale.png") });
    await expect(
      frame.getByRole("tab", { name: guestLabels.kiosk_menu, exact: true }),
    ).toBeVisible();
    expect(
      tableStateSchema.parse(await (await page.request.get(`${demoPath}/table`)).json()).locale,
    ).toBe(guestLocale);
    await demoPage.reload();
    await expect(
      frame.getByRole("tab", { name: guestLabels.kiosk_menu, exact: true }),
    ).toBeVisible();
    await expect(frame.getByRole("button", { name: guestLanguage, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.reload();

    // Then: 客の言語だけが変わり、店側の言語Cookieは保持される。
    await expect(installHelp.locator("summary")).toHaveText(guestLabels.pwa_install_title);
    await expect(frame.locator("html")).toHaveAttribute("lang", guestLocale);
    await expect(page.getByRole("link", { name: labels.demo_open, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: language, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(demoPage.getByRole("combobox", { name: labels.demo_display })).toContainText(
      "iPad",
    );
    await demoPage.screenshot({ path: testInfo.outputPath("tablecast-demo-locale-isolation.png") });
    const child = demoPage.frames().find((item) => item.parentFrame());
    if (!child) throw new Error("iframeがありません");
    await child.evaluate(() => {
      document.body.dataset.tablecastDemoMarker = "retained";
    });

    // 実アプリでは表示切替の配線とiframe保持を代表確認し、各端末寸法はBrowser統合で確認する。
    await demoPage.getByRole("combobox", { name: labels.demo_display }).click();
    await demoPage.getByRole("option", { name: labels.demo_browser, exact: true }).click();
    await expect(demoPage.getByRole("button", { name: labels.demo_rotate })).toBeDisabled();
    expect(await child.evaluate(() => document.body.dataset.tablecastDemoMarker)).toBe("retained");
    await demoPage.getByRole("combobox", { name: labels.demo_display }).click();
    await demoPage.getByRole("option", { name: "iPad Air 11″", exact: true }).click();
    await demoPage.getByRole("button", { name: labels.demo_rotate }).click();
    await expect.poll(() => child.evaluate(() => [innerWidth, innerHeight])).toEqual([820, 1180]);
    expect(await child.evaluate(() => document.body.dataset.tablecastDemoMarker)).toBe("retained");
    await demoPage.screenshot({ path: testInfo.outputPath("tablecast-demo-portrait.png") });
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
    await demoPage.reload();
    await expect(demoPage.getByRole("combobox", { name: labels.demo_display })).toContainText(
      "iPad Air 11″",
    );
    await expect(demoPage.getByRole("button", { name: labels.demo_rotate })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      frame.getByRole("tab", { name: guestLabels.kiosk_menu, exact: true }),
    ).toBeVisible();
    const reopened = page.waitForEvent("popup");
    await page.getByRole("link", { name: labels.demo_open, exact: true }).click();
    const independent = await reopened;
    await expect(independent).toHaveURL(/demo\?demoId=/);
    expect(new URL(independent.url()).searchParams.get("demoId")).not.toBe(demoId);
    await independent.close();
    await demoPage.close();
  });

  test(`公開版と下書きを明示反映し、注文を保持してデモだけリセットする ${locale}`, async ({
    page,
  }, testInfo) => {
    // Given: 言語、商品ID、価格、カテゴリを明示した下書きと、不正カテゴリの下書き。
    await signInManager(page, locale);
    const draft = configDraftSchema.parse(
      await (await page.request.post(`${adminPath}/drafts`)).json(),
    );
    const demoProduct: Product = {
      id: "tablecast-demo-roasted-tea",
      categoryId: "tablecast-demo-drinks",
      price: 1234,
      available: true,
      tags: [],
      imageKey: null,
      imageKind: "illustration",
      modifiers: [],
      text: {
        ja: {
          displayName: "デモ限定ほうじ茶",
          speechName: "ほうじ茶",
          description: "",
          aliases: [],
        },
        en: {
          displayName: "Demo-only roasted tea",
          speechName: "Roasted tea",
          description: "",
          aliases: [],
        },
      },
      allergens: {
        contains: [],
        evidence: "unknown",
        crossContact: "unknown",
        vegan: "unknown",
        note: { ja: "", en: "" },
      },
    };
    const configuration: Configuration = {
      ...draft.configuration,
      categories: [
        {
          id: "tablecast-demo-drinks",
          text: {
            ja: { displayName: "飲み物", speechName: "飲み物", description: "", aliases: [] },
            en: { displayName: "Drinks", speechName: "Drinks", description: "", aliases: [] },
          },
        },
      ],
      products: [demoProduct],
      plans: [],
    };
    const name = demoProduct.text[locale].displayName;
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
    const initial = await page.request.patch(`${demoPath}/table/locale`, { data: { locale } });
    expect(initial.ok()).toBe(true);
    expect(tableStateSchema.parse(await initial.json())).toMatchObject({
      locale,
      guestCount: 1,
      orders: [],
      plan: null,
    });
    const frame = demoPage.frameLocator("iframe");
    await expect(frame.getByRole("button", { name: language, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(frame.getByRole("tab", { name: labels.kiosk_menu, exact: true })).toBeVisible();
    const source = demoPage.getByRole("combobox", { name: labels.demo_configuration });
    await expect(source).toContainText(labels.demo_published);
    await expect(source).toBeEnabled();
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
    // 設定選択のHTTP更新とiframeへの反映を観測してから、注文を始める。
    await expect(source).toContainText(draft.id.slice(0, 8));
    await expect(source).toBeEnabled();
    expect(demoSchema.parse(await (await page.request.get(demoPath)).json())).toMatchObject({
      sourceDraftId: draft.id,
      sourceVersion: savedDraft.version,
    });
    await expect(
      frame.getByRole("button").filter({ has: frame.getByText(name, { exact: true }) }),
    ).toBeVisible();
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
    // 注文済みの状態でも表示を切り替え、後続の再読込・人数変更まで注文を保持する。
    await demoPage.getByRole("button", { name: labels.demo_rotate }).click();
    await expect(demoPage.getByRole("button", { name: labels.demo_rotate })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
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
    const guests = demoPage.getByRole("combobox", { name: labels.demo_guests });
    await expect(guests).toBeEnabled();
    await guests.focus();
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
    await demoPage.close();
  });
}
