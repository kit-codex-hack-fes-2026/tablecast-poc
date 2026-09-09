import { OTLPExporter, OTLPTransport } from "@inference-net/otel-cf-workers";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { afterEach, expect, it, vi } from "vitest";
import { measured, requestLog, telemetryConfig } from "../src/platform/telemetry";

afterEach(() => vi.restoreAllMocks());

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
