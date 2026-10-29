import { z } from "zod";
import { ensure } from "../../platform/errors";
import { apiFactory } from "../../platform/http";
import { validate, validateQuery } from "../../platform/validation";
import { staffIdentity, tableScope } from "../auth/middleware";
import {
  getPosCheckout,
  previewPosCheckout,
  reconcilePosCheckout,
  reconcilePosWebhook,
  startPosCheckout,
} from "./checkout";
import {
  disconnectPos,
  finishPosOAuth,
  getPosCatalog,
  getPosSettings,
  savePosMappings,
  savePosSettings,
  startPosOAuth,
} from "./connections";
import { createPosDeviceCode, getPosDeviceCode, getPosDevices } from "./devices";
import { posConfigurationSchema, posMappingsUpdateSchema, posStartSchema } from "./model";
import { verifySquareWebhook } from "./square";

export const posAdminRoutes = apiFactory
  .createApp()
  .get(
    "/pos/devices",
    validateQuery(z.object({ locationId: z.string().min(1).max(200).optional() })),
    async (c) =>
      c.json(
        await getPosDevices(c.var.services, c.var.actor, c.req.valid("query").locationId),
        200,
      ),
  )
  .post(
    "/pos/devices",
    validate(
      z
        .object({
          locationId: z.string().min(1).max(200),
          name: z.string().trim().min(1).max(100),
          idempotencyKey: z.string().min(8).max(100),
        })
        .strict(),
    ),
    async (c) =>
      c.json(await createPosDeviceCode(c.var.services, c.var.actor, c.req.valid("json")), 200),
  )
  .get("/pos/devices/:deviceCodeId", async (c) =>
    c.json(await getPosDeviceCode(c.var.services, c.var.actor, c.req.param("deviceCodeId")), 200),
  )
  .get(
    "/pos",
    validateQuery(z.object({ draftId: z.string().min(1).max(200).optional() }).strict()),
    async (c) =>
      c.json(await getPosSettings(c.var.services, c.var.actor, c.req.valid("query").draftId), 200),
  )
  .get(
    "/pos/catalog",
    validateQuery(z.object({ locationId: z.string().min(1).max(200).optional() })),
    async (c) =>
      c.json(
        await getPosCatalog(c.var.services, c.var.actor, c.req.valid("query").locationId),
        200,
      ),
  )
  .put("/pos", validate(posConfigurationSchema), async (c) =>
    c.json(await savePosSettings(c.var.services, c.var.actor, c.req.valid("json")), 200),
  )
  .put("/pos/mappings", validate(posMappingsUpdateSchema), async (c) =>
    c.json(await savePosMappings(c.var.services, c.var.actor, c.req.valid("json")), 200),
  )
  .delete("/pos", async (c) => c.json(await disconnectPos(c.var.services, c.var.actor), 200))
  .post("/pos/oauth", async (c) => c.json(await startPosOAuth(c.var.services, c.var.actor), 200))
  .get("/tables/:id/pos", tableScope, async (c) =>
    c.json(await getPosCheckout(c.var.services, c.var.actor), 200),
  )
  .post("/tables/:id/pos/preview", tableScope, async (c) =>
    c.json(await previewPosCheckout(c.var.services, c.var.actor), 200),
  )
  .post("/tables/:id/pos/start", validate(posStartSchema), tableScope, async (c) =>
    c.json(await startPosCheckout(c.var.services, c.var.actor, c.req.valid("json")), 200),
  )
  .post("/tables/:id/pos/reconcile", tableScope, async (c) =>
    c.json(await reconcilePosCheckout(c.var.services, c.var.actor), 200),
  )
  .post("/tables/:id/pos/cancel", tableScope, async (c) =>
    c.json(await reconcilePosCheckout(c.var.services, c.var.actor, true), 200),
  );

const notificationSchema = z.object({
  event_id: z.string().min(1).max(200),
  merchant_id: z.string().min(1).max(200),
  type: z.string(),
  data: z.object({
    id: z.string().optional(),
    object: z.record(z.string(), z.unknown()).optional(),
  }),
});
const objectSchema = z.object({ id: z.string().optional(), order_id: z.string().optional() });
export const posOperatingRoutes = apiFactory
  .createApp()
  .get(
    "/api/pos/square/callback",
    validateQuery(z.object({ code: z.string().min(1), state: z.string().min(1).max(1000) })),
    async (c) => {
      const session = await staffIdentity(c);
      const { code, state } = c.req.valid("query");
      const storeId = await finishPosOAuth(c.var.services, session.user.id, state, code);
      return c.redirect(
        new URL(
          "/admin/stores/" + encodeURIComponent(storeId) + "/pos",
          c.env.TABLECAST_PUBLIC_ORIGIN,
        ).href,
        302,
      );
    },
  )
  .post("/api/pos/square/webhook", async (c) => {
    const key = c.env.TABLECAST_SQUARE_WEBHOOK_SIGNATURE_KEY;
    ensure(key, "POS_NOT_CONFIGURED", 503);
    const body = await c.req.text();
    const url = new URL("/api/pos/square/webhook", c.env.TABLECAST_PUBLIC_ORIGIN).href;
    ensure(
      await verifySquareWebhook(
        body,
        c.req.header("x-square-hmacsha256-signature") ?? "",
        url,
        key,
      ),
      "POS_WEBHOOK_SIGNATURE",
      403,
    );
    const notification = notificationSchema.parse(JSON.parse(body));
    const object = objectSchema.safeParse(
      notification.data.object?.checkout ??
        notification.data.object?.terminal_checkout ??
        notification.data.object?.payment ??
        notification.data.object?.order,
    );
    const value = object.success ? object.data : undefined;
    await reconcilePosWebhook(c.var.services, {
      id: notification.event_id,
      merchantId: notification.merchant_id,
      ...(notification.type.startsWith("terminal.checkout.")
        ? { externalCheckoutId: value?.id ?? notification.data.id }
        : {}),
      ...(notification.type.startsWith("order.")
        ? { externalOrderId: value?.id ?? notification.data.id }
        : value?.order_id
          ? { externalOrderId: value.order_id }
          : {}),
    });
    return c.json({ received: true }, 200);
  });
