import { type BrowserContext, expect } from "@playwright/test";
import { adminStateSchema, catalogSchema } from "@tablecast/api/schema";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import ja from "../messages/ja.json" with { type: "json" };
import { approveGuestDevice, signInFromLogin, signInStaff } from "./support/session";
import { test } from "./support/test";

// 再試行を検証するHTTP境界をSWに迂回させない。
test.use({ trace: "off", serviceWorkers: "block" });
declare global {
  interface Window {
    tablecastLayoutShift: number;
    tablecastLayoutShiftEntries: string[];
  }
}

test("代表管理ページのSSRデータをhydrationで再取得せず表示と操作へ使う", async ({
  page,
  baseURL,
}) => {
  await signInStaff(page.request, baseURL);
  const requests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      /^\/api\/(?:admin\/(?:initial|stores(?:\/[^/]+(?:\/(?:catalog|statistics|devices))?)?)|auth\/(?:get-session|list-sessions|list-accounts|passkey\/list-user-passkeys))$/.test(
        path,
      )
    )
      requests.push(path);
  });
  for (const [path, heading] of [
    ["/account", "アカウント"],
    ["/admin/live", "ホーム"],
    ["/admin/stores/tablecast-komorebi/statistics", "統計"],
    ["/admin/stores/tablecast-komorebi/menu/products", "商品"],
  ] as const) {
    requests.length = 0;
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(`${heading}.*TableCast$`));
    await expect(page.locator("head title")).toHaveCount(1);
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute("content", /\S/);
    // ポインターが移動後のロゴへ重なって先読みするのを避け、hydration後の操作をキーボードで確認する。
    const navigation = page.getByRole("button", { name: "ナビゲーション", exact: true });
    await expect(navigation).toBeEnabled();
    const wasExpanded = await navigation.getAttribute("aria-expanded");
    await navigation.press("Enter");
    await expect(navigation).toHaveAttribute("aria-expanded", String(wasExpanded !== "true"));
    expect(requests).toEqual([]);
  }
});

