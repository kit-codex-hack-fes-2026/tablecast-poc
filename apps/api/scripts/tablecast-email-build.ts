import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createElement } from "react";
import { render } from "@react-email/render";
import { AccountEmail } from "../src/emails/account-email";
import {
  invitationEmail,
  verificationEmail,
  resetPasswordEmail,
} from "../src/emails/account-content";
import { catalogRelease } from "../../../scripts/tablecast-catalog-config";

const directory = resolve(import.meta.dirname, "../email-static");
const samples = [
  {
    name: "invitation",
    label: "店舗への招待 / Invitation",
    content: invitationEmail("TableCast サンプル店", "https://example.invalid/invitations/sample"),
  },
  {
    name: "verify-email",
    label: "メール確認 / Verify email",
    content: verificationEmail("https://example.invalid/verify-email/sample"),
  },
  {
    name: "reset-password",
    label: "パスワード再設定 / Reset password",
    content: resetPasswordEmail("https://example.invalid/reset-password/sample"),
  },
];

await rm(directory, { recursive: true, force: true });
await mkdir(resolve(directory, "_tablecast"), { recursive: true });
await mkdir(resolve(directory, "assets"), { recursive: true });
await cp(
  resolve(import.meta.dirname, "../../../docs/design/logos/tablecast-logo.png"),
  resolve(directory, "assets/tablecast-logo.png"),
);
for (const sample of samples) {
  await writeFile(
    resolve(directory, `${sample.name}.html`),
    await render(
      createElement(AccountEmail, { ...sample.content, logoUrl: "./assets/tablecast-logo.png" }),
    ),
  );
}
await writeFile(
  resolve(directory, "index.html"),
  `<!doctype html>
<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>TableCast メールカタログ</title>
<style>body{max-width:48rem;margin:4rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif;line-height:1.8;color:#18181b;background:#fafafa}a{color:#1d4ed8}li{margin:1rem 0}</style>
<h1>TableCast メールカタログ</h1>
<p>架空データを使った日英メールの表示確認用です。メールは送信されません。</p>
<ul>${samples.map(({ name, label }) => `<li><a href="/${name}.html">${label}</a></li>`).join("")}</ul>
</html>`,
);
await writeFile(resolve(directory, "_redirects"), "/ /index.html 200\n");
await writeFile(
  resolve(directory, "_headers"),
  "/*\n  Cache-Control: no-store\n  Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'\n",
);
await writeFile(
  resolve(directory, "_tablecast/release.json"),
  JSON.stringify(catalogRelease("email", ["/", ...samples.map(({ name }) => `/${name}.html`)])),
);
