type Locale = "en" | "ja";
type EmailLocale = Locale | null | undefined;
type EmailIcon = "arrow-right" | "circle-check" | "fingerprint" | "mail" | "shield-check";
type EmailIdentity = {
  description?: string;
  image?: null | string;
  kind: "store" | "user";
  label: string;
  name: string;
};
type EmailSection = {
  action: string;
  details?: { label: string; value: string }[];
  footer?: string;
  language: Locale;
  message: string;
  title: string;
};
export type AccountEmailContent = {
  actionVariant?: "outline";
  icon: EmailIcon;
  identities?: EmailIdentity[];
  sections: EmailSection[];
  title: string;
  url: string;
};
const choose = (locale: EmailLocale, ja: string, en: string) =>
  locale === "en" ? en : locale === "ja" ? ja : `${ja} / ${en}`;
const dateTime = (date: Date, locale: Locale, timeZone: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ja-JP", {
    dateStyle: "long",
    timeStyle: "long",
    timeZone,
  }).format(date);
function content(
  locale: EmailLocale,
  url: string,
  icon: EmailIcon,
  translate: (language: Locale) => Omit<EmailSection, "language">,
): AccountEmailContent {
  const languages: Locale[] = locale ? [locale] : ["ja", "en"];
  const sections = languages.map((language) => ({ ...translate(language), language }));
  return { title: sections.map((section) => section.title).join(" / "), sections, icon, url };
}
export function invitationEmail(
  restaurant: string,
  url: string,
  details?: {
    expiresAt: Date;
    inviter: string;
    inviterEmail?: string;
    inviterImage?: null | string;
    logo?: null | string;
    role: string;
    timeZone: string;
  },
  locale?: EmailLocale,
) {
  return {
    ...content(locale, url, "arrow-right", (language) => ({
      title: choose(language, "店舗チームへの招待", "Join your restaurant team"),
      message: choose(
        language,
        "店舗チームへの招待が届いています。ログインし、パスキーを登録した後に招待を確認して参加してください。",
        "You have been invited to the restaurant team. Sign in, register a passkey, then review and accept your invitation.",
      ),
      details: details
        ? [
            {
              label: choose(language, "役割", "Role"),
              value: choose(
                language,
                details.role === "owner"
                  ? "責任者"
                  : details.role === "admin"
                    ? "管理者"
                    : "メンバー",
                details.role === "owner"
                  ? "Owner"
                  : details.role === "admin"
                    ? "Administrator"
                    : "Member",
              ),
            },
            {
              label: choose(language, "有効期限", "Expires"),
              value: dateTime(details.expiresAt, language, details.timeZone),
            },
          ]
        : [],
      action: choose(language, "招待を確認", "View invitation"),
      footer: choose(
        language,
        "心当たりがない場合は、このメールを無視してください。確認だけでは参加は確定しません。",
        "If you were not expecting this invitation, ignore this email. Viewing it does not accept the invitation.",
      ),
    })),
    title: choose(locale, `${restaurant}への招待`, `Invitation to ${restaurant}`),
    identities: [
      {
        kind: "store",
        label: choose(locale, "店舗", "Restaurant"),
        name: restaurant,
        image: details?.logo,
      },
      ...(details
        ? [
            {
              kind: "user" as const,
              label: choose(locale, "招待者", "Invited by"),
              name: details.inviter,
              description: details.inviterEmail,
              image: details.inviterImage,
            },
          ]
        : []),
    ] satisfies EmailIdentity[],
  };
}
export function verificationEmail(url: string, locale?: EmailLocale) {
  return content(locale, url, "circle-check", (language) => ({
    title: choose(language, "メールアドレスの確認", "Verify your email"),
    message: choose(
      language,
      "メールアドレスを確認してください。",
      "Please verify your email address.",
    ),
    action: choose(language, "確認", "Verify"),
  }));
}
export function magicLinkEmail(url: string, locale?: EmailLocale) {
  return {
    ...content(locale, url, "mail", (language) => ({
      title: choose(language, "TableCastへのログイン", "Sign in to TableCast"),
      message: choose(
        language,
        "このリンクからログインしてください。有効期限は5分で、一度だけ利用できます。",
        "Use this link to sign in. It expires in 5 minutes and can be used once.",
      ),
      action: choose(language, "ログイン", "Sign in"),
      footer: choose(
        language,
        "心当たりがない場合は、このメールを無視してください。リンクを他の人と共有しないでください。",
        "If you did not request this email, ignore it. Do not share this link.",
      ),
    })),
    actionVariant: "outline" as const,
  };
}
export function invitationStatusEmail(
  store: string,
  status: "accepted" | "canceled" | "rejected",
  email: string,
  url: string,
  locale?: EmailLocale,
  logo?: null | string,
) {
  return {
    ...content(locale, url, "arrow-right", (language) => {
      const state =
        status === "accepted"
          ? choose(language, "参加が完了しました", "Invitation accepted")
          : status === "rejected"
            ? choose(language, "招待が辞退されました", "Invitation declined")
            : choose(language, "招待が取り消されました", "Invitation cancelled");
      return {
        title: `${store}: ${state}`,
        message: `${email} — ${state}`,
        action: choose(language, "店舗一覧を確認", "View restaurants"),
      };
    }),
    identities: [
      { kind: "store", label: choose(locale, "店舗", "Restaurant"), name: store, image: logo },
    ] satisfies EmailIdentity[],
  };
}
export function securityEmail(
  event: "google-linked" | "google-unlinked" | "passkey-added" | "passkey-removed",
  url: string,
  locale?: EmailLocale,
  occurredAt = new Date(),
) {
  const messages = {
    "passkey-added": ["パスキーが登録されました", "A passkey was registered"],
    "passkey-removed": ["パスキーが削除されました", "A passkey was removed"],
    "google-linked": ["Googleアカウントが連携されました", "A Google account was linked"],
    "google-unlinked": ["Googleアカウントの連携が解除されました", "A Google account was unlinked"],
  } as const;
  const [ja, en] = messages[event];
  return {
    ...content(
      locale,
      url,
      event.startsWith("passkey") ? "fingerprint" : "shield-check",
      (language) => ({
        title: choose(language, ja, en),
        message: choose(
          language,
          "アカウントのログイン手段が変更されました。心当たりがない場合は、アカウント設定で登録情報とログイン中の端末を確認してください。",
          "Your sign-in methods have changed. If this was not you, review your sign-in methods and active sessions in your account settings.",
        ),
        details: [
          {
            label: choose(language, "変更日時", "Changed at"),
            value: dateTime(occurredAt, language, "UTC"),
          },
        ],
        action: choose(language, "アカウントを確認", "Review account"),
      }),
    ),
    actionVariant: "outline" as const,
  };
}
