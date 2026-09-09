import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { instrument } from "@inference-net/otel-cf-workers";
import { context, propagation } from "@opentelemetry/api";
import { telemetryConfig, requestLog, type TelemetryEnv } from "@tablecast/api/telemetry";
import { paraglideMiddleware } from "./paraglide/server.js";

const start = createServerEntry({
  async fetch(request) {
    const response = await paraglideMiddleware(request, () => handler.fetch(request));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  },
});

export default instrument(
  {
    async fetch(request, env) {
      const started = performance.now();
      const path = new URL(request.url).pathname;
      if (
        path.startsWith("/api/") ||
        path === "/mcp" ||
        path.startsWith("/mcp/") ||
        path.startsWith("/.well-known/") ||
        path.startsWith("/media/") ||
        path.startsWith("/internal/voice/") ||
        path.startsWith("/internal/deploy/") ||
        path.startsWith("/_tablecast/oauth/") ||
        path.startsWith("/o/oauth2/v2/auth/") ||
        path.startsWith("/_emulate/")
      ) {
        const headers = new Headers(request.headers);
        // 公開リクエストの任意baggageを内部認可へ渡さない。W3C traceだけを伝播する。
        headers.delete("baggage");
        propagation.inject(context.active(), headers, {
          set: (carrier, key, value) => carrier.set(key, value),
        });
        const response = await env.TABLECAST_API.fetch(
          new Request(request, { headers, redirect: "manual" }),
        );
        requestLog(
          {
            "http.request.method": request.method,
            "http.route": "api-proxy",
            "http.response.status_code": response.status,
            "tablecast.duration_ms": performance.now() - started,
          },
          response.status >= 500,
        );
        return response;
      }
      const response = await start.fetch(request);
      requestLog(
        {
          "http.request.method": request.method,
          "http.route": "ssr",
          "http.response.status_code": response.status,
          "tablecast.duration_ms": performance.now() - started,
        },
        response.status >= 500,
      );
      return response;
    },
  } satisfies ExportedHandler<Cloudflare.Env>,
  (env: Cloudflare.Env & TelemetryEnv) => telemetryConfig(env, "tablecast-web"),
);
