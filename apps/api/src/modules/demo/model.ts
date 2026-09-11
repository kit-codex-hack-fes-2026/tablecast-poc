import { z } from "zod";
import { configurationSchema } from "../configuration/model";

export const demoUpdateSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    sourceDraftId: z.string().min(1).nullable().optional(),
    reload: z.boolean().optional(),
    planId: z.string().min(1).nullable().optional(),
    guestCount: z.number().int().min(1).max(30).optional(),
    proactive: z.boolean().optional(),
  })
  .strict();
export type DemoUpdate = z.infer<typeof demoUpdateSchema>;
export const demoSchema = z.object({
  id: z.string(),
  sourceDraftId: z.string().nullable(),
  sourceVersion: z.number().int(),
  version: z.number().int(),
  configuration: configurationSchema,
  planId: z.string().nullable(),
  guestCount: z.number().int(),
});
export type Demo = z.infer<typeof demoSchema>;
