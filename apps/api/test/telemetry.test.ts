import { instrument, OTLPExporter, OTLPTransport } from "@inference-net/otel-cf-workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { z } from "zod";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { afterEach, expect, it, vi } from "vitest";
import {
  measured,
  observeOperation,
  requestLog,
  telemetryConfig,
  telemetryAttributes,
} from "../src/platform/telemetry";
import { DomainError } from "../src/platform/errors";
import { handleError, requestTelemetry } from "../src/platform/http";
import type { ApiEnv } from "../src/platform/context";

afterEach(() => vi.restoreAllMocks());

it("sampling対象外でも操作の完了と業務拒否を各一度記録し、HTTP経路と応答を維持する", async () => {
  // Given: traceのhead samplingを0にし、実際のWorker入口とHTTP境界を使う。
  const output = vi.spyOn(console, "info").mockImplementation(() => {});
  const app = new Hono<ApiEnv>().use(requestTelemetry).onError(handleError);
  app.get("/internal/voice/probe", async (c) => {
    await observeOperation("tablecast.catalog.read", () => Promise.resolve(7));
    await observeOperation("tablecast.cart.update", () =>
      Promise.reject(new DomainError("VERSION_CONFLICT", 409, "tablecast-secret")),
    );
    return c.json({ ok: true });
  });
  const config = telemetryConfig({ TABLECAST_ENV: "production" }, "tablecast-api");
  if (!config.trace) throw new Error("trace設定がありません。");
  const worker = instrument(
    { fetch: (request, bindings, execution) => app.fetch(request, bindings, execution) },
    { ...config, trace: { ...config.trace, sampling: { headSampler: { ratio: 0 } } } },
  );
  const execution = createExecutionContext();
  if (!worker.fetch) throw new Error("Worker入口がありません。");
  // When: 成功した読取に続いて版の競合で拒否する。
  const response = await worker.fetch(
    new Request("https://tablecast.test/internal/voice/probe"),
    env,
    execution,
  );
  await waitOnExecutionContext(execution);
  // Then: HTTPは409を維持し、両操作の結果と相関だけを出す。
  expect(response.status).toBe(409);
  const entries = output.mock.calls.map(([value]) =>
    z
      .object({
        event: z.string(),
        attributes: z.record(z.string(), z.unknown()),
        trace_id: z.string().optional(),
      })
      .parse(JSON.parse(String(value))),
  );
  expect(entries.filter((entry) => entry.event === "tablecast.operation_completed")).toMatchObject([
    {
      attributes: {
        "tablecast.operation": "tablecast.catalog.read",
        "tablecast.channel": "voice",
        "tablecast.outcome": "success",
      },
    },
    {
      attributes: {
        "tablecast.operation": "tablecast.cart.update",
        "tablecast.channel": "voice",
        "tablecast.outcome": "rejected",
        "tablecast.error.code": "VERSION_CONFLICT",
      },
    },
  ]);
  expect(entries.filter((entry) => entry.event === "tablecast.request_completed")).toHaveLength(1);
  expect(JSON.stringify(entries)).not.toContain("tablecast-secret");
  expect(entries[0]?.trace_id).toMatch(/^[a-f0-9]{32}$/);
});

it("要求ログは後処理を待たず出力し、許可していない属性を標準出力へ漏らさない", () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  requestLog({ "http.response.status_code": 500, secret: "tablecast-secret" }, true);
  expect(output).toHaveBeenCalledTimes(1);
  expect(output.mock.calls[0]?.[0]).not.toContain("tablecast-secret");
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({
    event: "tablecast.request_completed",
    attributes: { "http.response.status_code": 500 },
  });
});

it("自動計測に秘密属性があるとき送信境界で除去しpreviewのPR番号だけをresourceへ残す", () => {
  // Given: SDKの自動計測にURL・SQL・例外・不正なresourceが含まれる。
  const span: ReadableSpan = {
    name: "GET /private?token=tablecast-secret",
    kind: SpanKind.SERVER,
    spanContext: () => ({ traceId: "1".repeat(32), spanId: "2".repeat(16), traceFlags: 1 }),
    startTime: [1, 0],
    endTime: [1, 100],
    duration: [0, 100],
    ended: true,
    status: { code: SpanStatusCode.ERROR, message: "tablecast-secret" },
    attributes: {
      "http.request.method": "GET",
      "http.route": "/api/table",
      "url.full": "tablecast-secret",
      "db.statement": "tablecast-secret",
      "http.request.header.authorization": "tablecast-secret",
    },
    events: [
      { name: "exception", time: [1, 0], attributes: { "exception.message": "tablecast-secret" } },
    ],
    links: [],
    resource: resourceFromAttributes({ secret: "tablecast-secret" }),
    instrumentationScope: { name: "tablecast" },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  };
  const send = vi
    .spyOn(OTLPExporter.prototype, "export")
    .mockImplementation((_spans, callback) => callback({ code: 0 }));
  const config = telemetryConfig(
    {
      TABLECAST_ENV: "preview",
      TABLECAST_PR_NUMBER: "123",
      TABLECAST_OTEL_ENDPOINT: "http://tablecast-collector:4318",
    },
    "tablecast-api",
  );
  // When: 本番と同じexporter境界を通す。
  const exporter = config.trace && "exporter" in config.trace ? config.trace.exporter : undefined;
  if (!exporter || !("export" in exporter)) throw new Error("trace exporterがありません。");
  exporter.export([span], () => {});
  // Then: 値・例外を除去し、クエリと相関に必要な識別情報を維持する。
  const sent = send.mock.calls[0]?.[0];
  expect(JSON.stringify(sent)).not.toContain("tablecast-secret");
  expect(sent).toMatchObject([
    {
      name: "HTTP",
      attributes: { "http.route": "/api/table" },
      resource: {
        attributes: { "tablecast.pr.number": "123", "deployment.environment.name": "preview" },
      },
    },
  ]);
});

