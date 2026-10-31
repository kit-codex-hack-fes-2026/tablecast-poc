import { z } from "zod";
import { stagingDiscoveryPaths } from "../tablecast-deploy-config.ts";
import { target } from "./runtime.ts";

export async function verifyStaging() {
  // Access資格なしでWeb・OAuthへ到達し、MCPのアプリ認可が維持されることを検査する。
  const request = (path: string, init?: RequestInit) =>
    fetch(`${target.origin}${path}`, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
  for (const path of stagingDiscoveryPaths) {
    const response = await request(path);
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
      throw new Error(`stagingのOAuth discoveryに到達できません: ${path}`);
    const metadata = z
      .object({ resource: z.string().optional(), issuer: z.string().optional() })
      .parse(await response.json());
    if (
      metadata.resource !== `${target.origin}/mcp` &&
      metadata.issuer !== `${target.origin}/api/auth`
    )
      throw new Error("stagingのOAuth discoveryが別環境を参照しています。");
  }
  const mcp = await request("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  if (
    mcp.status !== 401 ||
    !mcp.headers
      .get("www-authenticate")
      ?.includes(`${target.origin}/.well-known/oauth-protected-resource/mcp`)
  )
    throw new Error("stagingの未認証MCPがOAuthの401を返しません。");
  for (const path of ["/", "/_tablecast/oauth", "/api/auth/oauth2/authorize"]) {
    const response = await request(path);
    if (
      response.status >= 500 ||
      response.headers.get("location")?.includes(".cloudflareaccess.com/") ||
      (path === "/" &&
        (!response.ok || !response.headers.get("content-type")?.includes("text/html")))
    )
      throw new Error(`stagingのブラウザー経路へ公開アクセスできません: ${path}`);
  }
  console.info("stagingのWeb公開・OAuth discovery・未認証MCP拒否を確認しました。");
}
