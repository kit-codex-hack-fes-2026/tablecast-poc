import { readFile } from "node:fs/promises";
import { projectSchema } from "./tablecast-project";
import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inspectLayout } from "./tablecast-layout";

test.beforeEach(async ({ page }, testInfo) => {
  await page.goto(
    pathToFileURL(
      resolve(process.env.TABLECAST_VIDEO_DIR ?? `dist/${testInfo.project.name}`, "index.html"),
    ).href,
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, (image) => image.decode()));
  });
});

test("全場面の開始・中間・末尾で、文字・実画面が専用領域に収まる", async ({ page }) => {
  const samples = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("section.scene"), (scene) => {
      const start = Number(scene.dataset.start);
      const duration = Number(scene.dataset.duration);
      return [0.05, 0.5, duration / 2, duration - 0.05].map((at) => ({
        sceneId: scene.id.replace(/^scene-/, ""),
        time: start + at,
      }));
    }).flat(),
  );
  const failures = [];
  for (const sample of samples) {
    const result = await page.evaluate(inspectLayout, sample);
    if (result.issues.length) failures.push(result);
  }
  expect(failures).toEqual([]);
});

test("文章が表示領域を超えた生成物を不合格にする", async ({ page }) => {
  const sceneId = await page.locator("section.scene").first().getAttribute("id");
  if (!sceneId) throw new Error("検査する場面がありません");
  const sample = await page.evaluate((id) => {
    const scene = document.getElementById(id);
    const title = scene?.querySelector("h1, h2");
    if (!scene || !title) throw new Error("見出しがありません");
    title.textContent = "領域を超える長い説明文。".repeat(50);
    return { sceneId: id.replace(/^scene-/, ""), time: Number(scene.dataset.start) + 1 };
  }, sceneId);
  const result = await page.evaluate(inspectLayout, sample);
  expect(result.issues.some((issue) => issue.includes("領域外"))).toBe(true);
});

test("生成された字幕の切り替え時刻に、複数の字幕が同時表示されない", async ({ page }) => {
  const conflicts = await page.evaluate(() => {
    const captions = Array.from(document.querySelectorAll<HTMLElement>(".caption"), (node) => ({
      id: node.id,
      start: Number(node.dataset.start),
      duration: Number(node.dataset.duration),
    }));
    return captions.flatMap(({ start }) => {
      const active = captions.filter(
        (caption) => start >= caption.start && start < caption.start + caption.duration,
      );
      return active.length > 1 ? [{ time: start, ids: active.map((caption) => caption.id) }] : [];
    });
  });
  expect(conflicts).toEqual([]);
});

test(
  "親の切り抜き領域で説明文字が隠れる生成物を不合格にする",
  { tag: ["@product", "@tablecast"] },
  async ({ page }) => {
    const sample = await page.evaluate(() => {
      const scene = document.querySelector<HTMLElement>("#scene-closing");
      const copy = scene?.querySelector<HTMLElement>(".recap-copy");
      if (!scene || !copy) throw new Error("まとめがありません");
      copy.style.height = "80px";
      copy.style.overflow = "hidden";
      return { sceneId: "closing", time: Number(scene.dataset.start) + 3.6 };
    });
    const result = await page.evaluate(inspectLayout, sample);
    expect(result.issues.some((issue) => issue.includes("切り抜きで欠ける"))).toBe(true);
  },
);

test("実画面の比率を保つ", async ({ page }) => {
  const distortion = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLImageElement>(".opening-screen img, .recap-shot img"),
      (image) => {
        const box = image.getBoundingClientRect();
        return Math.abs(box.width / box.height - image.naturalWidth / image.naturalHeight);
      },
    ),
  );
  for (const value of distortion) expect(value).toBeLessThan(0.003);
});

test(
  "ナレーションに対応するまとめの画面が一枚ずつ表示される",
  { tag: ["@product", "@tablecast"] },
  async ({ page }) => {
    const states = await page.evaluate(() => {
      const scene = document.querySelector<HTMLElement>("#scene-closing");
      if (!scene) throw new Error("まとめがありません");
      const timeline = window["__timelines"].tablecast;
      if (!timeline) throw new Error("タイムラインがありません");
      return [0.7, 1.7, 2.8].map((time) => {
        timeline.seek(Number(scene.dataset.start) + time);
        return Array.from(scene.querySelectorAll(".recap-shot"), (node, index) => ({
          index,
          visible:
            getComputedStyle(node).visibility !== "hidden" &&
            Number(getComputedStyle(node).opacity) > 0.01,
        }))
          .filter((node) => node.visible)
          .map((node) => node.index);
      });
    });
    expect(states).toEqual([[0], [1], [2]]);
    expect(await page.locator(".recap-link").count()).toBe(0);
  },
);

