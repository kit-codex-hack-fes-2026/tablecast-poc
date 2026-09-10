import { z } from "zod";

type MetricsEnv = Partial<
  Pick<
    TablecastEnv,
    | "TABLECAST_CLOUDFLARE_ACCOUNT_ID"
    | "TABLECAST_CONTAINER_METRICS_TOKEN"
    | "TABLECAST_CONTAINER_METRICS_APPLICATIONS"
    | "TABLECAST_OTEL_ENDPOINT"
    | "TABLECAST_OTEL_AUTHORIZATION"
    | "TABLECAST_ENV"
    | "TABLECAST_PR_NUMBER"
    | "TABLECAST_RELEASE_SHA"
  >
>;

const sample = z.object({
  count: z.number().nonnegative(),
  dimensions: z.object({
    datetimeFiveMinutes: z.iso.datetime(),
    applicationId: z.string(),
    instanceId: z.string(),
    placementId: z.string(),
    deploymentId: z.string(),
    location: z.string(),
  }),
  avg: z.object({
    cpuUtilization: z.number().nonnegative().nullable(),
    memory: z.number().nonnegative().nullable(),
    rxBandwidthBps: z.number().nonnegative().nullable(),
    txBandwidthBps: z.number().nonnegative().nullable(),
  }),
  max: z.object({
    diskUsage: z.number().nonnegative().nullable(),
    containerUptime: z.number().nonnegative().nullable(),
  }),
});

const attributes = (values: Record<string, string>) =>
  Object.entries(values).map(([key, stringValue]) => ({ key, value: { stringValue } }));

type Point = { attributes: ReturnType<typeof attributes>; timeUnixNano: string; asDouble: number };
type Metric = { name: string; unit: string; gauge: { dataPoints: Point[] } };
const timestamp = (milliseconds: number) => (BigInt(milliseconds) * 1_000_000n).toString();
const interval = 5 * 60_000;

// GraphQLのTimeには小数秒を付けない。実APIでは小数秒付きの検索が空集合になった。
const iso = (milliseconds: number) => new Date(milliseconds).toISOString().replace(".000Z", "Z");

