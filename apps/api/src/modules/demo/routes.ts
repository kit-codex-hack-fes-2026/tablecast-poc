import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { validate } from "../../platform/validation";
import { requireStore } from "../auth/middleware";
import { requireManager } from "../auth/policy";
import { getSession } from "../tables/queries";
import { tableOperations } from "../tables/operations-routes";
import { demoUpdateSchema } from "./model";
import { getDemo } from "./queries";
import { createDemo, resetDemo, updateDemo } from "./service";

const demoSessionRoutes = new Hono<ApiEnv>()
  .use("*", async (c, next) => {
    const demoId = c.req.param("demoId");
    c.set("actor", { ...c.get("actor"), demoId, tableSessionId: demoId });
    await getSession(c.get("services"), c.get("actor"));
    await next();
  })
  .get("/", async (c) => c.json(await getDemo(c.get("services"), c.get("actor")), 200))
  .patch("/", validate(demoUpdateSchema), async (c) =>
    c.json(await updateDemo(c.get("services"), c.get("actor"), c.req.valid("json")), 200),
  )
  .post(
    "/reset",
    validate(
      z
        .object({ expectedVersion: z.number().int().positive(), approved: z.literal(true) })
        .strict(),
    ),
    async (c) =>
      c.json(
        await resetDemo(c.get("services"), c.get("actor"), c.req.valid("json").expectedVersion),
        200,
      ),
  )
  .route("/table", tableOperations);
export const demoRoutes = new Hono<ApiEnv>()
  .use("*", requireStore)
  .use("*", async (c, next) => {
    requireManager(c.get("actor"));
    await next();
  })
  .post("/", async (c) => c.json(await createDemo(c.get("services"), c.get("actor")), 200))
  .route("/:demoId", demoSessionRoutes);
