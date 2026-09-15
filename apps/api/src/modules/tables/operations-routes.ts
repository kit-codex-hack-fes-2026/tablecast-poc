import { instructionResponse } from "../configuration/instruction-response";
import { Hono } from "hono";
import { gamesTableRoutes } from "../games/routes";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { localeSchema } from "../../platform/model";
import { validate, validateQuery } from "../../platform/validation";
import { getCatalog } from "../catalog/queries";
import { customerTargetSchema, customerAttributionSchema } from "../customer-memory/model";
import { selectCustomerTarget, attributeCustomerConsumption } from "../customer-memory/service";
import { getDeviceParticipants } from "../customer-visits/queries";
import { createCustomerVisitCode } from "../customer-visits/service";
import { cartUpdateSchema, prepareSchema, submitSchema } from "../orders/model";
import { prepareConfirmation, submitOrder, updateCart } from "../orders/service";
import { getEvents } from "../stores/queries";
import { speechSpeedInputSchema } from "../voice/model";
import { setSpeechSpeed } from "../voice/service";
import { voiceRoutes } from "../voice/routes";
import { uiSectionInputSchema } from "./model";
import { getTableState } from "./queries";
import { callStaff, changeLocale, requestBill, setUiSection } from "./service";
export const tableOperations = new Hono<ApiEnv>()
  .post("/customer-target", validate(customerTargetSchema), async (c) =>
    c.json(await selectCustomerTarget(c.get("services"), c.get("actor"), c.req.valid("json")), 200),
  )
  .post("/customer-consumption", validate(customerAttributionSchema), async (c) =>
    c.json(
      await attributeCustomerConsumption(c.get("services"), c.get("actor"), c.req.valid("json")),
      200,
    ),
  )
  .post("/customer-code", async (c) =>
    c.json(await createCustomerVisitCode(c.get("services"), c.get("actor")), 200),
  )
  .get("/participants", async (c) =>
    c.json(await getDeviceParticipants(c.get("services"), c.get("actor")), 200),
  )
  .get("/", async (c) => c.json(await getTableState(c.get("services"), c.get("actor")), 200))
  .get("/catalog", async (c) =>
    c.json(
      instructionResponse(
        await getCatalog(c.get("services"), c.get("actor").storeId, c.get("actor").demoId),
        c.req.header("X-Tablecast-Instructions"),
      ),
      200,
    ),
  )
  .patch("/ui", validate(uiSectionInputSchema), async (c) =>
    c.json(await setUiSection(c.get("services"), c.get("actor"), c.req.valid("json")), 200),
  )
  .patch("/voice/speed", validate(speechSpeedInputSchema), async (c) =>
    c.json(await setSpeechSpeed(c.get("services"), c.get("actor"), c.req.valid("json")), 200),
  )
  .put("/cart", validate(cartUpdateSchema), async (c) =>
    c.json(await updateCart(c.get("services"), c.get("actor"), c.req.valid("json")), 200),
  )
  .post("/confirm", validate(prepareSchema), async (c) =>
    c.json(await prepareConfirmation(c.get("services"), c.get("actor"), c.req.valid("json")), 200),
  )
  .post("/orders", validate(submitSchema), async (c) =>
    c.json(await submitOrder(c.get("services"), c.get("actor"), c.req.valid("json")), 200),
  )
  .get("/orders/status", async (c) => {
    const state = await getTableState(c.get("services"), c.get("actor"));
    return c.json(
      {
        order:
          state.orders.find((order) => order.idempotencyKey === c.req.query("idempotencyKey")) ??
          null,
      },
      200,
    );
  })
  .post("/call", async (c) => c.json(await callStaff(c.get("services"), c.get("actor")), 200))
  .post("/bill/request", async (c) =>
    c.json(await requestBill(c.get("services"), c.get("actor")), 200),
  )
  .patch("/locale", validate(z.object({ locale: localeSchema }).strict()), async (c) =>
    c.json(await changeLocale(c.get("services"), c.get("actor"), c.req.valid("json").locale), 200),
  )
  .route("/voice", voiceRoutes)
  .route("/games", gamesTableRoutes)
  .get(
    "/events",
    validateQuery(z.object({ after: z.coerce.number().int().nonnegative().default(0) })),
    async (c) =>
      c.json(await getEvents(c.get("services"), c.get("actor"), c.req.valid("query").after), 200),
  )
  .get("/live", async (c) => {
    const actor = c.get("actor");
    return c.env.TABLECAST_EVENTS.get(
      c.env.TABLECAST_EVENTS.idFromName(
        actor.demoId ? `tablecast-demo-${actor.demoId}` : actor.storeId,
      ),
    ).fetch(c.req.raw);
  });
