import { z } from "zod";
import { shotSchema } from "../tablecast-shot.ts";
import { sourcePathSchema } from "../tablecast-source.ts";
import { technicalSchema } from "../tablecast-technical-schema.ts";

export const id = z.string().regex(/^[a-z][a-z0-9-]*$/);

export const speakerLabel = z
  .string()
  .min(1)
  .regex(/^[^\r\n]+$/, "話者名は1行で指定してください");

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

export const scene = z.object({
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
        path: sourcePathSchema,
        detail: z.string().min(1).max(50),
        depth: z.number().int().min(0).max(2),
      }),
    )
    .min(1)
    .max(14)
    .optional(),
  sourceHeading: z.string().min(1).optional(),
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

export type Cue = z.infer<typeof cue>;

export type SpeechCue = Partial<Cue> & Pick<Cue, "id" | "speech" | "text">;
