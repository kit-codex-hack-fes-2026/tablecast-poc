import { expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { adminStateSchema, catalogSchema } from "@tablecast/api/schema";
import { z } from "zod";
import { test } from "./support/test";
import { credentials } from "./support/runtime";

test.use({ trace: "off" });
declare global {
  interface Window {
    tablecastLayoutShift: number;
  }
}

const screenshots = resolve(import.meta.dirname, "../../../.local/tablecast-quality-evidence");

test("認証済みの店舗と卓メニューをJavaScriptなしでSSRし、匿名リクエストへ漏らさない", async ({
  page,
  browser,
  browserName,
  baseURL,
}) => {
  // Given: スタッフと卓端末のCookieを実APIで発行する。
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        headers: { Origin: baseURL ?? "" },
        data: credentials,
      })
    ).ok(),
  ).toBe(true);
  const floor = adminStateSchema.parse(
    await (await page.request.get("/api/admin/stores/tablecast-komorebi")).json(),
  );
  const table = floor.vacantTables[0];
  if (!table) throw new Error("空卓fixtureが必要です");
  expect(
    (
      await page.request.post("/api/admin/stores/tablecast-komorebi/tables/open", {
        data: { tableId: table.id, guestCount: 2, locale: "ja" },
      })
    ).ok(),
  ).toBe(true);
  const guest = await browser.newContext({ baseURL });
  const staffSsr = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
  });
  const anonymous = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const codes = z
      .object({ user_code: z.string(), device_code: z.string() })
      .parse(await (await guest.request.post("/api/devices/request")).json());
    expect(
      (
        await page.request.post("/api/admin/stores/tablecast-komorebi/devices/approve", {
          data: { userCode: codes.user_code, tableId: table.id },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await guest.request.post("/api/devices/poll", { data: { device_code: codes.device_code } })
      ).ok(),
    ).toBe(true);
    const catalog = catalogSchema.parse(
      await (await guest.request.get("/api/table/catalog")).json(),
    );
    const guestSsr = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
      storageState: await guest.storageState(),
    });
    try {
      // When: JSを無効にして、異なる利用者のページを同時に読む。
      const staffPage = await staffSsr.newPage(),
        anonPage = await anonymous.newPage(),
        guestPage = await guestSsr.newPage();
      const [response] = await Promise.all([
        staffPage.goto("/admin/stores/tablecast-komorebi/floor"),
        anonPage.goto("/admin/stores/tablecast-komorebi/floor"),
        guestPage.goto("/"),
      ]);
      // Then: HTMLに実データと画像候補があり、未認証側はログインへ戻る。
      await expect(
        staffPage.getByRole("heading", { name: "フロアの様子", exact: true }),
      ).toBeVisible();
      await expect(
        staffPage.getByRole("button", { name: new RegExp(`^${table.name}\\b`) }),
      ).toBeVisible();
      expect(response?.headers()["cache-control"]).toBe("private, no-store");
      await expect(anonPage).toHaveURL(/\/login\?/);
      await expect(anonPage.getByText(floor.store.name, { exact: true })).toHaveCount(0);
      const product = catalog.configuration.products.find(
        (item) => item.available && item.imageKey,
      );
      if (!product) throw new Error("画像付き商品fixtureが必要です");
      await expect(
        guestPage.getByText(product.text.ja.displayName, { exact: true }).first(),
      ).toBeVisible();
      await expect(guestPage.locator('img[src*="/media/"]').first()).toHaveAttribute(
        "srcset",
        /width=\d+/,
      );
      await mkdir(screenshots, { recursive: true });
      await guestPage.screenshot({ path: resolve(screenshots, "kiosk-ssr.png"), fullPage: true });
      await staffPage.screenshot({ path: resolve(screenshots, "floor-ssr.png"), fullPage: true });
      const interactive = await guest.newPage();
      const errors: string[] = [];
      interactive.on("pageerror", (error) => errors.push(error.message));
      await interactive.addInitScript(() => {
        window.tablecastLayoutShift = 0;
        if (PerformanceObserver.supportedEntryTypes.includes("layout-shift"))
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              if (
                "value" in entry &&
                typeof entry.value === "number" &&
                "hadRecentInput" in entry &&
                !entry.hadRecentInput
              )
                window.tablecastLayoutShift += entry.value;
          }).observe({ type: "layout-shift", buffered: true });
      });
      await interactive.goto("/");
      await expect(
        interactive.getByRole("button", { name: "音声を再開", exact: true }),
      ).toBeEnabled();
      await expect(interactive.locator('[data-voice-state="idle"]')).toBeVisible();
      const metrics = await interactive.evaluate(() => ({
        layoutShift: PerformanceObserver.supportedEntryTypes.includes("layout-shift")
          ? window.tablecastLayoutShift
          : null,
        resources: performance.getEntriesByType("resource").map((entry) => entry.name),
      }));
      expect(metrics.resources.filter((url) => /audio-waveform|livekit-client/.test(url))).toEqual(
        [],
      );
      if (metrics.layoutShift !== null) expect(metrics.layoutShift).toBeLessThan(0.01);
      expect(errors).toEqual([]);
      await writeFile(
        resolve(screenshots, `kiosk-performance-${browserName}.json`),
        JSON.stringify(metrics, null, 2),
      );
      await interactive.screenshot({
        path: resolve(screenshots, "kiosk-hydrated.png"),
        fullPage: true,
      });
    } finally {
      await guestSsr.close();
    }
  } finally {
    await Promise.all([guest.close(), staffSsr.close(), anonymous.close()]);
  }
});

test("遷移中・取得失敗・再試行後の0件を区別する", async ({ page, baseURL }) => {
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        headers: { Origin: baseURL ?? "" },
        data: credentials,
      })
    ).ok(),
  ).toBe(true);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/admin/stores/tablecast-komorebi/floor");
  // 通常のdocument遷移ではなく、hydration後のクライアント遷移を検証する。
  await expect(page.getByRole("button", { name: "ナビゲーション", exact: true })).toBeEnabled();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  await page.route("**/api/admin/stores/tablecast-komorebi/devices", async (route) => {
    await gate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "UNAVAILABLE" } }),
    });
  });
  try {
    await page.getByRole("link", { name: "端末", exact: true }).click();
    await expect(page.locator('[aria-busy="true"]')).toBeVisible();
    await expect(page.getByText("0 件", { exact: true })).toHaveCount(0);
    await mkdir(screenshots, { recursive: true });
    await page.screenshot({ path: resolve(screenshots, "pending.png"), fullPage: true });
  } finally {
    release?.();
  }
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByText("0 件", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: resolve(screenshots, "error.png"), fullPage: true });
  await page.unroute("**/api/admin/stores/tablecast-komorebi/devices");
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.getByRole("heading", { name: "端末", exact: true })).toBeVisible();
  await expect(page.getByText("0 件", { exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(screenshots, "empty.png"), fullPage: true });
  expect(pageErrors).toEqual([]);
});
