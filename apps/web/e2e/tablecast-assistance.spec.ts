import { expect } from "@playwright/test";
import {
  adminStateSchema,
  catalogSchema,
  configDraftSchema,
  staffCallPageSchema,
  tableStateSchema,
} from "@tablecast/api/schema";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import en from "../messages/en.json" with { type: "json" };
import ja from "../messages/ja.json" with { type: "json" };
import { approveGuestDevice, signInStaff } from "./support/session";
import { test } from "./support/test";

test.use({ serviceWorkers: "block", video: "on" });

test("呼び出しメモと対応済み状態が客と店員で共有され、次の来店には残らない", async ({
  page,
  request: staff,
  baseURL,
  browser,
}) => {
  const staffContext = await browser.newContext({ baseURL, serviceWorkers: "block" });
  try {
    const storeId = "tablecast-komorebi";
    const admin = `/api/admin/stores/${storeId}`;
    const headers = { Origin: baseURL ?? "" };
    await signInStaff(staff, baseURL);
    const catalog = catalogSchema.parse(await (await staff.get(`${admin}/catalog`)).json());
    const template = catalog.configuration.products[0];
    if (!template) throw new Error("商品のfixtureが必要です");
    const text = {
      ja: {
        displayName: "お冷",
        speechName: "お冷",
        description: "無料のお冷です。こちらからご注文いただけます。",
        aliases: ["お水"],
      },
      en: {
        displayName: "Water",
        speechName: "Water",
        description: "Tap water is free of charge. You can order it here.",
        aliases: ["Glass of water"],
      },
    };
    const draft = configDraftSchema.parse(
      await (await staff.post(`${admin}/drafts`, { headers })).json(),
    );
    const saved = configDraftSchema.parse(
      await (
        await staff.put(`${admin}/drafts/${draft.id}`, {
          headers,
          data: {
            expectedVersion: draft.version,
            configuration: {
              ...catalog.configuration,
              products: [
                ...catalog.configuration.products,
                {
                  ...template,
                  id: "tablecast-water-service",
                  text,
                  price: 0,
                  available: true,
                  imageKey: null,
                  imageSource: undefined,
                  modifiers: [],
                },
              ],
              guides: [
                ...(catalog.configuration.guides ?? []),
                {
                  id: "tablecast-water-guide",
                  text,
                  productIds: ["tablecast-water-service"],
                  links: [],
                },
              ],
            },
          },
        })
      ).json(),
    );
    const ready = configDraftSchema.parse(
      await (
        await staff.post(`${admin}/drafts/${draft.id}/validate`, {
          headers,
          data: { expectedVersion: saved.version },
        })
      ).json(),
    );
    expect(ready.errors).toEqual([]);
    expect(
      (
        await staff.post(`${admin}/drafts/${draft.id}/publish`, {
          headers,
          data: {
            expectedVersion: ready.version,
            baseVersion: ready.baseVersion,
            idempotencyKey: "tablecast-assistance-guide-publication",
            approved: true,
          },
        })
      ).ok(),
    ).toBe(true);
    const floor = adminStateSchema.parse(await (await staff.get(admin)).json());
    const vacant = floor.vacantTables[0];
    if (!vacant) throw new Error("試験用の空卓が必要です");
    const opened = await staff.post(`${admin}/tables/open`, {
      headers,
      data: { tableId: vacant.id, guestCount: 2, locale: "en" },
    });
    expect(opened.status()).toBe(200);
    const visit = tableStateSchema.parse(await opened.json());
    await approveGuestDevice(page.request, staff, { origin: baseURL, storeId, tableId: vacant.id });
    await page.goto("/");
    await page.getByRole("button", { name: en.kiosk_call_staff, exact: true }).click();
    const popup = page.getByRole("dialog", { name: en.assistance_title });
    await expect(popup).toBeVisible();
    const menuScroll = page
      .locator('[data-theme-part="menu"] .overflow-y-auto:has([role="tabpanel"])')
      .first();
    const beforeScroll = await menuScroll.evaluate((element) => element.scrollTop);
    await page.mouse.move(400, 600);
    await page.mouse.wheel(0, 500);
    await expect
      .poll(() => menuScroll.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(beforeScroll);
    await expect(popup).toBeVisible();
    await popup.getByRole("button", { name: "Water", exact: true }).click();
    await expect(
      popup.getByText("Tap water is free of charge. You can order it here.", { exact: true }),
    ).toBeVisible();
    const evidence = resolve(".local/tablecast-assistance-evidence");
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: resolve(evidence, "tablecast-assistance-advice.png") });
    await popup.getByRole("button", { name: en.assistance_direct, exact: true }).click();
    await expect(
      popup.getByText("お冷について店員の対応を希望しています。", { exact: true }),
    ).toBeVisible();
    await popup.getByText(en.assistance_original, { exact: true }).click();
    await expect(popup.getByText("Water", { exact: true })).toBeVisible();
    const history = staffCallPageSchema.parse(
      await (await page.request.get("/api/table/calls")).json(),
    );
    expect(history.calls).toHaveLength(1);
    const call = history.calls[0];
    if (!call) throw new Error("呼び出しの保存が必要です");
    const staffState = tableStateSchema.parse(
      await (await staff.get(`${admin}/tables/${visit.id}`)).json(),
    );
    expect(staffState.staffCall?.handoff).toEqual(call.handoff);
    await page.screenshot({ path: resolve(evidence, "tablecast-assistance-history.png") });
    await signInStaff(staffContext.request, baseURL);
    const staffPage = await staffContext.newPage();
    await staffPage.goto(`/admin/stores/${storeId}/floor`);
    await staffPage.getByRole("button", { name: "日本語", exact: true }).click();
    await staffPage.getByRole("button", { name: new RegExp(`^${vacant.name}\\b`) }).click();
    await expect(staffPage.getByText(call.handoff.summaryJa, { exact: true }).last()).toBeVisible();
    await staffPage.getByRole("button", { name: ja.admin_acknowledge, exact: true }).click();
    await expect(popup.getByText(en.assistance_resolved, { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: en.kiosk_call_staff, exact: true }).click();
    await popup.getByRole("button", { name: en.assistance_history, exact: true }).click();
    await expect(popup.getByText(en.assistance_resolved, { exact: true })).toBeVisible();
    await expect(popup.getByText(call.handoff.summaryJa, { exact: true })).toBeVisible();
    expect((await staff.post(`${admin}/tables/${visit.id}/close`, { headers })).ok()).toBe(true);
    const next = await staff.post(`${admin}/tables/open`, {
      headers,
      data: { tableId: vacant.id, guestCount: 1, locale: "ja" },
    });
    expect(next.ok()).toBe(true);
    await page.reload();
    await page.getByRole("button", { name: ja.kiosk_call_staff, exact: true }).click();
    const nextPopup = page.getByRole("dialog", { name: ja.assistance_title });
    await nextPopup.getByRole("button", { name: ja.assistance_history, exact: true }).click();
    await expect(nextPopup.getByText(ja.assistance_empty, { exact: true })).toBeVisible();
    expect(
      staffCallPageSchema.parse(await (await page.request.get("/api/table/calls")).json()).calls,
    ).toEqual([]);
  } finally {
    await staffContext.close();
  }
});
