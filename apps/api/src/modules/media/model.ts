import { z } from "zod";

export const maxImageBytes = 5 * 1024 * 1024;
export const imageSourceSchema = z
  .object({
    generated: z.boolean(),
    description: z.string().trim().min(1).max(500),
  })
  .strict();
export const imageMetadataSchema = z
  .object({
    imageKind: z.enum(["photograph", "illustration"]),
    imageSource: imageSourceSchema,
  })
  .strict();
export const uploadImageSchema = imageMetadataSchema
  .extend({
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    data: z
      .string()
      .min(4)
      .max(4 * Math.ceil(maxImageBytes / 3)),
  })
  .strict();
export const uploadedImageSchema = imageMetadataSchema
  .extend({
    imageKey: z.string(),
    url: z.string(),
  })
  .strict();
