import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import process from "node:process";
import { z } from "zod";

const root = resolve(import.meta.dirname, "../../../..");
async function freePorts() {
  // 全ポートを同時に確保し、同じcaseへの番号の再割当を防ぐ。
  const servers = Array.from({ length: 4 }, () => createServer());
  try {
    const ports = [];
    for (const server of servers) {
      await new Promise<void>((done, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", done);
      });
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("テスト用ポートを確保できません。");
      ports.push(address.port);
    }
    return z.tuple([z.number(), z.number(), z.number(), z.number()]).parse(ports);
  } finally {
    await Promise.all(
      servers
        .filter((server) => server.listening)
        .map(
          (server) =>
            new Promise<void>((done, reject) =>
              server.close((error) => (error ? reject(error) : done())),
            ),
        ),
    );
  }
}
const existing = z.string().optional().parse(process.env.TABLECAST_E2E_DIRECTORY);
if (!existing) {
  mkdirSync(join(root, ".local"), { recursive: true });
  const directory = mkdtempSync(join(root, ".local/tablecast-e2e-"));
  const [web, oauth, mailpit, inspector] = await freePorts();
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

// templateはglobal setupで閉じた後は読み取り専用。各caseへstorageを複製する。
export async function createCaseRuntime() {
  const directory = mkdtempSync(join(runtime.directory, "tablecast-case-"));
  const [web, oauth, mailpit, inspector] = await freePorts();
  return {
    directory,
    origin: `http://localhost:${web}`,
    ports: { web, oauth, mailpit, inspector },
  };
}
export type CaseRuntime = Awaited<ReturnType<typeof createCaseRuntime>>;
