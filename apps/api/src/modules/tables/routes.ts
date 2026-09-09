import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { localeSchema } from "../../platform/model";
import { validate, validateQuery } from "../../platform/validation";
import { requireDevice } from "../auth/middleware";
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
export const table = new Hono<ApiEnv>()
  .use("*", requireDevice)
  .get("/", async (c) => c.json(await getTableState(c.get("services"), c.get("actor"))))
  .get("/catalog", async (c) => c.json(await getCatalog(c.get("services"), c.get("actor").storeId)))
  .patch("/ui", validate(uiSectionInputSchema), async (c) =>
    c.json(await setUiSection(c.get("services"), c.get("actor"), c.req.valid("json"))),
  )
  .patch("/voice/speed", validate(speechSpeedInputSchema), async (c) =>
    c.json(await setSpeechSpeed(c.get("services"), c.get("actor"), c.req.valid("json"))),
  )
  .put("/cart", validate(cartUpdateSchema), async (c) =>
    c.json(await updateCart(c.get("services"), c.get("actor"), c.req.valid("json"))),
  )
  .post("/confirm", validate(prepareSchema), async (c) =>
    c.json(await prepareConfirmation(c.get("services"), c.get("actor"), c.req.valid("json"))),
  )
  .post("/orders", validate(submitSchema), async (c) =>
    c.json(await submitOrder(c.get("services"), c.get("actor"), c.req.valid("json"))),
  )
  .get("/orders/status", async (c) => {
    const state = await getTableState(c.get("services"), c.get("actor"));
    return c.json({
      order:
        state.orders.find((order) => order.idempotencyKey === c.req.query("idempotencyKey")) ??
        null,
    });
  })
  .post("/call", async (c) => c.json(await callStaff(c.get("services"), c.get("actor"))))
  .post("/bill/request", async (c) => c.json(await requestBill(c.get("services"), c.get("actor"))))
  .patch("/locale", validate(z.object({ locale: localeSchema }).strict()), async (c) =>
    c.json(await changeLocale(c.get("services"), c.get("actor"), c.req.valid("json").locale)),
  )
  .post("/voice/start", async (c) =>
    c.json(await startVoiceSession(c.get("services"), c.get("actor"))),
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
      ),
  )
  .get(
    "/events",
    validateQuery(z.object({ after: z.coerce.number().int().nonnegative().default(0) })),
    async (c) =>
      c.json(await getEvents(c.get("services"), c.get("actor"), c.req.valid("query").after)),
  )
  .get("/live", async (c) => {
    const actor = c.get("actor");
    return c.env.TABLECAST_EVENTS.get(c.env.TABLECAST_EVENTS.idFromName(actor.storeId)).fetch(
      c.req.raw,
    );
  });
