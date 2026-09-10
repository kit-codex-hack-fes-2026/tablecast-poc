import { z } from "zod";
import { afterEach, expect, it, vi } from "vitest";
import { collectContainerMetrics } from "../src/platform/container-metrics";

const bindings = {
  TABLECAST_CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
  TABLECAST_CONTAINER_METRICS_TOKEN: "tablecast-cloudflare-secret",
  TABLECAST_CONTAINER_METRICS_APPLICATIONS: '["tablecast-api-pr-123-tablecastvoice"]',
  TABLECAST_OTEL_ENDPOINT: "https://tablecast-collector.test/otlp",
  TABLECAST_OTEL_AUTHORIZATION: "Basic tablecast-grafana-secret",
  TABLECAST_ENV: "preview",
  TABLECAST_PR_NUMBER: "123",
  TABLECAST_RELEASE_SHA: "b".repeat(40),
};
const application = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "tablecast-api-pr-123-tablecastvoice",
};
const scheduledTime = Date.parse("2026-09-10T14:30:00Z");
const row = {
  count: 10,
  dimensions: {
    datetimeFiveMinutes: "2026-09-10T14:20:00Z",
    applicationId: application.id,
    instanceId: "tablecast-instance",
    placementId: "tablecast-placement",
    deploymentId: "tablecast-deployment",
    location: "nrt01",
  },
  avg: { cpuUtilization: 0, memory: null, rxBandwidthBps: 128, txBandwidthBps: 256 },
  max: { diskUsage: 4096, containerUptime: 120000 },
};

const exportSchema = z.object({
  resourceMetrics: z.array(
    z.object({ scopeMetrics: z.array(z.object({ metrics: z.array(z.unknown()) })) }),
  ),
});

afterEach(() => vi.restoreAllMocks());

it("実指標を取得したときPR・instance・観測時刻を保ち、未報告値だけを送信しない", async () => {
  // Given: CPUの実測ゼロと未報告のメモリ、ミリ秒単位の稼働時間。
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ success: true, result: [application] }))
    .mockResolvedValueOnce(
      Response.json({
        data: { viewer: { accounts: [{ containersMetricsAdaptiveGroups: [row] }] } },
        errors: null,
      }),
    )
    .mockImplementationOnce(async () => {
      // 全件受理が返る前には成功heartbeatを送らない。
      expect(fetch).toHaveBeenCalledTimes(3);
      return Response.json({});
    })
    .mockResolvedValueOnce(Response.json({}));
  // When: 5分遅延した完了済みの窓を収集する。
  await collectContainerMetrics(bindings, scheduledTime);
  // Then: Container自身へリクエストせず、正式なmetrics APIからOTLPへ送る。
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    `https://api.cloudflare.com/client/v4/accounts/${bindings.TABLECAST_CLOUDFLARE_ACCOUNT_ID}/containers/applications?name=${application.name}`,
    "https://api.cloudflare.com/client/v4/graphql",
    "https://tablecast-collector.test/otlp/v1/metrics",
    "https://tablecast-collector.test/otlp/v1/metrics",
  ]);
  const query = z
    .object({ query: z.string(), variables: z.unknown() })
    .parse(JSON.parse(z.string().parse(fetch.mock.calls[1]?.[1]?.body)));
  expect(query.variables).toEqual({
    account: bindings.TABLECAST_CLOUDFLARE_ACCOUNT_ID,
    start: "2026-09-10T14:20:00Z",
    end: "2026-09-10T14:25:00Z",
    applications: [application.id],
  });
  expect(query.query).toContain("containersMetricsAdaptiveGroups");
  expect(query.query).not.toContain("containersUsageAdaptiveGroups");
  const body = z.string().parse(fetch.mock.calls[2]?.[1]?.body);
  const exported = exportSchema.parse(JSON.parse(body));
  expect(exported.resourceMetrics[0]?.scopeMetrics[0]?.metrics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "tablecast_container_cpu_utilization",
        gauge: {
          dataPoints: [
            expect.objectContaining({ asDouble: 0, timeUnixNano: "1789050000000000000" }),
          ],
        },
      }),
      expect.objectContaining({
        name: "tablecast_container_uptime_seconds",
        gauge: { dataPoints: [expect.objectContaining({ asDouble: 120 })] },
      }),
    ]),
  );
  expect(body).toContain(
    JSON.stringify({ key: "tablecast_pr_number", value: { stringValue: "123" } }),
  );
  expect(body).toContain(
    JSON.stringify({ key: "cloudflare_instance_id", value: { stringValue: "tablecast-instance" } }),
  );
  expect(body).not.toContain("memory_bytes");
  expect(body).not.toContain("secret");
  expect(body).not.toContain("collector_success");
  const health = exportSchema.parse(JSON.parse(z.string().parse(fetch.mock.calls[3]?.[1]?.body)));
  expect(health.resourceMetrics[0]?.scopeMetrics[0]?.metrics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "tablecast_container_collector_success",
        gauge: { dataPoints: [expect.objectContaining({ asDouble: 1 })] },
      }),
    ]),
  );
});

