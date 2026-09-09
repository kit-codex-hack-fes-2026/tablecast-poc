import { APIError } from "better-auth/api";
import type { ErrorHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { DomainError, ensure } from "../platform/errors";
import type { ApiEnv } from "./context";
export const requestSecurity = createMiddleware<ApiEnv>(async (c, next) => {
  const traceId = crypto.randomUUID();
  c.set("traceId", traceId);
  c.header("X-Request-Id", traceId);
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
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
  console.error(
    JSON.stringify({
      event: "tablecast.request_failed",
      traceId: c.get("traceId"),
      releaseSha: c.env.TABLECAST_RELEASE_SHA,
      path: c.req.path,
      errorType: error.name,
    }),
  );
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "INTERNAL_ERROR" }, traceId: c.get("traceId") },
    500,
  );
};
