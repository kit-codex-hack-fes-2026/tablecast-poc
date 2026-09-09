import { z } from "zod";

export const localeSchema = z.enum(["ja", "en"]);
export type Locale = z.infer<typeof localeSchema>;
const id = z.string().min(1).max(100);
export const uiSectionSchema = z.enum(["menu", "cart", "orders", "bill"]);
export type UiSection = z.infer<typeof uiSectionSchema>;
export const uiSectionInputSchema = z
  .object({ section: uiSectionSchema, productId: id.nullish() })
  .strict();
export type UiSectionInput = z.infer<typeof uiSectionInputSchema>;
export const speechSpeedSchema = z.number().min(0.5).max(1.5).multipleOf(0.1);
export const speechSpeedInputSchema = z.object({ speed: speechSpeedSchema }).strict();
export const showProductsSchema = z.object({ productIds: z.array(id).min(1).max(4) }).strict();
export const voiceToolNameSchema = z.enum([
  "getCatalog",
  "getTableState",
  "updateCart",
  "prepareConfirmation",
  "submitOrder",
  "callStaff",
  "setUiSection",
  "setLanguage",
  "setSpeechSpeed",
  "showProducts",
]);
export const voiceToolEventSchema = z.object({
  turnId: id,
  toolCallId: id,
  toolName: voiceToolNameSchema,
  state: z.enum(["running", "completed", "error"]),
  errorCode: z.enum(["VOICE_TOOL_FAILED", "VOICE_CANCELLED"]).optional(),
});
export const voiceProductsEventSchema = showProductsSchema.extend({ turnId: id });
export const voiceFailedEventSchema = z.object({
  turnId: id,
  code: z.enum(["VOICE_MODEL_FAILED", "VOICE_INTERNAL_ERROR"]),
});
const money = z.number().int().min(0).max(10_000_000);
export const contentSchema = z
  .object({
    displayName: z.string().min(1).max(150),
    speechName: z.string().min(1).max(150),
    description: z.string().max(3000),
    aliases: z.array(z.string().max(100)).max(30).default([]),
  })
  .strict();
export const bilingualSchema = z.object({ ja: contentSchema, en: contentSchema }).strict();
export const optionSchema = z
  .object({
    id,
    text: bilingualSchema,
    priceDelta: z.number().int().min(-100000).max(100000),
    available: z.boolean(),
    maxQuantity: z.number().int().min(1).max(20).default(1),
    requires: z.array(id).default([]),
    excludes: z.array(id).default([]),
  })
  .strict();
export const modifierSchema = z
  .object({
    id,
    text: bilingualSchema,
    kind: z.enum(["single", "multiple", "quantity"]),
    min: z.number().int().min(0).max(20),
    max: z.number().int().min(1).max(20),
    options: z.array(optionSchema).min(1).max(30),
  })
  .strict();
export const productSchema = z
  .object({
    id,
    categoryId: id,
    text: bilingualSchema,
    price: money,
    available: z.boolean(),
    tags: z.array(id).default([]),
    imageKey: z.string().max(300).nullable().default(null),
    imageKind: z.enum(["photograph", "illustration"]).default("illustration"),
    modifiers: z.array(modifierSchema).max(12).default([]),
    allergens: z
      .object({
        contains: z.array(z.string()),
        evidence: z.enum(["verified", "unknown"]),
        crossContact: z.enum(["possible", "unknown", "controlled"]),
        vegan: z.enum(["yes", "no", "unknown"]),
        note: z.object({ ja: z.string(), en: z.string() }),
      })
      .strict(),
  })
  .strict();
export const planSchema = z
  .object({
    id,
    text: bilingualSchema,
    pricePerPerson: money,
    durationMinutes: z.number().int().positive().max(1440),
    lastOrderMinutesBeforeEnd: z.number().int().nonnegative(),
    productIds: z.array(id),
    categoryIds: z.array(id),
    tags: z.array(id),
    maxPerOrder: z.number().int().positive().max(100),
    maxTotalPerPerson: z.number().int().positive().max(1000),
    intervalSeconds: z.number().int().nonnegative().max(3600),
    excludedOptionIds: z.array(id),
    includedOptionSurcharge: z.boolean(),
  })
  .strict();