it.each([
  "停止中でサンプルなし",
  "GraphQLの部分失敗",
  "対象外のContainer",
  "ページ上限",
  "取得例外",
])("%sの場合、CPU等をゼロ埋めせず収集状態を送る", async (condition) => {
  // Given: 成功した空集合と、不完全・失敗した取得を分ける。
  const empty = condition === "停止中でサンプルなし";
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const rows = empty
    ? []
    : condition === "対象外のContainer"
      ? [{ ...row, dimensions: { ...row.dimensions, applicationId: "other" } }]
      : condition === "ページ上限"
        ? Array.from({ length: 1000 }, () => row)
        : [row];
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ success: true, result: [application] }));
  if (condition === "取得例外") fetch.mockRejectedValueOnce(new Error("tablecast-secret"));
  else
    fetch.mockResolvedValueOnce(
      Response.json({
        data: { viewer: { accounts: [{ containersMetricsAdaptiveGroups: rows }] } },
        errors: condition === "GraphQLの部分失敗" ? [{ message: "tablecast-secret" }] : null,
      }),
    );
  fetch.mockResolvedValueOnce(Response.json({}));
  // When: 同じ定期収集を実行する。
  const succeeded = await collectContainerMetrics(bindings, scheduledTime).then(
    () => true,
    () => false,
  );
  expect(succeeded).toBe(empty);
  // Then: 失敗を成功扱いせず、欠測と実測ゼロを混同しない。
  const body = z.string().parse(fetch.mock.calls[2]?.[1]?.body);
  expect(body).not.toContain("cpu_utilization");
  expect(body).not.toContain("secret");
  expect(JSON.stringify(output.mock.calls)).not.toContain("tablecast-secret");
  const exported = exportSchema.parse(JSON.parse(body));
  expect(exported.resourceMetrics[0]?.scopeMetrics[0]?.metrics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "tablecast_container_collector_success",
        gauge: { dataPoints: [expect.objectContaining({ asDouble: empty ? 1 : 0 })] },
      }),
    ]),
  );
});

it.each(["HTTP拒否", "部分拒否", "送信例外"])("OTLPの%sを成功として扱わない", async (condition) => {
  // Given: Cloudflareでは実指標を取得できるが、送信先が拒否する。
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ success: true, result: [application] }))
    .mockResolvedValueOnce(
      Response.json({
        data: { viewer: { accounts: [{ containersMetricsAdaptiveGroups: [row] }] } },
      }),
    );
  if (condition === "送信例外") fetch.mockRejectedValueOnce(new Error("通信失敗"));
  else
    fetch.mockResolvedValueOnce(
      condition === "HTTP拒否"
        ? new Response(null, { status: 429 })
        : Response.json({ partialSuccess: { rejectedDataPoints: "1" } }),
    );
  fetch.mockResolvedValueOnce(Response.json({}));
  // When / Then: 定期処理は失敗し、無制限に再送しない。
  await expect(collectContainerMetrics(bindings, scheduledTime)).rejects.toThrow(
    /Container指標|通信失敗/,
  );
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(z.string().parse(fetch.mock.calls[2]?.[1]?.body)).not.toContain("collector_success");
  const health = exportSchema.parse(JSON.parse(z.string().parse(fetch.mock.calls[3]?.[1]?.body)));
  expect(health.resourceMetrics[0]?.scopeMetrics[0]?.metrics).toEqual([
    expect.objectContaining({
      name: "tablecast_container_collector_success",
      gauge: { dataPoints: [expect.objectContaining({ asDouble: 0 })] },
    }),
  ]);
});
