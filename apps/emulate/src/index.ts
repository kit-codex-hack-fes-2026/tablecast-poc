import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { createEmulator } from "emulate";
import { tablecastDemoIdentities, tablecastDemoLinkIdentity } from "./tablecast-demo-identities";

const preview = ["preview", "staging"].includes(process.env.TABLECAST_ENV ?? "");
const origin = process.env.TABLECAST_PUBLIC_ORIGIN;
const port = Number(process.env.TABLECAST_OAUTH_PORT);
if (
  !origin ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  (process.env.NODE_ENV === "production" && !preview)
) {
  throw new Error("TableCastのローカルOAuth設定が必要です。");
}
const hostname = new URL(origin).hostname;
if (
  !(
    hostname.endsWith(".localhost") ||
    hostname === "localhost" ||
    hostname.endsWith(".orb.local")
  ) &&
  !(
    process.env.TABLECAST_ENV === "preview" &&
    /^https:\/\/tablecast-pr-[1-9][0-9]*\.kit-codex\.workers\.dev$/.test(origin)
  ) &&
  !(
    process.env.TABLECAST_ENV === "staging" &&
    origin === "https://tablecast-staging.kit-codex.workers.dev"
  )
) {
  throw new Error("OAuth emulatorはローカル環境専用です。");
}
const emulator = await createEmulator({
  service: "google",
  port,
  baseUrl: preview ? `${origin}/_tablecast/oauth` : `http://127.0.0.1:${port}`,
  seed: {
    google: {
      users: [...tablecastDemoIdentities, tablecastDemoLinkIdentity].map((person) => ({
        email: person.email,
        name: `${person.name} · ${person.label}`,
        picture: `data:image/webp;base64,${readFileSync(new URL(`../../../assets/demo/identities/${person.imageFile}`, import.meta.url)).toString("base64")}`,
        email_verified: true,
      })),
      oauth_clients: [
        {
          client_id: "tablecast-local-google",
          client_secret: "tablecast-local-google-secret",
          name: "TableCast",
          redirect_uris: [`${origin}/api/auth/callback/google`],
        },
      ],
    },
  },
});
if (process.env.TABLECAST_OAUTH_READY_FILE) {
  const readyFile = process.env.TABLECAST_OAUTH_READY_FILE;
  writeFileSync(`${readyFile}.tmp`, JSON.stringify({ url: emulator.url }));
  renameSync(`${readyFile}.tmp`, readyFile);
}
console.info(`TableCast Google OAuth: ${emulator.url}`);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    void emulator.close().then(() => process.exit(0));
  });
