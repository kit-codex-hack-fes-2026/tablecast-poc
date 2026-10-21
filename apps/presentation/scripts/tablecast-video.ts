import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { z } from "zod";
import {
  audioPath,
  needsVoice,
  projectPath,
  readProject,
  root,
  selectScenes,
} from "./tablecast-project.ts";
import { repositoryPath, resolveSource } from "./tablecast-source.ts";
import { sha } from "./tablecast-video/inputs.ts";
import { renderVideo } from "./tablecast-video/render.ts";
import { timingSchema } from "./tablecast-video/types.ts";
export { validatedPeakDb } from "./tablecast-video/render.ts";

const execute = promisify(execFile);

export function videoPaths(name: string, films: string[]) {
  if (!/^[a-z][a-z0-9-]*$/.test(name) || films.includes(name))
    throw new Error(
      "--name は完成動画のfilm名と異なる英小文字・数字・ハイフンの未使用名にしてください",
    );
  return { composition: `dist/${name}`, output: `output/${name}` };
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
  const steps: { log: string; name: string; status: string }[] = [];
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
    inputs.add(resolve(root, "scripts"));
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
    const timing = timingSchema.parse(
      JSON.parse(await readFile(resolve(composition, "timing.json"), "utf8")),
    );
    report.duration = timing.duration;
    if (values.render) {
      await renderVideo({ project, timing, directory, paths, cli, run, report });
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
