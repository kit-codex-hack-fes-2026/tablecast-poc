export function invitationEmail(restaurant: string, url: string) {
  return {
    title: "店舗への招待 / Restaurant invitation",
    message: `${restaurant} に招待されました。You have been invited to join this restaurant.`,
    action: "招待を確認 / View invitation",
    url,
  };
}

export function verificationEmail(url: string) {
  return {
    title: "メールアドレスの確認 / Verify your email",
    message: "メールアドレスを確認してください。Please verify your email address.",
    action: "確認 / Verify",
    url,
  };
}

export function resetPasswordEmail(url: string) {
  return {
    title: "パスワードの再設定 / Reset password",
    message: "新しいパスワードを設定してください。Please choose a new password.",
    action: "再設定 / Reset",
    url,
  };
}
