import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { z } from "zod";
import type { voiceToolNameSchema } from "../src/modules/voice/model";
import * as business from "../src/db/business-schema";
import { configurationSchema } from "../src/modules/configuration/model";
import { getTableState } from "../src/modules/tables/queries";
import { invokeVoiceTool } from "../src/modules/voice/realtime";
import { createApiServices } from "../src/platform/context";
import { configuration, device, setupVoiceFixture, text } from "./fixture";

it.each(["ja", "en"] as const)(
  "%sの複数商品検索から必須選択・条件の訂正・別発話の承認まで音声ツールだけで注文できる",
  async (locale) => {
    const voiceSessionId = "tablecast-spoken-service";
    let turnId = "tablecast-spoken-selection";
    await setupVoiceFixture(voiceSessionId, turnId);
    const services = createApiServices(env);
    const drinks = configuration.products[0];
    const food = configuration.products[1];
    if (!drinks || !food) throw new Error("注文する商品がありません");
    const next = configurationSchema.parse({
      ...configuration,
      products: [
        {
          ...drinks,
          id: "sake",
          price: 510,
          text: text("こもれび笹波月 本醸造", "Komorebi Sasatsuki sake"),
          modifiers: [
            {
              id: "temperature",
              text: text("温度", "Temperature"),
              kind: "single",
              min: 1,
              max: 1,
              options: [
                { id: "cold", text: text("冷酒", "Cold"), priceDelta: 0, available: true },
                { id: "warm", text: text("熱燗", "Warm"), priceDelta: 0, available: true },
              ],
            },
            {
              id: "volume",
              text: text("容量", "Serving size"),
              kind: "single",
              min: 1,
              max: 1,
              options: [
                { id: "small", text: text("90mL", "90mL"), priceDelta: 0, available: true },
                {
                  id: "large",
                  text: text("180mL", "180mL"),
                  priceDelta: 300,
                  available: true,
                  requires: ["warm"],
                },
              ],
            },
          ],
        },
        {
          ...food,
          id: "sashimi",
          price: 1280,
          text: text("お造り3種盛り", "Sashimi selection"),
          modifiers: [],
        },
      ],
    });
    await services.db.batch([
      services.db
        .update(business.stores)
        .set({ config_json: JSON.stringify(next) })
        .where(eq(business.stores.id, device.storeId)),
      services.db
        .update(business.tableSessions)
        .set({ locale })
        .where(eq(business.tableSessions.id, device.tableSessionId)),
    ]);
    const tool = (
      toolName: z.infer<typeof voiceToolNameSchema>,
      args: Record<string, unknown> = {},
    ) =>
      invokeVoiceTool(
        services,
        { voiceSessionId, turnId, toolCallId: crypto.randomUUID(), toolName, arguments: args },
        new AbortController().signal,
      );
    const found = await tool("getCatalog", { query: "笹波月 お造り", show: true });
    const overview = z
      .object({
        detail: z.boolean(),
        products: z.array(
          z.object({
            id: z.string(),
            requiredSelections: z.array(z.object({ id: z.string(), min: z.number() })),
          }),
        ),
      })
      .parse(found.result);
    expect(overview.detail).toBe(false);
    expect(overview.products.find(({ id }) => id === "sake")).toEqual({
      id: "sake",
      requiredSelections: [
        { id: "temperature", min: 1 },
        { id: "volume", min: 1 },
      ],
    });
    expect(overview.products.find(({ id }) => id === "sashimi")).toEqual({
      id: "sashimi",
      requiredSelections: [],
    });
    expect((await tool("getTableState")).result).toMatchObject({
      displayedProductIds: ["sashimi", "sake"],
    });
    const lines = [
      { id: "drink", productId: "sake", quantity: 1, selections: [] },
      { id: "food", productId: "sashimi", quantity: 1, selections: [] },
    ];
    expect((await tool("updateCart", { expectedVersion: 0, lines })).result).toMatchObject({
      cart: {
        version: 1,
        total: 1790,
        lines: [{ missing: ["temperature", "volume"] }, { missing: [] }],
      },
    });
    const details = await tool("getCatalog", { productIds: ["sake", "sashimi"] });
    expect(details.result).toMatchObject({
      detail: true,
      more: false,
      products: [
        {
          id: "sake",
          modifiers: [
            {
              id: "temperature",
              options: [
                { id: "cold", available: true, priceDelta: 0 },
                { id: "warm", available: true, priceDelta: 0 },
              ],
            },
            {
              id: "volume",
              options: [
                { id: "small", priceDelta: 0 },
                { id: "large", priceDelta: 300, requires: ["warm"] },
              ],
            },
          ],
        },
        { id: "sashimi" },
      ],
    });
    await expect(
      tool("getCatalog", { productIds: ["tablecast-other-store-product"] }),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
    const selections = [
      { optionId: "cold", quantity: 1 },
      { optionId: "large", quantity: 1 },
    ];
    const selected = [{ ...lines[0], selections }, lines[1]];
    expect(
      (await tool("updateCart", { expectedVersion: 1, lines: selected })).result,
    ).toMatchObject({
      cart: {
        version: 2,
        lines: [{ missing: ["warm"] }, {}],
      },
    });
    expect(
      (
        await tool("updateCart", {
          expectedVersion: 2,
          lines: [
            { ...lines[0], selections: [{ optionId: "warm", quantity: 1 }, selections[1]] },
            lines[1],
          ],
        })
      ).result,
    ).toMatchObject({
      cart: { version: 3, total: 2090, lines: [{ missing: [] }, { missing: [] }] },
    });
    expect(
      (await tool("setUiSection", { section: "menu", productId: "sake" })).result,
    ).toMatchObject({ uiSection: "menu", selectedProductId: "sake" });
    expect((await tool("setUiSection", { section: "menu" })).result).toMatchObject({
      selectedProductId: null,
    });
    await tool("setUiSection", { section: "cart" });
    const confirmation = z
      .object({ snapshotId: z.string(), total: z.number() })
      .parse((await tool("prepareConfirmation", { expectedVersion: 3 })).result);
    expect(confirmation.total).toBe(2090);
    const approval = {
      snapshotId: confirmation.snapshotId,
      idempotencyKey: "tablecast-spoken-approved",
      approved: true,
    };
    await expect(tool("submitOrder", approval)).rejects.toMatchObject({
      code: "NEW_APPROVAL_TURN_REQUIRED",
    });
    const snapshot = await services.db
      .select({ createdAt: business.confirmations.created_at })
      .from(business.confirmations)
      .where(eq(business.confirmations.id, confirmation.snapshotId))
      .get();
    if (!snapshot) throw new Error("注文確認がありません");
    turnId = "tablecast-spoken-approval";
    await services.db.batch([
      services.db.insert(business.voiceTurns).values({
        id: turnId,
        voice_session_id: voiceSessionId,
        store_id: device.storeId,
        table_session_id: device.tableSessionId,
        status: "started",
        started_at: snapshot.createdAt + 1,
        locale,
      }),
      services.db
        .update(business.tableSessions)
        .set({ active_turn_id: turnId })
        .where(eq(business.tableSessions.id, device.tableSessionId)),
    ]);
    expect((await tool("submitOrder", approval)).result).toMatchObject({
      total: 2090,
      status: "submitted",
    });
    for (const section of ["orders", "bill", "menu"])
      expect((await tool("setUiSection", { section })).result).toMatchObject({
        uiSection: section,
        selectedProductId: null,
      });
    expect((await getTableState(services, device)).orders).toHaveLength(1);
  },
);
