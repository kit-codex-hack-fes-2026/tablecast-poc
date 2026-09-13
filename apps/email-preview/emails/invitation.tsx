import { AccountEmail, invitationEmail } from "@tablecast/api/emails";

export default function PreviewEmail() {
  return (
    <AccountEmail
      {...invitationEmail("TableCast サンプル店", "https://example.invalid/invitations/sample")}
    />
  );
}
