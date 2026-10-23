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
const samples = ([undefined, "ja", "en"] as const).flatMap((locale) => {
  const suffix = locale ? `-${locale}` : "";
  const store = locale === "en" ? "TableCast Sample Restaurant" : "TableCast サンプル店";
  const url = "https://example.invalid/invitations/sample";
  const details = {
    inviter: "佐藤 晴香 / Haruka Sato",
    inviterEmail: "sample@example.invalid",
    inviterImage: "./assets/inviter.webp",
    logo: "./assets/store.png",
    role: "admin",
    expiresAt: new Date("2026-10-24T12:00:00Z"),
    timeZone: "Asia/Tokyo",
  };
  return [
    {
      name: `invitation${suffix}`,
      label: "店舗への招待",
      content: invitationEmail(store, url, details, locale),
    },
    {
      name: `verify-email${suffix}`,
      label: "メール確認",
      content: verificationEmail("https://example.invalid/verify-email/sample", locale),
    },
    {
      name: `magic-link${suffix}`,
      label: "ログインリンク",
      content: magicLinkEmail("https://example.invalid/sign-in/sample", locale),
    },
    ...(["accepted", "rejected", "canceled"] as const).map((status) => ({
      name: `invitation-${status}${suffix}`,
      label: `招待 / ${status}`,
      content: invitationStatusEmail(
        store,
        status,
        "sample@example.invalid",
        "https://example.invalid/organisations",
        locale,
        details.logo,
      ),
    })),
    ...(["passkey-added", "passkey-removed", "google-linked", "google-unlinked"] as const).map(
      (event) => ({
        name: `${event}${suffix}`,
        label: event,
        content: securityEmail(
          event,
          "https://example.invalid/account",
          locale,
          new Date("2026-10-23T09:30:00Z"),
        ),
      }),
    ),
    {
      name: `invitation-no-images${suffix}`,
      label: "店舗への招待 / 画像なし・長文",
      content: invitationEmail(
        `${store} — 京都四条烏丸 レストラン・カフェ＆ダイニング / Kyoto Shijo Restaurant and Dining`,
        `${url}?returnTo=${"long-destination-".repeat(12)}`,
        {
          ...details,
          logo: null,
          inviterImage: null,
          inviter: "佐藤 晴香 / Haruka Sato — TableCast restaurant team",
          inviterEmail: "long-email-address-for-layout-review@example.invalid",
        },
        locale,
      ),
    },
  ].map((sample) => ({ ...sample, label: `${sample.label} / ${locale ?? "日英併記"}` }));
});

await rm(directory, { recursive: true, force: true });
await mkdir(resolve(directory, "_tablecast"), { recursive: true });
await mkdir(resolve(directory, "assets"), { recursive: true });
await cp(
  resolve(import.meta.dirname, "../../web/public/brand"),
  resolve(directory, "assets/brand"),
  { recursive: true },
);
await cp(
  resolve(import.meta.dirname, "../../../assets/demo/identities/haruka-sato.webp"),
  resolve(directory, "assets/inviter.webp"),
);
await cp(
  resolve(import.meta.dirname, "../../../docs/design/themes/gomen/logo.png"),
  resolve(directory, "assets/store.png"),
);
for (const sample of samples) {
  await writeFile(
    resolve(directory, `${sample.name}.html`),
    await render(
      createElement(AccountEmail, { ...sample.content, assetBaseUrl: "./assets/brand" }),
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
