import { z } from "zod";
import { collectionSearchFields, collectionSearchSchema } from "../shell/collection-model";

export const billingSearchSchema = z.object({
  ...collectionSearchFields("usage"),
  ...collectionSearchFields("invoices"),
  ...collectionSearchFields("daily"),
  usageQ: collectionSearchSchema.shape.q,
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
  invoiceCursors: z.preprocess(
    (value) => (typeof value === "string" ? [value] : value),
    z.array(z.string().min(1)).optional().catch(undefined),
  ),
});
