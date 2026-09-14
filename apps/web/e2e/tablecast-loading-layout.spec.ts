import { setTimeout as delay } from "node:timers/promises";
import { writeFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { test } from "./support/test";
import ja from "../messages/ja.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import { credentials } from "./support/runtime";

// 認証情報をtraceへ保存せず、初回取得をHTTP境界で待機させる。
test.use({ trace: "off", serviceWorkers: "block", video: "on", hasTouch: true });

for (const [locale, labels] of [
  ["ja", ja],
  ["en", en],
] as const) {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
  ]) {
    test(`${locale}-${viewport.width}: アカウントの初回遷移と直接SSRで枠を保つ`, async ({
      page,
      baseURL,
    }, testInfo) => {
      const record = async (name: string, body: string) => {
        const path = testInfo.outputPath(name);
        await writeFile(path, body);
        await testInfo.attach(name, { path, contentType: "application/json" });
      };
      await page.setViewportSize(viewport);
      await page
        .context()
        .addCookies([{ name: "tablecast_locale", value: locale, url: baseURL ?? "" }]);
      const login = await page.request.post("/api/auth/sign-in/email", {
        headers: { Origin: baseURL ?? "" },
        data: credentials,
      });
      expect(login.ok()).toBe(true);
      await page.goto("/organisations");
      const sidebar = page.locator("#tablecast-admin-sidebar:visible");
      const handle = page.getByRole("separator", { name: labels.admin_resize_sidebar });
      await expect(sidebar).toBeVisible();
      // 保存済みの幅を使った遷移を確認する。
      await handle.press("ArrowRight");
      const before = await sidebar.boundingBox();
      await page.evaluate(() => {
        sessionStorage.setItem("tablecast-layout-shifts", "[]");
        if (PerformanceObserver.supportedEntryTypes.includes("layout-shift")) {
          const entries: unknown[] = [];
          new PerformanceObserver((list) => {
            entries.push(
              ...list.getEntries().map((entry) => ({
                startTime: entry.startTime,
                value: "value" in entry ? entry.value : null,
                hadRecentInput: "hadRecentInput" in entry ? entry.hadRecentInput : null,
              })),
            );
            sessionStorage.setItem("tablecast-layout-shifts", JSON.stringify(entries));
          }).observe({ type: "layout-shift" });
        }
      });
      const release = Promise.withResolvers<void>();
      const requested = Promise.withResolvers<void>();
      await page.route(
        /\/api\/auth\/(list-sessions|list-accounts|passkey\/list-user-passkeys)/u,
        async (route) => {
          requested.resolve();
          await Promise.all([release.promise, delay(1000)]);
          await route.continue();
        },
      );
      const measurements = async () =>
        page.evaluate(() =>
          ["#tablecast-admin-sidebar", "main", "main header", "main h1", "main section"].map(
            (selector) => ({
              selector,
              boxes: [...document.querySelectorAll(selector)]
                .filter((element) => element.checkVisibility())
                .map((element) => {
                  const { x, y, width, height } = element.getBoundingClientRect();
                  return { x, y, width, height };
                }),
            }),
          ),
        );
      try {
        await page.getByRole("link", { name: labels.account_title, exact: true }).click();
        await requested.promise;
        await expect(page.getByRole("status").first()).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath("tablecast-account-pending.png") });
        const pending = await measurements();
        await record("tablecast-pending.json", JSON.stringify(pending));
        await expect(sidebar).toBeVisible();
        expect((await sidebar.boundingBox())?.width).toBeCloseTo(before?.width ?? 0, 0);
        await expect(
          page.getByRole("heading", { name: labels.account_title, exact: true }),
        ).toBeVisible();
        await expect(page.getByLabel(labels.account_name, { exact: true })).toBeDisabled();
        release.resolve();
        await expect(page).toHaveURL(/\/account$/u);
        await expect(page.getByLabel(labels.account_name, { exact: true })).toBeEnabled();
        const success = await measurements();
        await record("tablecast-success.json", JSON.stringify(success));
        expect(success).toEqual(pending);
        await page.screenshot({ path: testInfo.outputPath("tablecast-account-success.png") });
      } finally {
        release.resolve();
      }
      await record(
        "tablecast-shifts.json",
        await page.evaluate(() => sessionStorage.getItem("tablecast-layout-shifts") ?? "[]"),
      );
      const demo = page.getByRole("link", { name: labels.demo_open });
      const popupPromise = page.waitForEvent("popup");
      await demo.click();
      const popup = await popupPromise;
      await popup.close();
      await expect(demo).toHaveCSS("outline-style", "none");
      const touchPopup = page.waitForEvent("popup");
      await demo.tap();
      await (await touchPopup).close();
      await expect(demo).toHaveCSS("outline-style", "none");
      await page.keyboard.press("Tab");
      await demo.focus();
      await expect(demo).toBeFocused();
      await expect(demo).toHaveCSS("outline-style", "solid");
      await page.unrouteAll({ behavior: "wait" });
      const response = await page.request.get("/account");
      expect(response.ok()).toBe(true);
      const html = await response.text();
      expect(html).toContain('id="tablecast-admin-sidebar"');
      expect(html).toContain(labels.account_profile);
      await page.reload();
      await expect(page.getByLabel(labels.account_name, { exact: true })).toBeEnabled();
      expect((await sidebar.boundingBox())?.width).toBeCloseTo(before?.width ?? 0, 0);
    });
  }
}

