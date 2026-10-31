import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { z } from "zod";

const root = resolve(import.meta.dirname, "../../../..");
// 子processへ同じdirectoryを引き継ぐため、検証後も元のenvへの参照を保つ。
const tablecastEnvironment = z
  .object({
    env: z.custom<Record<string, string | undefined>>(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        z.record(z.string(), z.string().optional()).safeParse({ ...value }).success,
    ),
  })
  .parse(process).env;
const existing = z.string().optional().parse(tablecastEnvironment.TABLECAST_E2E_DIRECTORY);
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
  tablecastEnvironment.TABLECAST_E2E_DIRECTORY = directory;
}
const schema = z.object({
  directory: z.string(),
  origin: z.url(),
});
export const runtime = schema.parse(
  JSON.parse(
    readFileSync(join(tablecastEnvironment.TABLECAST_E2E_DIRECTORY ?? "", "runtime.json"), "utf8"),
  ),
);
export const credentials = {
  email: "haruka.sato@komorebi-shijo.com",
  otherEmail: "tsubasa.yamamoto@westward-burgers-kyoto.com",
  baseTime: Date.now(),
  profile: "demo" as const,
};

// templateはglobal setupで閉じた後は読み取り専用。各workerへstorageを複製する。
export function createWorkerRuntime(parallelIndex: number) {
  return {
    directory: mkdtempSync(join(runtime.directory, `tablecast-worker-${parallelIndex}-`)),
  };
}
export type CaseRuntime = ReturnType<typeof createWorkerRuntime> & {
  mailpitUrl: string;
  origin: string;
};
