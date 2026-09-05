import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv, promisify } from "node:util";
import { z } from "zod";
import {
  localEnvironment,
  readRuntime,
  reserveRuntime,
  saveRuntime,
  tablecastLocal,
  tablecastRoot,
  writeLocalConfigs,
} from "./tablecast-runtime";
import type { TablecastRuntime } from "./tablecast-runtime";

const execute = promisify(execFile);
const script = join(tablecastRoot, "scripts/tablecast-dev.ts");
const bin = (name: string) => join(tablecastRoot, "node_modules/.bin", name);

async function run(command: string[], runtime: TablecastRuntime, cwd = tablecastRoot) {
  const child = Bun.spawn(command, {
    cwd,
    env: localEnvironment(runtime),
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code !== 0) throw new Error(`開発コマンドが終了コード${code}で失敗しました: ${command[0]}`);
}

async function ownerRunning(runtime: TablecastRuntime) {
  if (!runtime.pid || !runtime.nonce) return false;
  try {
    const { stdout } = await execute("ps", ["-p", String(runtime.pid), "-o", "command="]);
    return stdout.includes(script) && stdout.includes(`serve ${runtime.nonce}`);
  } catch {
    return false;
  }
}

async function optionalRuntime() {
  try {
    return await readRuntime();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function migrate(runtime: TablecastRuntime) {
  await run(
    [
      bin("wrangler"),
      "d1",
      "migrations",
      "apply",
      "TABLECAST_DB",
      "--local",
      "--config",
      runtime.apiConfig,
      "--persist-to",
      runtime.state,
    ],
    runtime,
  );
}

async function prepare() {
  const previous = await optionalRuntime();
  if (previous && (await ownerRunning(previous))) return previous;
  const runtime = await reserveRuntime();
  await writeLocalConfigs(runtime);
  await migrate(runtime);
  await run([process.execPath, "--no-env-file", "scripts/tablecast-seed.ts"], runtime);
  return runtime;
}

async function stop(runtime: TablecastRuntime) {
  if (!(await ownerRunning(runtime)) || !runtime.pid) return;
  process.kill(runtime.pid, "SIGTERM");
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!(await ownerRunning(runtime))) return;
    await Bun.sleep(100);
  }
  throw new Error("TableCastの停止が完了していません。ログを確認してください。");
}

async function serve(runtime: TablecastRuntime, nonce: string, parity: boolean) {
  if (runtime.nonce !== nonce || runtime.pid !== process.pid)
    throw new Error("起動所有者が一致しません。");
  const children: ReturnType<typeof Bun.spawn>[] = [];
  const env = localEnvironment(runtime);
  const launch = (args: string[], extra: Record<string, string> = {}, cwd = tablecastRoot) => {
    const child = Bun.spawn(args, {
      cwd,
      env: { ...env, ...extra },
      stdout: "inherit",
      stderr: "inherit",
    });
    children.push(child);
    return child;
  };
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    for (const child of children) child.kill("SIGTERM");
    const containerName = `tablecast-${runtime.id}-livekit`;
    try {
      const { stdout } = await execute("docker", [
        "inspect",
        "--format",
        '{{index .Config.Labels "tablecast.root"}}',
        containerName,
      ]);
      if (stdout.trim() === tablecastRoot)
        await execute("docker", ["stop", "--time", "5", containerName]);
    } catch (error) {
      if (
        error instanceof Error &&
        !error.message.includes("No such") &&
        !error.message.includes("not found")
      )
        console.error("ローカルLiveKitの停止状態を確認できません。");
    }
    await Promise.all(children.map((child) => child.exited));
    const current = await readRuntime();
    if (current.nonce === nonce) {
      delete current.pid;
      delete current.nonce;
      await saveRuntime(current);
    }
  }
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.once(signal, () => {
      shutdown()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    });
  try {
    launch([
      bin("portless"),
      "proxy",
      "start",
      "--foreground",
      "--no-tls",
      "--port",
      String(runtime.ports.proxy),
    ]);
    await run(
      [bin("portless"), "alias", `tablecast-${runtime.id}`, String(runtime.ports.web)],
      runtime,
    );
    await run(
      [
        bin("portless"),
        "alias",
        `livekit-tablecast-${runtime.id}`,
        String(runtime.ports.signaling),
      ],
      runtime,
    );
    if (parity) {
      launch([
        bin("wrangler"),
        "dev",
        "--local",
        "--config",
        join(tablecastLocal, "parity.wrangler.json"),
        "--config",
        join(tablecastLocal, "parity-api.wrangler.json"),
        "--port",
        String(runtime.ports.web),
        "--inspector-port",
        String(runtime.ports.inspector),
        "--persist-to",
        runtime.state,
      ]);
    } else {
      launch(
        [
          join(tablecastRoot, "apps/web/node_modules/.bin/vite"),
          "dev",
          "--host",
          "127.0.0.1",
          "--port",
          String(runtime.ports.web),
          "--strictPort",
        ],
        {},
        join(tablecastRoot, "apps/web"),
      );
    }
    const secrets = parseEnv(await readFile(join(tablecastLocal, ".dev.vars"), "utf8"));
    const key = secrets.TABLECAST_LIVEKIT_API_KEY;
    const secret = secrets.TABLECAST_LIVEKIT_API_SECRET;
    if (!key || !secret) throw new Error("ローカルLiveKitの鍵が未設定です。");
    await writeFile(
      join(tablecastLocal, "livekit.yaml"),
      `port: ${runtime.ports.signaling}\nbind_addresses: ["0.0.0.0"]\nrtc:\n  tcp_port: ${runtime.ports.rtcTcp}\n  udp_port: ${runtime.ports.rtcUdp}\n  node_ip: 127.0.0.1\n  use_external_ip: false\nkeys:\n  ${key}: ${JSON.stringify(secret)}\nlogging:\n  level: warn\n`,
      { mode: 0o600 },
    );
    launch([
      "docker",
      "run",
      "--rm",
      "--name",
      `tablecast-${runtime.id}-livekit`,
      "--label",
      `tablecast.root=${tablecastRoot}`,
      "--mount",
      `type=bind,source=${join(tablecastLocal, "livekit.yaml")},target=/etc/tablecast-livekit.yaml,readonly`,
      "-p",
      `127.0.0.1:${runtime.ports.signaling}:${runtime.ports.signaling}`,
      "-p",
      `127.0.0.1:${runtime.ports.rtcTcp}:${runtime.ports.rtcTcp}`,
      "-p",
      `127.0.0.1:${runtime.ports.rtcUdp}:${runtime.ports.rtcUdp}/udp`,
      "livekit/livekit-server:v1.13.6@sha256:e37d68f172556d02aa77968b9fc55ef481468c0315fa38e4fa6c56ce72e3a815",
      "--config",
      "/etc/tablecast-livekit.yaml",
    ]);
    let external: ReturnType<typeof parseEnv> = {};
    try {
      external = parseEnv(await readFile(join(tablecastRoot, ".env.secrets.local"), "utf8"));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    if (
      external.INWORLD_API_KEY &&
      external.TABLECAST_MODEL_API_KEY &&
      external.TABLECAST_MODEL &&
      external.TABLECAST_INWORLD_VOICE_JA &&
      external.TABLECAST_INWORLD_VOICE_EN
    ) {
      launch(["uv", "run", "--directory", "livekit", "tablecast-voice", "dev"], {
        INWORLD_API_KEY: external.INWORLD_API_KEY,
        TABLECAST_INWORLD_VOICE_JA: external.TABLECAST_INWORLD_VOICE_JA,
        TABLECAST_INWORLD_VOICE_EN: external.TABLECAST_INWORLD_VOICE_EN,
        LIVEKIT_URL: `ws://127.0.0.1:${runtime.ports.signaling}`,
        LIVEKIT_API_KEY: key,
        LIVEKIT_API_SECRET: secret,
        TABLECAST_API_URL: `http://127.0.0.1:${runtime.ports.web}`,
        TABLECAST_VOICE_API_TOKEN: secrets.TABLECAST_VOICE_API_TOKEN ?? "",
        TABLECAST_AGENT_HEALTH_PORT: String(runtime.ports.agent),
      });
    } else
      console.info("外部音声設定が未登録のため、音声Agentは停止中です。GUI注文は利用できます。");
    await Promise.race(
      children.map(async (child) => {
        const code = await child.exited;
        if (!closing) throw new Error(`開発プロセスが終了しました (${code})。`);
      }),
    );
  } finally {
    await shutdown();
  }
}

async function start(parity: boolean) {
  const mode = parity ? "parity" : "development";
  const previous = await optionalRuntime();
  if (previous && (await ownerRunning(previous))) {
    if ((previous.mode ?? "development") === mode) {
      console.info(previous.origin);
      return;
    }
    await stop(previous);
  }
  const runtime = await prepare();
  runtime.mode = mode;
  if (parity) {
    await run([bin("turbo"), "run", "build"], runtime);
    const output = join(tablecastRoot, "apps/web/dist/server");
    const config = {
      name: `tablecast-${runtime.id}-web`,
      main: join(output, "index.js"),
      compatibility_date: "2026-09-03",
      compatibility_flags: ["nodejs_compat"],
      no_bundle: true,
      rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
      services: [{ binding: "TABLECAST_API", service: `tablecast-${runtime.id}-api` }],
      assets: { directory: join(tablecastRoot, "apps/web/dist/client"), binding: "ASSETS" },
    };
    await writeFile(join(tablecastLocal, "parity.wrangler.json"), JSON.stringify(config, null, 2));
    const apiConfig: unknown = JSON.parse(await readFile(runtime.apiConfig, "utf8"));
    await writeFile(
      join(tablecastLocal, "parity-api.wrangler.json"),
      JSON.stringify(
        {
          ...z.record(z.string(), z.unknown()).parse(apiConfig),
          main: join(tablecastRoot, "apps/web/dist/tablecast_api/index.js"),
          no_bundle: true,
          rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
        },
        null,
        2,
      ),
    );
  }
  runtime.nonce = randomUUID().replaceAll("-", "");
  await mkdir(join(tablecastLocal, "logs"), { recursive: true });
  const log = await open(join(tablecastLocal, "logs/dev.log"), "w", 0o600);
  const child = Bun.spawn(
    [
      process.execPath,
      "--no-env-file",
      script,
      "serve",
      runtime.nonce,
      ...(parity ? ["--parity"] : []),
    ],
    {
      cwd: tablecastRoot,
      env: localEnvironment(runtime),
      stdin: "ignore",
      detached: true,
      stdout: log.fd,
      stderr: log.fd,
    },
  );
  await log.close();
  runtime.pid = child.pid;
  await saveRuntime(runtime);
  child.unref();
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (!(await ownerRunning(runtime)))
      throw new Error(
        `起動が終了しました。${join(tablecastLocal, "logs/dev.log")} を確認してください。`,
      );
    try {
      const responses = await Promise.all([
        fetch(`http://127.0.0.1:${runtime.ports.web}/api/health`, {
          signal: AbortSignal.timeout(1000),
        }),
        fetch(`http://127.0.0.1:${runtime.ports.signaling}/`, {
          signal: AbortSignal.timeout(1000),
        }),
      ]);
      if (responses.every((response) => response.ok)) {
        ready = true;
        break;
      }
    } catch {
      /* 起動中の接続拒否は次の疎通で確認する。 */
    }
    await Bun.sleep(250);
  }
  if (!ready) {
    await stop(runtime);
    throw new Error("Web/API/LiveKitの起動確認がタイムアウトしました。");
  }
  console.info(`TableCast: ${runtime.origin}\n起動ログ: ${join(tablecastLocal, "logs/dev.log")}`);
}

