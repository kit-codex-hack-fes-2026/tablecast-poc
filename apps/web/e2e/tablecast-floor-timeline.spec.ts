import { expect } from "@playwright/test";
import { adminStateSchema, tableStateSchema } from "@tablecast/api/schema";
import { test } from "./support/test";
import { credentials } from "./support/runtime";
import en from "../messages/en.json" with { type: "json" };
import ja from "../messages/ja.json" with { type: "json" };
import { storeDate, moveDate } from "../src/features/store/floor-model";

for (const { language, labels } of [
  { language: "日本語", labels: ja },
  { language: "English", labels: en },
]) {
  test(`${language}の時間軸をSSRし、同卓の閉卓済み・利用中の詳細と空席の開卓へ接続する`, async ({
    page,
    baseURL,
  }, testInfo) => {
    const storeId = "tablecast-komorebi";
    const base = `/api/admin/stores/${storeId}`;
    const headers = { Origin: baseURL ?? "" };
    const login = await page.request.post("/api/auth/sign-in/email", {
      headers,
      data: credentials,
    });
    expect(login.status()).toBe(200);
    const initial = adminStateSchema.parse(await (await page.request.get(base)).json());
    const vacant = initial.vacantTables.find((table) => table.name === "T10");
    if (!vacant) throw new Error("専用fixtureのT10が空席ではありません。");
    const first = await page.request.post(`${base}/tables/open`, {
      headers,
      data: { tableId: vacant.id, guestCount: 1, locale: "ja" },
    });
    expect(first.status()).toBe(200);
    const closed = tableStateSchema.parse(await first.json());
    expect(
      (await page.request.post(`${base}/tables/${closed.id}/close`, { headers })).status(),
    ).toBe(200);
    const next = await page.request.post(`${base}/tables/open`, {
      headers,
      data: { tableId: vacant.id, guestCount: 2, locale: "ja" },
    });
    expect(next.status()).toBe(200);
    const open = tableStateSchema.parse(await next.json());
    const today = storeDate(Date.now());
    const url = `/admin/stores/${storeId}/floor?view=timeline&date=${today}`;
    const hydrationErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /hydrat/i.test(message.text()))
        hydrationErrors.push(message.text());
    });
    await page.goto(url);
    await page.getByRole("button", { name: language, exact: true }).click();
    await expect(
      page.getByRole("tab", { name: labels.floor_timeline, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("region", { name: labels.floor_timeline, exact: true }),
    ).toBeVisible();
    expect(await (await page.request.get(url)).text()).toContain("data-scroll-restoration-id");
    if (language === "日本語") {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: testInfo.outputPath("after-desktop.png"), fullPage: true });
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.screenshot({ path: testInfo.outputPath("after-ipad.png"), fullPage: true });
    }
    await page.getByText(labels.floor_visits, { exact: true }).click();
    const viewport = page.getByRole("region", { name: labels.floor_timeline, exact: true });
    await viewport.evaluate((element) => {
      element.scrollLeft = 650;
    });
    await page
      .locator("details")
      .getByRole("button", { name: /^T10 · 1 / })
      .click();
    await expect(page).toHaveURL(new RegExp(`/visits/${closed.id}`));
    await expect(
      page.getByRole("button", { name: labels.admin_close_session, exact: true }),
    ).toHaveCount(0);
    await page.goBack();
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBe(650);
    await expect(
      page.getByRole("tab", { name: labels.floor_timeline, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    // 戻る際のdetailsの復元はブラウザーに任せ、閉じている場合だけ展開する。
    if (
      (await page
        .locator("details")
        .filter({ hasText: labels.floor_visits })
        .getAttribute("open")) === null
    )
      await page.getByText(labels.floor_visits, { exact: true }).click();
    // ごく短い利用中の帯とは別に、来店一覧の押しやすい操作を使う。
    await page
      .locator("details")
      .getByRole("button", { name: /^T10 · 2 / })
      .click();
    await expect(page).toHaveURL(new RegExp(`/visits/${open.id}`));
    await page.goBack();
    await page.getByRole("tab", { name: labels.floor_list, exact: true }).click();
    await expect(
      page.getByRole("columnheader", { name: labels.admin_elapsed, exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: labels.floor_timeline, exact: true }).click();
    await page.getByRole("button", { name: labels.floor_previous, exact: true }).click();
    await expect(page.getByLabel(labels.floor_date, { exact: true })).toHaveValue(
      moveDate(today, -1),
    );
    await page.getByRole("button", { name: labels.floor_now, exact: true }).click();
    await expect(page.getByLabel(labels.floor_date, { exact: true })).toHaveValue(today);
    await page
      .getByRole("region", { name: labels.floor_timeline, exact: true })
      .getByRole("button", { name: labels.admin_open_table, exact: true })
      .click();
    await expect(page).toHaveURL(/\/tables\/[^/]+\/open/);
    expect(hydrationErrors).toEqual([]);
  });
}
