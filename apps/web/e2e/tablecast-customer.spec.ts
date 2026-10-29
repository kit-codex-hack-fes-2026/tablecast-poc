import { expect, type Page, type Request } from "@playwright/test";
import { adminStateSchema, customerConsentVersion, tableStateSchema } from "@tablecast/api/schema";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import ja from "../messages/ja.json" with { type: "json" };
import { credentials } from "./support/runtime";
import { approveGuestDevice, signInFromLogin, signInStaff } from "./support/session";
import { test } from "./support/test";

test.use({ viewport: { width: 402, height: 874 }, trace: "off", serviceWorkers: "block" });

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
    viewport: { width: 402, height: 874 },
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

test("二人が来店QRから登録して特典を使い、再来店では追加操作なしで参加する", async ({
  page: staff,
  browser,
  baseURL,
}, testInfo) => {
  if (!baseURL) throw new Error("runtime fixtureの専用originが必要です");
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
  const contexts = await Promise.all([
    browser.newContext({
      baseURL,
      viewport: { width: 1180, height: 820 },
      serviceWorkers: "block",
    }),
    browser.newContext({
      baseURL,
      viewport: { width: 402, height: 874 },
      serviceWorkers: "block",
    }),
    browser.newContext({ baseURL, viewport: { width: 402, height: 874 }, serviceWorkers: "block" }),
  ]);
  const [tabletContext, firstContext, secondContext] = contexts;
  if (!tabletContext || !firstContext || !secondContext) throw new Error("試験用の端末が必要です");
  const tablet = await tabletContext.newPage();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  const storeId = "tablecast-komorebi";
  const adminBase = `/api/admin/stores/${storeId}`;
  try {
    await Promise.all(
      [...contexts, staff.context()].map((context) =>
        context.addCookies([{ name: "tablecast_locale", value: "ja", url: baseURL }]),
      ),
    );
    await signInStaff(staff.request, baseURL);
    // 隔離した実APIへ券面と初回登録特典を登録し、実際の発券・申請を画面から確認する
    const imageSource = {
      generated: true,
      description: "架空店舗こもれびの生成バナーを使った会員フロー試験の券面",
    };
    const image = await staff.request.post(`${adminBase}/images`, {
      multipart: {
        image: {
          name: "tablecast-member-coupon.webp",
          mimeType: "image/webp",
          buffer: await readFile(
            resolve(import.meta.dirname, "../../../assets/demo/identities/komorebi-banner.webp"),
          ),
        },
        metadata: JSON.stringify({ imageKind: "illustration", imageSource }),
      },
    });
    expect(image.ok()).toBe(true);
    const { imageKey } = z.object({ imageKey: z.string() }).parse(await image.json());
    const couponTitle = "初回来店ありがとうクーポン";
    expect(
      (
        await staff.request.post(`${adminBase}/coupons/rules`, {
          data: {
            id: crypto.randomUUID(),
            expectedVersion: 0,
            active: true,
            rules: {
              title: { ja: couponTitle, en: "Welcome visit reward" },
              description: { ja: "お会計から100円引き。", en: "JPY 100 off your bill." },
              imageKey,
              imageKind: "illustration",
              imageSource,
              startsAt: Date.now() - 1000,
              endsAt: Date.now() + 86_400_000,
              minimumYen: 0,
              discountKind: "fixed",
              discountValue: 100,
              maximumYen: 100,
              trigger: "enrol",
              threshold: 1,
              presentation: { layout: "landscape", imageFit: "contain" },
            },
          },
        })
      ).ok(),
    ).toBe(true);
    const policy = z
      .object({ version: z.number() })
      .parse(await (await staff.request.get(`${adminBase}/points/policy`)).json());
    expect(
      (
        await staff.request.post(`${adminBase}/points/policy`, {
          data: {
            expectedVersion: policy.version,
            enabled: true,
            kind: "visit",
            points: 10,
            unitYen: 100,
          },
        })
      ).ok(),
    ).toBe(true);
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
    await first.goto(code.url);
    await expect(first).toHaveURL(/\/login\?returnTo=/);
    await expect(first.getByRole("heading", { name: ja.customer_login_title })).toBeVisible();
    await capture(first, "02-phone-login");
    await signInFromLogin(first, baseURL);
    await expect(first.getByRole("heading", { name: ja.customer_consent_title })).toBeVisible();
    await capture(first, "03-phone-consent");
    await first.getByRole("button", { name: ja.customer_enrol, exact: true }).click();
    await expect(first).toHaveURL(new RegExp(`/member/${storeId}/visits/${visit.id}$`));
    await expect(first.getByRole("article").locator("header").getByRole("status")).toHaveText(
      ja.customer_table_joined,
    );
    await capture(first, "04-phone-joined");
    await signInStaff(second.request, baseURL, credentials.otherEmail);
    await second.goto(code.url);
    await second.getByRole("button", { name: ja.customer_enrol, exact: true }).click();
    await expect(second).toHaveURL(new RegExp(`/member/${storeId}/visits/${visit.id}$`));
    await expect(second.getByRole("article").locator("header").getByRole("status")).toHaveText(
      ja.customer_table_joined,
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
      popover.getByRole("region", { name: ja.customer_joined_guests }).locator("li"),
    ).toHaveCount(2);
    await capture(tablet, "05-ipad-two-members");
    await tablet.setViewportSize({ width: 820, height: 1180 });
    await expect(popover).toBeVisible();
    await capture(tablet, "05b-ipad-portrait-members");
    await tablet.setViewportSize({ width: 1512, height: 982 });
    await expect(popover).toBeVisible();
    await capture(tablet, "05c-desktop-members");
    await tablet.setViewportSize({ width: 1180, height: 820 });
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
    await expect(first.locator('head link[rel="manifest"]')).toHaveAttribute(
      "href",
      `/api/member-stores/${storeId}/manifest.webmanifest`,
    );
    // 確認済みの来店ポイントを付与し、会員証・明細・本人編集の記憶を実データで表示する
    const pointsPath = `${adminBase}/tables/${visit.id}/points`;
    const pointVisit = z
      .object({ expectedVersion: z.number(), participants: z.array(z.object({ id: z.string() })) })
      .parse(await (await staff.request.get(pointsPath)).json());
    expect(
      (
        await staff.request.post(pointsPath, {
          data: {
            expectedVersion: pointVisit.expectedVersion,
            participantIds: pointVisit.participants.map((person) => person.id),
            idempotencyKey: crypto.randomUUID(),
          },
        })
      ).ok(),
    ).toBe(true);
    await first.getByRole("link", { name: ja.customer_card, exact: true }).click();
    await expect(first.getByRole("region", { name: ja.customer_card, exact: true })).toBeVisible();
    await expect(first.getByText("10 pt", { exact: true })).toBeVisible();
    await expect(first.getByRole("heading", { name: ja.customer_current_visit })).toBeVisible();
    await capture(first, "07-phone-membership-card");
    await first.getByRole("link", { name: ja.customer_points_history, exact: true }).click();
    await expect(
      first.getByRole("heading", { name: ja.customer_points, exact: true }),
    ).toBeVisible();
    await expect(first.getByText("+10 pt", { exact: true })).toBeVisible();
    await capture(first, "08-phone-points");
    await first.getByRole("link", { name: new RegExp(ja.customer_back_to_store) }).click();
    await first.getByRole("link", { name: ja.customer_memories, exact: true }).click();
    await first.getByRole("button", { name: ja.customer_memory_add, exact: true }).click();
    const memory = "辛さは控えめ、冷たいお茶が好きです。";
    await first.getByRole("textbox", { name: ja.customer_memory_content }).fill(memory);
    await capture(first, "09-phone-memory-editor");
    await first.getByRole("button", { name: ja.account_save, exact: true }).click();
    await expect(first.getByRole("listitem").filter({ hasText: memory })).toBeVisible();
    await capture(first, "10-phone-memories");
    await first.getByRole("link", { name: new RegExp(ja.customer_back_to_store) }).click();
    await first.getByRole("link", { name: new RegExp("T10") }).click();
    await first.getByRole("link", { name: ja.customer_visit_coupons, exact: true }).click();
    const owned = first.getByRole("region", { name: ja.customer_coupons_owned });
    await expect(owned.getByRole("heading", { name: couponTitle, exact: true })).toBeVisible();
    const couponImage = owned.getByRole("img", { name: couponTitle, exact: true });
    await expect(couponImage).toBeVisible();
    await expect(couponImage).not.toHaveJSProperty("naturalWidth", 0);
    await capture(first, "11-phone-owned-coupon");
    await owned.getByRole("button", { name: ja.coupon_request, exact: true }).click();
    await expect(
      owned.getByRole("button", { name: ja.coupon_request, exact: true }),
    ).toBeDisabled();
    await expect(owned.getByText(ja.coupon_requested, { exact: true })).toBeVisible();
    await expect(owned.getByRole("status")).toHaveText(ja.customer_coupon_requested_hint);
    await capture(first, "12-phone-coupon-requested");

    // 店舗の会計を用意し、申請された券を実際の管理画面で適用する
    expect(
      (
        await staff.request.post(`${adminBase}/tables/${visit.id}/payments`, {
          data: {
            kind: "adjustment",
            amount: 1000,
            reason: "隔離した会員クーポン利用フローの会計",
            idempotencyKey: crypto.randomUUID(),
          },
        })
      ).ok(),
    ).toBe(true);
    await staff.setViewportSize({ width: 1512, height: 982 });
    await staff.goto(`/admin/stores/${storeId}/floor`);
    await staff.getByRole("button", { name: /^T10\b/ }).click();
    await staff.getByRole("tab", { name: ja.admin_payments, exact: true }).click();
    await expect(staff.getByRole("heading", { name: couponTitle, exact: true })).toBeVisible();
    await staff
      .getByRole("button", { name: ja.coupon_apply, exact: true })
      .scrollIntoViewIfNeeded();
    await capture(staff, "13-staff-coupon-request", false);
    await staff.getByRole("button", { name: ja.coupon_apply, exact: true }).click();
    await expect(staff.getByRole("button", { name: ja.coupon_cancel, exact: true })).toBeVisible();
    await staff
      .getByRole("button", { name: ja.coupon_cancel, exact: true })
      .scrollIntoViewIfNeeded();
    await capture(staff, "14-staff-coupon-applied", false);
    const billed = tableStateSchema.parse(
      await (await staff.request.get(`${adminBase}/tables/${visit.id}`)).json(),
    );
    expect(billed.bill.due).toBe(900);
    await first.reload();
    await expect(owned.getByText(ja.coupon_used, { exact: true })).toBeVisible();
    await capture(first, "15-phone-coupon-used");
    expect(
      (
        await staff.request.post(`${adminBase}/tables/${visit.id}/payments`, {
          data: {
            kind: "payment",
            amount: billed.bill.due,
            reason: "隔離した会員クーポン適用後の精算",
            idempotencyKey: crypto.randomUUID(),
          },
        })
      ).ok(),
    ).toBe(true);
    await first.goto(`/member/${storeId}/visits/${visit.id}`);
    expect((await staff.request.post(`${adminBase}/tables/${visit.id}/close`)).ok()).toBe(true);
    await expect(first.getByRole("article").locator("header").getByRole("status")).toHaveText(
      ja.customer_disconnected,
    );
    await capture(first, "16-phone-visit-complete");
    await first.getByRole("link", { name: ja.customer_card, exact: true }).click();
    await expect(first.getByRole("heading", { name: ja.customer_previous_visits })).toBeVisible();
    await capture(first, "17-phone-visit-history");
    const next = await open();
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
        await expect(phone.getByRole("article").locator("header").getByRole("status")).toHaveText(
          ja.customer_table_joined,
        );
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
    await second.getByRole("button", { name: ja.customer_leave_visit }).click();
    await expect(second.getByRole("article").locator("header").getByRole("status")).toHaveText(
      ja.customer_disconnected,
    );
    await capture(second, "20-phone-left-visit");
    await expect(
      tablet.getByRole("region", { name: ja.customer_joined_guests }).locator("li"),
    ).toHaveCount(1);
    await capture(tablet, "21-ipad-after-member-left");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
