import { createElement } from "react";
import { render, toPlainText } from "@react-email/render";
import { AccountEmail } from "./account-email";
import { ensure } from "../errors";

export type MailEnv = Partial<
  Pick<
    TablecastEnv,
    "TABLECAST_EMAIL" | "TABLECAST_EMAIL_FROM" | "TABLECAST_MAILPIT_URL" | "TABLECAST_ENV"
  >
>;
export async function sendAccountEmail(
  env: MailEnv,
  to: string,
  title: string,
  message: string,
  action: string,
  url: string,
) {
  ensure(env.TABLECAST_EMAIL_FROM, "EMAIL_NOT_CONFIGURED", 503);
  const html = await render(createElement(AccountEmail, { title, message, action, url }));
  const text = toPlainText(html);
  if (env.TABLECAST_MAILPIT_URL) {
    const target = new URL(env.TABLECAST_MAILPIT_URL);
    ensure(
      env.TABLECAST_ENV === "development" &&
        ["127.0.0.1", "localhost", "tablecast-mailpit"].includes(target.hostname),
      "MAILPIT_LOCAL_ONLY",
      503,
    );
    const response = await fetch(new URL("/api/v1/send", target), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        From: { Email: env.TABLECAST_EMAIL_FROM, Name: "TableCast" },
        To: [{ Email: to }],
        Subject: title,
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
    subject: title,
    html,
    text,
  });
}
