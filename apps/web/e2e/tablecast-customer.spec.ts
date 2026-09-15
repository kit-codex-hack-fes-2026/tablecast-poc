import { expect } from "@playwright/test";
import { test } from "./support/test";
import { credentials } from "./support/runtime";
import ja from "../messages/ja.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import {
  adminStateSchema,
  tableStateSchema,
  uploadedImageSchema,
  catalogSchema,
} from "@tablecast/api/schema";
import { z } from "zod";

test.use({ viewport: { width: 390, height: 844 }, trace: "off" });

test("会員証の初回同意と設定変更をスマホで行い、再表示でも保持する", async ({
  page,
  baseURL,
}, testInfo) => {
  await page.goto("/member/tablecast-komorebi");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        headers: { Origin: baseURL ?? "" },
        data: credentials,
      })
    ).ok(),
  ).toBe(true);
  const response = await page.goto("/member/tablecast-komorebi");
  expect(response?.headers()["cache-control"]).toBe("private, no-store");
  await expect(page.getByRole("heading", { name: ja.customer_consent_title })).toBeVisible();
  await expect(page.getByRole("button", { name: ja.customer_enrol, exact: true })).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("tablecast-customer-consent-ja.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: ja.customer_enrol, exact: true }).click();
  await expect(page.getByRole("heading", { name: ja.customer_preferences })).toBeVisible();
  await page.getByRole("checkbox", { name: ja.customer_save_memories, exact: true }).uncheck();
  const saved = page.waitForResponse(
    (result) => result.url().endsWith("/preferences") && result.request().method() === "POST",
  );
  await page.getByRole("button", { name: ja.customer_save_preferences }).click();
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: ja.customer_save_memories, exact: true }),
  ).not.toBeChecked();
  await expect(page.getByRole("button", { name: ja.customer_enrol, exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("tablecast-customer-card-ja.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("heading", { name: en.customer_preferences })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("tablecast-customer-card-en.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: en.customer_memories, exact: true }).click();
  await page.getByRole("button", { name: en.customer_memory_add }).click();
  await page
    .getByRole("textbox", { name: en.customer_memory_content })
    .fill("I prefer less sweet drinks.");
  await page.getByRole("button", { name: en.account_save, exact: true }).click();
  await expect(page.getByText("I prefer less sweet drinks.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: en.customer_edit, exact: true }).click();
  await page
    .getByRole("textbox", { name: en.customer_memory_content })
    .fill("I prefer dry gin cocktails.");
  await page.getByRole("button", { name: en.account_save, exact: true }).click();
  await expect(page.getByText("I prefer dry gin cocktails.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("I prefer dry gin cocktails.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: en.customer_memory_add })).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("tablecast-customer-memories-en.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: en.customer_delete, exact: true }).click();
  await expect(page.getByText("I prefer dry gin cocktails.", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: en.customer_title, exact: true }).click();
  await expect(page.getByRole("link", { name: /京料理こもれび/ })).toBeVisible();
});

test("二人がスマホで来店QRを開き、初回同意後の再来店では追加操作なしで参加する", async ({
  page: staff,
  browser,
  baseURL,
}, testInfo) => {
  const contexts = await Promise.all([
    browser.newContext({ baseURL, viewport: { width: 1024, height: 768 } }),
    browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
      recordVideo: {
        dir: testInfo.outputPath("tablecast-phone-video"),
        size: { width: 390, height: 844 },
      },
    }),
    browser.newContext({ baseURL, viewport: { width: 390, height: 844 } }),
  ]);
  const [tabletContext, firstContext, secondContext] = contexts;
  if (!tabletContext || !firstContext || !secondContext) throw new Error("試験用の端末が必要です");
  const tablet = await tabletContext.newPage();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  const storeId = "tablecast-komorebi";
  const adminBase = `/api/admin/stores/${storeId}`;
  try {
    expect(
      (
        await staff.request.post("/api/auth/sign-in/email", {
          headers: { Origin: baseURL ?? "" },
          data: credentials,
        })
      ).ok(),
    ).toBe(true);
    const policy = z
      .object({ version: z.number() })
      .parse(await (await staff.request.get(`${adminBase}/points/policy`)).json());
    expect(
      (
        await staff.request.post(`${adminBase}/points/policy`, {
          headers: { Origin: baseURL ?? "" },
          data: {
            expectedVersion: policy.version,
            enabled: true,
            kind: "visit",
            points: 4,
            unitYen: 100,
          },
        })
      ).ok(),
    ).toBe(true);
    const floor = adminStateSchema.parse(await (await staff.request.get(adminBase)).json());
    const vacant = floor.vacantTables[0];
    if (!vacant) throw new Error("試験用の空卓が必要です");
    const open = async () =>
      tableStateSchema.parse(
        await (
          await staff.request.post(`${adminBase}/tables/open`, {
            data: { tableId: vacant.id, guestCount: 2, locale: "ja" },
          })
        ).json(),
      );
    // 券面は実R2への画像アップロードと店舗側フォームを通して設定する。
    await staff.goto(`/admin/stores/${storeId}/coupons`);
    await staff.getByRole("button", { name: ja.coupon_new, exact: true }).click();
    await staff.getByLabel(ja.coupon_title_ja).fill("会員の100円割引");
    await staff.getByLabel(ja.coupon_title_en).fill("Member discount");
    await staff.getByLabel(ja.coupon_description_ja).fill("会計から100円割り引きます。");
    await staff.getByLabel(ja.coupon_description_en).fill("JPY 100 off your bill.");
    await staff.getByLabel(ja.coupon_trigger).selectOption("exchange");
    await staff.getByLabel(ja.coupon_threshold).fill("3");
    const imageField = staff.getByRole("group", { name: ja.editor_image_settings, exact: true });
    const catalog = catalogSchema.parse(
      await (await staff.request.get(`${adminBase}/catalog`)).json(),
    );
    const imageKey = catalog.configuration.products.find((product) => product.imageKey)?.imageKey;
    if (!imageKey) throw new Error("試験用の画像が必要です");
    const imageFile = await staff.request.get(`/media/${imageKey}`);
    expect(imageFile.status()).toBe(200);
    await imageField.getByLabel(ja.editor_image_choose).setInputFiles({
      name: "tablecast-coupon.webp",
      mimeType: "image/webp",
      buffer: await imageFile.body(),
    });
    await imageField
      .getByRole("textbox", { name: ja.editor_image_source, exact: true })
      .fill("店舗が利用を許可したテスト用メニュー画像");
    const uploadFinished = staff.waitForResponse(
      (response) =>
        response.url().endsWith(`${adminBase}/images`) && response.request().method() === "POST",
    );
    await imageField.getByRole("button", { name: ja.editor_image_upload }).click();
    const upload = await uploadFinished;
    expect(upload.status()).toBe(200);
    uploadedImageSchema.parse(await upload.json());
    const ruleSaved = staff.waitForResponse(
      (response) =>
        response.url().endsWith("/coupons/rules") && response.request().method() === "POST",
    );
    await staff.getByRole("button", { name: ja.account_save, exact: true }).click();
    expect((await ruleSaved).status()).toBe(200);
    await staff.screenshot({
      path: testInfo.outputPath("tablecast-coupon-rules.png"),
      fullPage: true,
    });
    const visit = await open();
    const device = z
      .object({ device_code: z.string(), user_code: z.string() })
      .parse(await (await tablet.request.post("/api/devices/request")).json());
    expect(
      (
        await staff.request.post(`${adminBase}/devices/approve`, {
          data: { userCode: device.user_code, tableId: vacant.id },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await tablet.request.post("/api/devices/poll", {
          data: { device_code: device.device_code },
        })
      ).ok(),
    ).toBe(true);
    const codeResponse = tablet.waitForResponse(
      (response) => response.url().endsWith("/customer-code") && response.ok(),
    );
    await tablet.goto("/");
    const code = z.object({ url: z.url() }).parse(await (await codeResponse).json());
    await expect(
      tablet
        .getByRole("region", { name: ja.customer_join_visit })
        .locator("svg")
        .filter({ hasText: ja.customer_join_visit }),
    ).toBeVisible();
    await tablet.screenshot({ path: testInfo.outputPath("tablecast-customer-qr-ipad.png") });
    // OSのカメラがQRのURLを開いた後から、実アプリの認証・同意・自動参加を検証する。
    await first.goto(code.url);
    await expect(first).toHaveURL(/\/login\?returnTo=/);
    await first.getByLabel(ja.auth_email).fill(credentials.email);
    await first.getByLabel(ja.auth_password, { exact: true }).fill(credentials.password);
    await first.getByRole("button", { name: ja.auth_sign_in, exact: true }).click();
    await first.getByRole("button", { name: ja.customer_enrol, exact: true }).click();
    await expect(
      first.getByRole("status").filter({ hasText: ja.customer_connected }),
    ).toBeVisible();
    expect(
      (
        await second.request.post("/api/auth/sign-in/email", {
          headers: { Origin: baseURL ?? "" },
          data: { email: credentials.otherEmail, password: credentials.otherPassword },
        })
      ).ok(),
    ).toBe(true);
    await second.goto(code.url);
    await second.getByRole("button", { name: ja.customer_enrol, exact: true }).click();
    await expect(
      second.getByRole("status").filter({ hasText: ja.customer_connected }),
    ).toBeVisible();
    await expect(
      tablet.getByRole("region", { name: ja.customer_join_visit }).locator("li"),
    ).toHaveCount(2);
    await expect(
      first.getByRole("heading", { name: ja.customer_companions }).locator("..").locator("li"),
    ).toHaveCount(2);
    await first.screenshot({
      path: testInfo.outputPath("tablecast-customer-companions.png"),
      fullPage: true,
    });
    await staff.goto(`/admin/stores/${storeId}/visits/${visit.id}?view=billing`);
    const points = staff.locator("section").filter({
      has: staff.getByRole("heading", { name: ja.customer_points_confirm, exact: true }),
    });
    await expect(points.getByRole("checkbox")).toHaveCount(2);
    for (const checkbox of await points.getByRole("checkbox").all()) await checkbox.check();
    const awarded = staff.waitForResponse(
      (response) =>
        response.url().endsWith(`/tables/${visit.id}/points`) &&
        response.request().method() === "POST",
    );
    await points.getByRole("button", { name: ja.customer_points_award }).click();
    expect((await awarded).status()).toBe(200);
    await expect(points.getByText(ja.customer_points_confirmed, { exact: true })).toBeVisible();
    await staff.screenshot({
      path: testInfo.outputPath("tablecast-customer-points-staff.png"),
      fullPage: true,
    });
    await first.goto(`/member/${storeId}/points`);
    await expect(
      first.getByRole("heading", { name: ja.customer_points, exact: true }),
    ).toBeVisible();
    await expect(first.getByText("+4 pt", { exact: true })).toBeVisible();
    await first.screenshot({
      path: testInfo.outputPath("tablecast-customer-points.png"),
      fullPage: true,
    });
    await first.goto(`/member/${storeId}/coupons?sessionId=${visit.id}`);
    await first.getByRole("button", { name: `${ja.coupon_exchange} · 3 pt`, exact: true }).click();
    await expect(first.getByText(ja.coupon_available, { exact: true })).toBeVisible();
    const requested = first.waitForResponse(
      (response) => response.url().endsWith("/request") && response.request().method() === "POST",
    );
    await expect(first.getByRole("button", { name: ja.coupon_request })).toBeEnabled();
    await first.getByRole("button", { name: ja.coupon_request }).click();
    expect((await requested).status()).toBe(200);
    await first.screenshot({
      path: testInfo.outputPath("tablecast-customer-coupon.png"),
      fullPage: true,
    });
    expect(
      (
        await staff.request.post(`${adminBase}/tables/${visit.id}/payments`, {
          data: {
            amount: 1000,
            kind: "adjustment",
            reason: "会計",
            idempotencyKey: crypto.randomUUID(),
          },
        })
      ).ok(),
    ).toBe(true);
    await staff.goto(`/admin/stores/${storeId}/visits/${visit.id}?view=billing`);
    const applied = staff.waitForResponse(
      (response) =>
        response.url().endsWith("/coupons/apply") && response.request().method() === "POST",
    );
    await staff.getByRole("button", { name: ja.coupon_apply, exact: true }).click();
    expect((await applied).status()).toBe(200);
    await expect(staff.getByText("−¥100", { exact: true })).toBeVisible();
    await staff.screenshot({
      path: testInfo.outputPath("tablecast-coupon-billing.png"),
      fullPage: true,
    });
    const cancelled = staff.waitForResponse(
      (response) =>
        response.url().endsWith("/coupons/cancel") && response.request().method() === "POST",
    );
    await staff.getByLabel(ja.coupon_reason, { exact: true }).fill("会計訂正のため取消");
    await staff.getByRole("button", { name: ja.coupon_cancel, exact: true }).click();
    expect((await cancelled).status()).toBe(200);
    expect(
      (
        await staff.request.post(`${adminBase}/tables/${visit.id}/payments`, {
          data: {
            amount: 1000,
            kind: "payment",
            reason: "会計",
            idempotencyKey: crypto.randomUUID(),
          },
        })
      ).ok(),
    ).toBe(true);
    await first.goto(`/member/${storeId}/visits/${visit.id}`);
    expect((await staff.request.post(`${adminBase}/tables/${visit.id}/close`)).ok()).toBe(true);
    await expect(
      first.getByRole("status").filter({ hasText: ja.customer_disconnected }),
    ).toBeVisible();
    const next = await open();
    const nextCodeResponse = tablet.waitForResponse(
      (response) => response.url().endsWith("/customer-code") && response.ok(),
    );
    await tablet.reload();
    const nextCode = z.object({ url: z.url() }).parse(await (await nextCodeResponse).json());
    for (const phone of [first, second]) {
      let enrolments = 0;
      phone.on("request", (request) => {
        if (request.url().endsWith("/enrol")) enrolments++;
      });
      await phone.goto(nextCode.url);
      await expect(phone).toHaveURL(new RegExp(`/member/${storeId}/visits/${next.id}$`));
      await expect(
        phone.getByRole("status").filter({ hasText: ja.customer_connected }),
      ).toBeVisible();
      await expect(phone.getByRole("button", { name: ja.customer_enrol, exact: true })).toHaveCount(
        0,
      );
      expect(enrolments).toBe(0);
    }
    await second.getByRole("button", { name: ja.customer_leave_visit }).click();
    await expect(
      second.getByRole("status").filter({ hasText: ja.customer_disconnected }).first(),
    ).toBeVisible();
    await expect(
      tablet.getByRole("region", { name: ja.customer_join_visit }).locator("li"),
    ).toHaveCount(1);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
