import { cloudflare } from "@cloudflare/vite-plugin";
import { renameSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import process from "node:process";
import { defineConfig } from "vite";
import { z } from "zod";

const env = z
  .object({
    TABLECAST_E2E_CASE_DIRECTORY: z.string(),
  })
  .parse(process.env);

// build済みのWeb/APIをcase専用のrootとstorageでpreviewする。
export default defineConfig({
  root: env.TABLECAST_E2E_CASE_DIRECTORY,
  plugins: [
    {
      name: "tablecast-e2e-ready",
      configurePreviewServer(server) {
        server.httpServer.once("listening", () => {
          const address = server.httpServer.address();
          if (!address || typeof address === "string")
            throw new Error("Workerの待受ポートを取得できません。");
          const readyFile = join(env.TABLECAST_E2E_CASE_DIRECTORY, "web-ready.json");
          writeFileSync(`${readyFile}.tmp`, JSON.stringify({ port: address.port }));
          renameSync(`${readyFile}.tmp`, readyFile);
        });
        return () => {
          // Connectの既定表示が落とすtransport errorのcauseも、資格を除去するruntime logへ渡す。
          server.middlewares.use(
            (
              error: unknown,
              _request: IncomingMessage,
              _response: ServerResponse,
              next: (error?: unknown) => void,
            ) => {
              console.error("TableCast preview transport", error);
              next(error);
            },
          );
        };
      },
    },
    cloudflare({
      types: { generate: false },
      persistState: { path: join(env.TABLECAST_E2E_CASE_DIRECTORY, "state") },
      inspectorPort: false,
      remoteBindings: false,
    }),
  ],
});
