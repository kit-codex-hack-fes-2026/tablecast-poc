import { type ComponentProps, createElement } from "react";
import type { AccountEmail } from "./account-email";
import { ensure } from "../platform/errors";

export type MailEnv = Partial<
  Pick<
    TablecastEnv,
    "TABLECAST_EMAIL" | "TABLECAST_EMAIL_FROM" | "TABLECAST_ENV" | "TABLECAST_MAILPIT_URL"
  >
> &
  Pick<TablecastEnv, "TABLECAST_PUBLIC_ORIGIN">;
export async function sendAccountEmail(
  env: MailEnv,
  to: string,
  content: Omit<ComponentProps<typeof AccountEmail>, "assetBaseUrl">,
) {
  ensure(env.TABLECAST_EMAIL_FROM, "EMAIL_NOT_CONFIGURED", 503);
  // 認証・業務操作の初期化では描画せず、送信時だけ描画ライブラリとテンプレートを読む。
  const [{ render, toPlainText }, { AccountEmail }] = await Promise.all([
    import("@react-email/render"),
    import("./account-email"),
  ]);
  const html = await render(
    createElement(AccountEmail, {
      ...content,
      identities: content.identities?.map((identity) => ({
        ...identity,
        image: identity.image
          ? new URL(identity.image, env.TABLECAST_PUBLIC_ORIGIN).href
          : undefined,
      })),
      assetBaseUrl: new URL("/brand", env.TABLECAST_PUBLIC_ORIGIN).href,
    }),
  );
  const text = `TableCast\n\n${toPlainText(html)}`;
  if (env.TABLECAST_MAILPIT_URL) {
    const target = new URL(env.TABLECAST_MAILPIT_URL);
    ensure(
      env.TABLECAST_ENV === "development" &&
        (["127.0.0.1", "localhost", "tablecast-mailpit"].includes(target.hostname) ||
          target.hostname.endsWith(".localhost")),
      "MAILPIT_LOCAL_ONLY",
      503,
    );
    const response = await fetch(new URL("/api/v1/send", target), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        From: { Email: env.TABLECAST_EMAIL_FROM, Name: "TableCast" },
        To: [{ Email: to }],
        Subject: content.title,
        HTML: html,
        Text: text,
      }),
    });
    ensure(response.ok, "EMAIL_DELIVERY_FAILED", 503);
    return;
  }
  ensure(env.TABLECAST_EMAIL, "EMAIL_NOT_CONFIGURED", 503);
  await env.TABLECAST_EMAIL.send({
    from: { email: env.TABLECAST_EMAIL_FROM, name: "TableCast" },
    to,
    subject: content.title,
    html,
    text,
  });
}
