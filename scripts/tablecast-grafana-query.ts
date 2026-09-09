import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";

// Codexと同じ公式MCPへ接続し、検索の疎通をCLIでも再現する。
const target = z.enum(["local", "cloud"]).parse(process.argv[2]);
const tool = process.argv[3];
const client = new Client({ name: "tablecast-grafana-check", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--no-env-file", `${import.meta.dir}/tablecast-grafana-mcp.ts`, target],
  stderr: "inherit",
});
try {
  await client.connect(transport);
  const result = tool
    ? await client.callTool({
        name: tool,
        arguments: z.record(z.string(), z.unknown()).parse(JSON.parse(process.argv[4] ?? "{}")),
      })
    : await client.listTools();
  console.info(JSON.stringify(result, null, 2));
  if ("isError" in result && result.isError) process.exitCode = 1;
} finally {
  await client.close();
}
