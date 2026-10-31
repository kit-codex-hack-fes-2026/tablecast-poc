import { z } from "zod";
import { decimalQuerySchema, id, localeSchema, pageLimitSchema } from "../../platform/model";
import { planSchema } from "../catalog/model";
import { maxConfigurationProducts } from "../configuration/model";
import { billSchema, cartSchema, orderSchema, snapshotSchema } from "../orders/model";
import { speechSpeedSchema } from "../voice/model";
const uiSectionSchema = z.enum(["menu", "cart", "orders", "bill"]);

export type UiSection = z.infer<typeof uiSectionSchema>;

const menuSearchQuerySchema = z.string().max(100).trim();

export const menuSearchInputSchema = z
  .object({
    query: menuSearchQuerySchema.min(1),
    offset: z.number().int().min(0).max(maxConfigurationProducts).optional(),
  })
  .strict();
export const savedMenuSearchSchema = menuSearchInputSchema.extend({
  // 旧版の空検索は読取時に通常一覧として扱う。
  query: menuSearchQuerySchema,
  offset: z.number().int().nonnegative(),
  configVersion: z.number().int().positive(),
});
const menuSearchStateSchema = menuSearchInputSchema.extend({
  offset: z.number().int().nonnegative(),
  productIds: z.array(id).max(8),
  total: z.number().int().nonnegative(),
  more: z.boolean(),
});

export const uiSectionInputSchema = z
  .object({
    section: uiSectionSchema,
    productId: id.nullish(),
    search: menuSearchInputSchema.nullable().optional(),
  })
  .strict();

export type UiSectionInput = z.infer<typeof uiSectionInputSchema>;

export type TableEvent = z.infer<typeof tableEventSchema>;

export type TableState = z.infer<typeof tableStateSchema>;
export type CoreState = z.infer<typeof coreStateSchema>;
export const stateViewSchema = z.object({ view: z.enum(["full", "core"]).default("full") });
export type StateView = z.infer<typeof stateViewSchema>["view"];

export const historyQuerySchema = z
  .object({
    beforeClosedAt: decimalQuerySchema
      .pipe(z.number().int().nonnegative().max(8_640_000_000_000_000))
      .optional(),
    beforeId: id.refine((value) => value.trim().length > 0).optional(),
    limit: pageLimitSchema.default(30),
  })
  .strict()
  .refine((query) => (query.beforeClosedAt === undefined) === (query.beforeId === undefined), {
    path: ["beforeId"],
  });

export const sessionEventsQuerySchema = z
  .object({
    before: decimalQuerySchema.pipe(z.number().int().positive()).optional(),
    limit: pageLimitSchema.default(100),
  })
  .strict();

export type HistoryQuery = z.infer<typeof historyQuerySchema>;

// 現行PoCの店舗日は日英とも日本時間。端末のタイムゾーンとは独立する。
export const storeTimeZone = "Asia/Tokyo";
export const storeDateSchema = z.iso.date();
export const timelineQuerySchema = z
  .object({
    date: storeDateSchema,
    beforeOpenedAt: z
      .string()
      .regex(/^-?\d+$/)
      .transform(Number)
      .pipe(z.number().int())
      .optional(),
    beforeId: id.refine((value) => value.trim().length > 0).optional(),
    limit: decimalQuerySchema.pipe(z.number().int().min(1).max(200)).default(100),
  })
  .strict()
  .refine((query) => (query.beforeOpenedAt === undefined) === (query.beforeId === undefined), {
    path: ["beforeId"],
  });

export const timelineSessionSchema = z
  .object({
    id,
    tableId: id,
    guestCount: z.number().int().positive(),
    status: z.enum(["open", "closed"]),
    openedAt: z.number().int(),
    closedAt: z.number().int().nullable(),
  })
  .refine((session) =>
    session.status === "open"
      ? session.closedAt === null
      : session.closedAt !== null && session.closedAt >= session.openedAt,
  );

export const timelinePageSchema = z.object({
  date: storeDateSchema,
  timeZone: z.literal(storeTimeZone),
  startAt: z.number().int(),
  endAt: z.number().int(),
  observedAt: z.number().int(),
  sessions: z.array(timelineSessionSchema),
  nextCursor: z.object({ openedAt: z.number().int(), id }).nullable(),
});
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;
export type TimelinePage = z.infer<typeof timelinePageSchema>;
export type TimelineSession = z.infer<typeof timelineSessionSchema>;

export type SessionEventsQuery = z.infer<typeof sessionEventsQuerySchema>;

export const tablePlanSchema = z.object({
  id: z.string(),
  startedAt: z.number(),
  rules: planSchema,
});

export const eventDataSchema = z.record(z.string(), z.unknown());

export const tableEventSchema = z.object({
  cursor: z.number().int(),
  storeId: z.string(),
  tableSessionId: z.string().nullable(),
  kind: z.string(),
  data: eventDataSchema,
  createdAt: z.number(),
});

const closedSessionSummarySchema = z.object({
  id: z.string(),
  tableId: z.string(),
  tableName: z.string(),
  locale: localeSchema,
  guestCount: z.number().int().positive(),
  openedAt: z.number().int(),
  closedAt: z.number().int(),
  bill: billSchema,
});

