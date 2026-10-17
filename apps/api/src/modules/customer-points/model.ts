import { z } from "zod";
export const pointRulesSchema = z.object({
  enabled: z.boolean(),
  kind: z.enum(["visit", "spend"]),
  points: z.number().int().min(0).max(100000),
  unitYen: z.number().int().min(1).max(1000000),
});
export const pointPolicySchema = pointRulesSchema.extend({
  expectedVersion: z.number().int().nonnegative(),
});
export const confirmPointsSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    participantIds: z.array(z.string().uuid()).max(50),
    idempotencyKey: z.string().uuid(),
  })
  .refine((v) => new Set(v.participantIds).size === v.participantIds.length);
export const pointCorrectionSchema = z.object({
  membershipId: z.string().uuid(),
  delta: z.number().int().min(-1000000).max(1000000),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().uuid(),
});
export const pointPageSchema = z.object({
  beforeId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const noPointRules = { enabled: false, kind: "visit", points: 0, unitYen: 100 } as const;
