import { createEmulator } from "emulate";

const origin = process.env.TABLECAST_PUBLIC_ORIGIN;
const port = Number(process.env.TABLECAST_OAUTH_PORT);
if (!origin || !Number.isInteger(port) || port < 1024 || process.env.NODE_ENV === "production") {
  throw new Error("TableCastのローカルOAuth設定が必要です。");
}
const hostname = new URL(origin).hostname;
if (
  !(hostname.endsWith(".localhost") || hostname === "localhost" || hostname.endsWith(".orb.local"))
) {
  throw new Error("OAuth emulatorはローカル環境専用です。");
}
const emulator = await createEmulator({
  service: "google",
  port,
  baseUrl: `http://127.0.0.1:${port}`,
  seed: {
    google: {
      users: [
        { email: "tablecast-akari@example.test", name: "小林 直子", email_verified: true },
        { email: "tablecast-koharu@example.test", name: "山本 翼", email_verified: true },
        { email: "tablecast-link@example.test", name: "伊藤 葵", email_verified: true },
        { email: "tablecast-owner@example.test", name: "佐藤 晴香", email_verified: true },
        {
          email: "tablecast-member@example.test",
          name: "田中 蓮",
          email_verified: true,
        },
      ],
      oauth_clients: [
        {
          client_id: "tablecast-local-google",
          client_secret: "tablecast-local-google-secret",
          redirect_uris: [`${origin}/api/auth/callback/google`],
        },
      ],
    },
  },
});
console.info(`TableCast Google OAuth: ${emulator.url}`);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    void emulator.close().then(() => process.exit(0));
  });
