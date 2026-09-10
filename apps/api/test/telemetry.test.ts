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
  };
  const attributes = {
    "tablecast.input": JSON.stringify({
      name: "試験顧客",
      content: "唐揚げを一つ",
      token: "tablecast-token",
      authorization: "tablecast-credential",
    }),
    "exception.message": "試験顧客の入力エラー tablecast-credential",
    "db.statement": "select name from customer",
    "http.request.header.cookie": "tablecast-cookie",
    "tablecast.operation": "tablecast.cart.update",
  };
  const collected = telemetryAttributes(attributes, settings);
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
