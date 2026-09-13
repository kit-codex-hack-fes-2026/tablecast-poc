import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "./support/test";
import { expect } from "@playwright/test";
import {
  adminStateSchema,
  catalogSchema,
  configDraftSchema,
  eventsSchema,
  tableStateSchema,
  type ConfigDraft,
  type Configuration,
} from "@tablecast/api/schema";
import { credentials } from "./support/runtime";

test.use({ trace: "off" });

test("通知切断中も設定公開を反映し、利用終了後にだけアプリ更新を適用する", async ({
  page,
  request: staff,
  baseURL,
  runtime,
}) => {
  const storeId = "tablecast-akari";
  const adminPath = `/api/admin/stores/${storeId}`;
  const headers = { Origin: baseURL ?? "" };
  let closedSockets = 0;

  async function prepare(configuration: Configuration, baseVersion: number) {
    const created = await staff.post(`${adminPath}/drafts`, { headers, data: {} });
    expect(created.status()).toBe(200);
    const draft = configDraftSchema.parse(await created.json());
    expect(draft.baseVersion, "試験中に別の設定公開が行われていない").toBe(baseVersion);
    const updated = await staff.put(`${adminPath}/drafts/${draft.id}`, {
      headers,
      data: { expectedVersion: draft.version, configuration },
    });
    expect(updated.status()).toBe(200);
    const edited = configDraftSchema.parse(await updated.json());
    const validated = await staff.post(`${adminPath}/drafts/${draft.id}/validate`, {
      headers,
      data: { expectedVersion: edited.version },
    });
    expect(validated.status()).toBe(200);
    const ready = configDraftSchema.parse(await validated.json());
    expect(ready.errors).toEqual([]);
    expect(ready.status).toBe("ready");
    return ready;
  }

  async function publish(draft: ConfigDraft) {
    const response = await staff.post(`${adminPath}/drafts/${draft.id}/publish`, {
      headers,
      data: {
        expectedVersion: draft.version,
        baseVersion: draft.baseVersion,
        idempotencyKey: crypto.randomUUID(),
        approved: true,
      },
    });
    expect(response.status()).toBe(200);
    expect(configDraftSchema.parse(await response.json()).status).toBe("published");
  }

  const login = await staff.post("/api/auth/sign-in/email", { data: credentials, headers });
  expect(login.status()).toBe(200);
  // WebSocket通知を使えない状態で、既存の5秒間隔のHTTP取得を通す。
  await page.routeWebSocket(/\/api\/table\/live$/, async (socket) => {
    closedSockets++;
    await socket.close({ code: 1001 });
  });
  const state = await staff.get(adminPath);
  expect(state.status()).toBe(200);
  const vacant = adminStateSchema.parse(await state.json()).vacantTables[0];
  if (!vacant) throw new Error("試験用の空卓が必要です。既存の利用卓は変更しません。");
  const tableId = vacant.id;
  const opened = await staff.post(`${adminPath}/tables/open`, {
    headers,
    data: { tableId, guestCount: 2, locale: "ja" },
  });
  expect(opened.status()).toBe(200);
  const table = tableStateSchema.parse(await opened.json());
  await page.goto("/");
  await page.getByRole("button", { name: "端末を接続する", exact: true }).click();
  const userCode = await page.getByLabel("端末に表示されたコード").textContent();
  const approved = await staff.post(`${adminPath}/devices/approve`, {
    headers,
    data: { userCode, tableId },
  });
  expect(approved.status()).toBe(200);
  await expect(page.getByRole("banner")).toContainText(vacant.name);
  await expect.poll(() => closedSockets).toBeGreaterThan(0);

  const catalogue = await page.request.get("/api/table/catalog");
  expect(catalogue.status()).toBe(200);
  const original = catalogSchema.parse(await catalogue.json());
  expect(original.storeId).toBe(storeId);
  const product = original.configuration.products.find((item) => item.available);
  if (!product) throw new Error("公開価格を確認できる商品がありません");
  // SSRとブラウザーの円記号は半角の共通表記で検証する。
  const prices = await page.evaluate((amount) => {
    const currency = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });
    return {
      original: currency.format(amount).replace("￥", "¥"),
      changed: currency.format(amount + 100).replace("￥", "¥"),
    };
  }, product.price);
  const card = page
    .getByRole("button")
    .filter({ has: page.getByText(product.text.ja.displayName, { exact: true }) });
  await expect(card).toContainText(prices.original);
  await card.click();
  const detail = page.getByRole("region", { name: product.text.ja.displayName, exact: true });
  await expect(detail.getByText(prices.original, { exact: true })).toContainText(prices.original);

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const initialPage = await page.evaluate(() => performance.timeOrigin);
  await runtime.setOnline(false);
  await appendFile(join(runtime.directory, "client/sw.js"), "\n// tablecast-live-table-update\n");
  await runtime.setOnline(true);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) throw new Error("登録済みService Workerが必要です");
    await registration.update();
  });
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return Boolean(registration?.waiting);
      }),
    )
    .toBe(true);

  const changed = structuredClone(original.configuration);
  const changedProduct = changed.products.find((item) => item.id === product.id);
  if (!changedProduct) throw new Error("価格変更対象の商品がありません");
  changedProduct.price += 100;
  const replacement = changed.products.find(
    (item) => item.imageKey && item.imageKey !== product.imageKey,
  )?.imageKey;
  if (!replacement) throw new Error("差し替え用画像がありません");
  changedProduct.imageKey = replacement;
  const changeDraft = await prepare(changed, original.version);
  expect(changeDraft.changes).toHaveLength(2);
  expect(changeDraft.changes.find((change) => change.path.endsWith(".price"))).toMatchObject({
    before: product.price,
    after: product.price + 100,
    sensitive: true,
  });

  const publicationReceived = page.waitForResponse(
    async (response) => {
      if (new URL(response.url()).pathname !== "/api/table/events" || !response.ok()) return false;
      const { events } = eventsSchema.parse(await response.json());
      return events.some(
        (event) => event.kind === "configuration.published" && event.cursor > table.cursor,
      );
    },
    { timeout: 15_000 },
  );
  const [, received] = await Promise.all([publish(changeDraft), publicationReceived]);
  const publication = eventsSchema
    .parse(await received.json())
    .events.find((event) => event.kind === "configuration.published");
  expect(publication).toMatchObject({ storeId, tableSessionId: null, data: {} });
  expect(publication?.data).toEqual({});
  await expect(detail).not.toBeVisible();
  await expect(card).toContainText(prices.changed);
  await expect(card.locator("img")).toHaveAttribute("src", new RegExp(replacement));
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(initialPage);
  expect(
    await page.evaluate(async () =>
      Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
    ),
  ).toBe(true);
  await card.click();
  await expect(detail.getByText(prices.changed, { exact: true })).toContainText(prices.changed);
  await detail.getByRole("button", { name: "おしながき", exact: true }).click();
  // 利用中は保留したアプリ更新を、卓の利用終了後に適用する。
  const [, closed] = await Promise.all([
    page.waitForEvent("domcontentloaded", { timeout: 20_000 }),
    staff.post(`${adminPath}/tables/${table.id}/close`, { headers, data: {} }),
  ]);
  expect(closed.status()).toBe(200);
  expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(initialPage);
});
