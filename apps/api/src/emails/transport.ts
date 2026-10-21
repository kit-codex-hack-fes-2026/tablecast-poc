import type { MailEnv } from "./send";
import { ensure } from "../platform/errors";
export async function deliverAccountEmail(
  env: MailEnv,
  to: string,
  title: string,
  html: string,
  text: string,
) {
  ensure(env.TABLECAST_EMAIL_FROM, "EMAIL_NOT_CONFIGURED", 503);
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
