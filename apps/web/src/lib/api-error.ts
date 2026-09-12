import { DetailedError } from "@tablecast/api/client";
import { apiErrorSchema } from "@tablecast/api/schema";
import { z } from "zod";

const responseDetailSchema = z.object({ data: apiErrorSchema.optional() });

// Honoの例外は本文・statusがanyのため、公開schemaを通してから参照する。
export function apiError(error: unknown) {
  if (!(error instanceof DetailedError)) return undefined;
  const status: unknown = error.statusCode;
  const detail: unknown = error.detail;
  const parsed = responseDetailSchema.safeParse(detail);
  return {
    status: typeof status === "number" ? status : undefined,
    code: parsed.success ? parsed.data.data?.error.code : undefined,
    details: parsed.success ? parsed.data.data?.error.details : undefined,
    requestId: parsed.success ? parsed.data.data?.traceId : undefined,
  };
}
