import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { validate } from "../../platform/validation";
import { redeemDevice } from "./service";
export const devicesRoutes = new Hono<ApiEnv>()
  .post("/api/devices/request", async (c) =>
    c.json(
      await c.get("services").auth.api.deviceCode({
        body: { client_id: "tablecast-kiosk", scope: "tablecast:table" },
      }),
    ),
  )
  .post(
    "/api/devices/poll",
    validate(z.object({ device_code: z.string().min(1).max(191) }).strict()),
    async (c) => {
      const result = await redeemDevice(c.get("services"), c.req.valid("json").device_code);
      if (!result.ready) return c.json({ ready: false });
      setCookie(c, "tablecast.device", result.token, {
        httpOnly: true,
        secure: c.env.TABLECAST_PUBLIC_ORIGIN.startsWith("https:"),
        sameSite: "Strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
      return c.json({ ready: true });
    },
  );
