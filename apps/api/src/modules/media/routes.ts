import type { Context } from "hono";
import { trace } from "@opentelemetry/api";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { ensure } from "../../platform/errors";
import { apiFactory } from "../../platform/http";
import { byteStream } from "../../platform/streams";
import { measured } from "../../platform/telemetry";
import { imageDeliveryVersion } from "./model";
import { getImageMetadata } from "./queries";

// avatarは既存の公開プロフィール契約を維持する。商品画像の公開経路は設けない。
export const mediaRoutes = apiFactory.createApp().get("/api/avatars/:key", async (c) => {
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
});

/** 呼出し元の認可、または公開済みの会員意匠への参照確認が完了した後だけ配信する。 */
export async function imageResponse(
  c: Pick<Context<ApiEnv>, "env" | "executionCtx" | "req" | "var">,
  storeId: string,
  key: string,
  format: "image/png" | "image/webp" = "image/webp",
) {
  return measured("tablecast.image.deliver", async () => {
    ensure(/^tablecast\/[a-zA-Z0-9/_-]+\.(png|jpg|webp|svg)$/.test(key), "MEDIA_NOT_FOUND", 404);
    const width = Number(c.req.query("width") ?? 640);
    ensure(Number.isInteger(width) && width >= 1 && width <= 1600, "INVALID_INPUT", 400);
    const quality = 85;
    const formatName = format === "image/png" ? "png" : "webp";
    trace.getActiveSpan()?.setAttributes({
      "tablecast.image.width": width,
      "tablecast.image.format": formatName,
      "tablecast.image.quality": quality,
      "tablecast.image.version": imageDeliveryVersion,
    });
    await measured("tablecast.image.metadata", () =>
      getImageMetadata(c.var.services, storeId, key),
    );
    const object = await measured("tablecast.image.r2_head", () => c.env.TABLECAST_MEDIA.head(key));
    ensure(object, "MEDIA_NOT_FOUND", 404);
    const immutable =
      /^tablecast\/(images\/[a-f0-9]{64}\.(png|webp)|uploads\/[a-f0-9]{64}\.webp)$/.test(key);
    const cacheControl = immutable ? "private, max-age=31536000, immutable" : "private, no-cache";
    const etag = `W/"${object.etag}-${width}-${formatName}-q${quality}-v${imageDeliveryVersion}"`;
    if (
      c.req
        .header("If-None-Match")
        ?.split(/\s*,\s*/)
        .some((value) => value === etag || value === "*")
    ) {
      trace.getActiveSpan()?.setAttribute("tablecast.image.cache", "NOT_MODIFIED");
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": cacheControl },
      });
    }
    const cache = await caches.open("tablecast-images-v1");
    const cacheUrl = new URL(c.req.url);
    cacheUrl.pathname = `/_tablecast/images/${encodeURIComponent(storeId)}/${key}`;
    cacheUrl.search = new URLSearchParams({
      width: String(width),
      etag: object.etag,
      format: formatName,
      quality: String(quality),
      version: String(imageDeliveryVersion),
    }).toString();
    const cacheKey = new Request(cacheUrl.toString());
    const cached = await measured("tablecast.image.cache", () => cache.match(cacheKey));
    if (cached) {
      trace.getActiveSpan()?.setAttribute("tablecast.image.cache", "HIT");
      const response = new Response(cached.body, cached);
      response.headers.set("Cache-Control", cacheControl);
      response.headers.set("X-Tablecast-Image-Cache", "HIT");
      return response;
    }
    trace.getActiveSpan()?.setAttribute("tablecast.image.cache", "MISS");
    const image = await measured("tablecast.image.r2_get", () =>
      c.env.TABLECAST_MEDIA.get(key, { onlyIf: { etagMatches: object.etag } }),
    );
    ensure(image && "body" in image, "MEDIA_NOT_FOUND", 404);
    const output = await measured("tablecast.image.transform", () =>
      c.env.TABLECAST_IMAGES.input(byteStream(image.body))
        .transform({ width, fit: "scale-down" })
        .output({ format, quality }),
    );
    const response = output.response();
    response.headers.set("ETag", etag);
    response.headers.set("X-Content-Type-Options", "nosniff");
    const stored = response.clone();
    // 利用者へはprivateで返し、認可後に参照するWorker内部だけで共有する。
    stored.headers.set("Cache-Control", "public, max-age=31536000");
    c.executionCtx.waitUntil(cache.put(cacheKey, stored));
    response.headers.set("Cache-Control", cacheControl);
    response.headers.set("X-Tablecast-Image-Cache", "MISS");
    return response;
  });
}

export const protectedMediaRoutes = apiFactory
  .createApp()
  .get("/images/:key{.+}", (c) => imageResponse(c, c.var.actor.storeId, c.req.param("key")));
