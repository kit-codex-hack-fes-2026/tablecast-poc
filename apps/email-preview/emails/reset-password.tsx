import { AccountEmail, resetPasswordEmail } from "@tablecast/api/emails";

export default function PreviewEmail() {
  return <AccountEmail {...resetPasswordEmail("https://example.invalid/reset-password/sample")} />;
}
