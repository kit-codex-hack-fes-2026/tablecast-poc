import { resolve } from "node:path";
import { localObservability } from "./tablecast-observability-config.ts";
import { tablecastContainer, tablecastLocal } from "./tablecast-runtime.ts";

const target = process.argv[2];
if (target !== "local" && target !== "cloud")
  throw new Error("local または cloud を指定してください。");
const args = ["run", "--rm", "-i"];
const environment: Record<string, string> = {};
if (target === "local") {
  const local = await localObservability(tablecastContainer);
  environment.GRAFANA_URL = local.TABLECAST_GRAFANA_ORIGIN;
  if (!tablecastContainer) args.push("--network", "tablecast-observability-local");
  if (!tablecastContainer) environment.GRAFANA_URL = "http://tablecast-lgtm:3000";
} else {
  const token = resolve(tablecastLocal, "tablecast-grafana-read-token");
  if (!(await Bun.file(token).exists()))
    throw new Error(".local/tablecast-grafana-read-tokenへViewer tokenを保存してください。");
  environment.GRAFANA_URL = "https://beigepuma130.grafana.net";
  environment.GRAFANA_SERVICE_ACCOUNT_TOKEN_FILE = tablecastContainer
    ? token
    : "/run/secrets/tablecast-grafana";
  if (!tablecastContainer) args.push("-v", `${token}:/run/secrets/tablecast-grafana:ro`);
}
const flags = [
  "-t",
  "stdio",
  "--disable-write",
  "--enabled-tools",
  "datasource,loki,prometheus,navigation,tempo",
  "--max-loki-log-limit",
  "100",
];
for (const [key, value] of Object.entries(environment)) args.push("-e", `${key}=${value}`);
const command = tablecastContainer
  ? ["mcp-grafana", ...flags]
  : ["docker", ...args, "grafana/mcp-grafana:2.0.2", ...flags];
const child = Bun.spawn(command, {
  env: { ...process.env, ...environment },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => child.kill(signal));
process.exitCode = await child.exited;
