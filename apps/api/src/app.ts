import { timingSafeEqual } from "node:crypto";
import { previewOAuthFetch } from "./preview-oauth";
import { saveIdentityImage } from "./modules/identity-images";
import { getMcpSessions } from "./modules/mcp-sessions";
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
  requireManager,
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
  uiSectionInputSchema,
  speechSpeedInputSchema,
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
  setUiSection,
  setSpeechSpeed,
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
const publicRoutes = app
  .post(
    "/api/account/avatar",
    zValidator("form", z.object({ image: z.instanceof(File) })),
    async (c) => {
      await staffIdentity(c);
      const { image } = c.req.valid("form");
      const url = await saveIdentityImage(c.env, image);
      await createAuth(c.env).api.updateUser({
        headers: c.req.raw.headers,
        body: { image: url },
      });
      return c.json({ ok: true });
    },
  )
  .get("/api/account/mcp-sessions", async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await getMcpSessions(
        c.env.TABLECAST_DB,
        session.user.id,
        await createAuth(c.env).api.getOAuthConsents({ headers: c.req.raw.headers }),
      ),
    );
  })
  .post("/api/account/mcp-sessions/:id/revoke", async (c) => {
    const session = await staffIdentity(c),
      db = c.env.TABLECAST_DB;
    const consent = await db
      .prepare("SELECT client_id,reference_id FROM oauth_consent WHERE id=? AND user_id=?")
      .bind(c.req.param("id"), session.user.id)
      .first<{ client_id: string; reference_id: string | null }>();
    ensure(consent, "MCP_SESSION_NOT_FOUND", 404);
    const now = Date.now();
    await db.batch([
      db
        .prepare(
          "UPDATE oauth_access_token SET revoked=? WHERE user_id=? AND client_id=? AND reference_id IS ?",
        )
        .bind(now, session.user.id, consent.client_id, consent.reference_id),
      db
        .prepare(
          "UPDATE oauth_refresh_token SET revoked=? WHERE user_id=? AND client_id=? AND reference_id IS ?",
        )
        .bind(now, session.user.id, consent.client_id, consent.reference_id),
      db
        .prepare("DELETE FROM oauth_consent WHERE id=? AND user_id=?")
        .bind(c.req.param("id"), session.user.id),
    ]);
    return c.json({ revoked: true });
  })
  .get("/api/avatars/:key", async (c) => {
    const key = z.uuid().parse(c.req.param("key"));
    const image = await c.env.TABLECAST_MEDIA.get(`tablecast/avatars/${key}`);
    ensure(image, "IMAGE_NOT_FOUND", 404);
    return new Response(image.body, {
      headers: {
        "Content-Type": image.httpMetadata?.contentType ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  })
  .on(["GET", "POST"], ["/_tablecast/oauth/*", "/o/oauth2/v2/auth/*", "/_emulate/*"], (c) => {
    if (c.env.TABLECAST_ENV !== "preview") return c.notFound();
    const url = new URL(c.req.url);
    const path =
      (url.pathname.startsWith("/_tablecast/oauth/")
        ? url.pathname.slice("/_tablecast/oauth".length)
        : url.pathname) + url.search;
    return previewOAuthFetch(c.env, path, {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.raw.body,
      redirect: "manual",
    });
  })
  .post("/internal/deploy/:action", async (c) => {
    const expected = new TextEncoder().encode(`Bearer ${c.env.TABLECAST_VOICE_API_TOKEN}`);
    const actual = new TextEncoder().encode(c.req.header("authorization") ?? "");
    ensure(
      Boolean(c.env.TABLECAST_VOICE_API_TOKEN) &&
        actual.byteLength === expected.byteLength &&
        timingSafeEqual(actual, expected),
      "UNAUTHORIZED",
      401,
    );
    ensure(["drain", "resume"].includes(c.req.param("action")), "INVALID_ACTION", 400);
    try {
      await c.env.TABLECAST_VOICE.getByName("tablecast-voice").setDraining(
        c.req.param("action") === "drain",
      );
    } catch {
      return c.json({ error: "VOICE_RUNTIME_BUSY" }, 409);
    }
    return c.json({ ready: true });
  })
  .get("/api/health", (c) => c.json({ status: "ok", releaseSha: c.env.TABLECAST_RELEASE_SHA }))
  .on(["GET", "POST"], "/api/auth/*", (c) => {
    ensure(
      !c.req.path.startsWith("/api/auth/tablecast/") && !c.req.path.startsWith("/api/auth/device"),
      "ROUTE_NOT_PUBLIC",
      404,
    );
    return createAuth(c.env).handler(c.req.raw);
  })
  .get("/.well-known/oauth-authorization-server/api/auth", (c) =>
    oauthProviderAuthServerMetadata(createAuth(c.env))(c.req.raw),
  )
  .get("/.well-known/openid-configuration/api/auth", (c) =>
    oauthProviderOpenIdConfigMetadata(createAuth(c.env))(c.req.raw),
  )
  .get("/.well-known/oauth-protected-resource/mcp", (c) =>
    c.json({
      resource: `${c.env.TABLECAST_PUBLIC_ORIGIN}/mcp`,
      authorization_servers: [`${c.env.TABLECAST_PUBLIC_ORIGIN}/api/auth`],
      scopes_supported: ["tablecast:read", "tablecast:write"],
      bearer_methods_supported: ["header"],
    }),
  )
  .route("/mcp", mcpRoutes)
  .route("/internal/voice", voiceRoutes)
  .post("/api/devices/request", async (c) =>
    c.json(
      await createAuth(c.env).api.deviceCode({
        body: { client_id: "tablecast-kiosk", scope: "tablecast:table" },
      }),
    ),
  )
  .post(
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
  .patch("/ui", validate(uiSectionInputSchema), async (c) =>
    c.json(await setUiSection(c.env, c.get("actor"), c.req.valid("json"))),
  )
  .patch("/voice/speed", validate(speechSpeedInputSchema), async (c) =>
    c.json(await setSpeechSpeed(c.env, c.get("actor"), c.req.valid("json"))),
  )
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
  .get(
    "/events",
    validateQuery(z.object({ after: z.coerce.number().int().nonnegative().default(0) })),
    async (c) => c.json(await getEvents(c.env, c.get("actor"), c.req.valid("query").after)),
  )
  .get("/live", async (c) => {
    const actor = c.get("actor");
    return c.env.TABLECAST_EVENTS.get(c.env.TABLECAST_EVENTS.idFromName(actor.storeId)).fetch(
      c.req.raw,
    );
  });
const tableRoutes = publicRoutes
  .route("/api/table", table)
  .get("/api/admin/stores", async (c) => {
    const session = await staffIdentity(c);
    const rows = await c.env.TABLECAST_DB.prepare(
      "SELECT s.id,s.name,o.logo,m.role,s.organization_id AS organizationId FROM stores s JOIN organization o ON o.id=s.organization_id JOIN member m ON m.organization_id=s.organization_id WHERE m.user_id=? ORDER BY s.name",
    )
      .bind(session.user.id)
      .all<{
        id: string;
        name: string;
        logo: string | null;
        role: string;
        organizationId: string;
      }>();
    return c.json({ stores: rows.results, locale: session.user.locale });
  })
  .post(
    "/api/admin/stores",
    validate(
      z
        .object({
          name: z.string().trim().min(1).max(150),
          slug: z
            .string()
            .min(1)
            .max(80)
            .regex(/^[a-z0-9-]+$/),
          tableCount: z.number().int().min(1).max(100),
        })
        .strict(),
    ),
    async (c) => {
      const session = await staffIdentity(c);
      const input = c.req.valid("json");
      const id = crypto.randomUUID(),
        now = Date.now();
      const configuration = configurationSchema.parse({
        categories: [],
        products: [],
        plans: [],
        cast: { instructions: { ja: "", en: "" }, voice: { ja: null, en: null }, proactive: false },
      });
      const json = JSON.stringify(configuration),
        db = c.env.TABLECAST_DB;
      ensure(
        !(await db.prepare("SELECT id FROM organization WHERE slug=?").bind(input.slug).first()),
        "STORE_SLUG_TAKEN",
        409,
      );
      await db.batch([
        db
          .prepare("INSERT INTO organization(id,name,slug,created_at) VALUES(?,?,?,?)")
          .bind(id, input.name, input.slug, now),
        db
          .prepare(
            "INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES(?,?,?,'owner',?)",
          )
          .bind(crypto.randomUUID(), id, session.user.id, now),
        db
          .prepare(
            "INSERT INTO stores(id,organization_id,name,config_json,updated_at) VALUES(?,?,?,?,?)",
          )
          .bind(id, id, input.name, json, now),
        db
          .prepare(
            "INSERT INTO config_releases(store_id,version,config_json,published_by,created_at) VALUES(?,1,?,?,?)",
          )
          .bind(id, json, session.user.id, now),
        ...Array.from({ length: input.tableCount }, (_, index) =>
          db
            .prepare("INSERT INTO restaurant_tables(id,store_id,name) VALUES(?,?,?)")
            .bind(crypto.randomUUID(), id, `T${String(index + 1).padStart(2, "0")}`),
        ),
      ]);
      return c.json({ id, organizationId: id }, 201);
    },
  );
const scoped = (actor: Actor, id: string): Actor => ({ ...actor, tableSessionId: id });
const admin = new Hono<ApiEnv>()
  .use("*", async (c, next) => {
    const storeId = c.req.param("storeId");
    ensure(storeId, "STORE_REQUIRED", 400);
    c.set("actor", await staffActor(c, storeId));
    await next();
  })
  .get("/", async (c) => c.json(await getAdminState(c.env, c.get("actor"))))
  .post("/icon", zValidator("form", z.object({ image: z.instanceof(File) })), async (c) => {
    const actor = c.get("actor");
    requireManager(actor);
    const store = await c.env.TABLECAST_DB.prepare("SELECT organization_id FROM stores WHERE id=?")
      .bind(actor.storeId)
      .first<{ organization_id: string }>();
    ensure(store, "STORE_NOT_FOUND", 404);
    const logo = await saveIdentityImage(c.env, c.req.valid("form").image);
    await createAuth(c.env).api.updateOrganization({
      headers: c.req.raw.headers,
      body: { organizationId: store.organization_id, data: { logo } },
    });
    return c.json({ logo });
  })
  .get("/catalog", async (c) => c.json(await getCatalog(c.env, c.get("actor").storeId)))
  .get("/voices", validateQuery(voiceListQuerySchema), async (c) =>
    c.json(await listVoices(c.env, c.get("actor"), c.req.valid("query"))),
  )
  .get("/history", validateQuery(historyQuerySchema), async (c) =>
    c.json(await getHistory(c.env, c.get("actor"), c.req.valid("query"))),
  )
  .get("/tables/:id", async (c) =>
    c.json(await getTableState(c.env, scoped(c.get("actor"), c.req.param("id")))),
  )
  .get("/tables/:id/events", validateQuery(sessionEventsQuerySchema), async (c) =>
    c.json(
      await getSessionEvents(
        c.env,
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
    async (c) => c.json(await openTable(c.env, c.get("actor"), c.req.valid("json"))),
  )
  .post("/tables/:id/payments", validate(paymentSchema), async (c) =>
    c.json(
      await recordPayment(c.env, scoped(c.get("actor"), c.req.param("id")), c.req.valid("json")),
    ),
  )
  .post("/tables/:id/close", async (c) =>
    c.json(await closeTable(c.env, scoped(c.get("actor"), c.req.param("id")))),
  )
  .post("/tables/:id/call/resolve", async (c) =>
    c.json(await resolveCall(c.env, scoped(c.get("actor"), c.req.param("id")))),
  )
  .post(
    "/orders/:id/status",
    validate(
      z.object({ status: z.enum(["accepted", "served", "rejected", "cancelled"]) }).strict(),
    ),
    async (c) =>
      c.json(
        await changeOrderStatus(
          c.env,
          c.get("actor"),
          c.req.param("id"),
          c.req.valid("json").status,
        ),
      ),
  )
  .get(
    "/events",
    validateQuery(z.object({ after: z.coerce.number().int().nonnegative().default(0) })),
    async (c) => c.json(await getEvents(c.env, c.get("actor"), c.req.valid("query").after)),
  )
  .get("/live", async (c) => {
    const actor = c.get("actor");
    return c.env.TABLECAST_EVENTS.get(c.env.TABLECAST_EVENTS.idFromName(actor.storeId)).fetch(
      c.req.raw,
    );
  })
  .post(
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
  )
  .get("/devices", async (c) => {
    const actor = await staffActor(c, c.get("actor").storeId, true);
    const devices = await c.env.TABLECAST_DB.prepare(
      "SELECT d.id,d.table_id AS tableId,t.name AS tableName,d.created_at AS createdAt,d.revoked_at AS revokedAt,u.name AS approvedByName,u.email AS approvedByEmail,u.image AS approvedByImage FROM devices d JOIN restaurant_tables t ON t.id=d.table_id AND t.store_id=d.store_id JOIN user u ON u.id=d.approved_by WHERE d.store_id=? ORDER BY d.created_at DESC",
    )
      .bind(actor.storeId)
      .all<{
        id: string;
        tableId: string;
        tableName: string;
        createdAt: number;
        revokedAt: number | null;
        approvedByName: string;
        approvedByEmail: string;
        approvedByImage: string | null;
      }>();
    const tables = await c.env.TABLECAST_DB.prepare(
      "SELECT id,name FROM restaurant_tables WHERE store_id=? ORDER BY name",
    )
      .bind(actor.storeId)
      .all<{ id: string; name: string }>();
    return c.json({ devices: devices.results, tables: tables.results });
  })
  .post("/devices/:id/revoke", async (c) => {
    const actor = await staffActor(c, c.get("actor").storeId, true);
    await c.env.TABLECAST_DB.prepare("UPDATE devices SET revoked_at=? WHERE id=? AND store_id=?")
      .bind(Date.now(), c.req.param("id"), actor.storeId)
      .run();
    return c.json({ revoked: true });
  })
  .get("/drafts", async (c) => c.json(await listDrafts(c.env, c.get("actor"))))
  .post("/drafts", async (c) => c.json(await createDraft(c.env, c.get("actor"))))
  .get("/drafts/:id", async (c) => c.json(await getDraft(c.env, c.get("actor"), c.req.param("id"))))
  .put(
    "/drafts/:id",
    validate(
      z.object({ expectedVersion: z.number().int(), configuration: configurationSchema }).strict(),
    ),
    async (c) =>
      c.json(await updateDraft(c.env, c.get("actor"), c.req.param("id"), c.req.valid("json"))),
  )
  .post("/drafts/:id/validate", validate(versionSchema), async (c) =>
    c.json(
      await validateDraft(
        c.env,
        c.get("actor"),
        c.req.param("id"),
        c.req.valid("json").expectedVersion,
      ),
    ),
  )
  .post("/drafts/:id/discard", validate(versionSchema), async (c) =>
    c.json(
      await discardDraft(
        c.env,
        c.get("actor"),
        c.req.param("id"),
        c.req.valid("json").expectedVersion,
      ),
    ),
  )
  .post(
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
const routes = tableRoutes.route("/api/admin/stores/:storeId", admin).get("/media/*", async (c) => {
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
export type AppType = typeof routes;
export default routes;
