import type { z } from "zod";
import { and, eq, notExists, or, sql } from "drizzle-orm";
import type { TableRecord } from "../../../db/records";
import type { ApiServices } from "../../../platform/context";
import type { Locale } from "../../../platform/model";
import type { Actor } from "../../auth/model";
import type { Catalog } from "../../configuration/model";
import * as business from "../../../db/business-schema";
import { ensure } from "../../../platform/errors";
import { observeOperation, recordD1Update } from "../../../platform/telemetry";
import { getCatalog, sessionConfigVersion } from "../../catalog/queries";
import { showProductsSchema } from "../../voice/model";
import { getCoreState } from "../core-queries";
import {
  type CoreState,
  type StaffCallInput,
  type StateView,
  type TableState,
  uiSectionInputSchema,
} from "../model";
import {
  eventStatement,
  interruptVoiceTurns,
  invalidationStatement,
  notifyStore,
  voiceCondition,
} from "../mutations";
import { getSession, getTableState } from "../queries";
import { withStateRead } from "../state-read";
import { markStaffCallResolved, requestStaffCall } from "./assistance";

export function setUiSection(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof uiSectionInputSchema>,
  view: "core",
  known?: { catalog: Catalog; session?: TableRecord },
): Promise<CoreState>;
export function setUiSection(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof uiSectionInputSchema>,
  view?: "full",
  known?: { catalog: Catalog; session?: TableRecord },
): Promise<TableState>;
export function setUiSection(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof uiSectionInputSchema>,
  view: StateView,
  known?: { catalog: Catalog; session?: TableRecord },
): Promise<CoreState | TableState>;
export async function setUiSection(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof uiSectionInputSchema>,
  view: StateView = "full",
  known?: { catalog: Catalog; session?: TableRecord },
): Promise<CoreState | TableState> {
  const db = services.db;

  const parsed = uiSectionInputSchema.safeParse(input);
  ensure(parsed.success, "INVALID_INPUT", 422);
  const session = known?.session ?? (await getSession(services, actor));
  ensure(session.status === "open", "SESSION_CLOSED");
  const productId = parsed.data.section === "menu" ? (parsed.data.productId ?? null) : null;
  const search = parsed.data.search;
  ensure(search == null || parsed.data.section === "menu", "INVALID_INPUT", 422);
  const catalog =
    productId || search
      ? (known?.catalog ?? (await getCatalog(services, actor.storeId, actor.demoId)))
      : null;
  ensure(
    !productId || catalog?.configuration.products.some((product) => product.id === productId),
    "PRODUCT_NOT_FOUND",
    422,
  );
  const mutation = crypto.randomUUID();
  const gate = voiceCondition(actor);
  return withStateRead(services, actor, view, async (queries, decode) => {
    const [updated, event, ...state] = await db.batch([
      db
        .update(business.tableSessions)
        .set({
          ui_section: parsed.data.section,
          selected_product_id: productId,
          ...(search !== undefined
            ? {
                menu_search_json:
                  search === null
                    ? null
                    : JSON.stringify({
                        ...search,
                        offset: search.offset ?? 0,
                        configVersion: catalog?.version,
                      }),
              }
            : {}),
          mutation_id: mutation,
        })
        .where(
          sql`id=${session.id} AND store_id=${actor.storeId} AND status='open'${gate} AND (${catalog?.version ?? null} IS NULL OR ${sessionConfigVersion(actor.storeId, actor.tableSessionId)}=${catalog?.version ?? null})`,
        ),
      eventStatement(services, actor, mutation, "table.ui", {
        section: parsed.data.section,
        productId,
        ...(search !== undefined
          ? { search: search === null ? null : { ...search, offset: search.offset ?? 0 } }
          : {}),
      }),
      ...queries,
    ] as const);
    ensure(updated.meta.changes === 1, "TABLE_CONFLICT");
    recordD1Update(updated.meta);
    await notifyStore(services, actor.storeId, actor.tableSessionId, {
      cursor: event.meta.last_row_id,
      demoId: session.kind === "demo" ? session.id : undefined,
    });
    return decode(state);
  });
}

