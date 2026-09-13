import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { projectSchema, root, type Project } from "./tablecast-project";

test("@product 全表示形式をCLIで生成し、宣言した画像・録画・見出しをブラウザーへ渡す", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const source = projectSchema.parse(
    JSON.parse(await readFile(resolve(root, "projects/tablecast-main-rerecord.json"), "utf8")),
  );
  const base = source.scenes[0];
  const board = source.scenes.find((scene) => scene.technical)?.technical;
  if (!base || !board?.focus[0]) throw new Error("導入と技術図が必要です");
  const make = (
    id: string,
    kind: Project["scenes"][number]["kind"],
  ): Project["scenes"][number] => ({
    ...base,
    id,
    kind,
    duration: 6,
    title: id,
    titleLines: ["検証用の見出し", "2行目も表示"],
    images: undefined,
    points: ["説明1", "説明2"],
    cues: [{ id: `${id}-cue`, at: 0, text: "表示契約の検証", voice: false, speaker: "narrator" }],
  });
  const scenes = [
    make("text-title", "title"),
    make("image-title", "title"),
    make("recording", "demo"),
    make("plain-flow", "flow"),
    make("diagram-flow", "flow"),
    make("source-list", "result"),
    make("text-result", "result"),
    make("image-result", "result"),
    make("technical-flow", "flow"),
  ];
  const [text, image, demo, flow, diagram, tree, result, recap, technical] = scenes;
  if (!text || !image || !demo || !flow || !diagram || !tree || !result || !recap || !technical)
    throw new Error("表示形式が必要です");
  image.images = ["assets/images/tablecast-main-guest.png"];
  demo.duration = undefined;
  demo.role = "customer";
  demo.device = "ipad";
  demo.media = {
    file: "assets/demo/tablecast-main-rerecord-english-v1.mp4",
    offset: 0,
    duration: 6,
  };
  flow.points = ["手順1", "手順2", "手順3", "分岐4"];
  diagram.points = [];
  diagram.diagram = {
    columns: Array.from({ length: 4 }, (_, n) => ({
      title: `列${n}`,
      nodes: [{ id: `node-${n}`, label: "要素", detail: "説明", meta: "出典" }],
    })),
    links: [],
    focus: [{ cue: "diagram-flow-cue", offset: 0, targets: ["node-0"], title: "注目" }],
    note: "模式図",
  };
  tree.sourceTree = [{ path: "README.md", detail: "説明書", depth: 0 }];
  recap.images = [
    "assets/images/tablecast-main-guest.png",
    "assets/images/tablecast-main-staff.png",
    "assets/images/tablecast-main-admin.png",
  ];
  recap.points = ["客", "店員", "管理者"];
  technical.points = [];
  technical.technical = {
    ...board,
    focus: [{ ...board.focus[0], cue: "technical-flow-cue", offset: 0 }],
  };
  const name = `tablecast-contract-${randomUUID()}`;
  await mkdir(info.outputPath(), { recursive: true });
  const input = info.outputPath("project.json");
  await writeFile(
    input,
    JSON.stringify({ ...source, soundtrack: undefined, films: undefined, scenes }),
  );
  await promisify(execFile)(
    "bun",
    ["--no-env-file", "scripts/tablecast-build.ts", "--out", `dist/${name}`],
    {
      cwd: root,
      env: { ...process.env, TABLECAST_PRESENTATION_PROJECT: input },
      windowsHide: true,
      timeout: 60000,
    },
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(pathToFileURL(resolve(root, "dist", name, "index.html")).href);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.locator("section.scene").count()).toBe(9);
  await expect(page.locator("#scene-image-title img")).toHaveCount(1);
  await expect(page.locator("#scene-image-result .recap-shot img")).toHaveCount(3);
  await expect(page.locator("#scene-recording-video")).toHaveAttribute("src", demo.media.file);
  await expect(page.locator("#scene-plain-flow li")).toHaveCount(4);
  await expect(page.locator("#scene-diagram-flow .diagram-column")).toHaveCount(4);
  await expect(page.locator("#scene-source-list .source-row")).toHaveCount(1);
  await expect(page.locator("#scene-technical-flow .tech-panel")).toHaveCount(board.panels.length);
  for (const id of [
    "text-title",
    "recording",
    "plain-flow",
    "diagram-flow",
    "source-list",
    "text-result",
    "technical-flow",
  ])
    await expect(page.locator(`#scene-${id} h1, #scene-${id} h2`).first()).toHaveText(
      "検証用の見出し2行目も表示",
    );
  const timing = z
    .object({ duration: z.number(), scenes: z.array(z.object({ id: z.string() })) })
    .parse(JSON.parse(await readFile(resolve(root, "dist", name, "timing.json"), "utf8")));
  for (const time of [0, 12, 24, 42, 43, 44, 45, 48, 53.9])
    await page.evaluate((at) => {
      const timelines = Reflect.get(window, "__timelines");
      if (!timelines.tablecast) throw new Error("生成タイムラインがありません");
      timelines.tablecast.seek(at);
    }, time);
  for (const [point, at] of [42.4, 43.3, 44.2].entries()) {
    await page.evaluate((time) => {
      const timeline = Reflect.get(window, "__timelines").tablecast;
      if (!timeline) throw new Error("生成タイムラインがありません");
      timeline.seek(time);
    }, at);
    await expect(page.locator(`#scene-image-result-shot-${point}`)).toHaveCSS("opacity", "1");
  }
  expect(timing.scenes).toHaveLength(9);
  expect(timing.duration).toBe(54);
  expect(errors).toEqual([]);
});
