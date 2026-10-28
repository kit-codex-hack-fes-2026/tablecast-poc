import { z } from "zod";
import { apiFactory } from "../../platform/http";
import { localeSchema } from "../../platform/model";
import { validate, validateQuery } from "../../platform/validation";
import { getCatalog } from "../catalog/queries";
import { instructionResponse } from "../configuration/instruction-response";
import { initialiseExchangeRates } from "../currency/service";
import { customerAttributionSchema, customerTargetSchema } from "../customer-memory/model";
import { attributeCustomerConsumption } from "../customer-memory/use-cases/consumption";
import { selectCustomerTarget } from "../customer-memory/use-cases/target";
import { getDeviceParticipants } from "../customer-visits/queries";
import { createCustomerVisitCode } from "../customer-visits/service";
import { withImageAssets } from "../media/queries";
import { protectedMediaRoutes } from "../media/routes";
import { cartUpdateSchema, prepareSchema, submitSchema } from "../orders/model";
import { updateCart } from "../orders/use-cases/cart";
import { prepareConfirmation, submitOrder } from "../orders/use-cases/confirmation";
import { getEvents } from "../stores/queries";
import { speechSpeedInputSchema } from "../voice/model";
import { setSpeechSpeed } from "../voice/service";
import { getCoreState, getOrderPage, getOrderStatus } from "./core-queries";
import { orderPageQuerySchema, stateViewSchema, uiSectionInputSchema } from "./model";
import { getTableState } from "./queries";
import { callStaff, changeLocale, requestBill, setUiSection } from "./use-cases/presentation";
export const orderingOperations = apiFactory
  .createApp()
  .route("/", protectedMediaRoutes)
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
  .get("/", validateQuery(stateViewSchema), async (c) =>
    c.json(
      c.req.valid("query").view === "core"
        ? await getCoreState(c.get("services"), c.get("actor"))
        : await getTableState(c.get("services"), c.get("actor")),
      200,
    ),
  )
  .get("/orders", validateQuery(orderPageQuerySchema), async (c) =>
    c.json(await getOrderPage(c.get("services"), c.get("actor"), c.req.valid("query")), 200),
  )
  .get("/exchange-rates", async (c) =>
    c.json(await initialiseExchangeRates(c.get("services"), c.get("actor")), 200),
  )
  .get("/catalog", async (c) =>
    c.json(
      instructionResponse(
        await withImageAssets(
          c.var.services,
          await getCatalog(c.var.services, c.var.actor.storeId, c.var.actor.demoId),
        ),
        c.req.header("X-Tablecast-Instructions"),
      ),
      200,
    ),
  )
  .patch("/ui", validateQuery(stateViewSchema), validate(uiSectionInputSchema), async (c) =>
    c.json(
      await setUiSection(
        c.get("services"),
        c.get("actor"),
        c.req.valid("json"),
        c.req.valid("query").view,
      ),
      200,
    ),
  )
  .patch(
    "/voice/speed",
    validateQuery(stateViewSchema),
    validate(speechSpeedInputSchema),
    async (c) =>
      c.json(
        await setSpeechSpeed(
          c.get("services"),
          c.get("actor"),
          c.req.valid("json"),
          c.req.valid("query").view,
        ),
        200,
      ),
  )
  .put("/cart", validateQuery(stateViewSchema), validate(cartUpdateSchema), async (c) =>
    c.json(
      await updateCart(
        c.get("services"),
        c.get("actor"),
        c.req.valid("json"),
        c.req.valid("query").view,
      ),
      200,
    ),
  )
  .post("/confirm", validate(prepareSchema), async (c) =>
    c.json(await prepareConfirmation(c.get("services"), c.get("actor"), c.req.valid("json")), 200),
  )
  .post("/orders", validateQuery(stateViewSchema), validate(submitSchema), async (c) =>
    c.json(
      await submitOrder(
        c.get("services"),
        c.get("actor"),
        c.req.valid("json"),
        c.req.valid("query").view,
      ),
      200,
    ),
  )
  .get("/orders/status", async (c) =>
    c.json(
      {
        order: await getOrderStatus(
          c.get("services"),
          c.get("actor"),
          c.req.query("idempotencyKey"),
        ),
      },
      200,
    ),
  )
  .post("/call", validateQuery(stateViewSchema), async (c) =>
    c.json(await callStaff(c.get("services"), c.get("actor"), c.req.valid("query").view), 200),
  )
  .post("/bill/request", validateQuery(stateViewSchema), async (c) =>
    c.json(await requestBill(c.get("services"), c.get("actor"), c.req.valid("query").view), 200),
  )
  .patch(
    "/locale",
    validateQuery(stateViewSchema),
    validate(z.object({ locale: localeSchema }).strict()),
    async (c) =>
      c.json(
        await changeLocale(
          c.get("services"),
          c.get("actor"),
          c.req.valid("json").locale,
          c.req.valid("query").view,
        ),
        200,
      ),
  )
  .get(
    "/events",
    validateQuery(
      z.object({
        after: z.coerce.number().int().nonnegative().default(0),
        tail: z.enum(["true", "false"]).default("false"),
      }),
    ),
    async (c) =>
      c.json(
        await getEvents(
          c.get("services"),
          c.get("actor"),
          c.req.valid("query").after,
          c.req.valid("query").tail === "true",
        ),
        200,
      ),
  )
  .get("/live", async (c) => {
    const actor = c.get("actor");
    return c.env.TABLECAST_EVENTS.get(
      c.env.TABLECAST_EVENTS.idFromName(
        actor.demoId ? `tablecast-demo-${actor.demoId}` : actor.storeId,
      ),
    ).fetch(c.req.raw);
  });
