import { langfuseTarget } from "./tablecast-observability-config.ts";

const target = await langfuseTarget(process.argv[2] ?? "");
const child = Bun.spawn(
  ["bun", "run", "--silent", "tablecast:langfuse:cli", ...process.argv.slice(3)],
  {
    env: {
      ...process.env,
      LANGFUSE_BASE_URL: target.baseUrl,
      LANGFUSE_HOST: target.baseUrl,
      LANGFUSE_PUBLIC_KEY: target.publicKey,
      LANGFUSE_SECRET_KEY: target.secretKey,
    },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
);
process.exitCode = await child.exited;
