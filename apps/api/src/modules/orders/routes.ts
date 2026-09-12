import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { validate } from "../../platform/validation";
import type { Actor } from "../auth/model";
import { changeOrderStatus, recordPayment } from "./service";
const paymentSchema = z
  .object({
    amount: z
      .number()
      .int()
      .min(-10_000_000)
      .max(10_000_000)
      .refine((v) => v !== 0),
    idempotencyKey: z.string().min(8).max(100),
    kind: z.enum(["payment", "adjustment"]),
    reason: z.string().min(1).max(500),
  })
  .strict();
const scoped = (actor: Actor, id: string): Actor => ({ ...actor, tableSessionId: id });
export const ordersAdminRoutes = new Hono<ApiEnv>()
  .post("/tables/:id/payments", validate(paymentSchema), async (c) =>
    c.json(
      await recordPayment(
        c.get("services"),
        scoped(c.get("actor"), c.req.param("id")),
        c.req.valid("json"),
      ),
      200,
    ),
  )
  .post(
    "/orders/:id/status",
    validate(
      z.object({ status: z.enum(["accepted", "served", "rejected", "cancelled"]) }).strict(),
    ),
    async (c) =>
      c.json(
        await changeOrderStatus(
          c.get("services"),
          c.get("actor"),
          c.req.param("id"),
          c.req.valid("json").status,
        ),
        200,
      ),
  );
