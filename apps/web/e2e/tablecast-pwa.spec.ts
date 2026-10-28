import { expect, type Page } from "@playwright/test";
import { catalogSchema } from "@tablecast/api/schema";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import ja from "../messages/ja.json" with { type: "json" };
import { approveGuestDevice, signInStaff } from "./support/session";
import { test } from "./support/test";

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
  const brand = page.getByRole("img", { name: "TableCast", exact: true });
  await expect(brand).toBeVisible();
  await expect(brand).toHaveJSProperty("naturalWidth", 500);
  for (const icon of await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').all()) {
    const href = await icon.getAttribute("href");
    if (!href) throw new Error("アイコンの参照先が必要です");
    const response = await api.get(href);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toMatch(/^image\//);
  }
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  // manifestの静的な値はunitへ置き、ビルド済みassetの実HTTP配信だけを残す。
  const manifestResponse = await api.get("/tablecast-kiosk.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = z
    .object({ icons: z.array(z.object({ src: z.string() })).min(1) })
    .parse(await manifestResponse.json());
  for (const icon of manifest.icons) {
    const image = await api.get(icon.src);
    expect(image.ok()).toBe(true);
    expect(image.headers()["content-type"]).toContain("image/png");
  }
  expect((await api.get("/sw.js")).headers()["cache-control"]).toContain("no-cache");
  await signInStaff(api, baseURL);
  const catalog = catalogSchema.parse(
    await (await api.get("/api/admin/stores/tablecast-komorebi/catalog")).json(),
  );
  const key = catalog.configuration.products[0]?.imageKey;
  expect(key).toMatch(/^tablecast\/images\/[a-f0-9]{64}\.webp$/);
  await approveGuestDevice(page.request, api, {
    origin: baseURL,
    storeId: "tablecast-komorebi",
    tableId: "tablecast-komorebi-table-01",
  });
  const imageUrl = `/api/table/images/${key}?width=128`;
  const deniedUrl = imageUrl.replace("128", "192");
  expect(
    await page.evaluate(
      async (url) => (await fetch(url, { credentials: "omit" })).status,
      deniedUrl,
    ),
  ).toBe(401);
  expect(
    await page.evaluate(
      async (url) => Boolean(await (await caches.open("tablecast-menu-images-v1")).match(url)),
      deniedUrl,
    ),
  ).toBe(false);
  const missingUrl = imageUrl.replace(String(key), `tablecast/images/${"f".repeat(64)}.webp`);
  expect(await page.evaluate(async (url) => (await fetch(url)).status, missingUrl)).toBe(404);
  expect(
    await page.evaluate(
      async (url) => Boolean(await (await caches.open("tablecast-menu-images-v1")).match(url)),
      missingUrl,
    ),
  ).toBe(false);
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
        (path.startsWith("/api/") && !path.startsWith("/api/table/images/")) ||
        path.includes("/server/") ||
        path.includes("tablecast_api"),
    ),
  ).toBe(false);
  await runtime.setOnline(false);
  expect(await page.evaluate(async (url) => (await fetch(url)).status, imageUrl)).toBe(200);
  await page.reload();
  await expect(page.getByRole("heading", { name: "接続を確認してください" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Check your connection" })).toBeVisible();
  await expect(brand).toBeVisible();
  await expect(brand).toHaveJSProperty("naturalWidth", 500);
  await runtime.setOnline(true);
  await page.getByRole("link", { name: "店側アプリ / Staff app" }).click();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/tablecast-staff.webmanifest",
  );
  // manifestのSSR表示だけで復帰完了とせず、実画面の操作可能状態も確認する。
  await expect(page.getByRole("button", { name: ja.auth_google, exact: true })).toBeEnabled();
  if (testInfo.project.name === "tablecast-chromium") {
    // 対象画像の保存だけを一度失敗させ、他の背景取得に失敗条件を消費させない。
    const worker = context.serviceWorkers()[0];
    if (!worker) throw new Error("起動済みService Workerが必要です");
    const uncached = imageUrl.replace("128", "256");
    await worker.evaluate((target) => {
      const descriptor = Object.getOwnPropertyDescriptor(Cache.prototype, "put");
      if (!descriptor) throw new Error("Cache.putが必要です");
      const originalPut: unknown = descriptor.value;
      if (typeof originalPut !== "function") throw new Error("Cache.putが必要です");
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
          if (url !== target) {
            await Reflect.apply(originalPut, this, [request, response]);
            return;
          }
          Object.defineProperty(Cache.prototype, "put", descriptor);
          throw new DOMException("試験用の容量不足", "QuotaExceededError");
        },
      });
    }, new URL(uncached, runtime.origin).href);
    expect(await page.evaluate(async (url) => (await fetch(url)).status, uncached)).toBe(200);
    expect(
      await page.evaluate(
        async (url) => Boolean(await (await caches.open("tablecast-menu-images-v1")).match(url)),
        imageUrl,
      ),
    ).toBe(true);
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

