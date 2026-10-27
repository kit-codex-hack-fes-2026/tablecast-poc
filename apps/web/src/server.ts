import { instrument } from "@inference-net/otel-cf-workers";
import { context, propagation } from "@opentelemetry/api";
import { requestLog, telemetryConfig, type TelemetryEnv } from "@tablecast/api/telemetry";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
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
      const proxy =
        path.startsWith("/api/") ||
        path === "/mcp" ||
        path.startsWith("/mcp/") ||
        path.startsWith("/.well-known/") ||
        path.startsWith("/media/") ||
        path.startsWith("/internal/voice/") ||
        path.startsWith("/internal/deploy/") ||
        path.startsWith("/_tablecast/oauth/") ||
        path.startsWith("/o/oauth2/v2/auth/") ||
        path.startsWith("/_emulate/");
      let status = 500;
      try {
        if (proxy) {
          const headers = new Headers(request.headers);
          // 公開リクエストの任意baggageを内部認可へ渡さない。W3C traceだけを伝播する。
          headers.delete("baggage");
          propagation.inject(context.active(), headers, {
            set: (carrier, key, value) => carrier.set(key, value),
          });
          const response = await env.TABLECAST_API.fetch(
            new Request(request, { headers, redirect: "manual" }),
          );
          status = response.status;
          if (status === 101) return response;
          const outgoing = new Response(response.body, response);
          outgoing.headers.append("Server-Timing", `web;dur=${performance.now() - started}`);
          return outgoing;
        }
        const response = await start.fetch(request);
        status = response.status;
        return response;
      } finally {
        requestLog(
          {
            "http.request.method": request.method,
            "http.route": proxy ? "api-proxy" : "ssr",
            "http.response.status_code": status,
            "tablecast.duration_ms": performance.now() - started,
          },
          status >= 500,
        );
      }
    },
  } satisfies ExportedHandler<Cloudflare.Env>,
  (env: Cloudflare.Env & TelemetryEnv) => telemetryConfig(env, "tablecast-web"),
);
