import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";
import { chromium } from "@playwright/test";
import { z } from "zod";
import { resolveSource, repositoryPath } from "./tablecast-source.ts";
import {
  audioPath,
  needsVoice,
  projectPath,
  projectSchema,
  readProject,
  root,
  selectScenes,
} from "./tablecast-project.ts";

const execute = promisify(execFile);
const sha = async (file: string): Promise<string> => {
  const content = (await stat(file)).isDirectory()
    ? JSON.stringify(
        await Promise.all(
          (await readdir(file)).sort().map(async (name) => [name, await sha(resolve(file, name))]),
        ),
      )
    : await readFile(file);
  return createHash("sha256").update(content).digest("hex");
};

export function videoPaths(name: string, films: string[]) {
  if (!/^[a-z][a-z0-9-]*$/.test(name) || films.includes(name))
    throw new Error(
      "--name は完成動画のfilm名と異なる英小文字・数字・ハイフンの未使用名にしてください",
    );
  return { composition: `dist/${name}`, output: `output/${name}` };
}

export function validatedPeakDb(log: string) {
  const peak = Number(log.match(/max_volume: ([-.0-9]+) dB/)?.[1]);
  // volumedetectは16bitへ変換して測り、デジタル無音も-infではなく-91.0 dBと報告する。
  if (!Number.isFinite(peak) || peak <= -91 || peak >= 0)
    throw new Error("音声が無音またはピークを超えています");
  return peak;
}

