import { AccountEmail, verificationEmail } from "@tablecast/api/emails";

export default function PreviewEmail() {
  return <AccountEmail {...verificationEmail("https://example.invalid/verify-email/sample")} />;
}
