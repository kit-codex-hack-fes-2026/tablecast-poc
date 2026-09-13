import { expect, test } from "vitest";
import current from "../projects/tablecast-main-rerecord.json";
import { projectSchema, type Project } from "./tablecast-project";
import { recordingEdits } from "./tablecast-edit-plan";
import { zoomRegions } from "./tablecast-zoom";

test("現行台本の日本語・英語テイクを各1回選び、全客側カットを残す", () => {
  const project = projectSchema.parse(current);
  const edits = recordingEdits(project, ["customer"]);
  expect(edits.map((edit) => edit.media.file)).toEqual([
    "assets/demo/tablecast-main-rerecord-guest-v5.mp4",
    "assets/demo/tablecast-main-rerecord-english-v1.mp4",
  ]);
  expect(edits[0]?.scenes.map((scene) => scene.id)).toEqual([
    "roles",
    "consult",
    "consult-answer",
    "voice-order",
    "order-added",
    "readback",
    "approval",
    "approval-result",
    "pause",
  ]);
  expect(edits[1]?.scenes.map((scene) => scene.id)).toEqual(["english"]);
});

function staffProject(): Project {
  const project = projectSchema.parse(current);
  const staff = project.scenes.find((scene) => scene.id === "staff");
  if (!staff?.media) throw new Error("店員の素材が必要です");
  staff.media.zoom = {
    mode: "detail",
    reason: "注文を読む",
    cue: staff.cues[0]?.id ?? "missing",
    offset: 1,
    target: { label: "注文", x: 0.2, y: 0.2, width: 0.3, height: 0.2 },
  };
  const later = structuredClone(staff);
  if (!later.media) throw new Error("店員の素材が必要です");
  later.id = "staff-later";
  later.media.offset = 30;
  later.media.duration = 10;
  return { ...project, films: undefined, scenes: [later, staff] };
}

test("同じ店舗録画の複数カットは台本の並びに関係なく全ズームと最長尺を保持する", () => {
  const [edit, duplicate] = recordingEdits(staffProject(), ["staff", "admin"]);
  expect(duplicate).toBeUndefined();
  if (!edit) throw new Error("編集が必要です");
  expect(edit.end).toBe(40);
  expect(edit.scenes).toHaveLength(2);
  expect(
    zoomRegions(edit.scenes, { x: 765, y: 118, width: 390, height: 844 }, edit.sourceTrim).map(
      (region) => region.id,
    ),
  ).toEqual(["tablecast-staff", "tablecast-staff-later"]);
});

test.each([
  [
    "編集元",
    (scene: Project["scenes"][number]) => {
      if (scene.media) scene.media.project = "assets/openscreen/other/tablecast-edit.openscreen";
    },
  ],
  [
    "端末",
    (scene: Project["scenes"][number]) => {
      scene.device = "macbook";
    },
  ],
  [
    "先頭カット",
    (scene: Project["scenes"][number]) => {
      scene.capture = undefined;
    },
  ],
  [
    "別役割",
    (scene: Project["scenes"][number]) => {
      scene.role = "customer";
    },
  ],
  [
    "出力先衝突",
    (scene: Project["scenes"][number]) => {
      if (scene.media) scene.media.file = "assets/demo/other.mp4";
    },
  ],
] as const)("同じ録画の%sが矛盾する編集は開始しない", (_, mutate) => {
  const project = staffProject();
  const scene = project.scenes[0];
  if (!scene) throw new Error("場面が必要です");
  mutate(scene);
  expect(() => recordingEdits(project, ["staff", "admin"])).toThrow(/編集|素材|録画/);
});

test("編集対象外の役割が使う素材フォルダにも上書きしない", () => {
  const project = staffProject();
  const other = project.scenes[0];
  if (!other?.media) throw new Error("場面が必要です");
  other.role = "customer";
  other.media.file = "assets/demo/other.mp4";
  expect(() => recordingEdits(project, ["staff", "admin"])).toThrow("別の素材");
});

test.each(["missing", "empty", "audio", "device"])("編集できない入力%sを成功扱いしない", (kind) => {
  const project = staffProject();
  const scene = project.scenes[0];
  if (!scene?.media) throw new Error("場面が必要です");
  if (kind === "missing") scene.media.project = undefined;
  if (kind === "empty") project.scenes = [];
  if (kind === "audio") scene.media.audio = true;
  if (kind === "device") scene.device = undefined;
  expect(() => recordingEdits(project, ["staff", "admin"])).toThrow(/編集|素材|録画/);
});
