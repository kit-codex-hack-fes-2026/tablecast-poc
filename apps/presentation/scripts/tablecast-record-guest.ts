// 合成店舗の認証済み端末を収録する明示実行用。音声APIを実際に呼び出す。
import { chromium, type Locator } from "@playwright/test";
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  tablecastCaptureOrigin,
  tablecastCaptureStorageState,
  tablecastHostArguments,
  waitForTablecastState,
} from "./tablecast-app-capture.ts";
import { captureBrowserAudio } from "./tablecast-browser-audio.ts";
import { captureBrowserPointer, recordedTable } from "./tablecast-capture-types.ts";
import { openscreenPath, pinWindowTitle } from "./tablecast-openscreen.ts";
import { readCaptureProject } from "./tablecast-project.ts";
import { saveAcceptedGuestCapture } from "./tablecast-record-guest/evidence.ts";
import { saveRejectedGuestCapture } from "./tablecast-record-guest/rejected.ts";
import { guestSpeech } from "./tablecast-record-guest/speech.ts";
import { captureShot, type ShotEvidence } from "./tablecast-shot.ts";

const root = resolve(import.meta.dirname, "../../..");
const storageState = tablecastCaptureStorageState("guest");
const englishOnly = process.argv[3] === "english";
if (process.argv[3] && !englishOnly) throw new Error("部分収録は english を指定してください");
const out = resolve(
  root,
  "apps/presentation/assets/openscreen",
  process.argv[2] ?? `tablecast-guest-${Date.now()}`,
);
const origin = tablecastCaptureOrigin();
const openscreen = openscreenPath();
await mkdir(out, { recursive: false });
const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
  args: [
    "--window-size=1040,900",
    "--window-position=25,25",
    "--allow-loopback-in-peer-connection",
    ...tablecastHostArguments(),
    "--autoplay-policy=no-user-gesture-required",
  ],
});
let recorder: ChildProcessWithoutNullStreams | undefined;
let completion: Promise<null | number> | undefined;
let stdout = "",
  stderr = "";
