import { expect, type Page, type Request } from "@playwright/test";
import { adminStateSchema, customerConsentVersion, tableStateSchema } from "@tablecast/api/schema";
import { resolve } from "node:path";
import { z } from "zod";
import ja from "../messages/ja.json" with { type: "json" };
import { credentials } from "./support/runtime";
import { approveGuestDevice, signInFromLogin, signInStaff } from "./support/session";
import { test } from "./tablecast-customer.fixture";

test.use({ viewport: { width: 402, height: 874 }, trace: "off", serviceWorkers: "block" });

test("会員の券と交換候補の0件をJavaScriptなしの初期HTMLから表示する", async ({
  page,
  members,
  baseURL,
}) => {
  const storeId = "tablecast-komorebi";
  await signInStaff(page.request, baseURL);
  const enrolled = await page.request.post(`/api/customer/stores/${storeId}/enrol`, {
    headers: { Origin: baseURL ?? "" },
    data: { consentVersion: customerConsentVersion },
  });
  expect(enrolled.ok()).toBe(true);
  const context = await members.context("ssr", {
    baseURL,
    viewport: { width: 402, height: 874 },
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
  });
  members.phase("ssr-coupons");
  await test.step("JavaScriptなしの会員初期表示", async () => {
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
    members.phase("complete");
  });
});

