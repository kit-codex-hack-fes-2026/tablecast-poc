import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
import { validate, validateQuery } from "../../platform/validation";
import { staffIdentity } from "../auth/middleware";
import {
  customerConsumptionSchema,
  customerMemoryDeleteSchema,
  customerMemoryInputSchema,
  customerMemoryPageSchema,
} from "./model";
import { listCustomerConsumption, listCustomerMemories } from "./queries";
import { deleteCustomerMemory, recordCustomerConsumption, writeCustomerMemory } from "./service";
export const customerMemoryRoutes = new Hono<ApiEnv>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await staffIdentity(c);
    await next();
  })
  .get("/stores/:storeId/memories", validateQuery(customerMemoryPageSchema), async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await listCustomerMemories(
        c.get("services"),
        { kind: "customer", storeId: c.req.param("storeId"), userId: session.user.id },
        c.req.valid("query"),
      ),
      200,
    );
  })
  .post("/stores/:storeId/memories", validate(customerMemoryInputSchema), async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await writeCustomerMemory(
        c.get("services"),
        { kind: "customer", storeId: c.req.param("storeId"), userId: session.user.id },
        c.req.valid("json"),
      ),
      200,
    );
  })
  .post(
    "/stores/:storeId/memories/:memoryId/delete",
    validate(customerMemoryDeleteSchema),
    async (c) => {
      const session = await staffIdentity(c);
      return c.json(
        await deleteCustomerMemory(
          c.get("services"),
          { kind: "customer", storeId: c.req.param("storeId"), userId: session.user.id },
          c.req.param("memoryId"),
          c.req.valid("json").revision,
        ),
        200,
      );
    },
  )
  .get("/stores/:storeId/consumption", validateQuery(customerMemoryPageSchema), async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await listCustomerConsumption(
        c.get("services"),
        { kind: "customer", storeId: c.req.param("storeId"), userId: session.user.id },
        c.req.valid("query"),
      ),
      200,
    );
  })
  .post("/stores/:storeId/consumption", validate(customerConsumptionSchema), async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await recordCustomerConsumption(
        c.get("services"),
        { kind: "customer", storeId: c.req.param("storeId"), userId: session.user.id },
        c.req.valid("json"),
      ),
      200,
    );
  });
