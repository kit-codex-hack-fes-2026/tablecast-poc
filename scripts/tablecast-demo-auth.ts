import { z } from "zod";

// ローカルの実メールを使う。既存メールや固定Cookieを再利用しない。
export async function signInDemoOwner(origin: string, mailpit: string, email: string) {
  const app = new URL(origin);
  const inbox = new URL(mailpit);
  for (const target of [app, inbox])
    if (
      !["localhost", "127.0.0.1", "tablecast-mailpit"].includes(target.hostname) &&
      !target.hostname.endsWith(".localhost")
    )
      throw new Error("背景デモの認証はローカル環境だけで使用できます。");
  async function read(path: string) {
    const response = await fetch(new URL(path, inbox), { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error("ローカルMailpitのメールを取得できません。");
    return response.json();
  }
  const messages = z.object({
    messages: z.array(z.object({ ID: z.string(), To: z.array(z.object({ Address: z.string() })) })),
  });
  const previous = new Set(
    messages.parse(await read("/api/v1/messages")).messages.map((message) => message.ID),
  );
  const sent = await fetch(new URL("/api/auth/sign-in/magic-link", app), {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: app.origin },
    body: JSON.stringify({ email, callbackURL: "/account" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!sent.ok) throw new Error("背景デモのログインリンクを送信できません。");
  const message = messages
    .parse(await read("/api/v1/messages"))
    .messages.find(
      (candidate) => !previous.has(candidate.ID) && candidate.To.some((to) => to.Address === email),
    );
  if (!message) throw new Error("背景デモの新しいログインメールがありません。");
  const mail = z
    .object({ HTML: z.string() })
    .parse(await read(`/api/v1/message/${encodeURIComponent(message.ID)}`));
  const link = mail.HTML.match(/href="([^"]*\/api\/auth\/magic-link\/verify[^"]+)"/)?.[1];
  if (!link) throw new Error("背景デモのログインリンクがありません。");
  const url = new URL(link.replaceAll("&amp;", "&"));
  if (url.origin !== app.origin) throw new Error("背景デモのログイン先が一致しません。");
  const verified = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  const cookie = verified.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  if (verified.status !== 302 || !cookie) throw new Error("背景デモの認証が成立していません。");
  const state = await fetch(new URL("/api/account/auth-state", app), {
    headers: { Cookie: cookie },
    signal: AbortSignal.timeout(15_000),
  });
  if (!state.ok) throw new Error("背景デモの認証状態を確認できません。");
  const session = z
    .object({ user: z.object({ id: z.string() }) })
    .nullable()
    .parse(await state.json());
  if (!session) throw new Error(`${email}のセッションを確認できません。`);
  return cookie;
}