export const historyPageSchema = z.object({
  sessions: z.array(closedSessionSummarySchema),
  nextCursor: z.object({ closedAt: z.number().int(), id: z.string() }).nullable(),
});

export const sessionEventsPageSchema = z.object({
  events: z.array(tableEventSchema),
  nextBefore: z.number().int().positive().nullable(),
});

export type ClosedSessionSummary = z.infer<typeof closedSessionSummarySchema>;

export type HistoryPage = z.infer<typeof historyPageSchema>;

export type SessionEventsPage = z.infer<typeof sessionEventsPageSchema>;

export const staffHandoffSchema = z
  .object({
    summaryJa: z
      .string()
      .trim()
      .min(1)
      .max(1500)
      .default("用件未確認。お客様が店員の直接呼び出しを希望しています。"),
    originalText: z.string().max(10000).default(""),
    locale: localeSchema.default("ja"),
    attempted: z.array(z.string().max(300)).max(10).default([]),
    unresolved: z.string().max(1000).default(""),
  })
  .strict();
export const staffCallInputSchema = staffHandoffSchema
  .extend({
    locale: localeSchema.optional(),
    idempotencyKey: z.string().min(8).max(100).optional(),
  })
  .strict();
export type StaffCallInput = z.input<typeof staffCallInputSchema>;
export const staffCallSchema = z.object({
  id,
  status: z.enum(["pending", "resolved"]),
  handoff: staffHandoffSchema,
  createdAt: z.number().int(),
  resolvedAt: z.number().int().nullable(),
});
export type StaffCall = z.infer<typeof staffCallSchema>;
export const staffCallPageQuerySchema = z
  .object({
    beforeCreatedAt: decimalQuerySchema.pipe(z.number().int().nonnegative()).optional(),
    beforeId: id.optional(),
    limit: decimalQuerySchema.pipe(z.number().int().min(1).max(50)).default(20),
  })
  .strict()
  .refine((value) => (value.beforeId === undefined) === (value.beforeCreatedAt === undefined));
export const staffCallPageSchema = z.object({
  calls: z.array(staffCallSchema),
  nextCursor: z.object({ createdAt: z.number().int(), id }).nullable(),
});
export type StaffCallPage = z.infer<typeof staffCallPageSchema>;
export const serviceGuidanceQuerySchema = z
  .object({
    query: z.string().max(100).optional(),
    guideId: id.optional(),
    offset: decimalQuerySchema.pipe(z.number().int().nonnegative()).optional(),
  })
  .strict();

export const tableStateSchema = z.object({
  id: z.string(),
  tableId: z.string().nullable(),
  kind: z.enum(["table", "demo"]),
  tableName: z.string(),
  storeId: z.string(),
  storeName: z.string(),
  configVersion: z.number().int().positive(),
  locale: localeSchema,
  status: z.enum(["open", "closed"]),
  voiceState: z.enum(["stopped", "active", "error"]),
  voiceSessionId: z.string().nullable(),
  uiSection: uiSectionSchema,
  selectedProductId: id.nullable(),
  menuSearch: menuSearchStateSchema.nullable().default(null),
  speechSpeed: speechSpeedSchema,
  guestCount: z.number().int(),
  openedAt: z.number().int(),
  cart: cartSchema,
  orders: z.array(orderSchema),
  orderSummary: z.object({
    quantity: z.number().int().nonnegative(),
    productIds: z.array(z.string()).max(3),
  }),
  bill: billSchema,
  billRequested: z.boolean(),
  events: z.array(tableEventSchema),
  cursor: z.number().int(),
  plan: tablePlanSchema.nullable(),
  staffCalled: z.boolean(),
  staffCall: staffCallSchema.nullable().optional(),
  snapshot: snapshotSchema.nullable(),
});

export const coreStateSchema = tableStateSchema.omit({ orders: true, events: true });
export const orderPageQuerySchema = z
  .object({
    beforeCreatedAt: decimalQuerySchema.pipe(z.number().int().nonnegative()).optional(),
    beforeId: id.optional(),
    limit: pageLimitSchema.default(50),
  })
  .strict()
  .refine((query) => (query.beforeCreatedAt === undefined) === (query.beforeId === undefined), {
    path: ["beforeId"],
  });
export const orderPageSchema = z.object({
  orders: z.array(orderSchema),
  nextCursor: z.object({ createdAt: z.number().int(), id }).nullable(),
  cursor: z.number().int(),
});
export type OrderPage = z.infer<typeof orderPageSchema>;
export type OrderPageQuery = z.infer<typeof orderPageQuerySchema>;
export const submittedCoreOrderSchema = z.object({ order: orderSchema, state: coreStateSchema });

export const eventsSchema = z.object({
  events: z.array(tableEventSchema),
  cursor: z.number().int(),
});

export const openTableSchema = z
  .object({
    tableId: z.string(),
    guestCount: z.number().int().min(1).max(30),
    locale: localeSchema,
    planId: z.string().optional(),
  })
  .strict();
