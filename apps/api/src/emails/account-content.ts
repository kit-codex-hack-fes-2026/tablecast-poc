type Locale = "en" | "ja" | null | undefined;
const choose = (locale: Locale, ja: string, en: string) =>
  locale === "en" ? en : locale === "ja" ? ja : `${ja} / ${en}`;
const roleName = (role: string, locale: Locale) =>
  choose(
    locale,
    role === "owner" ? "責任者" : role === "admin" ? "管理者" : "メンバー",
    role === "owner" ? "Owner" : role === "admin" ? "Administrator" : "Member",
  );
export function invitationEmail(
  restaurant: string,
  url: string,
  details?: { expiresAt: Date; inviter: string; role: string },
  locale?: Locale,
) {
  return {
    language: locale === "en" ? ("en" as const) : ("ja" as const),
    title: choose(locale, `${restaurant}への招待`, `Invitation to ${restaurant}`),
    message: choose(
      locale,
      "店舗チームへの招待が届いています。ログインし、パスキーを登録した後に招待を確認して参加してください。",
      "You have been invited to the restaurant team. Sign in, register a passkey, then review and accept your invitation.",
    ),
    details: details
      ? [
          choose(locale, `招待者: ${details.inviter}`, `Invited by: ${details.inviter}`),
          choose(
            locale,
            `役割: ${roleName(details.role, "ja")}`,
            `Role: ${roleName(details.role, "en")}`,
          ),
          choose(
            locale,
            `有効期限: ${details.expiresAt.toISOString()}`,
            `Expires: ${details.expiresAt.toISOString()}`,
          ),
        ]
      : [],
    action: choose(locale, "招待を確認", "View invitation"),
    url,
    footer: choose(
      locale,
      "心当たりがない場合は、このメールを無視してください。確認だけでは参加は確定しません。",
      "If you were not expecting this invitation, ignore this email. Viewing it does not accept the invitation.",
    ),
  };
}
export function verificationEmail(url: string, locale?: Locale) {
  return {
    language: locale === "en" ? ("en" as const) : ("ja" as const),
    title: choose(locale, "メールアドレスの確認", "Verify your email"),
    message: choose(
      locale,
      "メールアドレスを確認してください。",
      "Please verify your email address.",
    ),
    action: choose(locale, "確認", "Verify"),
    url,
  };
}
export function magicLinkEmail(url: string, locale?: Locale) {
  return {
    language: locale === "en" ? ("en" as const) : ("ja" as const),
    title: choose(locale, "TableCastへのログイン", "Sign in to TableCast"),
    message: choose(
      locale,
      "このリンクからログインしてください。有効期限は5分で、一度だけ利用できます。",
      "Use this link to sign in. It expires in 5 minutes and can be used once.",
    ),
    action: choose(locale, "ログイン", "Sign in"),
    url,
    footer: choose(
      locale,
      "心当たりがない場合は、このメールを無視してください。リンクを他の人と共有しないでください。",
      "If you did not request this email, ignore it. Do not share this link.",
    ),
  };
}
export function invitationStatusEmail(
  store: string,
  status: "accepted" | "canceled" | "rejected",
  email: string,
  url: string,
  locale?: Locale,
) {
  const state =
    status === "accepted"
      ? choose(locale, "参加が完了しました", "Invitation accepted")
      : status === "rejected"
        ? choose(locale, "招待が辞退されました", "Invitation declined")
        : choose(locale, "招待が取り消されました", "Invitation cancelled");
  return {
    language: locale === "en" ? ("en" as const) : ("ja" as const),
    title: `${store}: ${state}`,
    message: `${email} — ${state}`,
    action: choose(locale, "店舗一覧を確認", "View restaurants"),
    url,
  };
}
export function securityEmail(
  event: "google-linked" | "google-unlinked" | "passkey-added" | "passkey-removed",
  url: string,
  locale?: Locale,
) {
  const messages = {
    "passkey-added": ["パスキーが登録されました", "A passkey was registered"],
    "passkey-removed": ["パスキーが削除されました", "A passkey was removed"],
    "google-linked": ["Googleアカウントが連携されました", "A Google account was linked"],
    "google-unlinked": ["Googleアカウントの連携が解除されました", "A Google account was unlinked"],
  } as const;
  const [ja, en] = messages[event];
  return {
    language: locale === "en" ? ("en" as const) : ("ja" as const),
    title: choose(locale, ja, en),
    message: choose(
      locale,
      "アカウントのログイン手段が変更されました。心当たりがない場合は、アカウント設定で登録情報とログイン中の端末を確認してください。",
      "Your sign-in methods have changed. If this was not you, review your sign-in methods and active sessions in your account settings.",
    ),
    details: [new Date().toISOString()],
    action: choose(locale, "アカウントを確認", "Review account"),
    url,
  };
}
