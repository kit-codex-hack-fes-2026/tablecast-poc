import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { bodyLimit } from "hono/body-limit";
import { setCookie } from "hono/cookie";
import { z } from "zod";
import { APIError } from "better-auth/api";
import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import {
  createAuth,
  deviceActor,
  hashDeviceToken,
  staffActor,
  staffIdentity,
  type Actor,
  type ApiEnv,
} from "./auth";
import { DomainError, ensure } from "./errors";
import {
  cartUpdateSchema,
  configurationSchema,
  historyQuerySchema,
  localeSchema,
  prepareSchema,
  sessionEventsQuerySchema,
  submitSchema,
  voiceListQuerySchema,
} from "./schema";
import {
  callStaff,
  changeLocale,
  changeOrderStatus,
  closeTable,
  getAdminState,
  getCatalog,
  getEvents,
  getHistory,
  getSession,
  getSessionEvents,
  getTableState,
  openTable,
  prepareConfirmation,
  recordPayment,
  requestBill,
  resolveCall,
  setVoiceSession,
  submitOrder,
  updateCart,
} from "./modules/operations";
import {
  createDraft,
  discardDraft,
  getDraft,
  listDrafts,
  publishDraft,
  updateDraft,
  validateDraft,
} from "./modules/configuration";
import { mcpRoutes } from "./mcp";
import { issueVoiceToken, stopVoiceRoom, voiceRoutes } from "./voice";
import { listVoices } from "./modules/voices";

const validate = <T extends z.ZodType>(schema: T) =>
  zValidator("json", schema, (result) => {
    if (!result.success)
      throw new DomainError(
        "INVALID_INPUT",
        422,
        "INVALID_INPUT",
        result.error.issues.map((issue) => ({ path: issue.path, code: issue.code })),
      );
  });
const validateQuery = <T extends z.ZodType>(schema: T) =>
  zValidator("query", schema, (result) => {
    if (!result.success)
      throw new DomainError(
        "INVALID_INPUT",
        400,
        "INVALID_INPUT",
        result.error.issues.map((issue) => ({ path: issue.path, code: issue.code })),
      );
  });
