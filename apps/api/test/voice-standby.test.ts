import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import app from "../src/app";
import * as business from "../src/db/business-schema";
import { getTableState } from "../src/modules/tables/queries";
import { changeLocale } from "../src/modules/tables/use-cases/presentation";
import { createApiServices } from "../src/platform/context";
import { configuration, device, deviceToken, setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());
it.each(["wake_word", "hand_raise", "gaze", "bill_check"])(
  "%sをdeveloperの文脈として多言語接続し、承認や会計依頼を作らない",
  async (activation) => {
    await setupFixture();
    const services = createApiServices(env);
    const config = structuredClone(configuration);
    config.languages.push("fr-FR");
    config.cast.proactive = true;
    await services.db
      .update(business.stores)
      .set({ config_json: JSON.stringify(config) })
      .where(eq(business.stores.id, device.storeId));
    await changeLocale(services, device, "fr-FR");
    const before = await getTableState(services, device);
    const provider = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      if (typeof init?.body !== "string") throw new Error("開始本文がありません");
      const body: unknown = JSON.parse(init.body);
      expect(body).toHaveProperty("session.input.0.role", "developer");
      expect(body).toHaveProperty(
        "session.input.0.content.0.text",
        expect.stringContaining("fr-FR"),
      );
      expect(body).toHaveProperty(
        "session.input.0.content.0.text",
        expect.stringContaining(activation === "bill_check" ? "承認ではありません" : activation),
      );
      return Response.json({
        session: { id: "tablecast-wake-live" },
        transport: { type: "webrtc", sdp: "tablecast-answer" },
      });
    });
    const context = createExecutionContext();
    const response = await app.request(
      "http://localhost:3000/api/table/voice/start",
      {
        method: "POST",
        headers: { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: "tablecast-offer", activation }),
      },
      {
        ...env,
        TABLECAST_VOICE_ENABLED: "true",
        TABLECAST_MODEL_API_KEY: "tablecast-test-key",
        TABLECAST_MODEL: "gpt-6.1-terra",
      },
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      proactive: false,
      voiceSessionId: "tablecast-wake-live",
    });
    expect(provider).toHaveBeenCalledOnce();
    const after = await getTableState(services, device);
    expect(after.cart).toEqual(before.cart);
    expect(after.billRequested).toBe(false);
    expect(
      after.events.some((event) => event.kind === "voice.user" || event.kind === "bill.requested"),
    ).toBe(false);
    await waitOnExecutionContext(context);
  },
);
