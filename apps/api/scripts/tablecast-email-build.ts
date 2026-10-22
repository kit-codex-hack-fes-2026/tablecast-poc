import { render } from "@react-email/render";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createElement } from "react";
import { catalogRelease } from "../../../scripts/tablecast-catalog-config";
import {
  invitationEmail,
  invitationStatusEmail,
  magicLinkEmail,
  securityEmail,
  verificationEmail,
} from "../src/emails/account-content";
import { AccountEmail } from "../src/emails/account-email";

const directory = resolve(import.meta.dirname, "../email-static");
const samples = [
  {
    name: "invitation",
    label: "店舗への招待 / Invitation",
    content: invitationEmail("TableCast サンプル店", "https://example.invalid/invitations/sample", {
      inviter: "佐藤 晴香 <sample@example.invalid>",
      role: "admin",
      expiresAt: new Date("2026-10-24T12:00:00Z"),
    }),
  },
  {
    name: "invitation-en",
    label: "店舗への招待 / English",
    content: invitationEmail(
      "TableCast Sample Restaurant",
      "https://example.invalid/invitations/sample",
      {
        inviter: "Haruka Sato <sample@example.invalid>",
        role: "admin",
        expiresAt: new Date("2026-10-24T12:00:00Z"),
      },
      "en",
    ),
  },
  {
    name: "verify-email",
    label: "メール確認 / Verify email",
    content: verificationEmail("https://example.invalid/verify-email/sample"),
  },
  {
    name: "magic-link",
    label: "ログインリンク / Sign-in link",
    content: magicLinkEmail("https://example.invalid/sign-in/sample"),
  },
  ...(["accepted", "rejected", "canceled"] as const).map((status) => ({
    name: `invitation-${status}`,
    label: `招待 / ${status}`,
    content: invitationStatusEmail(
      "TableCast サンプル店",
      status,
      "sample@example.invalid",
      "https://example.invalid/organisations",
    ),
  })),
  ...(["passkey-added", "passkey-removed", "google-linked", "google-unlinked"] as const).map(
    (event) => ({
      name: event,
      label: event,
      content: securityEmail(event, "https://example.invalid/account"),
    }),
  ),
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
