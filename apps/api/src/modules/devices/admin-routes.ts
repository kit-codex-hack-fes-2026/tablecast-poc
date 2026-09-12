import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { validate } from "../../platform/validation";
import { approveDevice, listDevices, revokeDevice } from "./service";
export const devicesAdminRoutes = new Hono<ApiEnv>()
  .post(
    "/devices/approve",
    validate(z.object({ userCode: z.string().min(1).max(191), tableId: z.string() }).strict()),
    async (c) =>
      c.json(
        await approveDevice(
          c.get("services"),
          c.get("actor"),
          c.req.raw.headers,
          c.req.valid("json"),
        ),
        200,
      ),
  )
  .get("/devices", async (c) => c.json(await listDevices(c.get("services"), c.get("actor")), 200))
  .post("/devices/:id/revoke", async (c) =>
    c.json(await revokeDevice(c.get("services"), c.get("actor"), c.req.param("id")), 200),
  );