export async function showProducts(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof showProductsSchema>,
  knownCatalog?: Catalog,
) {
  const db = services.db;

  ensure(actor.kind === "voice" && actor.turnId && actor.voiceSessionId, "VOICE_REQUIRED", 403);
  const parsed = showProductsSchema.safeParse(input);
  ensure(parsed.success, "INVALID_INPUT", 422);
  if (!knownCatalog) await getSession(services, actor);
  const catalog = knownCatalog ?? (await getCatalog(services, actor.storeId, actor.demoId));
  const productIds = [...new Set(parsed.data.productIds)];
  ensure(
    productIds.every((id) => catalog.configuration.products.some((product) => product.id === id)),
    "PRODUCT_NOT_FOUND",
    422,
  );
  const gate = voiceCondition(actor);
  const result = await db
    .insert(business.tableEvents)
    .select(
      sql`SELECT NULL,store_id,id,'voice.products',${JSON.stringify({ turnId: actor.turnId, productIds })},${Date.now()} FROM table_sessions WHERE id=${actor.tableSessionId} AND store_id=${actor.storeId} AND status='open'${gate} AND ${sessionConfigVersion(actor.storeId, actor.tableSessionId)}=${catalog.version}`,
    );
  ensure(result.meta.changes === 1, "TABLE_CONFLICT");
  await notifyStore(services, actor.storeId, actor.tableSessionId, {
    cursor: result.meta.last_row_id,
    demoId: actor.demoId,
  });
  return { productIds };
}

async function requestStaffAssistance(
  services: ApiServices,
  actor: Actor,
  kind: "bill.requested" | "staff.called",
  view: StateView,
) {
  return observeOperation(
    kind === "staff.called" ? "tablecast.staff.call" : "tablecast.bill.request",
    async () => {
      const db = services.db;

      const row = await getSession(services, actor);
      const mutation = crypto.randomUUID();
      const gate = voiceCondition(actor);
      return withStateRead(services, actor, view, async (queries, decode) => {
        const [updated, event, ...state] = await db.batch([
          db
            .update(business.tableSessions)
            .set({ staff_called: 1, mutation_id: mutation })
            .where(
              and(
                eq(business.tableSessions.id, row.id),
                eq(business.tableSessions.store_id, actor.storeId),
                eq(business.tableSessions.status, "open"),
                sql`1=1${gate}`,
                kind === "bill.requested"
                  ? or(
                      eq(business.tableSessions.staff_called, 0),
                      notExists(
                        db
                          .select({ cursor: business.tableEvents.cursor })
                          .from(business.tableEvents)
                          .where(
                            and(
                              eq(business.tableEvents.store_id, actor.storeId),
                              eq(business.tableEvents.table_session_id, row.id),
                              eq(business.tableEvents.kind, "bill.requested"),
                            ),
                          ),
                      ),
                    )
                  : undefined,
              ),
            ),
          eventStatement(
            services,
            actor,
            mutation,
            kind,
            kind === "staff.called" ? { source: actor.kind } : {},
          ),
          ...queries,
        ] as const);
        const decoded = await decode(state);
        if (!updated.meta.changes) await getSession(services, actor);
        ensure(
          updated.meta.changes === 1 ||
            (kind === "bill.requested" && decoded.billRequested && decoded.staffCalled),
          "SESSION_STALE",
        );
        recordD1Update(updated.meta);
        if (updated.meta.changes)
          await notifyStore(services, actor.storeId, actor.tableSessionId, {
            cursor: event.meta.last_row_id,
            demoId: row.kind === "demo" ? row.id : undefined,
          });
        return decoded;
      });
    },
    { env: services.env, input: { actor } },
  );
}

export function callStaff(
  services: ApiServices,
  actor: Actor,
  view: "core",
  input?: StaffCallInput,
): Promise<CoreState>;
export function callStaff(
  services: ApiServices,
  actor: Actor,
  view?: "full",
  input?: StaffCallInput,
): Promise<TableState>;
export function callStaff(
  services: ApiServices,
  actor: Actor,
  view: StateView,
  input?: StaffCallInput,
): Promise<CoreState | TableState>;
export function callStaff(
  services: ApiServices,
  actor: Actor,
  view: StateView = "full",
  input?: StaffCallInput,
) {
  return requestStaffCall(services, actor, view, input);
}