it("構造化イベントだけを送信しprodへpreviewのPR番号を混入させない", () => {
  const send = vi
    .spyOn(OTLPTransport.prototype, "export")
    .mockImplementation((_logs, callback) => callback({ code: 0 }));
  const config = telemetryConfig(
    {
      TABLECAST_ENV: "production",
      TABLECAST_PR_NUMBER: "123",
      TABLECAST_OTEL_ENDPOINT: "http://tablecast-collector:4318",
    },
    "tablecast-api",
  );
  const record = {
    timeUnixNano: [1, 0] as [number, number],
    observedTimeUnixNano: [1, 0] as [number, number],
    resource: resourceFromAttributes({}),
    instrumentationScope: { name: "tablecast" },
    attributes: { "http.route": "/api/table", secret: "tablecast-secret" },
    droppedAttributesCount: 0,
  };
  config.logs?.transports?.[0]?.export(
    [
      { ...record, body: "tablecast-secret" },
      { ...record, body: "tablecast.request_completed" },
    ],
    () => {},
  );
  expect(send).toHaveBeenCalledTimes(1);
  const sent = send.mock.calls[0]?.[0];
  expect(sent).toHaveLength(1);
  expect(JSON.stringify(sent)).not.toContain("tablecast-secret");
  expect(sent?.[0]?.resource.attributes).not.toHaveProperty("tablecast.pr.number");
});

it("Workerリクエスト外の業務操作も元の結果と例外を保つ", async () => {
  expect(await measured("tablecast.test.operation", () => Promise.resolve(7))).toBe(7);
  const error = new Error("tablecast-domain-error");
  await expect(measured("tablecast.test.operation", () => Promise.reject(error))).rejects.toBe(
    error,
  );
});

it("本文収集を有効にしても資格は除去し、無効なら顧客情報・会話・SQL・例外を送らない", () => {
  const settings = {
    TABLECAST_OTEL_CAPTURE_CONTENT: "true",
    TABLECAST_OTEL_AUTHORIZATION: "tablecast-credential",
    TABLECAST_VOICE_API_TOKEN: "tablecast-voice-credential",
  };
  const attributes = {
    "tablecast.input": JSON.stringify({
      name: "試験顧客",
      content: "唐揚げを一つ",
      token: "tablecast-token",
      authorization: "tablecast-credential",
    }),
    "exception.message": "試験顧客の入力エラー tablecast-credential tablecast-voice-credential",
    "db.statement": "select name from customer",
    "http.request.header.cookie": "tablecast-cookie",
    "tablecast.operation": "tablecast.cart.update",
  };
  const collected = telemetryAttributes(attributes, settings);
  expect(JSON.stringify(collected)).not.toContain("tablecast-voice-credential");
  expect(JSON.stringify(collected)).toContain("試験顧客");
  expect(JSON.stringify(collected)).toContain("唐揚げ");
  for (const secret of ["tablecast-credential", "tablecast-token", "tablecast-cookie"])
    expect(JSON.stringify(collected)).not.toContain(secret);
  expect(telemetryAttributes(attributes, { TABLECAST_OTEL_CAPTURE_CONTENT: "false" })).toEqual({
    "tablecast.operation": "tablecast.cart.update",
  });
});

