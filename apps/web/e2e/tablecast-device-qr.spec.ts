import { expect, test, type Page } from "@playwright/test";
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
  await page.getByLabel(ja.device_scan_image, { exact: true }).setInputFiles({
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
  await page.getByRole("button", { name: ja.admin_approve, exact: true }).click();
  await expect(page).toHaveURL(/\/devices$/);
  expect(approvals).toBe(1);
});

test("カメラ映像のQRを読み取り、成功・中止・ページ移動で送像を停止する", async ({ page }) => {
  // Given: 実端末のQRを描いた映像をカメラ入力の境界から供給する。
  const { code, buffer } = await deviceQr(page);
  await page.goto(registration);
  await page.evaluate(
    (dataUrl) => {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 640;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("テスト映像を描画できません。");
            context.fillStyle = "white";
            context.fillRect(0, 0, 640, 640);
            const image = new Image();
            image.src = dataUrl;
            await image.decode();
            context.drawImage(image, 176, 176, 288, 288);
            const stream = canvas.captureStream(10);
            const timer = setInterval(() => {
              context.drawImage(image, 176, 176, 288, 288);
              if (stream.getTracks().every((track) => track.readyState === "ended"))
                clearInterval(timer);
            }, 200);
            return stream;
          },
        },
      });
    },
    `data:image/png;base64,${btoa(Array.from(buffer, (byte) => String.fromCharCode(byte)).join(""))}`,
  );
  // When: カメラを開始し、映像を読み取る。
  await page.getByRole("button", { name: ja.device_scan_start, exact: true }).click();
  await expect(page.getByLabel(ja.admin_pair_code, { exact: true })).toHaveValue(code);
  await expect(page.locator("video")).toHaveCount(0);
  // Then: 中止とページ移動でも開始した映像トラックを終了する。
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 640;
        canvas.getContext("2d")?.fillRect(0, 0, 640, 640);
        return canvas.captureStream(10);
      },
    });
  });
  for (const action of ["stop", "navigate"] as const) {
    await page.getByRole("button", { name: ja.device_scan_start, exact: true }).click();
    await expect
      .poll(() =>
        page
          .locator("video")
          .evaluate(
            (video) => video instanceof HTMLVideoElement && video.srcObject instanceof MediaStream,
          ),
      )
      .toBe(true);
    const stream = await page
      .locator("video")
      .evaluateHandle((video) => (video instanceof HTMLVideoElement ? video.srcObject : null));
    if (action === "stop")
      await page.getByRole("button", { name: ja.device_scan_stop, exact: true }).click();
    else await page.getByRole("link", { name: ja.device_title, exact: true }).last().click();
    await expect
      .poll(() =>
        stream.evaluate(
          (value) =>
            value instanceof MediaStream &&
            value.getTracks().every((track) => track.readyState === "ended"),
        ),
      )
      .toBe(true);
  }
});

test("カメラ拒否と画像の読み取り失敗を説明し、コードを手入力できる", async ({ page }) => {
  // Given: カメラの利用を許可しない環境。
  await page.goto(registration);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException("拒否", "NotAllowedError");
        },
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