const versionSchema = z.object({ expectedVersion: z.number().int().nonnegative() }).strict();
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
const app = new Hono<ApiEnv>();
app.use("*", async (c, next) => {
  const traceId = crypto.randomUUID();
  c.set("traceId", traceId);
  c.header("X-Request-Id", traceId);
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
    !c.req.path.startsWith("/internal/voice/") &&
    c.req.path !== "/mcp"
  ) {
    const origin = c.req.header("Origin");
    ensure(!origin || origin === c.env.TABLECAST_PUBLIC_ORIGIN, "ORIGIN_FORBIDDEN", 403);
    const site = c.req.header("Sec-Fetch-Site");
    ensure(site !== "cross-site", "ORIGIN_FORBIDDEN", 403);
  }
  await next();
});
app.use(
  "*",
  bodyLimit({
    maxSize: 2 * 1024 * 1024,
    onError: (c) => c.json({ error: { code: "BODY_TOO_LARGE", message: "BODY_TOO_LARGE" } }, 413),
  }),
);
app.onError((error, c) => {
  if (error instanceof DomainError)
    return c.json(
      {
        error: { code: error.code, message: error.message, details: error.details },
        traceId: c.get("traceId"),
      },
      error.status,
    );
  if (error instanceof APIError)
    return new Response(JSON.stringify(error.body), {
      status: error.statusCode,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  console.error(
    JSON.stringify({
      event: "tablecast.request_failed",
      traceId: c.get("traceId"),
      releaseSha: c.env.TABLECAST_RELEASE_SHA,
      path: c.req.path,
      errorType: error.name,
    }),
  );
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "INTERNAL_ERROR" }, traceId: c.get("traceId") },
    500,
  );
});
app.get("/api/health", (c) => c.json({ status: "ok", releaseSha: c.env.TABLECAST_RELEASE_SHA }));
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  ensure(
    !c.req.path.startsWith("/api/auth/tablecast/") && !c.req.path.startsWith("/api/auth/device"),
    "ROUTE_NOT_PUBLIC",
    404,
  );
  return createAuth(c.env).handler(c.req.raw);
});
app.get("/.well-known/oauth-authorization-server/api/auth", (c) =>
  oauthProviderAuthServerMetadata(createAuth(c.env))(c.req.raw),
);
app.get("/.well-known/openid-configuration/api/auth", (c) =>
  oauthProviderOpenIdConfigMetadata(createAuth(c.env))(c.req.raw),
);
app.get("/.well-known/oauth-protected-resource/mcp", (c) =>
  c.json({
    resource: `${c.env.TABLECAST_PUBLIC_ORIGIN}/mcp`,
    authorization_servers: [`${c.env.TABLECAST_PUBLIC_ORIGIN}/api/auth`],
    scopes_supported: ["tablecast:read", "tablecast:write"],
    bearer_methods_supported: ["header"],
  }),
);
app.route("/mcp", mcpRoutes);
app.route("/internal/voice", voiceRoutes);
app.post("/api/devices/request", async (c) =>
  c.json(
    await createAuth(c.env).api.deviceCode({
      body: { client_id: "tablecast-kiosk", scope: "tablecast:table" },
    }),
  ),
);
app.post(
  "/api/devices/poll",
  validate(z.object({ device_code: z.string().min(1).max(191) }).strict()),
  async (c) => {
    let result;
    try {
      result = await createAuth(c.env).api.tablecastRedeemDevice({
        body: { deviceCode: c.req.valid("json").device_code },
      });
    } catch (error) {
      if (
        error instanceof APIError &&
        ["authorization_pending", "slow_down"].includes(String(error.body?.error))
      )
        return c.json({ ready: false });
      throw error;
    }
    const mapping = await c.env.TABLECAST_DB.prepare(
      "SELECT * FROM device_assignments WHERE user_code=? AND approved_by=?",
    )
      .bind(result.userCode, result.userId)
      .first<{ store_id: string; table_id: string; approved_by: string }>();
    ensure(mapping, "DEVICE_NOT_ASSIGNED", 403);
    const token = crypto.randomUUID() + crypto.randomUUID();
    await c.env.TABLECAST_DB.prepare(
      "INSERT INTO devices(id,token_hash,store_id,table_id,approved_by,created_at) VALUES(?,?,?,?,?,?)",
    )
      .bind(
        crypto.randomUUID(),
        await hashDeviceToken(token),
        mapping.store_id,
        mapping.table_id,
        mapping.approved_by,
        Date.now(),
      )
      .run();
    setCookie(c, "tablecast.device", token, {
      httpOnly: true,
      secure: c.env.TABLECAST_PUBLIC_ORIGIN.startsWith("https:"),
      sameSite: "Strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return c.json({ ready: true });
  },
);
const table = new Hono<ApiEnv>()
  .use("*", async (c, next) => {
    c.set("actor", await deviceActor(c));
    await next();
  })
  .get("/", async (c) => c.json(await getTableState(c.env, c.get("actor"))))
  .get("/catalog", async (c) => c.json(await getCatalog(c.env, c.get("actor").storeId)))
  .put("/cart", validate(cartUpdateSchema), async (c) =>
    c.json(await updateCart(c.env, c.get("actor"), c.req.valid("json"))),
  )
  .post("/confirm", validate(prepareSchema), async (c) =>
    c.json(await prepareConfirmation(c.env, c.get("actor"), c.req.valid("json"))),
  )
  .post("/orders", validate(submitSchema), async (c) =>
    c.json(await submitOrder(c.env, c.get("actor"), c.req.valid("json"))),
  )
  .get("/orders/status", async (c) => {
    const state = await getTableState(c.env, c.get("actor"));
    return c.json({
      order:
        state.orders.find((order) => order.idempotencyKey === c.req.query("idempotencyKey")) ??
        null,
    });
  })
  .post("/call", async (c) => c.json(await callStaff(c.env, c.get("actor"))))
  .post("/bill/request", async (c) => c.json(await requestBill(c.env, c.get("actor"))))
  .patch("/locale", validate(z.object({ locale: localeSchema }).strict()), async (c) =>
    c.json(await changeLocale(c.env, c.get("actor"), c.req.valid("json").locale)),
  )
  .post("/voice/start", async (c) => {
    const actor = c.get("actor");
    const row = await getSession(c.env, actor);
    ensure(row.voice_state !== "active", "VOICE_ALREADY_ACTIVE", 409);
    ensure(c.env.TABLECAST_VOICE_ENABLED === "true", "VOICE_NOT_CONFIGURED", 503);
    const catalog = await getCatalog(c.env, actor.storeId);
    ensure(catalog.configuration.cast.voice[row.locale], "VOICE_NOT_CONFIGURED", 503);
    const id = crypto.randomUUID();
    const token = await issueVoiceToken(c.env, id);
    await setVoiceSession(c.env, actor, id, undefined, row.voice_version);
    return c.json({ ...token, voiceSessionId: id });
  })
  .post(
    "/voice/stop",
    validate(z.object({ voiceSessionId: z.string().optional() }).strict()),
    async (c) => {
      const actor = c.get("actor");
      const row = await getSession(c.env, actor);
      const requested = c.req.valid("json").voiceSessionId;
      const voiceSessionId = requested ?? row.voice_session_id;
      if (requested && requested !== row.voice_session_id) {
        const owned = await c.env.TABLECAST_DB.prepare(
          "SELECT cursor FROM table_events WHERE store_id=? AND table_session_id=? AND kind='voice.started' AND json_extract(data_json,'$.voiceSessionId')=? LIMIT 1",
        )
          .bind(actor.storeId, row.id, requested)
          .first();
        ensure(owned, "VOICE_SESSION_NOT_FOUND", 404);
        await stopVoiceRoom(c.env, requested);
        return c.json(await getTableState(c.env, actor));
      }
      const state = await setVoiceSession(c.env, actor, null, requested, row.voice_version);
      if (voiceSessionId) await stopVoiceRoom(c.env, voiceSessionId);
      return c.json(state);
    },
  )
  .get("/events", async (c) =>
    c.json(
      await getEvents(
        c.env,
        c.get("actor"),
        z.coerce
          .number()
          .int()
          .nonnegative()
          .parse(c.req.query("after") ?? 0),
      ),
    ),
  )
  .get("/live", async (c) => {
    const actor = c.get("actor");
    return c.env.TABLECAST_EVENTS.get(c.env.TABLECAST_EVENTS.idFromName(actor.storeId)).fetch(
      c.req.raw,
    );
  });
const tableRoutes = app.route("/api/table", table);
app.get("/api/admin/stores", async (c) => {
  const session = await staffIdentity(c);
  const rows = await c.env.TABLECAST_DB.prepare(
    "SELECT s.id,s.name,m.role,s.organization_id AS organizationId FROM stores s JOIN member m ON m.organization_id=s.organization_id WHERE m.user_id=? AND (m.role IN ('owner','admin') OR EXISTS(SELECT 1 FROM team_member tm JOIN team t ON t.id=tm.team_id WHERE tm.user_id=m.user_id AND t.id=s.team_id AND t.organization_id=s.organization_id)) ORDER BY s.name",
  )
    .bind(session.user.id)
    .all<{ id: string; name: string; role: string; organizationId: string }>();
  return c.json({ stores: rows.results, locale: session.user.locale });
});
const admin = new Hono<ApiEnv>().use("*", async (c, next) => {
  const storeId = c.req.param("storeId");
  ensure(storeId, "STORE_REQUIRED", 400);
  c.set("actor", await staffActor(c, storeId));
  await next();
});
const scoped = (actor: Actor, id: string): Actor => ({ ...actor, tableSessionId: id });
admin.get("/", async (c) => c.json(await getAdminState(c.env, c.get("actor"))));
admin.get("/catalog", async (c) => c.json(await getCatalog(c.env, c.get("actor").storeId)));
admin.get("/voices", validateQuery(voiceListQuerySchema), async (c) =>
  c.json(await listVoices(c.env, c.get("actor"), c.req.valid("query"))),
);
admin.get("/history", validateQuery(historyQuerySchema), async (c) =>
  c.json(await getHistory(c.env, c.get("actor"), c.req.valid("query"))),
);
admin.get("/tables/:id", async (c) =>
  c.json(await getTableState(c.env, scoped(c.get("actor"), c.req.param("id")))),
);
admin.get("/tables/:id/events", validateQuery(sessionEventsQuerySchema), async (c) =>
  c.json(
    await getSessionEvents(c.env, scoped(c.get("actor"), c.req.param("id")), c.req.valid("query")),
  ),
);
admin.post(
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
  async (c) => c.json(await openTable(c.env, c.get("actor"), c.req.valid("json"))),
);
admin.post("/tables/:id/payments", validate(paymentSchema), async (c) =>
  c.json(
    await recordPayment(c.env, scoped(c.get("actor"), c.req.param("id")), c.req.valid("json")),
  ),
);
admin.post("/tables/:id/close", async (c) =>
  c.json(await closeTable(c.env, scoped(c.get("actor"), c.req.param("id")))),
);
admin.post("/tables/:id/call/resolve", async (c) =>
  c.json(await resolveCall(c.env, scoped(c.get("actor"), c.req.param("id")))),
);
admin.post(
  "/orders/:id/status",
  validate(z.object({ status: z.enum(["accepted", "served", "rejected", "cancelled"]) }).strict()),
  async (c) =>
    c.json(
      await changeOrderStatus(c.env, c.get("actor"), c.req.param("id"), c.req.valid("json").status),
    ),
);
admin.get("/events", async (c) =>
  c.json(
    await getEvents(
      c.env,
      c.get("actor"),
      z.coerce
        .number()
        .int()
        .nonnegative()
        .parse(c.req.query("after") ?? 0),
    ),
  ),
);
admin.get("/live", async (c) => {
  const actor = c.get("actor");
  return c.env.TABLECAST_EVENTS.get(c.env.TABLECAST_EVENTS.idFromName(actor.storeId)).fetch(
    c.req.raw,
  );
});
admin.post(
  "/devices/approve",
  validate(z.object({ userCode: z.string().min(1).max(191), tableId: z.string() }).strict()),
  async (c) => {
    const actor = await staffActor(c, c.get("actor").storeId, true);
    const input = c.req.valid("json");
    const auth = createAuth(c.env);
    const target = await c.env.TABLECAST_DB.prepare(
      "SELECT id FROM restaurant_tables WHERE id=? AND store_id=?",
    )
      .bind(input.tableId, actor.storeId)
      .first();
    ensure(target, "TABLE_NOT_FOUND", 404);
    await auth.api.deviceVerify({
      query: { user_code: input.userCode },
      headers: c.req.raw.headers,
    });
    await c.env.TABLECAST_DB.prepare(
      "INSERT INTO device_assignments(user_code,store_id,table_id,approved_by,created_at) VALUES(?,?,?,?,?)",
    )
      .bind(input.userCode, actor.storeId, input.tableId, actor.userId, Date.now())
      .run();
    await auth.api.deviceApprove({
      body: { userCode: input.userCode },
      headers: c.req.raw.headers,
    });
    return c.json({ approved: true });
  },
);
admin.post("/devices/:id/revoke", async (c) => {
  const actor = await staffActor(c, c.get("actor").storeId, true);
  await c.env.TABLECAST_DB.prepare("UPDATE devices SET revoked_at=? WHERE id=? AND store_id=?")
    .bind(Date.now(), c.req.param("id"), actor.storeId)
    .run();
  return c.json({ revoked: true });
});
admin.get("/drafts", async (c) => c.json(await listDrafts(c.env, c.get("actor"))));
admin.post("/drafts", async (c) => c.json(await createDraft(c.env, c.get("actor"))));
admin.get("/drafts/:id", async (c) =>
  c.json(await getDraft(c.env, c.get("actor"), c.req.param("id"))),
);
admin.put(
  "/drafts/:id",
  validate(
    z.object({ expectedVersion: z.number().int(), configuration: configurationSchema }).strict(),
  ),
  async (c) =>
    c.json(await updateDraft(c.env, c.get("actor"), c.req.param("id"), c.req.valid("json"))),
);
admin.post("/drafts/:id/validate", validate(versionSchema), async (c) =>
  c.json(
    await validateDraft(
      c.env,
      c.get("actor"),
      c.req.param("id"),
      c.req.valid("json").expectedVersion,
    ),
  ),
);
admin.post("/drafts/:id/discard", validate(versionSchema), async (c) =>
  c.json(
    await discardDraft(
      c.env,
      c.get("actor"),
      c.req.param("id"),
      c.req.valid("json").expectedVersion,
    ),
  ),
);
admin.post(
  "/drafts/:id/publish",
  validate(
    z
      .object({
        expectedVersion: z.number().int(),
        baseVersion: z.number().int(),
        idempotencyKey: z.string().min(8).max(100),
        approved: z.literal(true),
      })
      .strict(),
  ),
  async (c) =>
    c.json(await publishDraft(c.env, c.get("actor"), c.req.param("id"), c.req.valid("json"))),
);
app.route("/api/admin/stores/:storeId", admin);
app.get("/media/*", async (c) => {
  const key = c.req.path.slice("/media/".length);
  ensure(/^tablecast\/[a-zA-Z0-9/_-]+\.(png|jpg|webp|svg)$/.test(key), "MEDIA_NOT_FOUND", 404);
  const asset = await c.env.TABLECAST_MEDIA.get(key);
  ensure(asset, "MEDIA_NOT_FOUND", 404);
  const output = await c.env.TABLECAST_IMAGES.input(asset.body)
    .transform({ width: 640, fit: "scale-down" })
    .output({ format: "image/webp" });
  const response = output.response();
  response.headers.set("Cache-Control", "public,max-age=86400");
  response.headers.set("ETag", `W/"${asset.etag}-640-webp"`);
  return response;
});
export type AppType = typeof tableRoutes;
export default app;
