import { z } from "zod";

export const performancePageSchema = z.enum([
  "kiosk",
  "login",
  "account",
  "admin-live",
  "floor",
  "products",
  "admin-other",
  "other",
]);
export const performanceMetricSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_-]+$/),
    name: z.enum([
      "LCP",
      "INP",
      "CLS",
      "FCP",
      "TTFB",
      "page-ready",
      "cart-api",
      "cart-visible",
      "order-api",
      "order-visible",
    ]),
    value: z.number().finite().nonnegative().max(86_400_000),
    page: performancePageSchema,
    device: z.enum(["phone", "tablet", "desktop"]),
    visit: z.enum(["first", "return", "unknown"]),
    navigation: z.enum([
      "navigate",
      "reload",
      "back-forward",
      "back-forward-cache",
      "prerender",
      "restore",
      "soft-navigation",
      "unknown",
    ]),
    release: z.string().regex(/^(?:[a-f0-9]{7,40}|tablecast-e2e|local|unknown)$/),
    documentTraceId: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
    apiRequestId: z.uuid().optional(),
    outcome: z.enum(["success", "error"]).default("success"),
  })
  .strict();
export const performanceBatchSchema = z
  .object({ metrics: z.array(performanceMetricSchema).min(1).max(20) })
  .strict();
export type PerformanceMetric = z.infer<typeof performanceMetricSchema>;
