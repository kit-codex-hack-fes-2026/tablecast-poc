import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { expect, it } from "vitest";
import { z } from "zod";
import { startGateway } from "../apps/web/e2e/support/gateway";

it("四つのケースの転送先を分離し、停止中もoriginのポートを保持する", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tablecast-gateway-test-"));
  const cases: {
    server: ReturnType<typeof createServer>;
    gateway: Awaited<ReturnType<typeof startGateway>>;
    id: number;
  }[] = [];
  try {
    for (let id = 0; id < 4; id++) {
      const server = createServer((_request, response) => response.end(String(id)));
      const gateway = await startGateway(directory);
      cases.push({ server, gateway, id });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("待受がありません。");
      gateway.setWebPort(address.port);
    }
    await Promise.all(
      cases.map(async ({ gateway, id }) => {
        expect(await (await fetch(gateway.origin)).text()).toBe(String(id));
        gateway.setOnline(false);
        await expect(fetch(gateway.origin, { signal: AbortSignal.timeout(2000) })).rejects.toThrow(
          "fetch failed",
        );
        const rival = createTcpServer();
        try {
          const error = once(rival, "error");
          rival.listen(Number(new URL(gateway.origin).port), "127.0.0.1");
          expect((await error)[0]).toMatchObject({ code: "EADDRINUSE" });
        } finally {
          rival.close();
        }
        gateway.setOnline(true);
        expect(await (await fetch(gateway.origin)).text()).toBe(String(id));
      }),
    );
  } finally {
    await Promise.all(
      cases.map(async ({ server, gateway }) => {
        await gateway.close();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

it("指定ポートのOAuth起動完了後にdiscoveryと公開URLが一致する", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tablecast-oauth-test-"));
  const readyFile = join(directory, "ready.json");
  const child = spawn("bun", ["--no-env-file", resolvePath("apps/emulate/src/index.ts")], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      TABLECAST_ENV: "development",
      TABLECAST_PUBLIC_ORIGIN: "http://localhost:3000",
      TABLECAST_OAUTH_PORT: process.env.TABLECAST_TEST_OAUTH_PORT ?? "23999",
      TABLECAST_OAUTH_READY_FILE: readyFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (data) => {
    log += String(data);
  });
  child.stderr.on("data", (data) => {
    log += String(data);
  });
  const exited = once(child, "exit");
  try {
    const deadline = Date.now() + 5000;
    let url: string | undefined;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`OAuthの起動に失敗しました: ${log}`);
      try {
        url = z.object({ url: z.url() }).parse(JSON.parse(await readFile(readyFile, "utf8"))).url;
        break;
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
      await delay(50);
    }
    if (!url) throw new Error(`OAuthの起動を確認できません: ${log}`);
    expect(Number(new URL(url).port)).toBeGreaterThan(0);
    const discovery = await (await fetch(`${url}/.well-known/openid-configuration`)).json();
    expect(discovery).toMatchObject({
      issuer: url,
      authorization_endpoint: `${url}/o/oauth2/v2/auth`,
      token_endpoint: `${url}/oauth2/token`,
    });
  } finally {
    child.kill("SIGTERM");
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
});

it("OAuthのbind失敗を起動成功にせず、既存の待受を保つ", async () => {
  const server = createServer((_request, response) => response.end("tablecast-existing"));
  await new Promise<void>((done) => server.listen(0, done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("待受がありません。");
  const child = spawn("bun", ["--no-env-file", resolvePath("apps/emulate/src/index.ts")], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      TABLECAST_ENV: "development",
      TABLECAST_PUBLIC_ORIGIN: "http://localhost:3000",
      TABLECAST_OAUTH_PORT: String(address.port),
      TABLECAST_OAUTH_READY_FILE: "",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (data) => {
    stderr += String(data);
  });
  const exited = once(child, "exit");
  try {
    expect((await exited)[0]).not.toBe(0);
    expect(stderr).toMatch(/EADDRINUSE|Failed to start server\. Is port \d+ in use\?/);
    expect(await (await fetch(`http://127.0.0.1:${address.port}`)).text()).toBe(
      "tablecast-existing",
    );
  } finally {
    child.kill("SIGTERM");
    await exited;
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
