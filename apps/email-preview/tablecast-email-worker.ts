// 認証はCloudflare Accessが担当し、この入口は動的処理と送信を受け付けない。
export async function emailResponse(
  request: Request,
  paths: ReadonlySet<string>,
  assets: (request: Request) => Promise<Response>,
  page: (request: Request) => Promise<Response>,
) {
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  const path = new URL(request.url).pathname;
  const isAsset =
    path.startsWith("/_next/static/") ||
    path === "/favicon.ico" ||
    path === "/_tablecast/release.json";
  if (!isAsset && !paths.has(path)) return new Response("Not Found", { status: 404 });
  const response = await (isAsset ? assets(request) : page(request));
  const result = new Response(request.method === "HEAD" ? null : response.body, response);
  result.headers.set(
    "Content-Security-Policy",
    "connect-src 'self' https://cdn.jsdelivr.net; form-action 'none'; object-src 'none'; base-uri 'self'",
  );
  if (!path.startsWith("/_next/static/")) result.headers.set("Cache-Control", "no-store");
  return result;
}
