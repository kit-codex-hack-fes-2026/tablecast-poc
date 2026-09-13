import { expect } from "@playwright/test";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "./support/test";
import { credentials } from "./support/runtime";
import { catalogSchema } from "@tablecast/api/schema";
import ja from "../messages/ja.json" with { type: "json" };

test("PWAの入口を分け、画像を再利用し、オフラインでは復帰案内を表示する", async ({
  page,
  request: api,
  context,
  baseURL,
  runtime,
}, testInfo) => {
  // Given: ビルド済みWorkersと初回起動したアプリ。
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/tablecast-kiosk.webmanifest",
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  for (const [kind, start] of [
    ["kiosk", "/"],
    ["staff", "/admin/live"],
  ]) {
    const response = await api.get(`/tablecast-${kind}.webmanifest`);
    expect(await response.json()).toMatchObject({
      id: `/tablecast-${kind}`,
      start_url: start,
      display: "standalone",
    });
  }
  expect((await api.get("/sw.js")).headers()["cache-control"]).toContain("no-cache");
  await api.post("/api/auth/sign-in/email", {
    data: credentials,
    headers: { Origin: baseURL ?? "" },
  });
  const catalog = catalogSchema.parse(
    await (await api.get("/api/admin/stores/tablecast-komorebi/catalog")).json(),
  );
  const key = catalog.configuration.products[0]?.imageKey;
  expect(key).toMatch(/^tablecast\/images\/[a-f0-9]{64}\.png$/);
  const imageUrl = `/media/${key}?width=128`;
  // When: 同じURLを二度取得する。
  let fetches = 0;
  if (testInfo.project.name === "tablecast-chromium")
    context.on("request", (request) => {
      if (request.serviceWorker() && request.url().endsWith(imageUrl)) fetches++;
    });
  expect(await page.evaluate(async (url) => (await fetch(url)).status, imageUrl)).toBe(200);
  await expect
    .poll(() =>
      page.evaluate(
        async (url) => Boolean(await (await caches.open("tablecast-menu-images-v1")).match(url)),
        imageUrl,
      ),
    )
    .toBe(true);
  expect(await page.evaluate(async (url) => (await fetch(url)).status, imageUrl)).toBe(200);
  // Then: 明示キャッシュから再利用し、幅別に分離する。
  expect(
    await page.evaluate(
      async (url) =>
        Boolean(
          await (await caches.open("tablecast-menu-images-v1")).match(url.replace("128", "256")),
        ),
      imageUrl,
    ),
  ).toBe(false);
  if (testInfo.project.name === "tablecast-chromium") expect(fetches).toBe(1);
  const urls = await page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys()).map(async (name) =>
          (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname),
        ),
      )
    ).flat(),
  );
  expect(
    urls.some(
      (path) =>
        path === "/" ||
        path.startsWith("/api/") ||
        path.includes("/server/") ||
        path.includes("tablecast_api"),
    ),
  ).toBe(false);
  await runtime.setOnline(false);
  expect(await page.evaluate(async (url) => (await fetch(url)).status, imageUrl)).toBe(200);
  await page.reload();
  await expect(page.getByRole("heading", { name: "接続を確認してください" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Check your connection" })).toBeVisible();
  await page.screenshot({ path: join(testInfo.outputDir, "tablecast-pwa-offline.png") });
  await runtime.setOnline(true);
  await page.getByRole("link", { name: "店側アプリ / Staff app" }).click();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/tablecast-staff.webmanifest",
  );
  await page.getByText(ja.pwa_install_title, { exact: true }).click();
  await expect(page.getByText(ja.pwa_install_steps)).toBeVisible();
  await page.screenshot({
    path: join(testInfo.outputDir, "tablecast-pwa-install.png"),
    fullPage: true,
  });
  if (testInfo.project.name === "tablecast-chromium") {
    // 対象画像の保存だけを一度失敗させ、他の背景取得に失敗条件を消費させない。
    const worker = context.serviceWorkers()[0];
    if (!worker) throw new Error("起動済みService Workerが必要です");
    const uncached = imageUrl.replace("128", "256");
    await worker.evaluate((target) => {
      const descriptor = Object.getOwnPropertyDescriptor(Cache.prototype, "put");
      if (!descriptor) throw new Error("Cache.putが必要です");
      Object.defineProperty(Cache.prototype, "put", {
        ...descriptor,
        value: async function tablecastQuotaFailure(
          this: Cache,
          request: RequestInfo | URL,
          response: Response,
        ) {
          const url =
            request instanceof Request
              ? request.url
              : new URL(String(request), self.location.origin).href;
          if (url !== target) return Reflect.apply(descriptor.value, this, [request, response]);
          Object.defineProperty(Cache.prototype, "put", descriptor);
          throw new DOMException("試験用の容量不足", "QuotaExceededError");
        },
      });
    }, new URL(uncached, runtime.origin).href);
    expect(await page.evaluate(async (url) => (await fetch(url)).status, uncached)).toBe(200);
    await expect
      .poll(() => worker.evaluate(() => Cache.prototype.put.name))
      .not.toBe("tablecastQuotaFailure");
    expect(await page.evaluate(async (url) => (await fetch(url)).status, uncached)).toBe(200);
    await expect
      .poll(() =>
        page.evaluate(
          async (url) => Boolean(await (await caches.open("tablecast-menu-images-v1")).match(url)),
          uncached,
        ),
      )
      .toBe(true);
  }
});

