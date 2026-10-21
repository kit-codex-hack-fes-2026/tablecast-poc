import { expect } from "@playwright/test";
import { adminStateSchema, catalogSchema, configDraftSchema } from "@tablecast/api/schema";
import { approveGuestDevice, signInStaff } from "./support/session";
import { test } from "./support/test";

test.use({ trace: "off", serviceWorkers: "block" });

test("通知が切断していても公開した価格をHTTP経由で注文画面へ反映する", async ({
  page,
  request: staff,
  baseURL,
}) => {
  const storeId = "tablecast-hanul";
  const api = `/api/admin/stores/${storeId}`;
  const headers = { Origin: baseURL ?? "" };
  await signInStaff(staff, baseURL);
  const state = adminStateSchema.parse(await (await staff.get(api)).json());
  const vacant = state.vacantTables[0];
  if (!vacant) throw new Error("試験用の空卓が必要です");
  expect(
    (
      await staff.post(`${api}/tables/open`, {
        headers,
        data: { tableId: vacant.id, guestCount: 2, locale: "ja" },
      })
    ).ok(),
  ).toBe(true);
  let disconnected = 0;
  await page.routeWebSocket(/\/api\/table\/live$/, async (socket) => {
    disconnected += 1;
    await socket.close({ code: 1001 });
  });
  await approveGuestDevice(page.request, staff, {
    origin: baseURL,
    storeId,
    tableId: vacant.id,
  });
  await page.goto("/");
  await expect(page.getByRole("banner")).toContainText(vacant.name);
  await expect.poll(() => disconnected).toBeGreaterThan(0);
  const catalog = catalogSchema.parse(await (await page.request.get("/api/table/catalog")).json());
  const product = catalog.configuration.products.find((item) => item.available);
  if (!product) throw new Error("公開価格を確認できる商品が必要です");
  const card = page
    .getByRole("button")
    .filter({ has: page.getByText(product.text.ja.displayName, { exact: true }) });
  await expect(card).toBeVisible();
  const draft = configDraftSchema.parse(
    await (await staff.post(`${api}/drafts`, { headers })).json(),
  );
  const configuration = structuredClone(draft.configuration);
  const changed = configuration.products.find((item) => item.id === product.id);
  if (!changed) throw new Error("価格変更対象が必要です");
  changed.price += 100;
  const saved = await staff.put(`${api}/drafts/${draft.id}`, {
    headers,
    data: { expectedVersion: draft.version, configuration },
  });
  expect(saved.ok()).toBe(true);
  const edited = configDraftSchema.parse(await saved.json());
  const validated = await staff.post(`${api}/drafts/${draft.id}/validate`, {
    headers,
    data: { expectedVersion: edited.version },
  });
  expect(validated.ok()).toBe(true);
  const ready = configDraftSchema.parse(await validated.json());
  let documentLoads = 0;
  page.on("domcontentloaded", () => documentLoads++);
  expect(
    (
      await staff.post(`${api}/drafts/${draft.id}/publish`, {
        headers,
        data: {
          expectedVersion: ready.version,
          baseVersion: ready.baseVersion,
          approved: true,
          idempotencyKey: crypto.randomUUID(),
        },
      })
    ).ok(),
  ).toBe(true);
  const price = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" })
    .format(changed.price)
    .replace("￥", "¥");
  await expect(card).toContainText(price);
  expect(documentLoads).toBe(0);
});