let recordingClosed = false;
let voiceStarted = false;
try {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    storageState,
  });
  await context.addInitScript(captureBrowserAudio);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  // SSR表示だけで始めず、クライアントの操作が有効になるまで待つ。
  await page.getByRole("tab", { name: "おしながき", exact: true }).click();
  // この合成来店の状態を確認し、既存の注文かごに追加してしまわない。
  const readTable = async () =>
    recordedTable.parse(
      await page.evaluate(async () => {
        const response = await fetch("/api/table");
        if (!response.ok) throw new Error("来店の取得に失敗しました");
        const data: unknown = await response.json();
        return data;
      }),
    );
  const before = await readTable();
  const initial = {
    tableName: before.tableName,
    tableId: before.tableId,
    sessionId: before.id,
    orders: before.orders.length,
    cart: before.cart.lines.length,
  };
  if (initial.cart !== 0 || initial.orders !== (englishOnly ? 1 : 0))
    throw new Error(
      englishOnly ? "確定注文1件・空の注文かごの合成来店が必要です" : "空の合成来店が必要です",
    );
  console.info(`確認: 注文かご0件 / 注文${initial.orders}件`);
  await page.evaluate(captureBrowserPointer);
  await page.evaluate(() => {
    window.tablecastScreenEvents = [];
    let previous = "";
    setInterval(() => {
      const text = document.body.innerText;
      if (text !== previous) {
        window.tablecastScreenEvents.push({ at: Date.now(), text });
        previous = text;
      }
    }, 250);
  });
  const click = async (locator: Locator) => {
    const box = await locator.boundingBox();
    if (!box) throw new Error("収録対象の操作位置がありません");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 });
    await locator.click({ delay: 120 });
  };
  const title = `TableCast guest final ${Date.now()}`;
  await page.evaluate(pinWindowTitle, title);
  await page.bringToFront();
  const audioStartedAt = await page.evaluate(() => window.tablecastCapture.start());
  recorder = spawn(
    openscreen,
    [
      "record",
      "--window",
      title,
      "--duration",
      englishOnly ? "90" : "300",
      "--project",
      resolve(out, "tablecast-raw.openscreen"),
      "--json",
    ],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );
  recorder.stdout.on("data", (data: Buffer) => {
    stdout += data.toString();
  });
  recorder.stderr.on("data", (data: Buffer) => {
    stderr += data.toString();
  });
  completion = new Promise((accept, reject) => {
    if (!recorder) {
      reject(new Error("録画プロセスがありません"));
      return;
    }
    recorder.once("error", reject);
    recorder.once("close", (code) => {
      recordingClosed = true;
      accept(code);
    });
  });
  const deadline = Date.now() + 45000;
  while (!stdout.includes("Recording started")) {
    if (recordingClosed || Date.now() > deadline) throw new Error("録画開始を確認できません");
    await sleep(100);
  }
  const plan = await readCaptureProject();
  await writeFile(resolve(out, "tablecast-capture-plan.json"), JSON.stringify(plan, null, 2));
  const shots: ShotEvidence[] = [];
  const shoot = async (id: string) => {
    if (recordingClosed) throw new Error("必要な場面を撮る前に録画が終了しました");
    const scene = plan.scenes.find((item) => item.id === id);
    if (!scene?.capture) throw new Error(`撮影定義がありません: ${id}`);
    shots.push(
      await captureShot(page, id, scene.capture, out, (state) =>
        waitForTablecastState(page, state),
      ),
    );
    if (recordingClosed) throw new Error("必要な表示時間の途中で録画が終了しました");
    console.info(`撮影条件を確認: ${id}`);
  };
  const marks: { at: number; id: string }[] = [];
  const mark = (id: string) => {
    const value = { id, at: Date.now() };
    marks.push(value);
    console.info(id);
  };
  await page.mouse.move(120, 660);
  mark("overview");
  await page.screenshot({ path: resolve(out, "tablecast-overview.png") });
  await sleep(6500);
  await click(page.getByRole("tab", { name: /注文かご/ }));
  mark("voice-start");
  await click(page.getByRole("button", { name: /音声を(再開|開始)/ }));
  voiceStarted = true;
  await page
    .getByText("お話をうかがっています", { exact: true })
    .first()
    .waitFor({ timeout: 45000 });
  // 端末の接続表示はAgentの初期化より先に出る。応答用トラックの購読まで待つ。
  const waitForAgentAudio = () =>
    page.waitForFunction(
      () =>
        [...document.querySelectorAll("audio")].some(
          (element) =>
            element.srcObject instanceof MediaStream &&
            element.srcObject.getAudioTracks().some((track) => track.readyState === "live"),
        ),
      undefined,
      { timeout: 60000 },
    );
  await waitForAgentAudio();
  const speak = guestSpeech({
    page,
    root,
    out,
    readTable,
    mark,
    shoot,
    audioStartedAt,
    initial,
    marks,
    shots,
  });
  if (!englishOnly) {
    await speak("consult");
    await speak("order");
    const cart = (await readTable()).cart.lines.length;
    if (cart !== 1) throw new Error("音声注文が1件の注文かごになっていません");
    mark("pause");
    await click(page.getByRole("button", { name: "音声を停止", exact: true }));
    await click(page.getByRole("tab", { name: /注文かご/ }));
    await page.getByText("音声は停止中です", { exact: true }).first().waitFor();
    await shoot("pause");
    await sleep(3500);
    mark("resume");
    await click(page.getByRole("button", { name: "音声を再開", exact: true }));
    await page
      .getByText("お話をうかがっています", { exact: true })
      .first()
      .waitFor({ timeout: 45000 });
    await waitForAgentAudio();
    const resumedCart = (await readTable()).cart.lines.length;
    if (resumedCart !== 1) throw new Error("再開後に注文かごが維持されていません");
    await speak("confirm");
    await shoot("approval");
    await speak("approve");
  }
  const after = await readTable();
  const result = {
    sessionId: after.id,
    tableId: after.tableId,
    tableName: after.tableName,
    orders: after.orders,
    cart: after.cart,
  };
  if (result.orders.length !== 1 || result.cart.lines.length !== 0)
    throw new Error("注文確定の結果が期待と違います");
  await speak("english");
  mark("final-stop");
  await click(page.getByRole("button", { name: "音声を停止", exact: true }));
  await sleep(3000);
  voiceStarted = false;
  const audio = await page.evaluate(() => window.tablecastCapture.stop());
  await writeFile(resolve(out, "tablecast-audio.webm"), Buffer.from(audio, "base64"));
  const telemetry = await page.evaluate(() => ({
    pointer: window.tablecastPointerEvents,
    screen: window.tablecastScreenEvents,
    speech: window.tablecastCapture.events,
  }));
  await writeFile(
    resolve(out, "tablecast-events.json"),
    JSON.stringify(
      {
        source: "Actual Playwright-dispatched browser events and real app responses",
        viewport: { width: 1024, height: 768 },
        audioStartedAt,
        initial,
        result,
        marks,
        shots,
        appEvents: (await readTable()).events,
        ...telemetry,
      },
      null,
      2,
    ),
  );
  recorder.stdin.write("stop\n");
  if ((await completion) !== 0) throw new Error("OpenScreen録画が異常終了しました");
  await saveAcceptedGuestCapture(out, openscreen, stderr, shots);
} catch (error) {
  await saveRejectedGuestCapture(browser, out, error);
  throw error;
} finally {
  if (voiceStarted) {
    const page = browser.contexts()[0]?.pages()[0];
    if (page && !page.isClosed()) {
      const stop = page.getByRole("button", { name: "音声を停止", exact: true });
      try {
        if (await stop.isVisible()) await stop.click();
      } catch (error) {
        console.warn(
          "音声停止のUI操作に失敗。録画を保存してブラウザーを終了します。",
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }
  if (recorder && !recordingClosed) {
    recorder.stdin.write("stop\n");
    await completion;
  }
  await writeFile(resolve(out, "tablecast-record.log"), stdout + stderr);
  await browser.close();
}
