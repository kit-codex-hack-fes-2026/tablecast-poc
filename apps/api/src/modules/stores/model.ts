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

import type { TableEvent, TableState } from "../tables/model";
import { tableEventSchema, tableStateSchema } from "../tables/model";
export type StoreSummary = { id: string; name: string; role: string; organizationId?: string };

export type AdminState = {
  store: StoreSummary;
  tables: TableState[];
  vacantTables: { id: string; name: string }[];
  events: TableEvent[];
  cursor: number;
};

export const storeSummarySchema: z.ZodType<StoreSummary> = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  organizationId: z.string().optional(),
});

export const adminStateSchema: z.ZodType<AdminState> = z.object({
  store: storeSummarySchema,
  tables: z.array(tableStateSchema),
  vacantTables: z.array(z.object({ id: z.string(), name: z.string() })),
  events: z.array(tableEventSchema),
  cursor: z.number().int(),
});
