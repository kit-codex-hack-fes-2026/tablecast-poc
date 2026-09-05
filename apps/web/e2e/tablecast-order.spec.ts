import { z } from "zod";
import { readFileSync } from "node:fs";
import { adminStateSchema, catalogSchema, tableStateSchema } from "@tablecast/api/schema";
import { expect, test } from "@playwright/test";

const credentials = z
  .object({ email: z.string(), password: z.string() })
  .parse(JSON.parse(readFileSync(new URL("../../../.local/demo.json", import.meta.url), "utf8")));

test("日英の端末認可からカスタマイズ注文・提供・会計まで実DBへ反映する", async ({
  page: staff,
  browser,
  baseURL,
}, testInfo) => {
  const guestContext = await browser.newContext({
    baseURL,
    viewport: { width: 1024, height: 768 },
  });
  const guest = await guestContext.newPage();
  const storeId = "tablecast-komorebi";
  const tableId = `${storeId}-table-12`;
  let sessionId = "";
  try {
    await staff.goto("/login");
    await staff.getByLabel("メールアドレス").fill(credentials.email);
    await staff.getByLabel("パスワード", { exact: true }).fill(credentials.password);
    await staff.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(staff).toHaveURL(/\/admin\/live$/);
    await staff.getByRole("combobox", { name: "店舗", exact: true }).selectOption(storeId);
    const current = adminStateSchema.parse(
      await (await staff.request.get(`/api/admin/stores/${storeId}`)).json(),
    );
    const existing = current.tables.find((table) => table.tableId === tableId);
    if (existing) sessionId = existing.id;
    else {
      const opened = await staff.request.post(`/api/admin/stores/${storeId}/tables/open`, {
        data: { tableId, guestCount: 2, locale: "ja" },
      });
      expect(opened.ok()).toBeTruthy();
      const table = tableStateSchema.parse(await opened.json());
      sessionId = table.id;
      await staff.reload();
      await staff.getByRole("combobox", { name: "店舗", exact: true }).selectOption(storeId);
    }
    await guest.goto("/");
    await guest.getByRole("button", { name: "端末を接続する" }).click();
    const code = await guest.getByLabel("端末に表示されたコード").textContent();
    expect(code).toBeTruthy();
    await staff.getByRole("button", { name: "端末を承認", exact: true }).click();
    await staff.getByLabel("端末に表示されたコード").fill(code ?? "");
    await staff.getByLabel("割り当てる卓").selectOption(tableId);
    await staff.getByRole("button", { name: "承認する", exact: true }).click();
    await expect(guest.locator(".restaurant-name")).toContainText("T12");
    await guest.getByRole("button", { name: "日本語", exact: true }).click();
    await expect(guest.getByRole("tab", { name: "おしながき", exact: true })).toBeVisible();
    const catalogue = catalogSchema.parse(
      await (await guest.request.get("/api/table/catalog")).json(),
    );
    const product = catalogue.configuration.products.find(
      (item) =>
        item.available &&
        item.categoryId === "sake" &&
        item.modifiers.length > 0 &&
        item.modifiers.every((modifier) => modifier.kind === "single"),
    );
    expect(product).toBeDefined();
    if (!product) throw new Error("必須選択を持つ合成商品がありません");
    await guest
      .getByRole("button")
      .filter({ has: guest.getByText(product.text.ja.displayName, { exact: true }) })
      .click();
    for (const modifier of product.modifiers) {
      const option = modifier.options.find(
        (item) => item.available && !item.requires.length && !item.excludes.length,
      );
      if (!option) throw new Error("選択可能な合成オプションがありません");
      await guest
        .getByRole("radio", {
          name: new RegExp(option.text.ja.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        })
        .click();
    }
    await guest.getByRole("button", { name: "注文かごに追加", exact: true }).click();
    await expect(guest.getByRole("dialog")).not.toBeVisible();
    await expect(guest.getByRole("button", { name: "注文内容を確認", exact: true })).toBeEnabled();
    await expect(guest.getByRole("textbox")).toHaveCount(0);
    const voiceRequests: string[] = [];
    guest.on("request", (request) => {
      if (request.url().endsWith("/api/table/voice/start")) voiceRequests.push(request.url());
    });
    await guest.locator("header").getByRole("button", { name: "音声を開始", exact: true }).click();
    await expect(guest.getByText("音声サービスの準備が整い次第ご利用いただけます。")).toBeVisible();
    await guest.getByRole("button", { name: "English", exact: true }).click();
    await expect(guest.getByRole("button", { name: "Review order", exact: true })).toBeEnabled();
    expect(voiceRequests).toHaveLength(1);
    await expect(staff.getByRole("heading", { name: "フロアの様子", exact: true })).toBeVisible();
    await guest.screenshot({ path: testInfo.outputPath("tablecast-kiosk-landscape.png") });
    await guest.setViewportSize({ width: 768, height: 1024 });
    await expect(
      guest.locator("header").getByRole("button", { name: "Reconnect voice", exact: true }),
    ).toBeInViewport();
    await guest.screenshot({ path: testInfo.outputPath("tablecast-kiosk-portrait.png") });
    await guest.setViewportSize({ width: 1024, height: 768 });
    await guest.getByRole("button", { name: "Review order", exact: true }).click();
    await expect(guest.getByRole("dialog")).toContainText(product.text.en.displayName);
    await guest.getByRole("button", { name: "Confirm and place order", exact: true }).click();
    await expect(guest.getByRole("heading", { name: "Your order is in" })).toBeVisible();
    await guest.getByRole("button", { name: "Close", exact: true }).click();
    const ordered = tableStateSchema.parse(await (await guest.request.get("/api/table")).json());
    expect(ordered.cart.lines).toHaveLength(0);
    expect(ordered.orders).toHaveLength(1);
    await staff.getByRole("button", { name: /^T12/ }).click();
    await staff.getByRole("tab", { name: "カート・注文", exact: true }).click();
    await staff.getByRole("button", { name: "注文を受け付ける", exact: true }).click();
    await staff.getByRole("button", { name: "提供済みにする", exact: true }).click();
    await expect(staff.getByText("提供済み", { exact: true })).toBeVisible();
    await staff.getByRole("tab", { name: "会計", exact: true }).click();
    await staff.getByLabel("金額（円）", { exact: true }).fill(String(ordered.bill.due));
    await staff.getByLabel("理由", { exact: true }).fill("店頭支払のE2E確認");
    await staff.getByRole("button", { name: "支払いを登録", exact: true }).click();
    await expect
      .poll(async () => {
        const result = tableStateSchema.parse(await (await guest.request.get("/api/table")).json());
        return result.bill.due;
      })
      .toBe(0);
    await staff.getByRole("tab", { name: "概要", exact: true }).click();
    await staff.getByRole("button", { name: "この卓の利用を終了", exact: true }).click();
    await expect(guest.getByRole("heading", { name: "Thank you for joining us" })).toBeVisible();
  } finally {
    await guestContext.close();
    if (sessionId) {
      const latest = await staff.request.get(`/api/admin/stores/${storeId}/tables/${sessionId}`);
      if (latest.ok()) {
        const table = tableStateSchema.parse(await latest.json());
        if (table.status === "open" && table.bill.due === 0 && table.cart.lines.length === 0)
          await staff.request.post(`/api/admin/stores/${storeId}/tables/${sessionId}/close`, {
            data: {},
          });
      }
    }
  }
});
