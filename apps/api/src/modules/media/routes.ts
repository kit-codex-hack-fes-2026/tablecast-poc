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
    const requestedWidth = Number(c.req.query("width") ?? 640);
    ensure(
      Number.isInteger(requestedWidth) && requestedWidth >= 1 && requestedWidth <= 1600,
      "INVALID_INPUT",
      400,
    );
    const width = requestedWidth;
    const cacheControl = /^tablecast\/images\/[a-f0-9]{64}\.png$/.test(key)
      ? "public, max-age=31536000, immutable"
      : "public, no-cache";
    const asset = await c.env.TABLECAST_MEDIA.get(key);
    ensure(asset, "MEDIA_NOT_FOUND", 404);
    const etag = `W/"${asset.etag}-${width}-webp"`;
    if (
      c.req
        .header("If-None-Match")
        ?.split(/\s*,\s*/)
        .some((value) => value === etag || value === "*")
    ) {
      await asset.body.cancel();
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": cacheControl },
      });
    }
    const output = await c.env.TABLECAST_IMAGES.input(asset.body)
      .transform({ width, fit: "scale-down" })
      .output({ format: "image/webp" });
    const response = output.response();
    response.headers.set("Cache-Control", cacheControl);
    response.headers.set("ETag", etag);
    return response;
  });
