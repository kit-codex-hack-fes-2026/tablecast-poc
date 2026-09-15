import { z } from "zod";
export const customerVisitCodeSchema = z.object({ code: z.string().regex(/^[a-f0-9]{64}$/) });
export const customerVisitPageSchema = z
  .object({
    beforeJoinedAt: z.coerce.number().int().nonnegative().optional(),
    beforeId: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine((page) => (page.beforeJoinedAt === undefined) === (page.beforeId === undefined), {
    message: "来店履歴のカーソルは日時とIDを組で指定する",
  });
export const customerOrderPageSchema = z
  .object({
    beforeCreatedAt: z.coerce.number().int().nonnegative().optional(),
    beforeId: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine((page) => (page.beforeCreatedAt === undefined) === (page.beforeId === undefined), {
    message: "注文履歴のカーソルは日時とIDを組で指定する",
  });