test("二人が来店QRで登録して同じ卓へ参加し、再来店では自動参加する", async ({
  page: staff,
  members,
  baseURL,
}, testInfo) => {
  if (!baseURL) throw new Error("runtime fixtureの専用originが必要です");
  members.phase("setup");
  const capture = async (page: Page, name: string, fullPage = true) => {
    if (testInfo.project.name !== "tablecast-chromium") return;
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images]
          .filter((image) => {
            const bounds = image.getBoundingClientRect();
            return bounds.top < innerHeight && bounds.bottom > 0;
          })
          .map((image) => image.decode().catch(() => undefined)),
      );
    });
    await page.screenshot({
      path: resolve(import.meta.dirname, "../test-results/tablecast-member-flow", `${name}.png`),
      fullPage,
      animations: "disabled",
    });
  };
  const tabletContext = await members.context("tablet", {
    baseURL,
    viewport: { width: 1180, height: 820 },
    serviceWorkers: "block",
  });
  const firstContext = await members.context("first", {
    baseURL,
    viewport: { width: 402, height: 874 },
    serviceWorkers: "block",
  });
  const secondContext = await members.context("second", {
    baseURL,
    viewport: { width: 402, height: 874 },
    serviceWorkers: "block",
  });
  const contexts = [tabletContext, firstContext, secondContext];
  const tablet = await tabletContext.newPage();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  const storeId = "tablecast-komorebi";
  const adminBase = `/api/admin/stores/${storeId}`;
  await test.step("会員利用の操作", async () => {
    await Promise.all(
      [...contexts, staff.context()].map((context) =>
        context.addCookies([{ name: "tablecast_locale", value: "ja", url: baseURL }]),
      ),
    );
    await signInStaff(staff.request, baseURL);
    // 実APIで専用卓を開き、QR・実認証・別Cookieの二人参加を接続する。
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
    members.phase("qr");
    await tablet.goto("/");
    await tablet.getByRole("button", { name: new RegExp(`^${ja.kiosk_visit_tools}`) }).click();
    const code = await codeResponse;
    const popover = tablet.getByRole("dialog", { name: ja.kiosk_visit_tools, exact: true });
    await expect(popover).toBeVisible();
    await expect(
      popover
        .getByRole("region", { name: ja.customer_join_visit })
        .locator("svg")
        .filter({ hasText: ja.customer_join_visit }),
    ).toBeVisible();
    await capture(tablet, "01-ipad-qr");
    // OSのカメラがQRのURLを開いた後から、実アプリの認証・同意・自動参加を検証する。
    members.phase("first-registration");
    await first.goto(code.url);
    await expect(first).toHaveURL(/\/login\?returnTo=/);
    await expect(first.getByRole("heading", { name: ja.customer_login_title })).toBeVisible();
    await expect(first.getByText("京料理こもれび四条店", { exact: true })).toBeVisible();
    await expect(first.locator('img[src^="/api/member-stores/"]')).toBeVisible();
    await capture(first, "02-phone-login");
    await signInFromLogin(first, baseURL);
    await expect(first.getByRole("heading", { name: ja.customer_consent_title })).toBeVisible();
    await capture(first, "03-phone-consent");
    await first.getByRole("button", { name: ja.customer_enrol, exact: true }).click();
    await expect(first).toHaveURL(new RegExp(`/member/${storeId}/visits/${visit.id}$`));
    await expect(
      first
        .locator("article > header")
        .getByRole("status")
        .filter({ hasText: ja.customer_table_joined }),
    ).toBeVisible();
    await capture(first, "04-phone-joined", false);
    members.phase("second-registration");
    await signInStaff(second.request, baseURL, credentials.otherEmail);
    await second.goto(code.url);
    await second.getByRole("button", { name: ja.customer_enrol, exact: true }).click();
    await expect(second).toHaveURL(new RegExp(`/member/${storeId}/visits/${visit.id}$`));
    await expect(
      second
        .locator("article > header")
        .getByRole("status")
        .filter({ hasText: ja.customer_table_joined }),
    ).toBeVisible();
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
      popover.getByRole("region", { name: ja.customer_joined_guests }).locator("li"),
    ).toHaveCount(2);
    await capture(tablet, "05-ipad-two-members");
    await popover.getByRole("button", { name: ja.common_close, exact: true }).click();
    await expect(popover).not.toBeVisible();
    await capture(tablet, "06-ipad-member-stack");
    await expect(
      first
        .getByRole("article")
        .locator("section")
        .filter({ has: first.getByRole("heading", { name: ja.customer_companions, exact: true }) })
        .getByRole("listitem"),
    ).toHaveCount(2);
    const privateVisit = await first.reload();
    expect(privateVisit?.headers()["cache-control"]).toBe("private, no-store");
    const companionImages = first
      .getByRole("heading", { name: ja.customer_companions, exact: true })
      .locator("..")
      .locator("img");
    await expect(companionImages).toHaveCount(2);
    for (const portrait of await companionImages.all())
      await expect(portrait).not.toHaveJSProperty("naturalWidth", 0);
    await expect(first.locator('head link[rel="manifest"]')).toHaveAttribute(
      "href",
      `/api/member-stores/${storeId}/manifest.webmanifest`,
    );
    // 記憶編集・ポイント・券と精算の分岐はBrowser/実HTTP・D1統合で検証する。
    expect((await staff.request.post(`${adminBase}/tables/${visit.id}/close`)).ok()).toBe(true);
    await expect(
      first
        .locator("article > header")
        .getByRole("status")
        .filter({ hasText: ja.customer_disconnected }),
    ).toBeVisible();
    await capture(first, "16-phone-visit-complete");
    members.phase("history");
    await first.getByRole("link", { name: ja.customer_card_view, exact: true }).click();
    await expect(first.getByRole("heading", { name: ja.customer_previous_visits })).toBeVisible();
    await capture(first, "17-phone-visit-history");
    const next = await open();
    members.phase("return");
    const nextCodeResponse = tablet
      .waitForResponse((response) => response.url().endsWith("/customer-code") && response.ok())
      .then(async (response) => z.object({ url: z.url() }).parse(await response.json()));
    await tablet.reload();
    await tablet.getByRole("button", { name: new RegExp(`^${ja.kiosk_visit_tools}`) }).click();
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
        await expect(
          phone
            .locator("article > header")
            .getByRole("status")
            .filter({ hasText: ja.customer_table_joined }),
        ).toBeVisible();
        await expect(
          phone.getByRole("button", { name: ja.customer_enrol, exact: true }),
        ).toHaveCount(0);
        expect(enrolments).toBe(0);
      } finally {
        phone.off("request", observeEnrolment);
      }
    }
    await capture(first, "18-phone-return-auto-joined");
    await expect(
      popover.getByRole("region", { name: ja.customer_joined_guests }).locator("li"),
    ).toHaveCount(2);
    await capture(tablet, "19-ipad-return-members");
    members.phase("leave");
    await second.getByRole("button", { name: ja.customer_leave_visit }).click();
    await expect(
      second
        .locator("article > header")
        .getByRole("status")
        .filter({ hasText: ja.customer_disconnected }),
    ).toBeVisible();
    await capture(second, "20-phone-left-visit");
    await expect(
      tablet.getByRole("region", { name: ja.customer_joined_guests }).locator("li"),
    ).toHaveCount(1);
    await capture(tablet, "21-ipad-after-member-left");
    members.phase("pwa-sign-in");
    const signedOut = await members.context("pwa", {
      baseURL,
      viewport: { width: 402, height: 874 },
      serviceWorkers: "block",
    });
    await signedOut.addCookies([{ name: "tablecast_locale", value: "ja", url: baseURL }]);
    const pwa = await signedOut.newPage();
    await pwa.goto(`/member/${storeId}`);
    await expect(pwa).toHaveURL(/\/login\?returnTo=/);
    await expect(pwa.getByRole("heading", { name: ja.customer_member_login_title })).toBeVisible();
    await expect(pwa.getByText("京料理こもれび四条店", { exact: true })).toBeVisible();
    await expect(pwa.locator('img[src^="/api/member-stores/"]')).toBeVisible();
    await capture(pwa, "22-phone-pwa-sign-in");
    members.phase("complete");
  });
});
