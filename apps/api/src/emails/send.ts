import { type ComponentProps } from "react";
import type { AccountEmail } from "./account-email";
import { ensure } from "../platform/errors";
import { renderAccountEmail } from "./render";
import { deliverAccountEmail } from "./transport";

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
  content: Omit<ComponentProps<typeof AccountEmail>, "logoUrl">,
) {
  ensure(env.TABLECAST_EMAIL_FROM, "EMAIL_NOT_CONFIGURED", 503);
  const { html, text } = await renderAccountEmail(env, content);
  await deliverAccountEmail(env, to, content.title, html, text);
}
