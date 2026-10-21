import { z } from "zod";
import type { Locale } from "../../platform/model";
import type { Plan } from "../catalog/model";
import type { Bill, Cart, Order, Snapshot } from "../orders/model";
import { decimalQuerySchema, id, localeSchema, pageLimitSchema } from "../../platform/model";
import { planSchema } from "../catalog/model";
import { billSchema, cartSchema, orderSchema, snapshotSchema } from "../orders/model";
import { speechSpeedSchema } from "../voice/model";
export const uiSectionSchema = z.enum(["menu", "cart", "orders", "bill"]);

export type UiSection = z.infer<typeof uiSectionSchema>;

export const uiSectionInputSchema = z
  .object({ section: uiSectionSchema, productId: id.nullish() })
  .strict();

export type UiSectionInput = z.infer<typeof uiSectionInputSchema>;

export type TableEvent = {
  createdAt: number;
  cursor: number;
  data: Record<string, unknown>;
  kind: string;
  storeId: string;
  tableSessionId: null | string;
};

export type TableState = {
  bill: Bill;
  billRequested: boolean;
  cart: Cart;
  configVersion: number;
  cursor: number;
  events: TableEvent[];
  guestCount: number;
  id: string;
  kind: "demo" | "table";
  locale: Locale;
  openedAt: number;
  orders: Order[];
  plan: null | { id: string; rules: Plan; startedAt: number };
  selectedProductId: null | string;
  snapshot: null | Snapshot;
  speechSpeed: number;
  staffCalled: boolean;
  status: "closed" | "open";
  storeId: string;
  storeName: string;
  tableId: null | string;
  tableName: string;
  uiSection: UiSection;
  voiceSessionId: null | string;
  voiceState: "active" | "error" | "stopped";
};

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

export const tableEventSchema: z.ZodType<TableEvent> = z.object({
  cursor: z.number().int(),
  storeId: z.string(),
  tableSessionId: z.string().nullable(),
  kind: z.string(),
  data: eventDataSchema,
  createdAt: z.number(),
});

export const closedSessionSummarySchema = z.object({
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

export const tableStateSchema: z.ZodType<TableState> = z.object({
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
  speechSpeed: speechSpeedSchema,
  guestCount: z.number().int(),
  openedAt: z.number().int(),
  cart: cartSchema,
  orders: z.array(orderSchema),
  bill: billSchema,
  billRequested: z.boolean(),
  events: z.array(tableEventSchema),
  cursor: z.number().int(),
  plan: tablePlanSchema.nullable(),
  staffCalled: z.boolean(),
  snapshot: snapshotSchema.nullable(),
});

export const eventsSchema = z.object({
  events: z.array(tableEventSchema),
  cursor: z.number().int(),
});
