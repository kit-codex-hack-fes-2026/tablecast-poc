import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { projectSchema, root, type Project } from "./tablecast-project";

test("@technical 強調の初期状態・短い切替・再選択を順再生と逆seekで再現する", async ({
  page,
}, info) => {
  const source = projectSchema.parse(
    JSON.parse(await readFile(resolve(root, "projects/tablecast-main-rerecord.json"), "utf8")),
  );
  const scene = source.scenes.find((item) => item.id === "tech-order");
  const board = scene?.technical;
  const [first, second] = board?.connections ?? [];
  const [panel, nextPanel] = board?.panels ?? [];
  if (!scene || !board || !first || !second || !panel || !nextPanel)
    throw new Error("切替を検証する技術図が必要です");
  const focus = [
    { offset: 0.7, targets: [first.id] },
    { offset: 0.8, targets: [second.id] },
    { offset: 0.9, targets: [panel.id] },
    { offset: 1, targets: [nextPanel.id] },
    { offset: 1.1, targets: [first.id, panel.id] },
  ];
  const name = `tablecast-focus-${randomUUID()}`;
  await mkdir(info.outputPath(), { recursive: true });
  const input = info.outputPath("project.json");
  await writeFile(
    input,
    JSON.stringify({
      ...source,
      soundtrack: undefined,
      films: undefined,
      scenes: [
        {
          ...scene,
          duration: 3,
          cues: [{ id: "focus-cue", at: 0, text: "強調の検証", voice: false }],
          technical: {
            ...board,
            focus: focus.map((f) => ({ ...f, cue: "focus-cue", summary: f.targets.join(" / ") })),
          },
        },
      ],
    }),
  );
  await promisify(execFile)(
    "bun",
    ["--no-env-file", "scripts/tablecast-build.ts", "--out", `dist/${name}`],
    {
      cwd: root,
      env: { ...process.env, TABLECAST_PRESENTATION_PROJECT: input },
      windowsHide: true,
    },
  );
  const url = pathToFileURL(resolve(root, "dist", name, "index.html")).href;
  const samples = [0, 0.65, 0.75, 0.85, 0.95, 1.05, 1.15, 1.8, 2.9];
  // 連続したフレーム、戻りseek、読み直して任意時刻へ直接seekの3経路を比較する。
  for (const direct of [false, true]) {
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    for (const at of direct ? samples : [...samples, ...samples.toReversed()]) {
      if (direct) {
        await page.reload();
        await page.evaluate(() => document.fonts.ready);
      }
      const actual = await page.evaluate(
        ({ time, stepped }) => {
          const timeline = window["__timelines"].tablecast;
          if (!timeline) throw new Error("タイムラインがありません");
          if (stepped)
            for (let frame = timeline.time(); frame < time; frame += 1 / 30) timeline.seek(frame);
          timeline.seek(time);
          return [...document.querySelectorAll(".tech-panel, .tech-connection")].flatMap((node) => {
            const mark = node.querySelector(".tech-outline, .tech-trace");
            if (!mark) throw new Error("強調表示がありません");
            const style = getComputedStyle(mark);
            return style.visibility !== "hidden" && Number(style.opacity) > 0.001
              ? [node.id.split("-tech-").at(-1)]
              : [];
          });
        },
        { time: at, stepped: !direct },
      );
      expect(
        actual.sort((a, b) => String(a).localeCompare(String(b))),
        `${direct ? "直接" : "連続・逆方向"} ${at}秒`,
      ).toEqual([...(focus.findLast((f) => f.offset <= at)?.targets ?? [])].sort());
      if (at === 0.75 || at === 0.85) {
        const dash = await page
          .locator(`#scene-tech-order-tech-${at === 0.75 ? first.id : second.id} .tech-trace`)
          .evaluate((node) => Number.parseFloat(getComputedStyle(node).strokeDashoffset));
        // pathLength=1の中間値を整数へ丸めると、線が描かれず矢印だけが先に現れる。
        expect(dash).toBeGreaterThan(0.1);
        expect(dash).toBeLessThan(0.9);
      }
    }
  }
});

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
    focus: [
      { cue: "diagram-flow-cue", offset: 0.4, targets: ["node-0"], title: "最初" },
      { cue: "diagram-flow-cue", offset: 0.5, targets: ["node-1"], title: "次" },
      { cue: "diagram-flow-cue", offset: 0.6, targets: ["node-0"], title: "再選択" },
      { cue: "diagram-flow-cue", offset: 2, targets: ["node-0"], title: "完了まで保持" },
      { cue: "diagram-flow-cue", offset: 2.6, targets: ["node-1"], title: "次へ移る" },
      { cue: "diagram-flow-cue", offset: 3.2, targets: ["node-0"], title: "完了後へ戻す" },
    ],
    note: "模式図",
  };
  diagram.diagram.columns[0]?.nodes.push({
    id: "node-bottom",
    label: "下の要素",
    detail: "上下接続",
    meta: "出典",
  });
  diagram.diagram.links = [
    { from: "node-0", to: "node-1" },
    { from: "node-1", to: "node-0" },
    { from: "node-0", to: "node-bottom" },
    { from: "node-bottom", to: "node-0" },
  ];
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
  await expect(page.locator("#scene-image-title-screen.framed-ipad .device-frame")).toHaveCount(1);
  await expect(page.locator("#scene-image-result .recap-shot img")).toHaveCount(3);
  await expect(page.locator("#scene-recording-video")).toHaveAttribute("src", demo.media.file);
  await expect(page.locator("#scene-plain-flow li")).toHaveCount(4);
  await expect(page.locator("#scene-diagram-flow .diagram-column")).toHaveCount(4);
  await expect(page.locator("#scene-source-list .source-row")).toHaveCount(1);
  await expect(page.locator("#scene-technical-flow .tech-panel")).toHaveCount(board.panels.length);
  const connections = await page.evaluate((links) => {
    window["__timelines"].tablecast?.seek(0.01);
    const boardBox = document.getElementById("scene-diagram-flow-board")?.getBoundingClientRect();
    if (!boardBox) throw new Error("構成図がありません");
    return links.map((link, index) => {
      const from = document
        .getElementById(`scene-diagram-flow-node-${link.from}`)
        ?.getBoundingClientRect();
      const to = document
        .getElementById(`scene-diagram-flow-node-${link.to}`)
        ?.getBoundingClientRect();
      const path = document.getElementById(`scene-diagram-flow-link-${index}`);
      if (!from || !to || !(path instanceof SVGPathElement)) throw new Error("接続がありません");
      const sameColumn = Math.abs(from.left - to.left) < 1;
      const start = path.getPointAtLength(0),
        end = path.getPointAtLength(path.getTotalLength());
      const expectedStart = sameColumn
        ? { x: (from.left + from.right) / 2, y: from.top < to.top ? from.bottom : from.top }
        : { x: from.left < to.left ? from.right : from.left, y: (from.top + from.bottom) / 2 };
      const expectedEnd = sameColumn
        ? { x: (to.left + to.right) / 2, y: from.top < to.top ? to.top : to.bottom }
        : { x: from.left < to.left ? to.left : to.right, y: (to.top + to.bottom) / 2 };
      return [
        Math.hypot(
          start.x + boardBox.left - expectedStart.x,
          start.y + boardBox.top - expectedStart.y,
        ),
        Math.hypot(end.x + boardBox.left - expectedEnd.x, end.y + boardBox.top - expectedEnd.y),
      ];
    });
  }, diagram.diagram.links);
  for (const distances of connections)
    for (const distance of distances) expect(distance).toBeLessThan(1);
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
  for (const at of [24.9, 24.45, 24.55, 24.9, 27.9, 26.4]) {
    const marks = await page.evaluate((time) => {
      window["__timelines"].tablecast?.seek(time);
      return [...document.querySelectorAll("#scene-diagram-flow .diagram-ring")].flatMap((ring) => {
        const rect = ring.querySelector("rect");
        if (!rect) throw new Error("囲み線がありません");
        return getComputedStyle(ring).visibility !== "hidden"
          ? [
              {
                id: ring.parentElement?.id,
                dash: Number.parseFloat(getComputedStyle(rect).strokeDashoffset),
              },
            ]
          : [];
      });
    }, at);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.id).toBe(`scene-diagram-flow-node-node-${at === 24.55 ? 1 : 0}`);
    expect(marks[0]?.dash).toBeLessThan(0.999);
    // 最後の再選択から、最初の線が完了済みかつ次の選択より前の区間へ戻す。
    if (at === 26.4) expect(marks[0]?.dash).toBe(0);
    if (at === 24.45 || at === 24.55) expect(marks[0]?.dash).toBeGreaterThan(0);
  }
  const handoff = await page.evaluate(() => {
    window["__timelines"].tablecast?.seek(12);
    const opening = document.getElementById("scene-image-title-screen")?.getBoundingClientRect();
    const recording = document.getElementById("scene-recording-screen")?.getBoundingClientRect();
    if (!opening || !recording) throw new Error("導入と実録が必要です");
    return [
      opening.left - recording.left,
      opening.top - recording.top,
      opening.width - recording.width,
      opening.height - recording.height,
    ];
  });
  for (const difference of handoff) expect(Math.abs(difference)).toBeLessThan(0.1);
  await writeFile(
    input,
    JSON.stringify({
      ...source,
      soundtrack: undefined,
      films: { demo: { scenes: scenes.map((item) => item.id) } },
      scenes,
    }),
  );
  await promisify(execFile)(
    "bun",
    ["--no-env-file", "scripts/tablecast-build.ts", "--film", "demo", "--out", `dist/${name}-film`],
    {
      cwd: root,
      env: { ...process.env, TABLECAST_PRESENTATION_PROJECT: input },
      windowsHide: true,
      timeout: 60000,
    },
  );
  await page.goto(pathToFileURL(resolve(root, "dist", `${name}-film`, "index.html")).href);
  await expect(page.locator("#scene-image-title-screen.framed-ipad .device-frame")).toHaveCount(1);
});