export const configurationSchema = z
  .object({
    categories: z
      .array(z.object({ id, text: bilingualSchema }).strict())
      .min(1)
      .max(100),
    products: z.array(productSchema).min(1).max(2000),
    plans: z.array(planSchema).max(30),
    cast: z
      .object({
        instructions: z.object({ ja: z.string().max(5000), en: z.string().max(5000) }),
        voice: z.object({
          ja: z.string().min(1).max(100).nullable(),
          en: z.string().min(1).max(100).nullable(),
        }),
        proactive: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type Configuration = z.infer<typeof configurationSchema>;
export type Product = z.infer<typeof productSchema>;
export type Modifier = z.infer<typeof modifierSchema>;
export type Plan = z.infer<typeof planSchema>;
export const selectionSchema = z
  .object({ optionId: id, quantity: z.number().int().min(1).max(20) })
  .strict();
export const cartLineSchema = z
  .object({
    id,
    productId: id,
    quantity: z.number().int().min(1).max(20),
    selections: z.array(selectionSchema).max(100),
  })
  .strict();
export const cartUpdateSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    lines: z.array(cartLineSchema).max(100),
  })
  .strict();
export type CartLine = z.infer<typeof cartLineSchema>;
export type CartUpdate = z.infer<typeof cartUpdateSchema>;
export type PricedLine = CartLine & {
  name: Record<Locale, string>;
  speechName: Record<Locale, string>;
  options: {
    id: string;
    name: Record<Locale, string>;
    speechName: Record<Locale, string>;
    quantity: number;
    priceDelta: number;
  }[];
  unitPrice: number;
  total: number;
  missing: string[];
  planCovered: boolean;
};
export type Cart = { version: number; lines: PricedLine[]; total: number; complete: boolean };
export type Snapshot = {
  id: string;
  tableSessionId: string;
  cartVersion: number;
  configVersion: number;
  lines: PricedLine[];
  total: number;
  locale: Locale;
  text: string;
  expiresAt: number;
  channel: "gui" | "voice";
  status: "pending" | "read" | "invalid" | "submitted";
  createdTurnId: string | null;
  plan: { id: string; name: Record<Locale, string> } | null;
};
export type Order = {
  id: string;
  tableSessionId: string;
  snapshotId: string;
  idempotencyKey: string;
  status: "submitted" | "accepted" | "served" | "cancelled" | "rejected";
  snapshot: Snapshot;
  total: number;
  createdAt: number;
};
export type TableEvent = {
  cursor: number;
  storeId: string;
  tableSessionId: string | null;
  kind: string;
  data: Record<string, unknown>;
  createdAt: number;
};
export type Bill = {
  orderedTotal: number;
  adjustmentTotal: number;
  paidTotal: number;
  due: number;
  cartTotal: number;
  planTotal: number;
};
export type TableState = {
  id: string;
  tableId: string;
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
export type Catalog = {
  storeId: string;
  storeName: string;
  version: number;
  configuration: Configuration;
};
export type StoreSummary = { id: string; name: string; role: string; organizationId?: string };
export type AdminState = {
  store: StoreSummary;
  tables: TableState[];
  vacantTables: { id: string; name: string }[];
  events: TableEvent[];
  cursor: number;
};
const configurationIssueBase = z.object({
  path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
});
export const configurationIssueSchema = z.discriminatedUnion("code", [
  configurationIssueBase.extend({
    code: z.literal("DUPLICATE_ID"),
    params: z.object({ id: z.string() }).strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("CATEGORY_NOT_FOUND"),
    params: z.object({ categoryId: z.string() }).strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("MODIFIER_SELECTION_RANGE"),
    params: z
      .object({ min: z.number(), max: z.number(), kind: modifierSchema.shape.kind })
      .strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("MODIFIER_CAPACITY"),
    params: z.object({ max: z.number(), capacity: z.number() }).strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("OPTION_REFERENCE_INVALID"),
    params: z
      .object({
        optionId: z.string(),
        referenceId: z.string(),
        relation: z.enum(["requires", "excludes"]),
      })
      .strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("PLAN_LAST_ORDER_INVALID"),
    params: z
      .object({ durationMinutes: z.number(), lastOrderMinutesBeforeEnd: z.number() })
      .strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("PLAN_TARGET_EMPTY"),
    params: z.object({}).strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("PRODUCT_NOT_FOUND"),
    params: z.object({ productId: z.string() }).strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("OPTION_NOT_FOUND"),
    params: z.object({ optionId: z.string() }).strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("VOICE_NOT_FOUND"),
    params: z.object({ voiceId: z.string() }).strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("VOICE_NOT_STANDARD"),
    params: z.object({ voiceId: z.string() }).strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("VOICE_LANGUAGE_MISMATCH"),
    params: z.object({ voiceId: z.string(), locale: localeSchema, langCode: z.string() }).strict(),
  }),
]);
export type ConfigurationIssue = z.infer<typeof configurationIssueSchema>;
export type ConfigDraft = {
  id: string;
  storeId: string;
  baseVersion: number;
  version: number;
  status: "draft" | "ready" | "published" | "discarded";
  configuration: Configuration;
  errors: ConfigurationIssue[];
  changes: { path: string; before: unknown; after: unknown; sensitive: boolean }[];
};
export type ApiError = {
  error: { code: string; message: string; details?: unknown };
  traceId?: string;
};
export const prepareSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    channel: z.enum(["gui", "voice"]).default("gui"),
  })
  .strict();
export const submitSchema = z
  .object({ snapshotId: id, idempotencyKey: z.string().min(8).max(100), approved: z.literal(true) })
  .strict();
const decimalQuerySchema = z.string().regex(/^\d+$/).transform(Number);
const pageLimitSchema = decimalQuerySchema.pipe(z.number().int().min(1).max(100));
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
export const voiceListQuerySchema = z
  .object({ locale: localeSchema, pageToken: z.string().max(2048).optional() })
  .strict();
export const voiceSummarySchema = z.object({
  voiceId: id,
  displayName: z.string().min(1).max(150),
  langCode: z.string().min(2).max(35),
});
export const voicePageSchema = z.object({
  voices: z.array(voiceSummarySchema).max(50),
  nextPageToken: z.string().max(2048).nullable(),
});
export type VoiceSummary = z.infer<typeof voiceSummarySchema>;
export type VoicePage = z.infer<typeof voicePageSchema>;
export type VoiceListQuery = z.infer<typeof voiceListQuerySchema>;
export const voiceTriggerSchema = z.enum(["user", "proactive"]);
export type VoiceTrigger = z.infer<typeof voiceTriggerSchema>;
export const voiceTurnSchema = z
  .object({
    transport: z.enum(["cascade", "realtime"]).default("cascade"),
    turnId: id,
    voiceSessionId: id,
    locale: localeSchema,
    trigger: voiceTriggerSchema.default("user"),
    messages: z
      .array(
        z.discriminatedUnion("role", [
          z.object({ role: z.literal("user"), content: z.string().max(10000) }).strict(),
          z.object({ role: z.literal("assistant"), content: z.string().max(10000) }).strict(),
        ]),
      )
      .max(100),
    speaker: z
      .object({
        id: z.string().nullable(),
        streamId: z.string().max(100),
        words: z
          .array(
            z
              .object({
                text: z.string().max(500),
                speakerId: z.string().nullable(),
                startTime: z.number().nonnegative().nullable(),
                endTime: z.number().nonnegative().nullable(),
              })
              .strict(),
          )
          .max(2000),
      })
      .strict()
      .optional(),
  })
  .strict();
export const pricedLineSchema: z.ZodType<PricedLine> = cartLineSchema.extend({
  name: z.object({ ja: z.string(), en: z.string() }),
  speechName: z.object({ ja: z.string(), en: z.string() }),
  options: z.array(
    z.object({
      id: z.string(),
      name: z.object({ ja: z.string(), en: z.string() }),
      speechName: z.object({ ja: z.string(), en: z.string() }),
      quantity: z.number().int(),
      priceDelta: z.number().int(),
    }),
  ),
  unitPrice: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  missing: z.array(z.string()),
  planCovered: z.boolean(),
});
export const snapshotSchema: z.ZodType<Snapshot> = z.object({
  id: z.string(),
  tableSessionId: z.string(),
  cartVersion: z.number().int(),
  configVersion: z.number().int(),
  lines: z.array(pricedLineSchema),
  total: z.number().int().nonnegative(),
  locale: localeSchema,
  text: z.string(),
  expiresAt: z.number(),
  channel: z.enum(["gui", "voice"]),
  status: z.enum(["pending", "read", "invalid", "submitted"]),
  createdTurnId: z.string().nullable(),
  plan: z.object({ id: z.string(), name: z.object({ ja: z.string(), en: z.string() }) }).nullable(),
});
export const tablePlanSchema = z.object({
  id: z.string(),
  startedAt: z.number(),
  rules: planSchema,
});
export const eventDataSchema = z.record(z.string(), z.unknown());
export const cartSchema: z.ZodType<Cart> = z.object({
  version: z.number().int(),
  lines: z.array(pricedLineSchema),
  total: z.number().int().nonnegative(),
  complete: z.boolean(),
});
export const orderSchema: z.ZodType<Order> = z.object({
  id: z.string(),
  tableSessionId: z.string(),
  snapshotId: z.string(),
  idempotencyKey: z.string(),
  status: z.enum(["submitted", "accepted", "served", "cancelled", "rejected"]),
  snapshot: snapshotSchema,
  total: z.number().int().nonnegative(),
  createdAt: z.number(),
});
export const tableEventSchema: z.ZodType<TableEvent> = z.object({
  cursor: z.number().int(),
  storeId: z.string(),
  tableSessionId: z.string().nullable(),
  kind: z.string(),
  data: eventDataSchema,
  createdAt: z.number(),
});
export const billSchema: z.ZodType<Bill> = z.object({
  orderedTotal: z.number().int(),
  adjustmentTotal: z.number().int(),
  paidTotal: z.number().int(),
  due: z.number().int(),
  cartTotal: z.number().int(),
  planTotal: z.number().int(),
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
  tableId: z.string(),
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
export const catalogSchema: z.ZodType<Catalog> = z.object({
  storeId: z.string(),
  storeName: z.string(),
  version: z.number().int(),
  configuration: configurationSchema,
});
export const storeSummarySchema: z.ZodType<StoreSummary> = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  organizationId: z.string().optional(),
});
export const adminStateSchema: z.ZodType<AdminState> = z.object({
  store: storeSummarySchema,
  tables: z.array(tableStateSchema),
  vacantTables: z.array(z.object({ id: z.string(), name: z.string() })),
  events: z.array(tableEventSchema),
  cursor: z.number().int(),
});
export const configDraftSchema: z.ZodType<ConfigDraft> = z.object({
  id: z.string(),
  storeId: z.string(),
  baseVersion: z.number().int(),
  version: z.number().int(),
  status: z.enum(["draft", "ready", "published", "discarded"]),
  configuration: configurationSchema,
  errors: z.array(configurationIssueSchema),
  changes: z.array(
    z.object({ path: z.string(), before: z.unknown(), after: z.unknown(), sensitive: z.boolean() }),
  ),
});
