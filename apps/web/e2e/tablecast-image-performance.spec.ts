import { expect } from "@playwright/test";
import { catalogSchema, configDraftSchema } from "@tablecast/api/schema";
import ja from "../messages/ja.json" with { type: "json" };
import { credentials } from "./support/runtime";
import { test } from "./support/test";

declare global {
  interface Window {
    tablecastImageMetrics: { lcp: number | null; cls: number | null };
  }
}

test.use({ serviceWorkers: "block", trace: "off", deviceScaleFactor: 2 });

for (const count of [24, 120]) {
  test(`${count}商品の初回と再訪で画像の実幅・転送量・表示を計測する`, async ({
    page,
    request,
    baseURL,
    browserName,
  }, testInfo) => {
    const headers = { Origin: baseURL ?? "" };
    expect(
      (await request.post("/api/auth/sign-in/email", { headers, data: credentials })).ok(),
    ).toBe(true);
    const api = "/api/admin/stores/tablecast-komorebi";
    const catalog = catalogSchema.parse(await (await request.get(`${api}/catalog`)).json());
    const originals = catalog.configuration.products.filter(
      (product) => product.imageKey && product.available,
    );
    expect(originals.length).toBeGreaterThan(0);
    const configuration = {
      ...catalog.configuration,
      plans: catalog.configuration.plans.map((plan) => ({
        ...plan,
        excludedOptionIds: [],
        productIds: Array.from({ length: count }, (_, index) => index)
          .filter((index) => plan.productIds.includes(originals[index % originals.length].id))
          .map((index) => `tablecast-image-product-${index}`),
      })),
      products: Array.from({ length: count }, (_, index) => ({
        ...originals[index % originals.length],
        id: `tablecast-image-product-${index}`,
        modifiers: [],
      })),
    };
    let draft = configDraftSchema.parse(
      await (await request.post(`${api}/drafts`, { headers, data: {} })).json(),
    );
    draft = configDraftSchema.parse(
      await (
        await request.put(`${api}/drafts/${draft.id}`, {
          headers,
          data: { expectedVersion: draft.version, configuration },
        })
      ).json(),
    );
    draft = configDraftSchema.parse(
      await (
        await request.post(`${api}/drafts/${draft.id}/validate`, {
          headers,
          data: { expectedVersion: draft.version },
        })
      ).json(),
    );
    expect(draft.errors).toEqual([]);
    expect(
      (
        await request.post(`${api}/drafts/${draft.id}/publish`, {
          headers,
          data: {
            expectedVersion: draft.version,
            baseVersion: catalog.version,
            idempotencyKey: `tablecast-images-${count}`,
            approved: true,
          },
        })
      ).ok(),
    ).toBe(true);
    // ペアリング中の画像取得を止め、最初の計測をcoldに揃える。
    await page.route("**/media/**", (route) => route.abort());
    await page.goto("/");
    await page.getByRole("button", { name: ja.pair_begin, exact: true }).click();
    const userCode = await page.getByRole("status", { name: ja.admin_pair_code }).innerText();
    expect(
      (
        await request.post(`${api}/devices/approve`, {
          headers,
          data: { userCode, tableId: "tablecast-komorebi-table-01" },
        })
      ).ok(),
    ).toBe(true);
    await expect(page.getByRole("separator", { name: ja.kiosk_resize_panes })).toBeVisible();

    await page.unroute("**/media/**");
    await page.addInitScript(() => {
      const supported = PerformanceObserver.supportedEntryTypes;
      window.tablecastImageMetrics = {
        lcp: supported.includes("largest-contentful-paint") ? 0 : null,
        cls: supported.includes("layout-shift") ? 0 : null,
      };
      if (supported.includes("largest-contentful-paint")) {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) window.tablecastImageMetrics.lcp = entry.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
      }
      if (supported.includes("layout-shift")) {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (
              "value" in entry &&
              typeof entry.value === "number" &&
              !("hadRecentInput" in entry && entry.hadRecentInput)
            ) {
              window.tablecastImageMetrics.cls =
                (window.tablecastImageMetrics.cls ?? 0) + entry.value;
            }
          }
        }).observe({ type: "layout-shift", buffered: true });
      }
    });
    const pendingImages = new Set<string>();
    page.on("request", (imageRequest) => {
      if (new URL(imageRequest.url()).pathname.startsWith("/media/"))
        pendingImages.add(imageRequest.url());
    });
    page.on("requestfinished", (imageRequest) => pendingImages.delete(imageRequest.url()));
    page.on("requestfailed", (imageRequest) => pendingImages.delete(imageRequest.url()));
    const samples = [];
    for (let sample = 0; sample < 3; sample++) {
      await page.reload();
      const images = page.locator("#tablecast-order img");
      await expect(images).toHaveCount(count);
      await expect
        .poll(() =>
          images
            .first()
            .evaluate(
              (image) =>
                image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
            ),
        )
        .toBe(true);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      });
      await expect.poll(() => pendingImages.size).toBe(0);
      const measured = await page.evaluate(() => ({
        ...window.tablecastImageMetrics,
        dpr: devicePixelRatio,
        resources: performance
          .getEntriesByType("resource")
          .filter(
            (entry): entry is PerformanceResourceTiming =>
              entry instanceof PerformanceResourceTiming && entry.name.includes("/media/"),
          )
          .map((entry) => ({
            width: new URL(entry.name).searchParams.get("width"),
            transfer: entry.transferSize,
            body: entry.encodedBodySize,
            start: entry.startTime,
            end: entry.responseEnd,
          })),
        images: [...document.querySelectorAll("#tablecast-order img")]
          .filter((image): image is HTMLImageElement => image instanceof HTMLImageElement)
          .slice(0, 6)
          .map((image) => ({
            width: image.getBoundingClientRect().width,
            height: image.getBoundingClientRect().height,
            source: new URL(image.currentSrc || image.src).searchParams.get("width"),
          })),
      }));
      expect(measured.cls === null || measured.cls < 0.1).toBe(true);
      const transferred = measured.resources.some((resource) => resource.body > 0)
        ? measured.resources.reduce((total, resource) => total + resource.transfer, 0)
        : null;
      expect(browserName !== "chromium" || transferred !== null).toBe(true);
      if (transferred !== null) {
        expect(transferred).toBeLessThanOrEqual(sample === 0 ? 500_000 : 0);
      } else if (sample === 0) {
        testInfo.annotations.push({
          type: "計測制限",
          description: "Resource Timingのbyte数を取得できないため、転送予算はChromiumで検証する",
        });
      }
      for (const image of measured.images)
        expect(Math.abs(image.width - image.height)).toBeLessThan(1);
      samples.push({ sample, transferBytes: transferred, ...measured });
    }
    await page.screenshot({ path: testInfo.outputPath(`tablecast-images-${count}.png`) });
    const source = await page
      .locator("#tablecast-order img")
      .first()
      .evaluate((image) => (image instanceof HTMLImageElement ? image.currentSrc : ""));
    const cache = [];
    for (let repeat = 0; repeat < 3; repeat++) {
      const response = await request.get(source);
      expect(response.ok()).toBe(true);
      cache.push({
        status: response.status(),
        cache: response.headers()["x-tablecast-image-cache"],
        bytes: (await response.body()).byteLength,
      });
    }
    await page
      .locator("#tablecast-order button")
      .filter({ has: page.locator("img") })
      .first()
      .click();
    const detail = page.getByRole("region", { name: originals[0].text.ja.displayName });
    const detailImage = detail.locator("img").first();
    await expect
      .poll(() =>
        detailImage.evaluate(
          (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        ),
      )
      .toBe(true);
    const detailBounds = await detailImage.boundingBox();
    await page.screenshot({ path: testInfo.outputPath(`tablecast-image-detail-${count}.png`) });
    await detail.getByRole("button", { name: ja.kiosk_add, exact: true }).click();
    await expect(detail).toHaveCount(0);
    await page.getByRole("tab", { name: /^注文かご/ }).click();
    const cartImage = page.locator('[data-ui="cart-lines"] img').first();
    await expect(cartImage).toBeVisible();
    await expect
      .poll(() =>
        cartImage.evaluate(
          (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        ),
      )
      .toBe(true);
    const cartBounds = await cartImage.boundingBox();
    expect(cartBounds?.width).toBe(64);
    expect(cartBounds?.height).toBe(64);
    await page.screenshot({ path: testInfo.outputPath(`tablecast-image-cart-${count}.png`) });
    await testInfo.attach("tablecast-image-metrics", {
      body: JSON.stringify({ count, samples, cache, detailBounds, cartBounds }, null, 2),
      contentType: "application/json",
    });
    console.log(JSON.stringify({ count, samples, cache, detailBounds, cartBounds }));
  });
}
