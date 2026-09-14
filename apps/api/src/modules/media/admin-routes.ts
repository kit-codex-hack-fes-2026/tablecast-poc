import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { validateForm } from "../../platform/validation";
import { imageMetadataSchema } from "./model";
import { saveMenuImage } from "./service";

export const mediaAdminRoutes = new Hono<ApiEnv>().post(
  "/images",
  validateForm(
    z
      .object({
        image: z.instanceof(File),
        metadata: z
          .string()
          .max(3000)
          .transform((value, ctx) => {
            try {
              const parsed: unknown = JSON.parse(value);
              return parsed;
            } catch {
              ctx.addIssue({ code: "custom", message: "画像の出所はJSONで指定してください。" });
              return z.NEVER;
            }
          })
          .pipe(imageMetadataSchema),
      })
      .strict(),
  ),
  async (c) => {
    const { image, metadata } = c.req.valid("form");
    return c.json(await saveMenuImage(c.get("services"), c.get("actor"), image, metadata), 200);
  },
);
