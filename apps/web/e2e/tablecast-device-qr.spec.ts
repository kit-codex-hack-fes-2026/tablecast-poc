import { test } from "./support/test";
import { expect, type Page } from "@playwright/test";
import ja from "../messages/ja.json" with { type: "json" };
import { credentials } from "./support/runtime";

test.use({ trace: "off" });
const registration = "/admin/stores/tablecast-komorebi/devices/new";

async function deviceQr(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await page.getByRole("button", { name: ja.pair_begin, exact: true }).click();
  const code = await page.getByRole("status", { name: ja.admin_pair_code }).innerText();
  const buffer = await page.locator("svg").filter({ hasText: ja.admin_pair }).screenshot();
  return { code, buffer };
}

test.beforeEach(async ({ page, baseURL }) => {
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        headers: { Origin: baseURL ?? "" },
        data: credentials,
      })
    ).ok(),
  ).toBe(true);
});

test("端末のQR画像でコードと選択した卓を保持し、明示承認後にだけ登録する", async ({ page }) => {
  // Given: 未承認の端末が実際に表示したQR画像と、選択済みの卓。
  const { code, buffer } = await deviceQr(page);
  await page.goto(`${registration}?tableId=tablecast-komorebi-table-10`);
  let approvals = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/devices/approve")) approvals++;
  });
  // When: 画像を読み取る。
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: ja.device_scan_image, exact: true }).click(),
  ]);
  await fileChooser.setFiles({
    name: "tablecast-device.png",
    mimeType: "image/png",
    buffer,
  });
  // Then: URLと入力へ反映するだけで、明示操作までは承認しない。
  await expect(page.getByLabel(ja.admin_pair_code, { exact: true })).toHaveValue(code);
  await expect(page.getByRole("status").filter({ hasText: ja.device_scan_success })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("tableId")).toBe("tablecast-komorebi-table-10");
  expect(new URL(page.url()).searchParams.get("user_code")).toBe(code);
  expect(approvals).toBe(0);
  await page.reload();
  await expect(page.getByLabel(ja.admin_pair_code, { exact: true })).toHaveValue(code);
  await expect(
    page
      .getByRole("row", { name: `T10 ${ja.common_selected}`, exact: true })
      .getByRole("button", { name: ja.common_selected, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: ja.admin_approve, exact: true }).click();
  await expect(page).toHaveURL(/\/devices$/);
  expect(approvals).toBe(1);
});

// カメラの成功・中止・unmountはDeviceQrReaderのBrowser Modeで実トラックを検証する。

test("カメラ拒否と画像の読み取り失敗を説明し、コードを手入力できる", async ({ page }) => {
  // Given: カメラの利用を許可しない環境。
  await page.goto(registration);
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        throw new DOMException("拒否", "NotAllowedError");
      },
    });
  });
  // When: カメラと読み取れない画像を試す。
  await page.getByRole("button", { name: ja.device_scan_start, exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(ja.device_scan_camera_error);
  await expect(page.locator("video")).toHaveCount(0);
  await page.getByLabel(ja.device_scan_image, { exact: true }).setInputFiles({
    name: "tablecast-invalid.png",
    mimeType: "image/png",
    buffer: await page.getByRole("heading", { name: ja.admin_pair, exact: true }).screenshot(),
  });
  // Then: 既存のコード入力で続けられる。
  await expect(page.getByRole("alert")).toHaveText(ja.device_scan_image_error);
  await page.getByLabel(ja.admin_pair_code, { exact: true }).fill("ABCD1234");
  await expect(page.getByLabel(ja.admin_pair_code, { exact: true })).toHaveValue("ABCD1234");
});