test("二つのログイン画面は未保存入力がある間はPWA更新を待ち、入力を戻すと両画面へ適用する", async ({
  page,
  context,
  browser,
  browserName,
  runtime,
}, testInfo) => {
  // Chromium本体の旧Worker終了判定を、Playwrightの操作traceとは別に記録する。
  const traceChromium = browserName === "chromium";
  if (traceChromium) await browser.startTracing(undefined, { categories: ["ServiceWorker"] });
  try {
    const observations: string[] = [];
    const observe = (target: Page) =>
      target.on("console", (message) => {
        if (message.text().startsWith("tablecast-pwa-decision:"))
          observations.push(
            JSON.stringify({
              client: target === page ? "editing" : "clean",
              ...z
                .record(z.string(), z.unknown())
                .parse(JSON.parse(message.text().slice("tablecast-pwa-decision:".length))),
            }),
          );
      });
    observe(page);
    context.on("page", observe);
    // アプリ登録より前に監視を開始し、応答の値だけを保存する
    await context.addInitScript(() => {
      if (!("serviceWorker" in navigator)) return;
      navigator.serviceWorker.addEventListener(
        "message",
        (event: MessageEvent<{ type?: string }>) => {
          const port = event.ports[0];
          if (!port) {
            if (event.data?.type === "TABLECAST_CANCEL_UPDATE")
              console.info(
                "tablecast-pwa-decision:" +
                  JSON.stringify({
                    type: event.data.type,
                    page: location.pathname,
                    time: Date.now(),
                  }),
              );
            return;
          }
          const original = port.postMessage.bind(port);
          port.postMessage = (ready: unknown) => {
            console.info(
              "tablecast-pwa-decision:" +
                JSON.stringify({
                  page: location.pathname,
                  type: event.data?.type,
                  ready,
                  blocked: Boolean(document.querySelector('[data-pwa-blocked="true"]')),
                  time: Date.now(),
                  visibility: document.visibilityState,
                  controller: navigator.serviceWorker.controller?.state,
                  source: event.source instanceof ServiceWorker ? event.source.state : null,
                }),
            );
            original(ready);
          };
        },
      );
    });
    // Given: 同じService Workerを共有する、編集中と空の二つの実ログインフォーム。
    await page.goto("/login");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);
    await expect(
      page.getByRole("button", { name: ja.auth_send_magic_link, exact: true }),
    ).toBeEnabled();
    await page.getByLabel(ja.auth_email, { exact: true }).fill("unsaved@example.test");
    await expect(
      page.getByRole("button", { name: ja.auth_send_magic_link, exact: true }),
    ).toHaveAttribute("data-pwa-blocked", "true");
    const other = await context.newPage();
    try {
      await other.goto("/login");
      const cleanSubmit = other.getByRole("button", { name: ja.auth_send_magic_link, exact: true });
      await expect(cleanSubmit).toBeEnabled();
      await expect(cleanSubmit).toHaveAttribute("data-pwa-blocked", "false");
      await expect(other.getByLabel(ja.auth_email, { exact: true })).toHaveValue("");
      // 二画面目の初回登録・制御が完了してから、次の版だけを更新対象にする。
      await expect
        .poll(() =>
          other.evaluate(async () => {
            const registration = await navigator.serviceWorker.ready;
            return (
              Boolean(navigator.serviceWorker.controller) &&
              registration.active?.state === "activated" &&
              !registration.installing &&
              !registration.waiting
            );
          }),
        )
        .toBe(true);
      let reloads = 0;
      let otherReloads = 0;
      page.on("domcontentloaded", () => {
        reloads += 1;
      });
      other.on("domcontentloaded", () => {
        otherReloads += 1;
      });
      // 自動更新の確認に対するキャンセルを、入力を戻す前に観測する。
      const decision = await page.evaluateHandle(() => {
        const state = { cancellations: 0 };
        navigator.serviceWorker.addEventListener("message", (event) => {
          const data: unknown = event.data;
          if (
            data &&
            typeof data === "object" &&
            "type" in data &&
            data.type === "TABLECAST_CANCEL_UPDATE"
          )
            state.cancellations++;
        });
        return state;
      });
      // When: 配信済みService Workerの内容を更新する。
      await appendFile(
        join(runtime.directory, ".cloudflare/output/v0/workers/default/assets/sw.js"),
        "\n// tablecast-update-test\n",
      );
      await runtime.restartWeb();

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
      expect(otherReloads).toBe(0);
      // Then: 未保存入力を元へ戻すと、利用者の更新操作なしで新版を適用する。
      try {
        await Promise.all([
          page.waitForEvent("domcontentloaded", { timeout: 20_000 }),
          other.waitForEvent("domcontentloaded", { timeout: 20_000 }),
          (async () => {
            await page.bringToFront();
            await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe("visible");
            await page.getByLabel(ja.auth_email, { exact: true }).fill("");
            await expect(
              page.getByRole("button", { name: ja.auth_send_magic_link, exact: true }),
            ).toHaveAttribute("data-pwa-blocked", "false");
          })(),
        ]);
      } finally {
        for (const target of [page, other]) {
          observations.push(
            JSON.stringify({
              client: target === page ? "editing" : "clean",
              ...(await target.evaluate(async () => {
                const registration = await navigator.serviceWorker.getRegistration();
                return {
                  page: location.pathname,
                  waiting: Boolean(registration?.waiting),
                  waitingState: registration?.waiting?.state,
                  activeState: registration?.active?.state,
                  controller: navigator.serviceWorker.controller?.state,
                  visibility: document.visibilityState,
                  blocked: Boolean(document.querySelector('[data-pwa-blocked="true"]')),
                  inert: document.body.inert,
                };
              })),
            }),
          );
        }
        const path = testInfo.outputPath("tablecast-pwa-decisions.ndjson");
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, observations.join("\n"));
        await testInfo.attach("全画面の更新判定", {
          path,
          contentType: "application/x-ndjson",
        });
      }
      expect(reloads).toBe(1);
      expect(otherReloads).toBe(1);
      await expect(page.getByLabel(ja.auth_email, { exact: true })).toHaveValue("");
      await expect(other.getByLabel(ja.auth_email, { exact: true })).toHaveValue("");
      await expect
        .poll(() =>
          other.evaluate(async () => !(await navigator.serviceWorker.getRegistration())?.waiting),
        )
        .toBe(true);
    } finally {
      await other.close();
    }
  } finally {
    if (traceChromium) {
      const path = testInfo.outputPath("tablecast-service-worker-chromium.json");
      const trace = await browser.stopTracing();
      await writeFile(path, trace);
      await testInfo.attach("ChromiumのService Worker状態遷移", {
        path,
        contentType: "application/json",
      });
    }
  }
});
