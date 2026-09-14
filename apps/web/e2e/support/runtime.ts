import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { z } from "zod";

const root = resolve(import.meta.dirname, "../../../..");
const existing = z.string().optional().parse(process.env.TABLECAST_E2E_DIRECTORY);
if (!existing) {
  mkdirSync(join(root, ".local"), { recursive: true });
  const directory = mkdtempSync(join(root, ".local/tablecast-e2e-"));
  writeFileSync(
    join(directory, "runtime.json"),
    JSON.stringify({
      directory,
      // buildとseedの識別用。ここでは待受を開始しない。
      origin: "http://localhost",
    }),
  );
  process.env.TABLECAST_E2E_DIRECTORY = directory;
}
const schema = z.object({
  directory: z.string(),
  origin: z.url(),
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
export function createCaseRuntime() {
  return { directory: mkdtempSync(join(runtime.directory, "tablecast-case-")) };
}
export type CaseRuntime = ReturnType<typeof createCaseRuntime> & {
  origin: string;
  mailpitUrl: string;
};
