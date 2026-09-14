import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import * as business from "../src/db/business-schema";
import app from "../src/app";
import { createApiServices } from "../src/platform/context";
import { invokeVoiceTool } from "../src/modules/voice/realtime";
import { setVoiceSession } from "../src/modules/voice/service";
import { getTableState } from "../src/modules/tables/queries";
import { runVoiceTurn } from "./voice-fixture";
import { configuration, device, deviceToken, setupFixture } from "./fixture";

import { measuredDatabase } from "./measured-database";

it("商品数が増えても検索とカード表示の往復・出力が増えず実際に表示を保存する", async () => {
  await setupFixture();
  const normal = createApiServices(env);
  const voiceId = "tablecast-performance-voice";
  await setVoiceSession(normal, device, voiceId);
  await (
    await runVoiceTurn({
      voiceSessionId: voiceId,
      turnId: "tablecast-performance-turn",
      locale: "ja",
      messages: [],
    })
  ).finish();
  const product = configuration.products[0];
  if (!product) throw new Error("商品fixtureがありません");
  const measurements = [];
  const httpMeasurements = [];
  for (const size of [8, 200]) {
    await normal.db
      .update(business.stores)
      .set({
        config_json: JSON.stringify({
          ...configuration,
          products: Array.from({ length: size }, (_, index) => ({
            ...product,
            id: `tablecast-product-${index}`,
          })),
        }),
      })
      .where(eq(business.stores.id, device.storeId));
    const measured = measuredDatabase(env.TABLECAST_DB);
    const services = createApiServices({ ...env, TABLECAST_DB: measured.database });
    const result = await invokeVoiceTool(
      services,
      {
        voiceSessionId: voiceId,
        turnId: "tablecast-performance-turn",
        toolCallId: `tablecast-call-${size}`,
        toolName: "getCatalog",
        arguments: { show: true },
      },
      new AbortController().signal,
    );
    const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
    measurements.push({ ...measured.stats, bytes });
    expect(result.result).toMatchObject({
      total: size,
      more: size > 8,
      displayedProductIds: [
        "tablecast-product-0",
        "tablecast-product-1",
        "tablecast-product-2",
        "tablecast-product-3",
      ],
    });
    expect(measured.stats.roundtrips).toBeLessThanOrEqual(5);
    expect(bytes).toBeLessThan(6000);
    const cards = (await getTableState(normal, device)).events.filter(
      (event) => event.kind === "voice.products",
    );
    expect(cards.at(-1)?.data).toMatchObject({
      productIds: [
        "tablecast-product-0",
        "tablecast-product-1",
        "tablecast-product-2",
        "tablecast-product-3",
      ],
    });
    const httpDatabase = measuredDatabase(env.TABLECAST_DB);
    const ctx = createExecutionContext();
    const response = await app.request(
      "http://localhost:3000/api/table/voice/tools",
      {
        method: "POST",
        headers: { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceSessionId: voiceId,
          turnId: "tablecast-performance-turn",
          toolCallId: `tablecast-http-${size}`,
          toolName: "getCatalog",
          arguments: { show: true },
        }),
      },
      { ...env, TABLECAST_DB: httpDatabase.database },
      ctx,
    );
    expect(response.status).toBe(200);
    expect(new TextEncoder().encode(await response.text()).byteLength).toBeLessThan(6000);
    await waitOnExecutionContext(ctx);
    // 認証・所有卓の確認・通知を含めた実HTTP経路も別に予算化する。
    expect(httpDatabase.stats.roundtrips).toBeLessThanOrEqual(7);
    httpMeasurements.push({ ...httpDatabase.stats });
  }
  expect(measurements[1]?.roundtrips).toBe(measurements[0]?.roundtrips);
  expect(measurements[1]?.statements).toBe(measurements[0]?.statements);
  expect(httpMeasurements[1]).toEqual(httpMeasurements[0]);
});