test("認証済みの店舗と卓メニューをJavaScriptなしでSSRし、匿名リクエストへ漏らさない", async ({
  page,
  browser,
  browserName,
  baseURL,
}, testInfo) => {
  // Given: スタッフと卓端末のCookieを実APIで発行する。
  await signInStaff(page.request, baseURL);
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
  const contexts: BrowserContext[] = [];
  try {
    const guest = await browser.newContext({ baseURL, serviceWorkers: "block" });
    contexts.push(guest);
    const staffSsr = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
      storageState: await page.context().storageState(),
    });
    contexts.push(staffSsr);
    const layoutCookie = {
      name: "tablecast-layout-tablecast-admin-layout",
      value: encodeURIComponent(JSON.stringify({ "tablecast-admin-content": 100 })),
      url: baseURL ?? "",
    };
    await staffSsr.addCookies([layoutCookie]);
    const anonymous = await browser.newContext({ baseURL, javaScriptEnabled: false });
    contexts.push(anonymous);
    await approveGuestDevice(guest.request, page.request, {
      origin: baseURL,
      storeId: "tablecast-komorebi",
      tableId: table.id,
    });
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
      await expect(staffPage).toHaveTitle(`フロアの様子 · ${floor.store.name} · TableCast`);
      await expect(guestPage).toHaveTitle(`${ja.head_guest} · ${catalog.storeName} · TableCast`);
      await expect(anonPage).toHaveTitle(`${ja.auth_sign_in} · TableCast`);
      await expect(staffPage.locator("head title")).toHaveCount(1);
      await expect(guestPage.locator('head meta[name="description"]')).toHaveAttribute(
        "content",
        `${catalog.storeName} · ${ja.head_guest_description}`,
      );
      await expect(
        staffPage.getByRole("button", { name: new RegExp(`^${table.name}\\b`) }),
      ).toBeVisible();
      expect(response?.headers()["cache-control"]).toBe("private, no-store");
      expect(await response?.text()).toContain(`${layoutCookie.name}=${layoutCookie.value}`);
      expect(await anonPage.content()).not.toContain(layoutCookie.name);
      await expect(anonPage).toHaveURL(/\/login\?/);
      await expect(anonPage.getByText(floor.store.name, { exact: true })).toHaveCount(0);
      const product = catalog.configuration.products.find(
        (item) => item.available && item.imageKey,
      );
      if (!product) throw new Error("画像付き商品fixtureが必要です");
      const card = guestPage
        .getByRole("button")
        .filter({ has: guestPage.getByText(product.text.ja.displayName, { exact: true }) })
        .filter({ has: guestPage.locator("img") });
      await expect(card).toHaveCount(1);
      const productImage = card.locator("img");
      await expect(productImage).toHaveAttribute(
        "src",
        new RegExp(`/media/${product.imageKey?.replace(".", "\\.")}`),
      );
      await expect(productImage).toHaveAttribute("srcset", /width=\d+/);
      const interactive = await guest.newPage();
      const errors: string[] = [];
      interactive.on("pageerror", (error) => errors.push(error.message));
      await interactive.addInitScript(() => {
        window.tablecastLayoutShift = 0;
        window.tablecastLayoutShiftEntries = [];
        if (PerformanceObserver.supportedEntryTypes.includes("layout-shift"))
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              if (
                "value" in entry &&
                typeof entry.value === "number" &&
                "hadRecentInput" in entry &&
                !entry.hadRecentInput
              ) {
                window.tablecastLayoutShift += entry.value;
                const sources =
                  "sources" in entry && Array.isArray(entry.sources)
                    ? entry.sources.map((source: unknown) => {
                        if (!source || typeof source !== "object") return null;
                        return {
                          node:
                            "node" in source && source.node instanceof Element
                              ? source.node.outerHTML.slice(0, 240)
                              : null,
                          previousRect: "previousRect" in source ? source.previousRect : null,
                          currentRect: "currentRect" in source ? source.currentRect : null,
                        };
                      })
                    : [];
                window.tablecastLayoutShiftEntries.push(
                  JSON.stringify({ time: entry.startTime, value: entry.value, sources }),
                );
              }
          }).observe({ type: "layout-shift", buffered: true });
      });
      const hydrate = Promise.withResolvers<void>();
      await interactive.route("**/assets/*.js", async (route) => {
        await hydrate.promise;
        await route.continue();
      });
      try {
        await interactive.goto("/", { waitUntil: "commit" });
        await expect(interactive.locator('[data-ui="voice-welcome"]')).toBeVisible();
        await expect(interactive.getByRole("log").locator(":scope > div")).toHaveCSS(
          "overflow-y",
          "auto",
        );
        await writeFile(
          testInfo.outputPath("tablecast-before-hydration.json"),
          JSON.stringify(
            await interactive.evaluate(() => ({
              shifts: window.tablecastLayoutShiftEntries,
              layout: [
                ...document.querySelectorAll(
                  '[data-ui="voice-welcome"], [data-ui="conversation-history"], [role="log"], [data-ui="camera-window"]',
                ),
              ].map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  name: element.getAttribute("data-ui") ?? element.getAttribute("role"),
                  rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                  html: element.outerHTML.slice(0, 300),
                };
              }),
            })),
            null,
            2,
          ),
        );
      } finally {
        hydrate.resolve();
        await interactive.unrouteAll({ behavior: "wait" });
      }
      await expect(
        interactive.getByRole("button", { name: ja.kiosk_voice_resume, exact: true }),
      ).toBeEnabled();
      await expect(
        interactive
          .getByRole("region", { name: ja.kiosk_conversation, exact: true })
          .getByRole("button", { name: ja.kiosk_voice_resume, exact: true }),
      ).toBeVisible();
      await expect(
        interactive.getByRole("button", { name: ja.kiosk_voice_stop, exact: true }),
      ).toHaveCount(0);
      await interactive.evaluate(async () => {
        await document.fonts.ready;
        const viewport = document.getElementById("tablecast-order")?.getBoundingClientRect();
        if (!viewport) throw new Error("SSRした注文ペインが必要です。");
        await Promise.all(
          [...document.querySelectorAll<HTMLImageElement>("#tablecast-order img")]
            .filter((image) => {
              const bounds = image.getBoundingClientRect();
              return bounds.bottom > viewport.top && bounds.top < viewport.bottom;
            })
            .map((image) => image.decode()),
        );
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      });
      const metrics = await interactive.evaluate(() => ({
        layoutShift: PerformanceObserver.supportedEntryTypes.includes("layout-shift")
          ? window.tablecastLayoutShift
          : null,
        resources: performance.getEntriesByType("resource").map((entry) => entry.name),
        layoutShiftEntries: window.tablecastLayoutShiftEntries,
        fonts: document.fonts.status,
      }));
      // 予算超過時にも実際に動いた要素と時刻を残す。
      await writeFile(
        testInfo.outputPath(`kiosk-performance-${browserName}.json`),
        JSON.stringify(metrics, null, 2),
      );
      expect(metrics.resources.filter((url) => /audio-waveform|livekit-client/.test(url))).toEqual(
        [],
      );
      if (metrics.layoutShift !== null) expect(metrics.layoutShift).toBeLessThan(0.01);
      expect(errors).toEqual([]);
    } finally {
      await guestSsr.close();
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("メールリンクからホームをSSRし、フォーカス復帰でもセッションを更新する", async ({
  page,
  baseURL,
}) => {
  await page.goto("/login");
  const requests: string[] = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  await signInFromLogin(page, baseURL);
  await expect(page).toHaveURL(/\/admin\/stores\/[^/]+\/?$/);
  await expect(page.getByRole("heading", { name: "ホーム", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "ナビゲーション", exact: true })).toBeEnabled();
  expect(requests.filter((path) => path === "/api/admin/initial")).toHaveLength(0);
  expect(requests.filter((path) => /^\/api\/admin\/stores(?:\/[^/]+)?$/.test(path))).toEqual([]);

  const main = page.locator("#tablecast-admin-main");
  await page.getByRole("heading", { name: "ChatGPTとつなぐ" }).scrollIntoViewIfNeeded();
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  const previousScroll = await main.evaluate((element) => element.scrollTop);
  await page.getByRole("link", { name: "統計", exact: true }).click();
  await expect(page.getByRole("heading", { name: "統計", exact: true })).toBeVisible();
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(0);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "ホーム", exact: true })).toBeAttached();
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(previousScroll);

  await page.goto("/account");
  await expect(page.getByLabel("名前", { exact: true })).toBeEnabled();

  await page.clock.install();
  await page.clock.fastForward(31_000);
  requests.length = 0;
  const focused = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/account/auth-state",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  expect((await focused).ok()).toBe(true);
  expect(requests.filter((path) => path === "/api/account/auth-state")).toHaveLength(1);
  expect(requests.filter((path) => path === "/api/admin/initial")).toEqual([]);
  expect(requests.filter((path) => path === "/api/admin/stores").length).toBeLessThanOrEqual(1);
});

