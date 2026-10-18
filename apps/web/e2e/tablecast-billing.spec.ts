import { expect } from "@playwright/test";
import { z } from "zod";
import { test } from "./support/test";
import { signInStaff } from "./support/session";
test.use({ trace: "off", serviceWorkers: "block" });
test("課金ページをSSRし、memberと匿名の応答へ金融情報を含めない", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  await signInStaff(page.request, baseURL);
  const stores = z
    .object({ stores: z.array(z.object({ id: z.string(), organizationId: z.string() })) })
    .parse(await (await page.request.get("/api/admin/stores")).json());
  const store = stores.stores.find((value) => value.id === "tablecast-komorebi");
  if (!store) throw new Error("課金対象の組織fixtureが必要です");
  const path = `/billing/${store.organizationId}`;
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "課金／請求", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "請求履歴", exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("tablecast-billing-owner.png"),
    fullPage: true,
  });
  const member = await browser.newContext({ baseURL, serviceWorkers: "block" });
  let memberSsr: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  const anonymous = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    serviceWorkers: "block",
  });
  try {
    const loginPage = await member.newPage();
    await loginPage.goto("/login");
    await loginPage.getByRole("button", { name: "Googleでログイン" }).click();
    await loginPage.getByRole("button", { name: /aoi.ito@komorebi-shijo.com/ }).click();
    await expect(loginPage).toHaveURL(/\/organisations$/);
    memberSsr = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
      serviceWorkers: "block",
      storageState: await member.storageState(),
    });
    const memberPage = await memberSsr.newPage();
    const memberResponse = await memberPage.goto(path);
    expect(memberResponse?.status()).toBe(200);
    await expect(memberPage.getByRole("heading", { name: "利用明細", exact: true })).toBeVisible();
    await expect(
      memberPage.getByRole("heading", { name: "プラン一覧・変更", exact: true }),
    ).toHaveCount(0);
    const html = await memberResponse?.text();
    for (const forbidden of [
      "chargeMicros",
      "currentCycle",
      "monthlyBase",
      "stripeCustomerId",
      "amountUsd",
      "markupBps",
      "encryptedKey",
    ])
      expect(html).not.toContain(forbidden);
    expect(
      (
        await member.request.get(
          `/api/admin/organizations/${store.organizationId}/billing/invoices`,
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await anonymous.request.get(`/api/admin/organizations/${store.organizationId}/billing`)
      ).status(),
    ).toBe(401);
    const anonymousPage = await anonymous.newPage();
    const anonymousResponse = await anonymousPage.goto(path);
    expect(await anonymousResponse?.text()).not.toContain('"chargeMicros"');
    await memberPage.screenshot({
      path: testInfo.outputPath("tablecast-billing-member-ssr.png"),
      fullPage: true,
    });
  } finally {
    await memberSsr?.close();
    await member.close();
    await anonymous.close();
  }
});
