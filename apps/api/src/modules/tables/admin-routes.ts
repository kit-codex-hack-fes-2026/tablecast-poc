import { apiFactory } from "../../platform/http";
import { validate, validateQuery } from "../../platform/validation";
import { tableScope } from "../auth/middleware";
import { getHistory, getSessionEvents } from "./history";
import {
  historyQuerySchema,
  openTableSchema,
  sessionEventsQuerySchema,
  timelineQuerySchema,
} from "./model";
import { getTableState } from "./queries";
import { getTimeline } from "./timeline";
import { closeTable, openTable } from "./use-cases/lifecycle";
import { resolveCall } from "./use-cases/presentation";
export const tablesAdminRoutes = apiFactory
  .createApp()
  .get("/timeline", validateQuery(timelineQuerySchema), async (c) =>
    c.json(await getTimeline(c.get("services"), c.get("actor"), c.req.valid("query")), 200),
  )
  .get("/history", validateQuery(historyQuerySchema), async (c) =>
    c.json(await getHistory(c.get("services"), c.get("actor"), c.req.valid("query")), 200),
  )
  .get("/tables/:id", tableScope, async (c) =>
    c.json(await getTableState(c.get("services"), c.get("actor")), 200),
  )
  .get("/tables/:id/events", validateQuery(sessionEventsQuerySchema), tableScope, async (c) =>
    c.json(await getSessionEvents(c.get("services"), c.get("actor"), c.req.valid("query")), 200),
  )
  .post("/tables/open", validate(openTableSchema), async (c) =>
    c.json(await openTable(c.get("services"), c.get("actor"), c.req.valid("json")), 200),
  )
  .post("/tables/:id/close", tableScope, async (c) =>
    c.json(await closeTable(c.get("services"), c.get("actor")), 200),
  )
  .post("/tables/:id/call/resolve", tableScope, async (c) =>
    c.json(await resolveCall(c.get("services"), c.get("actor")), 200),
  );
