import { expect } from "@playwright/test";
import en from "../messages/en.json" with { type: "json" };
import ja from "../messages/ja.json" with { type: "json" };
import { signInStaff } from "./support/session";
import { test } from "./support/test";

test.use({ trace: "off", serviceWorkers: "block" });

test("店側から開いたデモのiframeだけで客言語を変更し、再読込と別タブでも分離する", async ({
  page,
  baseURL,
}) => {
  const storeId = "tablecast-komorebi";
  await signInStaff(page.request, baseURL);
  await page.goto(`/admin/stores/${storeId}/floor`);
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  const opened = page.waitForEvent("popup");
  await page.getByRole("link", { name: ja.demo_open, exact: true }).click();
  const demo = await opened;
  try {
    await expect(demo).toHaveURL(/demo\?demoId=/);
    const demoId = new URL(demo.url()).searchParams.get("demoId");
    if (!demoId) throw new Error("デモIDがありません。");
    expect(
      (
        await page.request.patch(`/api/admin/stores/${storeId}/demo/${demoId}/table/locale`, {
          data: { locale: "ja" },
        })
      ).ok(),
    ).toBe(true);
    const frame = demo.getByTitle(ja.demo_screen, { exact: true }).contentFrame();
    await expect(frame.getByRole("tab", { name: ja.kiosk_menu, exact: true })).toBeVisible();
    await frame.getByRole("button", { name: "English", exact: true }).click();
    await expect(frame.getByRole("button", { name: "English", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(frame.locator("html")).toHaveAttribute("lang", "en");
    await expect(demo.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    const rotate = demo.getByRole("button", { name: ja.demo_rotate, exact: true });
    await rotate.click();
    await expect(demo).toHaveURL((url) => url.searchParams.get("portrait") === "true");
    await expect(rotate).toHaveAttribute("aria-pressed", "true");
    // 実file routeが保存した向きを新しいdocumentでも復元する。
    await demo.reload();
    await expect(rotate).toHaveAttribute("aria-pressed", "true");
    await expect(frame.getByRole("tab", { name: en.kiosk_menu, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "日本語", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const reopened = page.waitForEvent("popup");
    await page.getByRole("link", { name: ja.demo_open, exact: true }).click();
    const independent = await reopened;
    try {
      await expect(independent).toHaveURL(/demo\?demoId=/);
      const independentId = new URL(independent.url()).searchParams.get("demoId");
      expect(independentId).toBeTruthy();
      expect(independentId).not.toBe(demoId);
      expect(
        (
          await page.request.patch(
            `/api/admin/stores/${storeId}/demo/${independentId}/table/locale`,
            {
              data: { locale: "ja" },
            },
          )
        ).ok(),
      ).toBe(true);
      const independentFrame = independent
        .getByTitle(ja.demo_screen, { exact: true })
        .contentFrame();
      await expect(independentFrame.locator("html")).toHaveAttribute("lang", "ja");
      await expect(frame.locator("html")).toHaveAttribute("lang", "en");
      await expect(demo.locator("html")).toHaveAttribute("lang", "ja");
      await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    } finally {
      await independent.close();
    }
  } finally {
    await demo.close();
  }
});
