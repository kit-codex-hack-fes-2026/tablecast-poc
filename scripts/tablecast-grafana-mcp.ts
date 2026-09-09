import { resolve } from "node:path";
import { readRuntime, tablecastLocal } from "./tablecast-runtime";

const target = process.argv[2];
if (target !== "local" && target !== "cloud")
  throw new Error("local または cloud を指定してください。");
const args = ["run", "--rm", "-i"];
if (target === "local") {
  const runtime = await readRuntime();
  if (!runtime.ports.grafana) throw new Error("bun run devでLGTMを起動してください。");
  args.push("-e", `GRAFANA_URL=http://host.docker.internal:${runtime.ports.grafana}`);
} else {
  const token = resolve(tablecastLocal, "tablecast-grafana-read-token");
  if (!(await Bun.file(token).exists()))
    throw new Error(".local/tablecast-grafana-read-tokenへViewer tokenを保存してください。");
  args.push(
    "-e",
    "GRAFANA_URL=https://beigepuma130.grafana.net",
    "-v",
    `${token}:/run/secrets/tablecast-grafana:ro`,
    "-e",
    "GRAFANA_SERVICE_ACCOUNT_TOKEN_FILE=/run/secrets/tablecast-grafana",
  );
}
args.push(
  "grafana/mcp-grafana:1.3.0",
  "-t",
  "stdio",
  "--disable-write",
  "--enabled-tools",
  "datasource,loki,prometheus,navigation",
  "--max-loki-log-limit",
  "100",
);
const child = Bun.spawn(["docker", ...args], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => child.kill(signal));
process.exitCode = await child.exited;
