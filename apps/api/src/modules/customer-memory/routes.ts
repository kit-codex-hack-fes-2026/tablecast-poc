import { Hono } from "hono";
import { customerActor, type CustomerEnv } from "../customers/middleware";
import { validate, validateQuery } from "../../platform/validation";
import {
  customerConsumptionSchema,
  customerMemoryDeleteSchema,
  customerMemoryInputSchema,
  customerMemoryPageSchema,
} from "./model";
import { listCustomerConsumption, listCustomerMemories } from "./queries";
import { deleteCustomerMemory, recordCustomerConsumption, writeCustomerMemory } from "./service";
export const customerMemoryRoutes = new Hono<CustomerEnv>()
  .get("/stores/:storeId/memories", validateQuery(customerMemoryPageSchema), async (c) => {
    return c.json(
      await listCustomerMemories(c.get("services"), customerActor(c), c.req.valid("query")),
      200,
    );
  })
  .post("/stores/:storeId/memories", validate(customerMemoryInputSchema), async (c) => {
    return c.json(
      await writeCustomerMemory(c.get("services"), customerActor(c), c.req.valid("json")),
      200,
    );
  })
  .post(
    "/stores/:storeId/memories/:memoryId/delete",
    validate(customerMemoryDeleteSchema),
    async (c) => {
      return c.json(
        await deleteCustomerMemory(
          c.get("services"),
          customerActor(c),
          c.req.param("memoryId"),
          c.req.valid("json").revision,
        ),
        200,
      );
    },
  )
  .get("/stores/:storeId/consumption", validateQuery(customerMemoryPageSchema), async (c) => {
    return c.json(
      await listCustomerConsumption(c.get("services"), customerActor(c), c.req.valid("query")),
      200,
    );
  })
  .post("/stores/:storeId/consumption", validate(customerConsumptionSchema), async (c) => {
    return c.json(
      await recordCustomerConsumption(c.get("services"), customerActor(c), c.req.valid("json")),
      200,
    );
  });
