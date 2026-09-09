import { z } from "zod";
export const localeSchema = z.enum(["ja", "en"]);

export type Locale = z.infer<typeof localeSchema>;

export const id = z.string().min(1).max(100);

export const money = z.number().int().min(0).max(10_000_000);

export const decimalQuerySchema = z.string().regex(/^\d+$/).transform(Number);

export const pageLimitSchema = decimalQuerySchema.pipe(z.number().int().min(1).max(100));

export type ApiError = {
  error: { code: string; message: string; details?: unknown };
  traceId?: string;
};
