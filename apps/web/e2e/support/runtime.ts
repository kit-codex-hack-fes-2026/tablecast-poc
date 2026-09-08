import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import process from "node:process";
import { z } from "zod";

const root = resolve(import.meta.dirname, "../../../..");
async function freePort() {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("テスト用ポートを確保できません。");
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
  return address.port;
}
const existing = z.string().optional().parse(process.env.TABLECAST_E2E_DIRECTORY);
if (!existing) {
  mkdirSync(join(root, ".local"), { recursive: true });
  const directory = mkdtempSync(join(root, ".local/tablecast-e2e-"));
  const web = await freePort(),
    oauth = await freePort(),
    mailpit = await freePort(),
    inspector = await freePort();
  writeFileSync(
    join(directory, "runtime.json"),
    JSON.stringify({
      directory,
      origin: `http://localhost:${web}`,
      ports: { web, oauth, mailpit, inspector },
    }),
  );
  process.env.TABLECAST_E2E_DIRECTORY = directory;
}
const schema = z.object({
  directory: z.string(),
  origin: z.url(),
  ports: z.object({
    web: z.number(),
    oauth: z.number(),
    mailpit: z.number(),
    inspector: z.number(),
  }),
});
export const runtime = schema.parse(
  JSON.parse(readFileSync(join(process.env.TABLECAST_E2E_DIRECTORY ?? "", "runtime.json"), "utf8")),
);
export const credentials = {
  email: "tablecast-owner@example.test",
  password: "tablecast-isolated-test-password",
  otherEmail: "tablecast-koharu@example.test",
  otherPassword: "tablecast-isolated-other-password",
  baseTime: Date.now(),
  profile: "demo" as const,
};
