import { expect } from "@playwright/test";
import { test } from "./support/test";
import { credentials } from "./support/runtime";
import ja from "../messages/ja.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };

test.use({ trace: "off" });

test("店側から開いたデモのiframeだけで客言語を変更し、再読込と別タブでも分離する", async ({
  page,
  baseURL,
}) => {
  const storeId = "tablecast-komorebi";
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        headers: { Origin: baseURL ?? "" },
        data: credentials,
      })
    ).ok(),
  ).toBe(true);
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
    const frame = demo.frameLocator("iframe");
    await expect(frame.getByRole("tab", { name: ja.kiosk_menu, exact: true })).toBeVisible();
    await frame.getByRole("button", { name: "English", exact: true }).click();
    await expect(frame.getByRole("button", { name: "English", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(frame.locator("html")).toHaveAttribute("lang", "en");
    await expect(demo.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await demo.getByRole("button", { name: ja.demo_rotate }).click();
    await demo.reload();
    await expect(demo.getByRole("button", { name: ja.demo_rotate })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
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
      expect(new URL(independent.url()).searchParams.get("demoId")).not.toBe(demoId);
    } finally {
      await independent.close();
    }
  } finally {
    await demo.close();
  }
});
