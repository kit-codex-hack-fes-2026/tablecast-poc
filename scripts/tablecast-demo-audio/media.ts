import { execFileSync } from "node:child_process";
import { z } from "zod";

export const downloadSchema = z.object({
  requestSha256: z.string(),
  audioContent: z.string().min(1),
  generatedAt: z.string(),
  processedCharacters: z.number().nullable(),
});

export const receiptSchema = z.object({
  requestSha256: z.string(),
  audioSha256: z.string(),
  generatedAt: z.string(),
  durationSeconds: z.number().positive(),
  sampleRateHertz: z.number(),
  channels: z.number(),
  processedCharacters: z.number().nullable(),
  voiceId: z.string().optional(),
  language: z.string().optional(),
  instruction: z.string().optional(),
  overlap: z
    .object({ sourceFiles: z.array(z.string()).length(2), offsetMs: z.number() })
    .optional(),
});

export function probe(path: string) {
  const result = z
    .object({
      format: z.object({ duration: z.coerce.number().positive() }),
      streams: z.tuple([
        z.object({ sample_rate: z.coerce.number().pipe(z.literal(48000)), channels: z.literal(1) }),
      ]),
    })
    .parse(
      JSON.parse(
        execFileSync(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=sample_rate,channels",
            "-of",
            "json",
            path,
          ],
          { encoding: "utf8" },
        ),
      ),
    );
  return {
    durationSeconds: result.format.duration,
    sampleRateHertz: result.streams[0].sample_rate,
    channels: result.streams[0].channels,
  };
}
