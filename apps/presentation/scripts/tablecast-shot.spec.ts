import { waitForTablecastState } from "./tablecast-app-capture";
import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { captureShot, measureSubject, shotSchema } from "./tablecast-shot";

test("@product 撮影対象自身と祖先の非表示・透明化を検出する", async ({ page }) => {
  for (const style of ["visibility:hidden", "opacity:0", "display:none"]) {
    for (const parent of [false, true]) {
      await page.setContent(
        `<div style="${parent ? style : ""}"><article style="${parent ? "" : style}">撮影内容</article></div>`,
      );
      expect((await measureSubject(page.locator("article"))).visible, `${style}/${parent}`).toBe(
        false,
      );
    }
  }
  await page.setContent(
    '<div style="visibility:hidden"><article style="visibility:visible">撮影内容</article></div>',
  );
  expect((await measureSubject(page.locator("article"))).visible).toBe(true);
});

test("@product 撮影対象の複数セルをまとめ、祖先による欠けを検出する", async ({ page }) => {
  await page.setContent(
    '<div style="height:60px;overflow:hidden"><div class="subject" style="height:40px">90ml</div><div class="subject" style="height:40px">￥160</div></div>',
  );
  const clipped = await measureSubject(page.locator(".subject"));
  expect(clipped.visible).toBe(false);
  expect(clipped.text).toContain("90ml\n￥160");
  await page
    .locator(".subject")
    .last()
    .evaluate((element) => {
      if (element.parentElement) element.parentElement.style.height = "100px";
    });
  const complete = await measureSubject(page.locator(".subject"));
  expect(complete.visible).toBe(true);
  expect(complete.height * 1080).toBeCloseTo(80);
});

test("@product 注文成立を待って履歴を開き、必要情報の保持を記録する", async ({ page }, info) => {
  let polls = 0;
  let submittedAt = 0;
  await page.route("http://tablecast-shot.test/**", async (route) => {
    if (route.request().url().endsWith("/api/table")) {
      const ready = ++polls >= 3;
      if (ready) submittedAt = Date.now();
      await route.fulfill({
        json: {
          orders: ready ? [{}] : [],
          cart: { lines: ready ? [] : [{}] },
          snapshot: null,
          voiceState: "idle",
        },
      });
    } else
      await route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: "<button onclick=\"document.body.dataset.clicked=Date.now();document.querySelector('article').hidden=false\">注文履歴</button><article hidden>月凪 数量 1 ￥780</article>",
      });
  });
  await page.goto("http://tablecast-shot.test/");
  const shot = shotSchema.parse({
    intent: "送信済み注文",
    state: "order-submitted",
    steps: [{ role: "button", name: "注文履歴" }],
    subject: { selector: "article", required: ["月凪", "数量 1", "780"] },
    hold: 2.5,
  });
  const out = info.outputPath("capture");
  await mkdir(out, { recursive: true });
  const evidence = await captureShot(page, "result", shot, out, (state) =>
    waitForTablecastState(page, state),
  );
  expect(Number(await page.locator("body").getAttribute("data-clicked"))).toBeGreaterThanOrEqual(
    submittedAt,
  );
  expect(polls).toBe(3);
  expect(evidence.endAt - evidence.readyAt).toBeGreaterThanOrEqual(2500);
  expect(evidence.text).toContain("￥780");
});
