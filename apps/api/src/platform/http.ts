import { trace, SpanStatusCode } from "@opentelemetry/api";
import { matchedRoutes } from "hono/route";
import { requestLog } from "./telemetry";
import { APIError } from "better-auth/api";
import type { ErrorHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { DomainError, ensure } from "../platform/errors";
import type { ApiEnv } from "./context";
export const requestTelemetry = createMiddleware<ApiEnv>(async (c, next) => {
  const started = performance.now();
  const traceId = crypto.randomUUID();
  c.set("traceId", traceId);
  c.header("X-Request-Id", traceId);
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  try {
    await next();
  } finally {
    const route =
      matchedRoutes(c).findLast((matched) => matched.method !== "ALL")?.path ?? "unmatched";
    const span = trace.getActiveSpan();
    const status = c.error && c.res.status < 400 ? 500 : c.res.status;
    const attributes = {
      "http.request.method": c.req.method,
      "http.route": route,
      "http.response.status_code": status,
      "tablecast.request.id": traceId,
      "tablecast.duration_ms": Math.round((performance.now() - started) * 100) / 100,
      ...(c.error instanceof DomainError ? { "tablecast.error.code": c.error.code } : {}),
    };
    span?.setAttributes(attributes);
    if (status >= 500) span?.setStatus({ code: SpanStatusCode.ERROR });
    requestLog(attributes, status >= 500);
  }
});
export const requestSecurity = createMiddleware<ApiEnv>(async (c, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
    !c.req.path.startsWith("/internal/voice/") &&
    c.req.path !== "/mcp"
  ) {
    const origin = c.req.header("Origin");
    ensure(!origin || origin === c.env.TABLECAST_PUBLIC_ORIGIN, "ORIGIN_FORBIDDEN", 403);
    const site = c.req.header("Sec-Fetch-Site");
    ensure(site !== "cross-site", "ORIGIN_FORBIDDEN", 403);
  }
  await next();
});
export const handleError: ErrorHandler<ApiEnv> = (error, c) => {
  if (error instanceof DomainError)
    return c.json(
      {
        error: { code: error.code, message: error.message, details: error.details },
        traceId: c.get("traceId"),
      },
      error.status,
    );
  if (error instanceof APIError)
    return new Response(JSON.stringify(error.body), {
      status: error.statusCode,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "INTERNAL_ERROR" }, traceId: c.get("traceId") },
    500,
  );
};
