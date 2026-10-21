import { z } from "zod";
import { id, scene, speakerLabel } from "./scene-schema.ts";
import { validateProject } from "./validation.ts";

export const projectDefinition = z.object({
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
          narrator: speakerLabel,
          customer: speakerLabel,
          cast: speakerLabel,
          instruction: speakerLabel,
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
    .refine(
      (sound) => sound.musicVolume > 0 || sound.effectVolume > 0,
      "無音にする場合はsoundtrackを省略してください",
    )
    .optional(),
  scenes: z.array(scene).min(1),
  films: z
    .record(
      id,
      z.object({ scenes: z.array(id).min(1), duration: z.number().positive().optional() }),
    )
    .optional(),
});

export const projectSchema = projectDefinition.superRefine(validateProject);

export type Project = z.infer<typeof projectSchema>;
