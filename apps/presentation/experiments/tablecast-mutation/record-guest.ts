import {
  waitForTablecastState,
  tablecastCaptureOrigin,
  tablecastHostArguments,
} from "../../scripts/tablecast-app-capture.ts";
import { readCaptureProject } from "../../scripts/tablecast-project.ts";
import { captureShot, type ShotEvidence } from "../../scripts/tablecast-shot.ts";
import { z } from "zod";
// 合成店舗の認証済み端末を収録する明示実行用。音声APIを実際に呼び出す。
import { chromium, expect, type Locator } from "@playwright/test";
import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { captureBrowserAudio } from "../../scripts/tablecast-browser-audio.ts";
import {
  captureBrowserPointer,
  recordedTable,
  screenProject,
} from "../../scripts/tablecast-capture-types.ts";

const root = resolve(import.meta.dirname, "../../../..");
const englishOnly = process.argv[3] === "english";
if (process.argv[3] && !englishOnly) throw new Error("部分収録は english を指定してください");
const out = resolve(
  root,
  "apps/presentation/assets/openscreen",
  process.argv[2] ?? `tablecast-guest-${Date.now()}`,
);
const origin = tablecastCaptureOrigin();
const openscreen = resolve(process.env.LOCALAPPDATA ?? "", "Programs/Openscreen/Openscreen.exe");
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
let completion: Promise<number | null> | undefined;
let stdout = "",
  stderr = "";
