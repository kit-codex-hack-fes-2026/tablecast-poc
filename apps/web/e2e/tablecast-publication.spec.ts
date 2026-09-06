import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  adminStateSchema,
  catalogSchema,
  configDraftSchema,
  tableStateSchema,
  type Catalog,
  type ConfigDraft,
  type Configuration,
} from "@tablecast/api/schema";
import { expect, test } from "@playwright/test";
import { eventsSchema } from "../src/lib/responses";

const credentials = z
  .object({ email: z.string(), password: z.string() })
  .parse(JSON.parse(readFileSync(new URL("../../../.local/demo.json", import.meta.url), "utf8")));

test.use({ trace: "off" });

test("通知切断中でも設定公開を取得し、古い商品画面を閉じて新価格を表示する", async ({
  page,
  request: staff,
  baseURL,
}) => {
  const storeId = "tablecast-akari";
  const tableId = `${storeId}-table-10`;
  const adminPath = `/api/admin/stores/${storeId}`;
  const headers = { Origin: baseURL ?? "" };
  const ownDraftIds: string[] = [];
  let sessionId = "";
  let original: Catalog | undefined;
  let changeDraft: ConfigDraft | undefined;
  let closedSockets = 0;

  async function prepare(configuration: Configuration, baseVersion: number) {
    const created = await staff.post(`${adminPath}/drafts`, { headers, data: {} });
    expect(created.status()).toBe(200);
    const draft = configDraftSchema.parse(await created.json());
    ownDraftIds.push(draft.id);
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
  try {
    // WebSocket通知を使えない状態で、既存の5秒間隔のHTTP取得を通す。
    await page.routeWebSocket(/\/api\/table\/live$/, async (socket) => {
      closedSockets++;
      await socket.close({ code: 1001 });
    });
    const state = await staff.get(adminPath);
    expect(state.status()).toBe(200);
    expect(
      adminStateSchema.parse(await state.json()).vacantTables.map((table) => table.id),
    ).toContain(tableId);
    const opened = await staff.post(`${adminPath}/tables/open`, {
      headers,
      data: { tableId, guestCount: 2, locale: "ja" },
    });
    expect(opened.status()).toBe(200);
    const table = tableStateSchema.parse(await opened.json());
    sessionId = table.id;
    await page.goto("/");
    await page.getByRole("button", { name: "端末を接続する", exact: true }).click();
    const userCode = await page.getByLabel("端末に表示されたコード").textContent();
    const approved = await staff.post(`${adminPath}/devices/approve`, {
      headers,
      data: { userCode, tableId },
    });
    expect(approved.status()).toBe(200);
    await expect(page.locator(".restaurant-name")).toContainText("T10");
    await expect.poll(() => closedSockets).toBeGreaterThan(0);

    const catalogue = await page.request.get("/api/table/catalog");
    expect(catalogue.status()).toBe(200);
    original = catalogSchema.parse(await catalogue.json());
    expect(original.storeId).toBe(storeId);
    const product = original.configuration.products.find((item) => item.available);
    if (!product) throw new Error("公開価格を確認できる商品がありません");
    // 円記号の全角・半角は各ブラウザー自身の標準Intl表記に合わせる。
    const prices = await page.evaluate((amount) => {
      const currency = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });
      return { original: currency.format(amount), changed: currency.format(amount + 100) };
    }, product.price);
    const card = page
      .getByRole("button")
      .filter({ has: page.getByText(product.text.ja.displayName, { exact: true }) });
    await expect(card).toContainText(prices.original);
    await card.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".product-base-price")).toContainText(prices.original);

    const changed = structuredClone(original.configuration);
    const changedProduct = changed.products.find((item) => item.id === product.id);
    if (!changedProduct) throw new Error("価格変更対象の商品がありません");
    changedProduct.price += 100;
    changeDraft = await prepare(changed, original.version);
    expect(changeDraft.changes).toHaveLength(1);
    expect(changeDraft.changes[0]).toMatchObject({
      before: product.price,
      after: product.price + 100,
      sensitive: true,
    });

    const publicationReceived = page.waitForResponse(
      async (response) => {
        if (new URL(response.url()).pathname !== "/api/table/events" || !response.ok())
          return false;
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
    await expect(dialog).not.toBeVisible();
    await expect(card).toContainText(prices.changed);
    await card.click();
    await expect(dialog.locator(".product-base-price")).toContainText(prices.changed);
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  } finally {
    try {
      try {
        if (original && changeDraft) {
          // 公開応答を受け取れなかった場合も、保存された状態から復元要否を決める。
          const response = await staff.get(`${adminPath}/drafts/${changeDraft.id}`);
          expect(response.status()).toBe(200);
          const currentDraft = configDraftSchema.parse(await response.json());
          if (currentDraft.status === "published") {
            const current = await staff.get(`${adminPath}/catalog`);
            expect(current.status()).toBe(200);
            const catalog = catalogSchema.parse(await current.json());
            const publishedVersion = changeDraft.baseVersion + 1;
            expect(catalog.version, "別の公開がある場合は復元で上書きしない").toBe(
              publishedVersion,
            );
            const restoration = await prepare(original.configuration, publishedVersion);
            await publish(restoration);
            const restored = await staff.get(`${adminPath}/catalog`);
            expect(restored.status()).toBe(200);
            const restoredCatalog = catalogSchema.parse(await restored.json());
            expect(restoredCatalog.version).toBe(publishedVersion + 1);
            expect(restoredCatalog.configuration).toEqual(original.configuration);
          }
        }
      } finally {
        // 試験が途中で失敗しても、自分が作成した未公開draftだけを破棄する。
        const discardedDrafts = await Promise.allSettled(
          ownDraftIds.map(async (id) => {
            const response = await staff.get(`${adminPath}/drafts/${id}`);
            expect(response.status()).toBe(200);
            const draft = configDraftSchema.parse(await response.json());
            if (draft.status !== "draft" && draft.status !== "ready") return;
            const discarded = await staff.post(`${adminPath}/drafts/${id}/discard`, {
              headers,
              data: { expectedVersion: draft.version },
            });
            expect(discarded.status()).toBe(200);
            expect(configDraftSchema.parse(await discarded.json()).status).toBe("discarded");
          }),
        );
        for (const result of discardedDrafts) {
          expect(result.status, "所有draftの確認・破棄が完了する").toBe("fulfilled");
        }
      }
    } finally {
      try {
        if (sessionId) {
          const closed = await staff.post(`${adminPath}/tables/${sessionId}/close`, {
            headers,
            data: {},
          });
          expect(closed.status()).toBe(200);
        }
      } finally {
        const logout = await staff.post("/api/auth/sign-out", { headers, data: {} });
        expect(logout.status()).toBe(200);
      }
    }
  }
});