async function main() {
  const command = process.argv[2] ?? "status";
  const args = process.argv.slice(3).filter((argument) => argument !== "--");
  if (command !== "serve" && command !== "reset" && args.length)
    throw new Error("この開発コマンドは追加引数を受け付けません。");
  if (command === "prepare") {
    const runtime = await prepare();
    console.info(`TableCastのローカルDBと設定を準備しました: ${runtime.origin}`);
  } else if (command === "start" || command === "parity") await start(command === "parity");
  else if (command === "serve") {
    // 親が所有情報を保存してから子の起動を許可する。
    const nonce = process.argv[3];
    if (!nonce) throw new Error("起動識別子がありません。");
    let runtime = await readRuntime();
    for (let attempt = 0; runtime.nonce !== nonce && attempt < 20; attempt++) {
      await Bun.sleep(25);
      runtime = await readRuntime();
    }
    await serve(runtime, nonce, process.argv.includes("--parity"));
  } else if (command === "stop") {
    const runtime = await optionalRuntime();
    if (runtime) await stop(runtime);
    console.info("このworktreeのTableCastを停止しました。");
  } else if (command === "status") {
    const runtime = await readRuntime();
    console.info(JSON.stringify({ ...runtime, running: await ownerRunning(runtime) }, null, 2));
  } else if (command === "storybook") {
    const runtime = await readRuntime();
    await run(
      [
        join(tablecastRoot, "apps/web/node_modules/.bin/storybook"),
        "dev",
        "--config-dir",
        join(tablecastRoot, "apps/web/.storybook"),
        "--port",
        String(runtime.ports.storybook),
        "--host",
        "127.0.0.1",
        "--exact-port",
        "--no-open",
      ],
      runtime,
      join(tablecastRoot, "apps/web"),
    );
  } else if (command === "reset") {
    const profile = (["smoke", "demo", "history"] as const).find((value) => value === args[1]);
    if (args.length && (args.length !== 2 || args[0] !== "--profile" || !profile))
      throw new Error("resetはlocal専用です。指定可能な引数は --profile smoke|demo|history です。");
    const runtime = await readRuntime();
    await stop(runtime);
    const { demoCredentials } = await import("./tablecast-seed");
    const credentials = await demoCredentials();
    await rm(runtime.state, { recursive: true, force: true });
    await writeFile(
      join(tablecastLocal, "demo.json"),
      JSON.stringify(
        { ...credentials, profile: profile ?? credentials.profile, baseTime: Date.now() },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    await migrate(runtime);
    await run([process.execPath, "--no-env-file", "scripts/tablecast-seed.ts"], runtime);
    console.info("このworktreeのデモを初期状態へ戻しました。bun run dev で起動できます。");
  } else throw new Error("対応コマンド: prepare, start, parity, status, stop, storybook, reset");
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "開発処理に失敗しました。");
  process.exitCode = 1;
});
