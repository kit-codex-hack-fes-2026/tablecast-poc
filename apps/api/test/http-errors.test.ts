import { trace, SpanStatusCode } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { APIError } from "better-auth/api";
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { afterEach, expect, it, vi } from "vitest";
import { mcpRoutes } from "../src/modules/mcp/routes";
import { type ApiEnv, requestServices } from "../src/platform/context";
import { DomainError } from "../src/platform/errors";
import { handleError, requestTelemetry } from "../src/platform/http";
import { OTLPTransport } from "@inference-net/otel-cf-workers";
import { telemetryConfig } from "../src/platform/telemetry";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { z } from "zod";

afterEach(() => vi.restoreAllMocks());

it.each([false, true])(
  "本文収集%sでproviderのcauseを切り替え、標準出力とOTLPから資格を除く",
  async (capture) => {
    // Given: 実Honoへ会話・顧客情報と認証情報を含むproviderエラーを渡す。
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const bindings = { ...env, TABLECAST_OTEL_CAPTURE_CONTENT: String(capture) };
    const app = new Hono<ApiEnv>()
      .use("*", requestTelemetry)
      .onError(handleError)
      .get("/provider", () => {
        throw new DomainError("VOICE_MODEL_FAILED", 503, "VOICE_MODEL_FAILED", undefined, {
          cause: new Error(
            "顧客@example.comの会話「お茶を一つ」\nAuthorization: Bearer private-token\nCookie: session=private-cookie; second=private-second",
          ),
        });
      });
    // When: 応答後の完了ログを実OTLP送信境界へ渡す。
    const response = await app.request("/provider", {}, bindings);
    const entry = z
      .object({ event: z.string(), attributes: z.record(z.string(), z.unknown()) })
      .parse(JSON.parse(String(logged.mock.calls[0]?.[0])));
    const sent = vi
      .spyOn(OTLPTransport.prototype, "export")
      .mockImplementation((_records, callback) => callback({ code: 0 }));
    const config = telemetryConfig(
      { ...bindings, TABLECAST_OTEL_ENDPOINT: "https://tablecast-collector.test" },
      "tablecast-api",
    );
    config.logs?.transports?.[0]?.export(
      [
        {
          body: entry.event,
          attributes: entry.attributes,
          timeUnixNano: [1, 0],
          observedTimeUnixNano: [1, 0],
          resource: resourceFromAttributes({}),
          instrumentationScope: { name: "tablecast" },
          droppedAttributesCount: 0,
        },
      ],
      () => {},
    );
    // Then: 収集設定に従って本文を保持し、公開応答と両ログへ秘密値を出さない。
    expect(sent).toHaveBeenCalledTimes(1);
    for (const payload of [JSON.stringify(entry), JSON.stringify(sent.mock.calls[0]?.[0])]) {
      expect(payload.includes("お茶を一つ")).toBe(capture);
      expect(payload.includes("顧客@example.com")).toBe(capture);
      expect(payload).not.toMatch(/private-token|private-cookie|private-second/);
    }
    expect(JSON.stringify(await response.json())).not.toContain("お茶");
  },
);

it("内部例外が発生すると、応答・ログ・spanから原因とコード位置を照合でき秘密値は除去される", async () => {
  // Given: 原因例外と秘密値を持つエラーを、実SDKのspanに紐づける。
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  const span = provider.getTracer("tablecast-test").startSpan("tablecast.test.request");
  vi.spyOn(trace, "getActiveSpan").mockReturnValue(span);
  const cause = new TypeError("D1_ERROR: no such table: oauth_resource");
  const failure = new Error("Failed query: select * from secret_table\nparams: private-person", {
    cause,
  });
  const app = new Hono<ApiEnv>()
    .use("*", requestTelemetry)
    .onError(handleError)
    .get("/failure/:id", () => {
      throw failure;
    });
  // When: クエリ・認証ヘッダー付きの要求が失敗する。
  const response = await app.request(
    "/failure/private-id?code=private-code",
    {
      headers: { Authorization: "Bearer private-token", Cookie: "session=private-cookie" },
    },
    { ...env, TABLECAST_RELEASE_SHA: "tablecast-test-release" },
  );
  span.end();
  await provider.forceFlush();
  // Then: HTTPへ内部詳細を返さず、マスク済み原因をログとspanへ残す。
  const requestId = response.headers.get("X-Request-Id");
  expect(response.status).toBe(500);
  expect(requestId).toMatch(/^[\da-f-]{36}$/);
  expect(await response.json()).toEqual({
    error: { code: "INTERNAL_ERROR", message: "INTERNAL_ERROR" },
    traceId: requestId,
  });
  expect(logged).toHaveBeenCalledTimes(1);
  const entry: unknown = JSON.parse(String(logged.mock.calls[0]?.[0]));
  expect(entry).toMatchObject({
    event: "tablecast.request_completed",
    releaseSha: "tablecast-test-release",
    trace_id: span.spanContext().traceId,
    span_id: span.spanContext().spanId,
    attributes: {
      "http.route": "/failure/:id",
      "tablecast.request.id": requestId,
      "exception.message": "Failed query: [REDACTED]",
    },
  });
  expect(JSON.stringify(entry)).toContain("D1_ERROR: no such table: oauth_resource");
  expect(JSON.stringify(entry)).toContain("http-errors.test.ts:");
  expect(JSON.stringify(entry)).not.toMatch(/private-|secret_table/);
  expect(exporter.getFinishedSpans()[0]).toMatchObject({
    status: { code: SpanStatusCode.ERROR },
    events: [{ name: "exception" }],
    attributes: { "tablecast.request.id": requestId },
  });
  await provider.shutdown();
});

