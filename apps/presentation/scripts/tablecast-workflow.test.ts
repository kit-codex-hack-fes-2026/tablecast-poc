import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { readCaptureProject, projectSchema, root } from "./tablecast-project";
import { validatedPeakDb, videoPaths } from "./tablecast-video";
import {
  tablecastCaptureOrigin,
  tablecastHostArguments,
  readTablecastGuestCapture,
  tablecastCaptureStorageState,
} from "./tablecast-app-capture";
import { openscreenPath } from "./tablecast-openscreen.ts";
import { assertCaptureFrame } from "./tablecast-capture-types.ts";
import example from "../examples/tablecast-booking/project.json";
import shippedCapturePlan from "../capture-plan.json";
import { execFileSync } from "node:child_process";

const temporaryDirectories: string[] = [];

test.each([
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
])("固定cropの前に収録フレームを厳密に検査する: %o", (viewport) => {
  const frame = { width: viewport.width + 2, height: viewport.height + 82 };
  expect(() => assertCaptureFrame(frame, viewport)).not.toThrow();
  for (const delta of [-1, 1, 20]) {
    expect(() => assertCaptureFrame({ ...frame, width: frame.width + delta }, viewport)).toThrow(
      "実測済み配置と異なります",
    );
    expect(() => assertCaptureFrame({ ...frame, height: frame.height + delta }, viewport)).toThrow(
      "実測済み配置と異なります",
    );
  }
});

test("客の認証状態を設定しても店員・管理者へ流用せず、各役割の指定を要求する", () => {
  vi.stubEnv("TABLECAST_CAPTURE_STORAGE_STATE", "legacy-guest.json");
  vi.stubEnv("TABLECAST_CAPTURE_STORAGE_STATE_GUEST", ".local/guest.json");
  vi.stubEnv("TABLECAST_CAPTURE_STORAGE_STATE_STAFF", undefined);
  vi.stubEnv("TABLECAST_CAPTURE_STORAGE_STATE_ADMIN", undefined);
  expect(tablecastCaptureStorageState("guest")).toBe(resolve(root, "../../.local/guest.json"));
  expect(() => tablecastCaptureStorageState("staff")).toThrow(
    "TABLECAST_CAPTURE_STORAGE_STATE_STAFF",
  );
  expect(() => tablecastCaptureStorageState("admin")).toThrow(
    "TABLECAST_CAPTURE_STORAGE_STATE_ADMIN",
  );
  vi.stubEnv("TABLECAST_CAPTURE_STORAGE_STATE_STAFF", ".local/staff.json");
  expect(tablecastCaptureStorageState("staff")).toBe(resolve(root, "../../.local/staff.json"));
});

test("OpenScreenの明示指定を環境変数より優先し、未指定はOSの標準から解決する", () => {
  vi.stubEnv("TABLECAST_OPENSCREEN", "custom-openscreen");
  expect(openscreenPath()).toBe("custom-openscreen");
  expect(openscreenPath("explicit-openscreen")).toBe("explicit-openscreen");
  vi.stubEnv("TABLECAST_OPENSCREEN", undefined);
  vi.stubEnv("LOCALAPPDATA", undefined);
  expect(openscreenPath()).toBe("openscreen");
});

test("撮影前チェックが共有するdoctorをNodeのTS実行で読み込める", () => {
  expect(() =>
    execFileSync(
      "node",
      ["--input-type=module", "-e", "await import('./scripts/tablecast-doctor.ts')"],
      {
        cwd: root,
        windowsHide: true,
        timeout: 10000,
      },
    ),
  ).not.toThrow();
});

