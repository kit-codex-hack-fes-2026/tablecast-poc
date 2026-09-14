import { test, expect, vi } from "vitest";
import { cursorAt, copyCursorAssets } from "./tablecast-cursor";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const events = [
  { at: 100, x: 10, y: 20, cursorType: "arrow", interactionType: "move" as const },
  { at: 1100, x: 100, y: 200, cursorType: "arrow", interactionType: "move" as const },
  { at: 1200, x: 150, y: 220, cursorType: "pointer", interactionType: "click" as const },
  { at: 1300, x: 150, y: 220, cursorType: "pointer", interactionType: "mouseup" as const },
];
test("操作前後だけを表示し、待機中の手や矢印を残さない", () => {
  expect(cursorAt(events, 500)).toBeNull();
  expect(cursorAt(events, 1150)).toMatchObject({ x: 125, y: 210, type: "arrow" });
  expect(cursorAt(events, 1200)).toMatchObject({ x: 150, y: 220, type: "pointer" });
  expect(cursorAt(events, 1500)?.type).toBe("pointer");
  expect(cursorAt(events, 1600)).toBeNull();
  expect(
    cursorAt(
      [...events, { at: 4000, x: 150, y: 220, cursorType: "pointer", interactionType: "click" }],
      3450,
    ),
  ).toBeNull();
});

test.each([false, true])(
  "別のOpenScreen保存先からカーソル2種を取得する（専用指定=%s）",
  async (override) => {
    const directory = await mkdtemp(join(tmpdir(), "tablecast-cursors-"));
    try {
      const installation = join(directory, "portable-openscreen");
      const resources = override
        ? join(directory, "cursor-art")
        : join(installation, "resources/cursors/default");
      const out = join(directory, "output");
      await mkdir(resources, { recursive: true });
      await mkdir(out);
      vi.stubEnv("LOCALAPPDATA", join(directory, "unused-default"));
      vi.stubEnv("TABLECAST_OPENSCREEN", join(installation, "Openscreen.exe"));
      vi.stubEnv("TABLECAST_OPENSCREEN_CURSORS", override ? resources : undefined);
      for (const type of ["arrow", "pointer"])
        await writeFile(join(resources, `${type}.png`), `${type}-fixture`);
      await copyCursorAssets(out);
      for (const type of ["arrow", "pointer"])
        expect(await readFile(join(out, `tablecast-cursor-${type}.png`), "utf8")).toBe(
          `${type}-fixture`,
        );
    } finally {
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
