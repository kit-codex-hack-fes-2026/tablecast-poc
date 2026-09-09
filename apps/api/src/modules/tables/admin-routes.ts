import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { localeSchema } from "../../platform/model";
import { validate, validateQuery } from "../../platform/validation";
import type { Actor } from "../auth/model";
import { getHistory, getSessionEvents } from "./history";
import { historyQuerySchema, sessionEventsQuerySchema } from "./model";
import { getTableState } from "./queries";
import { closeTable, openTable, resolveCall } from "./service";
const scoped = (actor: Actor, id: string): Actor => ({ ...actor, tableSessionId: id });
export const tablesAdminRoutes = new Hono<ApiEnv>()
  .get("/history", validateQuery(historyQuerySchema), async (c) =>
    c.json(await getHistory(c.get("services"), c.get("actor"), c.req.valid("query"))),
  )
  .get("/tables/:id", async (c) =>
    c.json(await getTableState(c.get("services"), scoped(c.get("actor"), c.req.param("id")))),
  )
  .get("/tables/:id/events", validateQuery(sessionEventsQuerySchema), async (c) =>
    c.json(
      await getSessionEvents(
        c.get("services"),
        scoped(c.get("actor"), c.req.param("id")),
        c.req.valid("query"),
      ),
    ),
  )
  .post(
    "/tables/open",
    validate(
      z
        .object({
          tableId: z.string(),
          guestCount: z.number().int().min(1).max(30),
          locale: localeSchema,
          planId: z.string().optional(),
        })
        .strict(),
    ),
    async (c) => c.json(await openTable(c.get("services"), c.get("actor"), c.req.valid("json"))),
  )
  .post("/tables/:id/close", async (c) =>
    c.json(await closeTable(c.get("services"), scoped(c.get("actor"), c.req.param("id")))),
  )
  .post("/tables/:id/call/resolve", async (c) =>
    c.json(await resolveCall(c.get("services"), scoped(c.get("actor"), c.req.param("id")))),
  );
