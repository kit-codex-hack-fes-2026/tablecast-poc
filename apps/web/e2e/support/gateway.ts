import type { Socket } from "node:net";
import { preview } from "vite";

// ケースのoriginを確定してからWorkerを起動する。転送はViteの標準proxyへ任せる。
export async function startGateway(directory: string) {
  let online = true;
  let web = { host: "127.0.0.1", port: 0 };
  const sockets = new Set<Socket>();
  const server = await preview({
    root: directory,
    configFile: false,
    appType: "custom",
    logLevel: "error",
    plugins: [
      {
        name: "tablecast-e2e-connectivity",
        configurePreviewServer(previewServer) {
          previewServer.httpServer.on("connection", (socket: Socket) => {
            sockets.add(socket);
            socket.once("close", () => sockets.delete(socket));
          });
          previewServer.middlewares.use((request, _response, next) => {
            if (!online) request.socket.destroy();
            else next();
          });
        },
      },
    ],
    preview: {
      host: "127.0.0.1",
      port: 0,
      strictPort: true,
      proxy: {
        "/": {
          target: web,
          ws: true,
          configure(_proxy, options) {
            const target = options.target;
            if (!target || typeof target === "string" || target instanceof URL)
              throw new Error("Workerの転送先がありません。");
            web = target;
          },
          bypass(request, response) {
            // upgradeはHTTP middlewareを通らないため、停止中のWSもここで拒否する。
            if (!online) {
              request.socket.destroy();
              if (!response) return false;
            }
            return undefined;
          },
        },
      },
    },
  });
  const address = server.httpServer.address();
  if (!address || typeof address === "string") {
    await server.close();
    throw new Error("ケースの入口ポートを取得できません。");
  }
  const origin = `http://localhost:${address.port}`;
  return {
    origin,
    setWebPort(port: number) {
      web.port = port;
    },
    setOnline(value: boolean) {
      online = value;
      if (!online) for (const socket of sockets) socket.destroy();
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await server.close();
    },
  };
}