it.each([400, 401, 403, 404, 405, 406, 409, 413, 415, 422, 429] as const)(
  "HTTPExceptionが%sを返すとき、status・本文・protocol headerを保ち一件のwarnへ記録する",
  async (status) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = new Hono<ApiEnv>()
      .use("*", requestTelemetry)
      .onError(handleError)
      .all("/protocol", () => {
        throw new HTTPException(status, {
          res: Response.json(
            { error: "protocol_error" },
            {
              status,
              headers: { "Retry-After": "10", "WWW-Authenticate": "Bearer", Allow: "POST" },
            },
          ),
        });
      });
    const response = await app.request("/protocol", {}, env);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "protocol_error" });
    expect(response.headers.get("Retry-After")).toBe("10");
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(response.headers.get("Allow")).toBe("POST");
    expect(response.headers.get("X-Request-Id")).toMatch(/^[\da-f-]{36}$/);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('"http.route":"/protocol"');
    expect(error).not.toHaveBeenCalled();
  },
);

it.each([500, 502, 503, 504] as const)(
  "HTTPExceptionの%sは汎用本文と元のstatusで返しerrorに記録する",
  async (status) => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = new Hono<ApiEnv>()
      .use("*", requestTelemetry)
      .onError(handleError)
      .get("/upstream", () => {
        throw new HTTPException(status, {
          message: "upstream unavailable",
          res: new Response("private-body", {
            status,
            headers: { "Retry-After": "30", "Content-Type": "text/plain", "Content-Length": "12" },
          }),
        });
      });
    const response = await app.request("/upstream", {}, env);
    expect(response.status).toBe(status);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.has("Content-Length")).toBe(false);
    expect(await response.json()).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0]?.[0])).toContain("upstream unavailable");
  },
);

it.each([400, 401, 403, 404, 409, 422, 503] as const)(
  "DomainErrorの%sは業務コードと詳細を維持する",
  async (status) => {
    const app = new Hono<ApiEnv>()
      .use("*", requestTelemetry)
      .onError(handleError)
      .get("/domain", () => {
        throw new DomainError("TABLECAST_ERROR", status, "TABLECAST_ERROR", { version: 2 });
      });
    const response = await app.request("/domain", {}, env);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({
      error: { code: "TABLECAST_ERROR", details: { version: 2 } },
    });
  },
);

it("例外を投げない404と429も最終statusで記録する", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const app = new Hono<ApiEnv>()
    .use("*", requestTelemetry)
    .onError(handleError)
    .get("/limited", (c) => c.json({ error: "RATE_LIMITED" }, 429));
  expect((await app.request("/missing", {}, env)).status).toBe(404);
  expect((await app.request("/limited", {}, env)).status).toBe(429);
  expect(warn).toHaveBeenCalledTimes(2);
  expect(String(warn.mock.calls[0]?.[0])).toContain("Not Found");
  expect(String(warn.mock.calls[1]?.[0])).toContain("Too Many Requests");
});

it.each([
  { error: new TypeError("principal lookup failed"), status: 500 },
  { error: new APIError("SERVICE_UNAVAILABLE", { message: "auth unavailable" }), status: 503 },
])("MCP認証の内部障害は401へ変換せず$statusとcauseの診断を返す", async ({ error, status }) => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const app = new Hono<ApiEnv>()
    .use("*", requestTelemetry)
    .use("*", requestServices)
    .use("*", async (c, next) => {
      const auth = c.get("services").auth;
      await auth.$context;
      vi.spyOn(auth.api, "tablecastMcpPrincipal").mockRejectedValueOnce(error);
      await next();
    })
    .onError(handleError)
    .route("/mcp", mcpRoutes);
  const response = await app.request("/mcp", { method: "POST" }, env);
  expect(response.status).toBe(status);
  expect(response.headers.has("WWW-Authenticate")).toBe(false);
  expect(logged).toHaveBeenCalledTimes(1);
  expect(String(logged.mock.calls[0]?.[0])).toContain("mcp.authentication");
});
