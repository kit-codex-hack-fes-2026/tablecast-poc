import { afterEach, expect, test, vi } from "vitest";
import { readCaptureProject, projectSchema } from "./tablecast-project";
import { videoPaths } from "./tablecast-video";
import { tablecastCaptureOrigin, tablecastHostArguments } from "./tablecast-app-capture";
import example from "../examples/tablecast-booking/project.json";

afterEach(() => vi.unstubAllEnvs());

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
