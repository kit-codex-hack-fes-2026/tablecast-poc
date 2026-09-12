import { z } from "zod";
export const localeSchema = z.enum(["ja", "en"]);

export type Locale = z.infer<typeof localeSchema>;

export const id = z.string().min(1).max(100);

export const money = z.number().int().min(0).max(10_000_000);

export const decimalQuerySchema = z.string().regex(/^\d+$/).transform(Number);

export const pageLimitSchema = decimalQuerySchema.pipe(z.number().int().min(1).max(100));

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string().optional(),
    details: z.unknown().optional(),
  }),
  traceId: z.string().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const validationIssuesSchema = z.array(
  z.object({
    path: z.array(z.union([z.string(), z.number()])),
    code: z.string(),
    messages: z.object({ ja: z.string(), en: z.string() }),
  }),
);
