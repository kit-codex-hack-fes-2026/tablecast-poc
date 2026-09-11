import { resolve } from "node:path";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { createServer } from "vite";
import { expect, it } from "vitest";

it("dev変換は共有HTTPとパネルCookieのserver importをブラウザーから除きSSRに残す", async () => {
  // Given: 実Webソースと、製品と同じStartコンパイラを使う。
  const server = await createServer({
    root: resolve(import.meta.dirname, "../.."),
    configFile: false,
    plugins: [tanstackStart({ vite: { installDevServerMiddleware: false } })],
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
  });
  try {
    for (const path of ["/src/lib/api-fetch.ts", "/src/lib/use-panel-layout.ts"]) {
      // When: buildだけでは検出できないdevの両環境を変換する。
      const client = await server.environments.client.transformRequest(path);
      const ssr = await server.environments.ssr.transformRequest(path);
      // Then: server moduleへの依存はSSRだけに残る。
      expect(client?.code).toBeDefined();
      expect(client?.code).not.toContain("api-fetch.server");
      expect(ssr?.code).toContain("api-fetch.server");
    }
  } finally {
    await server.close();
  }
});