test("別画面の未保存入力がある間は更新を待ち、入力を戻すと全画面へ自動適用する", async ({
  page,
  context,
  runtime,
}) => {
  // Given: 同じService Workerを共有する二画面と保存前のフォーム。
  await page.goto("/login");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await expect(page.getByRole("button", { name: ja.auth_sign_in, exact: true })).toBeEnabled();
  await page.getByLabel(ja.auth_email, { exact: true }).fill("unsaved@example.test");
  await expect(page.getByRole("button", { name: ja.auth_sign_in, exact: true })).toHaveAttribute(
    "data-pwa-blocked",
    "true",
  );
  const other = await context.newPage();
  try {
    await other.goto(`${runtime.origin}/`);
    await expect(other.getByRole("button", { name: ja.pair_begin, exact: true })).toBeEnabled();
    let reloads = 0;
    page.on("domcontentloaded", () => {
      reloads += 1;
    });
    // 自動更新の確認に対するキャンセルを、入力を戻す前に観測する。
    const decision = await page.evaluateHandle(() => {
      const state = { cancellations: 0 };
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "TABLECAST_CANCEL_UPDATE") state.cancellations++;
      });
      return state;
    });
    // When: 配信済みService Workerの内容を更新する。
    await runtime.setOnline(false);
    await appendFile(join(runtime.directory, "client/sw.js"), "\n// tablecast-update-test\n");
    await runtime.setOnline(true);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error("登録済みService Workerが必要です");
      await registration.update();
    });
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return Boolean(registration?.waiting);
        }),
      )
      .toBe(true);
    await expect.poll(() => decision.evaluate((state) => state.cancellations)).toBeGreaterThan(0);
    await decision.dispose();
    await expect(page.getByLabel(ja.auth_email, { exact: true })).toHaveValue(
      "unsaved@example.test",
    );
    expect(reloads).toBe(0);
    // Then: 未保存入力を元へ戻すと、利用者の更新操作なしで新版を適用する。
    await Promise.all([
      page.waitForEvent("domcontentloaded", { timeout: 20_000 }),
      other.waitForEvent("domcontentloaded", { timeout: 20_000 }),
      page.getByLabel(ja.auth_email, { exact: true }).fill(""),
    ]);
    expect(reloads).toBe(1);
    await expect(page.getByLabel(ja.auth_email, { exact: true })).toHaveValue("");
    await expect
      .poll(() =>
        other.evaluate(async () => !(await navigator.serviceWorker.getRegistration())?.waiting),
      )
      .toBe(true);
  } finally {
    await other.close();
  }
});