test(
  "表紙は開始時から読め、実演へ位置と大きさが連続する",
  { tag: ["@product", "@tablecast"] },
  async ({ page }) => {
    const result = await page.evaluate(() => {
      const scene = document.querySelector<HTMLElement>("#scene-opening");
      const opening = document.querySelector("#scene-opening-screen");
      const recording = document.querySelector("#scene-roles-screen");
      const copy = document.querySelector("#scene-opening .opening-copy");
      if (!scene || !opening || !recording || !copy) throw new Error("接続先がありません");
      const timeline = window["__timelines"].tablecast;
      if (!timeline) throw new Error("タイムラインがありません");
      timeline.seek(0);
      const visible = Number(getComputedStyle(copy).opacity) === 1;
      timeline.seek(Number(scene.dataset.duration));
      const a = opening.getBoundingClientRect();
      const b = recording.getBoundingClientRect();
      return {
        visible,
        differences: [a.left - b.left, a.top - b.top, a.width - b.width, a.height - b.height],
      };
    });
    expect(result.visible).toBe(true);
    for (const difference of result.differences) expect(Math.abs(difference)).toBeLessThan(0.1);
  },
);

test(
  "説明の折り返しで行が伸びても、選択背景が次の行に一致する",
  { tag: ["@product", "@tablecast"] },
  async ({ page }) => {
    const bounds = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>("#scene-readback-point-0");
      const text = row?.querySelector("span:last-child");
      if (!row || !text) throw new Error("読み上げの手順がありません");
      text.textContent =
        "注文内容と商品の容量、温度、数量を確認し、変更した内容も含めて読み上げます。";
      const scene = document.querySelector<HTMLElement>("#scene-readback");
      const timeline = window["__timelines"].tablecast;
      if (!timeline) throw new Error("描画タイムラインがありません");
      timeline.invalidate().seek(Number(scene?.dataset.start) + 8.5);
      const selected = document.querySelector("#scene-readback-point-1")?.getBoundingClientRect();
      const active = document.querySelector("#scene-readback-active-step")?.getBoundingClientRect();
      if (!selected || !active) throw new Error("選択背景がありません");
      const range = document.createRange();
      range.selectNodeContents(text);
      const content = range.getBoundingClientRect();
      const box = row.getBoundingClientRect();
      return {
        textFits: content.top >= box.top && content.bottom <= box.bottom,
        insetTop: active.top - selected.top,
        insetBottom: selected.bottom - active.bottom,
      };
    });
    expect(bounds.textFits).toBe(true);
    expect(bounds.insetTop).toBeCloseTo(4, 0);
    expect(bounds.insetBottom).toBeCloseTo(4, 0);
  },
);

test(
  "役割に対応するiPad・iPhone・MacBookとウィンドウ枠を表示する",
  { tag: ["@product", "@tablecast"] },
  async ({ page }) => {
    for (const [scene, device, role] of [
      ["roles", "ipad", "お客さま"],
      ["staff", "iphone", "店員"],
      ["admin", "macbook", "管理者"],
    ]) {
      expect(
        await page.locator(`#scene-${scene}-screen.framed-${device} .device-frame`).count(),
      ).toBe(1);
      await expect(page.locator(`#scene-${scene} .role-label`)).toContainText(role ?? "");
    }
    expect(await page.locator("#scene-admin-screen .browser-chrome").count()).toBe(1);
    expect(await page.locator("#scene-admin-screen .device-base").count()).toBe(1);
  },
);

test(
  "お客さまとAIの話者名・補助説明・字幕色が区別できる",
  { tag: ["@product", "@tablecast"] },
  async ({ page }) => {
    await expect(page.locator(".speaker-customer .speaker-name").first()).toContainText("お客さま");
    await expect(page.locator(".speaker-cast .speaker-name").first()).toContainText(
      "キャスト（AI）",
    );
    const colors = await page.evaluate(() =>
      [".speaker-customer", ".speaker-cast"].map((selector) => {
        const node = document.querySelector(selector);
        if (!node) throw new Error("字幕がありません");
        return getComputedStyle(node).backgroundColor;
      }),
    );
    expect(colors[0]).not.toBe(colors[1]);
  },
);

