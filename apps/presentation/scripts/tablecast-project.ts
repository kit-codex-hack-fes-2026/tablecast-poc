import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { shotSchema } from "./tablecast-shot.ts";
import { zoomMotion } from "./tablecast-zoom.ts";
import { technicalSchema } from "./tablecast-technical-schema.ts";

export const root = resolve(import.meta.dirname, "..");
export const cameraTransitionDuration = 1.1;
// 既存録画のviewport検証と、役割に対応する表示枠の識別子。
export const devices = {
  ipad: { label: "iPad / タブレット", width: 1024, height: 768 },
  iphone: { label: "iPhone / スマホ", width: 390, height: 844 },
  macbook: { label: "MacBook / PC", width: 1440, height: 900 },
  window: { label: "ブラウザー・既存収録", width: 1600, height: 900 },
} as const;
export const roles = { customer: "お客さま", staff: "店員", admin: "管理者" } as const;
export const speakers = {
  narrator: "ナレーション",
  customer: "お客さま",
  cast: "キャスト（AI）",
  instruction: "操作・状態",
} as const;
const id = z.string().regex(/^[a-z][a-z0-9-]*$/);
const cue = z.object({
  id,
  at: z.number().nonnegative(),
  text: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[^\r\n]+$/),
  speech: z.string().min(1).max(2000).optional(),
  speaker: z.enum(["narrator", "customer", "cast", "instruction"]).default("narrator"),
  voice: z.boolean().default(true),
});
const scene = z.object({
  id,
  kind: z.enum(["title", "demo", "flow", "result"]),
  duration: z.number().positive().optional(),
  chapter: z.string().min(1),
  title: z.string().min(1),
  titleLines: z.array(z.string().min(1)).min(1).max(3).optional(),
  kicker: z.string(),
  note: z.string().min(1),
  points: z.array(z.string().min(1)).max(4),
  pointFocus: z
    .array(z.object({ at: z.number().nonnegative(), point: z.number().int().nonnegative() }))
    .min(1)
    .optional(),
  sourceTree: z
    .array(
      z.object({
        path: z.string().regex(/^[a-zA-Z0-9/_.-]+$/),
        detail: z.string().min(1).max(50),
        depth: z.number().int().min(0).max(2),
      }),
    )
    .min(1)
    .max(14)
    .optional(),
  technical: technicalSchema.optional(),
  cues: z.array(cue).min(1),
  role: z.enum(["customer", "staff", "admin"]).optional(),
  device: z.enum(["ipad", "iphone", "macbook", "window"]).optional(),
  images: z
    .array(z.string().regex(/^assets\/images\/[a-z0-9-]+\.(png|jpg|webp)$/))
    .min(1)
    .max(3)
    .optional(),
  capture: shotSchema.optional(),
  diagram: z
    .object({
      columns: z
        .array(
          z.object({
            title: z.string().min(1).max(24),
            nodes: z
              .array(
                z.object({
                  id,
                  label: z.string().min(1).max(32),
                  detail: z.string().min(1).max(90),
                  meta: z.string().min(1).max(60),
                }),
              )
              .min(1)
              .max(3),
          }),
        )
        .length(4),
      links: z.array(z.object({ from: id, to: id, both: z.boolean().optional() })).max(12),
      focus: z
        .array(
          z.object({
            cue: id,
            offset: z.number().nonnegative(),
            targets: z.array(id).min(1).max(2),
            title: z.string().min(1).max(80),
          }),
        )
        .min(1)
        .max(8),
      note: z.string().min(1).max(120),
    })
    .optional(),
  media: z
    .object({
      file: z.string().regex(/^assets\/demo\/[a-z0-9-]+\.mp4$/),
      offset: z.number().nonnegative(),
      duration: z.number().positive(),
      audio: z.boolean().optional(),
      shot: z
        .string()
        .regex(/^assets\/openscreen\/[a-z0-9-]+\/tablecast-shot-[a-z0-9-]+\.json$/)
        .optional(),
      zoom: z
        .discriminatedUnion("mode", [
          z.object({ mode: z.literal("overview"), reason: z.string().min(1) }),
          z.object({
            mode: z.literal("detail"),
            reason: z.string().min(1),
            cue: id,
            offset: z.number().nonnegative(),
            exitAt: z.number().nonnegative().optional(),
            target: z.object({
              label: z.string().min(1),
              x: z.number().min(0).max(1),
              y: z.number().min(0).max(1),
              width: z.number().positive().max(1),
              height: z.number().positive().max(1),
            }),
            continueFrom: id.optional(),
          }),
        ])
        .optional(),
      project: z
        .string()
        .regex(/^assets\/openscreen\/[a-z0-9-]+\/[a-z0-9-]+\.openscreen$/)
        .optional(),
    })
    .optional(),
  camera: z
    .array(
      z.object({
        at: z.number().nonnegative(),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        zoom: z.number().min(1).max(3),
      }),
    )
    .min(1),
});
export const projectSchema = z
  .object({
    brand: z
      .object({
        name: z.string().min(1).max(40),
        title: z.string().min(1).max(120),
        roles: z
          .object({
            customer: z.string().min(1),
            staff: z.string().min(1),
            admin: z.string().min(1),
          })
          .optional(),
        speakers: z
          .object({
            narrator: z.string().min(1),
            customer: z.string().min(1),
            cast: z.string().min(1),
            instruction: z.string().min(1),
          })
          .optional(),
      })
      .optional(),
    width: z.literal(1920),
    height: z.literal(1080),
    fps: z.literal(30),
    // 宣言順も音声キャッシュのハッシュに含まれるため、既存キーを並べ替えない。
    tts: z.object({
      voiceId: z.string().min(1),
      modelId: z.literal("inworld-tts-2"),
      language: z.literal("ja-JP"),
      deliveryMode: z.literal("STABLE"),
      audioConfig: z.object({
        audioEncoding: z.literal("LINEAR16"),
        sampleRateHertz: z.literal(48000),
      }),
    }),
    soundtrack: z
      .object({
        music: z.string().regex(/^assets\/audio\/[a-z0-9-]+\.wav$/),
        effect: z.string().regex(/^assets\/audio\/[a-z0-9-]+\.wav$/),
        musicVolume: z.number().min(0).max(0.3),
        speechVolume: z.number().min(0).max(0.15),
        effectVolume: z.number().min(0).max(0.5),
        credit: z.string().max(260).optional(),
      })
      .optional(),
    scenes: z.array(scene).min(1),
    films: z
      .record(
        id,
        z.object({ scenes: z.array(id).min(1), duration: z.number().positive().optional() }),
      )
      .optional(),
  })
  .superRefine((project, ctx) => {
    if (project.soundtrack && project.soundtrack.speechVolume > project.soundtrack.musicVolume)
      ctx.addIssue({
        code: "custom",
        path: ["soundtrack", "speechVolume"],
        message: "発話中のBGM音量は通常時のBGM音量以下にしてください",
      });
    const ids = project.scenes.flatMap((item) => [item.id, ...item.cues.map((part) => part.id)]);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "場面・発話IDは重複できません" });
    for (const film of Object.values(project.films ?? {})) {
      if (
        new Set(film.scenes).size !== film.scenes.length ||
        film.scenes.some((name) => !project.scenes.some((item) => item.id === name))
      )
        ctx.addIssue({ code: "custom", message: "動画は重複のない実在する場面を参照してください" });
    }
    for (const [sceneIndex, item] of project.scenes.entries()) {
      const issue = (field: string, message: string) =>
        ctx.addIssue({ code: "custom", path: ["scenes", sceneIndex, field], message });
      if (
        [item.technical, item.diagram, item.sourceTree, item.images, item.media].filter(Boolean)
          .length > 1
      )
        issue("kind", "技術図・構成図・ファイル一覧・静止画・動画は同じ場面に重ねて指定できません");
      if (item.kind === "title" && item.images && item.images.length !== 1)
        issue("images", "導入の静止画は1枚だけ指定してください");
      if ((item.technical || item.diagram) && item.points.length)
        issue("points", "図の説明は図内の要素・注目先に指定してください");
      if (item.kind === "demo" && !item.points.length)
        issue("points", "実録には操作の説明を1件以上指定してください");
      if (item.pointFocus && item.kind !== "demo" && !(item.kind === "result" && item.images))
        issue("pointFocus", "説明の強調は実録または静止画付きのまとめに指定してください");
      if (
        item.kind === "result" &&
        item.images &&
        item.pointFocus &&
        item.images.some((_, point) => !item.pointFocus?.some((focus) => focus.point === point))
      )
        issue("pointFocus", "まとめの静止画をすべて表示する強調時刻を指定してください");
      if (
        item.kind !== "demo" &&
        (item.camera.length !== 1 ||
          item.camera[0]?.x !== 0.5 ||
          item.camera[0]?.y !== 0.5 ||
          item.camera[0]?.zoom !== 1)
      )
        issue("camera", "カメラ移動は実録場面だけに指定してください");
      if (item.duration && item.media)
        ctx.addIssue({ code: "custom", message: "実録の尺はmedia.durationだけで指定してください" });
      if (Boolean(item.device) !== Boolean(item.role) || (item.device && item.kind !== "demo"))
        ctx.addIssue({ code: "custom", message: "実録の端末と役割は一緒に指定してください" });
      if (item.images && item.kind !== "title" && item.kind !== "result")
        ctx.addIssue({
          code: "custom",
          message: "静止画は導入またはまとめの場面に指定してください",
        });
      if (item.kind === "result" && item.images && item.images.length !== item.points.length)
        ctx.addIssue({ code: "custom", message: "まとめの静止画と説明は一対一にしてください" });
      if (item.media?.project && (item.camera.length !== 1 || item.camera[0]?.zoom !== 1))
        ctx.addIssue({ code: "custom", message: "OpenScreen済み素材へ二重ズームを指定できません" });
      if (item.capture && (!item.device || !item.media))
        ctx.addIssue({
          code: "custom",
          message: "撮影定義は役割と端末のある実録場面に指定してください",
        });
      for (const track of [
        item.technical?.focus,
        item.diagram?.focus,
        item.media?.zoom?.mode === "detail" ? [item.media.zoom] : undefined,
      ]) {
        if (!track) continue;
        const starts = track.map(
          (focus) => (item.cues.find((part) => part.id === focus.cue)?.at ?? 0) + focus.offset,
        );
        if (
          track.some((focus) => !item.cues.some((part) => part.id === focus.cue)) ||
          starts.some((start, index) => index > 0 && start <= (starts[index - 1] ?? 0))
        )
          ctx.addIssue({
            code: "custom",
            message: "注目先は実在する発話を参照し、時刻を昇順に指定してください",
          });
      }
      if (item.media?.zoom?.mode === "detail" && !item.media.project)
        ctx.addIssue({ code: "custom", message: "素材の注目先にはOpenScreen projectが必要です" });
      if (item.media?.project && !item.media.zoom)
        ctx.addIssue({ code: "custom", message: "実録にはズームの判断と理由を指定してください" });
      const zoom = item.media?.zoom;
      if (zoom?.mode === "detail") {
        const enterAt = (item.cues.find((part) => part.id === zoom.cue)?.at ?? 0) + zoom.offset;
        const sceneDuration = item.media?.duration ?? 0;
        const holdEnd = zoom.exitAt ?? sceneDuration;
        if (
          (!zoom.continueFrom && enterAt + zoomMotion.enter + 0.6 > holdEnd) ||
          (zoom.exitAt !== undefined && zoom.exitAt + zoomMotion.exit > sceneDuration)
        )
          ctx.addIssue({
            code: "custom",
            message: "ズームの移動・保持・引きを場面内に確保してください",
          });
        if (zoom.target.x + zoom.target.width > 1 || zoom.target.y + zoom.target.height > 1)
          ctx.addIssue({ code: "custom", message: "ズーム対象の範囲が画面外です" });
        if (zoom.continueFrom) {
          const previous = project.scenes.find((candidate) => candidate.id === zoom.continueFrom);
          if (
            !previous?.media ||
            previous.media.file !== item.media?.file ||
            previous.media.offset >= (item.media?.offset ?? 0) ||
            previous.media.zoom?.mode !== "detail" ||
            JSON.stringify(previous.media.zoom.target) !== JSON.stringify(zoom.target)
          )
            ctx.addIssue({
              code: "custom",
              message: "継続ズームは同じ素材・対象の先行場面を参照してください",
            });
        }
      }
      if (item.diagram) {
        const diagram = item.diagram;
        const nodes = diagram.columns.flatMap((column) => column.nodes.map((node) => node.id));
        if (
          item.kind !== "flow" ||
          new Set(nodes).size !== nodes.length ||
          diagram.focus.some((focus) => focus.targets.some((target) => !nodes.includes(target))) ||
          diagram.links.some(
            (link) =>
              !nodes.includes(link.from) || !nodes.includes(link.to) || link.from === link.to,
          )
        )
          ctx.addIssue({
            code: "custom",
            message: "技術図の要素IDと接続・注目先を確認してください",
          });
      }
      if ((item.kind === "demo") !== Boolean(item.media))
        ctx.addIssue({ code: "custom", message: "実録場面だけに動画素材を指定してください" });
      if (item.kind === "demo") {
        const initial = item.camera[0];
        if (initial?.x !== 0.5 || initial.y !== 0.5 || initial.zoom !== 1)
          ctx.addIssue({ code: "custom", message: "実録場面は画面全体から始めてください" });
        // キーフレームは到達時刻。実際の移動開始まで全体表示を2.3秒保つ。
        if (item.camera[1] && item.camera[1].at < 2.3 + cameraTransitionDuration)
          ctx.addIssue({ code: "custom", message: "冒頭の全体表示を保ってから拡大してください" });
      }
      for (const track of [item.cues, item.camera]) {
        if (
          track[0]?.at !== 0 ||
          track.some((part, index, all) => index > 0 && part.at <= (all[index - 1]?.at ?? 0))
        )
          ctx.addIssue({ code: "custom", message: "字幕・カメラは0秒から昇順に配置してください" });
      }
    }
  });
