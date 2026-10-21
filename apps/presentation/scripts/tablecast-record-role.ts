import { openscreenPath, pinWindowTitle } from "./tablecast-openscreen.ts";
import {
  waitForTablecastState,
  tablecastCaptureOrigin,
  tablecastCaptureStorageState,
  tablecastHostArguments,
  readTablecastGuestCapture,
} from "./tablecast-app-capture.ts";
import { captureShot, bindShotZoom, type ShotEvidence } from "./tablecast-shot.ts";
import { zoomRegions } from "./tablecast-zoom.ts";
import { readProject, readCaptureProject, projectPath } from "./tablecast-project.ts";
import { composeCursor } from "./tablecast-cursor.ts";
// 合成店舗の店員・管理者画面を実操作し、OpenScreenでカーソルとズームを出力する。
import { chromium, type Locator } from "@playwright/test";
import { spawn, execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import {
  captureBrowserPointer,
  screenProject,
  videoDimensions,
  assertCaptureFrame,
} from "./tablecast-capture-types.ts";

const root = resolve(import.meta.dirname, "../../..");
const role = process.argv[2];
if (role !== "admin" && role !== "staff") throw new Error("admin または staff を指定してください");
const storageState = tablecastCaptureStorageState(role);
const name = role === "admin" ? "macbook-admin" : "iphone-staff";
const viewport = role === "admin" ? { width: 1440, height: 900 } : { width: 390, height: 844 };
const plan = await readCaptureProject();
const scene = plan.scenes.find((item) => item.role === role);
if (!scene?.capture || !scene.media) throw new Error("役割の撮影定義が必要です");
const capture = role === "staff" ? await readTablecastGuestCapture() : null;
const sessionId = capture?.result?.sessionId;
const out = resolve(
  root,
  "apps/presentation/assets/openscreen",
  process.argv[3] ?? `tablecast-${name}-${Date.now()}`,
);
await mkdir(out, { recursive: false });
const openscreen = openscreenPath();
const run = promisify(execFile);
const options = { windowsHide: true, timeout: 180000, maxBuffer: 8000000 };
const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
  args: [
    `--window-size=${viewport.width + 16},${viewport.height + 132}`,
    "--window-position=30,30",
    ...tablecastHostArguments(),
  ],
});
try {
  const page = await browser.newPage({
    viewport,
    storageState,
  });
  const store = encodeURIComponent(process.env.TABLECAST_CAPTURE_STORE ?? "tablecast-komorebi");
  const route =
    role === "admin"
      ? `/admin/stores/${store}/menu/products`
      : `/admin/stores/${store}/visits/${sessionId}`;
  await page.goto(tablecastCaptureOrigin() + route, {
    waitUntil: "domcontentloaded",
  });
  const target =
    role === "admin"
      ? page.getByRole("link", { name: "詳細", exact: true }).first()
      : page.getByRole("tab", { name: "カート・注文", exact: true });
  await target.waitFor();
  await page.screenshot({ path: resolve(out, "tablecast-before.png") });
  await writeFile(resolve(out, "tablecast-before.txt"), await page.locator("body").innerText());
  await page.evaluate(captureBrowserPointer);
  const click = async (locator: Locator) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error("操作対象の座標がありません");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
    await locator.click({ delay: 120 });
  };
  const title = `TableCast ${name} ${Date.now()}`;
  await page.evaluate(pinWindowTitle, title);
  await page.bringToFront();
  const rawProject = resolve(out, "tablecast-raw.openscreen");
  const recorder = spawn(
    openscreen,
    ["record", "--window", title, "--duration", "30", "--project", rawProject, "--json"],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );
  let stdout = "",
    stderr = "",
    closed = false;
  recorder.stdout.on("data", (d: Buffer) => {
    stdout += d.toString();
  });
  recorder.stderr.on("data", (d: Buffer) => {
    stderr += d.toString();
  });
  const completion = new Promise<number | null>((accept, reject) => {
    recorder.once("error", reject);
    recorder.once("close", (code) => {
      closed = true;
      accept(code);
    });
  });
  let shot: ShotEvidence | undefined;
  try {
    const deadline = Date.now() + 45000;
    while (!stdout.includes("Recording started")) {
      if (closed || Date.now() > deadline) throw new Error("収録を開始できません");
      await sleep(100);
    }
    console.info(name, "収録開始");
    await page.mouse.move(viewport.width * 0.5, viewport.height * 0.8);
    await sleep(2200);
    await click(target);
    await sleep(2200);
    if (role === "staff") {
      const accept = page.getByRole("button", { name: "注文を受け付ける", exact: true });
      await accept.waitFor();
      await click(accept);
      await page.getByText("受付済み", { exact: true }).waitFor();
    }
    shot = await captureShot(page, scene.id, scene.capture, out, (state) =>
      waitForTablecastState(page, state),
    );
    if (closed) throw new Error("撮影条件の成立前に録画が終了しました");
    await sleep(1800);
    await page.screenshot({ path: resolve(out, "tablecast-after.png") });
    await writeFile(resolve(out, "tablecast-after.txt"), await page.locator("body").innerText());
    recorder.stdin.write("stop\n");
    if ((await completion) !== 0) throw new Error("収録に失敗しました");
  } finally {
    if (!closed) {
      recorder.stdin.write("stop\n");
      await completion;
    }
    await writeFile(resolve(out, "tablecast-record.log"), stdout + stderr);
  }
  const captureStartedAtMs = Number(stderr.match(/"captureStartedAtMs":(\d+)/)?.[1]);
  if (!Number.isFinite(captureStartedAtMs)) throw new Error("開始時刻がありません");
  const pointer = await page.evaluate(() => window.tablecastPointerEvents);
  await writeFile(
    resolve(out, "tablecast-events.json"),
    JSON.stringify(
      {
        source: "Actual Playwright-dispatched DOM pointer events",
        viewport,
        route,
        captureStartedAtMs,
        pointer,
        shots: [shot],
        orderId: capture?.result?.orders[0]?.id,
      },
      null,
      2,
    ),
  );
  const project = screenProject.parse(JSON.parse(await readFile(rawProject, "utf8")));
  const source = project.media.screenVideoPath;
  const dims = videoDimensions.parse(
    JSON.parse(
      (
        await run(
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
            source,
          ],
          options,
        )
      ).stdout,
    ),
  ).streams[0];
  assertCaptureFrame(dims, viewport);
  await run(openscreen, ["pack", rawProject, "--out", resolve(out, "original"), "--json"], options);
  const padX = (1920 - viewport.width) / 2,
    padY = (1080 - viewport.height) / 2;
  const normalized = resolve(out, "tablecast-source.mp4");
  await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      source,
      "-vf",
      `crop=${viewport.width}:${viewport.height}:1:81,pad=1920:1080:${padX}:${padY},setsar=1`,
      "-an",
      "-c:v",
      "libx264",
      "-g",
      "30",
      "-keyint_min",
      "30",
      "-sc_threshold",
      "0",
      "-crf",
      "17",
      "-preset",
      "fast",
      normalized,
    ],
    options,
  );
  await writeFile(
    `${normalized}.cursor.json`,
    JSON.stringify(
      {
        version: 2,
        provider: "none",
        assets: [],
        provenance: "Actual Playwright-dispatched DOM events; not OS cursor telemetry",
        samples: pointer
          .filter((e) => e.at >= captureStartedAtMs)
          .map((e) => ({
            timeMs: e.at - captureStartedAtMs,
            cx: (padX + e.x) / 1920,
            cy: (padY + e.y) / 1080,
            visible: true,
            assetId: null,
            cursorType: e.cursorType,
            interactionType: e.interactionType,
          })),
      },
      null,
      2,
    ),
  );
  if (!shot) throw new Error("撮影証跡がありません");
  const relativeOut = `assets/openscreen/${out.split(/[\\/]/).at(-1)}`;
  const media = scene.media;
  media.project = `${relativeOut}/tablecast-edit.openscreen`;
  media.file = `assets/demo/${out.split(/[\\/]/).at(-1)}.mp4`;
  media.shot = `${relativeOut}/tablecast-shot-${scene.id}.json`;
  media.offset = Math.max(0, (shot.readyAt - captureStartedAtMs) / 1000 - 1.8);
  media.duration = Math.max(
    media.duration,
    (shot.endAt - captureStartedAtMs) / 1000 - media.offset + 1.1,
  );
  bindShotZoom(scene, shot, captureStartedAtMs);
  project.media.screenVideoPath = await composeCursor(
    normalized,
    pointer,
    captureStartedAtMs,
    viewport,
    { x: padX, y: padY, ...viewport },
  );
  Object.assign(project.editor, {
    padding: 0,
    borderRadius: 0,
    shadowIntensity: 0,
    autoZoomEnabled: false,
    aspectRatio: "16:9",
    cropRegion: { x: 0, y: 0, width: 1, height: 1 },
    zoomRegions: zoomRegions(
      [scene],
      { x: padX, y: padY, width: viewport.width, height: viewport.height },
      0,
    ),
  });
  const edited = resolve(out, "tablecast-edit.openscreen");
  await writeFile(edited, JSON.stringify(project, null, 2));
  const exported = resolve(out, "tablecast-openscreen.mp4");
  const result = await run(openscreen, ["export", edited, "--out", exported, "--json"], options);
  await writeFile(resolve(out, "tablecast-export.log"), result.stdout + result.stderr);
  await run(openscreen, ["pack", edited, "--out", resolve(out, "portable"), "--json"], options);
  await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-i",
      exported,
      "-vf",
      `crop=${viewport.width}:${viewport.height}:${padX}:${padY},fps=30,setsar=1`,
      "-t",
      String(media.offset + media.duration),
      "-an",
      "-c:v",
      "libx264",
      "-g",
      "30",
      "-keyint_min",
      "30",
      "-sc_threshold",
      "0",
      "-crf",
      "17",
      "-preset",
      "fast",
      "-movflags",
      "+faststart",
      resolve(root, "apps/presentation", media.file),
    ],
    options,
  );
  const rawPlan = await readProject();
  const plannedScene = rawPlan.scenes.find((item) => item.id === scene.id);
  if (!plannedScene) throw new Error("撮影した場面が台本にありません");
  plannedScene.media = media;
  plannedScene.capture = scene.capture;
  await writeFile(
    resolve(out, "tablecast-take.json"),
    JSON.stringify({ status: "accepted", scenes: [scene.id] }, null, 2),
  );
  await writeFile(projectPath(), JSON.stringify(rawPlan, null, 2));
  console.info(name, "OpenScreen編集・書き出し完了");
} catch (error) {
  await writeFile(
    resolve(out, "tablecast-rejected.json"),
    JSON.stringify(
      { status: "rejected", reason: error instanceof Error ? error.message : String(error) },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
