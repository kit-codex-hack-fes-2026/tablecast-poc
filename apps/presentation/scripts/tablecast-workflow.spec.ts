import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { captureShot, shotSchema } from "./tablecast-shot";

test("@product 別アプリの成立条件を待ち、変更後のUI位置を再実測する", async ({ page }, info) => {
  const out = info.outputPath("booking");
  await mkdir(out, { recursive: true });
  await page.setContent(
    '<button>確定</button><article style="margin:40px;width:320px;height:80px" hidden>予約済み 2名</article>',
  );
  const shot = shotSchema.parse({
    intent: "予約の成立",
    state: "booking-saved",
    steps: [],
    subject: { selector: "article", required: ["予約済み", "2名"] },
    hold: 2.5,
  });
  await expect(captureShot(page, "reservation", shot, out)).rejects.toThrow("状態待ちが未指定");
  const wait = async (state: string) => {
    expect(state).toBe("booking-saved");
    await page.locator("article").evaluate((n) => {
      if (n instanceof HTMLElement) n.hidden = false;
    });
    await expect(page.locator("article")).toBeVisible();
  };
  const first = await captureShot(page, "reservation", shot, out, wait);
  await page.locator("article").evaluate((n) => {
    n.style.marginLeft = "460px";
  });
  const moved = await captureShot(page, "reservation-moved", shot, out, wait);
  expect(moved.target.x).toBeGreaterThan(first.target.x + 0.2);
  expect(moved.text).toBe(first.text);
  expect(moved.endAt - moved.readyAt).toBeGreaterThanOrEqual(2500);
});
