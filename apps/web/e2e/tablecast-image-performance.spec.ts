import { expect, type Request } from "@playwright/test";
import { catalogSchema, configDraftSchema } from "@tablecast/api/schema";
import ja from "../messages/ja.json" with { type: "json" };
import { fixtureValue } from "../src/test-support/fixture-value";
import { approveGuestDevice, signInStaff } from "./support/session";
import { test } from "./support/test";

declare global {
  interface Window {
    tablecastImageMetrics: {
      cls: null | number;
      decoded: Record<string, number>;
      lcp: null | number;
      resourceBufferFull: boolean;
    };
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
    await signInStaff(request, baseURL);
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
          .filter((index) =>
            plan.productIds.includes(fixtureValue(originals[index % originals.length]).id),
          )
          .map((index) => `tablecast-image-product-${index}`),
      })),
      products: Array.from({ length: count }, (_, index) => ({
        ...originals[index % originals.length],
        id: `tablecast-image-product-${index}`,
        modifiers: [],
      })),
    };
    let draft = configDraftSchema.parse(
      await (await request.post(`${api}/drafts`, { headers })).json(),
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
    // Cookieの準備だけを済ませ、画像cacheが空の最初のdocumentから計測する。
    await approveGuestDevice(page.request, request, {
      origin: baseURL,
      storeId: "tablecast-komorebi",
      tableId: "tablecast-komorebi-table-01",
    });
    const catalogBytes = (await (await page.request.get("/api/table/catalog")).body()).byteLength;
    await page.addInitScript(() => {
      // リソース記録の既定250件の枠で、画像の転送量を欠落させない。
      performance.setResourceTimingBufferSize(1000);
      performance.addEventListener("resourcetimingbufferfull", () => {
        window.tablecastImageMetrics.resourceBufferFull = true;
      });
      const supported = PerformanceObserver.supportedEntryTypes;
      window.tablecastImageMetrics = {
        decoded: {},
        resourceBufferFull: false,
        lcp: supported.includes("largest-contentful-paint") ? 0 : null,
        cls: supported.includes("layout-shift") ? 0 : null,
      };
      // 本画像のdecodeと次の描画frameを記録し、placeholderの表示時間と区別する。
      document.addEventListener(
        "load",
        (event) => {
          const image = event.target;
          if (image instanceof HTMLImageElement && image.currentSrc.includes("/images/tablecast/"))
            void image
              .decode()
              .then(() =>
                requestAnimationFrame(() => {
                  window.tablecastImageMetrics.decoded[image.currentSrc] = performance.now();
                }),
              )
              .catch(() => undefined);
        },
        true,
      );
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
    const pendingImages = new Set<Request>();
    page.on("request", (imageRequest) => {
      if (new URL(imageRequest.url()).pathname.includes("/images/tablecast/"))
        pendingImages.add(imageRequest);
    });
    page.on("requestfinished", (imageRequest) => pendingImages.delete(imageRequest));
    page.on("requestfailed", (imageRequest) => pendingImages.delete(imageRequest));
    const samples = [];
    const visitedImages = new Set<string>();
    let coldTransferBytes = 0;
    for (let sample = 0; sample < 3; sample++) {
      if (sample === 0) await page.goto("/");
      else await page.reload();
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
      await expect
        .poll(() =>
          images.evaluateAll((items) => {
            const viewport = document.getElementById("tablecast-order")?.getBoundingClientRect();
            if (!viewport) return false;
            const visible = items.filter((image) => {
              const bounds = image.getBoundingClientRect();
              return bounds.bottom > viewport.top && bounds.top < viewport.bottom;
            });
            return (
              visible.length > 0 &&
              visible.every(
                (image) =>
                  image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
              )
            );
          }),
        )
        .toBe(true);
      const measured = await page.evaluate(() => ({
        ...window.tablecastImageMetrics,
        dpr: devicePixelRatio,
        htmlBytes: new TextEncoder().encode(document.documentElement.outerHTML).byteLength,
        navigation: performance.getEntriesByType("navigation").map((entry) => {
          if (!(entry instanceof PerformanceNavigationTiming)) return null;
          return {
            ttfb: entry.responseStart > 0 ? entry.responseStart - entry.requestStart : null,
            duration: entry.duration,
            serverTiming: entry.serverTiming.map(({ name, duration }) => ({ name, duration })),
            encodedBytes: entry.encodedBodySize,
          };
        }),
        scriptBytes: performance
          .getEntriesByType("resource")
          .filter(
            (entry): entry is PerformanceResourceTiming =>
              entry instanceof PerformanceResourceTiming && /\.js(?:\?|$)/.test(entry.name),
          )
          .reduce((sum, entry) => sum + entry.encodedBodySize, 0),
        resources: performance
          .getEntriesByType("resource")
          .filter(
            (entry): entry is PerformanceResourceTiming =>
              entry instanceof PerformanceResourceTiming &&
              entry.name.includes("/images/tablecast/"),
          )
          .map((entry) => ({
            key: new URL(entry.name).pathname + new URL(entry.name).search,
            width: new URL(entry.name).searchParams.get("width"),
            transfer: entry.transferSize,
            body: entry.encodedBodySize,
            start: entry.startTime,
            request: entry.requestStart,
            response: entry.responseStart,
            ttfb: entry.responseStart - entry.requestStart,
            end: entry.responseEnd,
            serverTiming: entry.serverTiming.map(({ name, duration }) => ({ name, duration })),
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
      await testInfo.attach(`tablecast-image-sample-${sample}`, {
        body: JSON.stringify(measured, null, 2),
        contentType: "application/json",
      });
      console.log(JSON.stringify({ count, sample, measured }));
      expect(measured.resourceBufferFull).toBe(false);
      expect(measured.cls === null || measured.cls < 0.1).toBe(true);
      const transferred = measured.resources.some((resource) => resource.body > 0)
        ? measured.resources.reduce((total, resource) => total + resource.transfer, 0)
        : null;
      expect(browserName !== "chromium" || transferred !== null).toBe(true);
      if (transferred !== null) {
        // lazy画像は再読込時に初めて取得される場合がある。取得済みURLだけをwarmと判定する。
        const warmTransfer = measured.resources
          .filter((resource) => visitedImages.has(resource.key))
          .reduce((total, resource) => total + resource.transfer, 0);
        coldTransferBytes += measured.resources
          .filter((resource) => !visitedImages.has(resource.key))
          .reduce((total, resource) => total + resource.transfer, 0);
        expect(warmTransfer).toBe(0);
        expect(coldTransferBytes).toBeLessThanOrEqual(500_000);
        for (const resource of measured.resources) {
          if (resource.body > 0) visitedImages.add(resource.key);
        }
      } else if (sample === 0) {
        testInfo.annotations.push({
          type: "計測制限",
          description: "Resource Timingのbyte数を取得できないため、転送予算はChromiumで検証する",
        });
      }
      for (const image of measured.images)
        expect(Math.abs(image.width - image.height)).toBeLessThan(1);
      samples.push({ sample, transferBytes: transferred, coldTransferBytes, ...measured });
    }
    const lastImage = page.locator("#tablecast-order img").last();
    await page
      .locator("#tablecast-order button")
      .filter({ has: page.locator("img") })
      .last()
      .scrollIntoViewIfNeeded();
    await expect(lastImage).toBeVisible();
    await expect
      .poll(() =>
        lastImage.evaluate(
          (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        ),
      )
      .toBe(true);
    const source = await page
      .locator("#tablecast-order img")
      .first()
      .evaluate((image) => (image instanceof HTMLImageElement ? image.currentSrc : ""));
    const cache = [];
    for (let repeat = 0; repeat < 3; repeat++) {
      const response = await page.request.get(source);
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
    const detail = page.getByRole("region", {
      name: fixtureValue(originals[0]).text.ja.displayName,
      exact: true,
    });
    const detailImage = detail.getByRole("img", {
      name: fixtureValue(originals[0]).text.ja.displayName,
      exact: true,
    });
    await expect
      .poll(() =>
        detailImage.evaluate(
          (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        ),
      )
      .toBe(true);
    const detailBounds = await detailImage.boundingBox();
    await detail.getByRole("button", { name: ja.kiosk_add, exact: true }).click();
    await expect(detail).toHaveCount(0);
    await page.getByRole("tab", { name: /^注文かご/ }).click();
    const cartImage = page.locator('[data-ui="cart-lines"] img');
    await expect(cartImage).toHaveCount(1);
    await expect(cartImage).toBeVisible();
    await expect
      .poll(() =>
        cartImage.evaluate(
          (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        ),
      )
      .toBe(true);
    const cartBounds = await cartImage.boundingBox();
    expect(cartBounds?.width).toBeCloseTo(112, 2);
    expect(cartBounds?.height).toBeCloseTo(cartBounds?.width ?? 0, 2);
    await testInfo.attach("tablecast-image-metrics", {
      body: JSON.stringify(
        { count, catalogBytes, samples, cache, detailBounds, cartBounds },
        null,
        2,
      ),
      contentType: "application/json",
    });
    console.log(JSON.stringify({ count, catalogBytes, samples, cache, detailBounds, cartBounds }));
  });
}
