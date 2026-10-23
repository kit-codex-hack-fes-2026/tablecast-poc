import { cloudflare } from "@cloudflare/vite-plugin";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer, type ViteDevServer } from "vite";
import { expect, it } from "vitest";
import { z } from "zod";

it("Workerの全再評価後も有効な親子traceを持つ応答を返す", async () => {
  const parent = resolve(".local");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "tablecast-telemetry-hmr-"));
  const entry = join(directory, "worker.ts");
  const telemetry = resolve("../api/src/platform/telemetry.ts");
  let server: undefined | ViteDevServer;
  try {
    await writeFile(
      entry,
      `
    import { instrument } from '@inference-net/otel-cf-workers';
    import { trace } from '@opentelemetry/api';
    import { measured, telemetryConfig } from ${JSON.stringify(telemetry)};
    const generation = globalThis.tablecastHmrGeneration = (globalThis.tablecastHmrGeneration ?? 0) + 1;
    export default instrument({
      async fetch() {
        const parent = trace.getActiveSpan().spanContext();
        return measured('tablecast.hmr.probe', async () => {
          await Promise.resolve();
          const child = trace.getActiveSpan().spanContext();
          return Response.json({ generation, parent, child });
        });
      }
    }, () => telemetryConfig({ TABLECAST_ENV: 'test' }, 'tablecast-hmr-test'));
  `,
    );
    server = await createServer({
      root: directory,
      configFile: false,
      envDir: false,
      appType: "custom",
      cacheDir: join(directory, "cache"),
      plugins: [
        cloudflare({
          config: {
            name: "tablecast-telemetry-hmr-test",
            entrypoint: entry,
            compatibilityDate: "2026-10-12",
            compatibilityFlags: ["nodejs_compat"],
          },
          viteEnvironment: { name: "ssr" },
          persistState: false,
          inspectorPort: false,
          remoteBindings: false,
          types: { generate: false },
        }),
      ],
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") throw new Error("テスト用の待受がありません。");
    const url = `http://127.0.0.1:${address.port}/`;
    const span = z.object({ traceId: z.string(), spanId: z.string() });
    const probe = z.object({ generation: z.number(), parent: span, child: span });
    const traceIds = new Set<string>();
    const readProbe = async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      expect(response.status).toBe(200);
      return probe.parse(await response.json());
    };
    const assertRequests = async (previous: number) => {
      const [first, second, third] = await Promise.all([readProbe(), readProbe(), readProbe()]);
      expect(first.generation).toBeGreaterThan(previous);
      for (const result of [first, second, third]) {
        expect(result.generation).toBe(first.generation);
        expect(result.parent.traceId).toMatch(/^[a-f0-9]{32}$/);
        expect(result.parent.traceId).not.toBe("0".repeat(32));
        expect(result.child.traceId).toBe(result.parent.traceId);
        expect(result.child.spanId).not.toBe(result.parent.spanId);
        expect(traceIds.has(result.parent.traceId)).toBe(false);
        traceIds.add(result.parent.traceId);
      }
      return first.generation;
    };
    let generation = await assertRequests(0);
    for (let round = 0; round < 3; round++) {
      // 実Viteのmodule runnerを全再評価し、SDKのprivate APIには触れない。
      server.environments.ssr.moduleGraph.invalidateAll();
      server.environments.ssr.hot.send({ type: "full-reload", path: "*" });
      await expect
        .poll(async () => (await readProbe()).generation, { timeout: 5000 })
        .toBeGreaterThan(generation);
      generation = await assertRequests(generation);
    }
  } finally {
    await server?.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