export function changeLocale(
  services: ApiServices,
  actor: Actor,
  locale: Locale,
  view: "core",
): Promise<CoreState>;
export function changeLocale(
  services: ApiServices,
  actor: Actor,
  locale: Locale,
  view?: "full",
): Promise<TableState>;
export function changeLocale(
  services: ApiServices,
  actor: Actor,
  locale: Locale,
  view: StateView,
): Promise<CoreState | TableState>;
export async function changeLocale(
  services: ApiServices,
  actor: Actor,
  locale: Locale,
  view: StateView = "full",
) {
  const db = services.db;

  const row = await getSession(services, actor);
  if (row.locale === locale) {
    if (row.voice_session_id)
      await (
        await import("../../voice/runtime")
      ).updateVoiceLanguage(services, actor, row.voice_session_id);
    return view === "core" ? getCoreState(services, actor) : getTableState(services, actor);
  }
  const catalog = await getCatalog(services, actor.storeId, actor.demoId);
  ensure(catalog.configuration.languages.includes(locale), "LANGUAGE_NOT_ENABLED", 422);
  const mutation = crypto.randomUUID();
  const gate = voiceCondition(actor);
  const readActor: Actor = {
    ...actor,
    kind: actor.demoId ? "staff" : "device",
    userId: actor.userId,
    voiceSessionId: undefined,
    turnId: undefined,
    storeId: actor.storeId,
    tableSessionId: row.id,
  };
  return withStateRead(services, readActor, view, async (queries, decode) => {
    const [updated, , , , event, toolEvent, ...state] = await db.batch([
      db
        .update(business.tableSessions)
        .set({
          locale: locale,
          active_turn_id: null,
          voice_version: sql`voice_version+1`,
          mutation_id: mutation,
        })
        .where(
          sql`id=${row.id} AND store_id=${actor.storeId} AND status='open' AND voice_version=${row.voice_version}${gate}`,
        ),
      invalidationStatement(services, actor, mutation),
      ...interruptVoiceTurns(services, actor, mutation, true),
      eventStatement(services, actor, mutation, "locale.changed", { locale }),
      // 言語変更で旧turnを無効化するため、このツールの完了も同じbatchへ含める。
      db.insert(business.tableEvents)
        .select(sql`SELECT NULL,store_id,table_session_id,'voice.tool',json_set(data_json,'$.state','completed'),${Date.now()}
       FROM table_events WHERE store_id=${actor.storeId} AND table_session_id=${row.id} AND kind='voice.tool'
       AND json_extract(data_json,'$.turnId')=${actor.kind === "voice" ? (actor.turnId ?? null) : null} AND json_extract(data_json,'$.toolName')='setLanguage'
       AND json_extract(data_json,'$.state')='running'
       AND EXISTS(SELECT 1 FROM table_sessions WHERE id=${row.id} AND mutation_id=${mutation})`),
      ...queries,
    ] as const);
    ensure(updated.meta.changes === 1, "SESSION_STALE");
    recordD1Update(updated.meta);
    await notifyStore(services, actor.storeId, actor.tableSessionId, {
      cursor: Math.max(event.meta.last_row_id, toolEvent.meta.last_row_id),
      demoId: row.kind === "demo" ? row.id : undefined,
    });
    if (row.voice_session_id)
      await (
        await import("../../voice/runtime")
      ).updateVoiceLanguage(services, actor, row.voice_session_id);
    return decode(state);
  });
}

export function requestBill(services: ApiServices, actor: Actor, view: "core"): Promise<CoreState>;
export function requestBill(
  services: ApiServices,
  actor: Actor,
  view?: "full",
): Promise<TableState>;
export function requestBill(
  services: ApiServices,
  actor: Actor,
  view: StateView,
): Promise<CoreState | TableState>;
export function requestBill(services: ApiServices, actor: Actor, view: StateView = "full") {
  return requestStaffAssistance(services, actor, "bill.requested", view);
}

export async function resolveCall(services: ApiServices, actor: Actor, callId?: string) {
  await markStaffCallResolved(services, actor, callId);
  return getTableState(services, actor);
}
