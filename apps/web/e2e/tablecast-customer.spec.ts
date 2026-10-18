import { expect, type Request } from "@playwright/test";
import { test } from "./support/test";
import { credentials } from "./support/runtime";
import { approveGuestDevice, signInStaff } from "./support/session";
import ja from "../messages/ja.json" with { type: "json" };
import { adminStateSchema, customerConsentVersion, tableStateSchema } from "@tablecast/api/schema";
import { z } from "zod";

test.use({ viewport: { width: 390, height: 844 }, trace: "off", serviceWorkers: "block" });

test("会員の券と交換候補の0件をJavaScriptなしの初期HTMLから表示する", async ({
  page,
  browser,
  baseURL,
}) => {
  const storeId = "tablecast-komorebi";
  await signInStaff(page.request, baseURL);
  const enrolled = await page.request.post(`/api/customer/stores/${storeId}/enrol`, {
    headers: { Origin: baseURL ?? "" },
    data: { consentVersion: customerConsentVersion },
  });
  expect(enrolled.ok()).toBe(true);
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
  });
  try {
    const phone = await context.newPage();
    await phone.goto(`/member/${storeId}/coupons`);
    await expect(
      phone
        .getByRole("region", { name: ja.customer_coupons_owned })
        .getByText(ja.customer_coupons_empty),
    ).toBeVisible();
    await expect(
      phone
        .getByRole("region", { name: ja.coupon_exchange })
        .getByText(ja.customer_exchanges_empty),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("二人がスマホで来店QRを開き、初回同意後の再来店では追加操作なしで参加する", async ({
  page: staff,
  browser,
  baseURL,
}) => {
  const contexts = await Promise.all([
    browser.newContext({
      baseURL,
      viewport: { width: 1024, height: 768 },
      serviceWorkers: "block",
    }),
    browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    }),
    browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, serviceWorkers: "block" }),
  ]);
  const [tabletContext, firstContext, secondContext] = contexts;
  if (!tabletContext || !firstContext || !secondContext) throw new Error("試験用の端末が必要です");
  const tablet = await tabletContext.newPage();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  const storeId = "tablecast-komorebi";
  const adminBase = `/api/admin/stores/${storeId}`;
  try {
    await signInStaff(staff.request, baseURL);
    const floor = adminStateSchema.parse(await (await staff.request.get(adminBase)).json());
    const vacant = floor.vacantTables.find((table) => table.name === "T10");
    if (!vacant) throw new Error("専用fixtureのT10が空席ではありません");
    const open = async () =>
      tableStateSchema.parse(
        await (
          await staff.request.post(`${adminBase}/tables/open`, {
            data: { tableId: vacant.id, guestCount: 2, locale: "ja" },
          })
        ).json(),
      );
    const visit = await open();
    await approveGuestDevice(tablet.request, staff.request, {
      origin: baseURL,
      storeId,
      tableId: vacant.id,
    });
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
    await expect(first).toHaveURL(new RegExp(`/member/${storeId}/visits/${visit.id}$`));
    await expect(first.getByRole("article").locator("header").getByRole("status")).toHaveText(
      ja.customer_connected,
    );
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
    await expect(second).toHaveURL(new RegExp(`/member/${storeId}/visits/${visit.id}$`));
    await expect(second.getByRole("article").locator("header").getByRole("status")).toHaveText(
      ja.customer_connected,
    );
    const identity = z.object({ user: z.object({ id: z.string(), email: z.string() }) });
    const firstSession = identity.parse(
      await (await first.request.get("/api/auth/get-session")).json(),
    );
    const secondSession = identity.parse(
      await (await second.request.get("/api/auth/get-session")).json(),
    );
    expect(firstSession.user.email).toBe(credentials.email);
    expect(secondSession.user.email).toBe(credentials.otherEmail);
    expect(firstSession.user.id).not.toBe(secondSession.user.id);
    await expect(
      tablet.getByRole("region", { name: ja.customer_join_visit }).locator("li"),
    ).toHaveCount(2);
    await expect(
      first
        .getByRole("article")
        .locator("section")
        .filter({ has: first.getByRole("heading", { name: ja.customer_companions, exact: true }) })
        .getByRole("listitem"),
    ).toHaveCount(2);
    const privateVisit = await first.reload();
    expect(privateVisit?.headers()["cache-control"]).toBe("private, no-store");
    await expect(first.locator('head link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/tablecast-customer.webmanifest",
    );
    expect((await staff.request.post(`${adminBase}/tables/${visit.id}/close`)).ok()).toBe(true);
    await expect(first.getByRole("article").locator("header").getByRole("status")).toHaveText(
      ja.customer_disconnected,
    );
    const next = await open();
    const nextCodeResponse = tablet
      .waitForResponse((response) => response.url().endsWith("/customer-code") && response.ok())
      .then(async (response) => z.object({ url: z.url() }).parse(await response.json()));
    await tablet.reload();
    const nextCode = await nextCodeResponse;
    for (const phone of [first, second]) {
      let enrolments = 0;
      const observeEnrolment = (request: Request) => {
        if (request.url().endsWith("/enrol")) enrolments++;
      };
      phone.on("request", observeEnrolment);
      try {
        await phone.goto(nextCode.url);
        await expect(phone).toHaveURL(new RegExp(`/member/${storeId}/visits/${next.id}$`));
        await expect(phone.getByRole("article").locator("header").getByRole("status")).toHaveText(
          ja.customer_connected,
        );
        await expect(
          phone.getByRole("button", { name: ja.customer_enrol, exact: true }),
        ).toHaveCount(0);
        expect(enrolments).toBe(0);
      } finally {
        phone.off("request", observeEnrolment);
      }
    }
    await second.getByRole("button", { name: ja.customer_leave_visit }).click();
    await expect(second.getByRole("article").locator("header").getByRole("status")).toHaveText(
      ja.customer_disconnected,
    );
    await expect(
      tablet.getByRole("region", { name: ja.customer_join_visit }).locator("li"),
    ).toHaveCount(1);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
