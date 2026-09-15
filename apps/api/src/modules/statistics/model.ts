import { z } from "zod";
import { decimalQuerySchema, localeSchema } from "../../platform/model";

export const statisticsQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    timeZone: z
      .string()
      .max(100)
      .default("Asia/Tokyo")
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions();
          return true;
        } catch {
          return false;
        }
      }),
    view: z.enum(["summary", "products", "modifiers"]).default("summary"),
    locale: localeSchema.default("ja"),
    limit: z
      .union([z.number(), decimalQuerySchema])
      .pipe(z.number().int().min(1).max(100))
      .default(30),
    cursor: z.string().max(3000).optional(),
  })
  .strict()
  .refine((value) => Date.parse(value.from) < Date.parse(value.to), { path: ["to"] });
export type StatisticsQuery = z.infer<typeof statisticsQuerySchema>;

export const statisticsCursorSchema = z.object({
  storeId: z.string(),
  from: z.string(),
  to: z.string(),
  timeZone: z.string(),
  view: z.enum(["products", "modifiers"]),
  locale: localeSchema,
  asOf: z.number().int().nonnegative(),
  productId: z.string(),
  optionId: z.string(),
});

const count = z.number().int().nonnegative();
export const statisticsSummarySchema = z.object({
  sessions: count,
  guests: count,
  planSessions: count,
  orders: count,
  excludedOrders: count,
  incompleteSnapshots: count,
  orderedAmount: z.number().int(),
  paidAmount: z.number().int(),
  planSessionPaidAmount: z.number().int(),
  positivePayments: count,
  negativePayments: z.number().int().nonpositive(),
  adjustments: z.number().int(),
  staffCalls: count,
  billCalls: count,
});
export const statisticsRowSchema = z.object({
  productId: z.string(),
  optionId: z.string().nullable(),
  name: z.string().nullable(),
  quantity: count,
  orderingSessions: count,
  orderRate: z.number().min(0).max(1).nullable(),
  planCoveredQuantity: count,
});
export const statisticsResultSchema = z.object({
  storeId: z.string(),
  from: z.string(),
  to: z.string(),
  timeZone: z.string(),
  view: z.enum(["summary", "products", "modifiers"]),
  locale: localeSchema,
  currency: z.literal("JPY"),
  asOf: z.number().int(),
  generatedAt: z.number().int(),
  basis: z.literal("closed_sessions"),
  summary: statisticsSummarySchema,
  rows: z.array(statisticsRowSchema).max(100),
  nextCursor: z.string().nullable(),
  definitions: z.record(z.string(), z.string()),
  limitations: z.array(z.string()),
});
export type StatisticsResult = z.infer<typeof statisticsResultSchema>;