test("店側PWAの新規ドキュメント起動は転送先のホームをSSRする", async ({ request, baseURL }) => {
  await signInStaff(request, baseURL);
  const manifest = z
    .object({ start_url: z.string() })
    .parse(await (await request.get("/tablecast-staff.webmanifest")).json());
  const launch = await request.get(manifest.start_url, { maxRedirects: 0 });
  expect(launch.status()).toBe(307);
  const destination = z.string().parse(launch.headers()["location"]);
  expect(destination).toMatch(/^\/admin\/stores\/[^/]+\/?$/);
  const home = await request.get(destination);
  expect(home.ok()).toBe(true);
  expect(await home.text()).toContain("ホーム");
  expect(home.headers()["cache-control"]).toBe("private, no-store");
});

test("実Routerの遷移と既定エラー画面を接続し、再試行で復帰する", async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInStaff(page.request, baseURL);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/admin/stores/tablecast-komorebi/floor");
  // 通常のdocument遷移ではなく、hydration後のクライアント遷移を検証する。
  await expect(page.getByRole("button", { name: "ナビゲーション", exact: true })).toBeEnabled();
  const gate = Promise.withResolvers<void>();
  const requested = Promise.withResolvers<void>();
  await page.route("**/api/admin/stores/tablecast-komorebi/devices", async (route) => {
    requested.resolve();
    await gate.promise;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "UNAVAILABLE" } }),
    });
  });
  try {
    const management = page.getByRole("button", { name: "店舗管理", exact: true });
    if ((await management.getAttribute("aria-expanded")) === "false") await management.click();
    await expect(management).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("link", { name: "端末", exact: true }).click();
    await requested.promise;
    await expect(page.locator('[aria-busy="true"]')).toBeVisible();
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
      true,
    );
    expect(
      await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.playState === "running" &&
                Number(animation.effect?.getComputedTiming().duration) > 1,
            ).length,
      ),
    ).toBe(0);
    await expect(page.getByText("0 件", { exact: true })).toHaveCount(0);
  } finally {
    gate.resolve();
  }
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByText("0 件", { exact: true })).toHaveCount(0);
  await page.unroute("**/api/admin/stores/tablecast-komorebi/devices");
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.getByRole("heading", { name: "端末", exact: true })).toBeVisible();
  await expect(page.getByText("0 件", { exact: true })).toBeVisible();
  // 来店履歴の見出しはfeature外のfile routeが所有するため、そのpending接続だけ実物で残す。
  const historyGate = Promise.withResolvers<void>();
  const historyRequested = Promise.withResolvers<void>();
  await page.route("**/api/admin/stores/tablecast-komorebi/history?*", async (route) => {
    historyRequested.resolve();
    await historyGate.promise;
    await route.continue();
  });
  const historyHeading = page.getByRole("heading", { name: "来店履歴", exact: true });
  let beforeHistory;
  try {
    await page.getByRole("link", { name: "来店履歴", exact: true }).click();
    await historyRequested.promise;
    await expect(page.locator('[aria-busy="true"]')).toBeVisible();
    await expect(historyHeading).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    beforeHistory = await historyHeading.boundingBox();
  } finally {
    historyGate.resolve();
  }
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect.poll(() => historyHeading.boundingBox()).toEqual(beforeHistory);
  expect(pageErrors).toEqual([]);
});