export type Project = z.infer<typeof projectSchema>;
export type Cue = z.infer<typeof cue>;
export type SpeechCue = Pick<Cue, "id" | "text" | "speech"> & Partial<Cue>;
export function needsVoice(item: Project["scenes"][number], part: Cue) {
  return !item.media?.audio && part.voice;
}
export function selectScenes(project: Project, ids?: string) {
  if (!ids) return project;
  const requested = ids.split(",");
  if (new Set(requested).size !== requested.length)
    throw new Error("抽出する場面IDが重複または存在しません");
  return {
    ...project,
    scenes: requested.map((name) => {
      const item = project.scenes.find((part) => part.id === name);
      if (!item) throw new Error("抽出する場面IDが重複または存在しません");
      return item;
    }),
  };
}
const defaultProjectPath = resolve(root, "projects/tablecast-main-rerecord.json");
export const projectPath = () =>
  resolve(root, process.env.TABLECAST_PRESENTATION_PROJECT ?? defaultProjectPath);
export async function readProject() {
  return projectSchema.parse(JSON.parse(await readFile(projectPath(), "utf8")));
}
// 撮影待ちの定義は採用済みの台本へ上書きしない。収録・書き出し成功後に採用する。
export async function readCaptureProject() {
  const project = await readProject();
  const shots = z
    .record(z.string(), shotSchema)
    .parse(
      JSON.parse(
        await readFile(
          process.env.TABLECAST_PRESENTATION_CAPTURE_PLAN
            ? resolve(root, process.env.TABLECAST_PRESENTATION_CAPTURE_PLAN)
            : resolve(
                projectPath() === defaultProjectPath ? root : dirname(projectPath()),
                "capture-plan.json",
              ),
          "utf8",
        ),
      ),
    );
  for (const [sceneId, capture] of Object.entries(shots)) {
    const item = project.scenes.find((candidate) => candidate.id === sceneId);
    if (!item) throw new Error(`撮影対象の場面がありません: ${sceneId}`);
    item.capture = capture;
  }
  return projectSchema.parse(project);
}
export function speechRequest(project: Project, item: SpeechCue) {
  return { ...project.tts, text: item.speech ?? item.text };
}
export function audioPath(project: Project, item: SpeechCue) {
  const hash = createHash("sha256")
    .update(JSON.stringify(speechRequest(project, item)))
    .digest("hex")
    .slice(0, 16);
  return `assets/audio/${item.id}-${hash}.wav`;
}
const execute = promisify(execFile);
export async function requireLocalMedia(path: string) {
  const file = await open(path, "r");
  try {
    const header = Buffer.alloc(128);
    await file.read(header, 0, header.length, 0);
    if (header.toString("utf8").startsWith("version https://git-lfs.github.com/spec/v1"))
      throw new Error(
        `Git LFS素材が未取得です: ${path}。SHARING.mdに従い git lfs pull の --include と --exclude= を指定してください`,
      );
  } finally {
    await file.close();
  }
}
export async function imageDimensions(path: string) {
  await requireLocalMedia(path);
  const { stdout } = await execute("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "json",
    path,
  ]);
  const result = z
    .object({
      streams: z
        .array(z.object({ width: z.number().positive(), height: z.number().positive() }))
        .min(1),
    })
    .parse(JSON.parse(stdout));
  const dimensions = result.streams[0];
  if (!dimensions) throw new Error(`画像の寸法がありません: ${path}`);
  return dimensions;
}
export async function mediaInfo(path: string) {
  await requireLocalMedia(path);
  const { stdout } = await execute("ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    path,
  ]);
  return z
    .object({
      format: z.object({ duration: z.coerce.number().positive() }),
      streams: z.array(
        z.object({
          codec_type: z.string(),
          codec_name: z.string().optional(),
          width: z.number().optional(),
          height: z.number().optional(),
          duration: z.coerce.number().positive().optional(),
        }),
      ),
    })
    .parse(JSON.parse(stdout));
}
export async function readAudioDuration(path: string) {
  try {
    const info = await mediaInfo(path);
    if (!info.streams.some((stream) => stream.codec_type === "audio")) throw new Error();
    return info.format.duration;
  } catch {
    throw new Error(
      `音声を検証できません: ${path}。SHARING.mdに従いGit LFSの取得範囲と --exclude= を指定し、FFprobeを確認してください。取得後も破損している場合だけ当該音声を退避してtts:liveを再実行してください`,
    );
  }
}
export function timeline(
  project: Project,
  audioDurations: Record<string, number>,
  mediaDurations: Record<string, number>,
) {
  let start = 0;
  const cues: (Cue & {
    sceneId: string;
    start: number;
    duration: number;
    audioDuration: number;
  })[] = [];
  const scenes = project.scenes.map((item) => {
    const spoken = item.cues.map((part) => {
      // 実会話の字幕にはTTSを重ねず、録画自身の音声を再生する。
      const voiced = needsVoice(item, part);
      const audioDuration = voiced ? audioDurations[part.id] : 0;
      if (
        audioDuration === undefined ||
        !Number.isFinite(audioDuration) ||
        (voiced && audioDuration <= 0)
      )
        throw new Error(`音声尺が不正です: ${part.id}`);
      return { ...part, audioDuration };
    });
    const duration =
      item.media?.duration ??
      item.duration ??
      Math.ceil(
        Math.max(...spoken.map((part) => part.at + part.audioDuration + 0.8)) * project.fps - 1e-7,
      ) / project.fps;
    if (item.media) {
      const available = mediaDurations[item.media.file];
      if (
        !available ||
        !Number.isFinite(available) ||
        item.media.offset + duration > available + 0.000001
      )
        throw new Error(`実録映像の範囲を超えています: ${item.id}`);
    }
    if (item.camera.some((position) => position.at >= duration))
      throw new Error(`カメラが場面の尺を超えています: ${item.id}`);
    if (
      item.pointFocus?.some(
        (focus, index, all) =>
          focus.at >= duration ||
          focus.point >= item.points.length ||
          (index > 0 && focus.at <= (all[index - 1]?.at ?? 0)),
      )
    )
      throw new Error(`説明の強調は実在する項目と場面内の昇順時刻が必要です: ${item.id}`);
    if (item.kind === "result" && item.images) {
      const focus = item.pointFocus ?? item.images.map((_, point) => ({ at: point * 0.9, point }));
      if (focus.some((entry) => entry.at + 0.2 > duration - 2.35))
        throw new Error(`まとめの静止画を表示してから結論へ切り替える尺が必要です: ${item.id}`);
    }
    spoken.forEach((part, index) => {
      const cueStart = start + part.at;
      const cueEnd = start + (item.cues[index + 1]?.at ?? duration);
      // 相対時刻同士の差を再加算すると、切替で字幕が微小に重なる場合がある。
      // 次の字幕・場面と同じ絶対終端から表示尺を求める。
      const slot = cueEnd - cueStart;
      const audioDuration = part.audioDuration;
      if (audioDuration + 0.2 > slot)
        throw new Error(`字幕・音声が場面または次の字幕区間に収まりません: ${part.id}`);
      cues.push({
        ...part,
        sceneId: item.id,
        start: cueStart,
        duration: slot,
        audioDuration,
      });
    });
    for (const focus of [
      ...(item.technical?.focus ?? []),
      ...(item.diagram?.focus ?? []),
      ...((item.media?.zoom?.mode === "detail" ? [item.media.zoom] : undefined) ?? []),
    ]) {
      const index = spoken.findIndex((part) => part.id === focus.cue);
      const part = spoken[index];
      const end = spoken[index + 1]?.at ?? duration;
      if (
        !part ||
        part.at + focus.offset >= end ||
        (part.audioDuration > 0 && focus.offset >= part.audioDuration)
      )
        throw new Error(`図の強調が対応する発話を超えています: ${focus.cue}`);
    }
    const timed = { ...item, start, duration };
    start += duration;
    return timed;
  });
  return { scenes, cues, duration: start };
}
export function escapeText(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
export function escapeHtml(text: string) {
  return escapeText(text).replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
