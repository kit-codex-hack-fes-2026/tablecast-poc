import { chromium } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { setTimeout } from "node:timers/promises";
import { parseArgs, promisify } from "node:util";
import { z } from "zod";
import { openScreenResult } from "./tablecast-doctor.ts";
import { captureBrowserPointer } from "./tablecast-capture-types.ts";
import { tablecastCaptureOrigin, tablecastHostArguments } from "./tablecast-app-capture.ts";

// 認証済みの合成店舗で、商品詳細を開いて戻る短い収録を行う。
// 注文・音声接続・TTS生成は行わない。Cookieは出力に含めない。
async function main() {
  const { values } = parseArgs({
    options: {
      "storage-state": { type: "string" },
      origin: { type: "string", default: tablecastCaptureOrigin() },
      openscreen: { type: "string" },
      out: { type: "string", default: `output/capture-check-${Date.now()}` },
    },
  });
  if (!values["storage-state"]) throw new Error("--storage-state に認証済みの保存先が必要です");
  const out = resolve(values.out);
  await mkdir(out, { recursive: false });
  const openscreen =
    values.openscreen ??
    resolve(process.env.LOCALAPPDATA ?? "", "Programs/Openscreen/Openscreen.exe");
  const run = promisify(execFile);
  const commandOptions = { windowsHide: true, timeout: 90_000, maxBuffer: 8_000_000 };
  const windowTitle = `TableCast capture check ${Date.now()}`;
  const browser = await chromium.launch({
    channel: "chrome",
    headless: false,
    args: [
      "--window-size=1040,900",
      "--window-position=25,25",
      ...tablecastHostArguments(values.origin),
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1024, height: 768 },
      storageState: resolve(values["storage-state"]),
    });
    page.setDefaultTimeout(15_000);
    await page.goto(values.origin, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.evaluate(captureBrowserPointer);
    console.info("OK: 専用Chromeでアプリへ接続");
    await page.screenshot({ path: resolve(out, "tablecast-initial.png") });
    await page.getByRole("tab", { name: "おしながき", exact: true }).click();
    const product = page
      .getByRole("button")
      .filter({ has: page.getByText("枝豆", { exact: true }) });
    await product.waitFor();
    await page.evaluate(`document.title = ${JSON.stringify(windowTitle)}`);
    await page.bringToFront();
    const { stdout: sources } = await run(openscreen, ["sources", "--json"], commandOptions);
    const inventory = z
      .object({ sources: z.object({ windows: z.array(z.object({ name: z.string() })) }) })
      .parse(openScreenResult(sources));
    if (inventory.sources.windows.filter((item) => item.name.includes(windowTitle)).length !== 1)
      throw new Error("収録専用ブラウザーを一意に選択できません");
    const rawProject = resolve(out, "tablecast-raw.openscreen");
    const recorder = spawn(
      openscreen,
      ["record", "--window", windowTitle, "--duration", "18", "--project", rawProject, "--json"],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    recorder.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    recorder.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    let closed = false;
    const completion = new Promise<number | null>((accept, reject) => {
      recorder.once("error", reject);
      recorder.once("close", (code) => {
        closed = true;
        accept(code);
      });
    });
    // 開始ログより前に操作しない。失敗してもstopで元録画を保存する。
    try {
      const deadline = Date.now() + 45_000;
      while (!stdout.includes("Recording started")) {
        if (closed || Date.now() > deadline)
          throw new Error("OpenScreenの録画開始を確認できません");
        await setTimeout(100);
      }
      console.info("OK: Playwrightで実アプリ表示 / OpenScreenで録画開始");
      await page.mouse.move(150, 650);
      await setTimeout(2_000);
      const productBox = await product.boundingBox();
      if (!productBox) throw new Error("商品の位置を取得できません");
      await page.mouse.move(
        productBox.x + productBox.width / 2,
        productBox.y + productBox.height / 2,
        { steps: 24 },
      );
      await product.click({ delay: 120 });
      await page.getByRole("heading", { name: "枝豆", exact: true }).waitFor();
      await page.screenshot({ path: resolve(out, "tablecast-detail.png") });
      await setTimeout(5_000);
      const back = page.getByRole("button", { name: "おしながき", exact: true });
      const backBox = await back.boundingBox();
      if (!backBox) throw new Error("戻るボタンの位置を取得できません");
      await page.mouse.move(backBox.x + backBox.width / 2, backBox.y + backBox.height / 2, {
        steps: 24,
      });
      await back.click({ delay: 120 });
      await page.mouse.move(150, 650, { steps: 24 });
      await product.waitFor();
      console.info("OK: 商品詳細を開く → おしながきへ戻る");
      if ((await completion) !== 0) throw new Error("OpenScreen録画が異常終了しました");
      openScreenResult(stdout);
    } finally {
      if (!closed) {
        recorder.stdin.write("stop\n");
        await completion;
      }
      await writeFile(resolve(out, "tablecast-record.log"), stdout + stderr);
    }
    // GUIと同じversion 2のprojectに、商品詳細の手動ズームを保存する。
    const project = z
      .object({
        version: z.literal(2),
        media: z.looseObject({ screenVideoPath: z.string() }),
        editor: z.looseObject({}),
      })
      .parse(JSON.parse(await readFile(rawProject, "utf8")));
    const { stdout: dimensions } = await run(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "json",
        project.media.screenVideoPath,
      ],
      commandOptions,
    );
    // このWindows/Chrome配置で実測したclient領域。異なるDPIを推測して切り抜かない。
    z.object({
      streams: z.tuple([z.object({ width: z.literal(1026), height: z.literal(850) })]),
    }).parse(JSON.parse(dimensions));
    const { stdout: original } = await run(
      openscreen,
      ["pack", rawProject, "--out", resolve(out, "original"), "--json"],
      commandOptions,
    );
    openScreenResult(original);
    // OpenScreen 1.11 CLIは素材寸法と旧cropを描画に渡さないため、正方画素の
    // 16:9へ余白を追加する。4:3のアプリ自体は引き伸ばさず、最後に余白を除く。
    const normalizedVideo = resolve(out, "tablecast-source-16x9.mp4");
    await run(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        project.media.screenVideoPath,
        "-vf",
        "crop=1024:768:1:81,scale=1440:1080,pad=1920:1080:240:0,setsar=1",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "18",
        normalizedVideo,
      ],
      commandOptions,
    );
    project.media.screenVideoPath = normalizedVideo;
    const captureStartedAtMs = Number(stderr.match(/"captureStartedAtMs":(\d+)/)?.[1]);
    if (!Number.isFinite(captureStartedAtMs)) throw new Error("録画の開始時刻がありません");
    const events = z
      .array(
        z.object({
          at: z.number(),
          x: z.number(),
          y: z.number(),
          cursorType: z.string(),
          interactionType: z.enum(["move", "click", "mouseup"]),
        }),
      )
      .parse(await page.evaluate("window.tablecastPointerEvents"));
    await writeFile(
      resolve(out, "tablecast-pointer-events.json"),
      JSON.stringify(
        {
          source: "Playwright-dispatched DOM pointer events",
          captureStartedAtMs,
          viewport: { width: 1024, height: 768 },
          events,
        },
        null,
        2,
      ),
    );
    await writeFile(
      `${normalizedVideo}.cursor.json`,
      JSON.stringify(
        {
          version: 2,
          provider: "none",
          assets: [],
          provenance:
            "Actual browser pointer events dispatched by Playwright; not OS cursor telemetry",
          samples: events
            .filter((event) => event.at >= captureStartedAtMs)
            .map((event) => ({
              timeMs: event.at - captureStartedAtMs,
              cx: (240 + (event.x / 1024) * 1440) / 1920,
              cy: event.y / 768,
              assetId: null,
              visible: true,
              cursorType: event.cursorType,
              interactionType: event.interactionType,
            })),
        },
        null,
        2,
      ),
    );
    Object.assign(project.editor, {
      padding: 0,
      borderRadius: 0,
      shadowIntensity: 0,
      autoZoomEnabled: false,
      aspectRatio: "16:9",
      cropRegion: { x: 0, y: 0, width: 1, height: 1 },
      zoomRegions: [
        {
          id: "tablecast-product-detail",
          startMs: 2800,
          endMs: 6500,
          depth: 2,
          focus: { cx: 0.5, cy: 0.5 },
          focusMode: "manual",
          source: "manual",
        },
      ],
    });
    const editProject = resolve(out, "tablecast-edit.openscreen");
    await writeFile(editProject, JSON.stringify(project, null, 2));
    const { stdout: packed } = await run(
      openscreen,
      ["pack", editProject, "--out", resolve(out, "portable"), "--json"],
      commandOptions,
    );
    openScreenResult(packed);
    const { stdout: exported } = await run(
      openscreen,
      ["export", editProject, "--out", resolve(out, "tablecast-openscreen.mp4"), "--json"],
      commandOptions,
    );
    openScreenResult(exported);
    await writeFile(resolve(out, "tablecast-export.log"), exported);
    await run(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        resolve(out, "tablecast-openscreen.mp4"),
        "-vf",
        "crop=1440:1080:240:0,fps=30,setsar=1",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "18",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        resolve(out, "tablecast-capture-check.mp4"),
      ],
      commandOptions,
    );
    console.info(`OK: 元録画 / 手動ズーム付きproject / 可搬化 / MP4書き出し\n${out}`);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "収録検査に失敗しました");
  process.exitCode = 1;
});
