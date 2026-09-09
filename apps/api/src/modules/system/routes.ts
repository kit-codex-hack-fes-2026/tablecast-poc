import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import type { ApiEnv } from "../../platform/context";
import { ensure } from "../../platform/errors";
export const systemRoutes = new Hono<ApiEnv>()
  .post("/internal/deploy/:action", async (c) => {
    const expected = new TextEncoder().encode(`Bearer ${c.env.TABLECAST_VOICE_API_TOKEN}`);
    const actual = new TextEncoder().encode(c.req.header("authorization") ?? "");
    ensure(
      Boolean(c.env.TABLECAST_VOICE_API_TOKEN) &&
        actual.byteLength === expected.byteLength &&
        timingSafeEqual(actual, expected),
      "UNAUTHORIZED",
      401,
    );
    ensure(["drain", "resume"].includes(c.req.param("action")), "INVALID_ACTION", 400);
    try {
      await c.env.TABLECAST_VOICE.getByName("tablecast-voice").setDraining(
        c.req.param("action") === "drain",
      );
    } catch {
      return c.json({ error: "VOICE_RUNTIME_BUSY" }, 409);
    }
    return c.json({ ready: true });
  })
  .get("/api/health", (c) => c.json({ status: "ok", releaseSha: c.env.TABLECAST_RELEASE_SHA }));
