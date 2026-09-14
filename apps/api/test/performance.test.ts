import { env, exports } from "cloudflare:workers";
import { afterEach, expect, it, vi } from "vitest";
import { performanceMetricSchema } from "../src/schema";
import { telemetryAttributes } from "../src/platform/telemetry";

const metric = performanceMetricSchema.parse({
  id: "tablecast-sample",
  name: "LCP",
  value: 1200,
  page: "floor",
  device: "tablet",
  visit: "first",
  navigation: "navigate",
  release: "local",
  documentTraceId: "a".repeat(32),
});
const post = (body: unknown, origin: string = env.TABLECAST_PUBLIC_ORIGIN) =>
  exports.default.fetch(
    new Request("http://localhost:3000/api/performance", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
afterEach(() => vi.restoreAllMocks());

it("匿名のブラウザー計測を受信し、許可した属性を既存の観測境界へ渡す", async () => {
  const output = vi.spyOn(console, "info").mockImplementation(() => {});
  const response = await post({ metrics: [metric] });
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ accepted: 1 });
  const entry = output.mock.calls
    .map(([value]) => String(value))
    .find((value) => value.includes('"event":"tablecast.browser_metric"'));
  expect(entry).toBeDefined();
  expect(entry).toContain('"tablecast.rum.value":1200');
  expect(entry).toContain('"tablecast.rum.document_trace_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"');
  expect(
    telemetryAttributes({
      "tablecast.rum.value": 1200,
      "tablecast.rum.url": "https://private.test/?token=secret",
      "tablecast.rum.metric": "LCP",
    }),
  ).toEqual({ "tablecast.rum.value": 1200, "tablecast.rum.metric": "LCP" });
});

it("別originと自由文・不正値・過大batchを拒否する", async () => {
  expect((await post({ metrics: [metric] }, "https://other.test")).status).toBe(403);
  for (const invalid of [
    { ...metric, url: "https://private.test" },
    { ...metric, page: "/admin/stores/private/floor" },
    { ...metric, value: -1 },
    { ...metric, release: "private user" },
  ]) {
    expect((await post({ metrics: [invalid] })).status).toBe(422);
  }
  expect((await post({ metrics: Array.from({ length: 21 }, () => metric) })).status).toBe(422);
  expect((await post({ extra: "x".repeat(17000) })).status).toBe(413);
});
