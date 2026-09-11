import { z } from "zod";
import type { Locale } from "../../platform/model";
import { decimalQuerySchema, id, localeSchema, pageLimitSchema } from "../../platform/model";
import type { Plan } from "../catalog/model";
import { planSchema } from "../catalog/model";
import type { Bill, Cart, Order, Snapshot } from "../orders/model";
import { billSchema, cartSchema, orderSchema, snapshotSchema } from "../orders/model";
import { speechSpeedSchema } from "../voice/model";
export const uiSectionSchema = z.enum(["menu", "cart", "orders", "bill"]);

export type UiSection = z.infer<typeof uiSectionSchema>;

export const uiSectionInputSchema = z
  .object({ section: uiSectionSchema, productId: id.nullish() })
  .strict();

export type UiSectionInput = z.infer<typeof uiSectionInputSchema>;

export type TableEvent = {
  cursor: number;
  storeId: string;
  tableSessionId: string | null;
  kind: string;
  data: Record<string, unknown>;
  createdAt: number;
};

export type TableState = {
  id: string;
  tableId: string | null;
  kind: "table" | "demo";
  tableName: string;
  storeId: string;
  storeName: string;
  configVersion: number;
  locale: Locale;
  status: "open" | "closed";
  voiceState: "stopped" | "active" | "error";
  voiceSessionId: string | null;
  uiSection: UiSection;
  selectedProductId: string | null;
  speechSpeed: number;
  guestCount: number;
  openedAt: number;
  cart: Cart;
  orders: Order[];
  bill: Bill;
  billRequested: boolean;
  events: TableEvent[];
  cursor: number;
  plan: { id: string; startedAt: number; rules: Plan } | null;
  staffCalled: boolean;
  snapshot: Snapshot | null;
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
