import { z } from "zod";
import { apiFactory } from "../../platform/http";
import { validate } from "../../platform/validation";
import { requireStore } from "../auth/middleware";
import { requireManager } from "../auth/policy";
import { instructionResponse } from "../configuration/instruction-response";
import { tableOperations } from "../tables/operations-routes";
import { requireDemo } from "./middleware";
import { demoUpdateSchema } from "./model";
import { getDemo } from "./queries";

const demoSessionRoutes = apiFactory
  .createApp()
  .use("*", requireDemo)
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
        await (
          await import("./service")
        ).updateDemo(c.get("services"), c.get("actor"), c.req.valid("json")),
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
          await (
            await import("./service")
          ).resetDemo(c.get("services"), c.get("actor"), c.req.valid("json").expectedVersion),
          c.req.header("X-Tablecast-Instructions"),
        ),
        200,
      ),
  )
  .route("/table", tableOperations);
export const demoRoutes = apiFactory
  .createApp()
  .post("/", requireStore, async (c) => {
    requireManager(c.get("actor"));
    return c.json(
      instructionResponse(
        await (await import("./service")).createDemo(c.get("services"), c.get("actor")),
        c.req.header("X-Tablecast-Instructions"),
      ),
      200,
    );
  })
  .route("/:demoId", demoSessionRoutes);