let recordingClosed = false;
let voiceStarted = false;
try {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    storageState: resolve(
      root,
      process.env.TABLECAST_CAPTURE_STORAGE_STATE ?? ".local/tablecast-ipad-fresh-auth.json",
    ),
  });
  await context.addInitScript(captureBrowserAudio);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  // SSR表示だけで始めず、クライアントの操作が有効になるまで待つ。
  await page.getByRole("tab", { name: "商品を選ぶ", exact: true }).click();
  // この合成来店の状態を確認し、既存のご注文リストに追加してしまわない。
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
      englishOnly ? "確定注文1件・空のご注文リストの合成来店が必要です" : "空の合成来店が必要です",
    );
  console.info(`確認: ご注文リスト0件 / 注文${initial.orders}件`);
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
  await page.evaluate((windowTitle) => {
    document.title = windowTitle;
    new MutationObserver(() => {
      if (document.title !== windowTitle) document.title = windowTitle;
    }).observe(document.head, { childList: true, subtree: true, characterData: true });
  }, title);
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
  const marks: { id: string; at: number }[] = [];
  const mark = (id: string) => {
    const value = { id, at: Date.now() };
    marks.push(value);
    console.info(id);
  };
  await page.mouse.move(120, 660);
  mark("overview");
  await page.screenshot({ path: resolve(out, "tablecast-overview.png") });
  await sleep(6500);
  await click(page.getByRole("tab", { name: /ご注文リスト/ }));
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
  const speak = async (id: string) => {
    const base64 = (
      await readFile(resolve(root, "apps/presentation/assets/audio", `tablecast-input-${id}.wav`))
    ).toString("base64");
    const inputStartedAt = Date.now();
    mark(id);
    await page.evaluate((input) => window.tablecastCapture.speak(input.base64, input.id), {
      base64,
      id,
    });
    const sceneId = (
      {
        consult: "consult-answer",
        order: "order-added",
        confirm: "readback",
        approve: "approval-result",
      } as Record<string, string>
    )[id];
    if (sceneId && id !== "approve") await shoot(sceneId);
    await expect
      .poll(
        async () => {
          const { events } = z
            .object({
              events: z.array(
                z.object({
                  kind: z.string(),
                  createdAt: z.number(),
                  data: z.object({
                    turnId: z.string().optional(),
                    interrupted: z.boolean().optional(),
                  }),
                }),
              ),
            })
            .parse(await readTable());
          const turn = events.findLast(
            (event) => event.kind === "voice.user" && event.createdAt >= inputStartedAt,
          )?.data.turnId;
          return (
            !!turn &&
            events.some(
              (event) =>
                event.kind === "voice.assistant" &&
                event.data.turnId === turn &&
                !event.data.interrupted,
            ) &&
            (await page.locator("article[data-role=assistant][data-live=true]").count()) === 0
          );
        },
        { timeout: 60000, message: `${id}への実応答の再生完了` },
      )
      .toBe(true);
    await sleep(800);
    if (sceneId && id === "approve") await shoot(sceneId);
    mark(`${id}-end`);
    await page.screenshot({ path: resolve(out, `tablecast-${id}.png`) });
    await writeFile(resolve(out, `tablecast-${id}.txt`), await page.locator("body").innerText());
    await writeFile(
      resolve(out, "tablecast-audio.webm"),
      Buffer.from(await page.evaluate(() => window.tablecastCapture.dump()), "base64"),
    );
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
          marks,
          shots,
          appEvents: (await readTable()).events,
          ...telemetry,
        },
        null,
        2,
      ),
    );
  };
  if (!englishOnly) {
    await speak("consult");
    await speak("order");
    const cart = (await readTable()).cart.lines.length;
    if (cart !== 1) throw new Error("音声注文が1件のご注文リストになっていません");
    mark("pause");
    await click(page.getByRole("button", { name: "音声を停止", exact: true }));
    await click(page.getByRole("tab", { name: /ご注文リスト/ }));
    await page.getByText("音声は停止中です", { exact: true }).first().waitFor();
    await shoot("pause");
    mark("gui-review");
    await click(page.getByRole("tab", { name: "商品を選ぶ", exact: true }));
    await click(page.getByRole("button", { name: "リストを開いて確認へ", exact: true }));
    await expect(page.getByRole("tab", { name: /ご注文リスト/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("button", { name: "内容を照合する", exact: true })).toBeEnabled();
    if ((await readTable()).orders.length !== 0) throw new Error("リスト表示だけで注文されました");
    await sleep(2200);
    mark("gui-review-complete");
    mark("resume");
    await click(page.getByRole("button", { name: "音声を再開", exact: true }));
    await page
      .getByText("お話をうかがっています", { exact: true })
      .first()
      .waitFor({ timeout: 45000 });
    await waitForAgentAudio();
    const resumedCart = (await readTable()).cart.lines.length;
    if (resumedCart !== 1) throw new Error("再開後にご注文リストが維持されていません");
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
  const source = screenProject.parse(
    JSON.parse(await readFile(resolve(out, "tablecast-raw.openscreen"), "utf8")),
  );
  execFileSync(
    openscreen,
    ["pack", resolve(out, "tablecast-raw.openscreen"), "--out", resolve(out, "original"), "--json"],
    { windowsHide: true, timeout: 90000 },
  );
  const captureStartedAtMs = Number(stderr.match(/"captureStartedAtMs":(\d+)/)?.[1]);
  if (!Number.isFinite(captureStartedAtMs)) throw new Error("録画開始時刻がありません");
  const savedEvents = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(await readFile(resolve(out, "tablecast-events.json"), "utf8")));
  await writeFile(
    resolve(out, "tablecast-events.json"),
    JSON.stringify({ ...savedEvents, captureStartedAtMs }, null, 2),
  );
  await writeFile(
    resolve(out, "tablecast-take.json"),
    JSON.stringify({ status: "accepted", scenes: shots.map((shot) => shot.sceneId) }, null, 2),
  );
  console.info("保存完了: 実応答・注文結果・音声・操作時刻・OpenScreen元project", source.version);
} catch (error) {
  const page = browser.contexts()[0]?.pages()[0];
  if (page && !page.isClosed()) {
    await page.screenshot({ path: resolve(out, "tablecast-failure.png") });
    await writeFile(resolve(out, "tablecast-failure.txt"), await page.locator("body").innerText());
    const captured = await page.evaluate(async () => {
      if (!window.tablecastCapture?.startedAt) return null;
      return {
        audio: await window.tablecastCapture.dump(),
        events: {
          audioStartedAt: window.tablecastCapture.startedAt,
          speech: window.tablecastCapture.events,
          screen: window.tablecastScreenEvents,
          pointer: window.tablecastPointerEvents,
        },
      };
    });
    if (captured) {
      await writeFile(
        resolve(out, "tablecast-failure-audio.webm"),
        Buffer.from(captured.audio, "base64"),
      );
      await writeFile(
        resolve(out, "tablecast-failure-events.json"),
        JSON.stringify(captured.events, null, 2),
      );
    }
  }
  await writeFile(
    resolve(out, "tablecast-rejected.json"),
    JSON.stringify(
      { status: "rejected", reason: error instanceof Error ? error.message : String(error) },
      null,
      2,
    ),
  );
  console.error(
    "撮影条件を満たさず不採用。録画の保存終了を待ちます。",
    error instanceof Error ? error.message : String(error),
  );
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