export async function collectContainerMetrics(env: MetricsEnv, scheduledTime: number) {
  const endpoint = env.TABLECAST_OTEL_ENDPOINT?.replace(/\/$/, "");
  if (!endpoint) throw new Error("Container指標のOTLP送信先がありません。");
  // 遅延到着を5分待った、重ならない5分窓。再送時も同じ観測時刻を維持する。
  const end = Math.floor(scheduledTime / interval) * interval - interval;
  const start = end - interval;
  const common = attributes({
    deployment_environment_name: env.TABLECAST_ENV ?? "development",
    tablecast_pr_number: env.TABLECAST_PR_NUMBER || "prod",
  });
  const metrics: Metric[] = [];
  let success = false;
  let sampleCount = 0;
  const health = (name: string, value: number, unit = "") =>
    metrics.push({
      name: `tablecast_container_collector_${name}`,
      unit,
      gauge: {
        dataPoints: [
          { attributes: common, timeUnixNano: timestamp(scheduledTime), asDouble: value },
        ],
      },
    });
  try {
    const account = z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .parse(env.TABLECAST_CLOUDFLARE_ACCOUNT_ID);
    const token = z.string().min(1).parse(env.TABLECAST_CONTAINER_METRICS_TOKEN);
    const names = z
      .array(z.string().regex(/^tablecast-api(?:-pr-[1-9][0-9]*)?-tablecast(?:voice|emulate)$/))
      .min(1)
      .max(2)
      .parse(JSON.parse(env.TABLECAST_CONTAINER_METRICS_APPLICATIONS ?? "[]"));
    const request = async (path: string, body?: unknown) => {
      const response = await fetch(`https://api.cloudflare.com/client/v4/${path}`, {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Cloudflare指標取得: HTTP ${response.status}`);
      return response.json();
    };
    const applications = await Promise.all(
      names.map(async (name) => {
        const response = z
          .object({
            success: z.literal(true),
            result: z.array(z.object({ id: z.uuid(), name: z.string() })),
          })
          .parse(
            await request(
              `accounts/${account}/containers/applications?name=${encodeURIComponent(name)}`,
            ),
          );
        const matches = response.result.filter((application) => application.name === name);
        if (matches.length !== 1 || !matches[0])
          throw new Error("対象Containerを一意に取得できません。");
        return matches[0];
      }),
    );
    const response = z
      .object({
        errors: z.array(z.unknown()).nullish(),
        data: z
          .object({
            viewer: z.object({
              accounts: z
                .array(z.object({ containersMetricsAdaptiveGroups: z.array(sample) }))
                .length(1),
            }),
          })
          .nullish(),
      })
      .parse(
        await request("graphql", {
          query: `query TablecastContainers($account: String, $start: Time, $end: Time, $applications: [String!]) {
        viewer { accounts(filter: {accountTag: $account}) {
          containersMetricsAdaptiveGroups(limit: 1000, filter: {
            datetime_geq: $start, datetime_lt: $end, applicationId_in: $applications
          }, orderBy: [datetimeFiveMinutes_ASC]) {
            count
            dimensions { datetimeFiveMinutes applicationId instanceId placementId deploymentId location }
            avg { cpuUtilization memory rxBandwidthBps txBandwidthBps }
            max { diskUsage containerUptime }
          }
        } }
      }`,
          variables: {
            account,
            start: iso(start),
            end: iso(end),
            applications: applications.map(({ id }) => id),
          },
        }),
      );
    if (response.errors?.length || !response.data)
      throw new Error("Cloudflare GraphQL指標取得に失敗しました。");
    const rows = response.data.viewer.accounts[0]?.containersMetricsAdaptiveGroups;
    if (!rows || rows.length >= 1000) throw new Error("Container指標の応答が不完全です。");
    for (const row of rows) {
      const application = applications.find(({ id }) => id === row.dimensions.applicationId);
      const time = Date.parse(row.dimensions.datetimeFiveMinutes);
      if (!application || time < start || time >= end)
        throw new Error("Container指標の対象または時刻が不正です。");
      if (row.count === 0) continue;
      sampleCount += row.count;
      const labels = [
        ...common,
        ...attributes({
          cloudflare_application: application.name,
          cloudflare_application_id: application.id,
          cloudflare_instance_id: row.dimensions.instanceId,
          cloudflare_placement_id: row.dimensions.placementId,
          cloudflare_deployment_id: row.dimensions.deploymentId,
          cloudflare_location: row.dimensions.location,
        }),
      ];
      const values = [
        ["observed_timestamp_seconds", "s", time / 1000],
        ["cpu_utilization", "1", row.avg.cpuUtilization],
        ["memory_bytes", "By", row.avg.memory],
        ["network_receive", "bit/s", row.avg.rxBandwidthBps],
        ["network_transmit", "bit/s", row.avg.txBandwidthBps],
        ["disk_usage_bytes", "By", row.max.diskUsage],
        [
          "uptime_seconds",
          "s",
          row.max.containerUptime === null ? null : row.max.containerUptime / 1000,
        ],
      ] as const;
      for (const [name, unit, value] of values) {
        if (value === null) continue;
        let metric = metrics.find((entry) => entry.name === `tablecast_container_${name}`);
        if (!metric) {
          metric = { name: `tablecast_container_${name}`, unit, gauge: { dataPoints: [] } };
          metrics.push(metric);
        }
        metric.gauge.dataPoints.push({
          attributes: labels,
          timeUnixNano: timestamp(time),
          asDouble: value,
        });
      }
    }
    success = true;
  } catch {
    // 応答本文や例外には資格が混ざり得る。失敗時に途中の指標を送らない。
    metrics.length = 0;
    console.error(
      JSON.stringify({ event: "tablecast.container_metrics_failed", stage: "cloudflare" }),
    );
  }
  const send = async (batch: Metric[]) => {
    const response = await fetch(`${endpoint}/v1/metrics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.TABLECAST_OTEL_AUTHORIZATION
          ? { Authorization: env.TABLECAST_OTEL_AUTHORIZATION }
          : {}),
      },
      body: JSON.stringify({
        resourceMetrics: [
          {
            resource: {
              attributes: attributes({
                "service.name": "tablecast-container-collector",
                "service.namespace": "tablecast",
                "service.version": env.TABLECAST_RELEASE_SHA ?? "local",
                "deployment.environment.name": env.TABLECAST_ENV ?? "development",
              }),
            },
            scopeMetrics: [{ scope: { name: "tablecast.container.metrics" }, metrics: batch }],
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Container指標のOTLP送信: HTTP ${response.status}`);
    let received = 0;
    const body = response.body?.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          received += chunk.byteLength;
          if (received > 4 * 1024 * 1024) throw new Error("OTLP応答のサイズ上限を超えました。");
          controller.enqueue(chunk);
        },
      }),
    );
    const result = z
      .object({
        partialSuccess: z
          .object({
            rejectedDataPoints: z.union([z.string(), z.number()]).optional(),
            errorMessage: z.string().optional(),
          })
          .optional(),
      })
      .parse(await new Response(body).json());
    if (
      Number(result.partialSuccess?.rejectedDataPoints ?? 0) > 0 ||
      result.partialSuccess?.errorMessage
    )
      throw new Error("Container指標のOTLP送信が一部拒否されました。");
  };
  let exportError: unknown;
  if (success && metrics.length) {
    try {
      await send(metrics);
    } catch (error) {
      success = false;
      exportError = error;
    }
  }
  // 実指標の全件受理後にだけ成功を送る。部分拒否した要求へ成功値を同梱しない。
  metrics.length = 0;
  health("success", success ? 1 : 0);
  if (success) {
    health("samples", sampleCount);
    health("window_end_seconds", end / 1000, "s");
  }
  await send(metrics);
  if (!success) throw exportError ?? new Error("Container指標を取得できませんでした。");
}