export async function createVideo(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      project: { type: "string" },
      film: { type: "string" },
      name: { type: "string" },
      render: { type: "boolean", default: false },
    },
  });
  if (!values.film || !values.name)
    throw new Error("--film と --name が必要です。--render を付けると完成MP4まで作ります");
  if (values.project) process.env.TABLECAST_PRESENTATION_PROJECT = resolve(root, values.project);
  const source = await readProject();
  const film = source.films?.[values.film];
  if (!film) throw new Error("台本に指定したfilmがありません");
  if (projectPath() !== resolve(root, "sample.json") && !source.brand)
    throw new Error("別題材の台本にはbrandを指定してください");
  const project = selectScenes(source, film.scenes.join(","));
  const sharedProjectPath = repositoryPath(projectPath());
  const paths = videoPaths(values.name, Object.keys(source.films ?? {}));
  const directory = resolve(root, paths.output);
  const composition = resolve(root, paths.composition);
  await mkdir(resolve(root, "output"), { recursive: true });
  await mkdir(resolve(root, "dist"), { recursive: true });
  // 使用済みの成果物を上書きしない。失敗したrunも検査できる形で残す。
  await mkdir(directory);
  const steps: { name: string; status: string; log: string }[] = [];
  const report: Record<string, unknown> = {
    status: "running",
    startedAt: new Date().toISOString(),
    project: sharedProjectPath,
    inputPathBase: "repository",
    film: values.film,
    composition: paths.composition,
    renderRequested: values.render,
    editorialReview: "pending",
    nodeVersion: process.version,
    steps,
  };
  const env = {
    ...process.env,
    TABLECAST_PRESENTATION_PROJECT: projectPath(),
    TABLECAST_VIDEO_DIR: composition,
    TABLECAST_VIDEO_FILM: values.film,
    TABLECAST_VIDEO_REPORT: resolve(directory, "layout.json"),
  };
  const run = async (name: string, command: string, commandArgs: string[]) => {
    console.info(`${name}: 開始`);
    const log = `${name}.log`;
    try {
      const result = await execute(command, commandArgs, {
        cwd: root,
        env,
        windowsHide: true,
        timeout: 3_600_000,
        maxBuffer: 32_000_000,
      });
      await writeFile(resolve(directory, log), result.stdout + result.stderr);
      steps.push({ name, status: "passed", log });
      console.info(`${name}: 完了`);
      return result;
    } catch (error) {
      const result = z
        .object({ stdout: z.string().optional(), stderr: z.string().optional() })
        .safeParse(error);
      await writeFile(
        resolve(directory, log),
        result.success ? (result.data.stdout ?? "") + (result.data.stderr ?? "") : String(error),
      );
      steps.push({ name, status: "failed", log });
      throw new Error(`${name}が失敗しました。${paths.output}/${log}を確認してください`, {
        cause: error,
      });
    }
  };
  try {
    await mkdir(composition);
    const inputs = new Set([
      projectPath(),
      resolve(root, "styles.css"),
      resolve(root, "package.json"),
      resolve(root, "playwright.config.ts"),
      resolve(root, "assets/fonts/NotoSansJP-VF.ttf"),
      resolve(root, "assets/fonts/LICENSE"),
      resolve(root, "../../bun.lock"),
    ]);
    for (const file of await readdir(resolve(root, "scripts")))
      if (file.endsWith(".ts")) inputs.add(resolve(root, "scripts", file));
    for (const scene of project.scenes) {
      for (const file of [
        ...(scene.images ?? []),
        ...scene.cues.filter((c) => needsVoice(scene, c)).map((c) => audioPath(project, c)),
        ...(scene.technical?.panels.flatMap((p) =>
          [p.image, p.icon].filter((v): v is string => !!v),
        ) ?? []),
      ])
        inputs.add(resolve(root, file));
      for (const file of [
        ...(scene.technical?.sources ?? []),
        ...(scene.sourceTree?.map((e) => e.path) ?? []),
      ])
        inputs.add(await resolveSource(file));
      if (scene.media) {
        inputs.add(resolve(root, scene.media.file));
        for (const file of [scene.media.project, scene.media.shot])
          if (file) inputs.add(resolve(root, file));
        if (scene.media.shot)
          for (const file of ["tablecast-events.json", "tablecast-take.json"])
            inputs.add(resolve(root, dirname(scene.media.shot), file));
      }
    }
    if (project.soundtrack)
      for (const file of [project.soundtrack.music, project.soundtrack.effect])
        inputs.add(resolve(root, file));
    const hashes = async () =>
      Object.fromEntries(
        await Promise.all(
          [...inputs].sort().map(async (file) => [repositoryPath(file), await sha(file)] as const),
        ),
      );
    const before = await hashes();
    report.inputHashes = before;
    report.captureCoverage = project.scenes
      .filter((s) => s.media)
      .map((s) => ({ scene: s.id, evidence: !!s.capture && !!s.media?.shot }));
    report.applicationRevision = (
      await execute("git", ["rev-parse", "HEAD"], { cwd: root, windowsHide: true })
    ).stdout.trim();
    report.workingTree = (
      await execute("git", ["status", "--short"], { cwd: root, windowsHide: true })
    ).stdout.trim();
    await writeFile(resolve(directory, "project.json"), await readFile(projectPath()));
    await run("build", "bun", [
      "--no-env-file",
      "scripts/tablecast-build.ts",
      "--film",
      values.film,
      "--out",
      paths.composition,
    ]);
    await run("layout", "node", [
      fileURLToPath(import.meta.resolve("@playwright/test/cli")),
      "test",
      "--config",
      "playwright.config.ts",
    ]);
    const layout = z
      .object({
        stats: z.object({
          expected: z.number(),
          unexpected: z.number(),
          skipped: z.number(),
          flaky: z.number(),
        }),
      })
      .parse(JSON.parse(await readFile(resolve(directory, "layout.json"), "utf8")));
    if (
      !layout.stats.expected ||
      layout.stats.unexpected ||
      layout.stats.skipped ||
      layout.stats.flaky
    )
      throw new Error("配置検査が未実施・失敗・skip・不安定です");
    report.layout = layout.stats;
    const cli = resolve(root, "node_modules/hyperframes/bin/hyperframes.mjs");
    await run("lint", "node", [cli, "lint", paths.composition]);
    await run("transitions", "node", [cli, "check", paths.composition, "--at-transitions"]);
    const timing = z
      .object({
        duration: z.number().positive(),
        scenes: projectSchema.shape.scenes.element
          .extend({ start: z.number(), duration: z.number().positive() })
          .array(),
        cues: z.object({ audioDuration: z.number() }).array(),
      })
      .parse(JSON.parse(await readFile(resolve(composition, "timing.json"), "utf8")));
    report.duration = timing.duration;
    if (values.render) {
      const video = resolve(directory, "video.mp4");
      await run("render", "node", [
        cli,
        "render",
        paths.composition,
        "--output",
        video,
        "--experimental-fast-capture=false",
      ]);
      const probe = await run("metadata", "ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        video,
      ]);
      const metadata = z
        .object({
          format: z.object({ duration: z.coerce.number() }),
          streams: z.array(
            z.object({
              codec_type: z.string(),
              codec_name: z.string(),
              width: z.number().optional(),
              height: z.number().optional(),
              r_frame_rate: z.string().optional(),
            }),
          ),
        })
        .parse(JSON.parse(probe.stdout));
      const visual = metadata.streams.find((s) => s.codec_type === "video");
      const sound = metadata.streams.find((s) => s.codec_type === "audio");
      const hasSound =
        !!project.soundtrack ||
        timing.cues.some((c) => c.audioDuration > 0) ||
        project.scenes.some((s) => s.media?.audio);
      if (
        visual?.width !== project.width ||
        visual.height !== project.height ||
        visual.r_frame_rate !== `${project.fps}/1` ||
        visual.codec_name !== "h264" ||
        (hasSound && sound?.codec_name !== "aac") ||
        Math.abs(metadata.format.duration - timing.duration) > 0.05
      )
        throw new Error("完成MP4の形式・音声・尺が台本と一致しません");
      await run("decode", "ffmpeg", [
        "-hide_banner",
        "-v",
        "error",
        "-i",
        video,
        "-f",
        "null",
        "-",
      ]);
      if (hasSound) {
        const volume = await run("volume", "ffmpeg", [
          "-hide_banner",
          "-i",
          video,
          "-af",
          "volumedetect",
          "-vn",
          "-f",
          "null",
          "-",
        ]);
        report.peakDb = validatedPeakDb(volume.stderr);
      }
      const times = [
        ...new Set(
          timing.scenes
            .flatMap((s) => [
              s.start,
              s.start + s.duration / 2,
              s.start + s.duration - 0.1,
              ...(s.technical?.focus.map(
                (f) => s.start + (s.cues.find((c) => c.id === f.cue)?.at ?? 0) + f.offset + 0.5,
              ) ?? []),
            ])
            .map((t) => Math.max(0, Math.min(timing.duration - 0.05, t))),
        ),
      ];
      await mkdir(resolve(directory, "frames"));
      for (const [index, time] of times.entries())
        await run(`frame-${index}`, "ffmpeg", [
          "-v",
          "error",
          "-ss",
          String(time),
          "-i",
          video,
          "-frames:v",
          "1",
          resolve(directory, "frames", `${index}.png`),
        ]);
      report.frames = times.map((time, index) => ({ time, path: `frames/${index}.png` }));
      await writeFile(
        resolve(directory, "player.html"),
        '<!doctype html><html lang="ja"><meta charset="utf-8"><title>完成動画の確認</title><body style="margin:0;background:#000"><video controls playsinline src="video.mp4" style="width:100vw;height:100vh"></video></body></html>',
      );
      const browser = await chromium.launch({
        channel: "chrome",
        args: ["--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"],
      });
      try {
        const page = await browser.newPage();
        await page.goto(pathToFileURL(resolve(directory, "player.html")).href);
        await page.evaluate(async () => {
          const v = document.querySelector("video");
          if (!v) throw new Error("確認する動画がありません");
          v.muted = false;
          v.playbackRate = 1;
          await v.play();
        });
        console.info("playback: 完成MP4を等速で全編再生中");
        await page.waitForFunction(() => document.querySelector("video")?.ended, null, {
          timeout: (timing.duration + 30) * 1000,
        });
        const playback = await page.evaluate(() => {
          const v = document.querySelector("video");
          if (!v) throw new Error("確認する動画がありません");
          return {
            ended: v.ended,
            error: v.error?.code ?? null,
            duration: v.duration,
            muted: v.muted,
            rate: v.playbackRate,
            played: Array.from({ length: v.played.length }, (_, i) => [
              v.played.start(i),
              v.played.end(i),
            ]),
          };
        });
        if (
          playback.error ||
          !playback.ended ||
          playback.muted ||
          playback.rate !== 1 ||
          playback.played.length !== 1 ||
          (playback.played[0]?.[0] ?? 1) > 1 / project.fps ||
          (playback.played[0]?.[1] ?? 0) < timing.duration - 0.05
        )
          throw new Error("完成MP4を全編再生できません");
        report.playback = playback;
      } finally {
        await browser.close();
      }
      report.videoHash = await sha(video);
      report.metadata = metadata;
    }
    if (JSON.stringify(before) !== JSON.stringify(await hashes()))
      throw new Error("実行中に入力が変わりました。別名で再実行してください");
    report.status = values.render ? "rendered-and-checked" : "composition-checked";
    console.info(
      `${paths.output}/report.json に実行結果を保存。説明・音・見た目のレビューは未実施です。`,
    );
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeFile(resolve(directory, "report.json"), JSON.stringify(report, null, 2));
  }
}

if (import.meta.main)
  createVideo(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "動画の生成・検査に失敗しました");
    process.exitCode = 1;
  });
