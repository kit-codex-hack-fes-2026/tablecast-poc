import { z } from "zod";
import { projectSchema } from "../tablecast-project.ts";
export type VideoRun = (
  name: string,
  command: string,
  args: string[],
) => Promise<{ stderr: string; stdout: string }>;
export const timingSchema = z.object({
  duration: z.number().positive(),
  scenes: projectSchema.shape.scenes.element
    .extend({ start: z.number(), duration: z.number().positive() })
    .array(),
  cues: z.object({ audioDuration: z.number() }).array(),
});
export type VideoTiming = z.infer<typeof timingSchema>;