it("大きな本文を欠落なく分割し、Lokiの属性上限と行上限を守って完了件数を保つ", () => {
  // Given: Cloudの属性上限を超える日本語と絵文字を含む業務結果。
  const content = { customer: "試験顧客😀".repeat(20000), token: "tablecast-secret" };
  const send = vi
    .spyOn(OTLPTransport.prototype, "export")
    .mockImplementation((_logs, callback) => callback({ code: 0 }));
  const config = telemetryConfig(
    {
      TABLECAST_OTEL_CAPTURE_CONTENT: "true",
      TABLECAST_OTEL_ENDPOINT: "http://tablecast-collector:4318",
    },
    "tablecast-api",
  );
  // When: 実際のログ送信境界へ一件の完了イベントを渡す。
  config.logs?.transports?.[0]?.export(
    [
      {
        body: "tablecast.operation_completed",
        timeUnixNano: [1, 0],
        observedTimeUnixNano: [1, 0],
        resource: resourceFromAttributes({}),
        instrumentationScope: { name: "tablecast" },
        attributes: {
          "tablecast.operation": "tablecast.catalog.read",
          "tablecast.output": JSON.stringify(content),
        },
        droppedAttributesCount: 0,
      },
    ],
    () => {},
  );
  const records = send.mock.calls[0]?.[0] ?? [];
  // Then: 完了は一度だけ。分割本文を順番に結合すると秘密を除去した元の内容になる。
  expect(records.filter((record) => record.body === "tablecast.operation_completed")).toHaveLength(
    1,
  );
  const parts = records.slice(1).map((record) =>
    z
      .object({
        event: z.literal("tablecast.content"),
        part: z.number(),
        parts: z.number(),
        content: z.string(),
      })
      .parse(JSON.parse(typeof record.body === "string" ? record.body : "null")),
  );
  expect(parts.length).toBeGreaterThan(1);
  expect(parts.map((part) => part.part)).toEqual(parts.map((_, index) => index + 1));
  expect(parts.every((part) => part.parts === parts.length)).toBe(true);
  expect(JSON.parse(parts.map((part) => part.content).join(""))).toEqual({
    "tablecast.output": JSON.stringify({ ...content, token: "[REDACTED]" }),
  });
  for (const record of records) {
    expect(new TextEncoder().encode(JSON.stringify(record.attributes)).length).toBeLessThan(65536);
    expect(new TextEncoder().encode(JSON.stringify(record.body)).length).toBeLessThan(256 * 1024);
  }
});

it("本文収集時にもbindingにないBasic認証と複数Cookieを除去する", () => {
  // Given: 例外・SQL・業務payloadに未知の認証値が含まれる。
  const input = {
    "exception.message":
      "Authorization: Basic dGFibGVjYXN0OnNlY3JldA==\nCookie: session=tablecast-session; csrf=tablecast-csrf",
    "db.statement": "select 'Basic dGFibGVjYXN0OnNlY3JldA=='",
    "tablecast.input": JSON.stringify({
      description: "Set-Cookie: session=tablecast-session; HttpOnly",
    }),
  };
  // When: 本番と同じ属性の送信境界を通す。
  const output = JSON.stringify(
    telemetryAttributes(input, { TABLECAST_OTEL_CAPTURE_CONTENT: "true" }),
  );
  // Then: 顧客本文の設定に関係なく認証値を送らない。
  for (const secret of ["dGFibGVjYXN0OnNlY3JldA==", "tablecast-session", "tablecast-csrf"])
    expect(output).not.toContain(secret);
  expect(output).toContain("[REDACTED]");
});

it("503の業務例外を障害として記録しHTTP応答とエラーコードを保つ", async () => {
  // Given: 設定公開中に音声カタログが利用不能になる。
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const app = new Hono<ApiEnv>().use(requestTelemetry).onError(handleError);
  app.get("/api/probe", async (c) => {
    await observeOperation("tablecast.settings.publish", () =>
      Promise.reject(new DomainError("VOICE_CATALOG_UNAVAILABLE", 503, "catalog unavailable")),
    );
    return c.json({ ok: true });
  });
  const worker = instrument(
    { fetch: (request, bindings, execution) => app.fetch(request, bindings, execution) },
    telemetryConfig({}, "tablecast-api"),
  );
  const execution = createExecutionContext();
  if (!worker.fetch) throw new Error("Worker入口がありません。");
  // When: 共通HTTP入口から操作を実行する。
  const response = await worker.fetch(
    new Request("https://tablecast.test/api/probe"),
    env,
    execution,
  );
  await waitOnExecutionContext(execution);
  // Then: 業務拒否に分類せず障害率の集計へ含める。
  expect(response.status).toBe(503);
  const entries = output.mock.calls.map(([value]) =>
    z
      .object({ event: z.string(), attributes: z.record(z.string(), z.unknown()) })
      .parse(JSON.parse(String(value))),
  );
  expect(entries.find((entry) => entry.event === "tablecast.operation_completed")).toMatchObject({
    attributes: {
      "tablecast.outcome": "error",
      "tablecast.error.code": "VOICE_CATALOG_UNAVAILABLE",
    },
  });
});

it.each([
  { status: 200, outcome: "success", level: "info" as const },
  { status: 409, outcome: "rejected", level: "info" as const },
  { status: 503, outcome: "error", level: "error" as const },
])("Web形式の完了ログでも$statusを$outcomeに分類する", ({ status, outcome, level }) => {
  // Given: Webのemitと同じ、結果分類をまだ含まない属性。
  const output = vi.spyOn(console, level).mockImplementation(() => {});
  // When: API/Web共有の要求ログ境界へ渡す。
  requestLog({ "http.response.status_code": status, "http.route": "ssr" }, status >= 500);
  // Then: 完了イベントにダッシュボードで集計する結果が必ず入る。
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({
    event: "tablecast.request_completed",
    attributes: { "tablecast.outcome": outcome, "http.response.status_code": status },
  });
});
