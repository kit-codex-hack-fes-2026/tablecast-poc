import { z } from "zod";
import { apiFactory } from "../../platform/http";
import { measured } from "../../platform/telemetry";
import { validate } from "../../platform/validation";
import { requireStore } from "../auth/middleware";
import { requireManager } from "../auth/policy";
import { instructionResponse } from "../configuration/instruction-response";
import { tableOperations } from "../tables/operations-routes";
import { demoUpdateSchema } from "./model";
import { getDemo, getDemoRecord } from "./queries";
import { createDemo, resetDemo, updateDemo } from "./service";

const demoSessionRoutes = apiFactory
  .createApp()
  .use("*", async (c, next) => {
    const demoId = c.req.param("demoId");
    c.set("actor", { ...c.get("actor"), demoId, tableSessionId: demoId });
    const record = await measured("tablecast.authentication.demo", () =>
      getDemoRecord(c.get("services"), c.get("actor")),
    );
    c.get("services").tableAccess.session = record.session;
    await next();
  })
  .get("/", async (c) =>
    c.json(
      instructionResponse(
        await getDemo(c.get("services"), c.get("actor")),
        c.req.header("X-Tablecast-Instructions"),
      ),
      200,
    ),
  )
  .patch("/", validate(demoUpdateSchema), async (c) =>
    c.json(
      instructionResponse(
        await updateDemo(c.get("services"), c.get("actor"), c.req.valid("json")),
        c.req.header("X-Tablecast-Instructions"),
      ),
      200,
    ),
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
        instructionResponse(
          await resetDemo(c.get("services"), c.get("actor"), c.req.valid("json").expectedVersion),
          c.req.header("X-Tablecast-Instructions"),
        ),
        200,
      ),
  )
  .route("/table", tableOperations);
export const demoRoutes = apiFactory
  .createApp()
  .use("*", requireStore)
  .use("*", async (c, next) => {
    requireManager(c.get("actor"));
    await next();
  })
  .post("/", async (c) =>
    c.json(
      instructionResponse(
        await createDemo(c.get("services"), c.get("actor")),
        c.req.header("X-Tablecast-Instructions"),
      ),
      200,
    ),
  )
  .route("/:demoId", demoSessionRoutes);
