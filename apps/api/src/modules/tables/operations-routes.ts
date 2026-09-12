import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { localeSchema } from "../../platform/model";
import { validate, validateQuery } from "../../platform/validation";
import { getCatalog } from "../catalog/queries";
import { cartUpdateSchema, prepareSchema, submitSchema } from "../orders/model";
import { prepareConfirmation, submitOrder, updateCart } from "../orders/service";
import { getEvents } from "../stores/queries";
import { speechSpeedInputSchema } from "../voice/model";
import { setSpeechSpeed } from "../voice/service";
import { startVoiceSession, stopVoiceSession } from "../voice/session";
import { uiSectionInputSchema } from "./model";
import { getTableState } from "./queries";
import { callStaff, changeLocale, requestBill, setUiSection } from "./service";
export const tableOperations = new Hono<ApiEnv>()
  .get("/", async (c) => c.json(await getTableState(c.get("services"), c.get("actor")), 200))
  .get("/catalog", async (c) =>
    c.json(await getCatalog(c.get("services"), c.get("actor").storeId, c.get("actor").demoId), 200),
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
  .post("/voice/start", async (c) =>
    c.json(await startVoiceSession(c.get("services"), c.get("actor")), 200),
  )
  .post(
    "/voice/stop",
    validate(z.object({ voiceSessionId: z.string().optional() }).strict()),
    async (c) =>
      c.json(
        await stopVoiceSession(
          c.get("services"),
          c.get("actor"),
          c.req.valid("json").voiceSessionId,
        ),
        200,
      ),
  )
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
