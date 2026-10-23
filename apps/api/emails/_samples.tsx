import {
  invitationEmail,
  invitationStatusEmail,
  magicLinkEmail,
  securityEmail,
  verificationEmail,
} from "../src/emails/account-content";
import { AccountEmail } from "../src/emails/account-email";

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

// 公式CLIがpropsなしで描画できるテンプレートを、固定の架空データで用意する。
export function preview(name: keyof typeof samples, locale?: Locale) {
  return function PreviewEmail() {
    return <AccountEmail {...samples[name](locale)} assetBaseUrl="/static/brand" />;
  };
}
