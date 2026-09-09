import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { ensure } from "../../platform/errors";
export const mediaRoutes = new Hono<ApiEnv>()
  .get("/api/avatars/:key", async (c) => {
    const key = z.uuid().parse(c.req.param("key"));
    const image = await c.env.TABLECAST_MEDIA.get(`tablecast/avatars/${key}`);
    ensure(image, "IMAGE_NOT_FOUND", 404);
    return new Response(image.body, {
      headers: {
        "Content-Type": image.httpMetadata?.contentType ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  })
  .get("/media/*", async (c) => {
    const key = c.req.path.slice("/media/".length);
    ensure(/^tablecast\/[a-zA-Z0-9/_-]+\.(png|jpg|webp|svg)$/.test(key), "MEDIA_NOT_FOUND", 404);
    const asset = await c.env.TABLECAST_MEDIA.get(key);
    ensure(asset, "MEDIA_NOT_FOUND", 404);
    const output = await c.env.TABLECAST_IMAGES.input(asset.body)
      .transform({ width: 640, fit: "scale-down" })
      .output({ format: "image/webp" });
    const response = output.response();
    response.headers.set("Cache-Control", "public,max-age=86400");
    response.headers.set("ETag", `W/"${asset.etag}-640-webp"`);
    return response;
  });
