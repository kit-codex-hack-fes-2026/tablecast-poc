import { env } from "cloudflare:workers";
import { vi } from "vitest";
import { z } from "zod";
import { type createAuth } from "../src/modules/auth/service";

export const authOrigin = env.TABLECAST_PUBLIC_ORIGIN;
export const mailAuthEnv = {
  ...env,
  TABLECAST_ENV: "development",
  TABLECAST_EMAIL_FROM: "tablecast@example.test",
  TABLECAST_MAILPIT_URL: "http://localhost:8025",
};
const mailSchema = z.object({
  HTML: z.string(),
  Text: z.string(),
  Subject: z.string(),
  To: z.array(z.object({ Email: z.string() })),
});

// 配送境界だけを固定する。IdPやDashboardへの要求は各試験が明示する。
export function captureAuthMail(fallback?: (request: Request) => Promise<Response> | Response) {
  const mails: z.infer<typeof mailSchema>[] = [];
  const outbound = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (request.url === `${mailAuthEnv.TABLECAST_MAILPIT_URL}/api/v1/send`) {
      mails.push(mailSchema.parse(await request.json()));
      return Response.json({ ID: "tablecast-auth-mail" });
    }
    if (fallback) return fallback(request);
    throw new Error(`未定義の外部要求: ${request.url}`);
  });
  return { mails, outbound };
}

export function authPost(
  auth: ReturnType<typeof createAuth>,
  path: string,
  body: unknown,
  cookie = "",
) {
  return auth.handler(
    new Request(`${authOrigin}/api/auth${path}`, {
      method: "POST",
      headers: { Origin: authOrigin, "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    }),
  );
}

export function magicLinkUrl(mail: undefined | { HTML: string }) {
  const url = mail?.HTML.match(/href="([^"]*\/api\/auth\/magic-link\/verify[^"]+)"/)?.[1];
  if (!url) throw new Error("ログインリンクが届いていません");
  return url.replaceAll("&amp;", "&");
}