test(
  "技術図は発話に対応する対象を強調し、逆方向のseekでも再現する",
  { tag: "@technical" },
  async ({ page }) => {
    const directory = process.env.TABLECAST_VIDEO_DIR ?? "dist/technical";
    const input: unknown = JSON.parse(await readFile(resolve(directory, "timing.json"), "utf8"));
    if (!input || typeof input !== "object" || !("scenes" in input))
      throw new Error("場面がありません");
    const project = { scenes: projectSchema.shape.scenes.parse(input.scenes) };
    for (const scene of project.scenes.filter((s) => s.technical)) {
      if (!scene.technical) throw new Error("技術図が必要です");
      const start = Number(await page.locator("#scene-" + scene.id).getAttribute("data-start"));
      const focuses = [...scene.technical.focus, ...scene.technical.focus.slice(0, 1)];
      for (const focus of focuses) {
        const at =
          start + (scene.cues.find((c) => c.id === focus.cue)?.at ?? 0) + focus.offset + 0.7;
        expect(
          (await page.evaluate(inspectLayout, { sceneId: scene.id, time: at })).issues,
        ).toEqual([]);
        const active = await page
          .locator("#scene-" + scene.id + " .tech-panel")
          .evaluateAll((nodes) =>
            nodes
              .filter(
                (n) =>
                  getComputedStyle(n.querySelector(".tech-outline") ?? n).visibility !== "hidden",
              )
              .map((n) => n.id.split("-tech-").at(-1)),
          );
        expect(active.sort((a, b) => String(a).localeCompare(String(b)))).toEqual(
          focus.targets.filter((id) => scene.technical?.panels.some((p) => p.id === id)).sort(),
        );
        await expect(
          page.locator("#scene-" + scene.id + " .tech-summary").filter({ visible: true }),
        ).toHaveText("FOCUS" + focus.summary);
      }
    }
  },
);

test(
  "技術図の矢印は対象の境界かライフラインに接続し、ラベルは本文と重ならない",
  { tag: "@technical" },
  async ({ page }) => {
    const issues = await page.evaluate(() =>
      [...document.querySelectorAll(".tech-connection")].flatMap((node) => {
        const svg = node.closest("svg");
        const path = node.querySelector("path");
        const text = node.querySelector("text");
        const scene = node.closest("section");
        if (!svg || !path || !text || !scene) throw new Error("図の構造が欠けています");
        const result: string[] = [];
        const origin = svg.getBoundingClientRect();
        const sequence = !!scene.querySelector(".tech-view-sequence");
        for (const [id, distance] of [
          [node.getAttribute("data-from"), 0],
          [node.getAttribute("data-to"), path.getTotalLength()],
        ] as const) {
          const target = id && document.getElementById(id);
          if (!target) throw new Error("接続対象がありません");
          const box = target.getBoundingClientRect();
          const p = path.getPointAtLength(distance);
          const x = origin.left + p.x,
            y = origin.top + p.y;
          const boundary = sequence
            ? Math.abs(x - (box.left + box.right) / 2) < 2
            : (Math.min(Math.abs(x - box.left), Math.abs(x - box.right)) < 2 &&
                y >= box.top &&
                y <= box.bottom) ||
              (Math.min(Math.abs(y - box.top), Math.abs(y - box.bottom)) < 2 &&
                x >= box.left &&
                x <= box.right);
          if (!boundary) result.push(node.id + ":接続先から外れる");
        }
        const label = text.getBoundingClientRect();
        // 背景の領域パネル内にも通信を描く。ラベルと実際の本文・画像を照合する。
        for (const p of scene.querySelectorAll(
          ".tech-panel h3, .tech-panel p, .tech-panel pre, .tech-screenshot",
        )) {
          const b = p.getBoundingClientRect();
          if (
            label.left < b.right &&
            label.right > b.left &&
            label.top < b.bottom &&
            label.bottom > b.top
          )
            result.push(node.id + ":ラベルと説明が重なる");
        }
        return result;
      }),
    );
    expect(issues).toEqual([]);
  },
);
