import { context, propagation } from "@opentelemetry/api";

// Cookieと応答ヘッダーは現在のSSRリクエストだけに結び付ける。
export async function serverApiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const [{ env }, { getRequest, getResponseHeaders }] = await Promise.all([
    import("cloudflare:workers"),
    import("@tanstack/react-start/server"),
  ]);
  const incoming = getRequest();
  const url = new URL(input instanceof Request ? input.url : String(input), incoming.url);
  if (url.origin !== new URL(incoming.url).origin) throw new Error("API_ORIGIN_MISMATCH");
  const request = new Request(input instanceof Request ? input : url, init);
  const headers = new Headers(request.headers);
  const cookie = incoming.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  headers.delete("baggage");
  propagation.inject(context.active(), headers, {
    set: (carrier, key, value) => carrier.set(key, value),
  });
  const response = await env.TABLECAST_API.fetch(
    new Request(request, { headers, redirect: "manual" }),
  );
  for (const responseCookie of response.headers.getSetCookie())
    getResponseHeaders().append("set-cookie", responseCookie);
  return response;
}

export async function readPanelCookies() {
  const { getRequest } = await import("@tanstack/react-start/server");
  return (getRequest().headers.get("cookie") ?? "")
    .split(";")
    .filter((cookie) => cookie.trim().startsWith("tablecast-layout-"))
    .join(";");
}
