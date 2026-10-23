import { z } from "zod";
export const createStoreSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    slug: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9-]+$/),
    tableCount: z.number().int().min(1).max(100),
  })
  .strict();
export type CreateStore = z.infer<typeof createStoreSchema>;

import { tableEventSchema, tableStateSchema } from "../tables/model";
export type StoreSummary = z.infer<typeof storeSummarySchema>;

export type AdminState = z.infer<typeof adminStateSchema>;

export const storeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  organizationId: z.string().optional(),
});

export const adminStateSchema = z.object({
  store: storeSummarySchema,
  tables: z.array(tableStateSchema),
  vacantTables: z.array(z.object({ id: z.string(), name: z.string() })),
  events: z.array(tableEventSchema),
  cursor: z.number().int(),
});