test("有音動画の検査はFFmpegが報告するデジタル無音・ピーク超過・測定失敗を拒否する", () => {
  // anullsrcを実際にvolumedetectへ渡すとmax_volumeは-91.0 dBになる。
  for (const log of ["max_volume: -91.0 dB", "max_volume: 0.0 dB", "max_volume: -inf dB", ""])
    expect(() => validatedPeakDb(log)).toThrow("音声が無音またはピークを超えています");
  expect(validatedPeakDb("[Parsed_volumedetect_0] max_volume: -1.2 dB")).toBe(-1.2);
  expect(validatedPeakDb("max_volume: -90.3 dB")).toBe(-90.3);
});
beforeEach(() => {
  vi.stubEnv("TABLECAST_PRESENTATION_PROJECT", undefined);
  vi.stubEnv("TABLECAST_PRESENTATION_CAPTURE_PLAN", undefined);
  vi.stubEnv("TABLECAST_GUEST_CAPTURE_EVENTS", undefined);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function temporaryJson(name: string, value: unknown) {
  const directory = await mkdtemp(join(tmpdir(), "tablecast-capture-input-"));
  temporaryDirectories.push(directory);
  const file = join(directory, name);
  await writeFile(file, JSON.stringify(value));
  return file;
}

test.each([undefined, "projects/tablecast-main-rerecord.json"])(
  "既定台本の指定=%sで同梱の撮影定義を読み、採用済み台本へ書き込まない",
  async (file) => {
    vi.stubEnv("TABLECAST_PRESENTATION_PROJECT", file);
    const original = await readFile(resolve(root, "projects/tablecast-main-rerecord.json"));
    const project = await readCaptureProject();
    for (const [sceneId, capture] of Object.entries(shippedCapturePlan))
      expect(project.scenes.find((scene) => scene.id === sceneId)?.capture).toMatchObject(capture);
    expect(await readFile(resolve(root, "projects/tablecast-main-rerecord.json"))).toEqual(
      original,
    );
  },
);

test.each(["absolute", "relative"])("撮影定義の明示指定（%s）を優先する", async (kind) => {
  const file = await temporaryJson("capture-plan.json", {
    "consult-answer": { ...shippedCapturePlan["consult-answer"], intent: "明示した撮影対象" },
  });
  vi.stubEnv(
    "TABLECAST_PRESENTATION_CAPTURE_PLAN",
    kind === "absolute" ? file : relative(root, file),
  );
  const project = await readCaptureProject();
  expect(project.scenes.find((scene) => scene.id === "consult-answer")?.capture?.intent).toBe(
    "明示した撮影対象",
  );
});

test("店員収録は客側イベントの未指定を拒否し、古いテイクを自動使用しない", async () => {
  await expect(readTablecastGuestCapture()).rejects.toThrow("TABLECAST_GUEST_CAPTURE_EVENTS");
});

test.each(["absolute", "relative"])(
  "店員収録へ指定した新しい客側テイク（%s）を渡す",
  async (kind) => {
    const result = { sessionId: "tablecast-new-session", orders: [{ id: "tablecast-new-order" }] };
    const file = await temporaryJson("tablecast-events.json", {
      audioStartedAt: 1,
      pointer: [],
      result,
    });
    vi.stubEnv(
      "TABLECAST_GUEST_CAPTURE_EVENTS",
      kind === "absolute" ? file : relative(resolve(root, "../.."), file),
    );
    expect((await readTablecastGuestCapture()).result).toEqual(result);
  },
);

test.each([undefined, { sessionId: "tablecast-new-session", orders: [] }])(
  "店員収録は確定注文のない客側結果=%jを拒否する",
  async (result) => {
    const file = await temporaryJson("tablecast-events.json", {
      audioStartedAt: 1,
      pointer: [],
      result,
    });
    vi.stubEnv("TABLECAST_GUEST_CAPTURE_EVENTS", file);
    await expect(readTablecastGuestCapture()).rejects.toThrow(
      "確定注文を含む客側収録の結果が必要です",
    );
  },
);

test("別題材の台本と同じフォルダの撮影定義を読み、注文場面を要求しない", async () => {
  vi.stubEnv("TABLECAST_PRESENTATION_PROJECT", "examples/tablecast-booking/project.json");
  const project = await readCaptureProject();
  expect(project.brand?.name).toBe("BookFlow");
  expect(project.scenes.map((s) => s.id)).toEqual(["booking-intro", "booking-flow"]);
});

test("場面の参照間違いと既存動画名・親参照への書き出しを拒否する", () => {
  expect(() => videoPaths("technical", ["technical"])).toThrow("--name");
  expect(() => videoPaths("../product", [])).toThrow("--name");
  expect(videoPaths("tablecast-booking-v1", ["demo"]).output).toBe("output/tablecast-booking-v1");
  expect(
    projectSchema.safeParse({ ...example, films: { demo: { scenes: ["missing"] } } }).success,
  ).toBe(false);
});

test("別worktreeの撮影originを使い、資格情報やパス付きURLを拒否する", () => {
  vi.stubEnv("TABLECAST_CAPTURE_ORIGIN", "http://review.tablecast-poc.container.localhost:3000");
  expect(tablecastCaptureOrigin()).toBe("http://review.tablecast-poc.container.localhost:3000");
  expect(tablecastCaptureOrigin("http://127.0.0.1:4567")).toBe("http://127.0.0.1:4567");
  expect(tablecastHostArguments()).toEqual([
    "--host-resolver-rules=MAP review.tablecast-poc.container.localhost 127.0.0.1",
  ]);
  vi.stubEnv("TABLECAST_CAPTURE_ORIGIN", "http://127.0.0.1:4567");
  expect(tablecastHostArguments()).toEqual([]);
  for (const url of [
    "file:///tmp",
    "https://user:pass@example.test",
    "https://example.test/path",
  ]) {
    vi.stubEnv("TABLECAST_CAPTURE_ORIGIN", url);
    expect(() => tablecastCaptureOrigin()).toThrow("HTTP origin");
  }
});
