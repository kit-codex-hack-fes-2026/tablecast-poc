import { type ComponentProps, createElement } from "react";
import type { AccountEmail } from "./account-email";
import type { MailEnv } from "./send";
export async function renderAccountEmail(
  env: MailEnv,
  content: Omit<ComponentProps<typeof AccountEmail>, "logoUrl">,
) {
  // 認証・業務操作の初期化では描画せず、実際に送信する場合にだけ読み込む。
  const [{ render, toPlainText }, { AccountEmail }] = await Promise.all([
    import("@react-email/render"),
    import("./account-email"),
  ]);
  const html = await render(
    createElement(AccountEmail, {
      ...content,
      logoUrl: new URL("/brand/tablecast-logo.png", env.TABLECAST_PUBLIC_ORIGIN).href,
    }),
  );
  const text = `TableCast\n\n${toPlainText(html)}`;
  return { html, text };
}
