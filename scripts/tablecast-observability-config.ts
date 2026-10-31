import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";

const tablecastObservabilityDirectory =
  process.env.TABLECAST_OBSERVABILITY_DIR ??
  join(
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
    "tablecast",
    "observability",
  );

export async function worktreeId(root: string) {
  return createHash("sha256")
    .update(await realpath(root))
    .digest("hex")
    .slice(0, 16);
}

export async function localObservability(container: boolean) {
  const file = join(tablecastObservabilityDirectory, ".env");
  const saved = parseEnv(
    await readFile(file, "utf8").catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return "";
      throw error;
    }),
  );
  return {
    TABLECAST_OTEL_ENDPOINT: container
      ? "http://tablecast-lgtm:4318"
      : `http://127.0.0.1:${saved.TABLECAST_OTLP_PORT ?? "4318"}`,
    TABLECAST_GRAFANA_ORIGIN: container
      ? "http://tablecast-lgtm:3000"
      : `http://127.0.0.1:${saved.TABLECAST_GRAFANA_PORT ?? "3300"}`,
    TABLECAST_LANGFUSE_BASE_URL: container
      ? "http://tablecast-langfuse-web:3000"
      : `http://127.0.0.1:${saved.TABLECAST_LANGFUSE_PORT ?? "3301"}`,
    TABLECAST_LANGFUSE_PUBLIC_KEY: saved.TABLECAST_LANGFUSE_PUBLIC_KEY ?? "",
    TABLECAST_LANGFUSE_SECRET_KEY: saved.TABLECAST_LANGFUSE_SECRET_KEY ?? "",
  };
}

export async function langfuseTarget(target: string) {
  if (target === "local") {
    const local = await localObservability(process.env.TABLECAST_CONTAINER === "1");
    if (!local.TABLECAST_LANGFUSE_SECRET_KEY)
      throw new Error("先にtablecast:observability:upを実行してください。");
    return {
      baseUrl: local.TABLECAST_LANGFUSE_BASE_URL,
      publicKey: local.TABLECAST_LANGFUSE_PUBLIC_KEY,
      secretKey: local.TABLECAST_LANGFUSE_SECRET_KEY,
    };
  }
  if (target !== "cloud") throw new Error("接続先はlocalまたはcloudを明示してください。");
  const path = join(tablecastObservabilityDirectory, "cloud.env");
  const saved = parseEnv(await readFile(path, "utf8"));
  if (!saved.TABLECAST_LANGFUSE_PUBLIC_KEY || !saved.TABLECAST_LANGFUSE_SECRET_KEY)
    throw new Error(`${path}へCloud projectの資格情報を設定してください。`);
  return {
    baseUrl: "https://jp.cloud.langfuse.com",
    publicKey: saved.TABLECAST_LANGFUSE_PUBLIC_KEY,
    secretKey: saved.TABLECAST_LANGFUSE_SECRET_KEY,
  };
}
