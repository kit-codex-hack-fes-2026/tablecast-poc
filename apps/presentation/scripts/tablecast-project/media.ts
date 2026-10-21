import { execFile } from "node:child_process";
import { open } from "node:fs/promises";
import { promisify } from "node:util";
import { z } from "zod";

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