test("アカウント取得の失敗でも枠を保って再試行し、再取得失敗で入力を残す", async ({
  page,
  baseURL,
}) => {
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        headers: { Origin: baseURL ?? "" },
        data: credentials,
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/organisations");
  await expect(page.getByRole("button", { name: ja.admin_navigation, exact: true })).toBeEnabled();
  const failure = {
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ message: "一時的に取得できません" }),
  };
  await page.route("**/api/auth/list-sessions", (route) => route.fulfill(failure));
  await page.getByRole("link", { name: ja.account_title, exact: true }).click();
  await expect(page.getByRole("heading", { name: ja.common_error })).toBeVisible();
  await expect(page.locator("#tablecast-admin-sidebar:visible")).toBeVisible();
  await page.unroute("**/api/auth/list-sessions");
  await page.getByRole("button", { name: ja.common_retry }).click();
  const name = page.getByLabel(ja.account_name, { exact: true });
  await expect(name).toBeEnabled();
  const release = Promise.withResolvers<void>();
  const requested = Promise.withResolvers<void>();
  await page.route("**/api/auth/list-sessions", async (route) => {
    requested.resolve();
    await release.promise;
    await route.fulfill(failure);
  });
  try {
    await name.fill("保存する名前");
    await page.getByRole("button", { name: ja.account_save, exact: true }).click();
    await requested.promise;
    await expect(page.getByRole("status")).toHaveText(ja.account_saved);
    await name.fill("入力途中の名前");
    release.resolve();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(name).toHaveValue("入力途中の名前");
    await expect(page.locator("#tablecast-admin-sidebar:visible")).toBeVisible();
  } finally {
    release.resolve();
  }
});

test("フロア・メニュー・履歴の初回読込も見出しと表を維持する", async ({ page, baseURL }) => {
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        headers: { Origin: baseURL ?? "" },
        data: credentials,
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/account");
  await expect(page.getByLabel(ja.account_name, { exact: true })).toBeEnabled();
  const floorPath = await page
    .getByRole("link", { name: ja.admin_live, exact: true })
    .getAttribute("href");
  if (!floorPath) throw new Error("選択中の店舗のフロアリンクがありません。");
  const storePath = floorPath.replace(/\/floor$/u, "");
  // 初回の親route chunkが遅れても、その下のフロア待機表示へ到達する。
  await page.route("**/assets/*.js", async (route) => {
    await delay(500);
    await route.continue();
  });
  for (const target of [
    {
      path: floorPath,
      endpoint: `**/api${storePath}`,
      title: ja.admin_live,
    },
    {
      path: `${storePath}/menu/products`,
      endpoint: `**/api${storePath}/catalog`,
      title: ja.editor_products,
    },
    {
      path: `${storePath}/visits`,
      endpoint: `**/api${storePath}/history?*`,
      title: ja.admin_history,
    },
  ]) {
    const release = Promise.withResolvers<void>();
    const requested = Promise.withResolvers<void>();
    await page.route(target.endpoint, async (route) => {
      requested.resolve();
      await release.promise;
      await route.continue();
    });
    try {
      if (target.path.includes("/menu/"))
        await page.getByRole("button", { name: ja.admin_config }).click();
      await page.locator(`a[href="${target.path}"]`).click();
      await requested.promise;
      await expect(page.getByRole("status").first()).toBeVisible();
      const title = page.getByRole("heading", { name: target.title, exact: true });
      await expect(title).toBeVisible();
      const heading = await title.boundingBox();
      await expect(page.getByRole("table")).toBeVisible();
      release.resolve();
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      await expect.poll(() => title.boundingBox()).toEqual(heading);
    } finally {
      release.resolve();
    }
    await page.unroute(target.endpoint);
  }
});
