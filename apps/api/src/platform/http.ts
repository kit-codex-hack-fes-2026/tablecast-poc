import type { ErrorHandler, MiddlewareHandler } from "hono";
import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { isAPIError } from "better-auth/api";
import { bodyLimit } from "hono/body-limit";
import { createFactory, createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { routePath } from "hono/route";
import { STATUS_CODES } from "node:http";
import type { ApiEnv } from "./context";
import { diagnosticSecrets, errorAttributes } from "./diagnostics";
import { DomainError, ensure } from "./errors";
import { requestLog, telemetryChannel, telemetryTimings } from "./telemetry";

export const apiFactory = createFactory<ApiEnv>();

export const requestTelemetry = createMiddleware<ApiEnv>(async (c, next) => {
  const started = performance.now();
  const requestId = crypto.randomUUID();
  c.set("traceId", requestId);
  c.header("X-Request-Id", requestId);
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  // HonoがonErrorを適用した後の例外と最終ステータスを一箇所で記録する。
  const channel = c.req.path.includes("/voice/")
    ? "voice"
    : c.req.path === "/mcp" || c.req.path.startsWith("/mcp/")
      ? "mcp"
      : "http";
  const timings = new Map<string, { description?: string; duration: number }>();
  await context.with(
    context.active().setValue(telemetryChannel, channel).setValue(telemetryTimings, timings),
    next,
  );
  const status = c.res.status;
  const duration = Math.round((performance.now() - started) * 100) / 100;
  const placement = c.req.header("cf-placement");
  const validPlacement = placement && /^(local|remote)-[A-Z]{3}$/.test(placement);
  // 値やSQLは公開せず、認可済み要求のspan所要時間をHTTPと照合する。
  c.header(
    "Server-Timing",
    [
      `api;dur=${duration}${validPlacement ? `;desc=${JSON.stringify(placement)}` : ""}`,
      ...(c.get("actor") && status < 400
        ? [...timings]
            .slice(0, 32)
            .map(
              ([name, value]) =>
                `${name};dur=${value.duration.toFixed(2)}${value.description ? `;desc=${JSON.stringify(value.description)}` : ""}`,
            )
        : []),
    ].join(", "),
  );
  const secrets = diagnosticSecrets(c.env);
  for (const name of ["authorization", "cookie"]) {
    const value = c.req.header(name);
    if (value) secrets.push(value, ...value.split(/[\s;=]+/).filter((part) => part.length >= 8));
  }
  const diagnostic = c.error
    ? errorAttributes(c.error, secrets, c.env.TABLECAST_OTEL_CAPTURE_CONTENT === "true")
    : status >= 400
      ? {
          "tablecast.error.sanitized": true,
          "exception.type": "HTTPResponse",
          "exception.message": STATUS_CODES[status] ?? "HTTP error response",
        }
      : {};
  const attributes = {
    ...(placement && /^(local|remote)-[A-Z]{3}$/.test(placement)
      ? { "cloudflare.placement": placement }
      : {}),
    "http.request.method": c.req.method,
    "http.route": routePath(c, -1) || "unmatched",
    "http.response.status_code": status,
    "tablecast.request.id": requestId,
    "tablecast.channel": channel,
    "tablecast.outcome": status >= 500 ? "error" : status >= 400 ? "rejected" : "success",
    "tablecast.duration_ms": duration,
    ...diagnostic,
    ...(c.error instanceof DomainError ? { "tablecast.error.code": c.error.code } : {}),
    ...(c.get("errorPhase") ? { "tablecast.error.phase": c.get("errorPhase") } : {}),
  };
  const span = trace.getActiveSpan();
  span?.setAttributes(attributes);
  if (status >= 500) span?.setStatus({ code: SpanStatusCode.ERROR });
  if (c.error) span?.addEvent("exception", diagnostic);
  requestLog(attributes, status >= 500, c.env);
});
export const requestSecurity = createMiddleware<ApiEnv>(async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && c.req.path !== "/mcp") {
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
  let response: Response | undefined;
  if (error instanceof HTTPException) response = error.getResponse();
  else if (isAPIError(error))
    response = Response.json(error.body ?? {}, {
      status: error.statusCode,
      headers: error.headers,
    });
  if (response && response.status < 500) return c.newResponse(response.body, response);
  const headers = new Headers(response?.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Content-Type", "application/json; charset=UTF-8");
  headers.set("Cache-Control", "no-store");
  const internal = Response.json(
    {
      error: { code: "INTERNAL_ERROR", message: "INTERNAL_ERROR" },
      traceId: c.get("traceId"),
    },
    { status: response?.status ?? 500, headers },
  );
  return c.newResponse(internal.body, internal);
};

// 業務RPCだけを共通JSON契約へ揃え、認証・MCP等のprotocol応答は変更しない。
export const handleRpcError: ErrorHandler<ApiEnv> = (error, c) => {
  const response =
    error instanceof HTTPException
      ? error.getResponse()
      : isAPIError(error)
        ? new Response(null, { status: error.statusCode, headers: error.headers })
        : undefined;
  const status = response?.status;
  if (!status || status < 400 || status >= 500) return handleError(error, c);
  const headers = new Headers(response?.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Content-Type", "application/json; charset=UTF-8");
  const code = status === 400 ? "INVALID_INPUT" : "REQUEST_REJECTED";
  const result = Response.json(
    { error: { code, message: code }, traceId: c.get("traceId") },
    { status, headers },
  );
  return c.newResponse(result.body, result);
};

export const requestBodyLimit = createMiddleware<ApiEnv>(async (c, next) => {
  const limit: MiddlewareHandler<ApiEnv> = bodyLimit({
    maxSize:
      c.req.path === "/mcp" || /^\/api\/admin\/stores\/[^/]+\/images$/.test(c.req.path)
        ? 8 * 1024 * 1024
        : 2 * 1024 * 1024,
    onError: () =>
      c.json(
        { error: { code: "BODY_TOO_LARGE", message: "BODY_TOO_LARGE" }, traceId: c.get("traceId") },
        413,
      ),
  });
  return limit(c, next);
});
