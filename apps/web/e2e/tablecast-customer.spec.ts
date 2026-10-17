import { expect } from "@playwright/test";
import { test } from "./support/test";
import { credentials } from "./support/runtime";
import ja from "../messages/ja.json" with { type: "json" };
import { adminStateSchema, tableStateSchema } from "@tablecast/api/schema";
import { z } from "zod";

test.use({ viewport: { width: 390, height: 844 }, trace: "off" });

test("二人がスマホで来店QRを開き、初回同意後の再来店では追加操作なしで参加する", async ({
  page: staff,
  browser,
  baseURL,
}) => {
  const contexts = await Promise.all([
    browser.newContext({ baseURL, viewport: { width: 1024, height: 768 } }),
    browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
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
    // 遷移中にbodyが破棄される前に、受信したQR応答を読む。
    const codeResponse = tablet
      .waitForResponse((response) => response.url().endsWith("/customer-code") && response.ok())
      .then(async (response) => z.object({ url: z.url() }).parse(await response.json()));
    await tablet.goto("/");
    const code = await codeResponse;
    await expect(
      tablet
        .getByRole("region", { name: ja.customer_join_visit })
        .locator("svg")
        .filter({ hasText: ja.customer_join_visit }),
    ).toBeVisible();
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
    const privateVisit = await first.reload();
    expect(privateVisit?.headers()["cache-control"]).toBe("private, no-store");
    expect((await staff.request.post(`${adminBase}/tables/${visit.id}/close`)).ok()).toBe(true);
    await expect(
      first.getByRole("status").filter({ hasText: ja.customer_disconnected }),
    ).toBeVisible();
    const next = await open();
    const nextCodeResponse = tablet
      .waitForResponse((response) => response.url().endsWith("/customer-code") && response.ok())
      .then(async (response) => z.object({ url: z.url() }).parse(await response.json()));
    await tablet.reload();
    const nextCode = await nextCodeResponse;
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
