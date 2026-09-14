import { expect } from "@playwright/test";
import { performanceBatchSchema, type PerformanceMetric } from "@tablecast/api/schema";
import { test } from "./support/test";

test.use({ serviceWorkers: "block" });
test("初回と再訪の実ブラウザー指標をSSRトレースに結び付けて受信する", async ({ page }) => {
  const samples: PerformanceMetric[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/performance" && request.postData())
      samples.push(...performanceBatchSchema.parse(request.postDataJSON()).metrics);
  });
  const document = await page.goto("/login");
  const serverTiming = document?.headers()["server-timing"];
  expect(serverTiming).toContain('tablecast-release;desc="');
  expect(serverTiming).toMatch(/tablecast-trace;desc="[a-f0-9]{32}"/);
  const initial = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/performance",
  );
  await page.getByLabel("メールアドレス", { exact: true }).click();
  expect((await initial).status()).toBe(202);
  expect(samples).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "page-ready",
        page: "login",
        visit: "first",
        navigation: "navigate",
      }),
      expect.objectContaining({ name: "TTFB", page: "login", visit: "first" }),
    ]),
  );
  const ready = samples.find((metric) => metric.name === "page-ready");
  expect(serverTiming).toContain(ready?.documentTraceId);
  expect(samples.every((metric) => Number.isFinite(metric.value) && metric.value >= 0)).toBe(true);
  samples.length = 0;
  await page.reload();
  await expect
    .poll(
      () =>
        samples.some(
          (metric) =>
            metric.name === "page-ready" &&
            metric.visit === "return" &&
            metric.navigation === "reload",
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
});
