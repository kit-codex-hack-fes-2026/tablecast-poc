import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  invitationEmail,
  invitationStatusEmail,
  magicLinkEmail,
  securityEmail,
  verificationEmail,
} from "../src/emails/account-content";

type Locale = "en" | "ja" | undefined;
const url = "https://example.invalid/invitations/sample";
const store = (locale: Locale) =>
  locale === "en" ? "TableCast Sample Restaurant" : "TableCast サンプル店";
const details = {
  inviter: "佐藤 晴香 / Haruka Sato",
  inviterEmail: "sample@example.invalid",
  inviterImage: "/static/inviter.webp",
  logo: "/static/store.png",
  role: "admin",
  expiresAt: new Date("2026-10-24T12:00:00Z"),
  timeZone: "Asia/Tokyo",
};
const invitation = (locale: Locale, role = "admin") =>
  invitationEmail(store(locale), url, { ...details, role }, locale);
const status = (value: "accepted" | "canceled" | "rejected") => (locale: Locale) =>
  invitationStatusEmail(
    store(locale),
    value,
    "sample@example.invalid",
    "https://example.invalid/organisations",
    locale,
    details.logo,
  );
const security =
  (event: "google-linked" | "google-unlinked" | "passkey-added" | "passkey-removed") =>
  (locale: Locale) =>
    securityEmail(
      event,
      "https://example.invalid/account",
      locale,
      new Date("2026-10-23T09:30:00Z"),
    );
const samples = {
  invitation: (locale: Locale) => invitation(locale),
  "invitation-owner": (locale: Locale) => invitation(locale, "owner"),
  "invitation-member": (locale: Locale) => invitation(locale, "member"),
  "verify-email": (locale: Locale) =>
    verificationEmail("https://example.invalid/verify-email/sample", locale),
  "magic-link": (locale: Locale) =>
    magicLinkEmail("https://example.invalid/sign-in/sample", locale),
  "invitation-accepted": status("accepted"),
  "invitation-rejected": status("rejected"),
  "invitation-canceled": status("canceled"),
  "passkey-added": security("passkey-added"),
  "passkey-removed": security("passkey-removed"),
  "google-linked": security("google-linked"),
  "google-unlinked": security("google-unlinked"),
  "invitation-no-images": (locale: Locale) =>
    invitationEmail(
      `${store(locale)} — 京都四条烏丸 レストラン・カフェ＆ダイニング / Kyoto Shijo Restaurant and Dining`,
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
};

// 公式CLIはファイルごとに書き出すため、架空データを渡す入口だけを一時生成する。
const directory = resolve(import.meta.dirname, "../.local/tablecast-email");
await rm(directory, { recursive: true, force: true });
await mkdir(resolve(directory, "static"), { recursive: true });
await cp(
  resolve(import.meta.dirname, "../../web/public/brand"),
  resolve(directory, "static/brand"),
  { recursive: true },
);
await cp(
  resolve(import.meta.dirname, "../../../assets/demo/identities/haruka-sato.webp"),
  resolve(directory, "static/inviter.webp"),
);
await cp(
  resolve(import.meta.dirname, "../../../docs/design/themes/gomen/logo.png"),
  resolve(directory, "static/store.png"),
);
for (const locale of [undefined, "ja", "en"] as const) {
  for (const [name, content] of Object.entries(samples)) {
    await writeFile(
      resolve(directory, `${name}${locale ? `-${locale}` : ""}.tsx`),
      `import { AccountEmail } from "../../src/emails/account-email";\nexport default function Email() { return <AccountEmail {...${JSON.stringify(content(locale))}} assetBaseUrl="/static/brand" />; }\n`,
    );
  }
}
