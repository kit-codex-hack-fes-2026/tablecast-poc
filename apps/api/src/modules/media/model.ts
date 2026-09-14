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
    file: z
      .object({
        download_url: z.string().url().max(8192),
        file_id: z.string().min(1).max(300),
        mime_type: z.string().max(100).optional(),
        file_name: z.string().max(300).optional(),
      })
      .strict()
      .optional(),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]).optional(),
    data: z
      .string()
      .min(4)
      .max(4 * Math.ceil(maxImageBytes / 3))
      .optional(),
  })
  .strict();
export const uploadedImageSchema = imageMetadataSchema
  .extend({
    imageKey: z.string(),
    url: z.string(),
  })
  .strict();
